import { describe, it, expect } from "vitest";
import { resolveLiveMatch } from "./activeMatchPresence";

describe("resolveLiveMatch", () => {
  it("retourne null si aucune conversation n'est ouverte", () => {
    expect(resolveLiveMatch(null, [{ id: "a" }])).toBe(null);
  });

  it("retourne l'entrée à jour de `matches` (même id), pas l'instantané figé", () => {
    // Bug corrigé : activeMatch venait de App.jsx (setActiveMatch au moment
    // de l'ouverture de la conversation) et n'était plus jamais rafraîchi —
    // même quand `matches` (recalculé à chaque rendu depuis likerProfilesRaw)
    // recevait un is_online/last_seen plus récent via le heartbeat ou
    // refreshPeersPresence.
    const stale = { id: "u1", is_online: true, last_seen: "2026-09-15T12:00:00.000Z" };
    const fresh = { id: "u1", is_online: false, last_seen: "2026-09-15T12:15:00.000Z" };
    const result = resolveLiveMatch(stale, [{ id: "u2" }, fresh]);
    expect(result).toBe(fresh);
  });

  it("retombe sur l'instantané figé si le profil a disparu de `matches` (ex. dématché)", () => {
    const stale = { id: "u1", is_online: true, last_seen: "2026-09-15T12:00:00.000Z" };
    expect(resolveLiveMatch(stale, [{ id: "u2" }])).toBe(stale);
  });

  it("gère une liste `matches` absente/vide sans planter", () => {
    const stale = { id: "u1" };
    expect(resolveLiveMatch(stale, undefined)).toBe(stale);
    expect(resolveLiveMatch(stale, [])).toBe(stale);
  });
});
