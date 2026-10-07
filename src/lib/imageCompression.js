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
// Ne touche jamais aux GIF (animation), vidéos et audios. Se dégrade
// silencieusement vers le fichier original (jamais bloquant) si le décodage
// ou le canvas échoue. Les fichiers qu'elle produit sont mémorisés : un
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
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch (_) {
      // Certains navigateurs lèvent sur l'objet d'options : on retente sans.
      bitmap = await createImageBitmap(file);
    }
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close?.() };
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
    if (!blob) return withMime(file, mime);
    // Safari ne sait pas encoder en WebP et renvoie alors un PNG : on ne
    // publie jamais un contenu dont le type diffère de celui annoncé.
    if (blob.type && blob.type !== targetType) return withMime(file, mime);

    let keepOriginal;
    if (heic) keepOriginal = false; // HEIC doit être converti quoi qu'il arrive
    else if (needsResize) keepOriginal = blob.size >= file.size;
    else if (jpegSource) keepOriginal = false; // toujours : retire l'EXIF/GPS
    else keepOriginal = blob.size > file.size;

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
    return withMime(file, mime);
  }
}
