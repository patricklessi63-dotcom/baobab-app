import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

// Audit du 1er nov. 2026 — badge de non-lus de la liste des conversations.
// Le canal « conversations-preview » décrémentait le compteur à CHAQUE UPDATE de
// message passant à read_at renseigné, y compris quand l'autre personne lisait
// MES propres messages (accusé de lecture) : mon badge de messages non lus
// reçus baissait alors à tort (jusqu'à 0) alors que je n'avais rien lu.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), handlers: [] }));

const ME = "me-0000-4000-8000-000000000000";
const OTHER = "00000000-0000-4000-8000-000000000001";
const KEY = [ME, OTHER].sort().join("__");

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

// Un seul message NON LU reçu de l'autre personne.
const incoming = { id: 1, match_key: KEY, from_id: OTHER, kind: "text", text: "salut", media_path: null, media_meta: null, created_at: new Date().toISOString(), read_at: null, deleted_at: null, deleted_for: [] };
function makeMessagesBuilder() {
  const builder = {};
  ["select", "order", "range", "eq", "is", "neq", "gt", "gte", "lte", "or", "not", "in", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => Promise.resolve({ data: [incoming], error: null }).then(resolve, reject);
  return builder;
}

vi.mock("./../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    channel: vi.fn((name) => {
      const ch = {};
      ch.on = vi.fn((type, opts, cb) => { mocks.handlers.push({ name, event: opts?.event, table: opts?.table, cb }); return ch; });
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

const updateHandler = () => mocks.handlers.find((h) => h.name.startsWith("conversations-preview") && h.event === "UPDATE");

function renderShell() {
  return render(<SocialShell currentUser={{ id: ME, name: "Moi" }} setView={vi.fn()} handleSignOut={vi.fn()} getMatches={() => [{ id: OTHER, name: "Awa" }]} />);
}

describe("SocialShell — badge de non-lus et accusés de lecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handlers.length = 0;
    mocks.fromMock.mockImplementation((table) => (table === "messages" ? makeMessagesBuilder() : makeQueryBuilder()));
  });

  it("l'autre personne lit MON message : mon badge de messages reçus non lus ne baisse pas", async () => {
    renderShell();
    await screen.findByRole("button", { name: /Notifications \(1 non lus\)/ }, { timeout: 10000 });
    const mine = { id: 2, match_key: KEY, from_id: ME, kind: "text", text: "coucou", read_at: new Date().toISOString(), created_at: new Date().toISOString() };
    await act(async () => { updateHandler().cb({ new: mine, old: { id: 2 } }); });
    expect(screen.getByRole("button", { name: /Notifications \(1 non lus\)/ })).toBeInTheDocument();
  }, 30000);

  it("je lis un message reçu depuis un autre appareil : le badge baisse bien", async () => {
    renderShell();
    await screen.findByRole("button", { name: /Notifications \(1 non lus\)/ }, { timeout: 10000 });
    await act(async () => { updateHandler().cb({ new: { ...incoming, read_at: new Date().toISOString() }, old: { id: 1 } }); });
    expect(screen.queryByRole("button", { name: /Notifications \(1 non lus\)/ })).toBeNull();
  }, 30000);
});
