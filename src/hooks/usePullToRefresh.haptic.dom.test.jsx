import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Tirer pour rafraîchir : un petit retour haptique (natif) quand le geste DÉCLENCHE le rechargement,
// jamais pour un tirage trop court.
const haptics = vi.hoisted(() => ({ hapticLight: vi.fn() }));
vi.mock("../lib/haptics", () => haptics);

import { usePullToRefresh } from "./usePullToRefresh";

function touch(type, { y = 0 } = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.touches = type === "touchend" ? [] : [{ clientX: 100, clientY: y }];
  act(() => { document.body.dispatchEvent(ev); });
}

beforeEach(() => {
  haptics.hapticLight.mockClear();
  Object.defineProperty(document.documentElement, "scrollTop", { value: 0, configurable: true, writable: true });
});

describe("usePullToRefresh : haptique", () => {
  it("tirage suffisant : un retour léger et onRefresh appelé", () => {
    const onRefresh = vi.fn(async () => {});
    renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 }); touch("touchmove", { y: 190 }); touch("touchend");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(haptics.hapticLight).toHaveBeenCalledTimes(1);
  });

  it("tirage trop court : aucun retour haptique", () => {
    renderHook(() => usePullToRefresh({ onRefresh: vi.fn() }));
    touch("touchstart", { y: 100 }); touch("touchmove", { y: 130 }); touch("touchend");
    expect(haptics.hapticLight).not.toHaveBeenCalled();
  });
});
