import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CommunityMemberRow from "./CommunityMemberRow";

// Bug corrigé à l'audit (liste des membres d'une communauté, workflow admin
// suspension/bannissement) : un membre banni ou suspendu par un·e admin
// restait affiché ici comme un compte parfaitement normal (ville, badges...),
// sans la moindre indication — banned_at/suspended_until n'étaient jamais
// chargés ni consultés ici, contrairement à FavoritesModal.jsx/ProfileTab.jsx/
// MessagesTab.jsx/ConversationCard.jsx pour la même donnée.
describe("CommunityMemberRow — comptes bannis/suspendus", () => {
  const baseMember = {
    id: "m1",
    profile_id: "u1",
    role: "member",
    profiles: { id: "u1", name: "Awa", avatar_url: null, city: "Montréal", show_city: true },
  };

  it("membre actif normal : affiche sa ville", () => {
    render(
      <CommunityMemberRow member={baseMember} viewerRole="member" currentUserId="someone-else" onViewProfile={vi.fn()} onSetRole={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.getByText("📍 Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("membre banni : n'affiche jamais sa ville, montre l'indisponibilité", () => {
    const banned = { ...baseMember, profiles: { ...baseMember.profiles, banned_at: "2026-09-15T00:00:00Z" } };
    render(
      <CommunityMemberRow member={banned} viewerRole="member" currentUserId="someone-else" onViewProfile={vi.fn()} onSetRole={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.queryByText("📍 Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("membre suspendu (date future) : montre l'indisponibilité", () => {
    const suspended = { ...baseMember, profiles: { ...baseMember.profiles, suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() } };
    render(
      <CommunityMemberRow member={suspended} viewerRole="member" currentUserId="someone-else" onViewProfile={vi.fn()} onSetRole={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.queryByText("📍 Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée (date passée) : redevient un membre normal, ville affichée", () => {
    const expired = { ...baseMember, profiles: { ...baseMember.profiles, suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() } };
    render(
      <CommunityMemberRow member={expired} viewerRole="member" currentUserId="someone-else" onViewProfile={vi.fn()} onSetRole={vi.fn()} onRemove={vi.fn()} />
    );
    expect(screen.getByText("📍 Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
