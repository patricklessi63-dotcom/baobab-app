import { describe, it, expect, vi, beforeEach } from "vitest";

const cap = vi.hoisted(() => ({ isNativePlatform: vi.fn(), getPlatform: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: cap }));

import { isNative, getPlatform } from "./platform";

describe("platform", () => {
  beforeEach(() => {
    cap.isNativePlatform.mockReset();
    cap.getPlatform.mockReset();
  });

  it("web : ni natif, ni android/ios", () => {
    cap.isNativePlatform.mockReturnValue(false);
    cap.getPlatform.mockReturnValue("web");
    expect(isNative()).toBe(false);
    expect(getPlatform()).toBe("web");
  });

  it("android natif", () => {
    cap.isNativePlatform.mockReturnValue(true);
    cap.getPlatform.mockReturnValue("android");
    expect(isNative()).toBe(true);
    expect(getPlatform()).toBe("android");
  });

  it("ios natif", () => {
    cap.isNativePlatform.mockReturnValue(true);
    cap.getPlatform.mockReturnValue("ios");
    expect(isNative()).toBe(true);
    expect(getPlatform()).toBe("ios");
  });

  it("valeur inconnue -> web ; erreur de Capacitor -> web, jamais d'exception", () => {
    cap.getPlatform.mockReturnValue("electron");
    expect(getPlatform()).toBe("web");
    cap.isNativePlatform.mockImplementation(() => {
      throw new Error("boom");
    });
    cap.getPlatform.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(isNative()).toBe(false);
    expect(getPlatform()).toBe("web");
  });
});
