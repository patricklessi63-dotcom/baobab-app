import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit du composeur de statut (StoryComposerModal.jsx /
// addStory() dans SocialShell.jsx), angle création/validation/upload — jamais
// couvert par l'audit précédent (visualisation/expiration). Scénario concret :
// un utilisateur publie son 31e statut en moins de 24h. Le trigger serveur
// check_story_creation_rate_limit() (supabase-content-creation-limits-fix.sql,
// plafond 30/24h) rejette l'insertion avec un message déjà propre en français
// ("Trop de statuts crees recemment, reessaie plus tard", erreur Postgres
// P0001) — mais le catch de addStory() l'ignorait et affichait toujours le
// même message générique "Impossible de publier le statut. Réessaie.", que
// l'utilisateur ne pouvait qu'interpréter comme un problème réseau passager :
// il retentait aussitôt la même publication, qui échouait à l'identique sans
// jamais lui apprendre la vraie raison (déjà corrigé pour ce même motif côté
// CommunityCreateForm.jsx/le suivi des abonnements dans SocialShell.jsx via
// friendlyDbError — voir supabase-content-creation-limits-fix.sql pour les
// triggers équivalents communities/events/posts).

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

// Reproduit exactement la chaîne .insert(...).select().single() de addStory()
// pour la table "stories", en rejetant avec la même forme d'erreur qu'un
// raise exception Postgres (code P0001 + message déjà en français).
function makeStoriesInsertBuilder() {
  const builder = makeQueryBuilder();
  builder.insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() =>
        Promise.resolve({
          data: null,
          error: { code: "P0001", message: "Trop de statuts crees recemment, reessaie plus tard" },
        })
      ),
    })),
  }));
  return builder;
}

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder()),
    channel: vi.fn(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";
import { supabase } from "../supabaseClient";

beforeEach(() => {
  vi.clearAllMocks();
  supabase.from.mockImplementation((table) =>
    table === "stories" ? makeStoriesInsertBuilder() : makeQueryBuilder()
  );
});

describe("SocialShell — addStory() affiche le vrai message serveur en cas de rejet (limite de débit)", () => {
  it("affiche le message précis du trigger plutôt que le message générique 'Réessaie'", async () => {
    const user = userEvent.setup();
    const props = { currentUser: { id: "u1", name: "Moi" }, setView: vi.fn(), handleSignOut: vi.fn() };
    await act(async () => {
      render(<SocialShell {...props} />);
    });

    await user.click(screen.getByRole("button", { name: "Ton statut" }));

    const textarea = await screen.findByPlaceholderText("Une pensée, une bonne nouvelle, un moment de ta journée…");
    await user.type(textarea, "Un nouveau statut");
    await user.click(screen.getByRole("button", { name: "Aperçu" }));

    await user.click(await screen.findByRole("button", { name: "Publier" }));

    expect(await screen.findByText("Trop de statuts crees recemment, reessaie plus tard")).toBeInTheDocument();
    expect(screen.queryByText("Impossible de publier le statut. Réessaie.")).not.toBeInTheDocument();
  });
});
