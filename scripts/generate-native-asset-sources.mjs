// Génère les images SOURCES de @capacitor/assets dans assets/ à partir du logo
// existant public/icon-512.png (le seul logo disponible dans le dépôt : 512 px,
// pas de vectoriel). AUCUN nouveau logo n'est dessiné : l'arbre est extrait du
// logo actuel (détourage du fond vert de marque #14432A) puis recomposé sur des
// fonds unis de la charte.
//
//   assets/icon-background.png  1024² fond vert de marque uni (icône adaptative Android)
//   assets/icon-foreground.png  1024² arbre seul, fond transparent, agrandi x1,8 (tient dans le
//                                     cercle du masque adaptatif : @capacitor/assets réduit déjà la couche de 16,7 % par côté)
//   assets/icon-only.png        1024² vert de marque pleine page + arbre (iOS / Android hérité)
//   assets/splash.png           2732² vert de marque + arbre centré
//   assets/splash-dark.png      2732² fond du thème sombre (#14120D) + arbre centré
//
// Usage : node scripts/generate-native-asset-sources.mjs && npx capacitor-assets generate --android
// (« sharp » est installé avec @capacitor/assets.) Si le propriétaire fournit un
// logo vectoriel / 1024² : remplacer SOURCE par ce fichier (ou déposer
// directement les 5 PNG dans assets/) — le script n'est plus nécessaire alors.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = root + "public/icon-512.png";
const OUT = root + "assets/";

// Jetons de la charte (voir index.html : --bb-indigo, thème sombre --bb-bg).
const BRAND_GREEN = { r: 0x14, g: 0x43, b: 0x2a };
const DARK_BG = { r: 0x14, g: 0x12, b: 0x0d };

mkdirSync(OUT, { recursive: true });

// 1. Détourage : alpha = distance au vert de marque (0 sur le fond, 1 sur l'arbre),
//    couleur « dé-mélangée » du vert pour que les bords lissés ne gardent pas de liseré vert.
const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const keyed = Buffer.alloc(W * H * 4);
const FULL = 100; // distance au-delà de laquelle le pixel est considéré 100 % arbre
for (let i = 0; i < W * H; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a0 = data[i * 4 + 3];
  const d = Math.hypot(r - BRAND_GREEN.r, g - BRAND_GREEN.g, b - BRAND_GREEN.b);
  const alpha = a0 === 0 ? 0 : Math.min(1, d / FULL) * (a0 / 255);
  const unmix = (c, bg) => (alpha > 0 ? Math.max(0, Math.min(255, (c - (1 - alpha) * bg) / alpha)) : 0);
  keyed[i * 4] = unmix(r, BRAND_GREEN.r);
  keyed[i * 4 + 1] = unmix(g, BRAND_GREEN.g);
  keyed[i * 4 + 2] = unmix(b, BRAND_GREEN.b);
  keyed[i * 4 + 3] = Math.round(alpha * 255);
}
// Les coins du logo d'origine (carré arrondi) sont transparents : sans importance (alpha 0).
const treeFull = sharp(keyed, { raw: { width: W, height: H, channels: 4 } });

// Boîte englobante de l'arbre (pour le centrer visuellement, pas seulement dans le carré du logo).
let minX = W, maxX = 0, minY = H, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (keyed[(y * W + x) * 4 + 3] > 40) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
const tree = await treeFull.extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }).png().toBuffer();
const treeW = maxX - minX + 1, treeH = maxY - minY + 1;

async function compose({ size, scale, bg, file }) {
  const w = Math.round(treeW * scale), h = Math.round(treeH * scale);
  const scaled = scale === 1 ? tree : await sharp(tree).resize(w, h, { kernel: "lanczos3" }).png().toBuffer();
  const canvas = sharp({ create: { width: size, height: size, channels: 4, background: bg ? { ...bg, alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 } } });
  await canvas.composite([{ input: scaled, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }]).png({ compressionLevel: 9 }).toFile(OUT + file);
  console.log(`${file}: ${size}x${size}, arbre ${w}x${h}`);
}

await compose({ size: 1024, scale: 1.8, bg: null, file: "icon-foreground.png" });
await compose({ size: 1024, scale: 1.5, bg: BRAND_GREEN, file: "icon-only.png" });
await compose({ size: 2732, scale: 1.4, bg: BRAND_GREEN, file: "splash.png" });
await compose({ size: 2732, scale: 1.4, bg: DARK_BG, file: "splash-dark.png" });
await sharp({ create: { width: 1024, height: 1024, channels: 3, background: BRAND_GREEN } }).png({ compressionLevel: 9 }).toFile(OUT + "icon-background.png");
console.log("icon-background.png: 1024x1024 uni");
