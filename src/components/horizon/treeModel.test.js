import { describe, it, expect } from "vitest";
import {
  createRng,
  buildTreeModel,
  reachableCount,
  createSim,
  stepSim,
  addWave,
  nearestToPoint,
  pickDensity,
  pickNextHop,
  zoneFactor,
  zoneIndex,
  seedStillEnergy,
  ZONE,
  MAX_PULSES,
  MAX_WAVES,
  LITE_DENSITY,
} from "./treeModel";

const SIZES = [
  [343, 340],
  [375, 375],
  [768, 520],
  [1280, 600],
];

describe("createRng", () => {
  it("rejoue la même suite avec la même graine, une autre suite avec une autre graine", () => {
    const a = createRng(11);
    const b = createRng(11);
    const c = createRng(12);
    const sa = Array.from({ length: 20 }, () => a());
    const sb = Array.from({ length: 20 }, () => b());
    const sc = Array.from({ length: 20 }, () => c());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of sa) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("buildTreeModel", () => {
  it("est déterministe pour une même graine et change avec la graine", () => {
    const a = buildTreeModel({ width: 800, height: 520, seed: 11 });
    const b = buildTreeModel({ width: 800, height: 520, seed: 11 });
    const c = buildTreeModel({ width: 800, height: 520, seed: 99 });
    expect(b.nodes).toEqual(a.nodes);
    expect(b.edges).toEqual(a.edges);
    expect(b.stars).toEqual(a.stars);
    expect(c.nodes).not.toEqual(a.nodes);
  });

  it.each(SIZES)("%i x %i : nombre de nœuds et de liens non nul et borné", (w, h) => {
    const m = buildTreeModel({ width: w, height: h });
    expect(m.nodes.length).toBeGreaterThan(100);
    expect(m.nodes.length).toBeLessThan(2500);
    expect(m.edges.length).toBeGreaterThan(m.nodes.length - 1);
    expect(m.edges.length).toBeLessThan(m.nodes.length * 3);
  });

  it.each(SIZES)("%i x %i : arêtes valides, sans boucle, nœuds dans la zone de dessin", (w, h) => {
    const m = buildTreeModel({ width: w, height: h });
    const N = m.nodes.length;
    for (const [a, b] of m.edges) {
      expect(Number.isInteger(a) && a >= 0 && a < N).toBe(true);
      expect(Number.isInteger(b) && b >= 0 && b < N).toBe(true);
      expect(a).not.toBe(b);
    }
    for (const n of m.nodes) {
      expect([0, 1, 2]).toContain(n.z);
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThan(-w * 0.1);
      expect(n.x).toBeLessThan(w * 1.1);
      expect(n.y).toBeGreaterThan(-h * 0.25);
      expect(n.y).toBeLessThan(h * 1.1);
    }
  });

  it.each(SIZES)("%i x %i : réseau connexe, trois zones non vides reliées au tronc", (w, h) => {
    for (const density of [1, LITE_DENSITY]) {
      const m = buildTreeModel({ width: w, height: h, density });
      expect(reachableCount(m, 0)).toBe(m.nodes.length);
      for (const z of [ZONE.ROOTS, ZONE.TRUNK, ZONE.BRANCHES]) {
        expect(m.zNodes[z].length).toBeGreaterThan(0);
        expect(m.zEdges[z].length).toBeGreaterThan(0);
      }
      // Chaque racine et chaque branche rejoint le tronc : on retire le tronc
      // et on vérifie qu'il y a bien des liens racines->tronc et branches->tronc.
      const trunk = new Set(m.zNodes[ZONE.TRUNK]);
      const touches = (zone) => m.zNodes[zone].some((i) => m.adj[i].some((j) => trunk.has(j)));
      expect(touches(ZONE.ROOTS)).toBe(true);
      expect(touches(ZONE.BRANCHES)).toBe(true);
      // Les racines sont sous le sol, la canopée au-dessus du tronc.
      const meanY = (zone) => m.zNodes[zone].reduce((s, i) => s + m.nodes[i].y, 0) / m.zNodes[zone].length;
      expect(meanY(ZONE.ROOTS)).toBeGreaterThan(m.groundY);
      expect(meanY(ZONE.BRANCHES)).toBeLessThan(meanY(ZONE.TRUNK));
    }
  });

  it("la densité réduite allège nettement le réseau", () => {
    const full = buildTreeModel({ width: 343, height: 340, density: 1 });
    const lite = buildTreeModel({ width: 343, height: 340, density: LITE_DENSITY });
    expect(lite.nodes.length).toBeLessThan(full.nodes.length * 0.7);
    expect(lite.edges.length).toBeLessThan(full.edges.length * 0.7);
    expect(lite.stars.length).toBeLessThan(full.stars.length);
  });

  it("reste utilisable avec des dimensions absurdes (pas de plantage, pas d'explosion)", () => {
    for (const [w, h, d] of [[0, 0, 1], [1, 1, 1], [5000, 600, 1], [300, 300, 0], [300, 300, -3]]) {
      const m = buildTreeModel({ width: w, height: h, density: d });
      expect(m.nodes.length).toBeGreaterThan(0);
      expect(m.nodes.length).toBeLessThan(20000);
    }
  });
});

describe("pickDensity", () => {
  it("densité complète sur grand écran puissant, réduite sinon", () => {
    expect(pickDensity({ width: 1280, hardwareConcurrency: 8 })).toBe(1);
    expect(pickDensity({ width: 1280 })).toBe(1);
    expect(pickDensity({ width: 375, hardwareConcurrency: 8 })).toBe(LITE_DENSITY);
    expect(pickDensity({ width: 1280, hardwareConcurrency: 4 })).toBe(LITE_DENSITY);
    expect(pickDensity({ width: 1280, hardwareConcurrency: 8, deviceMemory: 2 })).toBe(LITE_DENSITY);
    expect(pickDensity({ width: 1280, hardwareConcurrency: 8, lite: true })).toBe(LITE_DENSITY);
  });
});

describe("zones", () => {
  it("zoneIndex accepte indices et noms, -1 sinon", () => {
    expect(zoneIndex(0)).toBe(0);
    expect(zoneIndex("tronc")).toBe(1);
    expect(zoneIndex("Branches")).toBe(2);
    expect(zoneIndex(null)).toBe(-1);
    expect(zoneIndex(undefined)).toBe(-1);
    expect(zoneIndex("n'importe quoi")).toBe(-1);
    expect(zoneIndex(7)).toBe(-1);
  });
  it("zoneFactor met la zone choisie en valeur et atténue les autres", () => {
    expect(zoneFactor(-1, 0)).toBe(1);
    expect(zoneFactor(1, 1)).toBeGreaterThan(1);
    expect(zoneFactor(1, 0)).toBeLessThan(1);
  });
});

// Générateur déterministe pour des simulations reproductibles.
function seededRand(seed) {
  return createRng(seed);
}

describe("simulation des impulsions", () => {
  it("une impulsion ne sort jamais du graphe : toujours sur une arête, indices valides", () => {
    const m = buildTreeModel({ width: 800, height: 520 });
    const sim = createSim(m);
    const rand = seededRand(5);
    const N = m.nodes.length;
    let sawPulse = false;
    let maxSeen = 0;
    let violations = 0;
    for (let f = 0; f < 2500; f++) {
      stepSim(m, sim, 0.016, true, rand);
      maxSeen = Math.max(maxSeen, sim.pulses.length);
      for (const p of sim.pulses) {
        sawPulse = true;
        const ok =
          Number.isInteger(p.a) && p.a >= 0 && p.a < N && Number.isInteger(p.b) && p.b >= 0 && p.b < N &&
          m.adj[p.a].includes(p.b) && p.u >= 0 && p.u < 1 && p.hops <= p.max + 1;
        if (!ok) violations++;
      }
    }
    expect(violations).toBe(0);
    expect(sawPulse).toBe(true);
    expect(maxSeen).toBeLessThanOrEqual(MAX_PULSES);
    for (let i = 0; i < N; i++) {
      expect(Number.isFinite(sim.px[i]) && Number.isFinite(sim.py[i])).toBe(true);
      expect(sim.en[i]).toBeGreaterThanOrEqual(0);
      expect(sim.en[i]).toBeLessThanOrEqual(1.0001);
    }
  });

  it("respecte le plafond d'impulsions passé en option", () => {
    const m = buildTreeModel({ width: 800, height: 520 });
    const sim = createSim(m);
    const rand = seededRand(8);
    for (let f = 0; f < 1500; f++) {
      stepSim(m, sim, 0.016, true, rand, { maxPulses: 5 });
      expect(sim.pulses.length).toBeLessThanOrEqual(5);
    }
  });

  it("une impulsion suivie seule disparaît en fin de course", () => {
    const m = buildTreeModel({ width: 800, height: 520 });
    const sim = createSim(m);
    const rand = seededRand(21);
    // On suit une impulsion unique jusqu'à sa disparition.
    sim.spawnT = 99;
    expect(pickNextHop(m, sim, m.zNodes[ZONE.ROOTS][0], -1, rand)).toBeGreaterThanOrEqual(0);
    const start = m.zNodes[ZONE.ROOTS][0];
    sim.pulses.push({ a: start, b: m.adj[start][0], u: 0, hops: 0, max: 40, v: 120 });
    let guard = 0;
    while (sim.pulses.length && guard++ < 20000) stepSim(m, sim, 0.016, true, rand);
    expect(sim.pulses.length).toBe(0);
    expect(guard).toBeLessThan(20000);
  });

  it("en image fixe (anim=false), aucune impulsion ne naît et les positions sont au repos", () => {
    const m = buildTreeModel({ width: 800, height: 520 });
    const sim = createSim(m);
    for (let f = 0; f < 200; f++) stepSim(m, sim, 0.016, false, seededRand(1));
    expect(sim.pulses.length).toBe(0);
    for (let i = 0; i < m.nodes.length; i++) {
      expect(sim.px[i]).toBeCloseTo(m.nodes[i].x, 3);
      expect(sim.py[i]).toBeCloseTo(m.nodes[i].y, 3);
    }
    seedStillEnergy(sim);
    expect(Array.from(sim.en).some((e) => e > 0.5)).toBe(true);
  });

  it("les ondes sont plafonnées, éclairent des nœuds puis disparaissent", () => {
    const m = buildTreeModel({ width: 800, height: 520 });
    const sim = createSim(m);
    for (let i = 0; i < 10; i++) addWave(sim, 400, 360);
    expect(sim.waves.length).toBe(MAX_WAVES);
    let lit = 0;
    for (let f = 0; f < 600 && sim.waves.length; f++) {
      stepSim(m, sim, 0.016, true, seededRand(2), { maxPulses: 0 });
      lit = Math.max(lit, Array.from(sim.en).filter((e) => e > 0.3).length);
    }
    expect(lit).toBeGreaterThan(5);
    expect(sim.waves.length).toBe(0);
  });

  it("nearestToPoint renvoie au plus `count` nœuds triés par distance dans le rayon", () => {
    const m = buildTreeModel({ width: 800, height: 520 });
    const sim = createSim(m);
    const near = nearestToPoint(sim, m.nodes[0].x, m.nodes[0].y, 130, 6);
    expect(near.length).toBeGreaterThan(0);
    expect(near.length).toBeLessThanOrEqual(6);
    for (let i = 1; i < near.length; i++) expect(near[i][0]).toBeGreaterThanOrEqual(near[i - 1][0]);
    for (const [d] of near) expect(d).toBeLessThan(130);
    expect(nearestToPoint(sim, -5000, -5000)).toEqual([]);
  });
});
