// Modèle PUR de la scène « Baobab Horizon » : génération déterministe du
// réseau de points (racines, tronc, branches) et simulation des impulsions.
// Aucun accès à window/document/canvas : testable en environnement node.
// Le dessin vit dans TreeNetwork.jsx.

export const TAU = Math.PI * 2;

/** Zones du baobab : l'indice sert aussi à choisir la couleur. */
export const ZONE = { ROOTS: 0, TRUNK: 1, BRANCHES: 2 };
export const ZONE_NAMES = ["racines", "tronc", "branches"];
/** Racines or (braise), tronc ivoire, canopée menthe (signal). */
export const ZONE_COLORS = [
  [242, 163, 58],
  [243, 238, 228],
  [98, 240, 186],
];

export const DEFAULT_SEED = 11;
export const LITE_DENSITY = 0.7;
export const MAX_PULSES = 36;
export const MAX_WAVES = 4;

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite. */
export function createRng(seed) {
  let s = seed | 0;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Accepte 0|1|2, "racines"|"tronc"|"branches" ; tout le reste donne -1 (aucune zone). */
export function zoneIndex(zone) {
  if (zone === 0 || zone === 1 || zone === 2) return zone;
  if (typeof zone === "string") return ZONE_NAMES.indexOf(zone.toLowerCase());
  return -1;
}

/**
 * Densité du réseau : 1 (complète) ou LITE_DENSITY sur petit écran / appareil
 * modeste / app native. Une densité plus faible espace les points (moins de
 * nœuds, moins de liens, moins de travail par image).
 */
export function pickDensity({ width = 1024, hardwareConcurrency, deviceMemory, lite = false } = {}) {
  if (lite) return LITE_DENSITY;
  if (width > 0 && width < 480) return LITE_DENSITY;
  if (typeof hardwareConcurrency === "number" && hardwareConcurrency > 0 && hardwareConcurrency <= 4) return LITE_DENSITY;
  if (typeof deviceMemory === "number" && deviceMemory > 0 && deviceMemory <= 2) return LITE_DENSITY;
  return 1;
}

/** Facteur d'intensité d'une zone selon la zone mise en valeur (-1 : aucune). */
export function zoneFactor(selected, z) {
  if (selected < 0) return 1;
  return z === selected ? 1.9 : 0.32;
}

/**
 * Construit le réseau. Déterministe : mêmes (width, height, density, seed) donnent
 * le même réseau. Les arêtes sont [a, b] avec a différent de b ; la zone d'une
 * arête est celle de son extrémité b.
 */
export function buildTreeModel({ width, height, density = 1, seed = DEFAULT_SEED } = {}) {
  const w = Math.max(1, Number(width) || 0);
  const h = Math.max(1, Number(height) || 0);
  const dens = Math.min(1, Math.max(0.3, Number(density) || 1));
  const R = createRng(seed);
  const S = Math.min(w * 0.95, h * 1.18);
  const sp = Math.max(10, Math.min(15, S / 38)) / Math.sqrt(dens);
  // Densité réduite : une génération de branches en moins (le gros du réseau
  // vient de la canopée, l'espacement seul ne suffit pas à l'alléger).
  const crownDepth = dens < 0.85 ? 2 : 3;
  const cx = w / 2;
  const groundY = h * 0.7;

  const nodes = [];
  const edges = [];
  function add(x, y, z, r) {
    nodes.push({ x, y, z, r: r || 1.5, ph: R() * TAU });
    return nodes.length - 1;
  }
  function link(a, b) {
    if (a !== b) edges.push([a, b]);
  }

  // Tronc : maillage triangulaire, du sol vers le haut.
  const ty = h * 0.43;
  const rows = [];
  let ri = 0;
  for (let y = groundY; y >= ty; y -= sp * 0.86, ri++) {
    const tt = (groundY - y) / (groundY - ty);
    const hw = S * (0.125 - 0.036 * tt + 0.012 * Math.sin(tt * 8));
    const row = [];
    const off = ((ri % 2) * sp) / 2;
    for (let x = cx - hw + off; x <= cx + hw; x += sp) {
      row.push(add(x + (R() - 0.5) * 3, y + (R() - 0.5) * 3, ZONE.TRUNK, 1.5 + R() * 0.5));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length; i++) {
    const A = rows[i];
    for (let j = 0; j < A.length - 1; j++) link(A[j], A[j + 1]);
    if (i > 0) {
      const B = rows[i - 1];
      for (const a of A) {
        for (const b of B) {
          const dx = nodes[a].x - nodes[b].x;
          const dy = nodes[a].y - nodes[b].y;
          if (dx * dx + dy * dy < sp * sp * 1.3) link(a, b);
        }
      }
    }
  }
  const topRow = rows[rows.length - 1];
  const botRow = rows[0];
  function nearest(list, x, y) {
    let best = list[0];
    let bd = Infinity;
    for (const i of list) {
      const dx = nodes[i].x - x;
      const dy = nodes[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  // Branches (canopée, z=2) et racines (z=0) : même fonction récursive.
  function branch(x0, y0, ang0, len, depth, parent, z) {
    let x = x0;
    let y = y0;
    let ang = ang0;
    const n = Math.max(2, Math.round(len / sp));
    let prev = parent;
    for (let i = 0; i < n; i++) {
      x += Math.cos(ang) * sp;
      y += Math.sin(ang) * sp;
      ang += (R() - 0.5) * 0.16;
      const id = add(x, y, z, depth === 0 && i === n - 1 ? 2 : 1.5);
      link(prev, id);
      prev = id;
    }
    if (depth > 0) {
      branch(x, y, ang - (0.5 + R() * 0.25), len * 0.74, depth - 1, prev, z);
      branch(x, y, ang + (0.5 + R() * 0.25), len * 0.74, depth - 1, prev, z);
      if (R() < 0.5 && z === ZONE.BRANCHES) branch(x, y, ang + (R() - 0.5) * 0.3, len * 0.55, depth - 1, prev, z);
    } else if (z === ZONE.BRANCHES) {
      // Bouquet de feuillage au bout de chaque dernière branche.
      const ring = [];
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const id2 = add(x + Math.cos(a) * sp * 0.95, y + Math.sin(a) * sp * 0.95, ZONE.BRANCHES, 1.2);
        link(prev, id2);
        ring.push(id2);
      }
      for (let m = 0; m < 6; m++) link(ring[m], ring[(m + 1) % 6]);
    }
  }
  for (const k of [-1, -0.5, 0, 0.5, 1]) {
    const start = nearest(topRow, cx + k * S * 0.075, ty);
    branch(nodes[start].x, nodes[start].y, -Math.PI / 2 + k * 1.15, S * (crownDepth === 3 ? 0.14 : 0.19), crownDepth, start, ZONE.BRANCHES);
  }
  for (const k of [-1, -0.55, -0.15, 0.2, 0.6, 1]) {
    const start = nearest(botRow, cx + k * S * 0.105, groundY);
    branch(nodes[start].x, nodes[start].y, Math.PI / 2 + k * 0.85, S * 0.15, 2, start, ZONE.ROOTS);
  }

  // Étoiles (décor), proportionnelles à la densité.
  const stars = [];
  const starCount = Math.round(70 * dens);
  for (let s = 0; s < starCount; s++) stars.push({ x: R() * w, y: R() * h * 0.62, r: 0.4 + R() * 0.9, ph: R() * TAU });

  // Structures dérivées.
  const adj = nodes.map(() => []);
  const zEdges = [[], [], []];
  const zNodes = [[], [], []];
  edges.forEach((e, i) => {
    adj[e[0]].push(e[1]);
    adj[e[1]].push(e[0]);
    zEdges[nodes[e[1]].z].push(i);
  });
  nodes.forEach((n, i) => zNodes[n.z].push(i));

  return { width: w, height: h, density: dens, seed, spacing: sp, groundY, nodes, edges, adj, zEdges, zNodes, stars };
}

/** Nombre de nœuds atteignables depuis `from` (parcours du graphe). */
export function reachableCount(model, from = 0) {
  const seen = new Uint8Array(model.nodes.length);
  const stack = [from];
  seen[from] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop();
    count++;
    for (const j of model.adj[i]) {
      if (!seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Simulation (impulsions, ondes, énergie des nœuds)
// ---------------------------------------------------------------------------

export function createSim(model) {
  const N = model.nodes.length;
  return {
    t: 0,
    px: Float32Array.from(model.nodes, (n) => n.x),
    py: Float32Array.from(model.nodes, (n) => n.y),
    en: new Float32Array(N),
    pulses: [],
    waves: [],
    spawnT: 0,
  };
}

/** Choisit le prochain saut d'une impulsion : plutôt vers le haut, avec un peu de hasard. */
export function pickNextHop(model, sim, from, cameFrom, rand = Math.random) {
  const nb = model.adj[from].filter((q) => q !== cameFrom);
  if (!nb.length) return -1;
  let pick = nb[0];
  let bestScore = -Infinity;
  for (const q of nb) {
    const sc = (sim.py[from] - sim.py[q]) * 0.6 + rand() * 9;
    if (sc > bestScore) {
      bestScore = sc;
      pick = q;
    }
  }
  return pick;
}

/** Fait naître une impulsion sur un nœud de racine (si le tirage y mène). */
export function spawnPulse(model, sim, rand = Math.random) {
  const roots = model.zNodes[ZONE.ROOTS];
  if (!roots.length) return false;
  const src = roots[Math.floor(rand() * roots.length)];
  if (src === undefined || !model.adj[src].length) return false;
  const b = model.adj[src][Math.floor(rand() * model.adj[src].length)];
  sim.pulses.push({ a: src, b, u: 0, hops: 0, max: 22 + Math.floor(rand() * 30), v: 80 + rand() * 60 });
  return true;
}

export function addWave(sim, x, y) {
  if (sim.waves.length < MAX_WAVES) sim.waves.push({ x, y, r: 0 });
}

/**
 * Avance la simulation de dt secondes. `anim=false` : image fixe (positions de
 * repos, énergie qui retombe, aucune impulsion). Une impulsion reste toujours
 * sur une arête du graphe (b voisin de a) et disparaît en fin de course.
 */
export function stepSim(model, sim, dt, anim, rand = Math.random, opts = {}) {
  const maxPulses = opts.maxPulses ?? MAX_PULSES;
  const { nodes } = model;
  const N = nodes.length;
  const { px, py, en } = sim;
  if (anim) sim.t += dt;
  const t = sim.t;
  const decay = Math.exp(-dt * 1.7);
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    px[i] = n.x + (anim ? Math.sin(t * 0.7 + n.ph) * 1.3 : 0);
    py[i] = n.y + (anim ? Math.cos(t * 0.6 + n.ph * 1.3) * 1.3 : 0);
    en[i] *= decay;
  }
  if (!anim) return;

  sim.spawnT -= dt;
  if (sim.spawnT <= 0 && sim.pulses.length < maxPulses) {
    sim.spawnT = 0.14 + rand() * 0.2;
    spawnPulse(model, sim, rand);
  }

  const pulses = sim.pulses;
  for (let i = pulses.length - 1; i >= 0; i--) {
    const p = pulses[i];
    const dx = px[p.b] - px[p.a];
    const dy = py[p.b] - py[p.a];
    const L = Math.sqrt(dx * dx + dy * dy) || 1;
    p.u += (p.v * dt) / L;
    if (p.u >= 1) {
      en[p.b] = Math.max(en[p.b], 1);
      p.hops++;
      const next = pickNextHop(model, sim, p.b, p.a, rand);
      if (next < 0 || p.hops > p.max) {
        pulses.splice(i, 1);
        continue;
      }
      p.a = p.b;
      p.b = next;
      p.u = 0;
    }
  }

  const waves = sim.waves;
  const reach = Math.max(model.width, model.height) * 1.1;
  for (let i = waves.length - 1; i >= 0; i--) {
    const wv = waves[i];
    wv.r += dt * 420;
    if (wv.r > reach) {
      waves.splice(i, 1);
      continue;
    }
    for (let k = 0; k < N; k++) {
      const ddx = px[k] - wv.x;
      const ddy = py[k] - wv.y;
      const df = Math.abs(Math.sqrt(ddx * ddx + ddy * ddy) - wv.r);
      if (df < 30) en[k] = Math.max(en[k], 1 - df / 30);
    }
  }
}

/** Les `count` nœuds les plus proches de (x, y) dans `radius` : [[distance, indice], ...]. */
export function nearestToPoint(sim, x, y, radius = 130, count = 6) {
  const cand = [];
  const { px, py } = sim;
  for (let i = 0; i < px.length; i++) {
    const dx = px[i] - x;
    const dy = py[i] - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < radius) cand.push([d, i]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  return cand.slice(0, count);
}

/** Allume quelques points (image fixe : aucune impulsion, aucun mouvement). */
export function seedStillEnergy(sim) {
  for (let i = 0; i < sim.en.length; i++) if (i % 23 === 0) sim.en[i] = 0.8;
}
