import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit (même motif que addStory()/SocialShell.jsx, commit
// 57ff5ea) : check_post_creation_rate_limit()
// (supabase-content-creation-limits-fix.sql, plafond 50 publications/24h)
// rejette l'insertion dans "posts" avec un message déjà propre en français
// ("Trop de publications creees recemment, reessaie plus tard", erreur
// Postgres P0001) — mais publish() (PostsFeed.jsx) l'ignorait et affichait
// toujours le même message générique fixe "Impossible de publier. Réessaie.",
// qui laissait croire à un problème passager et poussait à réessayer en
// boucle sans jamais apprendre la vraie raison.

function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

// Reproduit exactement la chaîne .insert(...).select(...).single() de
// publish() pour la table "posts", en rejetant avec la même forme d'erreur
// qu'un raise exception Postgres (code P0001 + message déjà en français).
function makePostsInsertBuilder() {
  const builder = makeQueryBuilder();
  builder.insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: "P0001", message: "Trop de publications creees recemment, reessaie plus tard" },
        })
      ),
    })),
  }));
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder()),
    channel: vi.fn(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import PostsFeed from "./PostsFeed";
import { supabase } from "../../supabaseClient";

beforeEach(() => {
  vi.clearAllMocks();
  supabase.from.mockImplementation((table) => (table === "posts" ? makePostsInsertBuilder() : makeQueryBuilder()));
});

describe("PostsFeed — publish() affiche le vrai message serveur en cas de rejet (limite de débit)", () => {
  it("affiche le message précis du trigger plutôt que le message générique 'Réessaie'", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    await act(async () => {
      render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={onError} />);
    });

    await user.click(await screen.findByText("Partage quelque chose avec la communauté..."));

    const textarea = await screen.findByPlaceholderText("Écris ton message...");
    await user.type(textarea, "Un nouveau post");
    await user.click(screen.getByRole("button", { name: "Publier" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError).toHaveBeenCalledWith("Trop de publications creees recemment, reessaie plus tard");
    expect(onError).not.toHaveBeenCalledWith("Impossible de publier. Réessaie.");
  });
});
