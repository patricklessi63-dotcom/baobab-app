// Génère le logo vectoriel Baobab Horizon et TOUTES les icônes / écrans de lancement
// à partir d'une source unique : src/components/baobabMark.js (géométrie) +
// baobabMarkSvg.js (sérialisation) + baobabWordmark.js (mot « BAOBAB » en tracés).
// Déterministe : relancer le script ne change aucun octet des SVG.
//
//   node scripts/generate-logo-assets.mjs            (npm run assets:logo)  tout régénérer
//   node scripts/generate-logo-assets.mjs --android-extras   uniquement les ressources
//        Android que @capacitor/assets ne produit pas (icône de notification, couche
//        monochrome Android 13) + alignement des couleurs : enchaîné par `npm run assets:android`.
//
// Sorties :
//   assets/logo/               baobab-mark.svg, baobab-mark-light.svg, baobab-mark-mono.svg, baobab-wordmark.svg(+ -light)
//   public/                    favicon.svg, icon-64/192/512.png, icon-512-maskable.png, apple-touch-icon.png (opaque), og-baobab.png
//   assets/                    icon-only / icon-foreground / icon-background (1024), splash / splash-dark (2732)  -> sources @capacitor/assets
//   assets/store/              icon-1024.png (iOS, sans alpha), icon-512.png (Google Play)
//   android/.../res            ic_stat_baobab (5 densités), ic_launcher_monochrome (5 densités), bb_colors.xml, ic_launcher_background.xml
//   capacitor.config.json      SplashScreen.backgroundColor
//
// Moteur : « sharp » (libvips + librsvg), déjà utilisé par @capacitor/assets.

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const R = (...p) => path.join(root, ...p);
const { HORIZON, MARK, markRadius } = await import(pathToFileURL(R("src/components/baobabMark.js")).href);
const { markSvg, placedMarkGroup } = await import(pathToFileURL(R("src/components/baobabMarkSvg.js")).href);
const { wordmarkSvg, wordmarkLetters, WORDMARK_HEIGHT } = await import(pathToFileURL(R("src/components/baobabWordmark.js")).href);

const androidOnly = process.argv.includes("--android-extras");
const sharp = require("sharp");

const MARK_H = MARK.bounds.maxY - MARK.bounds.minY; // hauteur de la marque (grille 512)
const MARK_W = MARK.bounds.maxX - MARK.bounds.minX;
const RADIUS = markRadius();

const write = (rel, data) => {
  mkdirSync(path.dirname(R(rel)), { recursive: true });
  writeFileSync(R(rel), data);
};
async function png(rel, svg, { opaque = false, size } = {}) {
  let img = sharp(Buffer.from(svg), { density: 72 });
  if (size) img = img.resize(size, size);
  if (opaque) img = img.flatten({ background: HORIZON.nuit }).removeAlpha();
  const buf = await img.png({ compressionLevel: 9 }).toBuffer();
  write(rel, buf);
  const m = await sharp(buf).metadata();
  console.log(`${rel}: ${m.width}x${m.height}, ${m.channels} canaux${m.hasAlpha ? " (alpha)" : ""}`);
  return buf;
}

// Fonds : nuit avec lueur de canopée (icônes) ; nuit avec lueur braise à l'horizon (écrans).
const defs = {
  icon: `<radialGradient id="bgi" cx="0.5" cy="0.4" r="0.75"><stop offset="0" stop-color="${HORIZON.canopee}"/><stop offset="1" stop-color="${HORIZON.nuit}"/></radialGradient>`,
  glow: (cy) => `<radialGradient id="glw" cx="0.5" cy="${cy}" r="0.5"><stop offset="0" stop-color="${HORIZON.braise}" stop-opacity="0.34"/><stop offset="0.55" stop-color="${HORIZON.braise}" stop-opacity="0.08"/><stop offset="1" stop-color="${HORIZON.braise}" stop-opacity="0"/></radialGradient>`,
};
const svgDoc = (w, h, inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${inner}</svg>`;

/** Icône carrée : fond nuit/canopée plein cadre (ou transparent) + marque dont la hauteur vaut `fill` * size. */
function iconSvg({ size, fill, radius = 0, background = true, dy = 0 }) {
  const scale = (fill * size) / MARK_H;
  const bg = background
    ? `<defs>${defs.icon}</defs><rect width="${size}" height="${size}" rx="${radius}" fill="url(#bgi)"/>`
    : "";
  return svgDoc(size, size, bg + placedMarkGroup({ scale, cx: size / 2, cy: size / 2 + dy }));
}
/** Même chose mais la marque tient dans un cercle de rayon `circle` * size (zone sûre ronde). */
function iconSvgCircle({ size, circle, background = true }) {
  const scale = (circle * size) / RADIUS;
  const bg = background ? `<defs>${defs.icon}</defs><rect width="${size}" height="${size}" fill="url(#bgi)"/>` : "";
  return svgDoc(size, size, bg + placedMarkGroup({ scale, cx: size / 2, cy: size / 2 }));
}

/** Écran de lancement carré (2732) : horizon + lueur ; `dark` nuit, sinon ivoire uni. */
function splashSvg({ dark }) {
  const size = 2732;
  const scale = (0.28 * size) / MARK_W; // marque ~ 28 % de la largeur
  const mark = placedMarkGroup({ scale, cx: size / 2, cy: size / 2, palette: dark ? "dark" : "light" });
  if (!dark) return svgDoc(size, size, `<rect width="${size}" height="${size}" fill="${HORIZON.ivoire}"/>${mark}`);
  const gy = size / 2 + (MARK.ground.y - MARK_SIZE_CENTER) * scale; // ligne d'horizon = sol de la marque
  return svgDoc(
    size,
    size,
    `<defs>${defs.glow(0.5)}</defs><rect width="${size}" height="${size}" fill="${HORIZON.nuit}"/>` +
      `<ellipse cx="${size / 2}" cy="${gy}" rx="${size * 0.5}" ry="${size * 0.32}" fill="url(#glw)"/>` +
      `<rect x="0" y="${gy - 1.5}" width="${size}" height="3" fill="${HORIZON.braise}" fill-opacity="0.35"/>` +
      mark
  );
}
const MARK_SIZE_CENTER = 256;

/** Image de partage 1200x630 : lueur d'horizon, marque, mot « BAOBAB » en tracés, accroche. */
function ogSvg() {
  const W = 1200;
  const H = 630;
  const scale = 0.84 * (H - 90) / MARK_H; // marque haute de ~455 px
  const mx = 250;
  const my = H / 2 - 6;
  const gy = my + (MARK.ground.y - MARK_SIZE_CENTER) * scale;
  const letterScale = 0.82;
  const tx = 470;
  const ty = 188;
  return svgDoc(
    W,
    H,
    `<defs>${defs.glow(0.5)}</defs><rect width="${W}" height="${H}" fill="${HORIZON.nuit}"/>` +
      `<ellipse cx="${mx}" cy="${gy}" rx="${W * 0.6}" ry="${H * 0.42}" fill="url(#glw)"/>` +
      `<rect x="0" y="${gy - 1.5}" width="${W}" height="3" fill="${HORIZON.braise}" fill-opacity="0.35"/>` +
      placedMarkGroup({ scale, cx: mx, cy: my }) +
      `<g transform="translate(${tx} ${ty}) scale(${letterScale})">${wordmarkLetters(HORIZON.ivoire)}</g>` +
      `<text x="${tx}" y="${ty + WORDMARK_HEIGHT * letterScale + 74}" fill="${HORIZON.menthe}" font-family="Manrope, 'Segoe UI', Arial, Helvetica, sans-serif" font-size="30" font-weight="700" letter-spacing="0.5">Tes racines. Ta communauté.</text>` +
      `<text x="${tx}" y="${ty + WORDMARK_HEIGHT * letterScale + 118}" fill="${HORIZON.ivoire}" font-family="Manrope, 'Segoe UI', Arial, Helvetica, sans-serif" font-size="30" font-weight="700" letter-spacing="0.5">Ton prochain lien.</text>`
  );
}

// ---------------------------------------------------------------------------
// Android : couleurs, icône de notification, couche monochrome
// ---------------------------------------------------------------------------
async function androidExtras() {
  const res = R("android/app/src/main/res");
  // Icône de notification : silhouette blanche sur transparent (seul l'alpha compte), 24 dp, 2 dp de marge.
  const stat = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
  for (const [d, px] of Object.entries(stat)) {
    const scale = (px * (20 / 24)) / MARK_H; // hauteur utile = 20 dp sur 24 dp (marge de 2 dp)
    const svg = svgDoc(px, px, placedMarkGroup({ scale, cx: px / 2, cy: px / 2, variant: "mono", color: "#FFFFFF" }));
    const buf = await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toBuffer();
    write(`android/app/src/main/res/drawable-${d}/ic_stat_baobab.png`, buf);
  }
  console.log("ic_stat_baobab: 5 densités (blanc + alpha, issu de baobab-mark-mono.svg)");
  // Couche monochrome (icônes thématiques Android 13) : couche adaptative 108 dp, marque dans le cercle sûr de 66 dp.
  const mono = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
  for (const [d, px] of Object.entries(mono)) {
    const scale = (0.29 * px) / (RADIUS * 1.15); // le tracé monochrome est plus gras : marge de 15 %
    const svg = svgDoc(px, px, placedMarkGroup({ scale, cx: px / 2, cy: px / 2, variant: "mono", color: "#FFFFFF" }));
    write(`android/app/src/main/res/mipmap-${d}/ic_launcher_monochrome.png`, await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toBuffer());
  }
  console.log("ic_launcher_monochrome: 5 densités");
  // Couche adaptative nette : @capacitor/assets produit l'avant-plan en 48-192 px alors que ic_launcher.xml
  // l'affiche dans 72 dp (retrait de 16,7 %) : on le régénère à la taille exacte (72 dp x densité).
  const fgPx = { mdpi: 72, hdpi: 108, xhdpi: 144, xxhdpi: 216, xxxhdpi: 288 };
  for (const [d, px] of Object.entries(fgPx)) {
    write(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, await sharp(Buffer.from(iconSvgCircle({ size: px, circle: 0.44, background: false })), { density: 72 }).png({ compressionLevel: 9 }).toBuffer());
  }
  console.log("ic_launcher_foreground: 5 densités à la taille exacte (72 dp)");
  // Déclaration de la couche monochrome dans les icônes adaptatives (capacitor-assets réécrit ces fichiers).
  for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const p = R("android/app/src/main/res/mipmap-anydpi-v26", f);
    let x = readFileSync(p, "utf8");
    if (!x.includes("<monochrome")) {
      x = x.replace("</adaptive-icon>", '    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />\n</adaptive-icon>');
      writeFileSync(p, x);
    }
  }
  // Couleurs.
  write(
    "android/app/src/main/res/values/ic_launcher_background.xml",
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${HORIZON.nuit}</color>\n</resources>\n`
  );
  const colors = (night) =>
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n` +
    (night
      ? `    <!-- Thème sombre Horizon (index.html : bb-bg ${HORIZON.nuit}). Le splash est nuit, comme l'image drawable-night/splash.png (assets/logo : baobab-mark). -->\n    <color name="bb_splash_background">${HORIZON.nuit}</color>\n    <color name="bb_window_background">${HORIZON.nuit}</color>\n`
      : `    <!-- Jetons de marque Baobab Horizon (index.html : bb-bg ivoire ${HORIZON.ivoire} en thème clair, nuit ${HORIZON.nuit} en sombre). -->\n    <!-- Fond du splash Android 12+ : ivoire en clair (comme assets/splash.png et la couleur de l'icône adaptative sur nuit). -->\n    <color name="bb_splash_background">${HORIZON.ivoire}</color>\n    <color name="bb_window_background">${HORIZON.ivoire}</color>\n    <!-- Couleur d'accent des notifications push (vert Horizon leaf-deep, index.html : bb-leaf-deep). -->\n    <color name="bb_notification_color">#185C43</color>\n`) +
    `</resources>\n`;
  write("android/app/src/main/res/values/bb_colors.xml", colors(false));
  write("android/app/src/main/res/values-night/bb_colors.xml", colors(true));
  // Capacitor : fond du plugin SplashScreen (ivoire ; le sombre vient des images -night).
  const cfgPath = R("capacitor.config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.plugins.SplashScreen.backgroundColor = HORIZON.ivoire;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
  console.log("bb_colors.xml (clair/sombre), ic_launcher_background.xml, capacitor.config.json : alignés");
}

if (androidOnly) {
  await androidExtras();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 1. Logo vectoriel
// ---------------------------------------------------------------------------
write("assets/logo/baobab-mark.svg", markSvg({ palette: "dark" }));
write("assets/logo/baobab-mark-light.svg", markSvg({ palette: "light" }));
write("assets/logo/baobab-mark-mono.svg", markSvg({ variant: "mono", title: "Baobab (monochrome)" }));
write("assets/logo/baobab-wordmark.svg", wordmarkSvg({ scheme: "dark" }));
write("assets/logo/baobab-wordmark-light.svg", wordmarkSvg({ scheme: "light" }));
console.log("assets/logo/*.svg écrits");

// ---------------------------------------------------------------------------
// 2. Web
// ---------------------------------------------------------------------------
// Favicon vectoriel : carré arrondi nuit + marque (aussi lisible à 16 px que possible).
write(
  "public/favicon.svg",
  iconSvg({ size: 64, fill: 0.92, radius: 14 }).replace("<svg ", '<svg role="img" aria-label="Baobab" ')
);
await png("public/icon-64.png", iconSvg({ size: 64, fill: 0.9, radius: 14 }));
await png("public/icon-192.png", iconSvg({ size: 192, fill: 0.84, radius: 40 }));
await png("public/icon-512.png", iconSvg({ size: 512, fill: 0.84, radius: 108 }));
await png("public/icon-512-maskable.png", iconSvgCircle({ size: 512, circle: 0.385 }), { opaque: true });
await png("public/apple-touch-icon.png", iconSvg({ size: 180, fill: 0.78 }), { opaque: true });
await png("public/og-baobab.png", ogSvg(), { opaque: true });

// ---------------------------------------------------------------------------
// 3. Sources natives (@capacitor/assets)
// ---------------------------------------------------------------------------
await png("assets/icon-only.png", iconSvg({ size: 1024, fill: 0.7 }), { opaque: true });
// Couche adaptative : la marque tient dans le cercle sûr (66 dp / 108 dp), compte tenu du retrait de 16,7 %
// déjà appliqué par ic_launcher.xml : cercle de rayon 44 % de l'image (limite : 45,8 %).
await png("assets/icon-foreground.png", iconSvgCircle({ size: 1024, circle: 0.44, background: false }));
await png(
  "assets/icon-background.png",
  svgDoc(1024, 1024, `<defs>${defs.icon}</defs><rect width="1024" height="1024" fill="url(#bgi)"/>`),
  { opaque: true }
);
await png("assets/splash.png", splashSvg({ dark: false }), { opaque: true });
await png("assets/splash-dark.png", splashSvg({ dark: true }), { opaque: true });
await png("assets/store/icon-1024.png", iconSvg({ size: 1024, fill: 0.7 }), { opaque: true });
await png("assets/store/icon-512.png", iconSvg({ size: 512, fill: 0.7 }), { opaque: true });

await androidExtras();
