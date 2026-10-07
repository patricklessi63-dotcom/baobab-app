import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const plat = vi.hoisted(() => ({ native: false, platform: "web" }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => plat.platform }));

const sb = vi.hoisted(() => ({
  setStyle: vi.fn(async () => {}),
  setBackgroundColor: vi.fn(async () => {}),
}));
const sysBars = vi.hoisted(() => ({ setStyle: vi.fn(async () => {}) }));
const splash = vi.hoisted(() => ({ hide: vi.fn(async () => {}) }));
const kb = vi.hoisted(() => ({ remove: vi.fn(), addListener: vi.fn() }));

vi.mock("@capacitor/core", () => ({ SystemBars: sysBars }));
vi.mock("@capacitor/status-bar", () => ({ StatusBar: sb, Style: { Dark: "DARK", Light: "LIGHT", Default: "DEFAULT" } }));
vi.mock("@capacitor/splash-screen", () => ({ SplashScreen: splash }));
vi.mock("@capacitor/keyboard", () => ({ Keyboard: { addListener: kb.addListener } }));

import {
  parseRgb, luminance, toHex, detectTone, themeTone, applySystemBars, syncSystemBarsWithScreen,
  hideSplash, setupKeyboardGuard, applyNativeThemeDefault, _resetNativeUiState, _resetSplashState,
} from "./nativeUi";

beforeEach(() => {
  plat.native = false; plat.platform = "web";
  [sb.setStyle, sb.setBackgroundColor, sysBars.setStyle, splash.hide, kb.addListener, kb.remove].forEach((f) => f.mockClear());
  kb.addListener.mockImplementation(async () => ({ remove: kb.remove }));
  _resetNativeUiState(); _resetSplashState();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme");
  localStorage.removeItem("bb-theme");
});
afterEach(() => { delete document.elementFromPoint; });

describe("utilitaires de couleur", () => {
  it("parseRgb lit rgb() et rgba()", () => {
    expect(parseRgb("rgb(20, 67, 42)")).toEqual({ r: 20, g: 67, b: 42, a: 1 });
    expect(parseRgb("rgba(28, 25, 18, 0.78)")).toEqual({ r: 28, g: 25, b: 18, a: 0.78 });
    expect(parseRgb("transparent")).toBeNull();
    expect(parseRgb(undefined)).toBeNull();
  });
  it("luminance : le vert de marque est sombre, le sable est clair", () => {
    expect(luminance({ r: 20, g: 67, b: 42 })).toBeLessThan(0.18);
    expect(luminance({ r: 250, g: 247, b: 242 })).toBeGreaterThan(0.9);
  });
  it("toHex", () => {
    expect(toHex({ r: 20, g: 67, b: 42 })).toBe("#14432A");
  });
});

describe("detectTone", () => {
  const stubTopElement = (bg, parentBg) => {
    const parent = document.createElement("div");
    if (parentBg) parent.style.background = parentBg;
    const child = document.createElement("div");
    child.style.background = bg;
    parent.appendChild(child);
    document.body.appendChild(parent);
    document.elementFromPoint = () => child;
  };

  it("fond sombre -> dark, avec la couleur en hex", () => {
    stubTopElement("rgb(20, 67, 42)");
    expect(detectTone(5, 1)).toEqual({ tone: "dark", color: "#14432A" });
  });
  it("fond clair -> light", () => {
    stubTopElement("rgb(250, 247, 242)");
    expect(detectTone(5, 1).tone).toBe("light");
  });
  it("fond transparent : remonte au parent opaque", () => {
    stubTopElement("transparent", "rgb(20, 18, 13)");
    expect(detectTone(5, 1).tone).toBe("dark");
  });
  it("fond translucide (alpha < 0.5) ignoré : remonte au parent", () => {
    stubTopElement("rgba(0, 0, 0, 0.2)", "rgb(255, 255, 255)");
    expect(detectTone(5, 1).tone).toBe("light");
  });
  it("rien de lisible : retombe sur le thème effectif", () => {
    document.elementFromPoint = () => null;
    document.documentElement.setAttribute("data-theme", "dark");
    expect(detectTone(5, 1)).toEqual({ tone: "dark", color: null });
  });
  it("themeTone : data-theme prioritaire, sinon prefers-color-scheme", () => {
    document.documentElement.setAttribute("data-theme", "light");
    expect(themeTone()).toBe("light");
    document.documentElement.removeAttribute("data-theme");
    window.matchMedia = vi.fn(() => ({ matches: true }));
    expect(themeTone()).toBe("dark");
    delete window.matchMedia;
  });
});

describe("garde-fou web : aucun appel natif, aucun import de plugin", () => {
  it("applySystemBars / syncSystemBarsWithScreen / hideSplash / setupKeyboardGuard sont des no-op", async () => {
    document.elementFromPoint = () => document.body;
    await applySystemBars({ top: "dark", topColor: "#14432A" });
    await syncSystemBarsWithScreen();
    await hideSplash();
    const cleanup = await setupKeyboardGuard();
    expect(typeof cleanup).toBe("function");
    cleanup();
    expect(sb.setStyle).not.toHaveBeenCalled();
    expect(sysBars.setStyle).not.toHaveBeenCalled();
    expect(splash.hide).not.toHaveBeenCalled();
    expect(kb.addListener).not.toHaveBeenCalled();
  });
  it("applyNativeThemeDefault ne touche à rien sur le web", () => {
    document.documentElement.setAttribute("data-theme", "light");
    expect(applyNativeThemeDefault()).toBe(false);
    expect(localStorage.getItem("bb-theme")).toBeNull();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

describe("natif Android", () => {
  beforeEach(() => { plat.native = true; plat.platform = "android"; });

  it("fond sombre : icônes claires (Style.Dark), couleur de fond et barre de navigation", async () => {
    await applySystemBars({ top: "dark", topColor: "#14432A", bottom: "light" });
    expect(sb.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(sb.setBackgroundColor).toHaveBeenCalledWith({ color: "#14432A" });
    expect(sysBars.setStyle).toHaveBeenCalledWith({ style: "LIGHT", bar: "NavigationBar" });
  });
  it("n'applique pas deux fois le même état", async () => {
    await applySystemBars({ top: "light", topColor: "#FAF7F2" });
    await applySystemBars({ top: "light", topColor: "#FAF7F2" });
    expect(sb.setStyle).toHaveBeenCalledTimes(1);
    expect(sysBars.setStyle).toHaveBeenCalledTimes(1);
  });
  it("un plugin qui échoue ne casse rien (setBackgroundColor non supporté)", async () => {
    sb.setBackgroundColor.mockRejectedValueOnce(new Error("unsupported"));
    sysBars.setStyle.mockRejectedValueOnce(new Error("unsupported"));
    await expect(applySystemBars({ top: "dark", topColor: "#000000" })).resolves.toBeUndefined();
  });
  it("syncSystemBarsWithScreen lit le haut et le bas de l'écran", async () => {
    const dark = document.createElement("div"); dark.style.background = "rgb(20, 67, 42)";
    const light = document.createElement("div"); light.style.background = "rgb(255, 255, 255)";
    document.body.append(dark, light);
    document.elementFromPoint = (x, y) => (y <= 1 ? dark : light);
    await syncSystemBarsWithScreen();
    expect(sb.setStyle).toHaveBeenCalledWith({ style: "DARK" });
    expect(sysBars.setStyle).toHaveBeenCalledWith({ style: "LIGHT", bar: "NavigationBar" });
  });
  it("hideSplash masque une seule fois", async () => {
    await hideSplash();
    await hideSplash();
    expect(splash.hide).toHaveBeenCalledTimes(1);
  });
  it("clavier : ramène le champ actif dans la zone visible, puis se nettoie", async () => {
    let handler;
    kb.addListener.mockImplementation(async (name, cb) => { handler = cb; return { remove: kb.remove }; });
    const cleanup = await setupKeyboardGuard();
    expect(kb.addListener).toHaveBeenCalledWith("keyboardDidShow", expect.any(Function));
    const input = document.createElement("textarea");
    input.scrollIntoView = vi.fn();
    document.body.appendChild(input);
    input.focus();
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1; });
    handler();
    expect(input.scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "auto" });
    cleanup();
    expect(kb.remove).toHaveBeenCalled();
    raf.mockRestore();
  });
  it("thème par défaut : premier lancement -> « system », choix existant conservé", () => {
    document.documentElement.setAttribute("data-theme", "light");
    expect(applyNativeThemeDefault()).toBe(true);
    expect(localStorage.getItem("bb-theme")).toBe("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    localStorage.setItem("bb-theme", "dark");
    document.documentElement.setAttribute("data-theme", "dark");
    expect(applyNativeThemeDefault()).toBe(false);
    expect(localStorage.getItem("bb-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("natif iOS", () => {
  beforeEach(() => { plat.native = true; plat.platform = "ios"; });
  it("style de la barre d'état seulement : ni setBackgroundColor ni barre de navigation", async () => {
    await applySystemBars({ top: "light", topColor: "#FAF7F2" });
    expect(sb.setStyle).toHaveBeenCalledWith({ style: "LIGHT" });
    expect(sb.setBackgroundColor).not.toHaveBeenCalled();
    expect(sysBars.setStyle).not.toHaveBeenCalled();
  });
});
