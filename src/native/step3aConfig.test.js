import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ANDROID_CHANNEL } from "../lib/nativePush.js";
import publicOrigin from "../config/publicOrigin.json";

// Garde-fous de l'étape 3a sur les fichiers de configuration (aucun appareil, aucun
// Firebase ici) : ce que Google/Apple/Vercel liront en production.

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));

describe("domaine public — source unique", () => {
  it("src/config/publicOrigin.json : une origine https, sans chemin", () => {
    const u = new URL(publicOrigin.origin);
    expect(u.protocol).toBe("https:");
    expect(u.origin).toBe(publicOrigin.origin);
  });

  it("android/app/build.gradle lit CE fichier pour l'hôte des App Links (aucun domaine écrit en dur)", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toContain("src/config/publicOrigin.json");
    expect(gradle).toContain("manifestPlaceholders = [deepLinkHost: deepLinkHost]");
    expect(gradle).not.toContain(new URL(publicOrigin.origin).host);
  });
});

describe("Android : App Links, notifications, build sans Firebase", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");

  it("intent-filter autoVerify sur l'hôte paramétré, https uniquement, chemins en liste blanche", () => {
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:host="${deepLinkHost}"');
    expect(manifest).toContain('android:scheme="https"');
    const prefixes = [...manifest.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]).sort();
    expect(prefixes).toEqual(["/community/", "/event/", "/messages/", "/profile/"]);
    expect(manifest).toContain('android:path="/update-password"');
    expect(manifest).not.toMatch(/android:scheme="(?!https")/); // pas de schéma personnalisé ni http
  });

  it("canal, icône et couleur de notification par défaut (app fermée) ; permission Android 13+", () => {
    expect(manifest).toContain(`com.google.firebase.messaging.default_notification_channel_id" android:value="${ANDROID_CHANNEL.id}"`);
    expect(manifest).toContain('@drawable/ic_stat_baobab');
    expect(manifest).toContain('@color/bb_notification_color');
    expect(manifest).toContain("android.permission.POST_NOTIFICATIONS");
    for (const d of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
      expect(fs.existsSync(path.join(root, `android/app/src/main/res/drawable-${d}/ic_stat_baobab.png`))).toBe(true);
    }
  });

  it("le même identifiant de canal est utilisé par le serveur (send-push) et par le client", () => {
    const server = read("supabase/functions/_shared/nativePush.ts");
    expect(server).toContain(`export const ANDROID_CHANNEL_ID = "${ANDROID_CHANNEL.id}"`);
  });

  it("le plugin google-services n'est appliqué que si google-services.json existe (le build de la CI reste possible sans)", () => {
    const gradle = read("android/app/build.gradle");
    expect(gradle).toMatch(/servicesJson\.exists\(\)\s*&&\s*servicesJson\.length\(\)\s*>\s*0/);
    expect(gradle).toContain("apply plugin: 'com.google.gms.google-services'");
    // L'application du plugin est BIEN conditionnelle : une seule occurrence, dans le if.
    expect(gradle.match(/apply plugin: 'com\.google\.gms\.google-services'/g)).toHaveLength(1);
    // Aucun google-services.json réel n'est versionné dans le dépôt.
    expect(fs.existsSync(path.join(root, "android/app/google-services.json"))).toBe(false);
  });

  it("aucun secret versionné : pas de clé .p8/.pem, pas de compte de service Firebase", () => {
    const tracked = fs.readdirSync(root).filter((f) => /\.(p8|pem|jks|keystore)$/.test(f));
    expect(tracked).toEqual([]);
    expect(read(".gitignore")).toMatch(/\*\.p8/);
    const server = read("supabase/functions/_shared/nativePush.ts");
    expect(server).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY-----\s*[A-Za-z0-9+/]{40}/);
  });
});

describe(".well-known : App Links Android / Universal Links iOS", () => {
  it("assetlinks.json : package ca.baobab.app, empreinte = marque « REMPLACER » OU empreinte SHA-256 valide (rien d'inventé)", () => {
    const [entry] = json("public/.well-known/assetlinks.json");
    expect(entry.relation).toContain("delegate_permission/common.handle_all_urls");
    expect(entry.target.namespace).toBe("android_app");
    expect(entry.target.package_name).toBe("ca.baobab.app");
    const [fp] = entry.target.sha256_cert_fingerprints;
    // Tant que le propriétaire n'a pas collé la vraie valeur : marque explicite. Ensuite : SHA-256 au format
    // « AA:BB:… » (32 octets, majuscules), tel qu'affiché par keytool / la Play Console. Jamais autre chose.
    expect(fp).toMatch(/^REMPLACER|^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  });

  it("apple-app-site-association : Team ID = marque « REMPLACER » OU Team ID Apple valide (10 caractères), mêmes chemins que l'app", () => {
    const aasa = json("public/.well-known/apple-app-site-association");
    const detail = aasa.applinks.details[0];
    expect(detail.appIDs[0]).toMatch(/^(REMPLACER_PAR_LE_TEAM_ID_APPLE|[A-Z0-9]{10})\.ca\.baobab\.app$/);
    const paths = detail.components.map((c) => c["/"]).sort();
    expect(paths).toEqual(["/", "/community/*", "/event/*", "/messages/*", "/profile/*", "/update-password"]);
  });

  it("vercel.json : servis en application/json, la réécriture SPA existante est intacte", () => {
    const v = json("vercel.json");
    expect(v.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
    for (const file of ["apple-app-site-association", "assetlinks.json"]) {
      const rule = v.headers.find((h) => h.source === `/.well-known/${file}`);
      expect(rule, file).toBeTruthy();
      expect(rule.headers).toContainEqual({ key: "Content-Type", value: "application/json" });
      // Le fichier statique existe dans public/ (Vercel sert le système de fichiers AVANT les réécritures).
      expect(fs.existsSync(path.join(root, "public/.well-known", file))).toBe(true);
    }
    // Les en-têtes de sécurité globaux (CSP...) sont toujours là.
    expect(v.headers[0].source).toBe("/(.*)");
    expect(v.headers[0].headers.some((h) => h.key === "Content-Security-Policy")).toBe(true);
  });
});

describe("le web n'embarque aucun plugin natif", () => {
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : [p];
    });
  }
  const sources = walk(path.join(root, "src")).filter((f) => /\.(js|jsx)$/.test(f) && !/\.test\./.test(f));

  it("@capacitor/push-notifications, app, keyboard, status-bar, splash-screen : import() dynamique uniquement", () => {
    const offenders = [];
    for (const f of sources) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(/^\s*import[^;]*from\s+["'](@capacitor\/[^"']+)["']/gm)) {
        // Seul @capacitor/core (déjà dans le bundle principal) peut être importé statiquement.
        if (m[1] !== "@capacitor/core") offenders.push(`${path.relative(root, f)} -> ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("les appels dynamiques ne sont que dans nativeUi.js, nativeApp.js et nativePush.js (tous gardés par isNative)", () => {
    const files = sources
      .filter((f) => /import\(\s*["']@capacitor\/(push-notifications|app|keyboard|status-bar|splash-screen)["']\s*\)/.test(fs.readFileSync(f, "utf8")))
      .map((f) => path.basename(f))
      .sort();
    expect(files).toEqual(["nativeApp.js", "nativePush.js", "nativeUi.js"]);
    for (const f of ["nativeApp.js", "nativePush.js"]) {
      const text = fs.readFileSync(sources.find((s) => path.basename(s) === f), "utf8");
      expect(text).toContain('from "./platform"');
      expect(text).toContain("isNative()");
    }
  });
});
