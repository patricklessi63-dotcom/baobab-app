import { supabase } from "../supabaseClient";
import { isNative, getPlatform } from "./platform";

// Notifications push NATIVES (app Capacitor Android/iOS) — étape 3a.
//
// RÈGLE : sur le web, RIEN de ce fichier ne s'exécute. Toutes les fonctions
// publiques commencent par isNative() (ou ne sont appelées que par des
// branches déjà gardées dans pushNotifications.js) et le plugin
// @capacitor/push-notifications est chargé par import() dynamique (chunk
// séparé, jamais téléchargé par un navigateur).
//
// Modèle : le Web Push (pushNotifications.js, table push_subscriptions) est
// inchangé. En natif, le jeton d'appareil (FCM sur Android, APNs sur iOS) est
// stocké dans device_push_tokens ; send-push (Edge Function) y envoie en plus
// du Web Push. Aucune erreur de stockage n'est bloquante : si le SQL n'a pas
// encore été exécuté, l'échec est journalisé et l'app continue.

export const ANDROID_CHANNEL = {
  id: "baobab_default", // = ANDROID_CHANNEL_ID de supabase/functions/_shared/nativePush.ts et du manifeste
  name: "Notifications Baobab",
  description: "Messages, matchs, likes et nouveaux abonnés",
  importance: 4, // IMPORTANCE_HIGH : son + bannière
  visibility: 1, // public
  vibration: true,
};

const TOKEN_KEY = "bb-native-push-token";
const optInKey = (userId) => `bb-native-push-optin:${userId}`;
const REGISTRATION_TIMEOUT_MS = 15000;
// Délai maximal accordé au nettoyage réseau de la désinscription : il s'exécute
// AVANT supabase.auth.signOut() (RLS) et ne doit JAMAIS retarder indéfiniment la
// déconnexion (réseau qui pend, verrou d'authentification occupé).
export const DISABLE_NETWORK_DEADLINE_MS = 5000;

function withDeadline(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    Promise.resolve(promise).then(
      () => { clearTimeout(timer); resolve(); },
      () => { clearTimeout(timer); resolve(); }
    );
  });
}
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null;

export const NATIVE_PUSH_MESSAGES = {
  blocked: "Notifications bloquées. Tu peux les autoriser dans les réglages de ton téléphone (Applications, Baobab, Notifications).",
  dismissed: "Demande fermée sans réponse. Réessaie, ou continue et active-les plus tard dans les réglages.",
  unavailable: "Impossible d'activer les notifications sur cet appareil pour le moment. Réessaie plus tard.",
};

// ---------- Stockage local (try/catch : localStorage peut jeter) ----------

function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key, value) {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* ignore */ }
}
export const getStoredToken = () => readLocal(TOKEN_KEY);

// IMPORTANT : on renvoie le plugin DANS un objet, jamais nu. Capacitor expose chaque plugin
// via un Proxy qui répond à N'IMPORTE QUELLE propriété par une méthode ; renvoyer le proxy
// d'une fonction async (ou d'un .then) fait lire sa propriété « then » lors de la résolution
// de la promesse : sans implémentation (web, tests) c'est un rejet non géré
// « "X.then()" is not implemented » (UNIMPLEMENTED) — voir nativePluginThenable.test.js.
async function loadPlugin() {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return { plugin: PushNotifications };
}

async function currentUserId() {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id || null;
  } catch {
    return null;
  }
}

// ---------- Jeton en base ----------

function isMissingFunction(error) {
  return error?.code === "PGRST202" || error?.code === "42883" || /could not find the function/i.test(error?.message || "");
}

/**
 * Enregistre (ou réassigne au compte courant) le jeton de CET appareil. Ne lève
 * jamais : retourne true/false et journalise. Utilise la fonction
 * register_device_push_token (réassignation d'un jeton resté sur un autre
 * compte) et, si elle n'existe pas encore, un upsert direct par jeton.
 */
export async function saveDeviceToken(token, userId) {
  try {
    const uid = userId || (await currentUserId());
    if (!uid || !token) return false;
    const platform = getPlatform();
    const { error } = await supabase.rpc("register_device_push_token", {
      p_token: token,
      p_platform: platform,
      p_app_version: APP_VERSION,
    });
    if (!error) return true;
    if (!isMissingFunction(error)) {
      console.warn("Jeton push non enregistré :", error.code || "", error.message || "");
      return false;
    }
    const { error: upsertError } = await supabase.from("device_push_tokens").upsert(
      { user_id: uid, token, platform, app_version: APP_VERSION, updated_at: new Date().toISOString() },
      { onConflict: "token" }
    );
    if (upsertError) {
      console.warn("Jeton push non enregistré (SQL supabase-device-tokens.sql exécuté ?) :", upsertError.code || "", upsertError.message || "");
      return false;
    }
    return true;
  } catch (e) {
    console.warn("Jeton push non enregistré :", e?.message || e);
    return false;
  }
}

// ---------- Écouteurs et enregistrement ----------

let listenersReady = null;
let waiters = [];

function settleWaiters(fn) {
  const current = waiters;
  waiters = [];
  current.forEach(fn);
}

function ensureRegistrationListeners(P) {
  if (!listenersReady) {
    listenersReady = (async () => {
      await P.addListener("registration", (t) => {
        const token = t?.value;
        if (!token) return;
        writeLocal(TOKEN_KEY, token);
        if (waiters.length > 0) {
          settleWaiters((w) => w.resolve(token));
          return;
        }
        // Renouvellement spontané du jeton (FCM onNewToken) : on le re-enregistre
        // pour le compte connecté s'il a activé les notifications.
        currentUserId().then((uid) => {
          if (uid && readLocal(optInKey(uid)) === "1") saveDeviceToken(token, uid);
        });
      });
      await P.addListener("registrationError", (e) => {
        console.warn("Enregistrement push refusé par le système :", e?.error || "");
        settleWaiters((w) => w.reject(new Error(NATIVE_PUSH_MESSAGES.unavailable)));
      });
    })().catch((e) => {
      listenersReady = null;
      throw e;
    });
  }
  return listenersReady;
}

async function registerAndWait(P) {
  await ensureRegistrationListeners(P);
  const tokenPromise = new Promise((resolve, reject) => {
    const entry = { resolve, reject };
    waiters.push(entry);
    setTimeout(() => {
      if (waiters.includes(entry)) {
        waiters = waiters.filter((w) => w !== entry);
        reject(new Error(NATIVE_PUSH_MESSAGES.unavailable));
      }
    }, REGISTRATION_TIMEOUT_MS);
  });
  // Évite un « unhandled rejection » si register() lève avant qu'on attende.
  tokenPromise.catch(() => {});
  try {
    await P.register();
  } catch (e) {
    // Typiquement : google-services.json absent de ce build (Firebase non configuré).
    console.warn("register() push a échoué :", e?.message || e);
    settleWaiters((w) => w.reject(new Error(NATIVE_PUSH_MESSAGES.unavailable)));
  }
  return tokenPromise;
}

async function ensureAndroidChannel(P) {
  if (getPlatform() !== "android") return;
  try { await P.createChannel(ANDROID_CHANNEL); } catch (e) { console.warn("Canal de notification non créé :", e?.message || e); }
}

// ---------- API publique (appelée par pushNotifications.js, derrière isNative()) ----------

/** Statut pour l'écran de réglages : permission du téléphone + jeton présent. */
export async function getNativePushStatus() {
  if (!isNative()) return { supported: false, permission: "unsupported", subscribed: false };
  let P;
  try { ({ plugin: P } = await loadPlugin()); } catch { return { supported: false, permission: "unsupported", subscribed: false }; }
  let permission = "prompt";
  try {
    const r = await P.checkPermissions();
    permission = r?.receive === "granted" ? "granted" : r?.receive === "denied" ? "denied" : "default";
  } catch { /* garde « default » */ }
  const token = getStoredToken();
  const subscribed = permission === "granted" && Boolean(token);
  if (subscribed) {
    // Réparation silencieuse (ex. SQL exécuté après coup) : même rôle que le
    // ré-upsert de getPushSubscriptionStatus() sur le web.
    saveDeviceToken(token);
  }
  return { supported: true, permission, subscribed, native: true };
}

/** Demande la permission (au geste de l'utilisateur), s'enregistre, stocke le jeton. */
export async function enableNativePush() {
  if (!isNative()) throw new Error("Les notifications push ne sont pas prises en charge sur cet appareil.");
  let P;
  try { ({ plugin: P } = await loadPlugin()); } catch { throw new Error(NATIVE_PUSH_MESSAGES.unavailable); }

  let status = (await P.checkPermissions().catch(() => null))?.receive;
  if (status !== "granted") {
    status = (await P.requestPermissions().catch(() => null))?.receive;
  }
  if (status === "denied") throw new Error(NATIVE_PUSH_MESSAGES.blocked);
  if (status !== "granted") throw new Error(NATIVE_PUSH_MESSAGES.dismissed);

  await ensureAndroidChannel(P);
  const token = await registerAndWait(P);

  const uid = await currentUserId();
  if (!uid) throw new Error("Non authentifié");
  writeLocal(optInKey(uid), "1");
  // Échec de stockage = journalisé, jamais bloquant (table pas encore créée).
  await saveDeviceToken(token, uid);
  return { token };
}

/**
 * Désactivation. `signOut: true` (déconnexion) garde le choix de l'utilisateur
 * pour sa prochaine connexion ; sinon (bouton « Désactiver ») le choix est effacé.
 * Supprime le jeton de CET appareil en base (RLS : doit s'exécuter AVANT la
 * déconnexion) — jamais celui des autres appareils du compte — puis demande au
 * système d'invalider le jeton (le compte suivant sur ce téléphone en recevra un neuf).
 * Ne lève jamais.
 */
export async function disableNativePush({ signOut = false } = {}) {
  if (!isNative()) return;
  const token = getStoredToken();
  const remote = (async () => {
    const uid = await currentUserId();
    if (uid && !signOut) writeLocal(optInKey(uid), null);
    if (token) {
      try {
        const { error } = await supabase.from("device_push_tokens").delete().eq("token", token);
        if (error) console.warn("Jeton push non supprimé :", error.code || "", error.message || "");
      } catch (e) {
        console.warn("Jeton push non supprimé :", e?.message || e);
      }
    }
  })();
  // Borné : au-delà du délai on poursuit (la requête en cours n'est pas bloquante).
  await withDeadline(remote, DISABLE_NETWORK_DEADLINE_MS);
  writeLocal(TOKEN_KEY, null);
  await withDeadline((async () => {
    try {
      const { plugin: P } = await loadPlugin();
      await P.unregister();
    } catch { /* plugin indisponible ou jeton déjà invalide */ }
  })(), DISABLE_NETWORK_DEADLINE_MS);
}

/**
 * À la connexion : si ce compte avait activé les notifications ET que le
 * téléphone a déjà accordé la permission, on se ré-enregistre en silence (jeton
 * renouvelé, reconnexion après déconnexion). Ne demande JAMAIS la permission.
 */
export async function syncNativePushRegistration(userId) {
  if (!isNative() || !userId) return false;
  if (readLocal(optInKey(userId)) !== "1") return false;
  try {
    const { plugin: P } = await loadPlugin();
    const { receive } = await P.checkPermissions();
    if (receive !== "granted") return false;
    await ensureAndroidChannel(P);
    const token = await registerAndWait(P);
    return await saveDeviceToken(token, userId);
  } catch (e) {
    console.warn("Resynchronisation push impossible :", e?.message || e);
    return false;
  }
}

/** Clic sur une notification (app fermée ou en arrière-plan) : cb(url) avec data.url. Retourne le nettoyage. */
export async function listenNotificationTaps(cb) {
  if (!isNative()) return () => {};
  try {
    const { plugin: P } = await loadPlugin();
    const handle = await P.addListener("pushNotificationActionPerformed", (action) => {
      const url = action?.notification?.data?.url;
      if (typeof url === "string") cb(url);
    });
    return () => { try { Promise.resolve(handle.remove()).catch(() => {}); } catch { /* ignore */ } };
  } catch {
    return () => {};
  }
}

/** Tests : remet à zéro l'état de module. */
export function _resetNativePushState() {
  listenersReady = null;
  waiters = [];
}
