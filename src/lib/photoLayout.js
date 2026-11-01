// Taille d'affichage d'une photo dans une bulle de conversation.
//
// Avant : largeur 100 % de la bulle (max 240 px) + hauteur plafonnée à 260 px
// + object-cover. Une photo portrait (3:4) était donc ROGNÉE (240 × 320 forcé
// dans 240 × 260) et une photo sans dimensions connues faisait « sauter » le
// fil au chargement. Ici on calcule une boîte qui RESPECTE le rapport
// largeur/hauteur de l'image tant qu'il reste raisonnable, et on ne rogne
// (object-cover) que les formats extrêmes (panoramas, captures très hautes).
//
// Fonction pure : width/height viennent de media_meta, écrit par l'autre
// participant — donc jamais fiables (absents, 0, NaN, énormes) : tout est
// validé ici.

export const PHOTO_MAX_WIDTH = 240;
export const PHOTO_MAX_HEIGHT = 320;
const PHOTO_MIN_SIDE = 96;
// Au-delà de ces rapports, la boîte garde le plafond et l'image est rognée
// au centre (la visionneuse plein écran montre toujours l'image entière).
const MAX_RATIO = 3; // largeur / hauteur
const MIN_RATIO = 1 / 3;

function validDimension(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100000;
}

/**
 * @returns {{width:number,height:number}|null} null si les dimensions ne sont
 *   pas connues (l'appelant retombe alors sur la taille naturelle de l'image).
 */
export function photoDisplaySize(width, height, { maxWidth = PHOTO_MAX_WIDTH, maxHeight = PHOTO_MAX_HEIGHT } = {}) {
  if (!validDimension(width) || !validDimension(height)) return null;
  const ratio = Math.min(MAX_RATIO, Math.max(MIN_RATIO, width / height));
  let w = maxWidth;
  let h = w / ratio;
  if (h > maxHeight) {
    h = maxHeight;
    w = h * ratio;
  }
  // Petites images : on ne les agrandit pas au-delà de leur taille réelle,
  // sauf pour garantir une cible tactile / une lisibilité minimale.
  if (width < w && height < h) {
    w = Math.max(width, PHOTO_MIN_SIDE);
    h = w / ratio;
  }
  if (h < PHOTO_MIN_SIDE) {
    h = PHOTO_MIN_SIDE;
    w = Math.min(maxWidth, h * ratio);
  }
  return { width: Math.round(w), height: Math.round(h) };
}
