import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Confidentialité par champ (PrivacyFieldsModal.jsx, show_city) — section
// "📍 Autour de toi" du Fil (FeedTab.jsx, sous-onglet "Local"), alimentée par
// nearbyMembers (SocialShell.jsx). Ce filtre comparait candidate.city à
// currentUser.city sans jamais consulter candidate.show_city : un profil
// ayant masqué sa ville n'affichait certes plus le texte de sa ville
// (ProfileCard le respecte déjà), mais sa seule présence dans cette section
// titrée "Membres de ta ville" révélait déjà qu'il habite la même ville que
// l'utilisateur — même famille de bug que matchesSearch() (recherche
// globale) et newArrivals/show_canada_journey ("Nouveaux au Canada"), déjà
// corrigés dans ce même fichier.

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

vi.mock("./../supabaseClient", () => ({
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

describe("SocialShell — section « Autour de toi » exclut une ville masquée", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("un candidat ayant masqué sa ville (show_city:false) n'apparaît pas dans « Autour de toi », même s'il vit dans la même ville", async () => {
    const currentUser = { id: "u1", name: "Moi", city: "Montréal" };
    const candidates = [
      { id: "visible1", name: "VilleVisible", city: "Montréal", show_city: true, looking_for: "" },
      { id: "hidden1", name: "VilleMasquee", city: "Montréal", show_city: false, looking_for: "" },
    ];

    render(
      <SocialShell
        currentUser={currentUser}
        setView={vi.fn()}
        handleSignOut={vi.fn()}
        candidates={candidates}
      />
    );

    const user = userEvent.setup();
    const localTab = await screen.findByRole("tab", { name: "Local" });
    await user.click(localTab);

    await waitFor(() => expect(screen.getByText("VilleVisible")).toBeInTheDocument());
    expect(screen.queryByText("VilleMasquee")).not.toBeInTheDocument();
  });
});
