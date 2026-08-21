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

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "dark" || stored === "light" ? stored : "system";
    } catch (_) {
      return "system";
    }
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (value) => {
    setThemeState(value);
    try {
      if (value === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value);
    } catch (_) {}
  };

  return [theme, setTheme];
}
