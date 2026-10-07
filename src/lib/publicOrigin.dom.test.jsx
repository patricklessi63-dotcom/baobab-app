import { describe, it, expect, vi, beforeEach } from "vitest";

const plat = vi.hoisted(() => ({ native: false }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => "web" }));

import { PUBLIC_WEB_ORIGIN, PUBLIC_WEB_HOST, linkOrigin } from "./publicOrigin";

beforeEach(() => { plat.native = false; });

describe("publicOrigin / linkOrigin", () => {
  it("le domaine public par défaut est celui du site actuel, et l'hôte en est dérivé", () => {
    expect(PUBLIC_WEB_ORIGIN).toBe("https://baobab-app-zeta.vercel.app");
    expect(PUBLIC_WEB_HOST).toBe("baobab-app-zeta.vercel.app");
  });

  it("web : window.location.origin (comportement inchangé)", () => {
    expect(linkOrigin()).toBe(window.location.origin);
  });

  it("natif : le domaine public, jamais l'origine de la WebView", () => {
    plat.native = true;
    expect(linkOrigin()).toBe(PUBLIC_WEB_ORIGIN);
    expect(linkOrigin()).not.toBe(window.location.origin);
  });
});
