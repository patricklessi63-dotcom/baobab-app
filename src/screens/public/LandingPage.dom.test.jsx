import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Arbre simulé : on vérifie ce que la page lui transmet (zone, mouvement, densité).
vi.mock("../../components/horizon/HorizonTree", () => ({
  default: (props) => (
    <div data-testid="tree" data-zone={String(props.zone)} data-reduce={String(props.reduceMotion)} data-lite={String(props.lite)} />
  ),
}));

const nativeFlag = { value: false };
vi.mock("../../lib/platform", () => ({
  isNative: () => nativeFlag.value,
  getPlatform: () => "web",
}));

const rpc = vi.fn();
vi.mock("../../supabaseClient", () => ({ supabase: { rpc: (...a) => rpc(...a) } }));

import LandingPage from "./LandingPage";
import { REDUCE_MOTION_KEY } from "../../components/horizon/useReduceMotion";
import { HORIZON_FONTS_ID } from "../../components/horizon/loadHorizonFonts";

function setup(props = {}) {
  const handlers = { onLogin: vi.fn(), onSignup: vi.fn(), navigate: vi.fn() };
  const utils = render(<LandingPage {...handlers} {...props} />);
  return { ...handlers, ...utils, user: userEvent.setup() };
}

let origMatchMedia;
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  nativeFlag.value = false;
  localStorage.clear();
  origMatchMedia = window.matchMedia;
});
afterEach(() => {
  window.matchMedia = origMatchMedia;
  document.getElementById(HORIZON_FONTS_ID)?.remove();
  localStorage.clear();
});

describe("LandingPage Horizon : contenu et actions", () => {
  it("affiche le titre Horizon et garde un seul h1", () => {
    setup();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Tes racines. Ta communauté. Ton prochain lien.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.title).toBe("Baobab — Rencontres et communauté pour immigrants au Canada");
  });

  it("Créer mon compte appelle onSignup et Se connecter appelle onLogin", async () => {
    const { user, onSignup, onLogin } = setup();
    await user.click(screen.getByRole("button", { name: "Créer mon compte" }));
    expect(onSignup).toHaveBeenCalledTimes(1);
    expect(onLogin).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Se connecter" }));
    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(onSignup).toHaveBeenCalledTimes(1);
  });

  it("garde les quatre liens légaux et navigue vers les bonnes routes", async () => {
    const { user, navigate } = setup();
    const nav = screen.getByRole("navigation", { name: "Informations légales" });
    const routes = {
      "À propos": "/a-propos",
      Confidentialité: "/confidentialite",
      Conditions: "/conditions",
      "Suppression de compte": "/suppression-compte",
    };
    for (const [label, route] of Object.entries(routes)) {
      await user.click(within(nav).getByRole("button", { name: label }));
      expect(navigate).toHaveBeenLastCalledWith(route);
    }
    expect(navigate).toHaveBeenCalledTimes(4);
  });

  it("affiche le compteur de membres tel que renvoyé par la RPC publique (pluriel, séparateur fr-CA)", async () => {
    rpc.mockResolvedValue({ data: 1234, error: null });
    setup();
    expect(await screen.findByText(/membres déjà sur Baobab/)).toHaveTextContent(/1\D234 membres déjà sur Baobab/);
    expect(rpc).toHaveBeenCalledWith("public_user_count");
  });

  it("singulier pour un membre", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    setup();
    expect(await screen.findByText(/1 membre déjà sur Baobab/)).toBeInTheDocument();
  });

  it.each([
    ["zéro", { data: 0, error: null }],
    ["erreur", { data: null, error: { message: "boom" } }],
    ["valeur non numérique", { data: "12", error: null }],
  ])("n'invente aucun compteur (%s)", async (_label, result) => {
    rpc.mockResolvedValue(result);
    setup();
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    await Promise.resolve();
    expect(screen.queryByText(/déjà sur Baobab/)).not.toBeInTheDocument();
  });

  it("présente uniquement les quatre fonctions existantes, sans promesse non vérifiée", () => {
    setup();
    const section = screen.getByRole("heading", { level: 2, name: /Quatre façons de créer du lien/ }).closest("section");
    const titles = within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Découvrir", "Messages", "Communautés", "Événements"]);
    expect(document.body.textContent).not.toMatch(/chiffr|intelligence artificielle|garanti/i);
  });

  it("charge les polices Horizon à la demande (une seule balise link)", () => {
    setup();
    expect(document.querySelectorAll("#" + HORIZON_FONTS_ID)).toHaveLength(1);
  });

  it("aligne le fond du body sur la page puis le restaure", () => {
    document.body.style.backgroundColor = "rgb(1, 2, 3)";
    const { unmount } = setup();
    expect(document.body.style.backgroundColor).toBe("rgb(6, 11, 9)");
    unmount();
    expect(document.body.style.backgroundColor).toBe("rgb(1, 2, 3)");
    document.body.style.backgroundColor = "";
  });

  it("aucune action ne dépend du survol : tout est bouton natif focusable", () => {
    setup();
    for (const b of screen.getAllByRole("button")) expect(b).not.toHaveAttribute("tabindex", "-1");
  });
});

describe("LandingPage Horizon : zones de l'arbre", () => {
  it("un bouton de zone met la zone en valeur, un second clic la retire, la légende suit", async () => {
    const { user } = setup();
    const tree = screen.getByTestId("tree");
    expect(tree).toHaveAttribute("data-zone", "null");
    const racines = screen.getByRole("button", { name: "Racines" });
    const tronc = screen.getByRole("button", { name: "Tronc" });
    expect(racines).toHaveAttribute("aria-pressed", "false");

    await user.click(racines);
    expect(racines).toHaveAttribute("aria-pressed", "true");
    expect(tree).toHaveAttribute("data-zone", "0");
    expect(screen.getByText(/Racines : d'où tu viens/)).toBeInTheDocument();

    await user.click(tronc);
    expect(tronc).toHaveAttribute("aria-pressed", "true");
    expect(racines).toHaveAttribute("aria-pressed", "false");
    expect(tree).toHaveAttribute("data-zone", "1");

    await user.click(screen.getByRole("button", { name: "Branches" }));
    expect(tree).toHaveAttribute("data-zone", "2");

    await user.click(screen.getByRole("button", { name: "Branches" }));
    expect(tree).toHaveAttribute("data-zone", "null");
    expect(screen.getByText(/Touche l'arbre : chaque point/)).toBeInTheDocument();
  });

  it("au survol (appareil à souris), la zone est prévisualisée puis relâchée", async () => {
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
    const { user } = setup();
    const tree = screen.getByTestId("tree");
    await user.hover(screen.getByRole("button", { name: "Tronc" }));
    expect(tree).toHaveAttribute("data-zone", "1");
    await user.unhover(screen.getByRole("button", { name: "Tronc" }));
    expect(tree).toHaveAttribute("data-zone", "null");
  });

  it("sur écran tactile (pas de survol), le survol simulé ne change rien", async () => {
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    const { user } = setup();
    await user.hover(screen.getByRole("button", { name: "Tronc" }));
    expect(screen.getByTestId("tree")).toHaveAttribute("data-zone", "null");
  });
});

describe("LandingPage Horizon : réduire les animations", () => {
  const sw = () => screen.getByRole("switch", { name: "Réduire les animations" });

  it("bascule, persiste dans localStorage et passe reduceMotion à l'arbre", async () => {
    const { user, container, unmount } = setup();
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("tree")).toHaveAttribute("data-reduce", "false");
    expect(container.querySelector(".hz-root")).toHaveAttribute("data-motion", "full");

    await user.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBe("1");
    expect(screen.getByTestId("tree")).toHaveAttribute("data-reduce", "true");
    expect(container.querySelector(".hz-root")).toHaveAttribute("data-motion", "reduce");

    // Persistance : une nouvelle visite démarre déjà en mode réduit.
    unmount();
    const second = setup();
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("tree")).toHaveAttribute("data-reduce", "true");

    // Et on peut le rétablir.
    await second.user.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "false");
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBeNull();
  });

  it("suit prefers-reduced-motion du système : réduit d'office, interrupteur verrouillé", async () => {
    window.matchMedia = vi.fn((q) => ({ matches: /reduced-motion/.test(q), addEventListener() {}, removeEventListener() {} }));
    const { user } = setup();
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(sw()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByTestId("tree")).toHaveAttribute("data-reduce", "true");
    await user.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBeNull();
  });

  it("fonctionne même si localStorage est inaccessible (lecture et écriture)", async () => {
    const getSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const setSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { user } = setup();
    expect(sw()).toHaveAttribute("aria-checked", "false");
    await user.click(sw());
    expect(sw()).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("tree")).toHaveAttribute("data-reduce", "true");
    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});

describe("LandingPage Horizon : app native", () => {
  it("demande la densité réduite à l'arbre en natif, pleine densité sur le web", () => {
    nativeFlag.value = true;
    const native = setup();
    expect(screen.getByTestId("tree")).toHaveAttribute("data-lite", "true");
    native.unmount();
    nativeFlag.value = false;
    setup();
    expect(screen.getByTestId("tree")).toHaveAttribute("data-lite", "false");
  });
});
