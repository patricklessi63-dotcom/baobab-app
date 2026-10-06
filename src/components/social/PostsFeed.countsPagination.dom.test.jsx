import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({
  useImageLightbox: () => ({ openLightbox: vi.fn() }),
}));

// Plafond PostgREST (max_rows = 1000, troncature SILENCIEUSE) : un fil de 20
// posts dont un viral renvoie plus de 1000 likes/commentaires d'un coup. Sans
// pagination, le compteur plafonnait à 1000 et, si la ligne "mon like" tombait
// au-delà, le cœur s'affichait non aimé alors que le like existe en base. Ce
// faux client tronque comme le vrai et honore .range().

function makeQueryBuilder(rowsFor) {
  const st = { range: null };
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.range = vi.fn((from, to) => { st.range = [from, to]; return builder; });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => {
    const all = rowsFor();
    const rows = st.range ? all.slice(st.range[0], st.range[1] + 1) : all;
    return Promise.resolve({ data: rows.slice(0, 1000), error: null }).then(resolve, reject);
  };
  return builder;
}

describe("PostsFeed — compteurs likes/commentaires au-delà de 1000 lignes", () => {
  it("1300 likes (dont le mien, après la 1000e ligne) et 1100 commentaires sur un post : compteurs exacts et cœur actif", async () => {
    vi.resetModules();
    const post = { id: "p1", author_id: "u2", body: "viral", created_at: "2024-01-01T12:00:00Z", profiles: { name: "A" } };
    const likes = Array.from({ length: 1300 }, (_, i) => ({ post_id: "p1", profile_id: i === 1200 ? "u1" : `x-${i}` }));
    const comments = Array.from({ length: 1100 }, () => ({ post_id: "p1" }));
    vi.doMock("../../supabaseClient", () => ({
      supabase: {
        from: vi.fn((table) => {
          if (table === "posts") return makeQueryBuilder(() => [post]);
          if (table === "post_likes") return makeQueryBuilder(() => likes);
          if (table === "post_comments") return makeQueryBuilder(() => comments);
          return makeQueryBuilder(() => []);
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

    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer le like" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Retirer le like" }).textContent).toContain("1300");
    expect(screen.getByRole("button", { name: "Afficher les commentaires" }).textContent).toContain("1100");
  });
});
