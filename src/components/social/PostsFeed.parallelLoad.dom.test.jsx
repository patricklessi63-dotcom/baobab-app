import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

// Audit performance (6 oct. 2026) : le fil lançait ses requêtes en cascade
// posts -> post_media -> (post_likes + post_comments), soit 3 allers-retours
// avant que l'écran d'accueil soit complet. Les compteurs ne dépendent que des
// ids de posts : ils doivent partir pendant que post_media est encore en vol.

function makeQueryBuilder(result) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

describe("PostsFeed — chargement de la première page", () => {
  it("les compteurs likes/commentaires partent sans attendre la réponse de post_media", async () => {
    vi.resetModules();
    const calls = [];
    let resolveMedia;
    const mediaPromise = new Promise((r) => { resolveMedia = r; });
    const posts = [
      { id: "p1", author_id: "u2", body: "a", created_at: "2024-01-01T12:00:00Z", profiles: { name: "A" } },
      { id: "p2", author_id: "u2", body: "b", created_at: "2024-01-01T11:00:00Z", profiles: { name: "A" } },
    ];
    vi.doMock("../../supabaseClient", () => ({
      supabase: {
        from: vi.fn((table) => {
          calls.push(table);
          if (table === "posts") return makeQueryBuilder({ data: posts, error: null });
          if (table === "post_media") {
            const b = makeQueryBuilder({ data: [], error: null });
            b.then = (resolve, reject) => mediaPromise.then(resolve, reject);
            return b;
          }
          return makeQueryBuilder({ data: [], error: null });
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

    // post_media est encore en attente : post_likes et post_comments doivent
    // DÉJÀ avoir été demandées.
    await waitFor(() => expect(calls).toContain("post_media"));
    await waitFor(() => {
      expect(calls).toContain("post_likes");
      expect(calls).toContain("post_comments");
    });

    await act(async () => { resolveMedia({ data: [], error: null }); });
  });
});
