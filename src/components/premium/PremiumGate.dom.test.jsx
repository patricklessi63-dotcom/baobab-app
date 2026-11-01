import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const status = { isPremium: false, loading: false };
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: () => status }));

import PremiumGate from "./PremiumGate";

let ENABLED = false;
const Page = () => <div>PAGE PRIX ET PAIEMENT</div>;

beforeEach(() => { status.isPremium = false; status.loading = false; ENABLED = false; });
afterEach(() => { cleanup(); });

describe("PremiumGate — drapeau de lancement", () => {
  it("drapeau éteint et compte gratuit : aucun écran de prix, un retour est proposé", () => {
    const onBack = vi.fn();
    render(<PremiumGate enabled={ENABLED} currentUser={{ id: "u1" }} onBack={onBack}><Page /></PremiumGate>);
    expect(screen.queryByText("PAGE PRIX ET PAIEMENT")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("drapeau éteint mais compte déjà Premium : accès conservé (gérer l'abonnement)", () => {
    status.isPremium = true;
    render(<PremiumGate enabled={ENABLED} currentUser={{ id: "u1" }} onBack={() => {}}><Page /></PremiumGate>);
    expect(screen.getByText("PAGE PRIX ET PAIEMENT")).toBeTruthy();
  });

  it("drapeau éteint pendant le chargement du statut : rien n'est montré (pas d'éclair de la page de prix)", () => {
    status.loading = true;
    render(<PremiumGate enabled={ENABLED} currentUser={{ id: "u1" }} onBack={() => {}}><Page /></PremiumGate>);
    expect(screen.queryByText("PAGE PRIX ET PAIEMENT")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retour" })).toBeNull();
  });

  it("drapeau allumé : l'écran Premium s'affiche pour tous", () => {
    ENABLED = true;
    render(<PremiumGate enabled={ENABLED} currentUser={{ id: "u1" }} onBack={() => {}}><Page /></PremiumGate>);
    expect(screen.getByText("PAGE PRIX ET PAIEMENT")).toBeTruthy();
  });
});
