import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConversationStarters from "./ConversationStarters";

// Bug corrigé : "Ville" et "Pays d'origine" sont des champs texte libre
// (EditProfileForm.jsx / Step3Location.jsx) — comparer currentUser.city/
// country à match.city/country avec un simple .toLowerCase() est insensible
// à la casse mais pas aux accents ("Montréal" vs "Montreal", "Haïti" vs
// "Haiti"), ce qui privait silencieusement deux personnes réellement dans la
// même ville/pays de la suggestion d'ouverture correspondante.
describe("ConversationStarters — « même ville »/« même pays » insensibles aux accents", () => {
  it("suggère « vous êtes tous les deux à <ville> » même si l'un a tapé sa ville sans accent", () => {
    const currentUser = { id: "a", city: "Montréal" };
    const match = { id: "b", name: "Sam", city: "Montreal" };

    render(<ConversationStarters currentUser={currentUser} match={match} onPick={vi.fn()} />);

    expect(screen.getByText(/Vous êtes tous les deux à Montreal/)).toBeInTheDocument();
  });

  it("suggère « vous venez tous les deux de <pays> » même si l'un a tapé son pays sans accent", () => {
    const currentUser = { id: "a", country: "Haïti" };
    const match = { id: "b", name: "Sam", country: "Haiti" };

    render(<ConversationStarters currentUser={currentUser} match={match} onPick={vi.fn()} />);

    expect(screen.getByText(/Vous venez tous les deux de Haiti/)).toBeInTheDocument();
  });
});
