import { SystemBars } from "@capacitor/core";
import { isNative, getPlatform } from "./platform";

// Intégration UI de l'app native (Capacitor) : barre d'état / barre de
// navigation Android, clavier virtuel, écran de démarrage (splash).
//
// RÈGLE : sur le site web, RIEN de ce fichier ne s'exécute. Chaque fonction
// publique commence par isNative(), et les plugins @capacitor/status-bar,
// @capacitor/keyboard et @capacitor/splash-screen sont chargés par import()
// dynamique (chunks séparés, jamais téléchargés par un navigateur) — le bundle
// principal n'embarque que ce petit module et @capacitor/core (déjà présent).
// `SystemBars` vient de @capacitor/core (plugin fourni avec le cœur de
// Capacitor 8) : l'importer statiquement n'ajoute aucun chunk.

// ---------- Lecture de la couleur réellement affichée en haut/bas d'écran ----------

/** "rgb(…)"/"rgba(…)" -> {r,g,b,a} ou null (couleur non reconnue). */
export function parseRgb(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
}

/** Luminance relative WCAG (0 = noir, 1 = blanc). */
export function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function toHex({ r, g, b }) {
  const h = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * Premier fond suffisamment opaque (alpha >= 0.5) trouvé en remontant depuis
 * l'élément affiché au point (x, y). Retourne {r,g,b,a} ou null.
 */
export function backgroundAt(x, y, doc = document) {
  let el = typeof doc.elementFromPoint === "function" ? doc.elementFromPoint(x, y) : null;
  while (el) {
    const color = parseRgb(doc.defaultView.getComputedStyle(el).backgroundColor);
    if (color && color.a >= 0.5) return color;
    el = el.parentElement;
  }
  return null;
}

/** "dark" | "light" d'après le thème effectif de l'app (attribut data-theme, sinon système). */
export function themeTone(doc = document) {
  const attr = doc.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  try {
    return doc.defaultView.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

// Seuil de luminance WCAG sous lequel des icônes BLANCHES ont un contraste >= 4.5:1
// (au-dessus, des icônes sombres en ont un meilleur).
const DARK_BACKGROUND_LUMINANCE = 0.18;

/**
 * Tonalité ("dark" = fond sombre, donc icônes claires) et couleur du fond au
 * point (x, y). Les écrans n'ont pas tous le même fond (accueil/connexion :
 * toujours vert sombre ; onboarding : toujours clair ; coque sociale : suit le
 * thème) : on lit donc le fond réellement peint, et on ne retombe sur le thème
 * que si rien de lisible n'est trouvé.
 */
export function detectTone(x, y, doc = document) {
  const bg = backgroundAt(x, y, doc);
  if (bg) return { tone: luminance(bg) < DARK_BACKGROUND_LUMINANCE ? "dark" : "light", color: toHex(bg) };
  return { tone: themeTone(doc), color: null };
}

// ---------- Thème par défaut en natif ----------

/**
 * Sur le web, la première visite (aucune préférence enregistrée) est en clair
 * même si le système est en sombre (choix produit, voir useTheme.js et le
 * script d'amorçage de index.html). Dans l'app native, l'attente est inverse :
 * l'app suit automatiquement le thème du téléphone. Au tout premier lancement
 * natif sans préférence, on enregistre donc "system" (réglage « Système » déjà
 * existant dans Réglages) et on retire l'attribut data-theme posé par le script
 * d'amorçage — la media query prefers-color-scheme prend alors le relais. Un
 * choix explicite de l'utilisateur (clair/sombre/système) n'est jamais écrasé.
 * À appeler avant le premier rendu (main.jsx). No-op sur le web.
 */
export function applyNativeThemeDefault(doc = document, storage = (() => { try { return localStorage; } catch { return null; } })()) {
  if (!isNative() || !storage) return false;
  try {
    const stored = storage.getItem("bb-theme");
    if (stored === "dark" || stored === "light" || stored === "system") return false;
    storage.setItem("bb-theme", "system");
    doc.documentElement.removeAttribute("data-theme");
    return true;
  } catch {
    return false;
  }
}

// ---------- Barres système (Android / iOS) ----------

let lastApplied = { top: null, bottom: null };

/** Remet à zéro la mémoire du dernier état appliqué (tests). */
export function _resetNativeUiState() {
  lastApplied = { top: null, bottom: null };
}

/**
 * Applique le style des barres système. `top` / `bottom` = "dark" | "light"
 * (tonalité du FOND derrière la barre : fond sombre => icônes claires).
 * Chaque appel natif est isolé dans son try/catch : une plateforme qui ne
 * supporte pas une option (ex. setBackgroundColor sous Android 15+/iOS) ne
 * doit jamais casser l'app.
 */
export async function applySystemBars({ top, topColor = null, bottom = top }) {
  if (!isNative()) return;
  const topKey = `${top}|${topColor}`;
  if (top && lastApplied.top !== topKey) {
    lastApplied.top = topKey;
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: top === "dark" ? Style.Dark : Style.Light });
      // Android <= 14 uniquement (ignoré par le plugin à partir d'Android 15/16
      // où la barre est transparente et le contenu passe dessous) ; iOS rejette.
      if (topColor && getPlatform() === "android") {
        try { await StatusBar.setBackgroundColor({ color: topColor }); } catch { /* non supporté */ }
      }
    } catch { /* plugin indisponible */ }
  }
  if (bottom && lastApplied.bottom !== bottom) {
    lastApplied.bottom = bottom;
    // Barre de navigation Android (gestes / 3 boutons) — sans effet sur iOS.
    if (getPlatform() === "android") {
      try {
        await SystemBars.setStyle({ style: bottom === "dark" ? "DARK" : "LIGHT", bar: "NavigationBar" });
      } catch { /* non supporté */ }
    }
  }
}

/** Lit le haut et le bas de l'écran puis applique les barres système. */
export function syncSystemBarsWithScreen(doc = document) {
  if (!isNative()) return Promise.resolve();
  const win = doc.defaultView;
  const x = Math.round((win.innerWidth || 2) / 2);
  const top = detectTone(x, 1, doc);
  const bottom = detectTone(x, Math.max(1, (win.innerHeight || 4) - 2), doc);
  return applySystemBars({ top: top.tone, topColor: top.color, bottom: bottom.tone });
}

// ---------- Splash ----------

let splashHidden = false;

/** Masque l'écran de démarrage natif (idempotent ; la config a aussi un masquage automatique de secours). */
export async function hideSplash() {
  if (!isNative() || splashHidden) return;
  splashHidden = true;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch { /* plugin indisponible : le masquage automatique prendra le relais */ }
}

export function _resetSplashState() {
  splashHidden = false;
}

// ---------- Clavier virtuel ----------

/**
 * Filet de sécurité en plus du redimensionnement natif (WebView redimensionnée
 * par Capacitor : SystemBars sur Android, Keyboard.resize "native" sur iOS) :
 * quand le clavier s'ouvre, le champ en cours de saisie est ramené dans la zone
 * visible s'il ne l'est pas déjà (block: "nearest" = aucun défilement s'il est
 * déjà visible). Retourne une fonction de nettoyage.
 */
export async function setupKeyboardGuard() {
  if (!isNative()) return () => {};
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    const handle = await Keyboard.addListener("keyboardDidShow", () => {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        requestAnimationFrame(() => {
          try { el.scrollIntoView({ block: "nearest", behavior: "auto" }); } catch { /* ignore */ }
        });
      }
    });
    return () => { try { handle.remove(); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
}
