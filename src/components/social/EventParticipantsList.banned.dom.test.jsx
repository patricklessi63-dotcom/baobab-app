import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EventParticipantsList from "./EventParticipantsList";

// Bug corrigé à l'audit (liste des participant·es d'un événement, workflow
// admin suspension/bannissement) : un·e participant·e banni·e ou suspendu·e
// par un·e admin restait affiché·e ici comme un compte parfaitement normal
// (ville, badges...), sans la moindre indication — banned_at/suspended_until
// n'étaient jamais chargés ni consultés ici, contrairement à
// CommunityMemberRow.jsx/FavoritesModal.jsx/ProfileTab.jsx/MessagesTab.jsx/
// ConversationCard.jsx pour la même donnée.
describe("EventParticipantsList — comptes bannis/suspendus", () => {
  const baseParticipant = { id: "p1", profile_id: "u1", status: "going", profiles: { name: "Awa", avatar_url: null, city: "Montréal", show_city: true } };

  it("participant·e actif·ve normal·e : affiche sa ville", () => {
    render(<EventParticipantsList participants={[baseParticipant]} onViewProfile={vi.fn()} currentUserId="someone-else" />);
    expect(screen.getByText("📍 Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("participant·e banni·e : n'affiche jamais sa ville, montre l'indisponibilité", () => {
    const banned = { ...baseParticipant, profiles: { ...baseParticipant.profiles, banned_at: "2026-09-15T00:00:00Z" } };
    render(<EventParticipantsList participants={[banned]} onViewProfile={vi.fn()} currentUserId="someone-else" />);
    expect(screen.queryByText("📍 Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("participant·e suspendu·e (date future) : montre l'indisponibilité", () => {
    const suspended = { ...baseParticipant, profiles: { ...baseParticipant.profiles, suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() } };
    render(<EventParticipantsList participants={[suspended]} onViewProfile={vi.fn()} currentUserId="someone-else" />);
    expect(screen.queryByText("📍 Montréal")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée (date passée) : redevient normal·e, ville affichée", () => {
    const expired = { ...baseParticipant, profiles: { ...baseParticipant.profiles, suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString() } };
    render(<EventParticipantsList participants={[expired]} onViewProfile={vi.fn()} currentUserId="someone-else" />);
    expect(screen.getByText("📍 Montréal")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
