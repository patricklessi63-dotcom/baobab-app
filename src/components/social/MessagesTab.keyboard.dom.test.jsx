import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { computeKeyboardViewport } from "../../lib/keyboardViewport";

const paneProps = vi.hoisted(() => ({ last: null }));
vi.mock("./ConversationPane", () => ({ default: (props) => { paneProps.last = props; return <div>pane</div>; } }));

import MessagesTab from "./MessagesTab";

// Clavier virtuel (mobile web) : la conversation doit occuper la zone visible au-dessus du
// clavier. Aucune émulation de clavier réel possible en jsdom : on simule le visual viewport.

function installVisualViewport(initial) {
  const vv = new EventTarget();
  Object.assign(vv, { height: initial.height, offsetTop: initial.offsetTop ?? 0, scale: initial.scale ?? 1 });
  Object.defineProperty(window, "visualViewport", { configurable: true, value: vv });
  const set = (patch, type = "resize") => { Object.assign(vv, patch); act(() => { vv.dispatchEvent(new Event(type)); }); };
  return { vv, set };
}

const base = { matches: [{ id: "u2", name: "Alice" }], currentUser: { id: "u1" }, goTab: vi.fn(), onSelectMatch: vi.fn(), messages: [] };
const setWindow = (w, h) => { window.innerWidth = w; window.innerHeight = h; };

afterEach(() => { delete window.visualViewport; setWindow(1024, 768); });

describe("computeKeyboardViewport", () => {
  it("clavier ouvert : renvoie la zone visible", () => {
    expect(computeKeyboardViewport({ innerHeight: 800, vvHeight: 480, vvOffsetTop: 0 })).toEqual({ top: 0, height: 480 });
    expect(computeKeyboardViewport({ innerHeight: 800, vvHeight: 480, vvOffsetTop: 63.4 })).toEqual({ top: 63, height: 480 });
  });
  it("pas de clavier : null (barre d'adresse qui se replie < 120 px)", () => {
    expect(computeKeyboardViewport({ innerHeight: 800, vvHeight: 800 })).toBeNull();
    expect(computeKeyboardViewport({ innerHeight: 800, vvHeight: 720 })).toBeNull();
  });
  it("application native (WebView redimensionnée : innerHeight rétrécit avec le clavier) : inerte", () => {
    expect(computeKeyboardViewport({ innerHeight: 480, vvHeight: 480 })).toBeNull();
  });
  it("zoom pincé (scale > 1) : jamais pris pour un clavier", () => {
    expect(computeKeyboardViewport({ innerHeight: 800, vvHeight: 400, vvScale: 2 })).toBeNull();
  });
  it("valeurs invalides : null", () => {
    expect(computeKeyboardViewport({ innerHeight: NaN, vvHeight: 400 })).toBeNull();
    expect(computeKeyboardViewport({ innerHeight: 800, vvHeight: undefined })).toBeNull();
  });
});

describe("MessagesTab — clavier virtuel", () => {
  it("ouverture : la conversation passe en position fixe sur la zone visible ; fermeture : retour à la mise en page normale", () => {
    setWindow(375, 812);
    const { vv, set } = installVisualViewport({ height: 812 });
    const { container } = render(<MessagesTab {...base} activeMatch={base.matches[0]} />);
    const pane = () => container.querySelector(".bb-msg-h");
    expect(pane().style.position).toBe("");
    expect(paneProps.last.keyboardOpen).toBe(false);

    set({ height: 480, offsetTop: 0 });
    expect(pane().style.position).toBe("fixed");
    expect(pane().style.height).toBe("480px");
    expect(pane().style.top).toBe("0px");
    expect(pane().getAttribute("data-keyboard-open")).toBe("true");
    expect(paneProps.last.keyboardOpen).toBe(true);

    // iOS fait défiler le visual viewport : la conversation le suit.
    set({ offsetTop: 40 }, "scroll");
    expect(pane().style.top).toBe("40px");

    set({ height: 812, offsetTop: 0 });
    expect(pane().style.position).toBe("");
    expect(paneProps.last.keyboardOpen).toBe(false);
    expect(vv).toBeTruthy();
  });

  it("bureau (≥ 768 px) : jamais de mise en page clavier", () => {
    setWindow(1280, 900);
    const { set } = installVisualViewport({ height: 900 });
    const { container } = render(<MessagesTab {...base} activeMatch={base.matches[0]} />);
    set({ height: 500 });
    expect(container.querySelector(".bb-msg-h").style.position).toBe("");
  });

  it("liste des conversations (aucune conversation ouverte) : rien n'est suivi", () => {
    setWindow(375, 812);
    const { set } = installVisualViewport({ height: 812 });
    render(<MessagesTab {...base} activeMatch={null} />);
    set({ height: 400 });
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(document.querySelector("[data-keyboard-open]")).toBeNull();
  });

  it("navigateur sans visualViewport : aucun effet, aucune erreur", () => {
    setWindow(375, 812);
    const { container } = render(<MessagesTab {...base} activeMatch={base.matches[0]} />);
    expect(container.querySelector(".bb-msg-h").style.position).toBe("");
  });

  it("nettoie ses écouteurs au démontage", () => {
    setWindow(375, 812);
    const { vv } = installVisualViewport({ height: 812 });
    const remove = vi.spyOn(vv, "removeEventListener");
    const { unmount } = render(<MessagesTab {...base} activeMatch={base.matches[0]} />);
    unmount();
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(["resize", "scroll"]);
  });
});
