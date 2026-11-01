// Sérialisation SVG (chaînes) de la marque, à partir du modèle de baobabMark.js.
// Pur et déterministe : utilisé par scripts/generate-logo-assets.mjs (qui écrit
// assets/logo/*.svg et toutes les icônes) et par les tests.

import { HORIZON, MARK, MARK_SIZE, PALETTES, trunkPath } from "./baobabMark.js";

const f = (n) => String(Math.round(n * 10) / 10);

function line(l, stroke, extra = "", w = l.w) {
  return `<line x1="${f(l.x1)}" y1="${f(l.y1)}" x2="${f(l.x2)}" y2="${f(l.y2)}" stroke="${stroke}" stroke-width="${f(w)}" stroke-linecap="round"${extra}/>`;
}
const dot = (n, fill, r = n.r) => `<circle cx="${f(n.x)}" cy="${f(n.y)}" r="${f(r)}" fill="${fill}"/>`;

/**
 * Corps de la marque (sans balise <svg>).
 * variant "color" : palette `dark` ou `light`. variant "mono" : une seule couleur
 * (`color`), traits épaissis, liens fins supprimés, soleil en anneau.
 */
export function markBody({ variant = "color", palette = "dark", color = variant === "mono" ? "currentColor" : HORIZON.ivoire, idPrefix = "bb" } = {}) {
  const m = MARK;
  const out = [];
  if (variant === "mono") {
    const k = 1.3; // traits plus gras : lisible à 24 px (icône de notification)
    // Soleil : anneau (un disque plein noierait les branches en monochrome).
    out.push(`<circle cx="${f(m.sun.cx)}" cy="${f(m.sun.cy)}" r="${f(m.sun.r - 12)}" fill="none" stroke="${color}" stroke-width="24"/>`);
    out.push(`<path d="${trunkPath()}" fill="${color}"/>`);
    out.push(`<line x1="${f(m.ground.x1)}" y1="${f(m.ground.y)}" x2="${f(m.ground.x2)}" y2="${f(m.ground.y)}" stroke="${color}" stroke-width="${f(m.ground.w * 1.6)}" stroke-linecap="round"/>`);
    m.crown.links.forEach((l) => out.push(line(l, color, "", l.w * k)));
    [...m.crown.tips, ...m.crown.forks].forEach((n) => out.push(dot(n, color, n.r * k)));
    m.roots.links.forEach((l) => out.push(line(l, color, "", l.w * k)));
    m.roots.nodes.forEach((n) => out.push(dot(n, color, n.r * k)));
    return out.join("");
  }
  const p = PALETTES[palette] || PALETTES.dark;
  const gid = `${idPrefix}-sun`;
  out.push(
    `<defs><linearGradient id="${gid}" x1="0.2" y1="0.05" x2="0.8" y2="0.95"><stop offset="0" stop-color="${p.sunFrom}"/><stop offset="1" stop-color="${p.sunTo}"/></linearGradient></defs>`
  );
  out.push(`<circle cx="${f(m.sun.cx)}" cy="${f(m.sun.cy)}" r="${f(m.sun.r)}" fill="url(#${gid})"/>`);
  out.push(`<path d="${trunkPath()}" fill="${p.trunk}"/>`);
  out.push(`<line x1="${f(m.ground.x1)}" y1="${f(m.ground.y)}" x2="${f(m.ground.x2)}" y2="${f(m.ground.y)}" stroke="${p.ground}" stroke-width="${f(m.ground.w)}" stroke-linecap="round" stroke-opacity="0.7"/>`);
  m.crown.thin.forEach((l) => out.push(line(l, p.crown, ' stroke-opacity="0.55"')));
  m.crown.links.forEach((l) => out.push(line(l, p.crown)));
  [...m.crown.forks, ...m.crown.tips].forEach((n) => out.push(dot(n, p.crown)));
  m.roots.links.forEach((l) => out.push(line(l, p.roots)));
  m.roots.nodes.forEach((n) => out.push(dot(n, p.roots)));
  return out.join("");
}

/** Document SVG autonome de la marque. */
export function markSvg(opts = {}) {
  const { title = "Baobab", variant = "color" } = opts;
  const body = markBody(opts);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_SIZE} ${MARK_SIZE}" width="${MARK_SIZE}" height="${MARK_SIZE}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

/** Groupe SVG de la marque placée sur une grille plus grande : échelle (px par unité de grille) et centre. */
export function placedMarkGroup({ scale, cx, cy, ...opts }) {
  const s = MARK_SIZE * scale;
  return `<g transform="translate(${f(cx - s / 2)} ${f(cy - s / 2)}) scale(${f(scale * 1000) / 1000})">${markBody({ idPrefix: "p", ...opts })}</g>`;
}
