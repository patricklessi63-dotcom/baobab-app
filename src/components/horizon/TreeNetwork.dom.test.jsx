import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen, cleanup } from "@testing-library/react";
import TreeNetwork from "./TreeNetwork";

// jsdom n'a ni canvas, ni layout, ni observers : on les simule pour vérifier le
// cycle de vie (boucle rAF, pause, nettoyage) sans dessiner pour de vrai.
let ctx;
let rafCallbacks;
let rafId;
let rafSpy;
let cancelSpy;
let ros;
let ios;
let mqMatches;
let mqListeners;
let sizeW;
let sizeH;
let origGetContext;
let origRaf;
let origCancel;
let origMatchMedia;
let origRO;
let origIO;

function makeCtx() {
  const gradient = { addColorStop: vi.fn() };
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalCompositeOperation: "source-over",
  };
}

class FakeRO {
  constructor(cb) {
    this.cb = cb;
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    ros.push(this);
  }
}
class FakeIO {
  constructor(cb) {
    this.cb = cb;
    this.observe = vi.fn();
    this.disconnect = vi.fn();
    ios.push(this);
  }
}

// Joue l'image rAF en attente la plus récente avec un horodatage donné.
function runFrame(ts) {
  const entries = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  act(() => {
    for (const [, cb] of entries) cb(ts);
  });
}
const pendingFrames = () => rafCallbacks.size;
// Les nombres sont formatés en fr-CA ("1 163") : on retire tout sauf les chiffres.
const countBefore = (text, word) => Number(text.match(new RegExp("([\\d\\s\\u00a0\\u202f]+) " + word))[1].replace(/\D/g, ""));

beforeEach(() => {
  ctx = makeCtx();
  rafCallbacks = new Map();
  rafId = 0;
  ros = [];
  ios = [];
  mqMatches = false;
  mqListeners = [];
  sizeW = 900;
  sizeH = 520;

  origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => sizeW });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => sizeH });

  origRaf = window.requestAnimationFrame;
  origCancel = window.cancelAnimationFrame;
  rafSpy = vi.fn((cb) => {
    rafId += 1;
    rafCallbacks.set(rafId, cb);
    return rafId;
  });
  cancelSpy = vi.fn((id) => {
    rafCallbacks.delete(id);
  });
  window.requestAnimationFrame = rafSpy;
  window.cancelAnimationFrame = cancelSpy;

  origMatchMedia = window.matchMedia;
  window.matchMedia = vi.fn(() => ({
    get matches() {
      return mqMatches;
    },
    addEventListener: (_t, cb) => mqListeners.push(cb),
    removeEventListener: (_t, cb) => {
      mqListeners = mqListeners.filter((x) => x !== cb);
    },
  }));

  origRO = globalThis.ResizeObserver;
  origIO = globalThis.IntersectionObserver;
  globalThis.ResizeObserver = FakeRO;
  globalThis.IntersectionObserver = FakeIO;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
});

afterEach(() => {
  cleanup();
  HTMLCanvasElement.prototype.getContext = origGetContext;
  delete HTMLElement.prototype.clientWidth;
  delete HTMLElement.prototype.clientHeight;
  window.requestAnimationFrame = origRaf;
  window.cancelAnimationFrame = origCancel;
  window.matchMedia = origMatchMedia;
  globalThis.ResizeObserver = origRO;
  globalThis.IntersectionObserver = origIO;
  delete document.hidden;
  vi.useRealTimers();
});

describe("TreeNetwork", () => {
  it("monte sans erreur, expose une image décrite en français et lance la boucle", () => {
    render(<TreeNetwork />);
    const img = screen.getByRole("img");
    expect(img.tagName).toBe("CANVAS");
    expect(img).toHaveAttribute("aria-label", expect.stringMatching(/baobab/i));
    expect(img.getAttribute("aria-label")).toMatch(/racines/);
    expect(pendingFrames()).toBe(1);
    expect(ctx.clearRect).toHaveBeenCalledTimes(0);
    runFrame(16);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(pendingFrames()).toBe(1);
    // Les images suivantes continuent la boucle.
    runFrame(32);
    runFrame(48);
    expect(ctx.clearRect).toHaveBeenCalledTimes(3);
    expect(ctx.arc).toHaveBeenCalled();
  });

  it("des impulsions apparaissent et sont comptées quand showStats est actif", () => {
    render(<TreeNetwork showStats />);
    for (let i = 1; i <= 40; i++) runFrame(i * 16);
    const text = document.querySelector("p[aria-hidden='true']").textContent;
    expect(text).toMatch(/nœuds · .* liens · \d+ impulsions/);
    const pulses = countBefore(text, "impulsions");
    expect(pulses).toBeGreaterThan(0);
  });

  it("démontage : plus de rAF en attente, observers déconnectés, écouteurs retirés, plus aucun dessin", () => {
    const removeDoc = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<TreeNetwork />);
    expect(pendingFrames()).toBe(1);
    const staleFrame = Array.from(rafCallbacks.values())[0];
    unmount();
    expect(pendingFrames()).toBe(0);
    expect(cancelSpy).toHaveBeenCalled();
    expect(ros[0].disconnect).toHaveBeenCalledTimes(1);
    expect(ios[0].disconnect).toHaveBeenCalledTimes(1);
    expect(removeDoc).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(mqListeners.length).toBe(0);
    // Même si un callback rAF déjà parti arrivait après coup, rien ne se redessine ni ne se replanifie.
    const drawsBefore = ctx.clearRect.mock.calls.length;
    const rafBefore = rafSpy.mock.calls.length;
    staleFrame(999);
    expect(ctx.clearRect.mock.calls.length).toBe(drawsBefore);
    expect(rafSpy.mock.calls.length).toBe(rafBefore);
    removeDoc.mockRestore();
  });

  it("démontage avec écouteur resize quand ResizeObserver est absent", () => {
    delete globalThis.ResizeObserver;
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<TreeNetwork />);
    expect(add).toHaveBeenCalledWith("resize", expect.any(Function));
    unmount();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
    add.mockRestore();
    remove.mockRestore();
  });

  it("reduceMotion : une seule image fixe, aucune boucle rAF", () => {
    render(<TreeNetwork reduceMotion />);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(pendingFrames()).toBe(0);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  });

  it("prefers-reduced-motion : aucune boucle rAF non plus, et la préférence est suivie à chaud", () => {
    mqMatches = true;
    render(<TreeNetwork />);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    // L'utilisateur retire la préférence système : la boucle démarre.
    mqMatches = false;
    act(() => mqListeners.forEach((cb) => cb()));
    expect(pendingFrames()).toBe(1);
    // ... puis la remet : la boucle s'arrête.
    mqMatches = true;
    act(() => mqListeners.forEach((cb) => cb()));
    expect(pendingFrames()).toBe(0);
  });

  it("basculer reduceMotion arrête puis relance la boucle", () => {
    const { rerender } = render(<TreeNetwork />);
    expect(pendingFrames()).toBe(1);
    rerender(<TreeNetwork reduceMotion />);
    expect(pendingFrames()).toBe(0);
    const draws = ctx.clearRect.mock.calls.length;
    expect(draws).toBeGreaterThanOrEqual(1);
    rerender(<TreeNetwork reduceMotion={false} />);
    expect(pendingFrames()).toBe(1);
  });

  it("changer de zone ne plante pas, en animation comme en image fixe", () => {
    const { rerender } = render(<TreeNetwork zone={null} />);
    for (const z of [0, 1, 2, "racines", "tronc", "branches", "inconnue", null]) {
      expect(() => rerender(<TreeNetwork zone={z} />)).not.toThrow();
      runFrame(100);
    }
    cleanup();
    rafSpy.mockClear();
    const still = render(<TreeNetwork reduceMotion zone={null} />);
    const before = ctx.clearRect.mock.calls.length;
    for (const z of [0, 1, 2, null]) {
      expect(() => still.rerender(<TreeNetwork reduceMotion zone={z} />)).not.toThrow();
    }
    // En image fixe, chaque changement de zone redessine la scène.
    expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(before);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(pendingFrames()).toBe(0);
  });

  it("pause hors écran (IntersectionObserver), reprise au retour", () => {
    render(<TreeNetwork />);
    expect(pendingFrames()).toBe(1);
    act(() => ios[0].cb([{ isIntersecting: false }]));
    expect(pendingFrames()).toBe(0);
    act(() => ios[0].cb([{ isIntersecting: true }]));
    expect(pendingFrames()).toBe(1);
  });

  it("pause quand l'onglet est caché, reprise au retour", () => {
    render(<TreeNetwork />);
    expect(pendingFrames()).toBe(1);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pendingFrames()).toBe(0);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(pendingFrames()).toBe(1);
  });

  it("DPR plafonné à 2 et densité réduite sur petit écran", () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });
    sizeW = 900;
    sizeH = 520;
    const big = render(<TreeNetwork showStats reduceMotion />);
    const bigCanvas = big.container.querySelector("canvas");
    expect(bigCanvas.width).toBe(900 * 2);
    expect(bigCanvas.height).toBe(520 * 2);
    const bigNodes = countBefore(big.container.querySelector("p").textContent, "nœuds");
    big.unmount();

    sizeW = 360;
    sizeH = 340;
    const small = render(<TreeNetwork showStats reduceMotion />);
    const smallCanvas = small.container.querySelector("canvas");
    expect(smallCanvas.width).toBeLessThanOrEqual(Math.round(360 * 2));
    const smallNodes = countBefore(small.container.querySelector("p").textContent, "nœuds");
    expect(smallNodes).toBeLessThan(bigNodes * 0.6);
  });

  it("clic : une onde est lancée sans erreur (en animation et en image fixe)", () => {
    const { container, rerender } = render(<TreeNetwork />);
    const cv = container.querySelector("canvas");
    cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 520 });
    expect(() => {
      cv.dispatchEvent(new MouseEvent("pointerdown", { clientX: 450, clientY: 360, bubbles: true }));
      cv.dispatchEvent(new MouseEvent("pointermove", { clientX: 440, clientY: 350, bubbles: true }));
      runFrame(16);
      cv.dispatchEvent(new MouseEvent("pointerleave", { bubbles: true }));
    }).not.toThrow();
    rerender(<TreeNetwork reduceMotion />);
    expect(() => {
      cv.dispatchEvent(new MouseEvent("pointerdown", { clientX: 450, clientY: 360, bubbles: true }));
      cv.dispatchEvent(new MouseEvent("pointermove", { clientX: 440, clientY: 350, bubbles: true }));
    }).not.toThrow();
  });

  it("sans contexte 2D (navigateur sans canvas), ne plante pas et ne boucle pas", () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null);
    expect(() => render(<TreeNetwork />)).not.toThrow();
    expect(rafSpy).not.toHaveBeenCalled();
  });

  it("conteneur de taille nulle : rien n'est dessiné, pas de boucle", () => {
    sizeW = 0;
    sizeH = 0;
    render(<TreeNetwork />);
    expect(rafSpy).not.toHaveBeenCalled();
    expect(ctx.clearRect).not.toHaveBeenCalled();
  });
});
