import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePullToRefresh } from "./usePullToRefresh";

// Les événements tactiles sont simulés par de simples Event portant `touches`
// (jsdom n'a pas de constructeur Touch utilisable).
function touch(type, { x = 100, y = 0, target = document.body, touches } = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  ev.touches = touches ?? (type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }]);
  act(() => { target.dispatchEvent(ev); });
  return ev;
}

function setPageScrollTop(value) {
  Object.defineProperty(document.documentElement, "scrollTop", { value, configurable: true, writable: true });
}

beforeEach(() => {
  setPageScrollTop(0);
  document.body.innerHTML = "";
});
afterEach(() => {
  setPageScrollTop(0);
  document.documentElement.style.overscrollBehaviorY = "";
  document.body.innerHTML = "";
});

const flushRefresh = () => act(async () => { await new Promise((r) => setTimeout(r, 650)); });

describe("usePullToRefresh", () => {
  it("un tirage >= 70 px depuis le haut de page appelle onRefresh une seule fois", async () => {
    const onRefresh = vi.fn(async () => {});
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 });
    touch("touchmove", { y: 150 });
    expect(result.current.pull).toBe(50);
    touch("touchmove", { y: 185 });
    expect(result.current.pull).toBe(85);
    touch("touchend");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.pull).toBe(0);
    expect(result.current.refreshing).toBe(true);
    await flushRefresh();
    expect(result.current.refreshing).toBe(false);
  });

  it("un tirage trop court (< 70 px) ne rafraîchit pas et l'indicateur revient à 0", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 });
    touch("touchmove", { y: 150 });
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
    expect(result.current.pull).toBe(0);
  });

  it("ne bloque jamais le défilement : aucun preventDefault, quel que soit le geste", () => {
    renderHook(() => usePullToRefresh({ onRefresh: vi.fn() }));
    const a = touch("touchstart", { y: 100 });
    const b = touch("touchmove", { y: 200 });
    const c = touch("touchend");
    expect([a, b, c].map((e) => e.defaultPrevented)).toEqual([false, false, false]);
  });

  it("geste vers le haut (défilement normal) : ignoré", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 300 });
    touch("touchmove", { y: 200 });
    expect(result.current.pull).toBe(0);
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("page déjà défilée : le geste ne compte pas", () => {
    setPageScrollTop(40);
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 });
    touch("touchmove", { y: 260 });
    expect(result.current.pull).toBe(0);
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("la page quitte le haut en cours de geste : annulé", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 });
    touch("touchmove", { y: 140 });
    expect(result.current.pull).toBe(40);
    setPageScrollTop(10);
    touch("touchmove", { y: 260 });
    expect(result.current.pull).toBe(0);
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("geste plutôt horizontal (rangée de stories) : ignoré", () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { x: 50, y: 100 });
    touch("touchmove", { x: 250, y: 190 });
    expect(result.current.pull).toBe(0);
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("deux doigts (pincement) : ignoré", () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { touches: [{ clientX: 10, clientY: 100 }, { clientX: 90, clientY: 100 }] });
    touch("touchmove", { y: 300 });
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("conteneur défilant ancêtre déjà défilé : ignoré", () => {
    const list = document.createElement("div");
    list.style.overflowY = "auto";
    Object.defineProperty(list, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 300, configurable: true });
    Object.defineProperty(list, "scrollTop", { value: 120, configurable: true });
    const child = document.createElement("div");
    list.appendChild(child);
    document.body.appendChild(list);
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100, target: child });
    touch("touchmove", { y: 250, target: child });
    touch("touchend", { target: child });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("boîte de dialogue modale ouverte : ignoré", () => {
    const dlg = document.createElement("div");
    dlg.setAttribute("aria-modal", "true");
    document.body.appendChild(dlg);
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 });
    touch("touchmove", { y: 250 });
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("enabled=false : aucun écouteur, overscroll-behavior intact", () => {
    const onRefresh = vi.fn();
    renderHook(() => usePullToRefresh({ onRefresh, enabled: false }));
    expect(document.documentElement.style.overscrollBehaviorY).toBe("");
    touch("touchstart", { y: 100 });
    touch("touchmove", { y: 250 });
    touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("pose overscroll-behavior-y: contain tant qu'il est actif, puis restaure", () => {
    document.documentElement.style.overscrollBehaviorY = "auto";
    const { unmount, rerender } = renderHook(({ enabled }) => usePullToRefresh({ onRefresh: vi.fn(), enabled }), { initialProps: { enabled: true } });
    expect(document.documentElement.style.overscrollBehaviorY).toBe("contain");
    rerender({ enabled: false });
    expect(document.documentElement.style.overscrollBehaviorY).toBe("auto");
    rerender({ enabled: true });
    expect(document.documentElement.style.overscrollBehaviorY).toBe("contain");
    unmount();
    expect(document.documentElement.style.overscrollBehaviorY).toBe("auto");
  });

  it("pendant un rafraîchissement, un nouveau tirage est ignoré", async () => {
    let resolve;
    const onRefresh = vi.fn(() => new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 }); touch("touchmove", { y: 200 }); touch("touchend");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(true);
    touch("touchstart", { y: 100 }); touch("touchmove", { y: 200 }); touch("touchend");
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
    await flushRefresh();
    expect(result.current.refreshing).toBe(false);
  });

  it("un onRefresh qui échoue ne casse rien et l'indicateur se termine", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRefresh = vi.fn(async () => { throw new Error("réseau"); });
    const { result } = renderHook(() => usePullToRefresh({ onRefresh }));
    touch("touchstart", { y: 100 }); touch("touchmove", { y: 200 }); touch("touchend");
    await flushRefresh();
    expect(result.current.refreshing).toBe(false);
    err.mockRestore();
  });

  it("démontage : écouteurs retirés", () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() => usePullToRefresh({ onRefresh }));
    unmount();
    touch("touchstart", { y: 100 }); touch("touchmove", { y: 250 }); touch("touchend");
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
