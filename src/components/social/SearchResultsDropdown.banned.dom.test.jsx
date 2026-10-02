import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SearchResultsDropdown from "./SearchResultsDropdown";

// Bug corrigé à l'audit (workflow admin suspension/bannissement) : la
// recherche globale du header (SocialShell.jsx) affichait le dernier message
// ("Discussions") ou la ville ("Personnes") d'un compte banni/suspendu comme
// un profil parfaitement normal — banned_at/suspended_until sont pourtant
// déjà chargés sur conversationResults (matches) et searchResults
// (OTHER_PROFILE_COLUMNS), mais rien ici ne les consultait, contrairement à
// MessagesTab.jsx/ConversationCard.jsx pour la même donnée.

function baseProps(overrides) {
  return {
    currentUser: { id: "me" },
    lastByKey: {},
    conversationResults: [],
    searchResults: [],
    openChat: vi.fn(),
    setSearch: vi.fn(),
    setViewedProfileId: vi.fn(),
    ...overrides,
  };
}

function setup(overrides) {
  return render(<SearchResultsDropdown {...baseProps(overrides)} />);
}

describe("SearchResultsDropdown — compte banni/suspendu", () => {
  it("Discussions : compte banni n'affiche jamais le dernier message", () => {
    const match = { id: "m1", name: "Awa", banned_at: "2026-09-15T00:00:00Z" };
    setup({ conversationResults: [match], lastByKey: { m1__me: { text: "Salut !" } } });
    expect(screen.queryByText("Salut !")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("Discussions : compte actif normal affiche bien le dernier message", () => {
    const match = { id: "m1", name: "Awa" };
    setup({ conversationResults: [match], lastByKey: { m1__me: { text: "Salut !" } } });
    expect(screen.getByText("Salut !")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });

  it("Personnes : compte suspendu (date future) n'affiche jamais la ville", () => {
    const person = {
      id: "p1",
      name: "Koffi",
      city: "Montréal",
      country: "Canada",
      suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    setup({ searchResults: [person] });
    expect(screen.queryByText("Montréal · Canada")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("Personnes : suspension déjà expirée redevient un profil normal", () => {
    const person = {
      id: "p1",
      name: "Koffi",
      city: "Montréal",
      country: "Canada",
      suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    setup({ searchResults: [person] });
    expect(screen.getByText("Montréal · Canada")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
