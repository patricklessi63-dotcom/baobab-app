import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Faille corrigée le 25 nov. 2026 (communityMedia.js) : le média d'une publication de communauté
// était servi par une URL signée de 5 ans enregistrée en base. L'écran doit afficher une URL
// fraîchement signée pour 24 h, jamais l'URL enregistrée.

const BASE = "https://p.supabase.co/storage/v1/object/sign/community-media";
const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), createSignedUrls: vi.fn() }));

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "range", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
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
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(), createSignedUrls: mocks.createSignedUrls })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

beforeEach(() => {
  vi.clearAllMocks();
  const community = { id: "c1", name: "Communauté privée", visibility: "private", category: "general", city: "", description: "", rules: "", cover_url: null, created_by: null };
  const post = {
    id: "p1", community_id: "c1", author_id: "author1", body: "Photo du pique-nique", created_at: new Date().toISOString(),
    media_url: `${BASE}/c1/photo.jpg?token=VIEUX-5-ANS`, media_kind: "image", profiles: { name: "Auteur" },
  };
  mocks.createSignedUrls.mockImplementation(async (paths, ttl) => ({
    data: paths.map((path) => ({ path, signedUrl: `${BASE}/${path}?token=FRAIS-${ttl}`, error: null })), error: null,
  }));
  mocks.fromMock.mockImplementation((table) => {
    if (table === "communities") return makeCommunityBuilder(community);
    if (table === "community_members") return makeMembersBuilder("member");
    if (table === "community_posts") return makeQueryBuilder({ data: [post], error: null });
    return makeQueryBuilder({ data: [], error: null, count: 0 });
  });
});

describe("CommunitiesTab — médias de publication re-signés", () => {
  it("affiche une URL signée pour 24 h, jamais le lien de 5 ans enregistré", async () => {
    const { container } = render(
      <ImageLightboxProvider>
        <CommunitiesTab currentUser={{ id: "me", name: "Moi" }} onError={vi.fn()} initialCommunityId="c1" />
      </ImageLightboxProvider>,
    );
    await screen.findByText("Photo du pique-nique");
    expect(mocks.createSignedUrls).toHaveBeenCalledWith(["c1/photo.jpg"], 86400);
    await waitFor(() => expect(container.querySelector('img[src*="FRAIS-86400"]')).not.toBeNull());
    expect(container.innerHTML).not.toContain("VIEUX-5-ANS");
  });
});
