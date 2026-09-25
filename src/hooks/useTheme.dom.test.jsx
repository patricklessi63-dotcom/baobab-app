import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "./useTheme";

// Bug corrigé : deux onglets ouverts sur l'app, thème changé dans l'un —
// l'autre onglet gardait l'ancien thème en mémoire (lu une seule fois au
// montage via useState(() => ...)) jusqu'à un rechargement manuel, car rien
// n'écoutait l'event "storage" (déclenché par le navigateur dans les AUTRES
// onglets quand localStorage change). Ces tests fixent le contrat : un onglet
// doit refléter un changement de thème fait ailleurs, sans rechargement.

const STORAGE_KEY = "bb-theme";

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY);
  document.documentElement.removeAttribute("data-theme");
});

describe("useTheme — synchronisation multi-onglets via l'event storage", () => {
  it("répercute un changement de thème fait dans un autre onglet (storage event)", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("light");

    // Un autre onglet vient d'appeler localStorage.setItem("bb-theme", "dark") :
    // le navigateur livre un StorageEvent à CE document (jamais à celui qui a
    // écrit), avec la nouvelle valeur déjà en place.
    act(() => {
      localStorage.setItem(STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "dark" }));
    });

    expect(result.current[0]).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("ignore un event storage pour une autre clé (ex. bb-language)", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());

    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "bb-language", newValue: "en" }));
    });

    expect(result.current[0]).toBe("light");
  });

  it("un localStorage.clear() (key === null) resynchronise sur la valeur par défaut", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });

    expect(result.current[0]).toBe("light");
  });
});
