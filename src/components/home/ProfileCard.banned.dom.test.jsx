import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ProfileCard from "./ProfileCard";

// Bug corrigé à l'audit (workflow admin suspension/bannissement) : ProfileCard
// (onglet Fil > Suivis, FeedTab.jsx) affiche followedProfiles, qui vient
// directement de la table "follows" — déjà chargée avec banned_at/
// suspended_until côté SocialShell.jsx — sans jamais les consulter ici,
// contrairement à ConversationCard.jsx/CommunityMemberRow.jsx pour la même
// donnée.
const baseProfile = { id: "p1", name: "Awa", city: "Montréal" };

describe("ProfileCard — compte banni/suspendu", () => {
  it("affiche la ville pour un profil actif normal", () => {
    render(<ProfileCard profile={baseProfile} />);
    expect(screen.getByText("Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("compte banni : n'affiche jamais la ville, affiche 'Ce compte n'est plus disponible'", () => {
    render(<ProfileCard profile={{ ...baseProfile, banned_at: "2026-09-15T00:00:00Z" }} />);
    expect(screen.queryByText("Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("compte suspendu (date future) : n'affiche jamais la ville", () => {
    render(
      <ProfileCard
        profile={{ ...baseProfile, suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() }}
      />
    );
    expect(screen.queryByText("Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée : redevient un profil normal", () => {
    render(
      <ProfileCard
        profile={{ ...baseProfile, suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() }}
      />
    );
    expect(screen.getByText("Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
