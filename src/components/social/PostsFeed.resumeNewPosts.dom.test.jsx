import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, waitFor, screen } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

// Audit réseau (6 oct. 2026) : le bandeau « nouvelles publications » n'était
// recalculé qu'au retour de l'évènement `online`. Après une longue mise en veille
// du téléphone (websocket Realtime coupé, aucun évènement `online`), les
// publications créées entre-temps n'apparaissaient jamais tant que l'app n'était
// pas rechargée.

const server = { posts: [] };
let postReads = 0;

function makeQueryBuilder(getResult) {
  const builder = {};
  const ctx = { gt: null };
  builder.gt = vi.fn((col, value) => { ctx.gt = [col, value]; return builder; });
  ["select", "eq", "neq", "gte", "lt", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(getResult(ctx)).then(resolve, reject);
  return builder;
}

let now;
let visibility;
const setVisibility = (state) => { visibility = state; document.dispatchEvent(new Event("visibilitychange")); };

beforeEach(() => {
  vi.resetModules();
  server.posts = [{ id: "p1", author_id: "u2", body: "a", created_at: "2024-01-01T12:00:00Z", profiles: { name: "A" } }];
  postReads = 0;
  now = Date.now();
  visibility = "visible";
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete document.visibilityState;
});

describe("PostsFeed — bandeau « nouvelles publications » après reprise", () => {
  it("une publication créée pendant la veille fait apparaître le bandeau au retour (sans évènement online)", async () => {
    vi.doMock("../../supabaseClient", () => ({
      supabase: {
        from: vi.fn((table) => {
          if (table === "posts") return makeQueryBuilder((ctx) => {
            postReads += 1;
            const rows = ctx.gt ? server.posts.filter((p) => p[ctx.gt[0]] > ctx.gt[1]) : server.posts;
            return { data: rows, error: null };
          });
          return makeQueryBuilder(() => ({ data: [], error: null }));
        }),
        channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
        removeChannel: vi.fn(),
        storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
      },
    }));
    const { default: PostsFeed } = await import("./PostsFeed");
    await act(async () => {
      render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={vi.fn()} />);
    });
    await waitFor(() => expect(postReads).toBeGreaterThan(0));
    expect(screen.queryByText(/nouvelle.? publication/)).toBeNull();

    // Pendant la veille : quelqu'un d'autre publie.
    server.posts = [
      { id: "p2", author_id: "u3", body: "neuf", created_at: "2024-01-01T13:00:00Z", profiles: { name: "B" } },
      ...server.posts,
    ];
    act(() => setVisibility("hidden"));
    now += 5 * 60_000;
    act(() => setVisibility("visible"));

    await screen.findByText(/1 nouvelle publication/);
  });
});
