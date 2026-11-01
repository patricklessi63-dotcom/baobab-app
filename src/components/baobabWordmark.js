// Mot « BAOBAB » en TRACÉS vectoriels dessinés à la main (lettres larges, graisse
// extra-grasse, dans l'esprit de Syne 800). Aucune police nécessaire : le rendu est
// identique partout (SVG, PNG d'icônes, image de partage). Ce n'est PAS le tracé
// exact de Syne ; si le propriétaire fournit la police, remplacer ces tracés par
// les contours de Syne ExtraBold.
//
// Boîte des lettres : hauteur 100, largeur WORDMARK_WIDTH, origine en haut à gauche.

import { HORIZON, MARK_SIZE } from "./baobabMark.js";
import { markBody } from "./baobabMarkSvg.js";

const STROKE = 23;
const GAP = 13;

// B : fût vertical + deux panses (traits épais, jonctions à angle vif).
const B = {
  w: 86,
  node: (fill) =>
    `<path d="M${STROKE / 2} 0V100M${STROKE / 2} ${STROKE / 2}H50A19 19 0 0 1 50 50H${STROKE / 2}M${STROKE / 2} 50H54A19 19 0 0 1 54 ${100 - STROKE / 2}H${STROKE / 2}" fill="none" stroke="${fill}" stroke-width="${STROKE}" stroke-linejoin="miter"/>`,
};
// A : triangle large avec contre-forme et barre.
const A = {
  w: 100,
  node: (fill) => `<path d="M0 100L38 0H62L100 100H75L67 78H33L25 100Z M41.5 57L50 33L58.5 57Z" fill="${fill}" fill-rule="evenodd"/>`,
};
// O : anneau parfait.
const O = {
  w: 100,
  node: (fill) => `<circle cx="50" cy="50" r="${50 - STROKE / 2}" fill="none" stroke="${fill}" stroke-width="${STROKE}"/>`,
};

const LETTERS = [B, A, O, B, A, B];
export const WORDMARK_WIDTH = LETTERS.reduce((s, l) => s + l.w, 0) + GAP * (LETTERS.length - 1);
export const WORDMARK_HEIGHT = 100;

/** Les six lettres (groupe SVG, hauteur 100). */
export function wordmarkLetters(fill = HORIZON.ivoire) {
  let x = 0;
  const parts = LETTERS.map((l) => {
    const g = `<g transform="translate(${x} 0)">${l.node(fill)}</g>`;
    x += l.w + GAP;
    return g;
  });
  return `<g>${parts.join("")}</g>`;
}

// Disposition horizontale marque + mot (viewBox 1160 x 320).
export const WORDMARK_VIEWBOX = { w: 1160, h: 320 };

/**
 * Logo complet : marque + mot. scheme "dark" (pour fond nuit : mot ivoire) ou
 * "light" (pour fond ivoire : mot canopée).
 */
export function wordmarkSvg({ scheme = "dark", title = "Baobab" } = {}) {
  const { w, h } = WORDMARK_VIEWBOX;
  const textFill = scheme === "light" ? HORIZON.canopee : HORIZON.ivoire;
  const s = h / MARK_SIZE; // la marque occupe toute la hauteur
  const ts = 1.25;
  const textX = MARK_SIZE * s + 34;
  const textY = (h - WORDMARK_HEIGHT * ts) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title><g transform="scale(${s})">${markBody({ palette: scheme, idPrefix: "w" })}</g><g transform="translate(${textX} ${textY}) scale(${ts})">${wordmarkLetters(textFill)}</g></svg>\n`;
}
