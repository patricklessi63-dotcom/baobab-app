import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Audit performance (6 oct. 2026) : l'aperçu des conversations de SocialShell
// (« conversations-preview ») demandait les derniers messages avec UN
// `.in("match_key", keys)`. Une clé de conversation pèse ~73 caractères dans
// l'URL : vers ~110 matches elle dépasse la limite de la passerelle, la requête
// est refusée, l'erreur seulement journalisée -> plus aucun aperçu ni badge de
// non-lus. Par ailleurs, le filtre Realtime `in` est limité à 100 valeurs :
// au-delà l'abonnement échoue. Ce test monte le VRAI SocialShell avec 350
// matches et vérifie (1) le découpage en lots (50 clés au plus) + la fusion
// (badge de non-lus total), (2) l'absence de filtre Realtime `in` > 100.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), onSpy: vi.fn() }));

const ME = "me-0000-4000-8000-000000000000";
const pad = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const keyOf = (id) => [ME, id].sort().join("__");

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

let previewLots = [];
let failFirstLot = false;

// Table "messages" : un message NON LU de l'autre personne par clé demandée.
function makeMessagesBuilder() {
  const builder = {};
  let lot = [];
  ["select", "order", "range", "eq", "is", "neq", "gt", "gte", "lte", "or", "not"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.in = vi.fn((col, keys) => { lot = keys; previewLots.push(keys); return builder; });
  builder.limit = vi.fn(() => builder);
  builder.then = (resolve, reject) => {
    if (failFirstLot && lot.includes(keyOf(pad(0)))) {
      return Promise.resolve({ data: null, error: { message: "414 URI Too Long" } }).then(resolve, reject);
    }
    const data = lot.map((k, i) => ({
      id: `${k}-m`, match_key: k, from_id: k.split("__").find((x) => x !== ME) || "x", kind: "text", text: "salut",
      media_path: null, media_meta: null, created_at: new Date(Date.now() - i * 1000).toISOString(),
      read_at: null, deleted_at: null, deleted_for: [],
    }));
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  };
  return builder;
}

vi.mock("./../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn((name) => {
      const ch = {};
      ch.on = vi.fn((type, opts) => { mocks.onSpy(name, opts); return ch; });
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

const makeMatches = (n) => Array.from({ length: n }, (_, i) => ({ id: pad(i), name: `Match ${i}` }));

function renderShell(n) {
  const matches = makeMatches(n);
  return render(
    <SocialShell currentUser={{ id: ME, name: "Moi" }} setView={vi.fn()} handleSignOut={vi.fn()} getMatches={() => matches} />
  );
}

const previewChannelFilters = () =>
  mocks.onSpy.mock.calls.filter(([name]) => String(name).startsWith("conversations-preview")).map(([, opts]) => opts.filter);

describe("SocialShell — aperçu des conversations avec beaucoup de matches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewLots = [];
    failFirstLot = false;
    mocks.fromMock.mockImplementation((table) => (table === "messages" ? makeMessagesBuilder() : makeQueryBuilder()));
  });

  it("350 matches : requête d'aperçu découpée en lots de 50 clés au plus, non-lus fusionnés", async () => {
    renderShell(350);
    // 350 messages non lus (1 par conversation) : le total n'est exact que si tous les lots sont fusionnés.
    await screen.findByRole("button", { name: /Notifications \(350 non lus\)/ }, { timeout: 10000 });
    expect(previewLots.length).toBeGreaterThanOrEqual(7);
    expect(previewLots.every((keys) => keys.length <= 50)).toBe(true);
    expect(new Set(previewLots.flat()).size).toBe(350);
    // URL du pire lot : sous la limite prudente de 6 000 caractères.
    expect(Math.max(...previewLots.map((keys) => keys.join(",").length))).toBeLessThan(6000);
  }, 30000);

  it("un lot en échec ne fait pas perdre les non-lus des autres lots", async () => {
    failFirstLot = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderShell(350);
    await screen.findByRole("button", { name: /Notifications \(300 non lus\)/ }, { timeout: 10000 });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  }, 30000);

  it("canal Realtime conversations-preview : filtre `in` conservé à 100 clés, retiré au-delà (limite Realtime de 100 valeurs)", async () => {
    const { unmount } = renderShell(100);
    await waitFor(() => expect(previewChannelFilters().length).toBeGreaterThanOrEqual(2));
    const filters100 = previewChannelFilters();
    expect(filters100.every((f) => typeof f === "string" && f.startsWith("match_key=in.(") && f.slice(14, -1).split(",").length === 100)).toBe(true);
    unmount();

    mocks.onSpy.mockClear();
    renderShell(101);
    await waitFor(() => expect(mocks.onSpy.mock.calls.some(([name]) => String(name).startsWith("conversations-preview"))).toBe(true));
    expect(previewChannelFilters().every((f) => f === undefined)).toBe(true);
  }, 30000);
});
