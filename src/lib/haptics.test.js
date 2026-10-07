import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const plat = vi.hoisted(() => ({ native: true }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => (plat.native ? "android" : "web") }));

const haptics = vi.hoisted(() => {
  const h = { loaded: 0, thenReads: 0, impact: null, notification: null };
  return h;
});
vi.mock("@capacitor/haptics", () => {
  haptics.loaded += 1;
  return {
    Haptics: new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") { haptics.thenReads += 1; return (_r, rej) => rej({ code: "UNIMPLEMENTED" }); }
        if (prop === "impact") return haptics.impact;
        if (prop === "notification") return haptics.notification;
        return undefined;
      },
    }),
    ImpactStyle: { Light: "LIGHT" },
    NotificationType: { Success: "SUCCESS", Error: "ERROR" },
  };
});

import { hapticLight, hapticSuccess, hapticError, _resetHapticsForTests } from "./haptics";

const flush = () => new Promise((r) => setTimeout(r, 10));
const unhandled = [];
const onUnhandled = (r) => unhandled.push(r);

// Environnement node : on fournit un faux window (les tests DOM n'ont pas besoin d'être en jsdom ici).
function stubMatchMedia(reduced) {
  vi.stubGlobal("window", { matchMedia: (q) => ({ matches: reduced && /reduced-motion/.test(q), media: q }) });
}

beforeEach(() => {
  plat.native = true;
  haptics.impact = vi.fn(async () => {});
  haptics.notification = vi.fn(async () => {});
  haptics.thenReads = 0;
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
  _resetHapticsForTests();
  stubMatchMedia(false);
});
afterEach(() => { process.off("unhandledRejection", onUnhandled); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("haptics", () => {
  it("natif : léger = impact Light, réussite et erreur = notification", async () => {
    hapticLight(); await flush();
    expect(haptics.impact).toHaveBeenCalledWith({ style: "LIGHT" });
    _resetHapticsForTests();
    hapticSuccess(); await flush();
    expect(haptics.notification).toHaveBeenLastCalledWith({ type: "SUCCESS" });
    _resetHapticsForTests();
    hapticError(); await flush();
    expect(haptics.notification).toHaveBeenLastCalledWith({ type: "ERROR" });
    expect(haptics.thenReads).toBe(0);
  });

  it("tire et oublie : renvoie undefined immédiatement", async () => {
    expect(hapticLight()).toBeUndefined();
    expect(hapticSuccess()).toBeUndefined();
    expect(hapticError()).toBeUndefined();
    await flush(); // laisse finir l'appel natif simulé avant le test suivant
  });

  it("web : aucun appel, plugin jamais chargé", async () => {
    plat.native = false;
    const before = haptics.loaded;
    hapticLight(); hapticSuccess(); hapticError();
    await flush();
    expect(haptics.loaded).toBe(before);
    expect(haptics.impact).not.toHaveBeenCalled();
    expect(haptics.notification).not.toHaveBeenCalled();
  });

  it("prefers-reduced-motion : aucun retour haptique", async () => {
    stubMatchMedia(true);
    hapticLight(); hapticSuccess(); hapticError();
    await flush();
    expect(haptics.impact).not.toHaveBeenCalled();
    expect(haptics.notification).not.toHaveBeenCalled();
  });

  it("jamais d'exception ni de rejet non géré si le plugin échoue ou n'a pas de vibreur", async () => {
    haptics.impact = vi.fn(async () => { throw new Error("pas de vibreur"); });
    haptics.notification = vi.fn(() => { throw new Error("sync"); });
    expect(() => { hapticLight(); hapticSuccess(); hapticError(); }).not.toThrow();
    await flush();
    expect(unhandled).toEqual([]);
  });

  it("matchMedia absent ou qui lève : on vibre quand même (natif), sans exception", async () => {
    vi.stubGlobal("window", { matchMedia: () => { throw new Error("boom"); } });
    hapticLight(); await flush();
    expect(haptics.impact).toHaveBeenCalledTimes(1);
  });

  it("anti-rafale : deux évènements rapprochés = un seul retour", async () => {
    hapticLight(); hapticSuccess(); await flush();
    expect(haptics.impact).toHaveBeenCalledTimes(1);
    expect(haptics.notification).not.toHaveBeenCalled();
  });
});
