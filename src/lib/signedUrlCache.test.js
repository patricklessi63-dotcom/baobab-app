import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock du client Supabase : on capture les appels à createSignedUrl(s) pour
// vérifier combien d'allers-retours réseau partent réellement.
const { createSignedUrlMock, createSignedUrlsMock } = vi.hoisted(() => ({
  createSignedUrlMock: vi.fn(),
  createSignedUrlsMock: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: createSignedUrlMock,
        createSignedUrls: createSignedUrlsMock,
      })),
    },
  },
}));

import { getSignedUrl } from "./signedUrlCache.js";

beforeEach(() => {
  vi.useFakeTimers();
  createSignedUrlMock.mockReset();
  createSignedUrlsMock.mockReset();
});

afterEach(() => vi.useRealTimers());

// Laisse passer la fenêtre de regroupement (10 ms) puis les microtâches.
async function flushWindow() {
  await vi.advanceTimersByTimeAsync(20);
}

describe("getSignedUrl — déduplication des requêtes en vol", () => {
  it("deux appels concurrents pour le même path ne déclenchent qu'un seul appel réseau", async () => {
    let resolveNetwork;
    createSignedUrlMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        })
    );

    const path = `conv1/${Date.now()}-a.jpg`;
    const p1 = getSignedUrl(path);
    const p2 = getSignedUrl(path);
    await flushWindow();

    // Les deux appelants doivent partager la même requête : un seul appel à
    // createSignedUrl doit être parti vers Supabase, même si le cache local
    // était vide pour les deux (ex. scroll rapide qui démonte puis remonte la
    // bulle média avant la fin du premier aller-retour).
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);

    resolveNetwork({ data: { signedUrl: "https://example.test/signed-a" }, error: null });

    const [url1, url2] = await Promise.all([p1, p2]);
    expect(url1).toBe("https://example.test/signed-a");
    expect(url2).toBe("https://example.test/signed-a");
  });

  it("un appel après résolution est servi depuis le cache, sans nouvel appel réseau", async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: { signedUrl: "https://example.test/signed-b" },
      error: null,
    });

    const path = `conv1/${Date.now()}-b.jpg`;
    const p = getSignedUrl(path);
    await flushWindow();
    const url = await p;
    expect(url).toBe("https://example.test/signed-b");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);

    // Deuxième appel immédiat : servi depuis le cache, pas de nouvel appel réseau.
    const cachedUrl = await getSignedUrl(path);
    expect(cachedUrl).toBe("https://example.test/signed-b");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });
});

describe("getSignedUrl — regroupement des chemins demandés dans la même fenêtre (N+1)", () => {
  it("20 médias demandés dans le même tick partent en UN SEUL createSignedUrls, pas 20 requêtes", async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `conv-batch/${i}.jpg`);
    createSignedUrlsMock.mockResolvedValue({
      data: paths.map((p) => ({ path: p, signedUrl: `https://example.test/${p}`, error: null })),
      error: null,
    });

    const promises = paths.map((p) => getSignedUrl(p));
    await flushWindow();
    const urls = await Promise.all(promises);

    expect(createSignedUrlsMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlsMock.mock.calls[0][0]).toEqual(paths);
    expect(createSignedUrlMock).not.toHaveBeenCalled();
    urls.forEach((u, i) => expect(u).toBe(`https://example.test/${paths[i]}`));
  });

  it("un chemin sans URL dans la réponse groupée (fichier absent) résout à null sans bloquer les autres", async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [
        { path: "conv-partial/ok.jpg", signedUrl: "https://example.test/ok", error: null },
        { path: "conv-partial/missing.jpg", signedUrl: null, error: "Object not found" },
      ],
      error: null,
    });
    const [a, b] = await Promise.all([
      getSignedUrl("conv-partial/ok.jpg"),
      getSignedUrl("conv-partial/missing.jpg"),
      flushWindow(),
    ]);
    expect(a).toBe("https://example.test/ok");
    expect(b).toBeNull();
  });

  it("un rejet réseau résout tous les chemins à null (jamais de promesse bloquée) et un nouvel essai repart ensuite", async () => {
    createSignedUrlsMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const [a, b] = await Promise.all([
      getSignedUrl("conv-err/a.jpg"),
      getSignedUrl("conv-err/b.jpg"),
      flushWindow(),
    ]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    errSpy.mockRestore();

    createSignedUrlMock.mockResolvedValueOnce({ data: { signedUrl: "https://example.test/a2" }, error: null });
    const retry = getSignedUrl("conv-err/a.jpg");
    await flushWindow();
    expect(await retry).toBe("https://example.test/a2");
  });
});
