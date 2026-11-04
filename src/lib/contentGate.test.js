import { describe, it, expect, vi, beforeEach } from "vitest";
import { screenText, isModerationRefusal, resetModerationTermsLoad, SERVER_REFUSAL_MARKER } from "./contentGate.js";
import { MODERATION_REFUSAL, resetModerationTerms, checkText } from "./contentModeration.js";
import { friendlyDbError } from "./friendlyDbError.js";

function fakeSupabase({ terms = null, rpc = vi.fn().mockResolvedValue({ data: null }) } = {}) {
  const table = (rows) => {
    const q = { select: () => q, eq: () => q, limit: () => Promise.resolve(rows ? { data: rows, error: null } : { data: null, error: { message: "relation absente" } }) };
    return q;
  };
  return { rpc, from: (name) => (name === "moderation_terms" ? table(terms) : table(terms ? [] : null)) };
}

describe("contentGate", () => {
  beforeEach(() => { resetModerationTerms(); resetModerationTermsLoad(); });

  it("texte propre : accepté, le serveur n'est pas appelé", async () => {
    const sb = fakeSupabase();
    const r = await screenText(sb, "message", "Bonjour, bienvenue au Canada !");
    expect(r.blocked).toBe(false);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it("insulte : refusée avec le message clair, le serveur est prévenu avec la source", async () => {
    const sb = fakeSupabase();
    await expect(screenText(sb, "post", "espèce de connard")).rejects.toMatchObject({ message: MODERATION_REFUSAL, moderation: true });
    expect(sb.rpc).toHaveBeenCalledWith("moderation_screen", { p_source: "post", p_text: "espèce de connard" });
  });

  it("mot ambigu : accepté mais signalé au serveur pour la file de relecture", async () => {
    const sb = fakeSupabase();
    const r = await screenText(sb, "comment", "quel con");
    expect(r.flagged).toBe(true);
    expect(sb.rpc).toHaveBeenCalledTimes(1);
  });

  it("échec du serveur (fonction pas encore déployée) : ne change jamais la décision", async () => {
    const sb = fakeSupabase({ rpc: vi.fn().mockRejectedValue(new Error("404")) });
    await expect(screenText(sb, "message", "sale salope")).rejects.toMatchObject({ moderation: true });
    const ok = fakeSupabase({ rpc: vi.fn().mockRejectedValue(new Error("404")) });
    await expect(screenText(ok, "message", "bonjour")).resolves.toBeTruthy();
  });

  it("la liste de la base remplace la liste de départ, une seule lecture par session", async () => {
    const sb = fakeSupabase({ terms: [{ term: "zorglub", category: "insulte", severity: "block" }] });
    const spy = vi.spyOn(sb, "from");
    await expect(screenText(sb, "message", "sale zorglub")).rejects.toMatchObject({ moderation: true });
    expect(checkText("connard").blocked).toBe(false); // plus dans la liste active
    const calls = spy.mock.calls.length;
    await screenText(sb, "message", "salut");
    expect(spy.mock.calls.length).toBe(calls); // pas de relecture
  });

  it("table absente : repli sur la liste de départ du dépôt", async () => {
    // module rechargé : le cache de chargement est par session
    vi.resetModules();
    const gate = await import("./contentGate.js");
    const mod = await import("./contentModeration.js");
    mod.resetModerationTerms();
    const sb = fakeSupabase({ terms: null });
    expect(await gate.loadModerationTerms(sb)).toBe(false);
    await expect(gate.screenText(sb, "message", "connard")).rejects.toMatchObject({ moderation: true });
  });
});

describe("affichage d'un refus", () => {
  it("refus local : message tel quel ; refus serveur P0001 : marqueur retiré", () => {
    const local = Object.assign(new Error(MODERATION_REFUSAL), { moderation: true });
    expect(friendlyDbError(local)).toBe(MODERATION_REFUSAL);
    const server = { code: "P0001", message: `${SERVER_REFUSAL_MARKER}: ${MODERATION_REFUSAL}` };
    expect(friendlyDbError(server)).toBe(MODERATION_REFUSAL);
    expect(isModerationRefusal(local)).toBe(true);
    expect(isModerationRefusal(server)).toBe(true);
    expect(isModerationRefusal(new Error("autre"))).toBe(false);
    expect(isModerationRefusal(null)).toBe(false);
  });
});
