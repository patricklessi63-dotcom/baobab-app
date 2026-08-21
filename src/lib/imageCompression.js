// Compression client légère avant upload (item 18 du cahier des charges
// composer) — réduit uniquement les images qui dépassent une résolution
// raisonnable pour un fil social ; ne touche jamais aux vidéos (pas de
// ré-encodage vidéo côté navigateur, hors de portée). Se dégrade
// silencieusement vers le fichier original si le canvas échoue pour
// n'importe quelle raison (jamais bloquant pour la publication).

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;

export async function compressImageIfNeeded(file) {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
      bitmap.close();
      return file;
    }

    const scale = MAX_DIMENSION / Math.max(width, height);
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) return file;

    const compressed = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
    return compressed.size < file.size ? compressed : file;
  } catch (_) {
    return file;
  }
}
