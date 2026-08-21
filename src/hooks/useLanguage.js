import { useState } from "react";

// "fr" | "en" — préférence de langue persistée. Pour l'instant l'interface
// reste entièrement en français quel que soit le choix : ce réglage ne fait
// que sauvegarder la préférence de l'utilisateur en vue d'une traduction
// complète de l'app à venir plus tard.
const STORAGE_KEY = "bb-language";

export function useLanguage() {
  const [language, setLanguageState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "en" ? "en" : "fr";
    } catch (_) {
      return "fr";
    }
  });

  const setLanguage = (value) => {
    setLanguageState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  };

  return [language, setLanguage];
}
