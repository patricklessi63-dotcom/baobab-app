import { supabase } from "../supabaseClient";
import { CURRENT_VERSION } from "./version.js";

// ============================================================================
// Rapporteur d'erreurs client — filet minimal, sans dépendance.
//
// CONTEXTE : la prod n'a aucun suivi d'erreurs. Si un utilisateur plante sur
// un bug JS, personne ne le sait. Ce module pose des handlers globaux et
// écrit les erreurs dans la table Supabase `client_errors`
// (voir supabase-client-errors.sql à la racine — à exécuter à la main).
//
// Contraintes de conception :
//  - ne JAMAIS lever : un rapport d'erreur qui plante serait pire que le bug
//    d'origine (try/catch autour de l'insert lui-même) ;
//  - anti-flood : déduplication par signature + plafond par session ;
//  - filtrage du bruit connu ("Script error." CORS, "ResizeObserver loop") ;
//  - silencieux en dev local (l'insert échouerait de toute façon, pas de
//    backend) — désactivable/activable via setErrorReportingEnabled().
// ============================================================================

const MAX_REPORTS_PER_SESSION = 10;

// Signatures déjà envoyées dans cette session (message | 1re ligne de pile).
const sentSignatures = new Set();
let reportCount = 0;
let installed = false;

// Actif en prod uniquement par défaut ; en dev l'insert échouerait (pas de
// backend) et ne ferait que du bruit console. Les tests basculent ce flag.
let reportingEnabled = !import.meta.env.DEV;

// Cache de l'id de profil : résolu paresseusement au 1er rapport, ou posé
// explicitement par l'app quand elle connaît l'utilisateur courant.
let cachedProfileId = null;
let profileIdResolved = false;

export function setErrorReportingEnabled(value) {
  reportingEnabled = Boolean(value);
}

// Appelé par l'app (ex. App.jsx) dès que le profil courant est connu — évite
// un aller-retour auth/profiles au moment du plantage. Passer null à la
// déconnexion.
export function setReporterProfileId(profileId) {
  cachedProfileId = profileId || null;
  profileIdResolved = true;
}

// Test-only : remet l'état de session à zéro entre deux cas.
export function __resetErrorReporterForTests() {
  sentSignatures.clear();
  reportCount = 0;
  installed = false;
  cachedProfileId = null;
  profileIdResolved = false;
  reportingEnabled = !import.meta.env.DEV;
}

function firstStackLine(stack) {
  if (!stack) return "";
  const lines = String(stack).split("\n").map((l) => l.trim()).filter(Boolean);
  // La 1re ligne d'une pile V8 est souvent "Error: message" (redondant avec le
  // message) — on prend la 1re vraie frame si elle existe.
  return lines[1] || lines[0] || "";
}

function signature(message, stack) {
  return `${message || ""}|${firstStackLine(stack)}`;
}

function isNoise(message, stack) {
  const m = String(message || "").trim();
  // Scripts tiers cross-origin : message générique "Script error." sans pile,
  // masqué par la politique CORS du navigateur — aucune info exploitable.
  if (/^Script error\.?$/i.test(m) && !stack) return true;
  // Boucle ResizeObserver : avertissement navigateur connu et inoffensif,
  // émis en masse par certains layouts — pur bruit.
  if (/ResizeObserver loop/i.test(m)) return true;
  return false;
}

async function resolveProfileId() {
  if (profileIdResolved) return cachedProfileId;
  try {
    const { data } = await supabase.auth.getUser();
    const authUserId = data?.user?.id;
    if (authUserId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", authUserId)
        .maybeSingle();
      cachedProfileId = prof?.id || null;
    }
  } catch (_) {
    cachedProfileId = null;
  }
  profileIdResolved = true;
  return cachedProfileId;
}

export async function reportError({ message, stack, kind = "error" } = {}) {
  try {
    if (!reportingEnabled) return;
    if (isNoise(message, stack)) return;

    const sig = signature(message, stack);
    if (sentSignatures.has(sig)) return;
    if (reportCount >= MAX_REPORTS_PER_SESSION) return;
    sentSignatures.add(sig);
    reportCount += 1;

    const profileId = await resolveProfileId();

    await supabase.from("client_errors").insert({
      profile_id: profileId || null,
      message: message ? String(message).slice(0, 2000) : null,
      stack: stack ? String(stack).slice(0, 8000) : null,
      // Bornes alignées sur les contraintes CHECK de la table
      // (supabase-client-errors.sql) pour qu'un rapport légitime ne soit
      // jamais rejeté silencieusement.
      url: typeof location !== "undefined" ? String(location.href).slice(0, 2000) : null,
      user_agent: typeof navigator !== "undefined" ? String(navigator.userAgent).slice(0, 500) : null,
      app_version: CURRENT_VERSION ? String(CURRENT_VERSION).slice(0, 40) : null,
      kind,
    });
  } catch (_) {
    // Silencieux, intentionnel — un rapport d'erreur ne doit jamais provoquer
    // d'erreur (insert réseau en échec, table absente, etc.).
  }
}

export function initErrorReporter() {
  if (installed) return;
  if (typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    // event.error absent pour certaines erreurs de ressource/CORS — on
    // retombe alors sur event.message.
    reportError({
      message: event?.error?.message || event?.message || "error",
      stack: event?.error?.stack,
      kind: "error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    reportError({
      message: reason?.message || String(reason ?? "unhandledrejection"),
      stack: reason?.stack,
      kind: "unhandledrejection",
    });
  });
}
