import { describe, it, expect, vi, beforeEach } from "vitest";

const { insertMock, fromMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  return { insertMock, fromMock: vi.fn(() => ({ insert: insertMock })) };
});

vi.mock("../supabaseClient", () => ({ supabase: { from: fromMock } }));

import { trackActivation, _resetTrackActivationMemory } from "./trackActivation.js";

// Environnement "node" : pas de localStorage natif — mini-implémentation.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return store;
}

beforeEach(() => {
  insertMock.mockReset();
  fromMock.mockClear();
  _resetTrackActivationMemory();
  installLocalStorage();
});

describe("trackActivation — pas de requête redondante après le premier jalon", () => {
  it("ne ré-émet pas first_message à chaque message envoyé (un seul POST au lieu d'un par message)", async () => {
    insertMock.mockResolvedValue({ error: null });
    for (let i = 0; i < 5; i++) await trackActivation("p1", "first_message");
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({ profile_id: "p1", event_type: "first_message" });
  });

  it("deux appels simultanés ne partent qu'une fois", async () => {
    insertMock.mockResolvedValue({ error: null });
    await Promise.all([trackActivation("p1", "first_like"), trackActivation("p1", "first_like")]);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("des types ou des profils différents restent indépendants", async () => {
    insertMock.mockResolvedValue({ error: null });
    await trackActivation("p1", "first_like");
    await trackActivation("p1", "first_message");
    await trackActivation("p2", "first_like");
    expect(insertMock).toHaveBeenCalledTimes(3);
  });

  it("un doublon serveur (23505) est considéré comme fait : plus aucun appel ensuite, y compris après rechargement (localStorage)", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505" } });
    await trackActivation("p1", "first_like");
    expect(insertMock).toHaveBeenCalledTimes(1);

    _resetTrackActivationMemory(); // simule un rechargement de la page
    await trackActivation("p1", "first_like");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("un échec réseau/RLS n'est PAS mémorisé : le jalon est retenté au prochain appel", async () => {
    insertMock.mockResolvedValueOnce({ error: { code: "42501" } });
    insertMock.mockResolvedValueOnce({ error: null });
    await trackActivation("p1", "first_match");
    await trackActivation("p1", "first_match");
    expect(insertMock).toHaveBeenCalledTimes(2);
    await trackActivation("p1", "first_match");
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("une exception ne se propage jamais et n'empêche pas une nouvelle tentative", async () => {
    insertMock.mockRejectedValueOnce(new Error("réseau"));
    insertMock.mockResolvedValueOnce({ error: null });
    await expect(trackActivation("p1", "first_like")).resolves.toBeUndefined();
    await trackActivation("p1", "first_like");
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("sans profileId : aucun appel", async () => {
    await trackActivation(null, "first_like");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
