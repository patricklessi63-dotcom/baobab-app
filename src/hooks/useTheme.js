import { useEffect, useState } from "react";

// "clair" | "sombre" | "système" — persisté, appliqué comme attribut
// data-theme sur <html> (voir bootstrap inline dans index.html, qui évite
// le flash au premier rendu). "système" ne pose aucun attribut : la media
// query prefers-color-scheme dans index.html prend le relais seule.
const STORAGE_KEY = "bb-theme";

function applyTheme(value) {
  if (value === "dark" || value === "light") {
    document.documentElement.setAttribute("data-theme", value);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
    // Aucune préférence enregistrée (première visite) : clair par défaut,
    // plutôt que de suivre silencieusement le thème sombre du système —
    // "Système" reste un choix explicite disponible dans les réglages.
    return "light";
  } catch (_) {
    return "light";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Deux onglets ouverts sur l'app, réglages changés dans l'un : sans cet
  // écouteur, l'autre onglet restait figé sur l'ancien thème (état React lu
  // une seule fois au montage) jusqu'à un rechargement manuel. L'event
  // "storage" ne se déclenche que dans les AUTRES onglets/fenêtres — jamais
  // dans celui qui vient d'appeler localStorage.setItem — donc pas de boucle
  // avec setTheme ci-dessous.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== null && e.key !== STORAGE_KEY) return;
      setThemeState(readStoredTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = (value) => {
    setThemeState(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  };

  return [theme, setTheme];
}
