import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Monte le VRAI CommunitiesTab : la propriétaire supprime définitivement sa communauté.
// Avant le correctif, la ligne "communities" partait (cascade sur community_posts) mais les
// médias des publications (community-media/<id>/) et la couverture
// (avatars/<user_id>/community-….jpg) restaient pour toujours dans le stockage.
// Vérifie l'ordre : listage AVANT le DELETE, retrait APRÈS le DELETE confirmé, aucun
// retrait si le DELETE échoue, et jamais la photo de profil.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), log: [], deleteResult: { error: null } }));

const COVER = "https://proj.supabase.co/storage/v1/object/public/avatars/u-owner/community-1700.jpg";

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "range", "is", "in", "ilike", "or", "match", "contains", "not", "delete"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

function makeCommunityBuilder(community) {
  const builder = {};
  ["select", "eq", "or", "ilike", "order", "limit", "range"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.single = vi.fn(() => Promise.resolve({ data: community, error: null }));
  builder.delete = vi.fn(() => ({
    eq: vi.fn((col, id) => {
      mocks.log.push(`delete:communities:${id}`);
      return Promise.resolve(mocks.deleteResult);
    }),
  }));
  builder.then = (resolve, reject) => Promise.resolve({ data: [], error: null, count: 0 }).then(resolve, reject);
  return builder;
}

function makeMembersBuilder(role) {
  const builder = {};
  ["select", "eq", "order", "limit", "range"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: { role }, error: null }));
  builder.then = (resolve, reject) =>
    Promise.resolve({ data: [{ community_id: "c1", role }], error: null, count: 1 }).then(resolve, reject);
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: {
      from: vi.fn((bucket) => ({
        list: vi.fn(async (prefix) => {
          mocks.log.push(`list:${bucket}:${prefix}`);
          return { data: bucket === "community-media" ? [{ id: "m", name: "photo.jpg" }] : [], error: null };
        }),
        remove: vi.fn(async (paths) => {
          mocks.log.push(`remove:${bucket}:${paths.join(",")}`);
          return { data: paths.map((name) => ({ name })), error: null };
        }),
        upload: vi.fn(),
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: "" } })),
        createSignedUrls: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
    },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

async function deleteAsOwner() {
  const user = userEvent.setup();
  const onError = vi.fn();
  render(<CommunitiesTab currentUser={{ id: "owner1", name: "Propriétaire" }} onError={onError} initialCommunityId="c1" blockedIds={new Set()} />);
  await user.click(await screen.findByRole("button", { name: /Supprimer la communauté/ }));
  await user.click(await screen.findByRole("button", { name: "Supprimer" }));
  return { onError };
}

describe("CommunitiesTab — supprimer une communauté retire aussi ses médias et sa couverture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.log.length = 0;
    mocks.deleteResult = { error: null };
    const community = {
      id: "c1", name: "Communauté Test", visibility: "public", category: "general",
      city: "", description: "", rules: "", cover_url: COVER, created_by: "owner1",
    };
    mocks.fromMock.mockImplementation((table) => {
      if (table === "communities") return makeCommunityBuilder(community);
      if (table === "community_members") return makeMembersBuilder("owner");
      return makeQueryBuilder();
    });
  });

  it("liste avant le DELETE, retire médias et couverture après", async () => {
    await deleteAsOwner();
    await waitFor(() => expect(mocks.log.filter((l) => l.startsWith("remove:"))).toHaveLength(2));
    const iList = mocks.log.indexOf("list:community-media:c1");
    const iDelete = mocks.log.indexOf("delete:communities:c1");
    expect(iList).toBeGreaterThanOrEqual(0);
    expect(iDelete).toBeGreaterThan(iList);
    expect(mocks.log.slice(iDelete + 1).filter((l) => l.startsWith("remove:"))).toEqual([
      "remove:community-media:c1/photo.jpg",
      "remove:avatars:u-owner/community-1700.jpg",
    ]);
  });

  it("si le DELETE échoue, aucun fichier n'est retiré", async () => {
    mocks.deleteResult = { error: { message: "refusé", code: "42501" } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { onError } = await deleteAsOwner();
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de supprimer cette communauté."));
    expect(mocks.log).toContain("delete:communities:c1");
    expect(mocks.log.some((l) => l.startsWith("remove:"))).toBe(false);
    err.mockRestore();
  });
});
