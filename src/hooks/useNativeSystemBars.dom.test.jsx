import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const plat = vi.hoisted(() => ({ native: false }));
vi.mock("../lib/platform", () => ({ isNative: () => plat.native, getPlatform: () => "android" }));
const ui = vi.hoisted(() => ({
  syncSystemBarsWithScreen: vi.fn(async () => {}),
  hideSplash: vi.fn(async () => {}),
  setupKeyboardGuard: vi.fn(async () => () => {}),
}));
vi.mock("../lib/nativeUi", () => ui);

import { useNativeSystemBars } from "./useNativeSystemBars";

beforeEach(() => {
  plat.native = false;
  Object.values(ui).forEach((f) => f.mockClear());
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => { vi.useRealTimers(); });

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useNativeSystemBars", () => {
  it("web : no-op complet (aucun appel, aucun observateur déclenché)", async () => {
    renderHook(() => useNativeSystemBars({ ready: true }));
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("root").appendChild(document.createElement("div"));
    await act(async () => { await new Promise((r) => setTimeout(r, 450)); });
    expect(ui.syncSystemBarsWithScreen).not.toHaveBeenCalled();
    expect(ui.hideSplash).not.toHaveBeenCalled();
    expect(ui.setupKeyboardGuard).not.toHaveBeenCalled();
    document.documentElement.removeAttribute("data-theme");
  });

  it("natif : synchronise au montage, masque le splash quand prêt, active le garde-fou clavier", async () => {
    plat.native = true;
    const { rerender } = renderHook(({ ready }) => useNativeSystemBars({ ready }), { initialProps: { ready: false } });
    expect(ui.syncSystemBarsWithScreen).toHaveBeenCalledTimes(1);
    expect(ui.setupKeyboardGuard).toHaveBeenCalledTimes(1);
    expect(ui.hideSplash).not.toHaveBeenCalled();
    rerender({ ready: true });
    expect(ui.hideSplash).toHaveBeenCalledTimes(1);
  });

  it("natif : un changement de thème resynchronise (anti-rebond)", async () => {
    plat.native = true;
    renderHook(() => useNativeSystemBars({ ready: true }));
    ui.syncSystemBarsWithScreen.mockClear();
    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dark");
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(ui.syncSystemBarsWithScreen).toHaveBeenCalledTimes(1);
    document.documentElement.removeAttribute("data-theme");
  });

  it("natif : un changement d'écran (DOM de #root) resynchronise, sans rafale", async () => {
    plat.native = true;
    renderHook(() => useNativeSystemBars({ ready: true }));
    ui.syncSystemBarsWithScreen.mockClear();
    await act(async () => {
      const root = document.getElementById("root");
      root.appendChild(document.createElement("div"));
      await flush();
      root.appendChild(document.createElement("div"));
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(ui.syncSystemBarsWithScreen).toHaveBeenCalledTimes(1);
  });

  it("démontage : plus aucune synchronisation", async () => {
    plat.native = true;
    const { unmount } = renderHook(() => useNativeSystemBars({ ready: true }));
    unmount();
    ui.syncSystemBarsWithScreen.mockClear();
    await act(async () => {
      document.getElementById("root").appendChild(document.createElement("div"));
      await new Promise((r) => setTimeout(r, 450));
    });
    expect(ui.syncSystemBarsWithScreen).not.toHaveBeenCalled();
  });
});
