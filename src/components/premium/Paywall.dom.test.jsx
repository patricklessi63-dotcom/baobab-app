import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Paywall from "./Paywall";
import { FEATURE_DETAILS } from "../../lib/premium/premiumConfig";

describe("Paywall", () => {
  it("sans featureKey : comportement historique, un seul bouton 'Découvrir Premium'", () => {
    const onDiscover = vi.fn();
    render(<Paywall title="Fonction Premium" description="Texte" onDiscover={onDiscover} onSubscribe={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /passer à premium/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /découvrir premium/i }));
    expect(onDiscover).toHaveBeenCalledTimes(1);
  });

  it("avec featureKey : fiche (utilité, avantages, ce qui reste gratuit) et deux boutons distincts", () => {
    const onDiscover = vi.fn();
    const onSubscribe = vi.fn();
    render(<Paywall title="Filtres de recherche avancés" featureKey="advanced_filters" onDiscover={onDiscover} onSubscribe={onSubscribe} />);
    const d = FEATURE_DETAILS.advanced_filters;
    expect(screen.getByText(d.purpose)).toBeInTheDocument();
    for (const b of d.benefits) expect(screen.getByText(b)).toBeInTheDocument();
    expect(screen.getByText(d.stillFree)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^découvrir premium$/i }));
    expect(onDiscover).toHaveBeenCalledTimes(1);
    expect(onSubscribe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^passer à premium$/i }));
    expect(onSubscribe).toHaveBeenCalledTimes(1);
  });

  it("featureKey inconnue : retombe sur l'affichage simple, rien d'inventé", () => {
    render(<Paywall title="X" featureKey="inconnue" onDiscover={vi.fn()} onSubscribe={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /passer à premium/i })).toBeNull();
  });

  it("chaque entrée de FEATURE_DETAILS a utilité, avantages et mention du gratuit", () => {
    for (const [key, d] of Object.entries(FEATURE_DETAILS)) {
      expect(d.title, key).toBeTruthy();
      expect(d.purpose, key).toBeTruthy();
      expect(d.benefits.length, key).toBeGreaterThan(0);
      expect(d.stillFree, key).toBeTruthy();
    }
  });
});
