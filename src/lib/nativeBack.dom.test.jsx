import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, waitFor, cleanup } from "@testing-library/react";

// Bouton Retour d'Android, de bout en bout avec la VRAIE pile de retour de l'app
// (hooks/useEscapeKey.js) et un @capacitor/app simulé : modale -> conversation -> racine.

const plat = vi.hoisted(() => ({ native: true }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => (plat.native ? "android" : "web") }));

const appPlugin = vi.hoisted(() => ({
  loaded: 0,
  listeners: {},
  removed: 0,
  minimizeApp: vi.fn(async () => {}),
  addListener: vi.fn(async (name, cb) => {
    appPlugin.listeners[name] = cb;
    return { remove: async () => { appPlugin.removed += 1; delete appPlugin.listeners[name]; } };
  }),
}));
vi.mock("@capacitor/app", () => {
  appPlugin.loaded += 1;
  return { App: appPlugin };
});

import { useEscapeKey } from "../hooks/useEscapeKey";
import { useNativeBack } from "../hooks/useNativeBack";
import { ROOT_HINT } from "./nativeBack";

function Harness() {
  useNativeBack();
  const [chat, setChat] = useState(false);
  const [modal, setModal] = useState(false);
  useEscapeKey(chat, () => setChat(false));
  useEscapeKey(modal, () => setModal(false));
  return (
    <div>
      <button onClick={() => setChat(true)}>ouvrir conversation</button>
      <button onClick={() => setModal(true)}>ouvrir modale</button>
      {chat && <div data-testid="chat">conversation</div>}
      {modal && <div data-testid="modal" role="dialog" aria-modal="true">modale</div>}
    </div>
  );
}

const press = async (canGoBack) => {
  await act(async () => { appPlugin.listeners.backButton?.({ canGoBack }); });
};

beforeEach(() => {
  plat.native = true;
  appPlugin.listeners = {};
  appPlugin.removed = 0;
  appPlugin.minimizeApp.mockClear();
  appPlugin.addListener.mockClear();
});
afterEach(() => { cleanup(); document.querySelectorAll("[data-bb-back-hint]").forEach((n) => n.remove()); });

describe("bouton Retour Android", () => {
  it("modale ouverte par-dessus une conversation : retour ferme la modale, puis la conversation, puis la racine demande un 2e appui", async () => {
    render(<Harness />);
    await waitFor(() => expect(appPlugin.listeners.backButton).toBeTypeOf("function"));
    await act(async () => { screen.getByText("ouvrir conversation").click(); });
    await act(async () => { screen.getByText("ouvrir modale").click(); });
    expect(screen.getByTestId("chat")).toBeTruthy();
    expect(screen.getByTestId("modal")).toBeTruthy();

    // « canGoBack » vaut true côté Android tant que des entrées d'historique ont été poussées.
    await press(true);
    await waitFor(() => expect(screen.queryByTestId("modal")).toBeNull());
    expect(screen.getByTestId("chat")).toBeTruthy(); // un seul niveau à la fois

    await press(true);
    await waitFor(() => expect(screen.queryByTestId("chat")).toBeNull());
    expect(appPlugin.minimizeApp).not.toHaveBeenCalled();

    // Racine : plus rien à fermer (canGoBack false).
    await press(false);
    expect(screen.getByRole("status").textContent).toBe(ROOT_HINT);
    expect(appPlugin.minimizeApp).not.toHaveBeenCalled();
    await press(false);
    expect(appPlugin.minimizeApp).toHaveBeenCalledTimes(1);
  });

  it("le message de racine disparaît tout seul", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    try {
      render(<Harness />);
      await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      expect(appPlugin.listeners.backButton).toBeTypeOf("function");
      await press(false);
      expect(document.querySelector("[data-bb-back-hint]")).not.toBeNull();
      await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
      expect(document.querySelector("[data-bb-back-hint]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("démontage : l'écouteur est retiré (le comportement par défaut de Capacitor revient)", async () => {
    const { unmount } = render(<Harness />);
    await waitFor(() => expect(appPlugin.listeners.backButton).toBeTypeOf("function"));
    unmount();
    await waitFor(() => expect(appPlugin.removed).toBe(1));
  });

  it("web : aucun écouteur et @capacitor/app n'est jamais importé", async () => {
    plat.native = false;
    const loadedBefore = appPlugin.loaded;
    render(<Harness />);
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(appPlugin.addListener).not.toHaveBeenCalled();
    expect(appPlugin.listeners.backButton).toBeUndefined();
    expect(appPlugin.loaded).toBe(loadedBefore);
  });
});
