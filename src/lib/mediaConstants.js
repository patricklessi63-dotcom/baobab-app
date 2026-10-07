// Constantes de la messagerie riche (médias) — un seul endroit, configurable.
// Séparé de src/constants.js (qui sert l'onboarding et l'ancien système de
// couleurs C.* — périmètre différent).

export const MEDIA_BUCKET = "chat-media";
export const POST_MEDIA_BUCKET = "post-media";

export const MEDIA_LIMITS = {
  image: {
    maxBytes: 8 * 1024 * 1024,
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  },
  video: {
    maxBytes: 50 * 1024 * 1024,
    mimes: ["video/mp4", "video/webm", "video/quicktime"],
  },
  audio: {
    maxBytes: 15 * 1024 * 1024,
    mimes: ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"],
  },
  file: {
    maxBytes: 20 * 1024 * 1024,
    mimes: [
      "application/pdf",
      "application/zip",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
};

// Bucket "event-covers" (supabase-events-v2.sql) : allowlist PLUS étroite que
// MEDIA_LIMITS.image (pas de GIF). Sans ce garde-fou client, un GIF choisi
// comme couverture passait la validation puis était refusé par le bucket
// APRÈS la création de l'événement (message générique, sans cause).
export const EVENT_COVER_MIMES = ["image/jpeg", "image/png", "image/webp"];
export const EVENT_COVER_FORMAT_ERROR = "Les images GIF ne sont pas acceptées pour une couverture. Choisis une photo JPEG, PNG ou WebP.";

export const AUDIO_MAX_DURATION_MS = 120000; // 2 minutes

export const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Chrome/Firefox/Edge refusent purement et simplement de lire le type MIME
// video/quicktime — canPlayType() renvoie "" quel que soit le codec réel à
// l'intérieur du conteneur .mov. Seul Safari (macOS/iOS) l'accepte. Beaucoup
// de vidéos envoyées depuis un iPhone sont étiquetées video/quicktime même
// quand le codec est H.264 (donc lisible partout une fois le conteneur
// ré-étiqueté en video/mp4). Ré-étiqueter ne change aucun octet du fichier :
// pour un fichier réellement encodé en HEVC, la lecture échouera quand même
// (aucun navigateur ne peut décoder un codec qu'il ne supporte pas), mais
// pour les fichiers H.264 mal étiquetés — le cas le plus courant — ça
// débloque une lecture qui échouait sans raison liée au codec.
export function effectiveMime(mime) {
  return mime === "video/quicktime" ? "video/mp4" : mime;
}

export function extFromMime(mime) {
  return MIME_TO_EXT[effectiveMime(mime)] || "bin";
}

// Types « image » que les navigateurs étiquettent de façon inconsistante :
// "image/jpg" (non standard, Android/anciens Windows), "image/pjpeg" (IE),
// "image/x-png". Normalisés vers le type canonique de l'allowlist du bucket.
const IMAGE_MIME_ALIASES = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/heif-sequence": "image/heif",
  "image/heic-sequence": "image/heic",
};

// Extension (en minuscules, sans point) -> type MIME. Sert UNIQUEMENT quand
// le navigateur fournit un file.type vide (fréquent sur Android/Windows pour
// HEIC/HEIF et certains JPEG venant d'un gestionnaire de fichiers tiers).
const IMAGE_EXT_TO_MIME = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
};

export function isHeicMime(mime) {
  return mime === "image/heic" || mime === "image/heif";
}

// Type MIME « utile » d'un fichier choisi : file.type normalisé (casse,
// alias), et si le navigateur n'en donne aucun (ou le générique
// application/octet-stream), déduit de l'extension du nom (IMG_0001.JPG,
// photo.HEIC...). Ne renvoie jamais undefined ; "" si rien n'est déductible.
// Pour une vidéo/un audio/un document le type déclaré est renvoyé tel quel.
export function resolveImageMime(file) {
  const declared = String(file?.type || "").trim().toLowerCase();
  if (declared && declared !== "application/octet-stream") return IMAGE_MIME_ALIASES[declared] || declared;
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  if (dot === -1) return declared;
  return IMAGE_EXT_TO_MIME[name.slice(dot + 1).trim().toLowerCase()] || declared;
}

// Vrai si le fichier est (ou se présente comme) une image, même avec un
// file.type vide : sert aux filtres « photo » des sélecteurs, qui écartaient
// silencieusement toute image sans type déclaré.
export function looksLikeImage(file) {
  return resolveImageMime(file).startsWith("image/");
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
