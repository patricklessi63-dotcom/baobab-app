import { validateMediaFile } from "./mediaValidation";
import { compressImageIfNeeded } from "./imageCompression";

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function shortName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  return n.length > 40 ? `${n.slice(0, 37)}...` : n;
}

// Sélection multiple de photos de profil (onboarding, édition de profil) :
// pour chaque fichier, dans l'ordre choisi et UN À LA FOIS (un seul bitmap
// décodé en mémoire à la fois — 6 à 10 photos de 12 Mpx en parallèle font
// planter un téléphone d'entrée de gamme) :
//   1. validation (type, signature, taille réelle affichée si trop gros) ;
//   2. redimensionnement + retrait EXIF/GPS + conversion HEIC (compressImageIfNeeded) ;
//   3. aperçu (data URL) fabriqué à partir du fichier DÉJÀ réduit (quelques
//      centaines de Ko) et non de l'original de plusieurs Mo.
// Retourne [{ file, preview }] — fichiers acceptés seulement, ordre conservé.
// Un fichier refusé ou illisible ne fait jamais perdre les autres : l'erreur
// est remontée via onError (préfixée du nom du fichier si la sélection en
// contient plusieurs).
export async function prepareImageSelection(files, { maxDimension = 1280, onError } = {}) {
  const out = [];
  const several = files.length > 1;
  const report = (file, message) => {
    const label = several ? shortName(file.name) : "";
    onError?.(label ? `${label} : ${message}` : message);
  };
  for (const file of files) {
    const { ok, error } = await validateMediaFile(file, "image");
    if (!ok) { report(file, error); continue; }
    const prepared = await compressImageIfNeeded(file, maxDimension);
    try {
      out.push({ file: prepared, preview: await readAsDataUrl(prepared) });
    } catch (_) {
      report(file, "Impossible de lire cette photo.");
    }
  }
  return out;
}
