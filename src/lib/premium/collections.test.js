import { describe, it, expect, vi, beforeEach } from "vitest";

const calls = [];
let nextResult = { data: null, error: null };
function chain(table) {
  const q = {
    table,
    select: (...a) => { calls.push([table, "select", ...a]); return q; },
    insert: (...a) => { calls.push([table, "insert", ...a]); return q; },
    delete: (...a) => { calls.push([table, "delete", ...a]); return q; },
    eq: (...a) => { calls.push([table, "eq", ...a]); return q; },
    in: (...a) => { calls.push([table, "in", ...a]); return q; },
    order: (...a) => { calls.push([table, "order", ...a]); return q; },
    single: () => Promise.resolve(nextResult),
    then: (res, rej) => Promise.resolve(nextResult).then(res, rej),
  };
  return q;
}
vi.mock("../../supabaseClient", () => ({ supabase: { from: (t) => chain(t) } }));

import {
  cleanCollectionName,
  collectionErrorMessage,
  listCollections,
  createCollection,
  addToCollection,
  removeFromCollection,
  deleteCollection,
  loadCollectionPosts,
  COLLECTION_NAME_MAX,
} from "./collections.js";

beforeEach(() => { calls.length = 0; nextResult = { data: null, error: null }; });

describe("cleanCollectionName", () => {
  it("rogne et compacte les espaces", () => {
    expect(cleanCollectionName("  À   relire  ")).toBe("À relire");
  });
  it("refuse vide, espaces seuls, null et trop long", () => {
    expect(cleanCollectionName("")).toBeNull();
    expect(cleanCollectionName("   ")).toBeNull();
    expect(cleanCollectionName(null)).toBeNull();
    expect(cleanCollectionName("x".repeat(COLLECTION_NAME_MAX + 1))).toBeNull();
    expect(cleanCollectionName("x".repeat(COLLECTION_NAME_MAX))).not.toBeNull();
  });
});

describe("collectionErrorMessage", () => {
  it("traduit les erreurs connues", () => {
    expect(collectionErrorMessage({ message: "COLLECTION_LIMIT: 20 collections au maximum." })).toMatch(/limite de 20/);
    expect(collectionErrorMessage({ message: "COLLECTION_ITEM_LIMIT: 500" })).toMatch(/pleine/);
    expect(collectionErrorMessage({ code: "23505", message: "duplicate key" })).toMatch(/déjà ce nom/);
    expect(collectionErrorMessage({ code: "42501", message: "new row violates row-level security policy" })).toMatch(/réservée aux abonnés Premium/);
    expect(collectionErrorMessage({ code: "42P01", message: "relation does not exist" })).toMatch(/pas encore disponibles/);
  });
  it("renvoie null pour une erreur inconnue (l'appelant affiche son message générique)", () => {
    expect(collectionErrorMessage({ message: "boom" })).toBeNull();
    expect(collectionErrorMessage(null)).toBeNull();
  });
});

describe("accès base", () => {
  it("listCollections renvoie les ids de publications de chaque collection", async () => {
    nextResult = { data: [{ id: "c1", name: "A", items: [{ post_id: "p1" }, { post_id: "p2" }] }, { id: "c2", name: "B", items: null }], error: null };
    expect(await listCollections()).toEqual([{ id: "c1", name: "A", postIds: ["p1", "p2"] }, { id: "c2", name: "B", postIds: [] }]);
  });

  it("createCollection envoie le nom nettoyé et refuse un nom invalide sans appel réseau", async () => {
    nextResult = { data: { id: "c9", name: "Voyage" }, error: null };
    expect(await createCollection("u1", "  Voyage ")).toEqual({ id: "c9", name: "Voyage", postIds: [] });
    expect(calls.find((c) => c[1] === "insert")[2]).toEqual({ owner_id: "u1", name: "Voyage" });
    calls.length = 0;
    await expect(createCollection("u1", "   ")).rejects.toMatchObject({ code: "INVALID_NAME" });
    expect(calls).toHaveLength(0);
  });

  it("addToCollection traite 'déjà rangée' (23505) comme un succès, relance les autres erreurs", async () => {
    nextResult = { data: null, error: { code: "23505", message: "duplicate" } };
    await expect(addToCollection("u1", "c1", "p1")).resolves.toBeUndefined();
    nextResult = { data: null, error: { code: "42501", message: "rls" } };
    await expect(addToCollection("u1", "c1", "p1")).rejects.toMatchObject({ code: "42501" });
  });

  it("removeFromCollection / deleteCollection propagent les erreurs", async () => {
    nextResult = { data: null, error: { code: "XX", message: "fail" } };
    await expect(removeFromCollection("c1", "p1")).rejects.toMatchObject({ code: "XX" });
    await expect(deleteCollection("c1")).rejects.toMatchObject({ code: "XX" });
  });

  it("loadCollectionPosts : aucun appel pour une liste vide, plafonne à 500 ids", async () => {
    expect(await loadCollectionPosts([])).toEqual([]);
    expect(calls).toHaveLength(0);
    nextResult = { data: [{ id: "p1" }], error: null };
    await loadCollectionPosts(Array.from({ length: 600 }, (_, i) => `p${i}`));
    expect(calls.find((c) => c[1] === "in")[3]).toHaveLength(500);
  });
});
