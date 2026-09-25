import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommunityMemberRow from "./CommunityMemberRow";

// Bug corrigé à l'audit du flux de signalement : cliquer sur sa propre ligne
// dans la liste des membres d'une communauté ouvrait PublicProfileModal sur
// son propre profil, avec le bouton "Signaler" (et "Bloquer"/"Message")
// actifs — PublicProfileModal ne vérifie jamais l'identité du profil
// affiché. onViewProfile ne doit donc plus être appelé pour sa propre ligne.

const baseMember = {
  id: "m1",
  profile_id: "u1",
  role: "member",
  profiles: { name: "Alex", avatar_url: null },
};

describe("CommunityMemberRow — garde anti auto-signalement", () => {
  it("clic sur la ligne d'un autre membre appelle onViewProfile", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    render(
      <CommunityMemberRow
        member={baseMember}
        viewerRole="member"
        currentUserId="someone-else"
        onViewProfile={onViewProfile}
        onSetRole={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    await user.click(screen.getByText("Alex"));
    expect(onViewProfile).toHaveBeenCalledTimes(1);
    expect(onViewProfile).toHaveBeenCalledWith(baseMember.profiles);
  });

  it("clic sur sa propre ligne n'appelle jamais onViewProfile (pas d'auto-signalement possible)", async () => {
    const user = userEvent.setup();
    const onViewProfile = vi.fn();
    render(
      <CommunityMemberRow
        member={baseMember}
        viewerRole="member"
        currentUserId="u1" // = member.profile_id : c'est soi-même
        onViewProfile={onViewProfile}
        onSetRole={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    await user.click(screen.getByText("Alex"));
    expect(onViewProfile).not.toHaveBeenCalled();
    expect(screen.getByText("(toi)")).toBeInTheDocument();
  });
});
