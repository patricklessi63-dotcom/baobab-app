import { MEDIA_LIMITS, formatFileSize, resolveImageMime, isHeicMime, looksLikeImage } from "./mediaConstants";
import { canDecodeImage } from "./imageCompression";

// Signatures binaires (magic bytes) des premiers octets — vraie défense en
// profondeur, ne fait pas confiance uniquement à file.type (fourni par le
// navigateur et falsifiable). Chaque entrée : { bytes: number[], offset? }.
// WEBP est un cas particulier : "RIFF" en tête + "WEBP" à l'octet 8.
const SIGNATURES = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "application/pdf": [[0x25, 0x50, 0x44, 0x46]], // %PDF
  "application/zip": [[0x50, 0x4b, 0x03, 0x04]], // PK\x03\x04
  // .docx/.xlsx sont aussi des ZIP (Office Open XML) — même signature.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [[0x50, 0x4b, 0x03, 0x04]],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [[0x50, 0x4b, 0x03, 0x04]],
};

function matchesSignature(bytes, signature) {
  return signature.every((b, i) => bytes[i] === b);
}

async function sniffMagicBytes(file, declaredMime) {
  // Types sans signature binaire fiable (texte brut, doc/xls legacy binaire
  // OLE variable, webm/mp4/ogg dont la boîte d'en-tête varie) : on ne peut
  // pas les vérifier honnêtement sans un décodeur complet — on se limite
  // alors à la validation taille + MIME déclaré (déjà faite avant cet appel).
  if (isHeicMime(declaredMime)) {
    // HEIC/HEIF : conteneur ISO-BMFF, boîte "ftyp" aux octets 4-7.
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    return head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
  }
  if (declaredMime === "image/webp") {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const riff = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    const webp = head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    return riff && webp;
  }
  const signatures = SIGNATURES[declaredMime];
  if (!signatures) return true; // pas de signature connue pour ce type — on ne peut pas sniffer, on ne bloque pas
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return signatures.some((sig) => matchesSignature(head, sig));
}

// Valide un fichier avant upload : taille, type MIME déclaré, puis
// signature binaire réelle pour les types qui en ont une connue. Ne jette
// jamais — retourne toujours { ok, error? } pour un affichage inline simple.
// options.mimes / options.formatError : allowlist plus étroite que celle du kind
// quand le bucket de destination l'est (ex. couvertures d'événement, sans GIF).
export async function validateMediaFile(file, kind, options = {}) {
  const limits = MEDIA_LIMITS[kind];
  if (!limits) return { ok: false, error: "Type de média non pris en charge." };

  // Photos : le type effectif tolère un file.type vide (Android/Windows,
  // HEIC) ou un alias ("image/jpg") en le déduisant de l'extension, et HEIC/
  // HEIF est accepté tant que ce navigateur sait le décoder — l'envoi le
  // convertira en JPEG (compressImageIfNeeded). Les autres kinds restent
  // stricts : seul un type déclaré exact y est valide.
  const mime = kind === "image" ? resolveImageMime(file) : file.type;
  const heic = kind === "image" && isHeicMime(mime);

  const allowedMimes = options.mimes || limits.mimes;
  if (!heic && !allowedMimes.includes(mime)) {
    return { ok: false, error: options.formatError || "Ce format de fichier n'est pas autorisé." };
  }
  if (file.size > limits.maxBytes) {
    return {
      ok: false,
      error: `Fichier trop volumineux (${formatFileSize(file.size)}, max ${formatFileSize(limits.maxBytes)}).`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "Ce fichier est vide." };
  }

  try {
    const signatureOk = await sniffMagicBytes(file, mime);
    if (!signatureOk) {
      return { ok: false, error: "Le contenu du fichier ne correspond pas à son type déclaré." };
    }
  } catch (_) {
    // Lecture des octets impossible (fichier corrompu/inaccessible) — on
    // laisse Supabase Storage (allowlist MIME côté serveur) trancher plutôt
    // que de bloquer sur une erreur de lecture locale.
  }

  if (heic && !(await canDecodeImage(file))) {
    return {
      ok: false,
      error: "Ce format de photo (HEIC) n'est pas lisible sur cet appareil. Choisis une photo JPEG, ou règle ton appareil photo sur « Le plus compatible ».",
    };
  }

  return { ok: true };
}

// Comme detectKindFromMime mais tolère un file.type vide (photo glissée depuis
// un gestionnaire de fichiers Android/Windows) en se rabattant sur l'extension.
export function detectKindFromFile(file) {
  return looksLikeImage(file) ? "image" : detectKindFromMime(file.type || "");
}

export function detectKindFromMime(mime) {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
