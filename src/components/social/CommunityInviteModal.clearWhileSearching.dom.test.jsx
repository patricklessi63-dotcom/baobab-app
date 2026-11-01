import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

// Bug corrigé : vider le champ pendant qu'une recherche est en vol
// invalidait cette recherche (compteur de séquence) sans remettre
// `searching` à faux — « Recherche... » restait affiché indéfiniment.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("../../supabaseClient", () => ({ supabase: { from: mocks.fromMock } }));

import CommunityInviteModal from "./CommunityInviteModal";

describe("CommunityInviteModal — champ vidé pendant une recherche", () => {
  it("n'affiche plus « Recherche... » une fois le champ vidé", async () => {
    let resolveSearch;
    const builder = {};
    ["select", "ilike", "neq", "limit"].forEach((m) => { builder[m] = vi.fn(() => builder); });
    builder.then = (resolve, reject) => new Promise((res) => { resolveSearch = () => res({ data: [], error: null }); }).then(resolve, reject);
    mocks.fromMock.mockImplementation(() => builder);

    render(<CommunityInviteModal community={{ id: "c1", name: "Test" }} currentUser={{ id: "me" }} memberIds={new Set()} blockedIds={new Set()} onClose={vi.fn()} onError={vi.fn()} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "al" } });
    expect(await screen.findByText("Recherche...")).toBeTruthy();

    fireEvent.change(input, { target: { value: "" } });
    await act(async () => { resolveSearch(); });

    expect(screen.queryByText("Recherche...")).toBeNull();
  });
});
