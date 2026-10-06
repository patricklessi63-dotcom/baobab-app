import { describe, it, expect, vi, afterEach } from "vitest";
import { createTimeoutFetch, REST_TIMEOUT_MS } from "./timeoutFetch";

afterEach(() => vi.useRealTimers());

// Fetch qui ne répond jamais, mais respecte le signal d'annulation.
function hangingFetch() {
  return vi.fn((input, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal.reason));
  }));
}

describe("createTimeoutFetch", () => {
  it("requête REST sans réponse : rejetée après le délai (au lieu de bloquer indéfiniment)", async () => {
    vi.useFakeTimers();
    const base = hangingFetch();
    const f = createTimeoutFetch(base, 1000);
    const p = f("https://x.supabase.co/rest/v1/messages?select=*", {});
    const assertion = expect(p).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it("délai par défaut de 45 s", () => {
    expect(REST_TIMEOUT_MS).toBe(45000);
  });

  it("réponse rapide : transmise telle quelle, minuteur nettoyé", async () => {
    vi.useFakeTimers();
    const response = { ok: true };
    const f = createTimeoutFetch(vi.fn(() => Promise.resolve(response)), 1000);
    await expect(f("https://x.supabase.co/rest/v1/posts", {})).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("hors /rest/v1/ (storage, functions, auth) : aucun délai, appel direct inchangé", async () => {
    const base = vi.fn(() => Promise.resolve({ ok: true }));
    const f = createTimeoutFetch(base, 1000);
    const init = { method: "POST" };
    await f("https://x.supabase.co/storage/v1/object/chat-media/a.jpg", init);
    await f("https://x.supabase.co/functions/v1/ai-assist", init);
    await f("https://x.supabase.co/auth/v1/token", init);
    for (const call of base.mock.calls) expect(call[1]).toBe(init);
  });

  it("respecte l'annulation fournie par l'appelant", async () => {
    const base = hangingFetch();
    const f = createTimeoutFetch(base, 60000);
    const external = new AbortController();
    const p = f("https://x.supabase.co/rest/v1/posts", { signal: external.signal });
    external.abort(new Error("annulé"));
    await expect(p).rejects.toThrow("annulé");
  });

  it("l'erreur de délai est reconnue comme coupure réseau sans code (renvoi sûr)", async () => {
    const { isNetworkFailure, isAmbiguousWriteError } = await import("./networkError");
    const e = Object.assign(new Error("La requête a expiré (réseau trop lent)."), { name: "TimeoutError" });
    const asPostgrest = { message: `${e.name}: ${e.message}`, code: "" };
    expect(isAmbiguousWriteError(asPostgrest)).toBe(true);
    expect(isNetworkFailure(asPostgrest)).toBe(true);
  });
});
