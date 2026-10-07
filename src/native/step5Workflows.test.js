import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// Garde-fous sur .github/workflows : syntaxe valide, permissions minimales, déclencheurs sûrs
// (jamais de publication à chaque push sur main), aucun secret en clair ni affiché, actions épinglées.
// Les workflows eux-mêmes ne peuvent être exécutés que par GitHub : ce test ne prouve que leur forme.

const root = process.cwd();
const dir = path.join(root, ".github", "workflows");
const names = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
const raw = Object.fromEntries(names.map((n) => [n, fs.readFileSync(path.join(dir, n), "utf8")]));
const wf = Object.fromEntries(names.map((n) => [n, parseYaml(raw[n])]));

const NATIVE = ["android-build.yml", "ios-build.yml"];

// `on:` est parsé comme la clé booléenne true par YAML 1.1 ; `yaml` (1.2) le garde en chaîne.
const triggers = (n) => wf[n].on ?? wf[n][true];
const allSteps = (n) => Object.values(wf[n].jobs).flatMap((j) => j.steps ?? []);

describe("workflows GitHub Actions : présence et syntaxe", () => {
  it("ci.yml, android-build.yml et ios-build.yml existent et se parsent", () => {
    expect(names).toEqual(expect.arrayContaining(["ci.yml", ...NATIVE]));
    for (const n of names) {
      expect(wf[n], n).toBeTypeOf("object");
      expect(wf[n].jobs, n).toBeTypeOf("object");
    }
  });

  it("noms de fichiers : un seul workflow par plateforme native", () => {
    expect(names.filter((n) => /android/i.test(n))).toEqual(["android-build.yml"]);
    expect(names.filter((n) => /ios/i.test(n))).toEqual(["ios-build.yml"]);
  });
});

describe("permissions, concurrence, délais", () => {
  it.each(names)("%s : permissions minimales (contents: read, rien d'autre) au niveau du workflow", (n) => {
    expect(wf[n].permissions).toEqual({ contents: "read" });
    for (const [job, def] of Object.entries(wf[n].jobs)) {
      if (def.permissions) expect(def.permissions, `${n}/${job}`).toEqual({ contents: "read" });
    }
  });

  it.each(names)("%s : concurrency (annule les doublons) et timeout-minutes sur chaque job", (n) => {
    expect(wf[n].concurrency?.["cancel-in-progress"]).toBe(true);
    expect(String(wf[n].concurrency.group)).toContain("github.ref");
    for (const [job, def] of Object.entries(wf[n].jobs)) {
      expect(def["timeout-minutes"], `${n}/${job}`).toBeGreaterThan(0);
      expect(def["timeout-minutes"], `${n}/${job}`).toBeLessThanOrEqual(90);
    }
  });
});

describe("déclencheurs sûrs", () => {
  it("ci.yml : pull_request et push sur main seulement (aucun secret, aucune publication)", () => {
    const t = triggers("ci.yml");
    expect(Object.keys(t).sort()).toEqual(["pull_request", "push"]);
    expect(t.push.branches).toEqual(["main"]);
    expect(raw["ci.yml"]).not.toMatch(/secrets\./);
  });

  it.each(NATIVE)("%s : lancement manuel ; JAMAIS de push sur une branche, ni pull_request / pull_request_target / schedule", (n) => {
    const t = triggers(n);
    expect(t).toHaveProperty("workflow_dispatch");
    expect(t).not.toHaveProperty("pull_request");
    expect(t).not.toHaveProperty("pull_request_target");
    expect(t).not.toHaveProperty("schedule");
    expect(t).not.toHaveProperty("workflow_run");
    if (t.push) {
      expect(t.push.branches, `${n} : push.branches`).toBeUndefined();
      expect(t.push["branches-ignore"], `${n} : push.branches-ignore`).toBeUndefined();
      expect(t.push.tags, `${n} : push.tags`).toEqual(["v*"]);
    }
  });

  it("android-build.yml : aucun déclencheur automatique (manuel seulement) ; ios-build.yml : manuel ou tag v*", () => {
    expect(Object.keys(triggers("android-build.yml"))).toEqual(["workflow_dispatch"]);
    expect(Object.keys(triggers("ios-build.yml")).sort()).toEqual(["push", "workflow_dispatch"]);
  });
});

describe("secrets : jamais en clair, jamais affichés", () => {
  const ALLOWED_SECRETS = new Set([
    "ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD",
    "APP_STORE_CONNECT_ISSUER_ID", "APP_STORE_CONNECT_KEY_ID", "APP_STORE_CONNECT_KEY_P8", "APPLE_TEAM_ID",
    "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY",
  ]);

  it.each(names)("%s : seuls les noms de secrets documentés sont référencés ; aucun n'est GITHUB_TOKEN personnalisé", (n) => {
    const used = [...raw[n].matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
    for (const s of used) expect(ALLOWED_SECRETS.has(s), `${n} : secret inattendu ${s}`).toBe(true);
  });

  it.each(names)("%s : aucune valeur sensible littérale (clé privée, jeton, longue chaîne base64)", (n) => {
    expect(raw[n]).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(raw[n]).not.toMatch(/\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/);
    expect(raw[n]).not.toMatch(/\bAKIA[0-9A-Z]{16}\b/);
    expect(raw[n]).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\./); // JWT
    expect(raw[n]).not.toMatch(/[A-Za-z0-9+/]{120,}={0,2}/); // blob base64 (keystore, p8)
  });

  it.each(names)("%s : `${{ secrets.* }}` uniquement dans env: / with: (jamais dans un script `run`), pas de set -x", (n) => {
    for (const step of allSteps(n)) {
      if (typeof step.run === "string") {
        expect(step.run, `${n} : ${step.name}`).not.toMatch(/\$\{\{\s*secrets\./);
        expect(step.run, `${n} : ${step.name}`).not.toMatch(/\bset\s+-[a-z]*x/);
        expect(step.run, `${n} : ${step.name}`).not.toMatch(/\bbash\s+-[a-z]*x/);
        expect(step.run, `${n} : ${step.name}`).not.toMatch(/\bxtrace\b/);
        // Pas d'écho de variable portant un secret.
        expect(step.run, `${n} : ${step.name}`).not.toMatch(/echo[^\n]*\$\{?(ANDROID_KEYSTORE_BASE64|ANDROID_KEYSTORE_PASSWORD|ANDROID_KEY_PASSWORD|ASC_KEY_P8|KS|KSP|KP)\b/);
      }
    }
  });

  it.each(names)("%s : aucune injection de script (entrées/événements GitHub interpolés dans un `run`)", (n) => {
    for (const step of allSteps(n)) {
      if (typeof step.run === "string") {
        expect(step.run, `${n} : ${step.name}`).not.toMatch(/\$\{\{\s*(inputs\.|github\.event|github\.head_ref|github\.ref_name)/);
      }
    }
  });

  it.each(names)("%s : aucun jeton personnalisé : seulement le GITHUB_TOKEN implicite (checkout sans persist-credentials)", (n) => {
    for (const step of allSteps(n)) {
      if (String(step.uses ?? "").startsWith("actions/checkout")) {
        expect(step.with?.["persist-credentials"], `${n} : checkout`).toBe(false);
      }
    }
  });

  it("android-build.yml : les étapes de signature ne tournent que si les 4 secrets sont présents", () => {
    const steps = allSteps("android-build.yml");
    const detect = steps.find((s) => s.id === "detect");
    expect(detect).toBeTruthy();
    for (const k of ["ANDROID_KEYSTORE_BASE64", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]) {
      expect(JSON.stringify(detect.env)).toContain(`secrets.${k}`);
    }
    for (const name of ["Décoder le keystore (secret)", "AAB de release signé", "Garder l'AAB signé"]) {
      const s = steps.find((x) => x.name === name);
      expect(s, name).toBeTruthy();
      expect(s.if, name).toContain("steps.detect.outputs.signing == 'true'");
    }
    // Les secrets de signature ne sont pas dans l'environnement du job entier (la phase `npm ci` n'y a pas accès).
    const job = wf["android-build.yml"].jobs.android;
    expect(job.env).toBeUndefined();
    const withKeys = steps.filter((s) => /secrets\.ANDROID_KEY/.test(JSON.stringify(s.env ?? {})));
    expect(withKeys.map((s) => s.name)).toEqual([
      "Détecter les secrets disponibles (sans les afficher)",
      "Décoder le keystore (secret)",
      "AAB de release signé",
    ]);
    // Le keystore est supprimé même en cas d'échec.
    const cleanup = steps.find((x) => x.name === "Supprimer le keystore du runner");
    expect(cleanup.if).toContain("always()");
  });

  it("ios-build.yml : archive signé / TestFlight seulement si les 4 secrets sont présents ; clé supprimée même en cas d'échec", () => {
    const steps = allSteps("ios-build.yml");
    const detect = steps.find((s) => s.id === "detect");
    for (const k of ["APP_STORE_CONNECT_ISSUER_ID", "APP_STORE_CONNECT_KEY_ID", "APP_STORE_CONNECT_KEY_P8", "APPLE_TEAM_ID"]) {
      expect(JSON.stringify(detect.env)).toContain(`secrets.${k}`);
    }
    const signed = steps.find((s) => /Archive signé/.test(s.name));
    expect(signed.if).toContain("steps.detect.outputs.signing == 'true'");
    expect(signed.run).toContain("::add-mask::");
    expect(signed.run).toContain("-allowProvisioningUpdates");
    expect(signed.run).toContain("-authenticationKeyPath");
    expect(signed.run).toContain("altool --upload-app");
    expect(signed.run).toContain("destination</key><string>export");
    // La compilation simulateur n'a aucun secret et passe avant l'archive signé.
    const sim = steps.find((s) => /simulateur/.test(s.name) && /Compiler/.test(s.name));
    expect(sim.env).toBeUndefined();
    expect(sim.run).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(sim.run).toContain("-sdk iphonesimulator");
    expect(sim.run).toContain("generic/platform=iOS Simulator");
    expect(steps.indexOf(sim)).toBeLessThan(steps.indexOf(signed));
    const cleanup = steps.find((x) => /Supprimer la clé/.test(x.name));
    expect(cleanup.if).toBe("always()");
    expect(cleanup.run).toContain("AuthKey_");
    // Pas de secret dans l'environnement du job entier.
    expect(wf["ios-build.yml"].jobs.ios.env).toBeUndefined();
  });
});

describe("actions et runners", () => {
  it.each(names)("%s : chaque `uses:` est une action actions/* épinglée par tag majeur (vX), pas de @main/@master", (n) => {
    for (const step of allSteps(n)) {
      if (!step.uses) continue;
      expect(step.uses, `${n}`).toMatch(/^actions\/[a-z-]+@v\d+$/);
    }
  });

  it("versions majeures à jour (vérifiées le 7 octobre 2026) : checkout 7, setup-node 7, setup-java 6, upload-artifact 7", () => {
    const uses = new Set(names.flatMap((n) => allSteps(n)).map((s) => s.uses).filter(Boolean));
    expect([...uses].sort()).toEqual([
      "actions/checkout@v7",
      "actions/setup-java@v6",
      "actions/setup-node@v7",
      "actions/upload-artifact@v7",
    ]);
  });

  it("runners : ubuntu-latest (CI, Android) ; macos-26 (Xcode 26 exigé par Apple depuis le 28 avril 2026) pour iOS", () => {
    expect(wf["ci.yml"].jobs["test-build"]["runs-on"]).toBe("ubuntu-latest");
    expect(wf["android-build.yml"].jobs.android["runs-on"]).toBe("ubuntu-latest");
    expect(wf["ios-build.yml"].jobs.ios["runs-on"]).toBe("macos-26");
    expect(raw["ios-build.yml"]).toMatch(/Xcode_26/);
  });

  it("Node 22 partout (Capacitor 8 exige Node >= 22) ; JDK 21 pour Android (capacitor.build.gradle compile en Java 21)", () => {
    for (const n of names) {
      for (const s of allSteps(n)) {
        if (String(s.uses).startsWith("actions/setup-node")) expect(String(s.with["node-version"])).toBe("22");
        if (String(s.uses).startsWith("actions/setup-java")) {
          expect(String(s.with["java-version"])).toBe("21");
          expect(s.with.distribution).toBe("temurin");
        }
      }
    }
    expect(fs.readFileSync(path.join(root, "android/app/capacitor.build.gradle"), "utf8")).toContain("VERSION_21");
  });
});

describe("contenu des workflows de build natif", () => {
  it("ci.yml : npm ci, build, vitest en processus unique, cap sync android et ios", () => {
    const text = raw["ci.yml"];
    expect(text).toContain("npm ci");
    expect(text).toContain("npm run build");
    expect(text).toContain("npx vitest run --pool=forks --poolOptions.forks.singleFork=true");
    expect(text).toContain("npx cap sync android");
    expect(text).toContain("npx cap sync ios");
    expect(text).toMatch(/cache: npm/);
  });

  it("android-build.yml : debug APK sans secret, manifeste fusionné, permissions, AAB signé en artefact", () => {
    const text = raw["android-build.yml"];
    expect(text).toContain("assembleDebug");
    expect(text).toContain("processReleaseMainManifest");
    expect(text).toContain("scripts/android-merged-permissions.mjs");
    expect(text).toContain("bundleRelease");
    expect(text).toContain("baobab-android-debug-apk");
    expect(text).toContain("baobab-android-release-aab");
    // Le script Gradle lit les mêmes noms de variables que le workflow.
    const gradle = fs.readFileSync(path.join(root, "android/app/build.gradle"), "utf8");
    for (const v of ["ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"]) {
      expect(gradle, v).toContain(v);
      expect(text, v).toContain(v);
    }
    expect(gradle).toContain("baobabVersionCode");
    expect(text).toContain("baobabVersionCode");
    // Pas de publication automatique vers Google Play.
    expect(text).not.toMatch(/upload-google-play|r0adkll/);
  });

  it("ios-build.yml : cap sync ios, build simulateur, archive/export/altool ; pas de publication à la revue", () => {
    const text = raw["ios-build.yml"];
    expect(text).toContain("npx cap sync ios");
    expect(text).toContain("-scheme App");
    expect(text).toContain("-exportArchive");
    expect(text).toContain("app-store-connect");
    expect(text).not.toMatch(/submit-for-review|deliver|release-to-store|--release/i);
  });
});
