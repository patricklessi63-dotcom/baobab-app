import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResumeTick } from "./useResumeTick";

// Reprise après veille (audit réseau, 6 oct. 2026) : un téléphone mis en veille
// n'émet aucun évènement `online`, mais le websocket Realtime est coupé. Le
// hook doit signaler le retour d'un onglet resté masqué plus de 60 s, sans
// s'agiter sur les allers-retours rapides.

let now;
let visibility;

function setVisibility(state) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  now = 1_000_000;
  visibility = "visible";
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete document.visibilityState;
});

describe("useResumeTick", () => {
  it("ne signale rien au montage", () => {
    const { result } = renderHook(() => useResumeTick());
    expect(result.current).toBe(0);
  });

  it("signale le retour après plus de 60 s en arrière-plan, sans aucun évènement online", () => {
    const { result } = renderHook(() => useResumeTick());
    act(() => setVisibility("hidden"));
    now += 61_000;
    act(() => setVisibility("visible"));
    expect(result.current).toBe(1);
  });

  it("ignore un aller-retour rapide (moins de 60 s)", () => {
    const { result } = renderHook(() => useResumeTick());
    act(() => setVisibility("hidden"));
    now += 20_000;
    act(() => setVisibility("visible"));
    expect(result.current).toBe(0);
  });

  it("une absence plus longue déclenche une nouvelle reprise à chaque retour", () => {
    const { result } = renderHook(() => useResumeTick());
    for (let i = 1; i <= 3; i += 1) {
      act(() => setVisibility("hidden"));
      now += 5 * 60_000;
      act(() => setVisibility("visible"));
      expect(result.current).toBe(i);
    }
  });

  it("limitation de fréquence : des retours trop rapprochés (< minIntervalMs) ne répètent pas le signal", () => {
    const { result } = renderHook(() => useResumeTick({ minAwayMs: 1000, minIntervalMs: 120_000 }));
    act(() => setVisibility("hidden"));
    now += 5_000;
    act(() => setVisibility("visible"));
    expect(result.current).toBe(1);
    act(() => setVisibility("hidden"));
    now += 5_000;
    act(() => setVisibility("visible"));
    expect(result.current).toBe(1);
  });

  it("démonté : plus d'écouteur actif", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useResumeTick());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
  });
});
