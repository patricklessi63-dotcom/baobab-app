import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

// Filtres du fil général : faux client qui enregistre les conditions posées sur la requête « posts ».
function makeFake({ follows = [], mediaPostIds = [], likes = [], comments = [] } = {}) {
  const calls = { posts: [], follows: 0, post_media: 0 };
  const posts = [
    { id: "p1", author_id: "u2", body: "Première", created_at: "2026-11-01T10:00:00Z", profiles: { name: "Awa" } },
    { id: "p2", author_id: "u3", body: "Deuxième", created_at: "2026-11-02T10:00:00Z", profiles: { name: "Zoe" } },
    { id: "p3", author_id: "u2", body: "Troisième", created_at: "2026-11-03T10:00:00Z", profiles: { name: "Awa" } },
  ];
  const builder = (table, rowsFor) => {
    const st = { range: null };
    const b = {};
    ["select", "eq", "neq", "lte", "gt", "is", "ilike", "match", "contains", "not", "order", "limit"].forEach((m) => { b[m] = vi.fn(() => b); });
    ["in", "or", "gte"].forEach((m) => { b[m] = vi.fn((...a) => { if (table === "posts") calls.posts.push([m, ...a]); return b; }); });
    b.range = vi.fn((f, t) => { st.range = [f, t]; return b; });
    b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    b.then = (res, rej) => {
      if (table === "follows") calls.follows += 1;
      if (table === "post_media") calls.post_media += 1;
      const all = rowsFor();
      return Promise.resolve({ data: st.range ? all.slice(st.range[0], st.range[1] + 1) : all, error: null }).then(res, rej);
    };
    return b;
  };
  const client = {
    from: vi.fn((table) => {
      if (table === "posts") return builder(table, () => posts);
      if (table === "follows") return builder(table, () => follows.map((id) => ({ to_id: id })));
      if (table === "post_media") return builder(table, () => mediaPostIds.map((id) => ({ post_id: id })));
      if (table === "post_likes") return builder(table, () => likes);
      if (table === "post_comments") return builder(table, () => comments);
      return builder(table, () => []);
    }),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  };
  return { client, calls };
}

async function mount(opts = {}, props = {}) {
  vi.resetModules();
  const fake = makeFake(opts);
  vi.doMock("../../supabaseClient", () => ({ supabase: fake.client }));
  const { default: PostsFeed } = await import("./PostsFeed");
  await act(async () => { render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} {...props} />); });
  return fake;
}
const order = () => [...document.querySelectorAll("p")].map((p) => p.textContent).filter((t) => ["Première", "Deuxième", "Troisième"].includes(t));

describe("PostsFeed — filtres du fil", () => {
  beforeEach(() => { cleanup(); window.localStorage.clear(); });

  it("quatre onglets, « Tout » actif par défaut, aucune condition ajoutée à la requête", async () => {
    const { calls } = await mount();
    await screen.findByText("Première");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Tout", "Abonnements", "Populaires", "Photos et vidéos"]);
    expect(screen.getByRole("tab", { name: "Tout" })).toHaveAttribute("aria-selected", "true");
    expect(calls.posts).toEqual([]);
    expect(calls.follows).toBe(0);
  });

  it("Abonnements : ne charge que les auteurs suivis ; le choix est mémorisé", async () => {
    const { calls } = await mount({ follows: ["u2", "u9"] });
    await screen.findByText("Première");
    fireEvent.click(screen.getByRole("tab", { name: "Abonnements" }));
    await waitFor(() => expect(calls.posts).toContainEqual(["in", "author_id", ["u2", "u9"]]));
    expect(screen.getByRole("tab", { name: "Abonnements" })).toHaveAttribute("aria-selected", "true");
    expect(window.localStorage.getItem("bb.feedFilter")).toBe("following");
  });

  it("Abonnements sans aucun abonnement : message dédié, la requête des publications n'est pas lancée", async () => {
    const { calls } = await mount({ follows: [] });
    await screen.findByText("Première");
    const before = calls.posts.length;
    fireEvent.click(screen.getByRole("tab", { name: "Abonnements" }));
    expect(await screen.findByText("Aucune publication de tes abonnements.")).toBeInTheDocument();
    expect(screen.queryByText("Première")).not.toBeInTheDocument();
    expect(calls.posts.length).toBe(before);
  });

  it("Photos et vidéos : publications avec une ligne de média OU l'ancien champ media_url", async () => {
    const { calls } = await mount({ mediaPostIds: ["p2", "p3"] });
    await screen.findByText("Première");
    fireEvent.click(screen.getByRole("tab", { name: "Photos et vidéos" }));
    await waitFor(() => expect(calls.posts).toContainEqual(["or", "id.in.(p2,p3),media_url.not.is.null"]));
  });

  it("Populaires : semaine en cours, classées par réactions et commentaires, sans interaction écartées", async () => {
    const { calls } = await mount({
      likes: [{ post_id: "p1", profile_id: "x1" }, { post_id: "p1", profile_id: "x2" }],
      comments: [{ post_id: "p3" }, { post_id: "p3" }],
    });
    await screen.findByText("Première");
    fireEvent.click(screen.getByRole("tab", { name: "Populaires" }));
    await waitFor(() => expect(calls.posts.some((c) => c[0] === "gte" && c[1] === "created_at")).toBe(true));
    // p3 = 2 commentaires = 4 points ; p1 = 2 réactions = 2 points ; p2 = rien -> absent
    await waitFor(() => expect(order()).toEqual(["Troisième", "Première"]));
  });

  it("Populaires sans aucune interaction : message dédié", async () => {
    await mount();
    await screen.findByText("Première");
    fireEvent.click(screen.getByRole("tab", { name: "Populaires" }));
    expect(await screen.findByText("Rien de populaire cette semaine.")).toBeInTheDocument();
  });

  it("le dernier choix valide est relu au prochain affichage", async () => {
    window.localStorage.setItem("bb.feedFilter", "media");
    const { calls } = await mount({ mediaPostIds: ["p1"] });
    await waitFor(() => expect(calls.posts).toContainEqual(["or", "id.in.(p1),media_url.not.is.null"]));
    expect(screen.getByRole("tab", { name: "Photos et vidéos" })).toHaveAttribute("aria-selected", "true");
  });

  it("le fil d'un auteur (profil) n'a pas de filtres", async () => {
    window.localStorage.setItem("bb.feedFilter", "following");
    const { calls } = await mount({}, { authorId: "u2" });
    await screen.findByText("Première");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(calls.posts.some((c) => c[0] === "in")).toBe(false);
  });
});
