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
    // Le canvas est transparent par défaut, mais la sortie ci-dessous est
    // toujours du JPEG (qui ne supporte pas la transparence) : sans fond
    // opaque peint avant le dessin, les navigateurs (Chrome/Firefox)
    // compositent les zones transparentes du PNG/WebP source en NOIR à
    // l'export JPEG — une image à fond transparent devenait donc une image
    // à fond noir après compression, silencieusement, dès qu'elle dépassait
    // MAX_DIMENSION. Un fond blanc est le choix le moins surprenant (cohérent
    // avec un fond de post/carte clair) pour ce cas marginal mais réel.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
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
