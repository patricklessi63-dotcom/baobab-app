import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// L'onglet « Statistiques » du profil : visible quand Premium est ouvert ou que le compte est abonné,
// et il affiche l'écran « Mes statistiques » (fiche Premium pour un compte gratuit).

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));
vi.mock("../../supabaseClient", () => ({
  supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ then: (resolve) => resolve({ count: 0, error: null }) })) })) })) },
}));
const usePremiumStatusMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: (...a) => usePremiumStatusMock(...a) }));
const loadStatsMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/premium/creatorStats", async (importActual) => {
  const actual = await importActual();
  return { ...actual, loadCreatorStats: (...a) => loadStatsMock(...a) };
});

import ProfileTab from "./ProfileTab";
import { normalizeStats } from "../../lib/premium/creatorStats";

const baseUser = { id: "u1", name: "Awa", is_founder: false, email_verified: false, phone_verified: false };

function setup(tab, isPremium) {
  usePremiumStatusMock.mockReturnValue({ isPremium, subscription: null, loading: false, error: null, refresh: vi.fn() });
  return render(
    <ProfileTab currentUser={baseUser} openEditProfile={vi.fn()} matches={[]} candidates={[]}
      profileTab={tab} setProfileTab={vi.fn()} goTab={vi.fn()} blockedIds={new Set()} />
  );
}

beforeEach(() => {
  loadStatsMock.mockReset();
  loadStatsMock.mockResolvedValue(normalizeStats({ posts_total: 2, likes_total: 11 }));
});

describe("ProfileTab — onglet Statistiques", () => {
  it("l'onglet est proposé à un abonné, entre le réseau et l'abonnement", () => {
    setup("about", true);
    const labels = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(labels).toContain("Statistiques");
    expect(labels.indexOf("Statistiques")).toBeLessThan(labels.indexOf("Abonnement"));
  });

  it("abonné : l'onglet montre ses chiffres", async () => {
    setup("stats", true);
    expect(await screen.findByText("11")).toBeInTheDocument();
    expect(loadStatsMock).toHaveBeenCalled();
  });

  it("compte gratuit : l'onglet montre la fiche Premium, sans appel serveur", () => {
    setup("stats", false);
    // Drapeau Premium allumé par la configuration de test (vite test.env) : l'onglet existe, et ouvre la fiche.
    expect(screen.getByText(/comprendre ce qui plaît dans ce que tu partages/i)).toBeInTheDocument();
    expect(loadStatsMock).not.toHaveBeenCalled();
  });
});
