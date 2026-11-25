import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeAge } from "../lib/computeAge";
import { computeAge as computeAgeFromStep1 } from "../screens/onboarding/steps/Step1Identity";

// Performance du démarrage : les fenêtres de réglages ne s'ouvrent que depuis Réglages ; elles sortent du fichier principal
// et ne sont montées qu'à l'ouverture. computeAge vit dans un module léger pour qu'App.jsx ne tire plus l'écran
// d'inscription Step1Identity dans le fichier principal.
const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const am = read("src/components/AppModals.jsx");
const lines = am.split(/\r?\n/);

describe("AppModals — fenêtres de réglages chargées à la demande", () => {
  it.each([
    ["PrivacyFieldsModal", "privacyFieldsOpen"],
    ["NotificationPreferencesModal", "notificationPrefsOpen"],
    ["LocationSettingsModal", "locationOpen"],
    ["DeleteAccountModal", "deleteAccountOpen"],
  ])("%s : lazy(), jamais importé directement, monté seulement quand %s est vrai, protégé", (name, flag) => {
    expect(am).toContain(`const ${name} = lazy(() => import("./${name}"));`);
    expect(lines.some((l) => l.startsWith(`import ${name} from`))).toBe(false);
    const i = am.search(new RegExp(`<${name}\\s`));
    const before = am.slice(Math.max(0, i - 160), i);
    expect(before).toContain(`{${flag} && (`);
    expect(before).toContain("<ChunkErrorBoundary>");
    expect(before).toContain("<Suspense fallback={null}>");
  });
});

describe("computeAge — module léger", () => {
  it("App.jsx et EditProfileForm l'importent depuis lib/computeAge, pas depuis l'écran d'inscription", () => {
    expect(read("src/App.jsx")).toContain('import { computeAge } from "./lib/computeAge";');
    expect(read("src/App.jsx")).not.toContain("steps/Step1Identity");
    expect(read("src/screens/EditProfileForm.jsx")).toContain('import { computeAge } from "../lib/computeAge";');
  });

  it("Step1Identity ré-exporte la même fonction (compatibilité)", () => {
    expect(computeAgeFromStep1).toBe(computeAge);
  });

  it("calcule l'âge en années révolues, sans décalage de fuseau, et rejette les dates invalides", () => {
    const now = new Date();
    const y = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    expect(computeAge(`${y - 30}-${mm}-${dd}`)).toBe(30); // anniversaire aujourd'hui
    expect(computeAge(null)).toBeNull();
    expect(computeAge("pas une date")).toBeNull();
  });
});

describe("fenêtres montées à l'ouverture : chargées à la demande", () => {
  it.each([
    ["src/lib/ImageLightboxContext.jsx", "MediaViewerModal", "state"],
    ["src/components/SocialShell.jsx", "PublicProfileModal", "viewedProfile"],
    ["src/App.jsx", "MatchCelebrationModal", "matchNotice"],
  ])("%s : %s en lazy(), monté seulement si %s, protégé", (file, name, flag) => {
    const s = read(file);
    expect(s).toContain(`const ${name} = lazy(() => import(`);
    expect(s.split(/\r?\n/).some((l) => l.startsWith(`import ${name} from`))).toBe(false);
    const i = s.search(new RegExp(`<${name}\\s`));
    const before = s.slice(Math.max(0, i - 160), i);
    expect(before).toContain(`{${flag} && (`);
    expect(before).toContain("<ChunkErrorBoundary>");
    expect(before).toContain("<Suspense fallback={null}>");
  });
});
