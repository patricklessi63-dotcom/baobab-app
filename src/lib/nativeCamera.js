import { isNative, getPlatform } from "./platform";

// Appareil photo / galerie NATIFS (app Capacitor Android/iOS) — étape 3b.
//
// RÈGLE : sur le web, RIEN de ce fichier ne s'exécute. Les fonctions publiques
// commencent par isNative() et le plugin @capacitor/camera est chargé par
// import() dynamique (chunk séparé, jamais téléchargé par un navigateur).
//
// Ce que le plugin apporte par rapport à <input type="file"> (qui fonctionne
// déjà dans les WebViews et reste utilisé partout pour « choisir dans la
// galerie ») : la prise de photo DIRECTE (bouton « Prendre une photo ») et une
// permission d'appareil photo gérée proprement (état lisible AVANT la demande,
// refus définitif distingué). Utilise l'API 8.1+ (takePhoto / chooseFromGallery) :
// getPhoto et pickImages sont dépréciés.
//
// VIE PRIVÉE — point crucial : le plugin renvoie un FICHIER (uri/webPath) qui peut
// contenir les métadonnées EXIF d'origine (position GPS du domicile, modèle de
// téléphone). Ce module ne les nettoie PAS et ne les lit jamais (includeMetadata
// reste à false : aucun champ `exif` n'est même demandé). Il convertit simplement
// le fichier en objet `File`. L'appelant DOIT le faire passer par le pipeline
// existant — prepareImageSelection() (validation + compressImageIfNeeded : décodage
// puis ré-encodage canvas, qui supprime tout l'EXIF, + retrait GPS du JPEG de repli
// + HEIC -> JPEG) pour les photos de profil, et compressImageIfNeeded() à la
// publication pour les statuts. C'est pourquoi les sites branchés réutilisent
// leurs gestionnaires existants (fileListEvent) au lieu d'un chemin parallèle.

// Codes d'erreur structurés du plugin (README « Errors », API 8.1+).
const CANCEL_CODES = new Set(["OS-PLUG-CAMR-0006", "OS-PLUG-CAMR-0013", "OS-PLUG-CAMR-0017", "OS-PLUG-CAMR-0020"]);
const DENIED_CODES = new Set(["OS-PLUG-CAMR-0003", "OS-PLUG-CAMR-0005"]);
const NO_CAMERA_CODES = new Set(["OS-PLUG-CAMR-0007"]);

/** Chemin manuel vers le réglage « Appareil photo » de l'app (aucune API fiable pour ouvrir les réglages). */
export function cameraSettingsPath() {
  return getPlatform() === "ios"
    ? "Réglages, Baobab, Appareil photo"
    : "Réglages, Applications, Baobab, Autorisations, Appareil photo";
}

export const CAMERA_MESSAGES = {
  EXPLAIN: "Baobab a besoin de ton appareil photo pour prendre ta photo. Elle n'est envoyée qu'après ton choix, et seulement si tu la gardes. Ton téléphone va te demander l'autorisation.",
  DENIED: () => `L'accès à l'appareil photo est désactivé pour Baobab. Pour le réactiver : ${cameraSettingsPath()}. Tu peux aussi choisir une photo existante avec « + Ajouter ».`,
  GALLERY_DENIED: () => `Baobab n'a pas accès à tes photos. Pour le réactiver : ${cameraSettingsPath().replace(/Appareil photo$/, "Photos")}.`,
  NO_CAMERA: "Aucun appareil photo n'est disponible sur cet appareil. Tu peux choisir une photo existante avec « + Ajouter ».",
  ERROR: "Impossible d'ouvrir l'appareil photo pour le moment. Réessaie, ou choisis une photo existante.",
  GALLERY_ERROR: "Impossible de récupérer cette photo. Réessaie.",
};

// IMPORTANT : on renvoie le plugin DANS un objet, jamais nu. Capacitor expose chaque plugin
// via un Proxy qui répond à N'IMPORTE QUELLE propriété par une méthode ; renvoyer le proxy
// d'une fonction async (ou d'un .then) fait lire sa propriété « then » lors de la résolution
// de la promesse : sans implémentation (web, tests) c'est un rejet non géré
// « "X.then()" is not implemented » (UNIMPLEMENTED) — voir nativePluginThenable.test.js.
async function loadPlugin() {
  const { Camera } = await import("@capacitor/camera");
  return { plugin: Camera };
}

/**
 * "granted" | "prompt" | "denied", ou null (web, plugin indisponible, état inconnu).
 * "limited" (iOS : accès restreint aux photos) compte comme accordé pour l'appareil photo.
 * Sur Android, l'app ne déclare PAS la permission CAMERA (l'appareil photo du système est
 * lancé par intent) : l'état est alors « granted » et aucune explication préalable n'est nécessaire.
 */
export async function checkCameraPermission() {
  if (!isNative()) return null;
  try {
    const { plugin: Camera } = await loadPlugin();
    const s = (await Camera.checkPermissions())?.camera;
    if (s === "granted" || s === "limited") return "granted";
    if (s === "denied") return "denied";
    return "prompt";
  } catch {
    return null;
  }
}

// ---------- Blob -> File ----------

const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif" };
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif" };

function extensionOf(path) {
  const m = /\.([a-z0-9]{2,5})(?:[?#].*)?$/i.exec(String(path || ""));
  return m ? m[1].toLowerCase() : "";
}

/**
 * Lit le fichier du plugin (webPath servi par la WebView) et le renvoie comme `File`
 * avec un type et un nom corrects (jamais un `application/octet-stream` que le bucket
 * Storage refuserait). Le contenu est renvoyé tel quel — voir l'avertissement EXIF en tête de fichier.
 * `index` distingue les noms d'une sélection multiple.
 */
export async function webPathToFile(webPath, { index = 0, format } = {}) {
  const response = await fetch(webPath);
  if (!response.ok) throw new Error("lecture impossible");
  const blob = await response.blob();
  const ext = extensionOf(webPath) || String(format || "").toLowerCase().replace("jpeg", "jpg");
  let type = blob.type && blob.type.startsWith("image/") ? blob.type : (EXT_MIME[ext] || EXT_MIME[String(format || "").toLowerCase()] || "image/jpeg");
  if (type === "image/jpg") type = "image/jpeg";
  const name = `photo-${Date.now()}${index ? `-${index + 1}` : ""}.${MIME_EXT[type] || "jpg"}`;
  return new File([blob], name, { type });
}

/**
 * Faux évènement `change` d'un <input type="file"> portant ces fichiers : permet de
 * brancher la photo native sur les gestionnaires EXISTANTS (handlePhotosSelected,
 * handleNewPhotosSelected, onStoryMediaSelected) sans les modifier — donc sans
 * toucher au chemin web ni dupliquer validation/compression.
 */
export function fileListEvent(files) {
  return { target: { files, value: "" }, currentTarget: null, preventDefault() {} };
}

// ---------- Erreurs ----------

export function mapCameraError(err, { gallery = false } = {}) {
  const code = typeof err?.code === "string" ? err.code : "";
  const text = String(err?.message || err || "");
  if (CANCEL_CODES.has(code) || /cancel/i.test(text)) return { ok: false, code: "CANCELLED" };
  if (NO_CAMERA_CODES.has(code) || /no camera/i.test(text)) return { ok: false, code: "UNAVAILABLE", message: CAMERA_MESSAGES.NO_CAMERA };
  if (DENIED_CODES.has(code) || /denied|permission/i.test(text)) {
    return { ok: false, code: "PERMISSION_DENIED", message: gallery ? CAMERA_MESSAGES.GALLERY_DENIED() : CAMERA_MESSAGES.DENIED() };
  }
  return { ok: false, code: "ERROR", message: gallery ? CAMERA_MESSAGES.GALLERY_ERROR : CAMERA_MESSAGES.ERROR };
}

// ---------- API ----------

/**
 * Prend UNE photo avec l'appareil photo. Retourne
 *   { ok:true, file }                           — File prêt pour le pipeline existant
 *   { ok:false, code:"CANCELLED" }              — l'utilisateur a fermé l'appareil photo : PAS une erreur, aucun message
 *   { ok:false, code, message }                 — PERMISSION_DENIED | UNAVAILABLE | ERROR (message français honnête)
 * Une seule photo à la fois (mémoire : jamais plusieurs bitmaps décodés en parallèle).
 * Jamais d'exception. Web : { ok:false, code:"UNSUPPORTED" } sans charger le plugin.
 */
export async function takePhoto() {
  if (!isNative()) return { ok: false, code: "UNSUPPORTED" };
  try {
    const { plugin: Camera } = await loadPlugin();
    const result = await Camera.takePhoto({
      quality: 90,
      correctOrientation: true,
      saveToGallery: false, // jamais d'écriture dans la galerie de l'utilisateur (et donc aucune permission de stockage)
      includeMetadata: false, // aucune métadonnée (EXIF) demandée au plugin
      editable: "no",
    });
    if (!result?.webPath) return { ok: false, code: "ERROR", message: CAMERA_MESSAGES.ERROR };
    return { ok: true, file: await webPathToFile(result.webPath) };
  } catch (err) {
    return mapCameraError(err);
  }
}

/**
 * Choisit des photos dans la galerie (sélecteur système : Photo Picker Android 13+, PHPicker iOS —
 * aucune permission de stockage). `multiple` + `limit` : plusieurs photos. Les fichiers sont lus
 * UN À LA FOIS. Même contrat de retour que takePhoto, avec `files`.
 * NOTE : non branché dans l'interface — <input type="file" multiple> ouvre déjà ce même sélecteur
 * système en natif (voir MOBILE.md, étape 3b) ; disponible pour un futur besoin.
 */
export async function pickPhotos({ multiple = false, limit = 1 } = {}) {
  if (!isNative()) return { ok: false, code: "UNSUPPORTED" };
  try {
    const { plugin: Camera } = await loadPlugin();
    const { results } = await Camera.chooseFromGallery({
      // mediaType : photos seulement (valeur par défaut du plugin, MediaTypeSelection.Photo)
      allowMultipleSelection: Boolean(multiple),
      limit: multiple ? Math.max(1, Math.floor(limit) || 1) : 1,
      includeMetadata: false,
      editable: "no",
    });
    const items = (results || []).filter((r) => r?.webPath).slice(0, multiple ? Math.max(1, Math.floor(limit) || 1) : 1);
    if (items.length === 0) return { ok: false, code: "CANCELLED" };
    const files = [];
    for (let i = 0; i < items.length; i += 1) {
      files.push(await webPathToFile(items[i].webPath, { index: i }));
    }
    return { ok: true, files };
  } catch (err) {
    return mapCameraError(err, { gallery: true });
  }
}
