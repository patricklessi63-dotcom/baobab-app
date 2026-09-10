import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// On isole le wizard de Supabase : chaque étape enregistre via
// supabase.from("profiles").update(...).eq(...).select().single().
const single = vi.fn();
const chain = {
  update: vi.fn(() => chain),
  insert: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  select: vi.fn(() => chain),
  single,
};
vi.mock("../../supabaseClient", () => ({
  supabase: { from: vi.fn(() => chain), storage: { from: vi.fn() } },
}));

import OnboardingWizard from "./OnboardingWizard";

function renderWizard(overrides = {}) {
  const props = {
    session: { user: { id: "sess-1" } },
    currentUser: { id: "u1", onboarding_step: 0, usage_goals: "❤️ Rencontre" },
    setCurrentUser: vi.fn(),
    setProfiles: vi.fn(),
    setProfilePhotos: vi.fn(),
    photoFiles: [],
    photoPreviews: [],
    handlePhotosSelected: vi.fn(),
    removePhotoFile: vi.fn(),
    setPhotoFiles: vi.fn(),
    setPhotoPreviews: vi.fn(),
    uploadPhoto: vi.fn(),
    setView: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<OnboardingWizard {...props} />) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OnboardingWizard — garde anti-double-submit", () => {
  it("deux clics synchrones sur « Continuer » ne déclenchent qu'un seul saveStep", async () => {
    // single() ne résout pas tout de suite : la garde submitInFlightRef doit
    // tenir pendant que le 1er appel est en vol.
    let resolveSingle;
    single.mockImplementation(() => new Promise((r) => { resolveSingle = r; }));

    renderWizard();
    // étape 1 (Bienvenue) : usage_goals pré-rempli -> bouton actif
    const next = screen.getByRole("button", { name: "Continuer" });
    fireEvent.click(next);
    fireEvent.click(next); // 2e tap immédiat, avant tout re-render

    expect(single).toHaveBeenCalledTimes(1);

    resolveSingle({ data: { id: "u1", onboarding_step: 1 }, error: null });
    await waitFor(() => {
      // on est passé à l'étape 2 (Identité) : le titre « Retour » apparaît
      expect(screen.getByRole("button", { name: /Retour/ })).toBeInTheDocument();
    });
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("navigation avant puis arrière conserve le brouillon (usage_goals coché)", async () => {
    const user = userEvent.setup();
    single.mockResolvedValue({ data: { id: "u1", onboarding_step: 1 }, error: null });

    renderWizard();
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // étape 2
    await screen.findByRole("button", { name: /Retour/ });
    await user.click(screen.getByRole("button", { name: /Retour/ }));

    // de retour à l'étape 1 : le bouton Continuer est toujours actif, ce qui
    // n'est vrai que si draft.usageGoals a été préservé (isStep0Valid).
    const next = screen.getByRole("button", { name: "Continuer" });
    expect(next).toBeEnabled();
  });
});
