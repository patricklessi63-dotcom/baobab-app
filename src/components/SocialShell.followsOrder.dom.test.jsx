import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Même mock générique que SocialShell.searchOrder.dom.test.jsx (voir son
// en-tête pour le détail du pattern "builder thenable").
function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
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

// Bug corrigé à l'audit (même famille que SocialShell.searchOrder.dom.test.jsx
// et le commentaire ".order() ajouté" dans SocialShell.jsx, ~ligne 554) : les
// deux requêtes "follows" (abonnements/abonnés de l'onglet Profil)
// combinaient .limit(2000) avec AUCUN .order(). Sans ORDER BY, Postgres/
// PostgREST ne garantit ni quelles lignes remontent au-delà de la limite, ni
// leur ordre entre deux exécutions identiques — les listes "Abonnements"/
// "Abonnés" pouvaient donc changer d'ordre (voire de contenu au-delà de 2000
// lignes) d'un rechargement à l'autre, sans aucune action de l'utilisateur.
describe("SocialShell — listes Abonnements/Abonnés (requêtes \"follows\")", () => {
  it("trie explicitement les deux requêtes follows .eq(...).limit(2000)", async () => {
    render(<SocialShell currentUser={{ id: "u1", name: "Test" }} setView={vi.fn()} handleSignOut={vi.fn()} />);

    await waitFor(() => {
      const followsCalls = supabase.from.mock.calls
        .map((args, i) => ({ table: args[0], builder: supabase.from.mock.results[i].value }))
        .filter(({ table }) => table === "follows");
      expect(followsCalls.length).toBeGreaterThanOrEqual(2);
    });

    const followsBuilders = supabase.from.mock.calls
      .map((args, i) => ({ table: args[0], builder: supabase.from.mock.results[i].value }))
      .filter(({ table }) => table === "follows")
      .map(({ builder }) => builder);

    expect(followsBuilders.length).toBeGreaterThanOrEqual(2);
    followsBuilders.forEach((builder) => {
      expect(builder.order).toHaveBeenCalled();
    });
  });
});
