// Appareil « modeste » : même critère que pickDensity (src/components/horizon/treeModel.js) —
// 4 cœurs ou moins, ou 2 Go de mémoire ou moins. Sur ces appareils, les effets de fond
// (halos qui respirent, balayage, flou de verre qui se recalcule sous un fond animé) coûtent
// de la batterie et des images par seconde pour un gain visuel faible.
export function isLiteDevice(nav = typeof navigator !== "undefined" ? navigator : undefined) {
  if (!nav) return false;
  const cores = nav.hardwareConcurrency;
  const mem = nav.deviceMemory;
  if (typeof cores === "number" && cores > 0 && cores <= 4) return true;
  if (typeof mem === "number" && mem > 0 && mem <= 2) return true;
  return false;
}

// Pose data-perf="lite" sur <html> (voir index.html : fond figé, verre sans flou).
// Fait en module et non dans un script inline : les scripts inline d'index.html sont
// épinglés par empreinte dans la CSP (vercel.json), les modifier imposerait de la recalculer.
export function applyPerformanceHint(doc = typeof document !== "undefined" ? document : undefined, nav) {
  try {
    if (!doc) return false;
    const lite = isLiteDevice(nav);
    if (lite) doc.documentElement.setAttribute("data-perf", "lite");
    else doc.documentElement.removeAttribute("data-perf");
    return lite;
  } catch {
    return false;
  }
}
