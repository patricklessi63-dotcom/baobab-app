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
    ["select", "order", "limit", "eq", "range"].forEach((m) => { b[m] = () => b; });
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
    ["select", "order", "limit", "eq", "range"].forEach((m) => { nb[m] = () => nb; });
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

// Client minimal à réponses SCRIPTÉES pour le propre profil (le faux client
// ci-dessus renvoie toujours le même deferred, donc ne peut pas simuler "échoue
// puis réussit") : chaque appel à from("profiles").…maybeSingle() consomme la
// réponse suivante de `ownResponses`.
function makeScriptedClient(ownResponses) {
  const calls = { own: 0, likesFilters: [], started: [] };
  const builder = (table, opts = {}) => {
    const b = {};
    ["select", "order", "limit", "eq", "range"].forEach((m) => { b[m] = () => b; });
    b.or = (f) => { if (table === "likes") calls.likesFilters.push(f); return b; };
    b.maybeSingle = () => { opts.own = true; return b; };
    b.then = (res, rej) => {
      calls.started.push(table);
      let value = ok([]);
      if (table === "profiles" && opts.own) value = ownResponses[Math.min(calls.own++, ownResponses.length - 1)];
      return Promise.resolve(value).then(res, rej);
    };
    return b;
  };
  return {
    calls,
    client: {
      auth: { getSession: async () => ({ data: { session: { user: { id: "auth-1" } } } }) },
      from: (table) => builder(table),
      rpc: () => ({ then: (res, rej) => Promise.resolve(ok({ likers: [], admirers_count: 0 })).then(res, rej) }),
    },
  };
}

describe("fetchInitialData — échec ponctuel du propre profil (régression de f8c7b53)", () => {
  it("une erreur passagère est absorbée par un nouvel essai : loadAll n'échoue pas et le graphe est filtré", async () => {
    const s = makeScriptedClient([{ data: null, error: { message: "blip" } }, ok({ id: "me-1", user_id: "auth-1" })]);
    const result = await fetchInitialData(s.client);
    expect(result.ownRes.error).toBeNull();
    expect(result.ownRes.data.id).toBe("me-1");
    expect(s.calls.own).toBe(2);
    expect(s.calls.likesFilters).toEqual(["from_id.eq.me-1,to_id.eq.me-1"]);
  });

  it("deux erreurs de suite : l'erreur est renvoyée (jamais « aucun profil ») et le graphe social ne part PAS sans filtre", async () => {
    const s = makeScriptedClient([{ data: null, error: { message: "down" } }]);
    const result = await fetchInitialData(s.client);
    expect(result.ownRes.error.message).toBe("down");
    expect(result.ownRes.data).toBeNull();
    expect(s.calls.likesFilters).toEqual([]);
    expect(s.calls.started).not.toContain("likes");
    expect(result.likeRes.error).toBeTruthy(); // loadAll échoue sur ownRes.error avant d'utiliser le graphe
  });
});

// Plafond PostgREST (max_rows = 1000, silencieux) : faux client qui TRONQUE comme
// le vrai (jamais plus de 1000 lignes par réponse, quelle que soit la demande) et
// honore `.range(from, to)`. `data[table]` = jeu complet côté "serveur".
function makeCappedClient(data, { authUserId = "auth-1" } = {}) {
  const requests = [];
  function builder(table) {
    const state = { table, order: [], range: null, selectCols: "", own: false, limit: null };
    const b = {};
    b.select = (cols) => { state.selectCols = cols || ""; return b; };
    b.eq = () => b;
    b.or = () => b;
    b.order = (col) => { state.order.push(col); return b; };
    b.limit = (n) => { state.limit = n; return b; };
    b.range = (from, to) => { state.range = [from, to]; return b; };
    b.maybeSingle = () => { state.own = true; return b; };
    b.then = (res, rej) => {
      requests.push(state);
      const key = table === "blocks" && state.selectCols.includes("profile:to_id") ? "blocks:withProfile" : table;
      if (state.own) return Promise.resolve({ data: data.ownProfile, error: null }).then(res, rej);
      const all = data[key] || [];
      let rows;
      if (state.range) rows = all.slice(state.range[0], state.range[1] + 1);
      else rows = all.slice(0, state.limit ?? all.length);
      return Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(res, rej); // plafond PostgREST
    };
    return b;
  }
  return {
    requests,
    client: {
      auth: { getSession: async () => ({ data: { session: authUserId ? { user: { id: authUserId } } : null } }) },
      from: builder,
      rpc: () => ({ then: (res, rej) => Promise.resolve(ok({ likers: [], admirers_count: 0 })).then(res, rej) }),
    },
  };
}

const rows = (n, make) => Array.from({ length: n }, (_, i) => make(i));

describe("plafond PostgREST de 1000 lignes — chargement initial", () => {
  it("photos : 2500 lignes côté serveur, toutes récupérées (sans pagination, seules 1000 arrivaient)", async () => {
    const photos = rows(2500, (i) => ({ id: `ph-${i}`, profile_id: `p-${Math.floor(i / 6)}`, position: i % 6 }));
    const fake = makeCappedClient({ ownProfile: { id: "me-1" }, profiles: [], profile_photos: photos });
    const { photoRes } = await fetchInitialData(fake.client);
    expect(photoRes.error).toBeNull();
    expect(photoRes.data).toHaveLength(2500);
    expect(new Set(photoRes.data.map((p) => p.id)).size).toBe(2500);
    const photoReqs = fake.requests.filter((r) => r.table === "profile_photos");
    // tri déterministe complet (profile_id, position, id) à chaque page
    photoReqs.forEach((r) => expect(r.order).toEqual(["profile_id", "position", "id"]));
  });

  it("photos : la borne volontaire de 3200 lignes est conservée (pas de 4e page entière)", async () => {
    const photos = rows(5000, (i) => ({ id: `ph-${i}`, profile_id: `p-${Math.floor(i / 6)}`, position: i % 6 }));
    const fake = makeCappedClient({ ownProfile: { id: "me-1" }, profiles: [], profile_photos: photos });
    const { photoRes } = await fetchInitialData(fake.client);
    expect(photoRes.data).toHaveLength(3200);
    const ranges = fake.requests.filter((r) => r.table === "profile_photos").map((r) => r.range);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999], [3000, 3199]]);
  });

  it("graphe social : 2300 likes / 1100 passes / 1700 blocages (dont la liste « Comptes bloqués ») tous récupérés", async () => {
    const likes = rows(2300, (i) => ({ id: i, from_id: "me-1", to_id: `u-${i}` }));
    const passes = rows(1100, (i) => ({ id: i, from_id: "me-1", to_id: `u-${i}` }));
    const blocks = rows(1700, (i) => ({ id: `b-${i}`, from_id: i % 2 ? "me-1" : `u-${i}`, to_id: i % 2 ? `u-${i}` : "me-1" }));
    const blocksWithProfile = rows(1500, (i) => ({ id: `b-${i}`, to_id: `u-${i}`, profile: { id: `u-${i}` } }));
    const fake = makeCappedClient({ likes, passes, blocks, "blocks:withProfile": blocksWithProfile });
    const res = await fetchSocialGraph(fake.client, "me-1");
    expect(res.likeRes.data).toHaveLength(2300);
    expect(res.passRes.data).toHaveLength(1100);
    // SÉCURITÉ : une liste de blocages tronquée à 1000 ferait réapparaître des utilisateurs bloqués.
    expect(res.blockRes.data).toHaveLength(1700);
    expect(res.blockedProfRes.data).toHaveLength(1500);
    expect(new Set(res.blockRes.data.map((r) => r.to_id + r.from_id)).size).toBe(1700);
    fake.requests.forEach((r) => expect(r.order).toEqual(["id"]));
  });

  it("une erreur sur une page des blocages remonte telle quelle (jamais une liste partielle silencieuse)", async () => {
    let call = 0;
    const client = {
      from: (table) => {
        const b = {};
        ["select", "eq", "or", "order"].forEach((m) => { b[m] = () => b; });
        b.range = () => b;
        b.then = (res, rej) => {
          if (table !== "blocks") return Promise.resolve(ok([])).then(res, rej);
          call += 1;
          const out = call === 1 ? ok(rows(1000, (i) => ({ id: i, from_id: "me-1", to_id: `u-${i}` }))) : { data: null, error: { message: "boom" } };
          return Promise.resolve(out).then(res, rej);
        };
        return b;
      },
      rpc: () => ({ then: (res, rej) => Promise.resolve(ok({ likers: [], admirers_count: 0 })).then(res, rej) }),
    };
    const res = await fetchSocialGraph(client, "me-1");
    expect(res.blockRes.error.message).toBe("boom");
    expect(res.blockRes.data).toBeNull();
  });
});
