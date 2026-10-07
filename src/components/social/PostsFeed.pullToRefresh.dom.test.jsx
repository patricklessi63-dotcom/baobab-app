import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor, screen } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

// Tirer pour rafraîchir le fil : réutilise loadPosts(null) (rechargement de la
// première page) SANS repasser par l'état « Chargement… » qui ferait disparaître
// la liste affichée, et ne touche à rien si le geste est trop court.

const server = { posts: [] };
let postReads = 0;

function makeQueryBuilder(getResult) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lt", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(getResult()).then(resolve, reject);
  return builder;
}

function touch(type, y) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.touches = type === "touchend" ? [] : [{ clientX: 100, clientY: y }];
  act(() => { document.body.dispatchEvent(ev); });
}

beforeEach(() => {
  vi.resetModules();
  server.posts = [{ id: "p1", author_id: "u2", body: "premier", created_at: "2024-01-01T12:00:00Z", profiles: { name: "A" } }];
  postReads = 0;
});
afterEach(() => { vi.restoreAllMocks(); });

async function mountFeed(props = {}) {
  vi.doMock("../../supabaseClient", () => ({
    supabase: {
      from: vi.fn((table) => {
        if (table === "posts") return makeQueryBuilder(() => { postReads += 1; return { data: server.posts, error: null }; });
        return makeQueryBuilder(() => ({ data: [], error: null }));
      }),
      channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
      removeChannel: vi.fn(),
      storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
    },
  }));
  const { default: PostsFeed } = await import("./PostsFeed");
  await act(async () => {
    render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} {...props} />);
  });
  await screen.findByText("premier");
}

describe("PostsFeed — tirer pour rafraîchir", () => {
  it("un tirage de 70 px+ recharge la première page : la nouvelle publication apparaît, la liste ne disparaît pas pendant le rechargement", async () => {
    await mountFeed();
    const readsBefore = postReads;
    server.posts = [{ id: "p2", author_id: "u3", body: "neuf", created_at: "2024-01-01T13:00:00Z", profiles: { name: "B" } }, ...server.posts];

    touch("touchstart", 100);
    touch("touchmove", 200);
    touch("touchend");

    // Pas d'état « Chargement… » : l'ancienne liste reste affichée pendant la requête.
    expect(screen.queryByText("Chargement...")).toBeNull();
    expect(screen.getByText("premier")).toBeTruthy();
    await screen.findByText("neuf");
    expect(postReads).toBeGreaterThan(readsBefore);
  });

  it("un tirage trop court ne recharge rien", async () => {
    await mountFeed();
    const readsBefore = postReads;
    touch("touchstart", 100);
    touch("touchmove", 140);
    touch("touchend");
    await new Promise((r) => setTimeout(r, 50));
    expect(postReads).toBe(readsBefore);
  });

  it("fil d'un auteur (profil) : geste désactivé", async () => {
    await mountFeed({ authorId: "u2" });
    const readsBefore = postReads;
    touch("touchstart", 100);
    touch("touchmove", 220);
    touch("touchend");
    await new Promise((r) => setTimeout(r, 50));
    expect(postReads).toBe(readsBefore);
    expect(document.documentElement.style.overscrollBehaviorY).toBe("");
  });
});
