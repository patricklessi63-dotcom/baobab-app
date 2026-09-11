import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchResultsDropdown from "./SearchResultsDropdown";

// Dropdown de résultats de la barre de recherche du header de
// SocialShell.jsx, extrait tel quel (voir commentaire en tête de
// SearchResultsDropdown.jsx) — pas de logique propre, seulement le câblage
// props → JSX. Les tests couvrent l'état vide, le rendu d'une discussion et
// d'une personne, et le clic sur chacun.

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
  const props = baseProps(overrides);
  const utils = render(<SearchResultsDropdown {...props} />);
  return { props, ...utils };
}

describe("SearchResultsDropdown", () => {
  it("état vide : « Aucun résultat » et pas de section Discussions", () => {
    setup();
    expect(screen.getByText("Aucun résultat.")).toBeInTheDocument();
    expect(screen.queryByText("Discussions")).toBeNull();
    expect(screen.getByText("Personnes")).toBeInTheDocument();
  });

  it("rend une discussion avec son dernier message et le clic ouvre le chat + vide la recherche", async () => {
    const user = userEvent.setup();
    const match = { id: "m1", name: "Awa", avatar_url: null };
    const { props } = setup({
      conversationResults: [match],
      lastByKey: { "m1__me": { text: "Salut !" } },
    });
    expect(screen.getByText("Discussions")).toBeInTheDocument();
    expect(screen.getByText("Salut !")).toBeInTheDocument();
    await user.click(screen.getByText("Awa"));
    expect(props.setSearch).toHaveBeenCalledWith("");
    expect(props.openChat).toHaveBeenCalledWith(match);
  });

  it("rend une personne et le clic ouvre son profil + vide la recherche", async () => {
    const user = userEvent.setup();
    const person = { id: "p1", name: "Koffi", city: "Montréal", country: "Canada" };
    const { props } = setup({ searchResults: [person] });
    expect(screen.getByText("Koffi")).toBeInTheDocument();
    await user.click(screen.getByText("Koffi"));
    expect(props.setSearch).toHaveBeenCalledWith("");
    expect(props.setViewedProfileId).toHaveBeenCalledWith("p1");
  });
});
