import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Performance du démarrage : les onglets qui ne s'affichent pas à l'ouverture sont chargés à la demande (lazy), pour ne pas
// alourdir le fichier principal que chaque visiteur télécharge (570 kB minifiés avant le passage de Rencontres en lazy, 550 après).
const src = readFileSync(join(process.cwd(), "src/components/SocialShell.jsx"), "utf8");
const lines = src.split(/\r?\n/);

describe("SocialShell — onglets chargés à la demande", () => {
  it.each(["DiscoverTab", "ProfileTab", "CommunitiesTab", "EventsTab", "AdminDashboard", "ImmigrationNewsView"])("%s est importé avec lazy(), jamais directement", (name) => {
    expect(src.includes(`const ${name} = lazy(() => import(`)).toBe(true);
    expect(lines.some((l) => l.startsWith(`import ${name} from`))).toBe(false);
  });

  it("l'onglet Rencontres est entouré d'une limite d'erreur et d'un Suspense (chargement ou échec réseau gérés)", () => {
    const i = src.indexOf("<DiscoverTab");
    const before = src.slice(Math.max(0, i - 200), i);
    expect(before).toContain("<ChunkErrorBoundary>");
    expect(before).toContain("<Suspense fallback={<TabLoadingFallback />}>");
  });

  it("l'onglet Profil est entouré d'une limite d'erreur et d'un Suspense", () => {
    const i = src.indexOf("<ProfileTab");
    const before = src.slice(Math.max(0, i - 200), i);
    expect(before).toContain("<ChunkErrorBoundary>");
    expect(before).toContain("<Suspense fallback={<TabLoadingFallback />}>");
  });

  it("la conversation (ConversationPane, ≈ 70 ko) est chargée à la demande dans MessagesTab, préchargée et protégée", () => {
    const m = readFileSync(join(process.cwd(), "src/components/social/MessagesTab.jsx"), "utf8");
    expect(m).toContain("const ConversationPane = lazy(loadConversationPane);");
    expect(m.split(/\r?\n/).some((l) => l.startsWith("import ConversationPane from"))).toBe(false);
    expect(m).toContain("loadConversationPane().catch(");
    const i = m.search(/<ConversationPane\s/); // l'élément lui-même, pas <ConversationPaneFallback />
    const before = m.slice(Math.max(0, i - 200), i);
    expect(before).toContain("<ChunkErrorBoundary>");
    expect(before).toContain("<Suspense fallback={<ConversationPaneFallback />}>");
  });
});
