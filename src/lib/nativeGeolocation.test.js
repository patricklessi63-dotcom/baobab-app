import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const plat = vi.hoisted(() => ({ native: false, platform: "web" }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => plat.platform }));

const plugin = vi.hoisted(() => ({
  loaded: 0,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
// La fabrique ne s'exécute qu'au PREMIER import() du plugin : plugin.loaded > 0 = le plugin a été chargé.
vi.mock("@capacitor/geolocation", () => {
  plugin.loaded += 1;
  return { Geolocation: plugin };
});

import { getCurrentPositionSafe, LOCATION_ERROR_MESSAGES } from "./geolocation";
import { checkNativeLocationPermission, locationSettingsPath, mapNativeLocationError } from "./nativeGeolocation";

const pos = (latitude, longitude) => ({ coords: { latitude, longitude, accuracy: 1500 }, timestamp: 1 });
const perm = (state) => ({ location: state, coarseLocation: state });

beforeEach(() => {
  plat.native = true; plat.platform = "android";
  plugin.checkPermissions.mockReset();
  plugin.requestPermissions.mockReset();
  plugin.getCurrentPosition.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("web : navigator.geolocation inchangé, plugin jamais chargé", () => {
  it("n'importe pas @capacitor/geolocation et garde l'arrondi/les erreurs existants", async () => {
    plat.native = false; plat.platform = "web";
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 45.50123, longitude: -73.56789 } }));
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
    const r = await getCurrentPositionSafe();
    expect(r).toEqual({ ok: true, latitude: 45.5, longitude: -73.57 });
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    expect(plugin.loaded).toBe(0);
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
  });

  it("web : refus -> PERMISSION_DENIED avec le message web d'origine", async () => {
    plat.native = false; plat.platform = "web";
    vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: (_ok, err) => err({ code: 1 }) } });
    expect(await getCurrentPositionSafe()).toEqual({ ok: false, code: "PERMISSION_DENIED", message: LOCATION_ERROR_MESSAGES.PERMISSION_DENIED });
    expect(plugin.loaded).toBe(0);
  });

  it("web : l'état de permission natif vaut null sans toucher au plugin", async () => {
    plat.native = false;
    expect(await checkNativeLocationPermission()).toBeNull();
    expect(plugin.loaded).toBe(0);
  });
});

describe("natif : getCurrentPositionSafe via le plugin", () => {
  it("permission déjà accordée : position approximative, arrondie, sans nouvelle demande", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockResolvedValue(pos(45.50123, -73.56789));
    const r = await getCurrentPositionSafe({ timeout: 7000 });
    expect(r).toEqual({ ok: true, latitude: 45.5, longitude: -73.57 });
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    // localisation APPROXIMATIVE demandée, jamais haute précision
    expect(plugin.getCurrentPosition).toHaveBeenCalledWith({ enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 });
  });

  it("état « prompt » : demande uniquement l'alias coarseLocation puis lit la position", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("prompt"));
    plugin.requestPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockResolvedValue(pos(43.6532, -79.3832));
    const r = await getCurrentPositionSafe();
    expect(plugin.requestPermissions).toHaveBeenCalledWith({ permissions: ["coarseLocation"] });
    expect(r).toEqual({ ok: true, latitude: 43.65, longitude: -79.38 });
  });

  it("« prompt-with-rationale » (Android, refusée une fois) : on redemande", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("prompt-with-rationale"));
    plugin.requestPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockResolvedValue(pos(1.234, 2.345));
    expect((await getCurrentPositionSafe()).ok).toBe(true);
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("refus à la demande : PERMISSION_DENIED + chemin des réglages, aucune lecture de position", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("prompt"));
    plugin.requestPermissions.mockResolvedValue(perm("denied"));
    const r = await getCurrentPositionSafe();
    expect(r.ok).toBe(false);
    expect(r.code).toBe("PERMISSION_DENIED");
    expect(r.message).toContain("réglages de ton téléphone");
    expect(r.message).toContain("Applications, Baobab, Autorisations, Position");
    expect(plugin.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("refus définitif : aucune fenêtre système (pas de requestPermissions), retour immédiat", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("denied"));
    const r = await getCurrentPositionSafe();
    expect(r.code).toBe("PERMISSION_DENIED");
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
    expect(plugin.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("iOS : le message de refus indique le chemin iOS", async () => {
    plat.platform = "ios";
    plugin.checkPermissions.mockResolvedValue(perm("denied"));
    expect((await getCurrentPositionSafe()).message).toContain("Service de localisation");
  });

  it("services de localisation du téléphone éteints (checkPermissions jette) : POSITION_UNAVAILABLE explicite", async () => {
    plugin.checkPermissions.mockRejectedValue({ code: "OS-PLUG-GLOC-0007", message: "Location services are not enabled." });
    const r = await getCurrentPositionSafe();
    expect(r).toMatchObject({ ok: false, code: "POSITION_UNAVAILABLE" });
    expect(r.message).toMatch(/désactivée/);
  });

  it("délai dépassé côté plugin : TIMEOUT avec le message existant", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockRejectedValue({ code: "OS-PLUG-GLOC-0010", message: "Could not obtain location in time." });
    expect(await getCurrentPositionSafe()).toEqual({ ok: false, code: "TIMEOUT", message: LOCATION_ERROR_MESSAGES.TIMEOUT });
  });

  it("plugin qui ne répond jamais : TIMEOUT après le délai + marge, jamais une promesse pendante", async () => {
    vi.useFakeTimers();
    plugin.checkPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockReturnValue(new Promise(() => {}));
    const p = getCurrentPositionSafe({ timeout: 1000 });
    await vi.waitFor(() => expect(plugin.getCurrentPosition).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(4100);
    expect(await p).toEqual({ ok: false, code: "TIMEOUT", message: LOCATION_ERROR_MESSAGES.TIMEOUT });
  });

  it("la fenêtre de permission n'est pas bornée par le délai (un utilisateur lent n'obtient pas de TIMEOUT)", async () => {
    vi.useFakeTimers();
    plugin.checkPermissions.mockResolvedValue(perm("prompt"));
    plugin.requestPermissions.mockReturnValue(new Promise((resolve) => setTimeout(() => resolve(perm("granted")), 60000)));
    plugin.getCurrentPosition.mockResolvedValue(pos(46.81, -71.21));
    const p = getCurrentPositionSafe({ timeout: 1000 });
    await vi.waitFor(() => expect(plugin.requestPermissions).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(61000);
    expect(await p).toEqual({ ok: true, latitude: 46.81, longitude: -71.21 });
  });

  it("coordonnées invalides : POSITION_UNAVAILABLE, jamais NaN transmis", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockResolvedValue({ coords: { latitude: NaN, longitude: 3 } });
    expect(await getCurrentPositionSafe()).toMatchObject({ ok: false, code: "POSITION_UNAVAILABLE" });
  });

  it("erreur inconnue : UNKNOWN avec le message générique, jamais le message technique du plugin", async () => {
    plugin.checkPermissions.mockResolvedValue(perm("granted"));
    plugin.getCurrentPosition.mockRejectedValue(new Error("java.lang.NullPointerException: x"));
    const r = await getCurrentPositionSafe();
    expect(r).toEqual({ ok: false, code: "UNKNOWN", message: LOCATION_ERROR_MESSAGES.UNKNOWN });
    expect(JSON.stringify(r)).not.toMatch(/NullPointer/);
  });
});

describe("checkNativeLocationPermission", () => {
  it.each([
    [perm("granted"), "granted"],
    [perm("denied"), "denied"],
    [perm("prompt"), "prompt"],
    [perm("prompt-with-rationale"), "prompt"],
    [{ location: "denied", coarseLocation: "granted" }, "granted"], // Android : seule la permission approximative compte
  ])("%j -> %s", async (status, expected) => {
    plugin.checkPermissions.mockResolvedValue(status);
    expect(await checkNativeLocationPermission()).toBe(expected);
  });

  it("services éteints / plugin en erreur : null (inconnu), jamais « denied » (ce n'est pas un refus de l'app)", async () => {
    plugin.checkPermissions.mockRejectedValue({ code: "OS-PLUG-GLOC-0007" });
    expect(await checkNativeLocationPermission()).toBeNull();
  });
});

describe("outils", () => {
  it("locationSettingsPath dépend de la plateforme", () => {
    plat.platform = "android";
    expect(locationSettingsPath()).toContain("Autorisations");
    plat.platform = "ios";
    expect(locationSettingsPath()).toContain("Service de localisation");
  });

  it("mapNativeLocationError : repli sur le texte quand le code manque", () => {
    const m = LOCATION_ERROR_MESSAGES;
    expect(mapNativeLocationError({ message: "Location permission request was denied." }, m).code).toBe("PERMISSION_DENIED");
    expect(mapNativeLocationError({ message: "Could not obtain location in time" }, m).code).toBe("TIMEOUT");
    expect(mapNativeLocationError({ code: "OS-PLUG-GLOC-0009", message: "Request to enable location was denied." }, m).code).toBe("POSITION_UNAVAILABLE");
  });
});
