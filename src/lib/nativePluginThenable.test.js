import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Régression : les plugins Capacitor sont des Proxy qui répondent à N'IMPORTE QUELLE propriété.
// Renvoyer le proxy NU d'une fonction async (ou d'un .then) fait lire sa propriété « then » à la
// résolution de la promesse ; sans implémentation (web, tests) Capacitor la fait rejeter avec
// « "Geolocation.then()" is not implemented on web » (code UNIMPLEMENTED), rejet non géré.
// Ici chaque plugin est un faux proxy qui COMPTE les lectures de « then » et rejette comme le vrai.

const plat = vi.hoisted(() => ({ native: true, platform: "android" }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => plat.platform }));

const trap = vi.hoisted(() => {
  const thenReads = {};
  function makePlugin(name, impls) {
    thenReads[name] = 0;
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          thenReads[name] += 1;
          // Comme Capacitor : la méthode « then » d'un plugin non implémenté rejette.
          return (_res, rej) => rej({ code: "UNIMPLEMENTED", message: `"${name}.then()" is not implemented on web` });
        }
        if (typeof prop === "symbol") return undefined;
        if (impls[prop]) return impls[prop];
        return async () => ({});
      },
    });
  }
  return { thenReads, makePlugin };
});

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: trap.makePlugin("Geolocation", {
    checkPermissions: async () => ({ location: "granted", coarseLocation: "granted" }),
    getCurrentPosition: async () => ({ coords: { latitude: 45.5, longitude: -73.5 } }),
  }),
}));
vi.mock("@capacitor/camera", () => ({
  Camera: trap.makePlugin("Camera", { checkPermissions: async () => ({ camera: "granted" }) }),
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: trap.makePlugin("PushNotifications", {
    checkPermissions: async () => ({ receive: "prompt" }),
    addListener: async () => ({ remove: async () => {} }),
  }),
}));
vi.mock("../supabaseClient", () => ({
  supabase: { auth: { getUser: async () => ({ data: { user: null } }) }, rpc: vi.fn(), from: vi.fn() },
}));

import { checkNativeLocationPermission, getNativeCoordinates } from "./nativeGeolocation";
import { checkCameraPermission, takePhoto } from "./nativeCamera";
import { getNativePushStatus, listenNotificationTaps, syncNativePushRegistration, disableNativePush } from "./nativePush";

const unhandled = [];
const onUnhandled = (reason) => unhandled.push(reason);
const flush = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  plat.native = true; plat.platform = "android";
  for (const k of Object.keys(trap.thenReads)) trap.thenReads[k] = 0;
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});
afterEach(() => { process.off("unhandledRejection", onUnhandled); });

describe("aucun module natif ne renvoie le proxy d'un plugin nu depuis une promesse", () => {
  it("géolocalisation : permission et position ne lisent jamais Geolocation.then", async () => {
    expect(await checkNativeLocationPermission()).toBe("granted");
    const r = await getNativeCoordinates({ messages: {} });
    expect(r).toEqual({ ok: true, latitude: 45.5, longitude: -73.5 });
    await flush();
    expect(trap.thenReads.Geolocation).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it("appareil photo : permission et prise de photo ne lisent jamais Camera.then", async () => {
    expect(await checkCameraPermission()).toBe("granted");
    await takePhoto(); // le faux plugin ne renvoie pas de webPath : ERROR, sans exception
    await flush();
    expect(trap.thenReads.Camera).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it("push : statut, écoute des clics, resynchronisation et désactivation ne lisent jamais PushNotifications.then", async () => {
    expect((await getNativePushStatus()).supported).toBe(true);
    const stop = await listenNotificationTaps(() => {});
    stop();
    await syncNativePushRegistration("user-1");
    await disableNativePush({ signOut: true });
    await flush();
    expect(trap.thenReads.PushNotifications).toBe(0);
    expect(unhandled).toEqual([]);
  });

  it("web : aucun plugin n'est touché", async () => {
    plat.native = false; plat.platform = "web";
    await checkNativeLocationPermission();
    await checkCameraPermission();
    await takePhoto();
    await getNativePushStatus();
    await flush();
    expect(Object.values(trap.thenReads).every((n) => n === 0)).toBe(true);
  });
});
