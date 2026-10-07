// Préparation client des images avant upload (réseau mobile, data limitée,
// vie privée). Une seule fonction d'entrée : compressImageIfNeeded().
//
// Ce qu'elle fait, pour toute image décodable (JPEG, PNG, WebP, HEIC/HEIF) :
//  1. Redimensionne si le plus grand côté dépasse `maxDimension`.
//  2. Respecte l'orientation EXIF (createImageBitmap `imageOrientation:
//     "from-image"`) : la photo n'est jamais envoyée couchée.
//  3. RÉ-ENCODE via canvas, ce qui SUPPRIME toutes les métadonnées (EXIF :
//     position GPS du domicile, modèle du téléphone, date). Un JPEG/HEIC
//     est donc toujours ré-encodé, même s'il est déjà petit — sinon une
//     photo de 1200 px partait avec ses coordonnées GPS intactes.
//  4. Convertit HEIC/HEIF en JPEG (non lisible par la plupart des
//     navigateurs ni autorisé par les buckets Storage).
//
// Ne touche jamais aux GIF, WebP animés et APNG (le canvas n'en garderait que
// la première image), vidéos et audios. Se dégrade silencieusement vers le
// fichier original (jamais bloquant) si le décodage ou le canvas échoue — un
// JPEG de repli part alors avec son bloc GPS effacé (voir stripJpegGps) : la
// position ne quitte jamais l'appareil, même sur ce chemin dégradé. Les fichiers qu'elle produit sont mémorisés : un
// second passage (ex. « Réessayer » un envoi) ne les ré-encode pas (perte de
// qualité en cascade + CPU inutile sur un téléphone d'entrée de gamme).
//
// `maxDimension` (2e paramètre, optionnel) : borne du plus grand côté après
// redimensionnement. Par défaut 1920. Exemples d'appels :
//   compressImageIfNeeded(coverFile, 1280)   // couvertures
//   compressImageIfNeeded(photoFile, 1600)   // médias de communauté/galerie
//   compressImageIfNeeded(photoFile)         // fil social, plein écran (1920)
// Astuce plan Pro Supabase : les transformations d'image à la volée
// (`getPublicUrl(..., { transform: { width } })`) permettraient de servir
// plusieurs tailles depuis un seul original — non disponible en plan gratuit,
// d'où cette réduction à l'upload (voir DEPLOIEMENT.md §10).

import { resolveImageMime, isHeicMime } from "./mediaConstants";

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

// Fichiers déjà passés par compressImageIfNeeded (sortie ou original conservé
// délibérément) et leurs dimensions finales.
const processed = new WeakSet();
const processedSize = new WeakMap();

// Dimensions { width, height } d'un fichier produit par
// compressImageIfNeeded, ou null (fichier non traité / repli sur l'original).
// Permet de réserver la place d'une image avant son chargement (aspect-ratio).
export function getProcessedImageSize(file) {
  return (file && processedSize.get(file)) || null;
}

function baseName(name) {
  const clean = String(name || "").replace(/^.*[\\/]/, "");
  const base = clean.replace(/\.[^./\\]*$/, "").trim();
  return base || "photo";
}

// Même contenu, type MIME corrigé (file.type vide ou alias "image/jpg") : sans
// ça le bucket Storage reçoit "application/octet-stream" et répond une erreur
// obscure. Si le runtime ne sait pas construire un File, on garde l'original.
function withMime(file, mime) {
  if (!mime || file.type === mime) return file;
  try {
    return new File([file], file.name || "photo", { type: mime });
  } catch (_) {
    return file;
  }
}

// --- Vie privée / animation : lectures binaires ciblées -----------------------

async function readHead(file, length) {
  return new Uint8Array(await file.slice(0, length).arrayBuffer());
}

// WebP : octets 12-15 = "VP8X" puis, octet 20, les drapeaux d'extension
// (0x02 = animation, 0x08 = bloc EXIF). Renvoie null si pas de VP8X.
async function webpFlags(file) {
  try {
    const h = await readHead(file, 32);
    if (h[12] === 0x56 && h[13] === 0x50 && h[14] === 0x38 && h[15] === 0x58) return h[20];
  } catch (_) { /* fichier illisible : on ne sait pas */ }
  return null;
}

// WebP animé ou APNG (chunk acTL avant le premier IDAT) : passés par un
// canvas, ils perdraient leur animation (seule la première image survit) —
// ils repartent donc tels quels, comme les GIF.
async function isAnimatedImage(file, mime) {
  try {
    if (mime === "image/webp") return ((await webpFlags(file)) & 0x02) !== 0;
    if (mime === "image/png") {
      const h = await readHead(file, 65536);
      let p = 8; // après la signature PNG
      while (p + 8 <= h.length) {
        const len = ((h[p] << 24) | (h[p + 1] << 16) | (h[p + 2] << 8) | h[p + 3]) >>> 0;
        const type = String.fromCharCode(h[p + 4], h[p + 5], h[p + 6], h[p + 7]);
        if (type === "acTL") return true;
        if (type === "IDAT" || type === "IEND") return false;
        p += 12 + len;
      }
    }
  } catch (_) { /* illisible : traité comme non animé */ }
  return false;
}

const EXIF_TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

// Efface sur place l'IFD GPS d'un bloc EXIF (tiffStart = début de l'en-tête
// TIFF, end = fin du segment APP1). Le reste (orientation comprise) est
// conservé : c'est le chemin de repli, où l'on ne peut pas ré-encoder. Renvoie
// true si un IFD GPS a été effacé.
function wipeGpsIfd(buf, tiffStart, end) {
  const le = buf[tiffStart] === 0x49;
  const u16 = (o) => (le ? buf[o] | (buf[o + 1] << 8) : (buf[o] << 8) | buf[o + 1]);
  const u32 = (o) => (le
    ? (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0
    : ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0);
  if (tiffStart + 8 > end || u16(tiffStart + 2) !== 42) return false;
  const ifd0 = tiffStart + u32(tiffStart + 4);
  if (ifd0 + 2 > end) return false;
  const count = u16(ifd0);
  if (ifd0 + 2 + count * 12 > end) return false;
  for (let i = 0; i < count; i++) {
    const entry = ifd0 + 2 + i * 12;
    if (u16(entry) !== 0x8825) continue; // GPSInfo
    const gps = tiffStart + u32(entry + 8);
    if (gps + 2 > end) return false;
    const n = u16(gps);
    if (gps + 2 + n * 12 > end) return false;
    for (let j = 0; j < n; j++) {
      const g = gps + 2 + j * 12;
      const bytes = (EXIF_TYPE_SIZE[u16(g + 2)] || 1) * u32(g + 4);
      const valueAt = tiffStart + u32(g + 8);
      if (bytes > 4 && valueAt + bytes <= end) buf.fill(0, valueAt, valueAt + bytes);
    }
    buf.fill(0, gps, gps + 2 + n * 12); // nombre d'entrées = 0, plus aucune entrée
    return true;
  }
  return false;
}

// JPEG qu'on ne peut pas ré-encoder (décodage/canvas en échec) : efface la
// position GPS de son EXIF avant envoi. Ne jette jamais ; renvoie le fichier
// reçu si rien à effacer ou si la structure est illisible.
async function stripJpegGps(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return file;
    let p = 2;
    let changed = false;
    while (p + 4 <= buf.length && buf[p] === 0xff) {
      const marker = buf[p + 1];
      if (marker === 0xff) { p += 1; continue; } // octets de remplissage
      if (marker === 0xda || marker === 0xd9) break; // début des données image
      const segLen = (buf[p + 2] << 8) | buf[p + 3];
      const isExif = marker === 0xe1 && buf[p + 4] === 0x45 && buf[p + 5] === 0x78 && buf[p + 6] === 0x69 && buf[p + 7] === 0x66;
      if (isExif && wipeGpsIfd(buf, p + 10, Math.min(p + 2 + segLen, buf.length))) changed = true;
      p += 2 + segLen;
    }
    return changed ? new File([buf], file.name || "photo.jpg", { type: file.type || "image/jpeg" }) : file;
  } catch (_) {
    return file;
  }
}

// Original conservé faute de mieux (décodage/canvas/encodage en échec) : type
// MIME corrigé, et un JPEG ne part jamais avec sa position GPS.
async function fallbackOriginal(file, mime) {
  const typed = withMime(file, mime);
  return mime === "image/jpeg" ? stripJpegGps(typed) : typed;
}

// Décodage via <img> pour les navigateurs sans createImageBitmap(Blob)
// (Safari < 15, iPhone anciens). Le navigateur applique lui-même l'orientation
// EXIF au dessin dans le canvas.
function decodeViaImageElement(file) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== "function" || typeof URL?.createObjectURL !== "function") {
      reject(new Error("no image decoder"));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    const release = () => { try { URL.revokeObjectURL(url); } catch (_) {} };
    img.onload = () => resolve({
      width: img.naturalWidth,
      height: img.naturalHeight,
      source: img,
      close: release,
    });
    img.onerror = () => { release(); reject(new Error("decode failed")); };
    img.src = url;
  });
}

async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      let bitmap;
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch (_) {
        // Certains navigateurs lèvent sur l'objet d'options : on retente sans.
        bitmap = await createImageBitmap(file);
      }
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close?.() };
    } catch (bitmapError) {
      // createImageBitmap(Blob) défaillant sur ce navigateur/ce fichier :
      // dernier recours = <img>, qui décode aussi des cas que le bitmap refuse.
      try { return await decodeViaImageElement(file); } catch (_) { throw bitmapError; }
    }
  }
  return decodeViaImageElement(file);
}

// Le navigateur sait-il décoder ce fichier ? (utile pour HEIC : lisible sur
// Safari, pas ailleurs). Ne jette jamais.
export async function canDecodeImage(file) {
  try {
    const decoded = await decodeImage(file);
    decoded.close();
    return true;
  } catch (_) {
    return false;
  }
}

export async function compressImageIfNeeded(file, maxDimension = MAX_DIMENSION) {
  const mime = resolveImageMime(file);
  if (!mime.startsWith("image/")) return file;
  if (mime === "image/gif") return withMime(file, mime);
  if (processed.has(file)) return file;
  // WebP animé / APNG : le canvas ne garderait que la première image.
  if ((mime === "image/webp" || mime === "image/png") && await isAnimatedImage(file, mime)) return withMime(file, mime);

  let decoded = null;
  try {
    decoded = await decodeImage(file);
    const { width, height } = decoded;
    const needsResize = width > maxDimension || height > maxDimension;
    const heic = isHeicMime(mime);
    const jpegSource = mime === "image/jpeg";
    // JPEG/HEIC : toujours ré-encodé en JPEG (retire l'EXIF, convertit HEIC).
    // PNG/WebP : ré-encodé seulement si redimensionné (sortie JPEG, comme
    // avant) ou, sinon, dans leur propre format (transparence conservée) si
    // cela ne grossit pas le fichier.
    const targetType = jpegSource || heic || needsResize ? "image/jpeg" : mime;

    const scale = needsResize ? maxDimension / Math.max(width, height) : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (targetType === "image/jpeg") {
      // Le canvas est transparent par défaut mais le JPEG ne gère pas la
      // transparence : sans fond opaque, Chrome/Firefox compositent les zones
      // transparentes d'un PNG/WebP en NOIR à l'export. Fond blanc = le choix
      // le moins surprenant.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetW, targetH);
    }
    ctx.drawImage(decoded.source, 0, 0, targetW, targetH);
    // Libère tout de suite le bitmap décodé (plusieurs dizaines de Mo pour
    // une photo 12 Mpx) avant l'encodage : mémoire limitée sur mobile.
    decoded.close();
    decoded = null;

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, targetType, JPEG_QUALITY));
    if (!blob) return fallbackOriginal(file, mime);
    // Safari ne sait pas encoder en WebP et renvoie alors un PNG : on ne
    // publie jamais un contenu dont le type diffère de celui annoncé.
    if (blob.type && blob.type !== targetType) return fallbackOriginal(file, mime);

    // Un JPEG/HEIC n'est JAMAIS conservé tel quel, même si le ré-encodé est plus
    // lourd : l'original porte son EXIF (position GPS du domicile). Seuls PNG/
    // WebP peuvent rester intacts quand c'est plus léger — sauf un WebP qui
    // déclare un bloc EXIF (drapeau 0x08 de l'en-tête VP8X).
    let keepOriginal;
    if (heic || jpegSource) keepOriginal = false;
    else if (needsResize) keepOriginal = blob.size >= file.size;
    else keepOriginal = blob.size > file.size;
    if (keepOriginal && mime === "image/webp" && ((await webpFlags(file)) & 0x08) !== 0) keepOriginal = false;

    if (keepOriginal) {
      const original = withMime(file, mime);
      processed.add(original);
      return original;
    }
    const compressed = new File([blob], `${baseName(file.name)}.${targetType === "image/jpeg" ? "jpg" : targetType === "image/png" ? "png" : "webp"}`, { type: targetType });
    processed.add(compressed);
    processedSize.set(compressed, { width: targetW, height: targetH });
    return compressed;
  } catch (_) {
    try { decoded?.close(); } catch (__) {}
    return fallbackOriginal(file, mime);
  }
}
