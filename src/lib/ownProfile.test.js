import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readOwnProfile, updateOwnProfile, insertOwnProfile, isPermissionDenied, isMissingRpc } from "./ownProfile";

// Faux client supabase : `mode` décrit l'état de la base.
//  - "avant"  : bloc 3B pas encore joué (select("*") et RETURNING * autorisés, get_my_profile peut exister ou non)
//  - "apres"  : bloc 3B joué (toute lecture de la table qui s'étend à `*` répond 42501)
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
    expect(localStorage.getItem("baobab:ownProfileViaRpc")).toBeNull();
  });
});

describe("ownProfile — après le bloc 3B (permission refusée sur select *)", () => {
  it("lecture : bascule sur get_my_profile et mémorise le choix ; la fois suivante, plus de requête refusée", async () => {
    const c = makeClient({ mode: "apres" });
    const r1 = await readOwnProfile(c, "u1");
    expect(r1.data.birth_date).toBe("1990-01-01");
    expect(c.calls).toEqual(["profiles.select(*)", "rpc.get_my_profile"]);
    expect(localStorage.getItem("baobab:ownProfileViaRpc")).toBe("1");
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
    expect(localStorage.getItem("baobab:ownProfileViaRpc")).toBeNull();
  });

  it("choix mémorisé mais RPC disparue : oublie le choix et revient aux requêtes directes", async () => {
    localStorage.setItem("baobab:ownProfileViaRpc", "1");
    const c = makeClient({ mode: "avant", rpcExists: false });
    const r = await readOwnProfile(c, "u1");
    expect(r.data.name).toBe("Alice");
    expect(c.calls).toEqual(["rpc.get_my_profile", "profiles.select(*)"]);
    expect(localStorage.getItem("baobab:ownProfileViaRpc")).toBeNull();
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

// Garde-fou de source : après le bloc 3B de supabase-close-read-leaks.sql, tout `select("*")` ou `.select()` (RETURNING *)
// direct sur `profiles` échoue en 42501. Seul src/lib/ownProfile.js (avec son repli) a le droit d'en écrire.
describe("ownProfile — aucun select('*') direct sur profiles hors de ownProfile.js", () => {
  it("scanne src/ : toute requête from('profiles') liste ses colonnes ou passe par ownProfile.js", async () => {
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
    const offenders = [];
    for (const f of files) {
      if (f.endsWith(path.join("lib", "ownProfile.js"))) continue;
      const src = fs.readFileSync(f, "utf8");
      const re = /from\(\s*["']profiles["']\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const end = src.indexOf(";", m.index);
        const stmt = src.slice(m.index, end < 0 ? m.index + 400 : end);
        if (/\.select\(\s*(?:""|"\*"|'\*'|'')?\s*\)/.test(stmt)) {
          offenders.push(`${path.relative(process.cwd(), f)}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(offenders, `select("*") / .select() direct sur profiles : utiliser src/lib/ownProfile.js — ${offenders.join(", ")}`).toEqual([]);
  });
});
