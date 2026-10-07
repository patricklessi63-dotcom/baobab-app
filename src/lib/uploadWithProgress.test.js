import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit médias mobiles (6 oct. 2026) : un XHR d'upload peut rester ouvert
// indéfiniment quand le réseau mobile décroche (aucun événement error/abort/
// timeout). Le message restait « en cours d'envoi » à l'infini, sans bouton
// Réessayer. Garde-fou : sans aucune activité pendant stallMs, l'envoi est
// interrompu avec un message clair ; un envoi qui progresse (même lentement)
// n'est jamais interrompu.

vi.mock("../supabaseClient", () => ({
  supabase: { auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })) } },
}));

class FakeXhr {
  static last = null;
  constructor() {
    FakeXhr.last = this;
    this.upload = {};
    this.headers = {};
    this.aborted = false;
    this.sent = false;
  }
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader(k, v) { this.headers[k] = v; }
  send(body) { this.sent = true; this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }
  // helpers de test
  progress(loaded, total) { this.upload.onprogress?.({ lengthComputable: true, loaded, total }); }
  finish(status) { this.status = status; this.onload?.(); }
}

let uploadWithProgress;

beforeEach(async () => {
  vi.useFakeTimers();
  globalThis.XMLHttpRequest = FakeXhr;
  FakeXhr.last = null;
  ({ uploadWithProgress } = await import("./uploadWithProgress.js"));
});

afterEach(() => {
  vi.useRealTimers();
  delete globalThis.XMLHttpRequest;
});

async function start(opts = {}) {
  const promise = uploadWithProgress({ bucket: "chat-media", path: "k/a.jpg", file: { type: "image/jpeg" }, ...opts });
  const assertion = promise.catch((e) => e); // évite un rejet non géré pendant les timers
  await vi.advanceTimersByTimeAsync(0);
  return { promise, settled: assertion, xhr: FakeXhr.last };
}

describe("uploadWithProgress — connexion bloquée", () => {
  it("sans aucune activité pendant stallMs : abandonne avec un message clair (au lieu d'attendre indéfiniment)", async () => {
    const { settled, xhr } = await start({ stallMs: 1000 });
    expect(xhr.sent).toBe(true);
    await vi.advanceTimersByTimeAsync(1001);
    expect(xhr.aborted).toBe(true);
    const err = await settled;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/connexion trop lente ou coupée/);
  });

  it("un envoi lent mais qui progresse n'est jamais interrompu", async () => {
    const onProgress = vi.fn();
    const { promise, xhr } = await start({ stallMs: 1000, onProgress });
    for (let i = 1; i <= 5; i++) {
      await vi.advanceTimersByTimeAsync(900); // juste sous le seuil à chaque fois
      xhr.progress(i * 10, 100);
    }
    expect(xhr.aborted).toBe(false);
    expect(onProgress).toHaveBeenLastCalledWith(50);
    xhr.finish(200);
    await expect(promise).resolves.toBeUndefined();
  });

  it("le garde-fou est désarmé une fois la réponse reçue (aucun abort tardif)", async () => {
    const { promise, xhr } = await start({ stallMs: 1000 });
    xhr.finish(200);
    await promise;
    await vi.advanceTimersByTimeAsync(5000);
    expect(xhr.aborted).toBe(false);
  });

  it("corps envoyé mais aucune réponse du serveur : interrompu aussi", async () => {
    const { settled, xhr } = await start({ stallMs: 1000 });
    xhr.progress(100, 100);
    xhr.upload.onload?.();
    await vi.advanceTimersByTimeAsync(1001);
    expect(xhr.aborted).toBe(true);
    expect((await settled).message).toMatch(/trop lente/);
  });

  it("une annulation volontaire garde son message « Upload annulé. »", async () => {
    const ctrl = new AbortController();
    const { settled } = await start({ stallMs: 1000, signal: ctrl.signal });
    ctrl.abort();
    expect((await settled).message).toBe("Upload annulé.");
  });
});

describe("uploadWithProgress — réponses d'erreur du serveur", () => {
  it("413 : message clair sur la taille, status exposé", async () => {
    const { settled, xhr } = await start({ stallMs: 0 });
    xhr.finish(413);
    const err = await settled;
    expect(err.message).toBe("Fichier trop volumineux pour être envoyé.");
    expect(err.status).toBe(413);
  });

  it("autre statut d'erreur : code conservé dans le message", async () => {
    const { settled, xhr } = await start({ stallMs: 0 });
    xhr.finish(400);
    expect((await settled).message).toBe("Échec de l'upload (400).");
  });

  it("envoie le bon Content-Type (quicktime réétiqueté mp4) et n'écrase jamais un fichier existant", async () => {
    const { xhr } = await start({ stallMs: 0, file: { type: "video/quicktime" } });
    expect(xhr.headers["Content-Type"]).toBe("video/mp4");
    expect(xhr.headers["x-upsert"]).toBe("false");
  });
});
