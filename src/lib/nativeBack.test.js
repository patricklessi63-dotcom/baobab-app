import { describe, it, expect, vi } from "vitest";

// startNativeBack importe nativeApp (qui n'importe @capacitor/app que par import() dynamique) :
// ici on teste seulement la logique pure.
vi.mock("./platform", () => ({ isNative: () => false, getPlatform: () => "web" }));

import { createBackHandler, ROOT_WINDOW_MS } from "./nativeBack";

function setup() {
  const calls = { goBack: 0, hint: 0, minimize: 0 };
  let t = 1000;
  const handle = createBackHandler({
    goBack: () => { calls.goBack += 1; },
    hint: () => { calls.hint += 1; },
    minimize: () => { calls.minimize += 1; },
    now: () => t,
  });
  return { calls, handle, advance: (ms) => { t += ms; } };
}

describe("createBackHandler", () => {
  it("l'historique peut reculer (modale, conversation, onglet ouverts) : retour d'historique, jamais de sortie", () => {
    const { calls, handle } = setup();
    handle({ canGoBack: true });
    handle({ canGoBack: true });
    expect(calls).toEqual({ goBack: 2, hint: 0, minimize: 0 });
  });

  it("racine : 1er appui = message, 2e appui rapide = minimiser", () => {
    const { calls, handle, advance } = setup();
    handle({ canGoBack: false });
    expect(calls).toEqual({ goBack: 0, hint: 1, minimize: 0 });
    advance(800);
    handle({ canGoBack: false });
    expect(calls).toEqual({ goBack: 0, hint: 1, minimize: 1 });
  });

  it("racine : le 2e appui trop tardif ne quitte pas, il ré-affiche le message", () => {
    const { calls, handle, advance } = setup();
    handle({ canGoBack: false });
    advance(ROOT_WINDOW_MS + 1);
    handle({ canGoBack: false });
    expect(calls).toEqual({ goBack: 0, hint: 2, minimize: 0 });
  });

  it("un retour qui ferme quelque chose remet le décompte « racine » à zéro", () => {
    const { calls, handle, advance } = setup();
    handle({ canGoBack: false }); // message
    advance(100);
    handle({ canGoBack: true });  // ferme une modale
    advance(100);
    handle({ canGoBack: false }); // nouveau 1er appui : message, pas de sortie
    expect(calls).toEqual({ goBack: 1, hint: 2, minimize: 0 });
  });

  it("appel sans argument, ou callbacks qui lèvent : jamais d'exception", () => {
    const handle = createBackHandler({ goBack: () => { throw new Error("x"); }, hint: () => { throw new Error("y"); }, minimize: () => {} });
    expect(() => handle()).not.toThrow();
    expect(() => handle({ canGoBack: true })).not.toThrow();
  });
});
