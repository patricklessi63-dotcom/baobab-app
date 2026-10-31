import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Intégration : vraie page + vrai arbre (chargé en lazy), canvas et rAF simulés.
vi.mock("../../supabaseClient", () => ({ supabase: { rpc: () => Promise.resolve({ data: null, error: null }) } }));

import LandingPage from "./LandingPage";
import { REDUCE_MOTION_KEY } from "../../components/horizon/useReduceMotion";

let frames;
let nextId;
let rafSpy;
let ctxStub;
let origGetContext;
let origRaf;
let origCancel;
let origRO;
let origIO;

beforeEach(() => {
  localStorage.clear();
  frames = new Map();
  nextId = 0;
  const gradient = { addColorStop: vi.fn() };
  ctxStub = new Proxy(
    { createLinearGradient: () => gradient },
    { get: (t, k) => (k in t ? t[k] : vi.fn()), set: () => true }
  );
  origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 500 });
  origRaf = window.requestAnimationFrame;
  origCancel = window.cancelAnimationFrame;
  rafSpy = vi.fn((cb) => {
    frames.set(++nextId, cb);
    return nextId;
  });
  window.requestAnimationFrame = rafSpy;
  window.cancelAnimationFrame = (id) => frames.delete(id);
  origRO = globalThis.ResizeObserver;
  origIO = globalThis.IntersectionObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext;
  delete HTMLElement.prototype.clientWidth;
  delete HTMLElement.prototype.clientHeight;
  window.requestAnimationFrame = origRaf;
  window.cancelAnimationFrame = origCancel;
  globalThis.ResizeObserver = origRO;
  globalThis.IntersectionObserver = origIO;
  localStorage.clear();
});

const props = () => ({ onLogin: vi.fn(), onSignup: vi.fn(), navigate: vi.fn() });
const canvas = (container) => container.querySelector("canvas");

describe("LandingPage Horizon : arbre réel", () => {
  it("affiche d'abord le repli SVG (texte déjà visible), puis le canvas animé", async () => {
    const { container } = render(<LandingPage {...props()} />);
    // Avant le chargement du chunk : repli SVG décrit, titre déjà lisible.
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    expect(container.querySelector(".hz-stage svg[role='img']")).toBeInTheDocument();
    await waitFor(() => expect(canvas(container)).toBeInTheDocument());
    expect(container.querySelector(".hz-stage svg[role='img']")).not.toBeInTheDocument();
    expect(canvas(container)).toHaveAttribute("aria-label", expect.stringMatching(/baobab.*points lumineux/i));
    expect(rafSpy).toHaveBeenCalled();
    expect(frames.size).toBe(1);
  });

  it("« Réduire les animations » arrête la boucle, persiste, et la relance quand on la rétablit", async () => {
    const user = userEvent.setup();
    const { container } = render(<LandingPage {...props()} />);
    await waitFor(() => expect(canvas(container)).toBeInTheDocument());
    expect(frames.size).toBe(1);

    await user.click(screen.getByRole("switch", { name: "Réduire les animations" }));
    expect(frames.size).toBe(0);
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBe("1");
    const before = rafSpy.mock.calls.length;
    // Plus aucune image n'est demandée tant que la préférence est active.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(rafSpy.mock.calls.length).toBe(before);

    await user.click(screen.getByRole("switch", { name: "Réduire les animations" }));
    expect(frames.size).toBe(1);
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBeNull();
  });

  it("si la préférence est déjà enregistrée, aucune boucle n'est jamais lancée", async () => {
    localStorage.setItem(REDUCE_MOTION_KEY, "1");
    const { container } = render(<LandingPage {...props()} />);
    await waitFor(() => expect(canvas(container)).toBeInTheDocument());
    expect(rafSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Réduire les animations" })).toHaveAttribute("aria-checked", "true");
  });

  it("démonter la page ne laisse aucune image en attente", async () => {
    const { container, unmount } = render(<LandingPage {...props()} />);
    await waitFor(() => expect(canvas(container)).toBeInTheDocument());
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it("un bouton de zone n'interrompt pas l'arbre (pas d'erreur, boucle intacte)", async () => {
    const user = userEvent.setup();
    const { container } = render(<LandingPage {...props()} />);
    await waitFor(() => expect(canvas(container)).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Branches" }));
    expect(screen.getByRole("button", { name: "Branches" })).toHaveAttribute("aria-pressed", "true");
    expect(frames.size).toBe(1);
  });
});
