import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChunkErrorBoundary from "./ChunkErrorBoundary";

// Filet de sécurité pour les onglets lazy() : une erreur de chargement de
// chunk (après déploiement) doit déclencher un rechargement complet unique
// (verrou sessionStorage anti-boucle) ; toute autre erreur de rendu doit
// afficher le message générique « Réessayer » sans rechargement.

function Boom({ error }) {
  throw error;
}

const CHUNK_ERROR = new Error("Failed to fetch dynamically imported module");
const OTHER_ERROR = new Error("Cannot read properties of undefined (reading 'x')");

let reloadSpy;
let consoleErrorSpy;

beforeEach(() => {
  sessionStorage.clear();
  reloadSpy = vi.fn();
  // window.location.reload n'est pas remplaçable directement dans jsdom :
  // on redéfinit location avec un reload espionnable.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload: reloadSpy, assign: vi.fn(), replace: vi.fn() },
  });
  // React journalise l'erreur rattrapée par la boundary : on la tait.
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("ChunkErrorBoundary", () => {
  it("rend les enfants tant qu'aucune erreur", () => {
    render(
      <ChunkErrorBoundary>
        <p>contenu ok</p>
      </ChunkErrorBoundary>
    );
    expect(screen.getByText("contenu ok")).toBeInTheDocument();
  });

  it("erreur de chunk : déclenche un rechargement unique et pose le verrou sessionStorage", () => {
    render(
      <ChunkErrorBoundary>
        <Boom error={CHUNK_ERROR} />
      </ChunkErrorBoundary>
    );
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("bb-chunk-reload")).toBe("1");
    // le fallback est affiché aussi (au cas où le reload ne survient pas)
    expect(screen.getByText(/Impossible de charger cette section/)).toBeInTheDocument();
  });

  it("erreur de chunk avec verrou déjà posé : PAS de second rechargement (anti-boucle)", () => {
    sessionStorage.setItem("bb-chunk-reload", "1");
    render(
      <ChunkErrorBoundary>
        <Boom error={CHUNK_ERROR} />
      </ChunkErrorBoundary>
    );
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Impossible de charger cette section/)).toBeInTheDocument();
  });

  it("erreur non liée à un chunk : fallback générique, aucun rechargement, aucun verrou", () => {
    render(
      <ChunkErrorBoundary>
        <Boom error={OTHER_ERROR} />
      </ChunkErrorBoundary>
    );
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("bb-chunk-reload")).toBeNull();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });

  it("sessionStorage qui jette : pas de crash, pas de rechargement auto, fallback affiché", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("stockage désactivé");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("stockage désactivé");
    });
    expect(() =>
      render(
        <ChunkErrorBoundary>
          <Boom error={CHUNK_ERROR} />
        </ChunkErrorBoundary>
      )
    ).not.toThrow();
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Impossible de charger cette section/)).toBeInTheDocument();
  });

  it("bouton Réessayer : lève le verrou et recharge", async () => {
    const user = userEvent.setup();
    sessionStorage.setItem("bb-chunk-reload", "1");
    render(
      <ChunkErrorBoundary>
        <Boom error={OTHER_ERROR} />
      </ChunkErrorBoundary>
    );
    await user.click(screen.getByRole("button", { name: /Réessayer/ }));
    expect(sessionStorage.getItem("bb-chunk-reload")).toBeNull();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
