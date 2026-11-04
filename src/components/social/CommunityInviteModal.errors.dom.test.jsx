import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Messages d'erreur de l'invitation à une communauté. Depuis SQL-25 (policies RESTRICTIVES de blocage),
// une personne bloquée qui invite celle qui l'a bloquée reçoit un refus RLS (code 42501) : le message doit
// être clair SANS révéler le blocage (« pas la permission », jamais « tu es bloqué·e »), et les messages de
// limite de débit du serveur (code P0001) ne doivent plus être masqués par un texte générique.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), insertResult: { error: null } }));

vi.mock("../../supabaseClient", () => ({
  supabase: { from: mocks.fromMock },
}));

import CommunityInviteModal from "./CommunityInviteModal";

const PROFILE = { id: "p1", name: "Aïssa", avatar_url: null, city: "", show_city: true, is_founder: false, is_premium: false, email_verified: false, phone_verified: false };

function builder(result) {
  const b = {};
  ["select", "ilike", "neq", "limit"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.insert = vi.fn(() => b);
  b.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
  return b;
}

async function openAndInvite(onError) {
  mocks.fromMock.mockImplementation((table) => {
    if (table === "profiles") return builder(() => ({ data: [PROFILE], error: null }));
    return builder(() => mocks.insertResult); // community_invites
  });
  const user = userEvent.setup();
  render(
    <CommunityInviteModal
      community={{ id: "c1", name: "Communauté Test" }}
      currentUser={{ id: "me" }}
      memberIds={new Set()}
      blockedIds={new Set()}
      onClose={vi.fn()}
      onError={onError}
    />
  );
  await user.type(screen.getByPlaceholderText("Rechercher un nom..."), "Aïssa");
  await user.click(await screen.findByRole("button", { name: "Inviter Aïssa" }));
}

describe("CommunityInviteModal — messages d'erreur d'invitation", () => {
  let onError;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    onError = vi.fn();
  });

  it("refus de permission (42501, p. ex. blocage) : message clair qui ne mentionne pas le blocage", async () => {
    mocks.insertResult = { error: { code: "42501", message: "new row violates row-level security policy" } };
    await openAndInvite(onError);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Tu n'as pas la permission d'effectuer cette action."));
    expect(onError.mock.calls[0][0]).not.toMatch(/bloqu/i);
  });

  it("limite de débit du serveur (P0001) : le message précis est affiché", async () => {
    mocks.insertResult = { error: { code: "P0001", message: "RATE_LIMIT: Trop d'invitations envoyées. Réessaie plus tard." } };
    await openAndInvite(onError);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Trop d'invitations envoyées. Réessaie plus tard."));
  });

  it("déjà invitée (23505) : message spécifique inchangé", async () => {
    mocks.insertResult = { error: { code: "23505", message: "duplicate key" } };
    await openAndInvite(onError);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Cette personne est déjà invitée."));
  });

  it("autre erreur (réseau...) : message générique inchangé", async () => {
    mocks.insertResult = { error: { code: "", message: "Failed to fetch" } };
    await openAndInvite(onError);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible d'envoyer cette invitation."));
  });
});
