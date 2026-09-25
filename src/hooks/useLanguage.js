import { useEffect, useState } from "react";

// "fr" | "en" — préférence de langue persistée. Pour l'instant l'interface
// reste entièrement en français quel que soit le choix : ce réglage ne fait
// que sauvegarder la préférence de l'utilisateur en vue d'une traduction
// complète de l'app à venir plus tard.
const STORAGE_KEY = "bb-language";

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "fr";
  } catch (_) {
    return "fr";
  }
}

export function useLanguage() {
  const [language, setLanguageState] = useState(readStoredLanguage);

  // Même correctif que useTheme.js, par cohérence : deux onglets ouverts,
  // langue changée dans l'un, l'autre restait figé sur l'ancienne valeur
  // jusqu'à un rechargement. Sans effet visuel aujourd'hui (interface encore
  // 100% française), mais évite qu'un onglet renvoie une préférence
  // périmée dès que ce réglage pilotera une vraie traduction.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      setLanguageState(readStoredLanguage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setLanguage = (value) => {
    setLanguageState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  };

  return [language, setLanguage];
}
