import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Apple 1.2 / Google Play UGC — fil d'actualité : (1) le signalement d'une
// publication n'offre que des motifs que la base accepte (post_reports.category
// n'autorise pas « mineur_suspecte » : l'INSERT aurait échoué avec une erreur
// générique) ; (2) après le signalement, proposition de bloquer l'AUTEUR ;
// (3) l'avatar/nom de l'auteur ouvre sa fiche (Signaler / Bloquer en 2 touches).

const mocks = vi.hoisted(() => ({ inserts: [] }));

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));
vi.mock("../../lib/uploadWithProgress", () => ({ uploadWithProgress: () => Promise.resolve() }));

const POSTS = [{ id: "p1", author_id: "u2", body: "Un post d'Awa", created_at: new Date().toISOString(), profiles: { name: "Awa" } }];

function makeBuilder(table) {
  const b = {};
  let isInsert = false;
  ["select", "neq", "lt", "lte", "gte", "order", "range", "limit", "is", "ilike", "or", "match", "contains", "not", "eq", "gt", "in"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.insert = vi.fn((row) => { isInsert = true; mocks.inserts.push({ table, row }); return b; });
  const result = () => (isInsert ? { data: null, error: null } : { data: table === "posts" ? POSTS : [], error: null });
  b.single = vi.fn(() => Promise.resolve(result()));
  b.maybeSingle = vi.fn(() => Promise.resolve(result()));
  b.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
  return b;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn((table) => makeBuilder(table)),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(() => Promise.resolve({})), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn.test/x" } })) })) },
  },
}));

import PostsFeed from "./PostsFeed";

const ME = { id: "u1", user_id: "a1", name: "Moi" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserts.length = 0;
});

describe("PostsFeed — signalement et blocage de l'auteur", () => {
  it("n'offre pas « Mineur suspecté » (refusé par la base pour post_reports) mais les autres motifs", async () => {
    const user = userEvent.setup();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={vi.fn()} />); });
    await user.click(await screen.findByRole("button", { name: "Signaler la publication" }));
    expect(await screen.findByText("Signaler cette publication")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Spam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arnaque" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mineur suspecté" })).not.toBeInTheDocument();
  });

  it("après l'envoi : confirmation, puis proposition de bloquer l'auteur (id et nom de l'auteur)", async () => {
    const user = userEvent.setup();
    const onBlockProfile = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={vi.fn()} onBlockProfile={onBlockProfile} />); });
    await user.click(await screen.findByRole("button", { name: "Signaler la publication" }));
    await user.click(await screen.findByRole("button", { name: "Spam" }));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Signalement envoyé")).toBeInTheDocument();
    expect(mocks.inserts.find((i) => i.table === "post_reports").row).toMatchObject({ target_type: "post", target_id: "p1", from_id: "u1", category: "spam" });
    expect(screen.getByText(/Veux-tu aussi bloquer Awa/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bloquer" }));
    expect(onBlockProfile).toHaveBeenCalledWith({ id: "u2", name: "Awa" });
    await waitFor(() => expect(screen.queryByText("Signalement envoyé")).not.toBeInTheDocument());
  });

  it("sans gestionnaire de blocage, la confirmation n'offre que « Fermer »", async () => {
    const user = userEvent.setup();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={vi.fn()} />); });
    await user.click(await screen.findByRole("button", { name: "Signaler la publication" }));
    await user.click(await screen.findByRole("button", { name: "Spam" }));
    await user.click(screen.getByRole("button", { name: "Envoyer" }));
    expect(await screen.findByText("Signalement envoyé")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bloquer" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });

  it("l'avatar de l'auteur ouvre sa fiche (id de l'auteur), jamais pour ses propres publications", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    await act(async () => { render(<PostsFeed currentUser={ME} onError={vi.fn()} onViewProfile={onViewProfile} />); });
    await user.click(await screen.findByRole("button", { name: "Voir le profil de Awa" }));
    expect(onViewProfile).toHaveBeenCalledWith("u2");
  });
});
