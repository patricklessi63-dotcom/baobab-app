import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readOwnProfile, updateOwnProfile, insertOwnProfile, isPermissionDenied, isMissingRpc, RPC_PREF_TTL_MS } from "./ownProfile";

// Faux client supabase : `mode` décrit l'état de la base.
//  - "avant"  : bloc 3B pas encore joué (select("*") et RETURNING * autorisés, get_my_profile peut exister ou non)
//  - "apres"  : bloc 3B joué (toute lecture de la table qui s'étend à `*` répond 42501)
// Le choix mémorisé est un horodatage (ms) : valide tant qu'il a moins de RPC_PREF_TTL_MS.
const PREF_KEY = "baobab:ownProfileViaRpc";
const prefStored = () => localStorage.getItem(PREF_KEY);
const prefIsSet = () => Number(prefStored()) > 1;
const FULL = { id: "p1", user_id: "u1", name: "Alice", birth_date: "1990-01-01", ban_reason: null };
const denied = { code: "42501", message: "permission denied for table profiles" };

function makeClient({ mode = "avant", rpcExists = true, writeError = null } = {}) {
  const calls = [];
  const rpcMissing = { code: "PGRST202", message: "Could not find the function public.get_my_profile", status: 404 };
  function builder(table, op) {
    const state = { op, select: null, payload: null };
    const b = {
      update: (p) => { state.op = "update"; state.payload = p; return b; },
      insert: (p) => { state.op = "insert"; state.payload = p; return b; },
      eq: () => b,
      select: (cols) => { state.select = cols === undefined ? "*" : cols; return b; },
      single: () => resolve(),
      maybeSingle: () => resolve(),
    };
    function resolve() {
      calls.push(`${table}.${state.op || "select"}(${state.select ?? ""})`);
      const wantsAll = state.select === "*" || state.select === null;
      if (writeError && (state.op === "update" || state.op === "insert")) return Promise.resolve({ data: null, error: writeError });
      if (mode === "apres" && wantsAll) return Promise.resolve({ data: null, error: denied });
      if (state.op === "update" || state.op === "insert") return Promise.resolve({ data: state.select === "id" ? { id: "p1" } : { ...FULL, ...state.payload }, error: null });
      return Promise.resolve({ data: { ...FULL }, error: null });
    }
    return b;
  }
  return {
    calls,
    from: (t) => ({
      select: (c) => builder(t, "select").select(c),
      update: (p) => builder(t, "update").update(p),
      insert: (p) => builder(t, "insert").insert(p),
    }),
    rpc: (name) => ({
      maybeSingle: () => {
        calls.push(`rpc.${name}`);
        return Promise.resolve(rpcExists ? { data: { ...FULL }, error: null } : { data: null, error: rpcMissing });
      },
    }),
  };
}

// Environnement « node » : on fournit un localStorage en mémoire (stubGlobal), retiré après chaque test.
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ownProfile — avant le bloc 3B (comportement inchangé)", () => {
  it("lit son profil avec select('*') exactement comme avant, sans appeler la RPC", async () => {
    const c = makeClient({ mode: "avant" });
    const r = await readOwnProfile(c, "u1");
    expect(r.data.name).toBe("Alice");
    expect(c.calls).toEqual(["profiles.select(*)"]);
  });

  it("update : update().select().single(), une seule requête", async () => {
    const c = makeClient({ mode: "avant" });
    const r = await updateOwnProfile(c, "p1", { name: "Bob" });
    expect(r.data.name).toBe("Bob");
    expect(c.calls).toEqual(["profiles.update(*)"]);
  });

  it("insert : insert().select().single(), une seule requête", async () => {
    const c = makeClient({ mode: "avant" });
    const r = await insertOwnProfile(c, { user_id: "u1" });
    expect(r.data.user_id).toBe("u1");
    expect(c.calls).toEqual(["profiles.insert(*)"]);
  });

  it("une vraie erreur (réseau, RLS autre que 42501) est renvoyée telle quelle, sans bascule", async () => {
    const c = makeClient({ mode: "avant", writeError: { code: "23514", message: "check violation" } });
    const r = await updateOwnProfile(c, "p1", { age: 5 });
    expect(r.error.code).toBe("23514");
    expect(c.calls).toEqual(["profiles.update(*)"]);
    expect(prefStored()).toBeNull();
  });
});

describe("ownProfile — après le bloc 3B (permission refusée sur select *)", () => {
  it("lecture : bascule sur get_my_profile et mémorise le choix ; la fois suivante, plus de requête refusée", async () => {
    const c = makeClient({ mode: "apres" });
    const r1 = await readOwnProfile(c, "u1");
    expect(r1.data.birth_date).toBe("1990-01-01");
    expect(c.calls).toEqual(["profiles.select(*)", "rpc.get_my_profile"]);
    expect(prefIsSet()).toBe(true);
    c.calls.length = 0;
    await readOwnProfile(c, "u1");
    expect(c.calls).toEqual(["rpc.get_my_profile"]);
  });

  it("update : rejoue sans RETURNING * puis relit la ligne complète par la RPC", async () => {
    const c = makeClient({ mode: "apres" });
    const r = await updateOwnProfile(c, "p1", { name: "Zoe" });
    expect(r.error).toBeNull();
    expect(r.data.birth_date).toBe("1990-01-01");
    expect(c.calls).toEqual(["profiles.update(*)", "profiles.update(id)", "rpc.get_my_profile"]);
    // mémorisé : l'écriture suivante ne tente plus RETURNING *
    c.calls.length = 0;
    await updateOwnProfile(c, "p1", { name: "Zed" });
    expect(c.calls).toEqual(["profiles.update(id)", "rpc.get_my_profile"]);
  });

  it("insert : même mécanique", async () => {
    const c = makeClient({ mode: "apres" });
    const r = await insertOwnProfile(c, { user_id: "u1" });
    expect(r.data.id).toBe("p1");
    expect(c.calls).toEqual(["profiles.insert(*)", "profiles.insert(id)", "rpc.get_my_profile"]);
  });

  it("si la RPC est absente (bloc 3A annulé), l'erreur d'origine est renvoyée et rien n'est mémorisé", async () => {
    const c = makeClient({ mode: "apres", rpcExists: false });
    const r = await readOwnProfile(c, "u1");
    expect(r.error.code).toBe("42501");
    expect(prefStored()).toBeNull();
  });

  it("choix mémorisé mais RPC disparue : oublie le choix et revient aux requêtes directes", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = makeClient({ mode: "avant", rpcExists: false });
    const r = await readOwnProfile(c, "u1");
    expect(r.data.name).toBe("Alice");
    expect(c.calls).toEqual(["rpc.get_my_profile", "profiles.select(*)"]);
    expect(prefStored()).toBeNull();
  });

  it("une écriture refusée par la RLS (42501) renvoie l'erreur, sans boucle ni écriture supplémentaire", async () => {
    const c = makeClient({ mode: "avant", writeError: denied });
    const r = await updateOwnProfile(c, "p1", { name: "x" });
    expect(r.error.code).toBe("42501");
    expect(c.calls).toEqual(["profiles.update(*)", "profiles.update(id)"]);
  });

  it("fonctionne même si localStorage est indisponible", async () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("blocked"); },
      setItem() { throw new Error("blocked"); },
      removeItem() { throw new Error("blocked"); },
    });
    const c = makeClient({ mode: "apres" });
    const r = await readOwnProfile(c, "u1");
    expect(r.data.name).toBe("Alice");
  });
});

describe("ownProfile — détecteurs d'erreurs", () => {
  it("reconnaît 42501 / permission denied et fonction introuvable", () => {
    expect(isPermissionDenied({ code: "42501" })).toBe(true);
    expect(isPermissionDenied({ message: "permission denied for table profiles" })).toBe(true);
    expect(isPermissionDenied({ code: "23505" })).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isMissingRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpc({ message: "Could not find the function public.get_my_profile" })).toBe(true);
    expect(isMissingRpc({ code: "42501" })).toBe(false);
  });
});

// Faux client à réponses scriptées : chaque file renvoie ses réponses dans l'ordre (la dernière se répète).
//  direct : select("*") par user_id / id ; write : update/insert (avec ou sans RETURNING) ; rpc : get_my_profile.
function scripted({ direct = [], write = [], rpc = [] } = {}) {
  const calls = [];
  const next = (q) => (q.length > 1 ? q.shift() : q[0] ?? { data: null, error: null });
  const wbuilder = (op) => {
    let sel = null;
    const b = {
      eq: () => b,
      select: (c) => { sel = c === undefined ? "*" : c; return b; },
      single: () => { calls.push(`profiles.${op}(${sel ?? ""})`); return Promise.resolve(next(write)); },
    };
    return b;
  };
  return {
    calls,
    from: () => ({
      select: (c) => ({ eq: () => ({ maybeSingle: () => { calls.push(`profiles.select(${c})`); return Promise.resolve(next(direct)); } }) }),
      update: () => wbuilder("update"),
      insert: () => wbuilder("insert"),
    }),
    rpc: (name) => ({ maybeSingle: () => { calls.push(`rpc.${name}`); return Promise.resolve(next(rpc)); } }),
  };
}
const ok = (data) => ({ data, error: null });
const err = (error) => ({ data: null, error });
const networkError = { message: "TypeError: Failed to fetch", details: "", hint: "", code: "" };
const jwtExpired = { code: "PGRST301", message: "JWT expired", details: null, hint: null, status: 401 };
const rpcMissing = { code: "PGRST202", message: "Could not find the function public.get_my_profile without parameters in the schema cache" };

describe("readOwnProfile — profil absent, réseau, session expirée (ne JAMAIS confondre avec un refus 42501)", () => {
  it("nouveau compte sans profil AVANT 3B (data null, pas d'erreur) : renvoyé tel quel, aucune bascule", async () => {
    const c = scripted({ direct: [ok(null)] });
    const r = await readOwnProfile(c, "u1");
    expect(r).toEqual({ data: null, error: null });
    expect(c.calls).toEqual(["profiles.select(*)"]);
    expect(prefStored()).toBeNull();
  });

  it("nouveau compte sans profil APRÈS 3B : 42501 puis RPC -> data null sans erreur (onboarding), choix mémorisé", async () => {
    const c = scripted({ direct: [err(denied)], rpc: [ok(null)] });
    const r = await readOwnProfile(c, "u1");
    expect(r).toEqual({ data: null, error: null });
    expect(prefIsSet()).toBe(true);
  });

  it.each([
    ["erreur réseau", networkError],
    ["session expirée (401, JWT expired)", jwtExpired],
    ["délai dépassé", { message: "AbortError: The operation was aborted due to timeout", code: "" }],
    ["panne serveur 500", { code: "XX000", message: "internal error" }],
  ])("%s : erreur renvoyée telle quelle, RPC jamais appelée, rien mémorisé", async (_label, e) => {
    const c = scripted({ direct: [err(e)] });
    const r = await readOwnProfile(c, "u1");
    expect(r.error).toBe(e);
    expect(c.calls).toEqual(["profiles.select(*)"]);
    expect(prefStored()).toBeNull();
  });

  it("mode RPC mémorisé + erreur réseau : erreur renvoyée, pas de requête directe, choix conservé", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = scripted({ rpc: [err(networkError)] });
    const r = await readOwnProfile(c, "u1");
    expect(r.error).toBe(networkError);
    expect(c.calls).toEqual(["rpc.get_my_profile"]);
    expect(prefIsSet()).toBe(true);
  });

  it("42501 puis RPC en erreur réseau : l'erreur d'ORIGINE (42501) est renvoyée, rien mémorisé, une seule RPC (pas de boucle)", async () => {
    const c = scripted({ direct: [err(denied)], rpc: [err(networkError)] });
    const r = await readOwnProfile(c, "u1");
    expect(r.error).toBe(denied);
    expect(c.calls).toEqual(["profiles.select(*)", "rpc.get_my_profile"]);
    expect(prefStored()).toBeNull();
  });

  it("42501 puis fonction absente (PGRST202) : erreur d'origine, aucune boucle, rien mémorisé", async () => {
    const c = scripted({ direct: [err(denied)], rpc: [err(rpcMissing)] });
    const r = await readOwnProfile(c, "u1");
    expect(r.error).toBe(denied);
    expect(c.calls).toEqual(["profiles.select(*)", "rpc.get_my_profile"]);
    expect(prefStored()).toBeNull();
  });
});

describe("ownProfile — expiration du choix mémorisé (retour arrière du bloc 3B)", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T12:00:00Z")); });
  afterEach(() => { vi.useRealTimers(); });

  it("choix frais : RPC d'emblée ; choix expiré : on retente le chemin DIRECT (3B annulé -> select * refonctionne)", async () => {
    const c = scripted({ direct: [ok({ ...FULL })], rpc: [ok({ ...FULL })] });
    localStorage.setItem(PREF_KEY, String(Date.now()));
    await readOwnProfile(c, "u1");
    expect(c.calls).toEqual(["rpc.get_my_profile"]);
    c.calls.length = 0;
    vi.setSystemTime(Date.now() + RPC_PREF_TTL_MS + 1000);
    const r = await readOwnProfile(c, "u1");
    expect(c.calls).toEqual(["profiles.select(*)"]);
    expect(r.data.name).toBe("Alice");
  });

  it("choix expiré mais 3B toujours joué : un seul 42501, bascule RPC et choix re-mémorisé (horodatage frais)", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now() - RPC_PREF_TTL_MS - 1));
    const c = scripted({ direct: [err(denied)], rpc: [ok({ ...FULL })] });
    const r = await readOwnProfile(c, "u1");
    expect(r.data.name).toBe("Alice");
    expect(c.calls).toEqual(["profiles.select(*)", "rpc.get_my_profile"]);
    expect(Number(prefStored())).toBe(Date.now());
  });

  it('ancienne valeur "1" (version précédente du code) = expirée ; valeur illisible ou dans le futur aussi', async () => {
    for (const v of ["1", "oui", "", String(Date.now() + 10 * RPC_PREF_TTL_MS)]) {
      localStorage.setItem(PREF_KEY, v);
      const c = scripted({ direct: [ok({ ...FULL })] });
      await readOwnProfile(c, "u1");
      expect(c.calls).toEqual(["profiles.select(*)"]);
    }
  });
});

describe("écritures — relecture après une écriture validée", () => {
  it("relecture RPC en échec réseau une fois, puis réussie : l'écriture n'est PAS transformée en erreur", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = scripted({ write: [ok({ id: "p1" })], rpc: [err(networkError), ok({ ...FULL, name: "Zoe" })] });
    const r = await updateOwnProfile(c, "p1", { name: "Zoe" });
    expect(r.error).toBeNull();
    expect(r.data.name).toBe("Zoe");
    expect(c.calls).toEqual(["profiles.update(id)", "rpc.get_my_profile", "rpc.get_my_profile"]);
  });

  it("relecture toujours en échec : l'erreur est marquée writeCommitted (l'appelant ne supprime pas les fichiers référencés)", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = scripted({ write: [ok({ id: "p1" })], rpc: [err(networkError)] });
    const r = await updateOwnProfile(c, "p1", { name: "Zoe" });
    expect(r.error.writeCommitted).toBe(true);
    expect(r.error.message).toBe(networkError.message);
    expect(c.calls.filter((x) => x === "profiles.update(id)")).toHaveLength(1); // jamais réécrit
  });

  it("une écriture REFUSÉE n'est jamais marquée writeCommitted", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = scripted({ write: [err({ code: "23514", message: "check" })] });
    const r = await updateOwnProfile(c, "p1", { age: 1 });
    expect(r.error.writeCommitted).toBeUndefined();
    expect(c.calls).toEqual(["profiles.update(id)"]);
  });

  it("choix mémorisé mais get_my_profile disparue : écriture validée, choix oublié, relecture directe", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = scripted({ write: [ok({ id: "p1" })], rpc: [err(rpcMissing)], direct: [ok({ ...FULL, name: "Zoe" })] });
    const r = await updateOwnProfile(c, "p1", { name: "Zoe" });
    expect(r.error).toBeNull();
    expect(r.data.name).toBe("Zoe");
    expect(prefStored()).toBeNull();
  });

  it("insert : profil créé mais relecture perdue ; le nouvel essai (23505 user_id) reprend MA ligne au lieu de bloquer l'onboarding", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const c = scripted({
      write: [err({ code: "23505", message: 'duplicate key value violates unique constraint "profiles_user_id_unique"' })],
      rpc: [ok({ ...FULL })],
    });
    const r = await insertOwnProfile(c, { user_id: "u1" });
    expect(r.error).toBeNull();
    expect(r.data.id).toBe("p1");
  });

  it("insert : 23505 sans profil lisible (autre contrainte) -> l'erreur d'origine est renvoyée", async () => {
    localStorage.setItem(PREF_KEY, String(Date.now()));
    const dup = { code: "23505", message: "duplicate key" };
    const c = scripted({ write: [err(dup)], rpc: [ok(null)] });
    const r = await insertOwnProfile(c, { user_id: "u1" });
    expect(r.error).toBe(dup);
  });

  it("nominal AVANT 3B : une écriture en erreur réseau n'est pas rejouée et n'appelle pas la RPC", async () => {
    const c = scripted({ write: [err(networkError)] });
    const r = await updateOwnProfile(c, "p1", { name: "x" });
    expect(r.error).toBe(networkError);
    expect(c.calls).toEqual(["profiles.update(*)"]);
    expect(prefStored()).toBeNull();
  });
});

// Garde-fou de source : après le bloc 3B de supabase-close-read-leaks.sql, tout `select("*")` ou `.select()` (RETURNING *)
// direct sur `profiles` échoue en 42501, de même qu'une jointure `profiles(*)`. Seul src/lib/ownProfile.js (avec son repli)
// a le droit d'en écrire. Le scan couvre les trois sortes de guillemets, `select()` sans argument, `select("*", {...})`,
// et les jointures `profiles(*)` / `alias:profiles!fk(*)` dans n'importe quelle requête.
const SELECT_ALL = /\.select\(\s*(?:["'`]\s*\*\s*["'`])?\s*(?:,[^)]*)?\)/;

async function sourceFiles() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const root = path.join(process.cwd(), "src");
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.(js|jsx)$/.test(e.name)) files.push(p);
    }
  })(root);
  return { fs, path, files };
}

describe("ownProfile — aucun select('*') direct sur profiles hors de ownProfile.js", () => {
  it("scanne src/ : toute requête from('profiles') liste ses colonnes ou passe par ownProfile.js", async () => {
    const { fs, path, files } = await sourceFiles();
    const offenders = [];
    for (const f of files) {
      if (f.endsWith(path.join("lib", "ownProfile.js"))) continue;
      const src = fs.readFileSync(f, "utf8");
      const re = /from\(\s*["'`]profiles["'`]\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const end = src.indexOf(";", m.index);
        const stmt = src.slice(m.index, end < 0 ? m.index + 400 : end);
        if (SELECT_ALL.test(stmt)) offenders.push(`${path.relative(process.cwd(), f)}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders, `select("*") / .select() direct sur profiles : utiliser src/lib/ownProfile.js — ${offenders.join(", ")}`).toEqual([]);
  });

  it("aucune jointure profiles(*) ni profiles!fk(*) (elle lirait les colonnes sensibles d'AUTRES comptes : 42501 sous 3B)", async () => {
    const { fs, path, files } = await sourceFiles();
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      const re = /profiles(?:![\w]+)?\s*\(\s*\*/g;
      let m;
      while ((m = re.exec(src))) offenders.push(`${path.relative(process.cwd(), f)}:${src.slice(0, m.index).split("\n").length}`);
    }
    expect(offenders).toEqual([]);
  });

  it("le détecteur reconnaît les contournements classiques", () => {
    for (const bad of ['.select("*")', ".select('*')", ".select(`*`)", ".select()", ".select( )", '.select("*", { count: "exact" })', '.select(\n"*"\n)']) {
      expect(SELECT_ALL.test(bad), bad).toBe(true);
    }
    for (const good of ['.select("id, name")', ".select(OTHER_PROFILE_COLUMNS)", '.select("id")']) expect(SELECT_ALL.test(good), good).toBe(false);
  });
});
