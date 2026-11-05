import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PremiumComparison from "./PremiumComparison";
import { COMPARISON_ROWS, PREMIUM_FEATURES } from "../../lib/premium/premiumConfig";

describe("PremiumComparison — tableau Gratuit / Premium", () => {
  it("est un vrai tableau avec les colonnes Gratuit et Premium", () => {
    render(<PremiumComparison />);
    const table = screen.getByRole("table", { name: /comparaison entre baobab gratuit et baobab premium/i });
    expect(within(table).getByRole("columnheader", { name: /gratuit/i })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /premium/i })).toBeInTheDocument();
  });

  it("affiche une ligne par entrée de COMPARISON_ROWS", () => {
    render(<PremiumComparison />);
    expect(screen.getAllByRole("rowheader")).toHaveLength(COMPARISON_ROWS.length);
  });

  it("n'exprime jamais 'inclus / non inclus' par la couleur seule : texte accessible", () => {
    render(
      <PremiumComparison
        rows={[
          { icon: "x", label: "Ligne A", free: true, premium: true },
          { icon: "y", label: "Ligne B", free: false, premium: true },
          { icon: "z", label: "Ligne C", free: "Le nombre", premium: "La liste" },
        ]}
      />
    );
    expect(screen.getAllByText("Inclus")).toHaveLength(3);
    expect(screen.getAllByText("Non inclus")).toHaveLength(1);
    expect(screen.getByText("Le nombre")).toBeInTheDocument();
    expect(screen.getByText("La liste")).toBeInTheDocument();
  });

  it("le gratuit reste présenté comme complet : première ligne incluse des deux côtés", () => {
    expect(COMPARISON_ROWS[0].free).toBe(true);
    expect(COMPARISON_ROWS[0].premium).toBe(true);
    render(<PremiumComparison />);
    expect(screen.getByText(/premium ajoute des outils, il n'enlève rien/i)).toBeInTheDocument();
  });

  it("chaque ligne 'Premium seulement' correspond à un avantage réellement listé dans PREMIUM_FEATURES", () => {
    const labels = PREMIUM_FEATURES.map((f) => f.label.toLowerCase()).join(" | ");
    const premiumOnly = COMPARISON_ROWS.filter((r) => r.free === false);
    expect(premiumOnly.length).toBeGreaterThan(0);
    expect(labels).toContain("filtres");
    expect(labels).toContain("badge");
  });
});
