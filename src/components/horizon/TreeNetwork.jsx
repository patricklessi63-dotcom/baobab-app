import React, { useEffect, useRef } from "react";
import {
  TAU,
  ZONE_COLORS,
  MAX_PULSES,
  DEFAULT_SEED,
  buildTreeModel,
  createSim,
  stepSim,
  addWave,
  nearestToPoint,
  seedStillEnergy,
  pickDensity,
  zoneFactor,
  zoneIndex,
} from "./treeModel";
import { TREE_ARIA_LABEL } from "./treeLabel";


function rgba(c, a) {
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
}

const nfr = (n) => {
  try {
    return n.toLocaleString("fr-CA");
  } catch {
    return String(n);
  }
};

/**
 * Baobab dessiné par un réseau de points lumineux (canvas 2D, sans dépendance).
 * Props :
 *  - zone         : 0|1|2 ou "racines"|"tronc"|"branches" — zone mise en valeur (null : aucune)
 *  - reduceMotion : true -> image fixe (aucune boucle d'animation) ; prefers-reduced-motion est aussi respecté
 *  - lite         : force la densité réduite (ex. app native) ; sinon choisie selon l'écran/l'appareil
 *  - showStats    : affiche les compteurs de la scène (nœuds, liens, impulsions)
 *  - seed         : graine du réseau (déterministe)
 * Pause automatique hors écran et onglet caché. Le parent doit donner une
 * hauteur définie (le composant remplit 100 % de son parent).
 */
export default function TreeNetwork({
  zone = null,
  reduceMotion = false,
  lite = false,
  showStats = false,
  seed = DEFAULT_SEED,
  ariaLabel = TREE_ARIA_LABEL,
  className,
  style,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const statRef = useRef(null);
  const apiRef = useRef(null);
  // Valeurs courantes lues par la boucle sans la relancer à chaque rendu.
  const live = useRef({ zone: -1, reduceMotion: false, showStats: false });
  live.current.zone = zoneIndex(zone);
  live.current.reduceMotion = !!reduceMotion;
  live.current.showStats = !!showStats;

  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv || typeof cv.getContext !== "function") return undefined;
    const ctx = cv.getContext("2d");
    if (!ctx) return undefined;

    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let model = null;
    let sim = null;
    let W = 0;
    let H = 0;
    let maxPulses = MAX_PULSES;
    let raf = 0;
    let running = false;
    let visible = true;
    let disposed = false;
    let last = 0;
    let statT = 0;
    let buildTimer = 0;
    const ptr = { x: 0, y: 0, on: false };

    const reduced = () => live.current.reduceMotion || (mq ? mq.matches === true : false);

    function draw(anim) {
      if (!model) return;
      const { nodes, edges, zEdges, zNodes, stars } = model;
      const { px, py, en, pulses } = sim;
      const sel = live.current.zone;
      const t = sim.t;
      ctx.clearRect(0, 0, W, H);
      let i;
      let z;
      for (i = 0; i < stars.length; i++) {
        const s = stars[i];
        ctx.fillStyle = "rgba(243,238,228," + (0.22 + (anim ? 0.2 * Math.sin(t * 1.4 + s.ph) : 0.1)).toFixed(3) + ")";
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, "rgba(242,163,58,0)");
      g.addColorStop(0.5, "rgba(242,163,58,.55)");
      g.addColorStop(1, "rgba(242,163,58,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, model.groundY, W, 1.2);

      ctx.lineWidth = 1;
      for (z = 0; z < 3; z++) {
        ctx.strokeStyle = rgba(ZONE_COLORS[z], (z === 1 ? 0.2 : 0.26) * zoneFactor(sel, z));
        ctx.beginPath();
        const list = zEdges[z];
        for (i = 0; i < list.length; i++) {
          const e = edges[list[i]];
          ctx.moveTo(px[e[0]], py[e[0]]);
          ctx.lineTo(px[e[1]], py[e[1]]);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.4;
      for (i = 0; i < edges.length; i++) {
        const e2 = edges[i];
        const m = Math.max(en[e2[0]], en[e2[1]]);
        if (m > 0.07) {
          ctx.strokeStyle = rgba(ZONE_COLORS[nodes[e2[1]].z], m * 0.85);
          ctx.beginPath();
          ctx.moveTo(px[e2[0]], py[e2[0]]);
          ctx.lineTo(px[e2[1]], py[e2[1]]);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      for (z = 0; z < 3; z++) {
        ctx.fillStyle = rgba(ZONE_COLORS[z], 0.78 * Math.min(1, zoneFactor(sel, z)));
        ctx.beginPath();
        const list = zNodes[z];
        for (i = 0; i < list.length; i++) {
          const ni = list[i];
          const r = nodes[ni].r;
          ctx.moveTo(px[ni] + r, py[ni]);
          ctx.arc(px[ni], py[ni], r, 0, TAU);
        }
        ctx.fill();
      }
      ctx.globalCompositeOperation = "lighter";
      for (i = 0; i < nodes.length; i++) {
        if (en[i] > 0.05) {
          ctx.fillStyle = rgba(ZONE_COLORS[nodes[i].z], en[i] * 0.55);
          ctx.beginPath();
          ctx.arc(px[i], py[i], nodes[i].r + 7 * en[i], 0, TAU);
          ctx.fill();
        }
      }
      for (i = 0; i < pulses.length; i++) {
        const p = pulses[i];
        const x = px[p.a] + (px[p.b] - px[p.a]) * p.u;
        const y = py[p.a] + (py[p.b] - py[p.a]) * p.u;
        ctx.fillStyle = "rgba(180,255,226,.95)";
        ctx.beginPath();
        ctx.arc(x, y, 2.1, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "rgba(98,240,186,.28)";
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, TAU);
        ctx.fill();
      }
      if (ptr.on) {
        const near = nearestToPoint(sim, ptr.x, ptr.y, 130, 6);
        for (i = 0; i < near.length; i++) {
          const q = near[i];
          const a = 1 - q[0] / 130;
          en[q[1]] = Math.max(en[q[1]], a * 0.9);
          ctx.strokeStyle = "rgba(98,240,186," + (a * 0.7).toFixed(3) + ")";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ptr.x, ptr.y);
          ctx.lineTo(px[q[1]], py[q[1]]);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(98,240,186,.9)";
        ctx.beginPath();
        ctx.arc(ptr.x, ptr.y, 3, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    function writeStats() {
      const el = statRef.current;
      if (!el || !model) return;
      el.textContent = nfr(model.nodes.length) + " nœuds · " + nfr(model.edges.length) + " liens · " + sim.pulses.length + " impulsions";
    }

    // Image fixe : quelques points allumés, aucune impulsion, aucun mouvement.
    function drawStill() {
      if (!model) return;
      seedStillEnergy(sim);
      stepSim(model, sim, 0, false);
      draw(false);
      writeStats();
    }

    function frame(ts) {
      raf = 0;
      if (!running) return;
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000) || 0.016);
      last = ts;
      stepSim(model, sim, dt, true, Math.random, { maxPulses });
      draw(true);
      statT -= dt;
      if (statT <= 0) {
        statT = 0.3;
        if (live.current.showStats) writeStats();
      }
      raf = window.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function start() {
      if (running || disposed || !model || reduced() || !visible || document.hidden) return;
      running = true;
      last = typeof performance !== "undefined" ? performance.now() : 0;
      raf = window.requestAnimationFrame(frame);
    }

    // Décide entre boucle d'animation et image fixe.
    function refresh() {
      if (disposed) return;
      stop();
      if (!model) return;
      start();
      if (!running) drawStill();
    }

    function build() {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return false;
      const density = pickDensity({
        width: w,
        hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency : undefined,
        deviceMemory: typeof navigator !== "undefined" ? navigator.deviceMemory : undefined,
        lite,
      });
      // DPR plafonné à 2 (1,5 en densité réduite) : le coût de remplissage
      // grimpe avec le carré du ratio sur les téléphones très denses.
      const dpr = Math.min(window.devicePixelRatio || 1, density < 1 ? 1.5 : 2);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = w;
      H = h;
      model = buildTreeModel({ width: w, height: h, density, seed });
      sim = createSim(model);
      maxPulses = Math.max(8, Math.round(MAX_PULSES * density));
      return true;
    }

    function onResize() {
      window.clearTimeout(buildTimer);
      buildTimer = window.setTimeout(() => {
        if (disposed) return;
        // ResizeObserver notifie aussi à l'observation initiale : sans changement
        // de taille réel, on ne reconstruit pas (et on ne remet pas la scène à zéro).
        if (model && wrap.clientWidth === W && wrap.clientHeight === H) return;
        stop();
        build();
        refresh();
      }, 120);
    }

    function localPoint(e) {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function redrawIfStill() {
      if (running || !model) return;
      stepSim(model, sim, 0, false);
      draw(false);
    }
    function onPointerMove(e) {
      const p = localPoint(e);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      ptr.x = p.x;
      ptr.y = p.y;
      ptr.on = true;
      if (!running && model) {
        for (let i = 0; i < sim.en.length; i++) sim.en[i] *= 0.6;
        redrawIfStill();
      }
    }
    function onPointerLeave() {
      ptr.on = false;
      redrawIfStill();
    }
    function onPointerUp(e) {
      // Au doigt, la lueur ne doit pas rester collée après le relevé.
      if (e && e.pointerType && e.pointerType !== "mouse") onPointerLeave();
    }
    function onPointerDown(e) {
      if (!model) return;
      const p = localPoint(e);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
      addWave(sim, p.x, p.y);
      if (!running) {
        for (let i = 0; i < sim.en.length; i++) sim.en[i] = Math.max(sim.en[i], 0.5);
        redrawIfStill();
      }
    }
    function onVisibility() {
      if (document.hidden) stop();
      else refresh();
    }
    function onReduceChange() {
      refresh();
    }

    apiRef.current = { refresh, redraw: redrawIfStill };

    cv.addEventListener("pointermove", onPointerMove);
    cv.addEventListener("pointerleave", onPointerLeave);
    cv.addEventListener("pointercancel", onPointerLeave);
    cv.addEventListener("pointerup", onPointerUp);
    cv.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("visibilitychange", onVisibility);

    let mqCleanup = null;
    if (mq) {
      if (typeof mq.addEventListener === "function") {
        mq.addEventListener("change", onReduceChange);
        mqCleanup = () => mq.removeEventListener("change", onReduceChange);
      } else if (typeof mq.addListener === "function") {
        mq.addListener(onReduceChange);
        mqCleanup = () => mq.removeListener(onReduceChange);
      }
    }

    let ro = null;
    let io = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onResize);
      ro.observe(wrap);
    } else {
      window.addEventListener("resize", onResize);
    }
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;
          visible = entry.isIntersecting;
          if (visible) refresh();
          else stop();
        },
        { threshold: 0 }
      );
      io.observe(wrap);
    }

    build();
    refresh();

    return () => {
      disposed = true;
      stop();
      window.clearTimeout(buildTimer);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", onResize);
      if (io) io.disconnect();
      if (mqCleanup) mqCleanup();
      document.removeEventListener("visibilitychange", onVisibility);
      cv.removeEventListener("pointermove", onPointerMove);
      cv.removeEventListener("pointerleave", onPointerLeave);
      cv.removeEventListener("pointercancel", onPointerLeave);
      cv.removeEventListener("pointerup", onPointerUp);
      cv.removeEventListener("pointerdown", onPointerDown);
      apiRef.current = null;
    };
  }, [seed, lite]);

  // Zone mise en valeur (la boucle en cours la relit seule ; en image fixe on redessine)
  // et préférence de mouvement (bascule entre boucle d'animation et image fixe).
  // Le premier passage est ignoré : l'effet de montage vient déjà de dessiner.
  const prev = useRef(null);
  useEffect(() => {
    const api = apiRef.current;
    const z = zoneIndex(zone);
    const reduce = !!reduceMotion;
    const before = prev.current;
    prev.current = { z, reduce };
    if (!api || !before) return;
    if (before.reduce !== reduce) api.refresh();
    else if (before.z !== z) api.redraw();
  }, [zone, reduceMotion]);

  return (
    <div ref={wrapRef} className={className} style={{ position: "relative", width: "100%", height: "100%", ...style }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={ariaLabel}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", touchAction: "pan-y", cursor: "crosshair" }}
      />
      {showStats && (
        <p
          ref={statRef}
          aria-hidden="true"
          style={{ position: "absolute", right: 16, bottom: 12, margin: 0, pointerEvents: "none", fontFamily: "var(--hz-font-mono, ui-monospace, monospace)", fontSize: 11, letterSpacing: ".06em", color: "rgba(243,238,228,.7)" }}
        />
      )}
    </div>
  );
}
