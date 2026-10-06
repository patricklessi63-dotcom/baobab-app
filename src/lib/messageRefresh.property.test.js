import { describe, it, expect } from "vitest";
import * as ghost from "./messageGhost";
import { dropGhostTemps } from "./messageGhost";
import { sortMessagesChronologically } from "./messageOrdering";

// Test PAR PROPRIÉTÉ du rechargement de fond de la conversation
// (refreshMessages -> mergeRefreshedMessages, App.jsx) — audit du 6 oct. 2026.
//
// Un faux « serveur » (lignes à ids croissants, created_at avec égalités, mises à
// jour read_at / deleted_at / deleted_for) et un faux « client » (état affiché,
// écho Realtime INSERT/UPDATE perdu pendant une coupure, accusés d'envoi
// optimiste, « Charger les précédents », rechargement de fond dont la réponse
// arrive APRÈS d'autres événements) sont pilotés par un générateur pseudo-
// aléatoire à graine fixe (aucune dépendance). Chaque scénario vérifie :
//   - à chaque application d'un rechargement : aucune ligne connue ne disparaît,
//     un changement déjà appliqué (suppression, lu) n'est jamais défait par un
//     instantané plus vieux, tout ce que l'instantané porte est reflété ;
//   - à la fin (rechargement sans événement en vol) : pas de doublon d'id, ordre
//     (created_at, id), uniquement la conversation, AUCUN TROU dans l'historique,
//     chaque ligne affichée identique à la ligne serveur (coches de lecture,
//     suppression), « Charger les précédents » proposé s'il reste de l'historique.

const KEY = "a__b";
const ME = "a";
const OTHER = "b";
const PAGE = 30;

// Compatibilité : exécuté tel quel sur l'ancienne implémentation (page seule).
const planRefresh = ghost.planRefresh || (({ pageSize }) => ({ since: null, limit: pageSize }));
const refreshHasMore = ghost.refreshHasMore || (({ serverCount, limit }) => serverCount >= limit);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoAt = (ms) => `${new Date(Date.UTC(2026, 9, 1) + ms).toISOString().slice(0, -1)}000+00:00`;
const cmp = (a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id - b.id);

function makeWorld(rand, { maxRows }) {
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const chance = (p) => rand() < p;
  const server = { rows: [], nextId: 1, clock: 0 };
  const client = { state: [], connected: true, hasMore: false, pendingAcks: [] };

  const serverInsert = (from) => {
    server.nextId += int(0, 3); // ids pris par d'autres conversations
    if (!chance(0.25)) server.clock += int(1, 5); // sinon created_at identique (égalité)
    const id = server.nextId++;
    const row = { id, match_key: KEY, from_id: from, kind: "text", text: `m${id}`, media_path: null, media_meta: null, reply_to_id: null, created_at: isoAt(server.clock), read_at: null, deleted_at: null, deleted_by: null, deleted_for: [] };
    server.rows.push(row);
    return { ...row };
  };
  const serverQuery = ({ since, limit }) =>
    server.rows
      .filter((r) => !since || r.created_at >= since.created_at)
      .sort((x, y) => cmp(y, x))
      .slice(0, limit)
      .map((r) => ({ ...r, deleted_for: [...r.deleted_for] }));

  const echoInsert = (row) => {
    if (!client.connected) return;
    client.state = client.state.some((m) => m.id === row.id) ? client.state : sortMessagesChronologically([...dropGhostTemps(client.state, row), row]);
  };
  const echoUpdate = (row) => {
    if (!client.connected) return;
    client.state = client.state.map((m) => (m.id === row.id ? { ...m, ...row, deleted_for: [...row.deleted_for] } : m));
  };

  const events = {
    otherInsert() { const row = serverInsert(OTHER); echoInsert(row); },
    send() {
      const row = serverInsert(ME);
      const tempId = `temp-${row.id}`;
      client.state = [...client.state, { id: tempId, match_key: KEY, from_id: ME, kind: "text", text: row.text, created_at: row.created_at, read_at: null, _status: "sending" }];
      client.pendingAcks.push({ tempId, row });
      if (chance(0.5)) echoInsert(row);
    },
    ack() {
      const a = client.pendingAcks.shift();
      if (!a) return;
      const without = client.state.filter((m) => m.id !== a.row.id);
      client.state = without.some((m) => m.id === a.tempId)
        ? sortMessagesChronologically(without.map((m) => (m.id === a.tempId ? a.row : m)))
        : sortMessagesChronologically([...without, a.row]);
    },
    otherReads() {
      for (const r of server.rows) {
        if (r.from_id === ME && !r.read_at) { r.read_at = isoAt(server.clock + 1); echoUpdate(r); }
      }
    },
    otherDeletes() {
      const mine = server.rows.filter((r) => r.from_id === OTHER && !r.deleted_at);
      if (mine.length === 0) return;
      const r = mine[int(0, mine.length - 1)];
      r.deleted_at = isoAt(server.clock + 2); r.deleted_by = OTHER; echoUpdate(r);
    },
    iDeleteForEveryone() {
      const mine = server.rows.filter((r) => r.from_id === ME && !r.deleted_at && client.state.some((m) => m.id === r.id));
      if (mine.length === 0) return;
      const r = mine[int(0, mine.length - 1)];
      // Mise à jour optimiste locale + écriture serveur ; l'écho arrive si connecté.
      client.state = client.state.map((m) => (m.id === r.id ? { ...m, deleted_at: isoAt(server.clock + 3), deleted_by: ME } : m));
      r.deleted_at = isoAt(server.clock + 3); r.deleted_by = ME;
    },
    iDeleteForMe() {
      const rows = server.rows.filter((r) => !r.deleted_for.includes(ME) && client.state.some((m) => m.id === r.id));
      if (rows.length === 0) return;
      const r = rows[int(0, rows.length - 1)];
      client.state = client.state.map((m) => (m.id === r.id ? { ...m, deleted_for: [...(m.deleted_for || []), ME] } : m));
      r.deleted_for = [...r.deleted_for, ME];
    },
    loadOlder() {
      const oldest = client.state[0];
      if (!oldest || typeof oldest.id !== "number") return;
      const rows = server.rows
        .filter((r) => r.created_at < oldest.created_at || (r.created_at === oldest.created_at && r.id < oldest.id))
        .sort((x, y) => cmp(y, x))
        .slice(0, PAGE)
        .reverse()
        .map((r) => ({ ...r, deleted_for: [...r.deleted_for] }));
      client.state = [...rows, ...client.state];
      client.hasMore = rows.length === PAGE;
    },
    toggleNetwork() { client.connected = !client.connected; },
    burst() { for (let i = 0, n = int(5, 45); i < n; i += 1) events.otherInsert(); },
  };
  const inFlightKinds = ["otherInsert", "send", "ack", "otherReads", "otherDeletes", "iDeleteForEveryone", "iDeleteForMe", "loadOlder", "burst"];

  // Rechargement de fond : l'instantané est pris maintenant, la réponse est
  // appliquée après `inFlight` événements.
  const refresh = ({ inFlight, check }) => {
    const plan = planRefresh({ current: client.state, key: KEY, pageSize: PAGE, maxRows });
    const snapshotDesc = serverQuery(plan);
    const snapshot = snapshotDesc.slice().reverse();
    for (let i = 0; i < inFlight; i += 1) events[inFlightKinds[int(0, inFlightKinds.length - 1)]]();
    const before = client.state;
    const out = ghost.mergeRefreshedMessages({ serverRows: snapshot, current: before, cachedFailed: [], key: KEY, since: plan.since, limit: plan.limit });
    client.state = out;
    client.hasMore = refreshHasMore({ since: plan.since, serverCount: snapshot.length, limit: plan.limit, previous: client.hasMore });
    check({ before, snapshot, out, plan });
  };

  return { server, client, events, int, chance, refresh, serverInsert };
}

const fail = (seed, msg, extra) => {
  throw new Error(`graine ${seed} : ${msg}${extra ? ` — ${JSON.stringify(extra)}` : ""}`);
};

// Invariants vérifiés à chaque application d'un rechargement (même avec des
// événements arrivés pendant la requête).
function checkStep(seed, { before, snapshot, out }, { capped }) {
  const real = out.filter((m) => typeof m.id === "number");
  const ids = out.map((m) => m.id);
  if (new Set(ids).size !== ids.length) fail(seed, "doublon d'id", ids);
  if (out.some((m) => m.match_key !== KEY)) fail(seed, "ligne d'une autre conversation");
  const byId = new Map(real.map((m) => [m.id, m]));
  if (!capped) {
    for (const m of before) {
      if (typeof m.id === "number" && m.match_key === KEY && !byId.has(m.id)) fail(seed, `ligne connue disparue (id ${m.id})`);
    }
  }
  const snapById = new Map(snapshot.map((r) => [r.id, r]));
  for (const row of real) {
    const local = before.find((m) => m.id === row.id);
    const snap = snapById.get(row.id);
    for (const f of ["read_at", "deleted_at"]) {
      if (((local && local[f]) || (snap && snap[f])) && !row[f]) fail(seed, `champ ${f} perdu sur l'id ${row.id}`, { local: local?.[f], snap: snap?.[f] });
    }
    for (const who of [...((local && local.deleted_for) || []), ...((snap && snap.deleted_for) || [])]) {
      if (!(row.deleted_for || []).includes(who)) fail(seed, `deleted_for perdu sur l'id ${row.id}`);
    }
  }
  for (const m of before) {
    if (typeof m.id === "string" && m.match_key === KEY && (m._status === "sending" || m._status === "uploading") && !byId.has(m.id) && !out.some((o) => o.id === m.id)) {
      fail(seed, `message optimiste en cours perdu (${m.id})`);
    }
  }
}

function checkFinal(seed, world, out, { capped }) {
  const { server, client } = world;
  const real = out.filter((m) => typeof m.id === "number");
  for (let i = 1; i < real.length; i += 1) {
    if (cmp(real[i - 1], real[i]) >= 0) fail(seed, "ordre (created_at, id) non respecté", [real[i - 1].id, real[i].id]);
  }
  const serverSorted = server.rows.slice().sort(cmp);
  if (real.length === 0) {
    if (!capped && serverSorted.length > 0 && !client.hasMore) fail(seed, "liste vide alors que le serveur a des messages et que rien n'est proposé");
    return;
  }
  const i0 = serverSorted.findIndex((r) => r.id === real[0].id);
  if (i0 === -1) fail(seed, "ligne affichée inconnue du serveur", real[0].id);
  const expected = serverSorted.slice(i0);
  if (expected.length !== real.length || expected.some((r, i) => r.id !== real[i].id)) {
    fail(seed, "TROU ou ligne en trop dans l'historique affiché", { attendu: expected.map((r) => r.id), affiche: real.map((r) => r.id) });
  }
  for (const row of real) {
    const srv = server.rows.find((r) => r.id === row.id);
    for (const f of ["read_at", "deleted_at", "deleted_by", "created_at", "text"]) {
      if (row[f] !== srv[f]) fail(seed, `ligne périmée : ${f} de l'id ${row.id}`, { affiche: row[f], serveur: srv[f] });
    }
    if (JSON.stringify(row.deleted_for) !== JSON.stringify(srv.deleted_for)) fail(seed, `ligne périmée : deleted_for de l'id ${row.id}`);
  }
  if (i0 > 0 && !client.hasMore) fail(seed, "historique plus ancien non proposé (« Charger les précédents » masqué)", { i0 });
  if (i0 === 0 && capped === false && client.hasMore && serverSorted.length < PAGE) fail(seed, "bouton proposé sans historique");
}

function runScenario(seed, { maxRows = ghost.REFRESH_MAX_ROWS || 500, steps = 40 } = {}) {
  const rand = mulberry32(seed);
  const world = makeWorld(rand, { maxRows });
  const { client, events, int, chance, refresh } = world;
  const capped = maxRows < 200; // le plafond peut alors légitimement tronquer l'historique
  const step = (arg) => checkStep(seed, arg, { capped });

  // Historique initial (0 à 120 messages), ouverture de la conversation.
  for (let i = 0, n = int(0, 120); i < n; i += 1) events[chance(0.5) ? "otherInsert" : "send"]();
  client.state = [];
  client.pendingAcks = [];
  if (chance(0.3)) client.state = [{ id: 9999, match_key: "autre__conv", created_at: isoAt(0), from_id: "z" }]; // ancienne conversation
  refresh({ inFlight: 0, check: step });
  for (let i = 0, n = int(0, 3); i < n; i += 1) events.loadOlder();

  for (let s = 0; s < steps; s += 1) {
    const r = rand();
    if (r < 0.25) events.toggleNetwork();
    else if (r < 0.6) refresh({ inFlight: int(0, 4), check: step });
    else events[["otherInsert", "send", "ack", "otherReads", "otherDeletes", "iDeleteForEveryone", "iDeleteForMe", "loadOlder", "burst"][int(0, 8)]]();
  }

  // Fin : réseau revenu, accusés reçus, un dernier rechargement sans événement en vol.
  client.connected = true;
  while (client.pendingAcks.length > 0) events.ack();
  client.state = client.state.filter((m) => m.match_key === KEY); // l'ancienne conversation a quitté l'écran
  refresh({ inFlight: 0, check: step });
  checkFinal(seed, world, client.state, { capped });
}

describe("rechargement de fond de la messagerie — propriétés sur scénarios générés (graine fixe)", () => {
  it("300 scénarios : aucun trou, aucune ligne périmée, aucun message perdu, aucune suppression/lecture défaite", () => {
    for (let seed = 1; seed <= 300; seed += 1) runScenario(seed);
  });

  it("plafond de relecture réduit : l'historique peut être tronqué mais jamais troué, et reste proposé", () => {
    for (let seed = 1000; seed < 1200; seed += 1) runScenario(seed, { maxRows: 40 });
  });

  it("la graine fixe rend les scénarios déterministes", () => {
    const run = () => {
      const world = makeWorld(mulberry32(7), { maxRows: 500 });
      for (let i = 0; i < 20; i += 1) world.events.otherInsert();
      return world.server.rows.map((r) => `${r.id}@${r.created_at}`).join("|");
    };
    expect(run()).toBe(run());
  });
});

describe("rechargement de fond — scénarios nommés", () => {
  it("jamais de doublon quand l'accusé d'un envoi et son écho se croisent avec un rechargement", () => {
    for (let seed = 2000; seed < 2100; seed += 1) {
      const rand = mulberry32(seed);
      const world = makeWorld(rand, { maxRows: 500 });
      for (let i = 0; i < 35; i += 1) world.events.otherInsert();
      world.refresh({ inFlight: 0, check: (arg) => checkStep(seed, arg, { capped: false }) });
      world.events.send();
      world.refresh({ inFlight: 2, check: (arg) => checkStep(seed, arg, { capped: false }) });
      while (world.client.pendingAcks.length > 0) world.events.ack();
      world.refresh({ inFlight: 0, check: (arg) => checkStep(seed, arg, { capped: false }) });
      const ids = world.client.state.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => typeof id === "number")).toBe(true);
    }
  });
  it("conversation vide, un seul message, exactement une page pleine", () => {
    for (const n of [0, 1, PAGE - 1, PAGE, PAGE + 1]) {
      const world = makeWorld(mulberry32(n + 1), { maxRows: 500 });
      for (let i = 0; i < n; i += 1) world.events.otherInsert();
      world.client.state = []; // ouverture de la conversation : rien d'affiché
      world.refresh({ inFlight: 0, check: (arg) => checkStep(n, arg, { capped: false }) });
      expect(world.client.state.filter((m) => typeof m.id === "number")).toHaveLength(Math.min(n, PAGE));
      expect(world.client.hasMore).toBe(n >= PAGE); // une page pleine laisse supposer de l'historique
      // second rechargement : rien ne bouge, rien ne se perd, le bouton reste proposé.
      world.refresh({ inFlight: 0, check: (arg) => checkStep(n, arg, { capped: false }) });
      expect(world.client.state.filter((m) => typeof m.id === "number")).toHaveLength(Math.min(n, PAGE));
      expect(world.client.hasMore).toBe(n >= PAGE);
    }
  });
});

describe("rechargement de fond — régressions nommées", () => {
  const check = (arg) => checkStep(0, arg, { capped: false });

  it("plus d'une page de nouveaux messages pendant une coupure : aucun TROU entre l'historique remonté et la fin de la conversation", () => {
    const world = makeWorld(mulberry32(11), { maxRows: 500 });
    for (let i = 0; i < 40; i += 1) world.events.otherInsert();
    world.client.state = [];
    world.refresh({ inFlight: 0, check }); // page des 30 derniers (ids 11 à 40)
    world.events.loadOlder(); // historique complet remonté à la main
    world.events.toggleNetwork(); // coupure : l'écho Realtime ne livre plus rien
    for (let i = 0; i < 50; i += 1) world.events.otherInsert();
    world.events.toggleNetwork();
    world.refresh({ inFlight: 0, check });
    checkFinal(0, world, world.client.state, { capped: false });
    expect(world.client.state).toHaveLength(90);
  });

  it("suppression « pour tous » et coche de lecture survenues pendant la coupure sur une ligne d'historique déjà remonté : reflétées après le rechargement", () => {
    const world = makeWorld(mulberry32(12), { maxRows: 500 });
    for (let i = 0; i < 40; i += 1) world.events[i % 2 ? "otherInsert" : "send"]();
    world.client.pendingAcks = [];
    world.client.state = [];
    world.refresh({ inFlight: 0, check });
    world.events.loadOlder();
    world.events.toggleNetwork();
    world.events.otherReads();
    world.events.otherDeletes();
    world.events.toggleNetwork();
    world.events.otherInsert();
    world.refresh({ inFlight: 0, check });
    checkFinal(0, world, world.client.state, { capped: false });
    expect(world.client.state.some((m) => m.deleted_at)).toBe(true);
    expect(world.client.state.filter((m) => m.from_id === ME).every((m) => m.read_at)).toBe(true);
  });

  it("une suppression appliquée (écho ou action locale) pendant que la requête est en vol n'est pas défaite par l'instantané plus ancien", () => {
    const world = makeWorld(mulberry32(13), { maxRows: 500 });
    for (let i = 0; i < 5; i += 1) world.events.send();
    world.client.pendingAcks = [];
    world.client.state = [];
    world.refresh({ inFlight: 0, check });
    const plan = planRefresh({ current: world.client.state, key: KEY, pageSize: PAGE, maxRows: 500 });
    const snapshot = world.server.rows.slice().map((r) => ({ ...r, deleted_for: [...r.deleted_for] }));
    // Pendant le vol : je supprime pour tous, l'autre lit, je masque pour moi.
    const target = world.client.state[2];
    world.client.state = world.client.state.map((m) => (m.id === target.id ? { ...m, deleted_at: "2026-10-01T00:00:09.000000+00:00", deleted_by: ME, read_at: "x", deleted_for: [ME] } : m));
    const out = ghost.mergeRefreshedMessages({ serverRows: snapshot, current: world.client.state, cachedFailed: [], key: KEY, since: plan.since, limit: plan.limit });
    const row = out.find((m) => m.id === target.id);
    expect(row.deleted_at).toBeTruthy();
    expect(row.read_at).toBe("x");
    expect(row.deleted_for).toEqual([ME]);
  });
});
