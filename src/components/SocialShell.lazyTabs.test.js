import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Performance du démarrage : les onglets qui ne s'affichent pas à l'ouverture sont chargés à la demande (lazy), pour ne pas
// alourdir le fichier principal que chaque visiteur télécharge (570 kB minifiés avant le passage de Rencontres en lazy, 550 après).
const src = readFileSync(join(process.cwd(), "src/components/SocialShell.jsx"), "utf8");
const lines = src.split(/\r?\n/);

describe("SocialShell — onglets chargés à la demande", () => {
  it.each(["DiscoverTab", "CommunitiesTab", "EventsTab", "AdminDashboard", "ImmigrationNewsView"])("%s est importé avec lazy(), jamais directement", (name) => {
    expect(src.includes(`const ${name} = lazy(() => import(`)).toBe(true);
    expect(lines.some((l) => l.startsWith(`import ${name} from`))).toBe(false);
  });

  it("l'onglet Rencontres est entouré d'une limite d'erreur et d'un Suspense (chargement ou échec réseau gérés)", () => {
    const i = src.indexOf("<DiscoverTab");
    const before = src.slice(Math.max(0, i - 200), i);
    expect(before).toContain("<ChunkErrorBoundary>");
    expect(before).toContain("<Suspense fallback={<TabLoadingFallback />}>");
  });
});
