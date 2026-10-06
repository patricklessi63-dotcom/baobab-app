import { describe, it, expect } from "vitest";
import {
  maxRealMessageId,
  isGhostOf,
  insertMessageWithRecovery,
  dropGhostTemps,
  mergeRefreshedMessages,
  fetchGhostCandidates,
  planRefresh,
  refreshHasMore,
  REFRESH_MAX_ROWS,
} from "./messageGhost";

// Faux client Supabase avec une « table messages » en mémoire. `insertMode`
// pilote ce que devient le prochain INSERT :
//  - "ok"            : persisté, réponse reçue ;
//  - "lost-response" : persisté, mais la réponse est perdue (coupure en plein
//                      vol) -> { error: { message: "TypeError: Failed to fetch", code: "" } } ;
//  - "never-sent"    : coupure avant que la requête n'atteigne le serveur, rien de persisté ;
//  - "rls"           : refus définitif (code 42501).
// `readsFail` : les SELECT échouent aussi (réseau toujours coupé).
function makeClient({ rows = [], insertMode = "ok", readsFail = false } = {}) {
  const table = [...rows];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;
  const calls = { inserts: 0, selects: 0, eq: [] };
  const netErr = { message: "TypeError: Failed to fetch", code: "" };
  const state = { insertMode, readsFail };
  const client = {
    table,
    calls,
    state,
    from() {
      return {
        insert(row) {
          calls.inserts += 1;
          const persist = () => {
            const saved = { id: nextId++, created_at: new Date().toISOString(), ...row };
            table.push(saved);
            return saved;
          };
          let result;
          if (state.insertMode === "ok") result = { data: persist(), error: null };
          else if (state.insertMode === "lost-response") { persist(); result = { data: null, error: netErr }; }
          else if (state.insertMode === "never-sent") result = { data: null, error: netErr };
          else result = { data: null, error: { message: "permission denied", code: "42501" } };
          return { select: () => ({ single: () => Promise.resolve(result) }) };
        },
        select() {
          const filters = [];
          const b = {
            eq: (c, v) => { calls.eq.push(c); filters.push((r) => r[c] === v); return b; },
            gt: (c, v) => { filters.push((r) => r[c] > v); return b; },
            order: () => b,
            limit: () => b,
            then: (resolve, reject) => {
              calls.selects += 1;
              const res = state.readsFail
                ? { data: null, error: netErr }
                : { data: table.filter((r) => filters.every((f) => f(r))), error: null };
              return Promise.resolve(res).then(resolve, reject);
            },
          };
          return b;
        },
      };
    },
  };
  return client;
}

const ME = "me";
const KEY = "me__you";
const textRow = (text, extra = {}) => ({ match_key: KEY, from_id: ME, kind: "text", text, media_path: null, media_meta: null, reply_to_id: null, ...extra });

describe("insertMessageWithRecovery — réponse perdue pendant l'envoi", () => {
  it("INSERT normal : outcome sent, une seule ligne", async () => {
    const c = makeClient();
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(r.outcome).toBe("sent");
    expect(c.table).toHaveLength(1);
  });

  it("texte très long (émojis) : le texte n'est PAS mis dans l'URL de la vérification, le fantôme est tout de même retrouvé", async () => {
    const long = "😀".repeat(1000); // ~12 000 caractères d'URL une fois encodé
    const c = makeClient({ insertMode: "lost-response" });
    const r = await insertMessageWithRecovery(c, textRow(long), { afterId: 0 });
    expect(c.calls.eq).not.toContain("text");
    expect(r.outcome).toBe("adopted");
    expect(c.table).toHaveLength(1);
  });

  it("texte courant : filtré côté serveur (une seule ligne candidate)", async () => {
    const c = makeClient({ insertMode: "lost-response" });
    await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(c.calls.eq).toContain("text");
  });

  it("réponse perdue mais message bien enregistré : adopté, PAS marqué en échec, pas de doublon", async () => {
    const c = makeClient({ insertMode: "lost-response" });
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(r.outcome).toBe("adopted");
    expect(r.data.text).toBe("salut");
    expect(c.table).toHaveLength(1);
  });

  it("requête jamais partie, réseau revenu : échec définitif (ambiguous=false) -> le média pourra être supprimé", async () => {
    const c = makeClient({ insertMode: "never-sent" });
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(r).toMatchObject({ outcome: "failed", ambiguous: false });
    expect(c.table).toHaveLength(0);
  });

  it("réseau toujours coupé (lecture impossible) : échec AMBIGU, aucune seconde insertion", async () => {
    const c = makeClient({ insertMode: "lost-response", readsFail: true });
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(r).toMatchObject({ outcome: "failed", ambiguous: true });
    expect(c.calls.inserts).toBe(1);
  });

  it("renvoi après échec ambigu dont l'INSERT avait abouti : adopte l'existant au lieu de dupliquer (renvoi auto au retour en ligne)", async () => {
    const c = makeClient({ insertMode: "lost-response", readsFail: true });
    await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(c.table).toHaveLength(1);
    // le réseau revient : renvoi automatique
    c.state.readsFail = false;
    c.state.insertMode = "ok";
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0, retry: true });
    expect(r.outcome).toBe("adopted");
    expect(c.calls.inserts).toBe(1);
    expect(c.table).toHaveLength(1);
  });

  it("renvoi après échec ambigu dont l'INSERT n'avait PAS abouti : insère normalement", async () => {
    const c = makeClient({ insertMode: "never-sent", readsFail: true });
    await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    c.state.readsFail = false;
    c.state.insertMode = "ok";
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0, retry: true });
    expect(r.outcome).toBe("sent");
    expect(c.table).toHaveLength(1);
  });

  it("renvoi alors que la vérification est impossible : n'insère PAS à l'aveugle", async () => {
    const c = makeClient({ insertMode: "ok", readsFail: true });
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0, retry: true });
    expect(r).toMatchObject({ outcome: "failed", ambiguous: true });
    expect(c.calls.inserts).toBe(0);
  });

  it("refus définitif (RLS 42501) : échec non ambigu, aucune recherche de fantôme", async () => {
    const c = makeClient({ insertMode: "rls" });
    const r = await insertMessageWithRecovery(c, textRow("salut"), { afterId: 0 });
    expect(r).toMatchObject({ outcome: "failed", ambiguous: false });
    expect(c.calls.selects).toBe(0);
  });

  it("un ancien message IDENTIQUE (id <= afterId) n'est jamais pris pour le fantôme", async () => {
    const old = { id: 5, created_at: "x", ...textRow("ok") };
    const c = makeClient({ rows: [old], insertMode: "never-sent" });
    const r = await insertMessageWithRecovery(c, textRow("ok"), { afterId: 5 });
    expect(r).toMatchObject({ outcome: "failed", ambiguous: false });
  });

  it("sans repère afterId : aucune détection (jamais d'adoption d'un ancien message)", async () => {
    const old = { id: 5, created_at: "x", ...textRow("ok") };
    const c = makeClient({ rows: [old], insertMode: "never-sent" });
    const r = await insertMessageWithRecovery(c, textRow("ok"));
    expect(r).toMatchObject({ outcome: "failed", ambiguous: true });
  });

  it("média : le fantôme est retrouvé par son media_path exact", async () => {
    const row = textRow(null, { kind: "image", media_path: "me__you/1.jpg", media_meta: { mime: "image/jpeg", size: 10 } });
    const c = makeClient({ insertMode: "lost-response" });
    const r = await insertMessageWithRecovery(c, row, { afterId: 0 });
    expect(r.outcome).toBe("adopted");
    expect(r.data.media_path).toBe("me__you/1.jpg");
  });
});

describe("isGhostOf", () => {
  it("compare media_meta indépendamment de l'ordre des clés (jsonb réordonne)", () => {
    const temp = { match_key: KEY, from_id: ME, kind: "sticker", text: null, media_meta: { emoji: "x", caption: null, gradient: ["a", "b"] }, reply_to_id: null };
    const row = { id: 9, match_key: KEY, from_id: ME, kind: "sticker", text: null, media_meta: { gradient: ["a", "b"], caption: null, emoji: "x" }, reply_to_id: null };
    expect(isGhostOf(temp, row, 3)).toBe(true);
  });
  it("rejette un autre expéditeur, un autre texte, une autre réponse", () => {
    const temp = { match_key: KEY, from_id: ME, kind: "text", text: "a", media_meta: null, reply_to_id: null };
    const base = { id: 9, match_key: KEY, from_id: ME, kind: "text", text: "a", media_meta: null, reply_to_id: null };
    expect(isGhostOf(temp, base, 3)).toBe(true);
    expect(isGhostOf(temp, { ...base, from_id: "you" }, 3)).toBe(false);
    expect(isGhostOf(temp, { ...base, text: "b" }, 3)).toBe(false);
    expect(isGhostOf(temp, { ...base, reply_to_id: 2 }, 3)).toBe(false);
  });
});

describe("maxRealMessageId", () => {
  it("ignore les ids optimistes (texte)", () => {
    expect(maxRealMessageId([{ id: 3 }, { id: "temp-1" }, { id: 12 }])).toBe(12);
    expect(maxRealMessageId([])).toBe(0);
  });
});

describe("dropGhostTemps — écho Realtime du vrai message", () => {
  const failedTemp = { id: "temp-1", match_key: KEY, from_id: ME, kind: "text", text: "salut", media_meta: null, reply_to_id: null, _status: "failed", _maybeSent: true, _afterId: 4 };
  const echo = { id: 7, match_key: KEY, from_id: ME, kind: "text", text: "salut", media_meta: null, reply_to_id: null };

  it("retire la bulle d'échec incertain quand son écho arrive", () => {
    expect(dropGhostTemps([{ id: 4 }, failedTemp], echo)).toEqual([{ id: 4 }]);
  });
  it("garde un échec DÉFINITIF (non incertain) : l'écho ne peut pas en être le fantôme", () => {
    const definitive = { ...failedTemp, _maybeSent: false };
    expect(dropGhostTemps([definitive], echo)).toEqual([definitive]);
  });
  it("ne retire qu'une seule bulle par écho", () => {
    const second = { ...failedTemp, id: "temp-2" };
    expect(dropGhostTemps([failedTemp, second], echo)).toEqual([second]);
  });
});

describe("mergeRefreshedMessages — rechargement de la conversation", () => {
  const server = [{ id: 1, match_key: KEY, from_id: "you", kind: "text", text: "yo" }];
  it("conserve un message en cours d'envoi/d'upload (n'est plus avalé par le rechargement)", () => {
    const sending = { id: "temp-a", match_key: KEY, _status: "sending" };
    const uploading = { id: "temp-b", match_key: KEY, _status: "uploading" };
    const otherConv = { id: "temp-c", match_key: "autre", _status: "sending" };
    const out = mergeRefreshedMessages({ serverRows: server, current: [sending, uploading, otherConv], cachedFailed: [], key: KEY });
    expect(out.map((m) => m.id)).toEqual([1, "temp-a", "temp-b"]);
  });
  it("retire un échec incertain dont le fantôme est en base, garde les autres échecs", () => {
    const ghostTemp = { id: "temp-g", match_key: KEY, from_id: ME, kind: "text", text: "salut", media_meta: null, reply_to_id: null, _status: "failed", _maybeSent: true, _afterId: 1 };
    const other = { id: "temp-h", match_key: KEY, from_id: ME, kind: "text", text: "autre", media_meta: null, reply_to_id: null, _status: "failed", _maybeSent: true, _afterId: 1 };
    const rows = [...server, { id: 2, match_key: KEY, from_id: ME, kind: "text", text: "salut", media_meta: null, reply_to_id: null }];
    const out = mergeRefreshedMessages({ serverRows: rows, current: [], cachedFailed: [ghostTemp, other], key: KEY });
    expect(out.map((m) => m.id)).toEqual([1, 2, "temp-h"]);
  });
  const t = (n) => `2026-10-0${n}T10:00:00.000000+00:00`;
  it("historique remonté à la main PENDANT la requête (plus ancien que la plage relue) : conservé, pas celui d'une autre conversation", () => {
    const page = [{ id: 10, match_key: KEY, created_at: t(5) }, { id: 11, match_key: KEY, created_at: t(6) }];
    const current = [
      { id: 3, match_key: KEY, created_at: t(2) },
      { id: 4, match_key: KEY, created_at: t(3) },
      { id: 10, match_key: KEY, created_at: t(5) },
      { id: 11, match_key: KEY, created_at: t(6) },
      { id: 2, match_key: "autre", created_at: t(1) },
    ];
    const out = mergeRefreshedMessages({ serverRows: page, current, cachedFailed: [], key: KEY, since: { created_at: t(5), id: 10 }, limit: 500 });
    expect(out.map((m) => m.id)).toEqual([3, 4, 10, 11]);
  });
  it("sans plan de relecture, ou réponse pleine (plage tronquée) : les lignes plus anciennes ne sont PAS recollées (risque de trou)", () => {
    const page = [{ id: 10, match_key: KEY, created_at: t(5) }, { id: 11, match_key: KEY, created_at: t(6) }];
    const current = [{ id: 3, match_key: KEY, created_at: t(2) }, ...page];
    expect(mergeRefreshedMessages({ serverRows: page, current, cachedFailed: [], key: KEY }).map((m) => m.id)).toEqual([10, 11]);
    expect(mergeRefreshedMessages({ serverRows: page, current, cachedFailed: [], key: KEY, since: { created_at: t(2), id: 3 }, limit: 2 }).map((m) => m.id)).toEqual([10, 11]);
  });
  it("un instantané plus ancien ne défait pas une suppression / une lecture déjà appliquées ; il apporte ce qu'il porte", () => {
    const snap = [
      { id: 10, match_key: KEY, created_at: t(5), read_at: null, deleted_at: null, deleted_for: [] },
      { id: 11, match_key: KEY, created_at: t(6), read_at: "r", deleted_at: "d", deleted_by: "x", deleted_for: ["x"] },
    ];
    const current = [
      { id: 10, match_key: KEY, created_at: t(5), read_at: "lu", deleted_at: "sup", deleted_by: ME, deleted_for: [ME] },
      { id: 11, match_key: KEY, created_at: t(6), read_at: null, deleted_at: null, deleted_for: [] },
    ];
    const [a, b] = mergeRefreshedMessages({ serverRows: snap, current, cachedFailed: [], key: KEY });
    expect(a).toMatchObject({ read_at: "lu", deleted_at: "sup", deleted_by: ME, deleted_for: [ME] });
    expect(b).toMatchObject({ read_at: "r", deleted_at: "d", deleted_by: "x", deleted_for: ["x"] });
  });
  it("un message en échec de l'état courant (pas encore dans le cache) survit au rechargement ; le cache d'un échec déjà résolu n'est PAS réinjecté", () => {
    const failed = { id: "temp-new", match_key: KEY, _status: "failed" };
    const stale = { id: "temp-old", match_key: KEY, _status: "failed" };
    const shown = { id: 10, match_key: KEY, created_at: t(5) };
    expect(mergeRefreshedMessages({ serverRows: [shown], current: [shown, failed], cachedFailed: [stale], key: KEY }).map((m) => m.id)).toEqual([10, "temp-new"]);
    // Conversation non affichée (réouverture) : le cache sert.
    expect(mergeRefreshedMessages({ serverRows: [shown], current: [], cachedFailed: [stale], key: KEY }).map((m) => m.id)).toEqual([10, "temp-old"]);
  });
  it("garde un message arrivé (écho/accusé) PENDANT la requête de rechargement, absent de son instantané", () => {
    const t = (n) => `2026-10-0${n}T10:00:00.000000+00:00`;
    const page = [{ id: 10, match_key: KEY, created_at: t(5) }];
    const current = [
      { id: 10, match_key: KEY, created_at: t(5) },
      { id: 11, match_key: KEY, created_at: t(6) },
      { id: 12, match_key: "autre", created_at: t(6) },
    ];
    const out = mergeRefreshedMessages({ serverRows: page, current, cachedFailed: [], key: KEY });
    expect(out.map((m) => m.id)).toEqual([10, 11]);
  });
  it("dédoublonne un échec présent à la fois dans l'état courant et le cache", () => {
    const failed = { id: "temp-f", match_key: KEY, _status: "failed" };
    const out = mergeRefreshedMessages({ serverRows: server, current: [failed], cachedFailed: [failed], key: KEY });
    expect(out.filter((m) => m.id === "temp-f")).toHaveLength(1);
  });
});

describe("planRefresh / refreshHasMore — plage relue par un rechargement de fond", () => {
  const t = (n) => `2026-10-0${n}T10:00:00.000000+00:00`;
  it("aucune ligne réelle affichée pour cette conversation : la dernière page ; sinon tout depuis la plus ancienne (plafonné)", () => {
    expect(planRefresh({ current: [], key: KEY, pageSize: 30 })).toEqual({ since: null, limit: 30 });
    expect(planRefresh({ current: [{ id: 5, match_key: "autre", created_at: t(1) }, { id: "temp-1", match_key: KEY, created_at: t(2) }], key: KEY, pageSize: 30 })).toEqual({ since: null, limit: 30 });
    const current = [{ id: 9, match_key: KEY, created_at: t(3) }, { id: 4, match_key: KEY, created_at: t(2) }, { id: 3, match_key: KEY, created_at: t(2) }, { id: 1, match_key: "autre", created_at: t(1) }];
    expect(planRefresh({ current, key: KEY, pageSize: 30 })).toEqual({ since: { created_at: t(2), id: 3 }, limit: REFRESH_MAX_ROWS });
    expect(planRefresh({ current, key: KEY, pageSize: 30, maxRows: 10 }).limit).toBe(30);
  });
  it("« Charger les précédents » : conservé après une relecture complète, proposé après une réponse pleine", () => {
    expect(refreshHasMore({ since: { id: 1 }, serverCount: 12, limit: 500, previous: false })).toBe(false);
    expect(refreshHasMore({ since: { id: 1 }, serverCount: 12, limit: 500, previous: true })).toBe(true);
    expect(refreshHasMore({ since: { id: 1 }, serverCount: 500, limit: 500, previous: false })).toBe(true);
    expect(refreshHasMore({ since: null, serverCount: 30, limit: 30, previous: false })).toBe(true);
    expect(refreshHasMore({ since: null, serverCount: 29, limit: 30, previous: true })).toBe(false);
  });
});

describe("planRefresh — égalité à la milliseconde", () => {
  it("deux lignes de la même milliseconde : `since` est la plus ancienne au sens de la colonne (microsecondes), sinon elle serait exclue de la plage relue", () => {
    const current = [
      { id: 4, match_key: KEY, created_at: "2026-10-05T10:00:00.123456+00:00" },
      { id: 5, match_key: KEY, created_at: "2026-10-05T10:00:00.123400+00:00" }, // id postérieur mais horodatage antérieur
    ];
    expect(planRefresh({ current, key: KEY, pageSize: 30 }).since).toEqual({ created_at: "2026-10-05T10:00:00.123400+00:00", id: 5 });
  });
});

// Sonde de doublon pour un texte très long (audit du 6 oct. 2026, 2e passe) :
// lecture BORNÉE et comparaison EXACTE côté client.
describe("fetchGhostCandidates / isGhostOf — texte très long (comparaison côté client)", () => {
  function spyClient(rows) {
    const log = { eq: [], gt: [], order: [], limit: null };
    const filters = [];
    const b = {
      eq: (c, v) => { log.eq.push([c, v]); filters.push((r) => r[c] === v); return b; },
      gt: (c, v) => { log.gt.push([c, v]); filters.push((r) => r[c] > v); return b; },
      order: (c, o) => { log.order.push([c, o]); return b; },
      limit: (n) => { log.limit = n; return b; },
      select: () => b,
      then: (resolve, reject) => {
        const asc = log.order.length === 0 || log.order[0][1]?.ascending !== false;
        const data = rows.filter((r) => filters.every((f) => f(r))).sort((x, y) => (asc ? x.id - y.id : y.id - x.id)).slice(0, log.limit ?? Infinity);
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return { log, client: { from: () => b } };
  }
  const LONG = "é".repeat(800) + " fin "; // > 1500 octets une fois encodé
  const row = { match_key: KEY, from_id: ME, kind: "text", text: LONG, media_path: null, media_meta: null, reply_to_id: null };

  it("lit au plus 50 lignes, croissantes après afterId, et ne met jamais le texte dans la requête ; le fantôme (premier après afterId) est trouvé parmi des centaines de messages de moi", async () => {
    const rows = [];
    for (let i = 1; i <= 300; i += 1) rows.push({ id: i, ...row, text: i === 11 ? LONG : `autre ${i}` });
    const { log, client } = spyClient(rows);
    const { rows: found, error } = await fetchGhostCandidates(client, row, 10);
    expect(error).toBeNull();
    expect(found).toHaveLength(50);
    expect(log.limit).toBe(50);
    expect(log.gt).toEqual([["id", 10]]);
    expect(log.eq.map(([c]) => c)).not.toContain("text");
    expect(found.find((r) => isGhostOf(row, r, 10))?.id).toBe(11);
  });

  it("comparaison EXACTE : espace en fin de texte, normalisation Unicode différente (NFC/NFD), autre auteur ou autre type => jamais adopté", () => {
    const base = { id: 5, ...row };
    expect(isGhostOf(row, base, 0)).toBe(true);
    expect(isGhostOf(row, { ...base, text: LONG + " " }, 0)).toBe(false);
    expect(isGhostOf(row, { ...base, text: LONG.replace(/é/g, "é") }, 0)).toBe(false);
    expect(isGhostOf({ ...row, text: "é" }, { ...base, text: "é" }, 0)).toBe(false);
    expect(isGhostOf(row, { ...base, from_id: "you" }, 0)).toBe(false);
    expect(isGhostOf(row, { ...base, kind: "sticker" }, 0)).toBe(false);
    expect(isGhostOf(row, { ...base, id: 4 }, 4)).toBe(false); // pas postérieur à afterId
  });

  it("un renvoi VOULU du même long texte plus tard n'est pas pris pour le fantôme d'un ancien envoi (id <= afterId)", async () => {
    const { client } = spyClient([{ id: 7, ...row }]);
    const { rows: found } = await fetchGhostCandidates(client, row, 7);
    expect(found).toEqual([]);
  });
});
