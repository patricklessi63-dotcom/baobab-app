// Génère la PETITE ICÔNE DE NOTIFICATION Android (barre d'état) : silhouette
// BLANCHE sur fond transparent de l'arbre du logo. Android n'utilise que le canal
// alpha de cette icône (une icône en couleur s'afficherait en carré blanc).
//
// Source : assets/icon-foreground.png (arbre seul, fond transparent, produit par
// scripts/generate-native-asset-sources.mjs à partir du logo existant — aucun
// nouveau logo n'est dessiné). Sortie : android/app/src/main/res/drawable-<densité>/ic_stat_baobab.png,
// référencée par AndroidManifest.xml (com.google.firebase.messaging.default_notification_icon).
//
// Tailles : 24 dp (mdpi 24, hdpi 36, xhdpi 48, xxhdpi 72, xxxhdpi 96 px) avec 2 dp de marge.
// Usage : node scripts/generate-push-icon.mjs   (« sharp » est installé avec @capacitor/assets.)
// Si le propriétaire fournit un logo monochrome dédié : déposer ses PNG aux mêmes
// emplacements à la place des fichiers générés.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = root + "assets/icon-foreground.png";
const RES = root + "android/app/src/main/res/";
const DENSITIES = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };

// 1. Alpha de l'arbre, rogné à sa boîte englobante.
const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const white = Buffer.alloc(info.width * info.height * 4, 255);
for (let i = 0; i < info.width * info.height; i++) white[i * 4 + 3] = data[i * 4 + 3];
// Boîte englobante sur alpha > 40 (ignore les pixels quasi transparents du détourage).
let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
  if (white[(y * info.width + x) * 4 + 3] > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
const silhouette = await sharp(white, { raw: { width: info.width, height: info.height, channels: 4 } })
  .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
  .png()
  .toBuffer();

// 2. Une icône par densité, centrée dans un carré de la taille de la densité, marge 2 dp.
for (const [density, size] of Object.entries(DENSITIES)) {
  const inner = Math.round(size * (20 / 24));
  const resized = await sharp(silhouette).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const dir = `${RES}drawable-${density}/`;
  mkdirSync(dir, { recursive: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, gravity: "center" }])
    .png()
    .toFile(`${dir}ic_stat_baobab.png`);
  console.log(`drawable-${density}/ic_stat_baobab.png (${size}x${size})`);
}
