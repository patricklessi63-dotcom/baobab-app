import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";
import capacitorConfig from "../../capacitor.config.json";
import { HORIZON, MARK, PALETTES } from "../components/baobabMark.js";
import { markSvg } from "../components/baobabMarkSvg.js";
import { wordmarkSvg } from "../components/baobabWordmark.js";

// Logo « Baobab Horizon » et icônes dérivées : ces tests échouent tant que le logo vectoriel
// n'existe pas et que les icônes / écrans de lancement (web, Android, iOS) n'en sont pas issus.
// Tout est généré par scripts/generate-logo-assets.mjs (npm run assets:logo) puis
// @capacitor/assets (npm run assets:android / assets:ios).

const root = process.cwd();
const R = (...p) => path.join(root, ...p);
const read = (rel) => fs.readFileSync(R(rel), "utf8");
const require = createRequire(import.meta.url);
const sharp = require("sharp");

/** En-tête PNG : largeur, hauteur, type de couleur (2 = RVB sans alpha, 6 = RVBA). */
function pngHeader(rel) {
  const b = fs.readFileSync(R(rel));
  expect(b.subarray(0, 8).toString("hex"), `${rel} : signature PNG`).toBe("89504e470d0a1a0a");
  expect(b.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], colorType: b[25], hasTrns: b.includes(Buffer.from("tRNS")) };
}
const hex = (s) => s.toUpperCase();

describe("logo vectoriel (assets/logo)", () => {
  const files = ["baobab-mark.svg", "baobab-mark-light.svg", "baobab-mark-mono.svg", "baobab-wordmark.svg", "baobab-wordmark-light.svg"];

  it.each(files)("%s existe et est du XML/SVG bien formé", (f) => {
    const xml = read(`assets/logo/${f}`);
    const dom = new JSDOM(xml, { contentType: "image/svg+xml" });
    const svg = dom.window.document.documentElement;
    expect(svg.tagName).toBe("svg");
    expect(svg.getAttribute("viewBox")).toMatch(/^0 0 \d+ \d+$/);
    expect(svg.querySelector("title")?.textContent).toMatch(/Baobab/);
  });

  it("les fichiers du dépôt sont exactement ceux que produit le générateur (aucune dérive)", () => {
    expect(read("assets/logo/baobab-mark.svg")).toBe(markSvg({ palette: "dark" }));
    expect(read("assets/logo/baobab-mark-light.svg")).toBe(markSvg({ palette: "light" }));
    expect(read("assets/logo/baobab-mark-mono.svg")).toBe(markSvg({ variant: "mono", title: "Baobab (monochrome)" }));
    expect(read("assets/logo/baobab-wordmark.svg")).toBe(wordmarkSvg({ scheme: "dark" }));
    expect(read("assets/logo/baobab-wordmark-light.svg")).toBe(wordmarkSvg({ scheme: "light" }));
  });

  it("n'utilise que les couleurs de la palette Horizon (liste blanche)", () => {
    const allowed = new Set(Object.values(HORIZON).map(hex));
    const svgs = [...files.map((f) => `assets/logo/${f}`), "public/favicon.svg"];
    for (const rel of svgs) {
      const text = read(rel);
      const colors = [...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => hex(m[0]));
      for (const c of colors) expect(allowed.has(c), `${rel} : ${c} hors palette`).toBe(true);
      // Les seuls mots-clés de couleur admis : « none », « currentColor » (marque monochrome) et les dégradés.
      for (const m of text.matchAll(/(?:fill|stroke|stop-color)="([^"#][^"]*)"/g)) {
        expect(["none", "currentColor"].includes(m[1]) || m[1].startsWith("url(#"), `${rel} : ${m[1]}`).toBe(true);
      }
    }
    expect([...read("assets/logo/baobab-mark.svg").matchAll(/#[0-9a-fA-F]{6}\b/g)].length).toBeGreaterThan(20);
    for (const p of Object.values(PALETTES)) for (const c of Object.values(p)) expect(allowed.has(hex(c))).toBe(true);
  });

  it("la marque reste simple : 5 branches principales, deux niveaux de division, extrémités distinctes", () => {
    const lvl = (n) => MARK.crown.links.filter((l) => l.lvl === n).length;
    expect(lvl(0)).toBe(5);
    expect(lvl(1)).toBe(10);
    expect(lvl(2)).toBeGreaterThan(0);
    const count = (read("assets/logo/baobab-mark.svg").match(/<(line|circle|path)\b/g) || []).length;
    expect(count).toBeLessThan(90);
    // Les extrémités ne se chevauchent pas : sinon la canopée devient une tache à 32 px.
    const nodes = MARK.crown.tips;
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++)
        expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) - nodes[i].r - nodes[j].r, `pointes ${i}/${j}`).toBeGreaterThan(1);
  });

  it("README en français présent (usage, couleurs, zone de protection, tailles minimales)", () => {
    const t = read("assets/logo/README.md");
    for (const w of ["Usage", "Couleurs", "Zone de protection", "Tailles minimales"]) expect(t).toMatch(new RegExp(w, "i"));
  });
});

describe("icônes web générées", () => {
  const sizes = {
    "public/icon-64.png": [64, 64],
    "public/icon-192.png": [192, 192],
    "public/icon-512.png": [512, 512],
    "public/icon-512-maskable.png": [512, 512],
    "public/apple-touch-icon.png": [180, 180],
    "public/og-baobab.png": [1200, 630],
  };
  it.each(Object.entries(sizes))("%s a les bonnes dimensions", (rel, [w, h]) => {
    const p = pngHeader(rel);
    expect([p.w, p.h]).toEqual([w, h]);
    expect(p.depth).toBe(8);
  });
  it("apple-touch-icon, icône maskable et image de partage sont SANS transparence", () => {
    for (const rel of ["public/apple-touch-icon.png", "public/icon-512-maskable.png", "public/og-baobab.png"]) {
      const p = pngHeader(rel);
      expect(p.colorType, rel).toBe(2);
      expect(p.hasTrns, rel).toBe(false);
    }
  });
  it("favicon.svg existe, carré, bien formé", () => {
    const dom = new JSDOM(read("public/favicon.svg"), { contentType: "image/svg+xml" });
    expect(dom.window.document.documentElement.getAttribute("viewBox")).toBe("0 0 64 64");
  });
  it("l'icône maskable tient dans la zone sûre (cercle de 80 % de diamètre)", async () => {
    const { data, info } = await sharp(R("public/icon-512-maskable.png")).raw().toBuffer({ resolveWithObject: true });
    // Fond quasi uni aux coins ; la marque est tout ce qui s'en écarte nettement.
    const bg = [data[0], data[1], data[2]];
    const limit = 0.4 * info.width;
    let maxR = 0;
    let marks = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const o = (y * info.width + x) * info.channels;
        const d = Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]);
        if (d > 120) {
          marks++;
          maxR = Math.max(maxR, Math.hypot(x - info.width / 2, y - info.height / 2));
        }
      }
    expect(marks).toBeGreaterThan(5000);
    expect(maxR).toBeLessThanOrEqual(limit);
  });
});

describe("manifest et index.html", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  it("couleurs Horizon et icônes cohérentes (fichiers existants, tailles réelles, purposes)", () => {
    expect(hex(manifest.theme_color)).toBe(HORIZON.nuit);
    expect(hex(manifest.background_color)).toBe(HORIZON.nuit);
    for (const ic of manifest.icons) {
      const rel = "public" + ic.src;
      expect(fs.existsSync(R(rel)), rel).toBe(true);
      const p = pngHeader(rel);
      expect(ic.sizes).toBe(`${p.w}x${p.h}`);
      expect(["any", "maskable"]).toContain(ic.purpose);
    }
    expect(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "any" && i.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some((i) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  });
  it("index.html référence uniquement des fichiers existants pour icônes et image de partage", () => {
    const html = read("index.html");
    const refs = [];
    for (const m of html.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)) refs.push(m[0].match(/href="([^"]+)"/)[1]);
    for (const m of html.matchAll(/<meta[^>]+(?:og:image|twitter:image)"[^>]*content="([^"]+)"/g)) refs.push(m[1]);
    expect(refs.length).toBeGreaterThanOrEqual(6);
    for (const r of refs) {
      const rel = "public/" + r.replace(/^https:\/\/baobab-app-zeta\.vercel\.app\//, "").replace(/^\//, "");
      expect(fs.existsSync(R(rel)), `${r} -> ${rel}`).toBe(true);
    }
    expect(html).toMatch(/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/);
    expect(html).toMatch(/og:image" content="https:\/\/baobab-app-zeta\.vercel\.app\/og-baobab\.png"/);
    expect(html).toMatch(/twitter:card" content="summary_large_image"/);
  });
});

describe("sources natives (@capacitor/assets) et iOS", () => {
  it("dimensions des sources", () => {
    const want = {
      "assets/icon-only.png": 1024,
      "assets/icon-foreground.png": 1024,
      "assets/icon-background.png": 1024,
      "assets/splash.png": 2732,
      "assets/splash-dark.png": 2732,
      "assets/store/icon-1024.png": 1024,
      "assets/store/icon-512.png": 512,
    };
    for (const [rel, s] of Object.entries(want)) {
      const p = pngHeader(rel);
      expect([p.w, p.h], rel).toEqual([s, s]);
    }
  });
  it("icône iOS (sources, App Store, projet Xcode) sans canal alpha : couleur de type 2", () => {
    for (const rel of [
      "assets/icon-only.png",
      "assets/store/icon-1024.png",
      "assets/store/icon-512.png",
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    ]) {
      const p = pngHeader(rel);
      expect(p.colorType, rel).toBe(2);
      expect(p.hasTrns, rel).toBe(false);
    }
    const p = pngHeader("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
    expect([p.w, p.h]).toEqual([1024, 1024]);
  });
  it("l'avant-plan adaptatif est transparent et sa marque tient dans le cercle sûr Android", async () => {
    expect(pngHeader("assets/icon-foreground.png").colorType).toBe(6);
    const { data, info } = await sharp(R("assets/icon-foreground.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // coin transparent
    let maxR = 0;
    let n = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++)
        if (data[(y * info.width + x) * 4 + 3] > 8) {
          n++;
          maxR = Math.max(maxR, Math.hypot(x - 512, y - 512));
        }
    expect(n).toBeGreaterThan(20000);
    // ic_launcher.xml affiche l'image dans 72 dp (retrait de 16,7 %) ; le cercle sûr fait 66 dp : 45,8 % de l'image.
    expect(maxR).toBeLessThanOrEqual(0.458 * 1024);
  });
  it("splash clair = ivoire, splash sombre = nuit (bords), comme les fonds natifs", async () => {
    const px = async (rel) => {
      const { data } = await sharp(R(rel)).raw().toBuffer({ resolveWithObject: true });
      return "#" + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
    };
    expect(await px("assets/splash.png")).toBe(HORIZON.ivoire);
    expect(await px("assets/splash-dark.png")).toBe(HORIZON.nuit);
    expect(await px("android/app/src/main/res/drawable/splash.png")).toBe(HORIZON.ivoire);
    expect(await px("android/app/src/main/res/drawable-night/splash.png")).toBe(HORIZON.nuit);
  });
  it("les images de lancement iOS (clair et sombre) existent et sont carrées 2732", () => {
    const dir = "ios/App/App/Assets.xcassets/Splash.imageset/";
    const pngs = fs.readdirSync(R(dir)).filter((x) => x.endsWith(".png"));
    expect(pngs.length).toBe(6);
    for (const f of pngs) expect(pngHeader(dir + f)).toMatchObject({ w: 2732, h: 2732 });
  });
});

describe("ressources Android de lancement et de notification", () => {
  const color = (rel, name) => read(rel).match(new RegExp(`name="${name}">(#[0-9A-Fa-f]{6})<`))?.[1]?.toUpperCase();
  it("aucune référence à l'ancien vert #14432A dans les ressources natives de lancement", () => {
    const files = [
      "android/app/src/main/res/values/bb_colors.xml",
      "android/app/src/main/res/values-night/bb_colors.xml",
      "android/app/src/main/res/values/ic_launcher_background.xml",
      "android/app/src/main/res/values/styles.xml",
      "capacitor.config.json",
    ];
    for (const f of files) {
      expect(read(f).toUpperCase(), f).not.toContain("14432A");
      expect(read(f).toUpperCase(), f).not.toContain("14120D");
    }
  });
  it("fonds du splash et de l'icône alignés sur Horizon", () => {
    expect(color("android/app/src/main/res/values/bb_colors.xml", "bb_splash_background")).toBe(HORIZON.ivoire);
    expect(color("android/app/src/main/res/values-night/bb_colors.xml", "bb_splash_background")).toBe(HORIZON.nuit);
    expect(color("android/app/src/main/res/values/ic_launcher_background.xml", "ic_launcher_background")).toBe(HORIZON.nuit);
    expect(color("android/app/src/main/res/values/bb_colors.xml", "bb_notification_color")).toMatch(/^#[0-9A-F]{6}$/);
    expect(hex(capacitorConfig.plugins.SplashScreen.backgroundColor)).toBe(HORIZON.ivoire);
  });
  it("ic_stat_baobab : 5 densités, blanc pur + transparence, issue de la marque monochrome", async () => {
    const dims = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
    for (const [d, px] of Object.entries(dims)) {
      const rel = `android/app/src/main/res/drawable-${d}/ic_stat_baobab.png`;
      expect(pngHeader(rel)).toMatchObject({ w: px, h: px, colorType: 6 });
      const { data } = await sharp(R(rel)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let solid = 0;
      let transparent = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          expect([data[i], data[i + 1], data[i + 2]], rel).toEqual([255, 255, 255]);
          if (data[i + 3] > 200) solid++;
        } else transparent++;
      }
      expect(solid, rel).toBeGreaterThan(px * px * 0.08);
      expect(transparent, rel).toBeGreaterThan(px * px * 0.3);
    }
  });
  it("couche monochrome Android 13 déclarée et présente dans les 5 densités", () => {
    for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
      expect(read(`android/app/src/main/res/mipmap-anydpi-v26/${f}`)).toContain('<monochrome android:drawable="@mipmap/ic_launcher_monochrome"');
    }
    const dims = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
    for (const [d, px] of Object.entries(dims)) expect(pngHeader(`android/app/src/main/res/mipmap-${d}/ic_launcher_monochrome.png`)).toMatchObject({ w: px, h: px });
  });
  it("avant-plan adaptatif à la taille exacte de 72 dp par densité", () => {
    const dims = { mdpi: 72, hdpi: 108, xhdpi: 144, xxhdpi: 216, xxxhdpi: 288 };
    for (const [d, px] of Object.entries(dims)) expect(pngHeader(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`)).toMatchObject({ w: px, h: px });
  });
  it("assets:android enchaîne capacitor-assets puis les extras (sinon capacitor-assets efface la couche monochrome)", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.scripts["assets:logo"]).toBe("node scripts/generate-logo-assets.mjs");
    expect(pkg.scripts["assets:android"]).toMatch(/capacitor-assets generate --android .*&& node scripts\/generate-logo-assets\.mjs --android-extras/);
    expect(pkg.devDependencies.sharp).toBeTruthy();
  });
});
