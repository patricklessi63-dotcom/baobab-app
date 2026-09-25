import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventParticipantsList from "./EventParticipantsList";

// Bug corrigé à l'audit du flux de signalement : ce composant ne recevait
// même pas currentUserId — cliquer sur sa propre ligne dans la liste des
// participant·es d'un événement ouvrait PublicProfileModal sur son propre
// profil, avec "Signaler"/"Bloquer"/"Message" actifs. Même correctif que
// CommunityMemberRow : onViewProfile ne doit plus être appelé pour soi-même.

const participants = [
  { id: "p1", profile_id: "u1", status: "going", profiles: { name: "Alex", avatar_url: null } },
  { id: "p2", profile_id: "u2", status: "going", profiles: { name: "Sami", avatar_url: null } },
];

describe("EventParticipantsList — garde anti auto-signalement", () => {
  it("clic sur un·e autre participant·e appelle onViewProfile", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    render(
      <EventParticipantsList participants={participants} onViewProfile={onViewProfile} currentUserId="u1" />
    );
    await user.click(screen.getByText("Sami"));
    expect(onViewProfile).toHaveBeenCalledTimes(1);
    expect(onViewProfile).toHaveBeenCalledWith(participants[1].profiles);
  });

  it("clic sur sa propre ligne n'appelle jamais onViewProfile", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    render(
      <EventParticipantsList participants={participants} onViewProfile={onViewProfile} currentUserId="u1" />
    );
    await user.click(screen.getByText("Alex"));
    expect(onViewProfile).not.toHaveBeenCalled();
    expect(screen.getByText("(toi)")).toBeInTheDocument();
  });

  it("sans currentUserId (prop absente), le comportement reste inchangé pour tout le monde", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    render(<EventParticipantsList participants={participants} onViewProfile={onViewProfile} />);
    await user.click(screen.getByText("Alex"));
    expect(onViewProfile).toHaveBeenCalledWith(participants[0].profiles);
  });
});
