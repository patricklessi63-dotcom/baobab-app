import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit performance (6 oct. 2026) : à l'ouverture d'une communauté, tous les
// posts et tous les événements sont chargés (sans limit), puis les likes/
// commentaires (`.in("post_id", ids)`) et les statuts de participation
// (`.in("event_id", ids)`) étaient demandés en UNE requête GET dont l'URL
// (~38 caractères par uuid) dépasse la limite de la passerelle dès ~220 ids :
// erreur ignorée, compteurs/badges vides sans message. Ce test monte le VRAI
// CommunitiesTab avec 350 posts et 350 événements et vérifie le découpage en
// lots de 100 ids au plus ET la fusion des résultats.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

const N = 350;
const pad = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not", "delete"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeCommunityBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => Promise.resolve({ data: community, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [community], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

function makeMembersBuilder() {
  const builder = {};
  ["select", "eq", "order", "limit", "delete"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role: "member" }, error: null }));
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ id: "mem1", community_id: "c1", role: "member", profile_id: "u1" }], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

// Builder qui capture l'argument de `.in(col, ids)` et répond en fonction du lot.
function makeInBuilder(table, respond, spy) {
  const builder = {};
  ["select", "eq", "order", "limit", "is", "gte"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  let lot = null;
  builder.in = vi.fn((col, ids) => { spy(table, col, ids); lot = ids; return builder; });
  builder.then = (resolve, reject) => Promise.resolve(respond(lot)).then(resolve, reject);
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: mocks.rpcMock,
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

describe("CommunitiesTab — requêtes .in() découpées en lots (limite d'URL de la passerelle)", () => {
  let inSpy;
  let failEventLot;

  beforeEach(() => {
    vi.clearAllMocks();
    inSpy = vi.fn();
    failEventLot = false;
    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: null, created_by: "owner1",
      created_at: new Date().toISOString(),
    };
    const posts = Array.from({ length: N }, (_, i) => ({
      id: pad(i), community_id: "c1", author_id: "u2", content: `Post ${i}`, image_url: null,
      created_at: new Date(Date.now() - i * 1000).toISOString(), profiles: { name: "Auteur", avatar_url: null },
    }));
    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const events = Array.from({ length: N }, (_, i) => ({
      id: pad(1000 + i), community_id: "c1", visibility: "public", canceled_at: null, title: `Soirée ${i}`,
      category: "general", city: "", cover_url: null, max_participants: null, event_date: futureDate, event_participant_count: 0,
    }));
    const lastEventId = pad(1000 + N - 1);

    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder();
      if (table === "community_posts") return makeQueryBuilder({ data: posts, error: null });
      if (table === "community_post_likes") {
        return makeInBuilder(table, (lot) => ({ data: lot.map((id) => ({ post_id: id, profile_id: "u1", emoji: "like" })), error: null }), inSpy);
      }
      if (table === "community_comments") return makeInBuilder(table, (lot) => ({ data: lot.map((id) => ({ post_id: id })), error: null }), inSpy);
      if (table === "events") {
        // select("*, event_participant_count") = liste affichée ; select("id") =
        // nettoyage de handleLeave (événements 'community' futurs).
        const b = makeQueryBuilder();
        let ids = false;
        b.select = vi.fn((cols) => { ids = !String(cols).includes("event_participant_count"); return b; });
        b.then = (resolve, reject) => Promise.resolve({ data: ids ? events.map((e) => ({ id: e.id })) : events, error: null }).then(resolve, reject);
        return b;
      }
      if (table === "event_invitations") return makeInBuilder(table, () => ({ data: [], error: null }), inSpy);
      if (table === "event_attendees") {
        // Seul le DERNIER événement (dans le dernier lot) a un statut.
        const b = makeInBuilder(table, (lot) => {
          if (failEventLot && lot.includes(pad(1000))) return { data: null, error: { message: "414 URI Too Long" } };
          return { data: lot.includes(lastEventId) ? [{ event_id: lastEventId, status: "going" }] : [], error: null };
        }, inSpy);
        b.delete = vi.fn(() => makeInBuilder("event_attendees_delete", () => ({ error: null }), inSpy));
        return b;
      }
      return makeQueryBuilder();
    });
    mocks.rpcMock.mockResolvedValue({ data: null, error: null });
  });

  const callsFor = (table) => inSpy.mock.calls.filter((c) => c[0] === table).map((c) => c[2]);

  it("350 posts : likes et commentaires demandés par lots de 100 ids au plus, tous les ids couverts", async () => {
    render(<CommunitiesTab currentUser={{ id: "u1", name: "Membre" }} onError={vi.fn()} initialCommunityId="c1" />);
    await waitFor(() => expect(callsFor("community_post_likes").flat()).toHaveLength(N));
    await waitFor(() => expect(callsFor("community_comments").flat()).toHaveLength(N));
    for (const table of ["community_post_likes", "community_comments"]) {
      const calls = callsFor(table);
      expect(calls.length).toBeGreaterThanOrEqual(4);
      expect(calls.every((ids) => ids.length <= 100)).toBe(true);
      expect(new Set(calls.flat()).size).toBe(N);
    }
  });

  it("350 événements : statuts de participation par lots de 100 ids au plus, résultats fusionnés", async () => {
    const user = userEvent.setup();
    render(<CommunitiesTab currentUser={{ id: "u1", name: "Membre" }} onError={vi.fn()} initialCommunityId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Événements" }));
    // Le statut du dernier événement (dernier lot) n'apparaît que si les lots sont fusionnés.
    await screen.findByText("Tu participes ✓", {}, { timeout: 20000 });
    const calls = callsFor("event_attendees");
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.every((ids) => ids.length <= 100)).toBe(true);
    expect(new Set(calls.flat()).size).toBe(N);
  }, 30000);

  it("quitter une communauté de 350 événements : invitations et participations nettoyées par lots de 100 ids", async () => {
    const user = userEvent.setup();
    render(<CommunitiesTab currentUser={{ id: "u1", name: "Membre" }} onError={vi.fn()} initialCommunityId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Événements" }));
    await screen.findByText("Tu participes ✓", {}, { timeout: 20000 });
    await user.click(screen.getByRole("button", { name: "Quitter la communauté" }));
    await user.click(await screen.findByRole("button", { name: "Quitter" }));
    await waitFor(() => expect(callsFor("event_attendees_delete").flat()).toHaveLength(N));
    for (const table of ["event_invitations", "event_attendees_delete"]) {
      const calls = callsFor(table);
      expect(calls.length).toBeGreaterThanOrEqual(4);
      expect(calls.every((ids) => ids.length <= 100)).toBe(true);
      expect(new Set(calls.flat()).size).toBe(N);
    }
  }, 30000);

  it("un lot d'événements en erreur est toléré (comme avant) sans perdre les statuts des autres lots", async () => {
    failEventLot = true;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<CommunitiesTab currentUser={{ id: "u1", name: "Membre" }} onError={vi.fn()} initialCommunityId="c1" />);
    await user.click(await screen.findByRole("button", { name: "Événements" }));
    await screen.findByText("Tu participes ✓", {}, { timeout: 20000 });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  }, 30000);
});
