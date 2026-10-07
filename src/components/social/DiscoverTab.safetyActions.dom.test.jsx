import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../supabaseClient", () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }));
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: () => ({ isPremium: false, loading: false }) }));
vi.mock("../../lib/locationApi", () => ({ fetchNearbyProfiles: vi.fn(() => Promise.resolve([])) }));

import DiscoverTab from "./DiscoverTab";

// Apple 1.2 / Google Play UGC : en mode « Pile » (mode par défaut de
// Découverte), Signaler et Bloquer doivent être visibles sur la carte du
// profil, sans ouvrir d'abord la fiche complète.
const person = { id: "p1", name: "Awa", city: "Montréal", country: "Sénégal", bio: "Salut", languages: "Français" };

function setup(props = {}) {
  const handlers = { setReportTarget: vi.fn(), handleBlock: vi.fn(), onViewProfile: vi.fn() };
  render(
    <DiscoverTab
      filteredPeople={[person]}
      topPerson={person}
      topPhotos={[]}
      discoverPhotoIndex={0}
      setDiscoverPhotoIndex={() => {}}
      swipeX={0}
      swipeExit={null}
      swiping={false}
      onSwipeStart={() => {}}
      onSwipeMove={() => {}}
      onSwipeEnd={() => {}}
      decideSwipe={() => {}}
      currentUser={{ id: "me", name: "Moi", city: "Québec" }}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("DiscoverTab — Signaler / Bloquer sur la carte (mode Pile)", () => {
  it("Signaler ouvre le signalement du profil affiché", async () => {
    const h = setup();
    await userEvent.click(screen.getByRole("button", { name: "Signaler Awa" }));
    expect(h.setReportTarget).toHaveBeenCalledWith(person);
  });

  it("Bloquer demande le blocage du profil affiché", async () => {
    const h = setup();
    await userEvent.click(screen.getByRole("button", { name: "Bloquer Awa" }));
    expect(h.handleBlock).toHaveBeenCalledWith(person);
  });
});
