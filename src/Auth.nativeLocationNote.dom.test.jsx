import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Étape 3b : en app native, l'inscription explique la demande de position AVANT la
// fenêtre système (déclenchée au clic sur « Créer mon compte ») ; sur le web, rien
// n'est ajouté (l'invite du navigateur reste telle quelle).
const mocks = vi.hoisted(() => ({ native: true }));
vi.mock("./lib/platform", () => ({ isNative: () => mocks.native, getPlatform: () => (mocks.native ? "android" : "web") }));
vi.mock("./supabaseClient", () => ({
  supabase: {
    auth: {
      signUp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), resend: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));
vi.mock("./lib/geolocation", () => ({ getCurrentPositionSafe: vi.fn(async () => ({ ok: true, latitude: 45.5, longitude: -73.6 })) }));

import Auth from "./Auth";

beforeEach(() => { mocks.native = true; });

describe("Auth — texte d'explication de la localisation (natif seulement)", () => {
  it("natif : phrase visible à l'inscription (approximative, ~1 km, jamais montrée telle quelle)", () => {
    render(<Auth initialMode="signup" />);
    const note = document.getElementById("signup-location-note");
    expect(note).not.toBeNull();
    expect(note.textContent).toMatch(/approximative/);
    expect(note.textContent).toMatch(/1 km/);
    expect(note.textContent).toMatch(/jamais montrée/);
  });

  it("natif : absente en connexion", () => {
    render(<Auth initialMode="signin" />);
    expect(document.getElementById("signup-location-note")).toBeNull();
  });

  it("web : aucune phrase ajoutée à l'inscription", () => {
    mocks.native = false;
    render(<Auth initialMode="signup" />);
    expect(document.getElementById("signup-location-note")).toBeNull();
    expect(screen.getByText("Créer mon compte")).toBeInTheDocument();
  });
});
