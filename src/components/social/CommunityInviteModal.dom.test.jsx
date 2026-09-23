import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Test du correctif "invitation à une communauté ne tenait pas compte du
// blocage" (CommunityInviteModal.jsx). Contexte : contrairement à
// EventInviteModal (candidats déjà filtrés par blockedIds dans
// EventsTab.openInvite) et au reste de CommunitiesTab (posts/commentaires/
// membres filtrés par blockedIds), la recherche de profils à inviter dans
// une communauté interrogeait `profiles` sans jamais exclure les personnes
// bloquées (dans un sens ou dans l'autre) : on pouvait rechercher puis
// inviter quelqu'un qu'on a bloqué, ou qui nous a bloqués.
//
// Ce test monte le VRAI CommunityInviteModal, tape une recherche dont la
// réponse réseau mêle un profil bloqué et un profil normal, et vérifie que
// seul le profil non bloqué apparaît dans les résultats proposés.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("../../supabaseClient", () => ({
  supabase: { from: mocks.fromMock },
}));

import CommunityInviteModal from "./CommunityInviteModal";

function makeProfilesBuilder(data) {
  const builder = {};
  ["select", "ilike", "neq", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
  builder.then = (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject);
  return builder;
}

describe("CommunityInviteModal — exclusion des personnes bloquées de la recherche", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("un profil bloqué (dans un sens ou l'autre) n'apparaît pas dans les résultats de recherche", async () => {
    mocks.fromMock.mockImplementation((table) => {
      if (table === "profiles") {
        return makeProfilesBuilder([
          { id: "blocked1", name: "Personne Bloquée", avatar_url: null, city: "", show_city: true, is_founder: false, is_premium: false, email_verified: false, phone_verified: false },
          { id: "ok1", name: "Personne Correcte", avatar_url: null, city: "", show_city: true, is_founder: false, is_premium: false, email_verified: false, phone_verified: false },
        ]);
      }
      return makeProfilesBuilder([]);
    });

    const user = userEvent.setup();
    render(
      <CommunityInviteModal
        community={{ id: "c1", name: "Communauté Test" }}
        currentUser={{ id: "me" }}
        memberIds={new Set()}
        blockedIds={new Set(["blocked1"])}
        onClose={vi.fn()}
        onError={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("Rechercher un nom..."), "Personne");

    await waitFor(() => expect(screen.getByText("Personne Correcte")).toBeInTheDocument());
    expect(screen.queryByText("Personne Bloquée")).not.toBeInTheDocument();
  });
});
