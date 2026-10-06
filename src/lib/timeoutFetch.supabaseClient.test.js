import { describe, it, expect, vi, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createTimeoutFetch } from "./timeoutFetch";
import { isAmbiguousWriteError, isNetworkFailure } from "./networkError";

afterEach(() => vi.useRealTimers());

// Audit de régression (6 oct. 2026) : postgrest-js (2.112) REJOUE seul les
// lectures (GET) dont fetch échoue, jusqu'à 3 fois, sauf si l'erreur est une
// annulation reconnue (name "AbortError" ou code "ABORT_ERR"). Un délai dépassé
// signalé par une erreur « TimeoutError » sans code était donc rejoué 3 fois :
// 4 x 45 s + 7 s de pauses = ~3 minutes de spinner au lieu de 45 s.
function hangingFetch() {
  return vi.fn((input, init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal.reason));
  }));
}

describe("timeoutFetch avec le vrai client supabase-js", () => {
  it("lecture (GET) sur réseau muet : UNE seule tentative, erreur rendue après le délai (pas de rejeu interne)", async () => {
    vi.useFakeTimers();
    const base = hangingFetch();
    const client = createClient("https://x.supabase.co", "anon-key", {
      global: { fetch: createTimeoutFetch(base, 1000) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const pending = client.from("posts").select("*").limit(5);
    let result;
    pending.then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(1001);
    // Résolue au premier délai : pas de pause de 1 s + nouvelle tentative.
    expect(result).toBeDefined();
    expect(base).toHaveBeenCalledTimes(1);
    expect(result.error).toBeTruthy();
    expect(result.error.code).toBeFalsy(); // « issue incertaine » pour les écritures
  });

  it("écriture (POST) sur réseau muet : une tentative, erreur sans code", async () => {
    vi.useFakeTimers();
    const base = hangingFetch();
    const client = createClient("https://x.supabase.co", "anon-key", {
      global: { fetch: createTimeoutFetch(base, 1000) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let result;
    client.from("messages").insert({ text: "a" }).select().single().then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(1001);
    expect(result).toBeDefined();
    expect(base).toHaveBeenCalledTimes(1);
    expect(result.error.code).toBeFalsy();
  });

  // Seules les lectures (GET/HEAD) sont rejouées par postgrest-js : une écriture
  // dont le délai est dépassé ne doit JAMAIS être renvoyée seule (doublon). Même
  // verdict pour PATCH (update), DELETE et RPC (POST).
  it.each([
    ["PATCH (update)", (c) => c.from("messages").update({ read_at: "x" }).eq("id", 1)],
    ["DELETE", (c) => c.from("messages").delete().eq("id", 1)],
    ["RPC (POST)", (c) => c.rpc("une_fonction", { a: 1 })],
    ["upsert (POST)", (c) => c.from("messages").upsert({ id: 1, text: "a" })],
  ])("%s sur réseau muet : une seule tentative, erreur sans code (issue incertaine), reconnue comme panne réseau", async (_label, build) => {
    vi.useFakeTimers();
    const base = hangingFetch();
    const client = createClient("https://x.supabase.co", "anon-key", {
      global: { fetch: createTimeoutFetch(base, 1000) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    let result;
    build(client).then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(1001);
    await vi.advanceTimersByTimeAsync(10_000); // aucune nouvelle tentative même après les pauses de postgrest
    expect(result).toBeDefined();
    expect(base).toHaveBeenCalledTimes(1);
    expect(result.error.code).toBeFalsy();
    expect(isAmbiguousWriteError(result.error)).toBe(true);
    expect(isNetworkFailure(result.error)).toBe(true);
  });

  it("annulation par l'appelant (signal amont) : une seule tentative, pas de rejeu", async () => {
    vi.useFakeTimers();
    const base = hangingFetch();
    const client = createClient("https://x.supabase.co", "anon-key", {
      global: { fetch: createTimeoutFetch(base, 45_000) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const ac = new AbortController();
    let result;
    client.from("posts").select("*").abortSignal(ac.signal).then((r) => { result = r; });
    await vi.advanceTimersByTimeAsync(10);
    ac.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(result).toBeDefined();
    expect(base).toHaveBeenCalledTimes(1);
  });
});
