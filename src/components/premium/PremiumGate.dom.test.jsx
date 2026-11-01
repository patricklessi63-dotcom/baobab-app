import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const status = { isPremium: false, loading: false };
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: () => status }));

import PremiumGate from "./PremiumGate";

const Page = () => <div>PAGE PRIX ET PAIEMENT</div>;

beforeEach(() => { status.isPremium = false; status.loading = false; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("PremiumGate — drapeau de lancement", () => {
  it("drapeau éteint et compte gratuit : aucun écran de prix, un retour est proposé", () => {
    vi.stubEnv("VITE_FEATURE_PREMIUM", "");
    const onBack = vi.fn();
    render(<PremiumGate currentUser={{ id: "u1" }} onBack={onBack}><Page /></PremiumGate>);
    expect(screen.queryByText("PAGE PRIX ET PAIEMENT")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("drapeau éteint mais compte déjà Premium : accès conservé (gérer l'abonnement)", () => {
    vi.stubEnv("VITE_FEATURE_PREMIUM", "");
    status.isPremium = true;
    render(<PremiumGate currentUser={{ id: "u1" }} onBack={() => {}}><Page /></PremiumGate>);
    expect(screen.getByText("PAGE PRIX ET PAIEMENT")).toBeTruthy();
  });

  it("drapeau éteint pendant le chargement du statut : rien n'est montré (pas d'éclair de la page de prix)", () => {
    vi.stubEnv("VITE_FEATURE_PREMIUM", "");
    status.loading = true;
    render(<PremiumGate currentUser={{ id: "u1" }} onBack={() => {}}><Page /></PremiumGate>);
    expect(screen.queryByText("PAGE PRIX ET PAIEMENT")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retour" })).toBeNull();
  });

  it("drapeau allumé : l'écran Premium s'affiche pour tous", () => {
    vi.stubEnv("VITE_FEATURE_PREMIUM", "true");
    render(<PremiumGate currentUser={{ id: "u1" }} onBack={() => {}}><Page /></PremiumGate>);
    expect(screen.getByText("PAGE PRIX ET PAIEMENT")).toBeTruthy();
  });
});
