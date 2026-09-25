import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLanguage } from "./useLanguage";

// Même correctif que useTheme.js (voir useTheme.dom.test.jsx), appliqué ici
// par cohérence : sans effet visuel aujourd'hui (interface encore 100%
// française), mais évite qu'un onglet renvoie une préférence de langue
// périmée dès que ce réglage pilotera une vraie traduction de l'app.

const STORAGE_KEY = "bb-language";

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

describe("useLanguage — synchronisation multi-onglets via l'event storage", () => {
  it("répercute un changement de langue fait dans un autre onglet (storage event)", () => {
    localStorage.setItem(STORAGE_KEY, "fr");
    const { result } = renderHook(() => useLanguage());
    expect(result.current[0]).toBe("fr");

    act(() => {
      localStorage.setItem(STORAGE_KEY, "en");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "en" }));
    });

    expect(result.current[0]).toBe("en");
  });

  it("ignore un event storage pour une autre clé (ex. bb-theme)", () => {
    localStorage.setItem(STORAGE_KEY, "fr");
    const { result } = renderHook(() => useLanguage());

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "bb-theme", newValue: "dark" }));
    });

    expect(result.current[0]).toBe("fr");
  });
});
