import { describe, it, expect } from "vitest";
import { fetchInitialData, fetchSocialGraph, createOwnProfilePrefetch, OWN_PROFILE_PREFETCH_TTL_MS } from "./initialLoad.js";

// Faux client Supabase : chaque requête est une "thenable" dont la résolution est
// pilotée par le test (deferred), et on enregistre l'ordre de DÉMARRAGE des requêtes
// (une requête PostgREST ne part qu'au .then()/await).
function makeFakeClient({ authUserId = "auth-1" } = {}) {
  const started = [];
  const deferreds = {};
  const filters = {};
  function deferredFor(key) {
    if (!deferreds[key]) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      deferreds[key] = { promise, resolve };
    }
    return deferreds[key];
  }
  function makeBuilder(key) {
    const b = {};
    ["select", "order", "limit", "eq"].forEach((m) => { b[m] = () => b; });
    b.or = (f) => { filters[key] = f; return b; };
    const start = () => {
      if (!started.includes(key)) started.push(key);
      return deferredFor(key).promise;
    };
    b.maybeSingle = () => b;
    b.then = (res, rej) => start().then(res, rej);
    return b;
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: authUserId ? { user: { id: authUserId } } : null } }) },
    from(table) {
      // "profiles" est utilisée 2 fois : liste (limit) vs propre profil (eq/maybeSingle).
      const b = makeBuilder(table);
      if (table === "profiles") {
        // 2 usages : la liste (…limit) vs le propre profil (…maybeSingle).
        b.maybeSingle = () => rekey("profiles:own");
        b.limit = () => rekey("profiles:list");
      }
      if (table === "blocks") {
        // 2 usages : liste brute (.or) vs jointure profils (.eq) — distingués par select().
        b.select = (cols) => rekey(cols.includes("profile:to_id") ? "blocks:withProfile" : "blocks:list");
      }
      return b;
    },
    rpc: (name) => makeBuilder(`rpc:${name}`),
  };
  function rekey(key) {
    const nb = makeBuilder(key);
    ["select", "order", "limit", "eq"].forEach((m) => { nb[m] = () => nb; });
    nb.or = (f) => { filters[key] = f; return nb; };
    nb.maybeSingle = () => nb;
    return nb;
  }
  return {
    client,
    started,
    filters,
    resolve: (key, value) => deferredFor(key).resolve(value),
  };
}

const ok = (data) => ({ data, error: null });

describe("fetchInitialData — pas de cascade profils -> graphe social -> propre profil", () => {
  it("le graphe social part dès que le propre profil répond, SANS attendre les 500 profils ni les 3200 photos", async () => {
    const fake = makeFakeClient();
    const promise = fetchInitialData(fake.client);

    // Les 3 requêtes de la phase 1 partent ensemble.
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.started).toEqual(expect.arrayContaining(["profiles:list", "profile_photos", "profiles:own"]));
    expect(fake.started).not.toContain("likes"); // id du profil pas encore connu

    // Seul le propre profil répond : les 2 grosses requêtes sont toujours en vol.
    fake.resolve("profiles:own", ok({ id: "me-1", user_id: "auth-1" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.started).toEqual(expect.arrayContaining(["likes", "passes", "blocks:list", "rpc:get_my_likers", "blocks:withProfile"]));
    expect(fake.filters.likes).toBe("from_id.eq.me-1,to_id.eq.me-1");

    // Fin du chargement : tout est renvoyé.
    fake.resolve("profiles:list", ok([{ id: "p1" }]));
    fake.resolve("profile_photos", ok([]));
    fake.resolve("likes", ok([{ from_id: "me-1", to_id: "p1" }]));
    fake.resolve("passes", ok([]));
    fake.resolve("blocks:list", ok([]));
    fake.resolve("rpc:get_my_likers", ok({ likers: [], admirers_count: 0 }));
    fake.resolve("blocks:withProfile", ok([]));
    const result = await promise;

    expect(result.authUserId).toBe("auth-1");
    expect(result.ownRes.data.id).toBe("me-1");
    expect(result.profRes.data).toEqual([{ id: "p1" }]);
    expect(result.likeRes.data).toHaveLength(1);
    expect(result.likerRes.data.admirers_count).toBe(0);
  });

  it("un compte sans profil (onboarding) : pas d'erreur, graphe social non filtré comme avant", async () => {
    const fake = makeFakeClient();
    const promise = fetchInitialData(fake.client);
    fake.resolve("profiles:own", ok(null));
    fake.resolve("profiles:list", ok([]));
    fake.resolve("profile_photos", ok([]));
    fake.resolve("likes", ok([]));
    fake.resolve("passes", ok([]));
    fake.resolve("blocks:list", ok([]));
    const result = await promise;
    expect(result.ownRes.data).toBeNull();
    expect(fake.filters.likes).toBeUndefined(); // pas de filtre .or sans id
    expect(fake.started).not.toContain("rpc:get_my_likers");
  });

  it("sans session : aucune requête du propre profil", async () => {
    const fake = makeFakeClient({ authUserId: null });
    const promise = fetchInitialData(fake.client);
    fake.resolve("profiles:list", ok([]));
    fake.resolve("profile_photos", ok([]));
    fake.resolve("likes", ok([]));
    fake.resolve("passes", ok([]));
    fake.resolve("blocks:list", ok([]));
    const result = await promise;
    expect(result.authUserId).toBeNull();
    expect(fake.started).not.toContain("profiles:own");
  });

  it("l'erreur du propre profil est renvoyée telle quelle (loadAll la traite comme un échec de chargement)", async () => {
    const fake = makeFakeClient();
    const promise = fetchInitialData(fake.client);
    fake.resolve("profiles:own", { data: null, error: { message: "boom" } });
    fake.resolve("profiles:list", ok([]));
    fake.resolve("profile_photos", ok([]));
    fake.resolve("likes", ok([]));
    fake.resolve("passes", ok([]));
    fake.resolve("blocks:list", ok([]));
    const result = await promise;
    expect(result.ownRes.error.message).toBe("boom");
  });
});

describe("fetchSocialGraph", () => {
  it("5 requêtes en parallèle quand l'id est connu", async () => {
    const fake = makeFakeClient();
    const p = fetchSocialGraph(fake.client, "me-1");
    await new Promise((r) => setTimeout(r, 0));
    expect(fake.started).toHaveLength(5);
    ["likes", "passes", "blocks:list", "rpc:get_my_likers", "blocks:withProfile"].forEach((k) => fake.resolve(k, ok([])));
    await p;
  });
});

describe("createOwnProfilePrefetch — passage du propre profil de loadAll à l'effet checking-profile", () => {
  const res = { data: { id: "me-1", user_id: "auth-1" }, error: null };

  it("restitue le profil une seule fois, pour le même compte", () => {
    const m = createOwnProfilePrefetch();
    m.store("auth-1", res, 1000);
    expect(m.take("auth-1", 2000)).toBe(res);
    expect(m.take("auth-1", 2001)).toBeNull(); // consommé
  });

  it("jamais pour un autre compte", () => {
    const m = createOwnProfilePrefetch();
    m.store("auth-1", res, 1000);
    expect(m.take("auth-2", 1001)).toBeNull();
    expect(m.take("auth-1", 1002)).toBeNull(); // et l'entrée est de toute façon perdue
  });

  it("jamais s'il est périmé", () => {
    const m = createOwnProfilePrefetch();
    m.store("auth-1", res, 1000);
    expect(m.take("auth-1", 1000 + OWN_PROFILE_PREFETCH_TTL_MS + 1)).toBeNull();
  });

  it("n'enregistre pas une erreur ni l'absence de profil : l'effet refait sa propre requête", () => {
    const m = createOwnProfilePrefetch();
    m.store("auth-1", { data: null, error: { message: "x" } }, 1000);
    expect(m.take("auth-1", 1001)).toBeNull();
    m.store("auth-1", { data: null, error: null }, 1000);
    expect(m.take("auth-1", 1001)).toBeNull();
    m.store(null, res, 1000);
    expect(m.take(null, 1001)).toBeNull();
  });

  it("un nouveau store remplace l'ancien", () => {
    const m = createOwnProfilePrefetch();
    m.store("auth-1", res, 1000);
    const res2 = { data: { id: "me-1", name: "Neuf" }, error: null };
    m.store("auth-1", res2, 1500);
    expect(m.take("auth-1", 1600)).toBe(res2);
  });
});
