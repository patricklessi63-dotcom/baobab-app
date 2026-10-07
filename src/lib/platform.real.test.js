import { describe, it, expect } from "vitest";
import { isNative, getPlatform } from "./platform";

// Sans mock : vérifie que le vrai @capacitor/core se charge sous jsdom et
// renvoie « web » (comportement du site).
describe("platform (vrai @capacitor/core, jsdom)", () => {
  it("renvoie web / non natif", () => {
    expect(isNative()).toBe(false);
    expect(getPlatform()).toBe("web");
  });
});
