import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Apple 1.2 / Google Play UGC — communautés : bloquer l'auteur d'une
// publication (icône directe) et, après un signalement de publication,
// proposition de bloquer son auteur (mêmes gestionnaires que les profils).

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), inserts: [] }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }, table = "") {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "range", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  let ins = false;
  builder.insert = vi.fn((row) => { ins = true; mocks.inserts.push({ table, row }); return builder; });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(ins ? { data: null, error: null } : result).then(resolve, reject);
  return builder;
}
function makeCommunityBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => Promise.resolve({ data: community, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
  return builder;
}
function makeMembersBuilder(role) {
  const builder = {};
  ["select", "eq", "order", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role }, error: null }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [{ community_id: "c1", role }], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserts.length = 0;
  const community = { id: "c1", name: "Communauté Test", visibility: "public", category: "general", city: "", description: "", rules: "", cover_url: null, created_by: null };
  const post = { id: "p1", community_id: "c1", author_id: "author1", body: "Publication d'Auteur", created_at: new Date().toISOString(), profiles: { name: "Auteur" } };
  mocks.fromMock.mockImplementation((table) => {
    if (table === "communities") return makeCommunityBuilder(community);
    if (table === "community_members") return makeMembersBuilder("member");
    if (table === "community_posts") return makeQueryBuilder({ data: [post], error: null }, table);
    return makeQueryBuilder({ data: [], error: null, count: 0 }, table);
  });
});

function renderTab(onBlockProfile) {
  return render(<CommunitiesTab currentUser={{ id: "me", name: "Moi" }} onError={vi.fn()} initialCommunityId="c1" onBlockProfile={onBlockProfile} />);
}

describe("CommunitiesTab — blocage de l'auteur d'un contenu", () => {
  it("l'icône Bloquer d'une publication demande le blocage de son auteur", async () => {
    const onBlockProfile = vi.fn();
    renderTab(onBlockProfile);
    await screen.findByText("Publication d'Auteur");
    await userEvent.click(screen.getByRole("button", { name: "Bloquer l'auteur de la publication" }));
    expect(onBlockProfile).toHaveBeenCalledWith({ id: "author1", name: "Auteur" });
  });

  it("après le signalement d'une publication : confirmation puis proposition de bloquer l'auteur", async () => {
    const onBlockProfile = vi.fn();
    renderTab(onBlockProfile);
    await screen.findByText("Publication d'Auteur");
    await userEvent.click(screen.getByRole("button", { name: "Signaler la publication" }));
    await userEvent.click(await screen.findByRole("button", { name: "Spam" }));
    await userEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Signalement envoyé")).toBeInTheDocument();
    expect(mocks.inserts.find((i) => i.table === "community_reports").row).toMatchObject({ community_id: "c1", target_type: "post", target_id: "p1", from_id: "me", category: "spam" });
    expect(screen.getByText(/Veux-tu aussi bloquer Auteur/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bloquer" }));
    expect(onBlockProfile).toHaveBeenCalledWith({ id: "author1", name: "Auteur" });
  });
});
