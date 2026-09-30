import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Même mock générique que SocialShell.dom.test.jsx (voir son en-tête pour le
// détail) : un seul mock Supabase suffit ici puisque currentUser=null garde
// tous les autres effets réseau de SocialShell.jsx (chacun testé "if
// (!currentUser) return"), sauf la recherche globale du header (ligne
// ~1528), qui elle ne dépend que de `search`.
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

// Bug corrigé à l'audit de la recherche globale du header (croisement avec
// CommunitiesTab.jsx/EventsTab.jsx — voir leur commentaire "Tri secondaire"
// dans buildListQuery) : la requête réseau de secours de cette recherche
// (profils absents du cache local "profiles", plafonné à 500 lignes —
// voir le commentaire de localSearchResults dans SocialShell.jsx) combinait
// .or(...) et .limit(30) SANS aucun .order(). Sans ORDER BY, Postgres/
// PostgREST ne garantit ni quelles lignes remontent parmi toutes les
// correspondances, ni leur ordre entre deux exécutions identiques —
// retaper exactement la même recherche pouvait donc afficher un ordre (voire
// un sous-ensemble de 30 profils) différent d'une frappe à l'autre, sans
// action de l'utilisateur.
describe("SocialShell — recherche globale du header (requête réseau de secours)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("trie explicitement la requête profiles .or(...).limit(30)", async () => {
    vi.useFakeTimers();

    await act(async () => {
      render(<SocialShell currentUser={null} setView={vi.fn()} handleSignOut={vi.fn()} />);
    });

    const input = screen.getByPlaceholderText("Rechercher une personne, une ville, une discussion…");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Awa" } });
    });
    // Debounce de 300ms (voir le commentaire "marteler Supabase à chaque
    // frappe" dans SocialShell.jsx) avant le déclenchement réel de la requête.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const profilesSearchBuilder = supabase.from.mock.calls
      .map((args, i) => ({ table: args[0], builder: supabase.from.mock.results[i].value }))
      .filter(({ table }) => table === "profiles")
      .map(({ builder }) => builder)
      .find((builder) => builder.or.mock.calls.length > 0);

    expect(profilesSearchBuilder).toBeDefined();
    expect(profilesSearchBuilder.order).toHaveBeenCalled();
  });
});
