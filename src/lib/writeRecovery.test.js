import { describe, it, expect } from "vitest";
import { insertWithRecovery, findRecentOwnDuplicate } from "./writeRecovery";

// Faux client : table "posts" en mémoire, lectures pilotables.
function makeClient({ rows = [], readsFail = false } = {}) {
  const table = [...rows];
  const state = { readsFail };
  const eqCols = [];
  return {
    table,
    state,
    eqCols,
    from() {
      return {
        select() {
          const filters = [];
          const b = {
            eq: (c, v) => { eqCols.push(c); filters.push((r) => r[c] === v); return b; },
            gt: (c, v) => { filters.push((r) => r[c] > v); return b; },
            order: () => b,
            limit: () => b,
            then: (resolve, reject) => Promise.resolve(
              state.readsFail
                ? { data: null, error: { message: "TypeError: Failed to fetch", code: "" } }
                : { data: table.filter((r) => filters.every((f) => f(r))), error: null }
            ).then(resolve, reject),
          };
          return b;
        },
      };
    },
  };
}

const NET = { message: "TypeError: Failed to fetch", code: "" };
const row = (id, body, ageMs = 1000) => ({ id, author_id: "me", body, created_at: new Date(Date.now() - ageMs).toISOString() });

describe("findRecentOwnDuplicate", () => {
  it("ignore les lignes déjà connues de l'écran et les lignes de plus d'une heure", async () => {
    const c = makeClient({ rows: [row("old", "salut", 2 * 3600_000), row("known", "salut"), row("fresh", "salut")] });
    const r = await findRecentOwnDuplicate(c, "posts", { author_id: "me", body: "salut" }, { knownIds: new Set(["known"]) });
    expect(r.row.id).toBe("fresh");
  });
  it("texte très long : jamais dans l'URL (filtre côté client), la ligne identique est retrouvée, pas une autre", async () => {
    const long = "😀".repeat(1000);
    const c = makeClient({ rows: [row("autre", "tout autre texte"), row("mienne", long)] });
    const r = await findRecentOwnDuplicate(c, "posts", { author_id: "me", body: long });
    expect(c.eqCols).toEqual(["author_id"]);
    expect(r.row.id).toBe("mienne");
  });
  it("texte court : filtré côté serveur", async () => {
    const c = makeClient({ rows: [row("a", "salut")] });
    await findRecentOwnDuplicate(c, "posts", { author_id: "me", body: "salut" });
    expect(c.eqCols).toEqual(["author_id", "body"]);
  });
  it("lecture impossible : error, jamais d'exception", async () => {
    const c = makeClient({ readsFail: true });
    const r = await findRecentOwnDuplicate(c, "posts", { body: "x" });
    expect(r.error).toBeTruthy();
    expect(r.row).toBeNull();
  });
});

describe("insertWithRecovery", () => {
  const filters = { author_id: "me", body: "salut" };
  it("succès direct", async () => {
    const c = makeClient();
    const r = await insertWithRecovery({ client: c, table: "posts", attempt: async () => ({ data: { id: "n" }, error: null }), filters });
    expect(r.data.id).toBe("n");
  });
  it("erreur sans code mais ligne créée : adoptée", async () => {
    const c = makeClient({ rows: [row("created", "salut")] });
    const r = await insertWithRecovery({ client: c, table: "posts", attempt: async () => ({ data: null, error: NET }), filters });
    expect(r.data.id).toBe("created");
    expect(r.adopted).toBe(true);
  });
  it("erreur sans code, lecture impossible : ambiguë", async () => {
    const c = makeClient({ readsFail: true });
    const r = await insertWithRecovery({ client: c, table: "posts", attempt: async () => ({ data: null, error: NET }), filters });
    expect(r).toMatchObject({ ambiguous: true });
  });
  it("erreur avec code (refus RLS, limite de débit) : jamais de recherche, échec franc", async () => {
    const c = makeClient({ readsFail: true });
    const r = await insertWithRecovery({ client: c, table: "posts", attempt: async () => ({ data: null, error: { code: "P0001", message: "x" } }), filters });
    expect(r).toMatchObject({ ambiguous: false });
  });
  it("retry : vérifie AVANT de réinsérer (aucune seconde insertion si la ligne existe)", async () => {
    const c = makeClient({ rows: [row("created", "salut")] });
    let attempts = 0;
    const r = await insertWithRecovery({ client: c, table: "posts", attempt: async () => { attempts += 1; return { data: { id: "dup" }, error: null }; }, filters, retry: true });
    expect(r.data.id).toBe("created");
    expect(attempts).toBe(0);
  });
  it("retry sans vérification possible : n'insère pas à l'aveugle", async () => {
    const c = makeClient({ readsFail: true });
    let attempts = 0;
    const r = await insertWithRecovery({ client: c, table: "posts", attempt: async () => { attempts += 1; return { data: { id: "dup" }, error: null }; }, filters, retry: true });
    expect(attempts).toBe(0);
    expect(r.ambiguous).toBe(true);
  });
});
