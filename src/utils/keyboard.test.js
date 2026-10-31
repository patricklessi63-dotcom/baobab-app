import { describe, it, expect } from "vitest";
import { isImeComposing } from "./keyboard";

describe("isImeComposing", () => {
  it("vrai pendant une composition IME (React : nativeEvent.isComposing)", () => {
    expect(isImeComposing({ key: "Enter", nativeEvent: { isComposing: true } })).toBe(true);
  });

  it("vrai pour l'événement natif (isComposing)", () => {
    expect(isImeComposing({ key: "Enter", isComposing: true })).toBe(true);
  });

  it("vrai pour keyCode 229 (Safari : compositionend déjà passé)", () => {
    expect(isImeComposing({ key: "Enter", keyCode: 229, nativeEvent: { isComposing: false } })).toBe(true);
  });

  it("faux pour une Entrée normale", () => {
    expect(isImeComposing({ key: "Enter", keyCode: 13, nativeEvent: { isComposing: false } })).toBe(false);
    expect(isImeComposing({ key: "Enter" })).toBe(false);
    expect(isImeComposing(undefined)).toBe(false);
  });
});
