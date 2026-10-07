import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const plat = vi.hoisted(() => ({ native: false }));
vi.mock("../lib/platform", () => ({ isNative: () => plat.native, getPlatform: () => (plat.native ? "android" : "web") }));
const cap = vi.hoisted(() => ({ cb: null, remove: vi.fn(), addListener: vi.fn() }));
vi.mock("@capacitor/app", () => ({ App: { addListener: cap.addListener } }));

import { useResumeTick } from "./useResumeTick";

let now;
let visibility;
const setVisibility = (v) => { visibility = v; document.dispatchEvent(new Event("visibilitychange")); };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

beforeEach(() => {
  now = 1_000_000;
  visibility = "visible";
  plat.native = false;
  cap.cb = null;
  cap.remove.mockClear();
  cap.addListener.mockReset();
  cap.addListener.mockImplementation(async (name, fn) => { if (name === "appStateChange") cap.cb = fn; return { remove: cap.remove }; });
  vi.spyOn(Date, "now").mockImplementation(() => now);
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => { vi.restoreAllMocks(); delete document.visibilityState; });

describe("useResumeTick — app native (appStateChange)", () => {
  it("un retour actif après > 60 s déclenche le même rattrapage que le retour de visibilité", async () => {
    plat.native = true;
    const { result } = renderHook(() => useResumeTick());
    await flush();
    act(() => cap.cb({ isActive: false }));
    now += 61_000;
    act(() => cap.cb({ isActive: true }));
    expect(result.current).toBe(1);
  });

  it("aller-retour rapide (< 60 s) : rien", async () => {
    plat.native = true;
    const { result } = renderHook(() => useResumeTick());
    await flush();
    act(() => cap.cb({ isActive: false }));
    now += 10_000;
    act(() => cap.cb({ isActive: true }));
    expect(result.current).toBe(0);
  });

  it("appStateChange ET visibilitychange pour le MÊME retour : un seul rattrapage", async () => {
    plat.native = true;
    const { result } = renderHook(() => useResumeTick());
    await flush();
    act(() => { cap.cb({ isActive: false }); setVisibility("hidden"); });
    now += 5 * 60_000;
    act(() => { cap.cb({ isActive: true }); setVisibility("visible"); });
    expect(result.current).toBe(1);
    // et dans l'autre ordre
    act(() => { setVisibility("hidden"); cap.cb({ isActive: false }); });
    now += 5 * 60_000;
    act(() => { setVisibility("visible"); cap.cb({ isActive: true }); });
    expect(result.current).toBe(2);
  });

  it("démontage : l'écouteur natif est retiré", async () => {
    plat.native = true;
    const { unmount } = renderHook(() => useResumeTick());
    await flush();
    unmount();
    expect(cap.remove).toHaveBeenCalledTimes(1);
  });
});

describe("useResumeTick — web : le plugin natif n'est jamais chargé", () => {
  it("aucun appel à @capacitor/app, comportement visibilitychange inchangé", async () => {
    const { result } = renderHook(() => useResumeTick());
    await flush();
    act(() => setVisibility("hidden"));
    now += 61_000;
    act(() => setVisibility("visible"));
    expect(result.current).toBe(1);
    expect(cap.addListener).not.toHaveBeenCalled();
  });
});
