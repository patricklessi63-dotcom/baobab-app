import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import PublicPageShell from "./PublicPageShell";

// index.html a un canonical statique vers "/" ; sans ce correctif, /conditions
// (réécrite vers le même index.html par vercel.json) se déclarait doublon de
// la page d'accueil auprès des moteurs de recherche.
describe("PublicPageShell — canonical", () => {
  let link;
  beforeEach(() => {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    link.setAttribute("href", "https://baobab-app-zeta.vercel.app/");
    document.head.appendChild(link);
    window.history.pushState({}, "", "/conditions");
  });
  afterEach(() => {
    cleanup();
    link.remove();
    window.history.pushState({}, "", "/");
  });

  it("pointe le canonical vers la page courante puis restaure l'original", () => {
    const { unmount } = render(<PublicPageShell title="Conditions d'utilisation" navigate={() => {}}>x</PublicPageShell>);
    expect(link.getAttribute("href")).toBe("https://baobab-app-zeta.vercel.app/conditions");
    unmount();
    expect(link.getAttribute("href")).toBe("https://baobab-app-zeta.vercel.app/");
  });

  it("ne plante pas sans balise canonical", () => {
    link.remove();
    expect(() => render(<PublicPageShell title="À propos" navigate={() => {}}>x</PublicPageShell>)).not.toThrow();
  });
});
