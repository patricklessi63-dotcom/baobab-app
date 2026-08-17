// Constantes de la messagerie riche (médias) — un seul endroit, configurable.
// Séparé de src/constants.js (qui sert l'onboarding et l'ancien système de
// couleurs C.* — périmètre différent).

export const MEDIA_BUCKET = "chat-media";

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

export function extFromMime(mime) {
  return MIME_TO_EXT[mime] || "bin";
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}
