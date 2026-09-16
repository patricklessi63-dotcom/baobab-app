import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConversationCard from "./ConversationCard";

// Bug corrigé à l'audit (workflow admin suspension/bannissement) :
// ConversationCard (widget "Tes conversations" de l'accueil) affichait un
// point vert pulsant "En ligne" pour un compte banni ou suspendu, sans
// jamais consulter banned_at/suspended_until — même correctif déjà en
// place dans ConversationPane.jsx/MessagesTab.jsx pour la même donnée.
describe("ConversationCard", () => {
  const baseMatch = {
    id: "m1",
    name: "Awa",
    is_online: true,
    last_seen: new Date().toISOString(),
  };

  it("affiche 'En ligne' pour un compte actif normal", () => {
    render(<ConversationCard match={baseMatch} onOpen={vi.fn()} />);
    expect(screen.getByText("En ligne")).toBeInTheDocument();
  });

  it("compte banni : n'affiche jamais 'En ligne', même si is_online/last_seen le suggèrent", () => {
    const banned = { ...baseMatch, banned_at: "2026-09-15T00:00:00Z" };
    render(<ConversationCard match={banned} onOpen={vi.fn()} />);
    expect(screen.queryByText("En ligne")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("compte suspendu (date future) : n'affiche jamais 'En ligne'", () => {
    const suspended = {
      ...baseMatch,
      suspended_until: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
    render(<ConversationCard match={suspended} onOpen={vi.fn()} />);
    expect(screen.queryByText("En ligne")).toBeNull();
    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
  });

  it("suspension déjà expirée (date passée) : redevient un compte normal, statut en ligne recalculé", () => {
    const expired = {
      ...baseMatch,
      suspended_until: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    };
    render(<ConversationCard match={expired} onOpen={vi.fn()} />);
    expect(screen.getByText("En ligne")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible")).toBeNull();
  });
});
