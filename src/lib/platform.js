import { Capacitor } from "@capacitor/core";

// Détection de la plateforme d'exécution : site web / PWA, ou app native
// (Android/iOS) embarquée par Capacitor. `@capacitor/core` est un petit module
// sans effet de bord sur le web : Capacitor.isNativePlatform() y vaut false.

/** true uniquement dans l'app Capacitor (WebView Android/iOS). */
export function isNative() {
  try {
    return Capacitor.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/** "web" | "android" | "ios" */
export function getPlatform() {
  try {
    const p = Capacitor.getPlatform();
    return p === "android" || p === "ios" ? p : "web";
  } catch {
    return "web";
  }
}
