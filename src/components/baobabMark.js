// Géométrie PURE (aucun DOM) de la marque Baobab Horizon : un baobab simplifié
// (tronc en bouteille, 5 branches principales qui se divisent en deux niveaux
// et finissent en nœuds, racines or, soleil braise -> corail derrière).
//
// Source UNIQUE de la marque : elle sert au composant BaobabLogo.jsx ET au
// script scripts/generate-logo-assets.mjs (qui écrit assets/logo/*.svg et toutes
// les icônes). Déterministe : aucune valeur aléatoire, coordonnées arrondies.
//
// Grille 512 x 512, marque centrée sur la grille (voir `centrer`).

export const MARK_SIZE = 512;

/** Palette Horizon : seules ces couleurs sont autorisées dans la marque. */
export const HORIZON = {
  nuit: "#060B09",
  canopee: "#0F2B21",
  seve: "#1F7A5A",
  braise: "#F2A33A",
  corail: "#EA5F4B",
  menthe: "#62F0BA",
  ivoire: "#F3EEE4",
};

/** Palettes de la marque, par rôle d'élément. */
export const PALETTES = {
  // Sur fond nuit (par défaut).
  dark: {
    sunFrom: HORIZON.braise,
    sunTo: HORIZON.corail,
    trunk: HORIZON.ivoire,
    crown: HORIZON.menthe,
    roots: HORIZON.braise,
    ground: HORIZON.braise,
  },
  // Sur fond ivoire : tronc canopée, couronne sève, racines corail (le menthe et
  // le braise n'ont pas assez de contraste sur l'ivoire).
  light: {
    sunFrom: HORIZON.braise,
    sunTo: HORIZON.corail,
    trunk: HORIZON.canopee,
    crown: HORIZON.seve,
    roots: HORIZON.corail,
    ground: HORIZON.corail,
  },
};

const r1 = (n) => Math.round(n * 10) / 10;
const rad = (deg) => (deg * Math.PI) / 180;

// Branche = segment droit (liens du réseau) ; `angle` en degrés depuis la verticale
// (0 = vers le haut, positif = vers la droite).
function seg(x, y, angle, len) {
  return { x: x + Math.sin(rad(angle)) * len, y: y - Math.cos(rad(angle)) * len };
}

// ---------------------------------------------------------------------------
// Éléments « couleur » en coordonnées brutes (avant centrage).
// ---------------------------------------------------------------------------
const GROUND_Y = 392;
const TRUNK_TOP_Y = 250;

// Tronc en bouteille : col étroit, ventre large, évasement au sol (symétrique, x=256).
const TRUNK = [
  ["M", 224, 246],
  ["C", 226, 286, 190, 312, 184, 352],
  ["C", 182, 370, 176, 384, 166, GROUND_Y],
  ["L", 346, GROUND_Y],
  ["C", 336, 384, 330, 370, 328, 352],
  ["C", 322, 312, 286, 286, 288, 246],
  ["Z"],
];

// Branches principales : [x de départ sur le dessus du tronc, angle, longueur, sous-branches].
// Chaque sous-branche : [écart d'angle, longueur relative, divisée à nouveau ?].
// Réglé à la main (légèrement asymétrique : le réseau reste vivant, pas un blason) de
// sorte que deux branches voisines ne se croisent pas et que les nœuds ne se touchent pas.
const MAIN = [
  [228, -58, 80, [[-31, 0.6, false], [24, 0.8, true]]],
  [242, -33, 92, [[-15, 0.68, false], [20, 0.7, false]]],
  [256, -1, 86, [[-20, 0.7, false], [20, 0.76, true]]],
  [270, 31, 94, [[-20, 0.68, false], [22, 0.66, false]]],
  [284, 58, 80, [[-24, 0.8, true], [31, 0.6, false]]],
];
const SPLIT2 = [-27, 27];

function buildCrown() {
  const links = []; // { x1, y1, x2, y2, w, lvl }
  const tips = []; // { x, y, r }
  const forks = []; // { x, y, r }
  const W = [21, 15, 11];
  MAIN.forEach(([x0, ang, len, kids]) => {
    const y0 = TRUNK_TOP_Y + 2;
    const p1 = seg(x0, y0, ang, len);
    links.push({ x1: x0, y1: y0, x2: p1.x, y2: p1.y, w: W[0], lvl: 0 });
    forks.push({ x: p1.x, y: p1.y, r: 15 });
    kids.forEach(([d1, rel, again]) => {
      const a1 = ang + d1;
      const p2 = seg(p1.x, p1.y, a1, len * rel);
      links.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, w: W[1], lvl: 1 });
      if (again) {
        forks.push({ x: p2.x, y: p2.y, r: 11 });
        SPLIT2.forEach((d2) => {
          const p3 = seg(p2.x, p2.y, a1 + d2, len * 0.5);
          links.push({ x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y, w: W[2], lvl: 2 });
          tips.push({ x: p3.x, y: p3.y, r: 12.5 });
        });
      } else {
        tips.push({ x: p2.x, y: p2.y, r: 14 });
      }
    });
  });
  return { links, tips, forks };
}

// Quelques liens fins entre extrémités voisines : on relie les pointes proches (réseau).
function buildThinLinks(tips) {
  const sorted = [...tips].sort((a, b) => a.x - b.x);
  const out = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 26 && d < 58) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: 4 });
  }
  return out;
}

function buildRoots() {
  const links = [];
  const nodes = [];
  // [x de départ, angle depuis le bas, longueur]
  const R = [
    [196, -52, 48],
    [226, -24, 56],
    [256, 3, 46],
    [286, 26, 56],
    [316, 50, 48],
  ];
  R.forEach(([x0, ang, len], i) => {
    // direction vers le bas : angle mesuré depuis la verticale descendante
    const x1 = x0 + Math.sin(rad(ang)) * len;
    const y1 = GROUND_Y + 4 + Math.cos(rad(ang)) * len;
    links.push({ x1: x0, y1: GROUND_Y + 4, x2: x1, y2: y1, w: 13, lvl: 0 });
    // Les racines extérieures se divisent en deux petits nœuds.
    if (i !== 2) {
      [-1, 1].forEach((s) => {
        const a2 = ang + s * 34;
        const x2 = x1 + Math.sin(rad(a2)) * 26;
        const y2 = y1 + Math.cos(rad(a2)) * 26;
        links.push({ x1, y1, x2, y2, w: 9, lvl: 1 });
        nodes.push({ x: x2, y: y2, r: 8 });
      });
    } else {
      nodes.push({ x: x1, y: y1, r: 9 });
    }
  });
  return { links, nodes };
}

function bboxOf(model) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const add = (x, y, e) => {
    minX = Math.min(minX, x - e);
    maxX = Math.max(maxX, x + e);
    minY = Math.min(minY, y - e);
    maxY = Math.max(maxY, y + e);
  };
  add(model.sun.cx, model.sun.cy, model.sun.r);
  model.crown.links.forEach((l) => {
    add(l.x1, l.y1, l.w / 2);
    add(l.x2, l.y2, l.w / 2);
  });
  [...model.crown.tips, ...model.crown.forks, ...model.roots.nodes].forEach((n) => add(n.x, n.y, n.r));
  model.roots.links.forEach((l) => add(l.x2, l.y2, l.w / 2));
  add(model.ground.x1, model.ground.y, model.ground.w / 2);
  add(model.ground.x2, model.ground.y, model.ground.w / 2);
  return { minX, maxX, minY, maxY };
}

function shiftModel(model, dx, dy) {
  const mv = (o, kx, ky) => ({ ...o, [kx]: r1(o[kx] + dx), [ky]: r1(o[ky] + dy) });
  const mvLine = (l) => ({ ...l, x1: r1(l.x1 + dx), y1: r1(l.y1 + dy), x2: r1(l.x2 + dx), y2: r1(l.y2 + dy) });
  return {
    sun: { ...model.sun, cx: r1(model.sun.cx + dx), cy: r1(model.sun.cy + dy) },
    trunk: model.trunk.map((c) => (c[0] === "Z" ? c : [c[0], ...c.slice(1).map((v, i) => r1(v + (i % 2 === 0 ? dx : dy)))])),
    ground: { ...model.ground, x1: r1(model.ground.x1 + dx), x2: r1(model.ground.x2 + dx), y: r1(model.ground.y + dy) },
    crown: {
      links: model.crown.links.map(mvLine),
      thin: model.crown.thin.map(mvLine),
      tips: model.crown.tips.map((n) => mv(n, "x", "y")),
      forks: model.crown.forks.map((n) => mv(n, "x", "y")),
    },
    roots: { links: model.roots.links.map(mvLine), nodes: model.roots.nodes.map((n) => mv(n, "x", "y")) },
  };
}

function buildRaw() {
  const crown = buildCrown();
  crown.thin = buildThinLinks(crown.tips);
  return {
    sun: { cx: 256, cy: 170, r: 108 },
    trunk: TRUNK,
    ground: { x1: 92, x2: 420, y: GROUND_Y, w: 6 },
    crown,
    roots: buildRoots(),
  };
}

/** Modèle final, centré sur la grille 512 (boîte englobante au centre). */
export function buildMarkModel() {
  const raw = buildRaw();
  const b = bboxOf(raw);
  const dx = MARK_SIZE / 2 - (b.minX + b.maxX) / 2;
  const dy = MARK_SIZE / 2 - (b.minY + b.maxY) / 2;
  const model = shiftModel(raw, dx, dy);
  return { ...model, bounds: bboxOf(model) };
}

export const MARK = buildMarkModel();

export function trunkPath(trunk = MARK.trunk) {
  return trunk.map((c) => (c[0] === "Z" ? "Z" : `${c[0]}${c.slice(1).join(" ")}`)).join(" ");
}

/** Rayon maximal de la marque autour du centre de la grille (pour la zone sûre ronde). */
export function markRadius(model = MARK) {
  const c = MARK_SIZE / 2;
  let max = 0;
  const pt = (x, y, e = 0) => {
    max = Math.max(max, Math.hypot(x - c, y - c) + e);
  };
  pt(model.sun.cx, model.sun.cy, model.sun.r);
  model.crown.links.forEach((l) => pt(l.x2, l.y2, l.w / 2));
  [...model.crown.tips, ...model.roots.nodes].forEach((n) => pt(n.x, n.y, n.r));
  model.roots.links.forEach((l) => pt(l.x2, l.y2, l.w / 2));
  pt(model.ground.x1, model.ground.y, model.ground.w / 2);
  pt(model.ground.x2, model.ground.y, model.ground.w / 2);
  return max;
}
