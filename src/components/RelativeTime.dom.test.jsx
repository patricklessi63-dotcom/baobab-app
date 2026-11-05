import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import RelativeTime from "./RelativeTime";
import { formatLastSeen } from "../utils/format";
import { formatNotifAge } from "../lib/notificationLabels";

const NOW = new Date("2026-11-05T12:00:00Z").getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

describe("RelativeTime — l'heure relative vieillit toute seule", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { cleanup(); vi.useRealTimers(); Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); });

  it("« Vu il y a 5 min » devient « Vu il y a 6 min » une minute plus tard, sans rien d'autre", () => {
    render(<RelativeTime value={ago(5 * 60000)} format={formatLastSeen} />);
    expect(screen.getByText("Vu il y a 5 min")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(60 * 1000); });
    expect(screen.getByText("Vu il y a 6 min")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(4 * 60 * 1000); });
    expect(screen.getByText("Vu il y a 10 min")).toBeInTheDocument();
  });

  it("« à l'instant » passe à « il y a 1 min » puis monte en heures", () => {
    render(<RelativeTime value={ago(10 * 1000)} format={formatNotifAge} />);
    const first = document.body.textContent;
    act(() => { vi.advanceTimersByTime(2 * 60 * 1000); });
    expect(document.body.textContent).not.toBe(first);
    act(() => { vi.advanceTimersByTime(60 * 60 * 1000); });
    expect(document.body.textContent).toMatch(/h/);
  });

  it("onglet caché : aucun minuteur ; au retour, mise à jour immédiate", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<RelativeTime value={ago(5 * 60000)} format={formatLastSeen} />);
    act(() => { vi.advanceTimersByTime(10 * 60 * 1000); });
    expect(screen.getByText("Vu il y a 5 min")).toBeInTheDocument(); // rien n'a tourné
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.getByText("Vu il y a 15 min")).toBeInTheDocument();
  });

  it("démontage : le minuteur est arrêté", () => {
    const clear = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = render(<RelativeTime value={ago(60000)} format={formatLastSeen} />);
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
