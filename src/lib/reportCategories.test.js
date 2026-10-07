import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PROFILE_REPORT_CATEGORIES, POST_REPORT_CATEGORIES } from "./reportCategories";
import { COMMUNITY_REPORT_CATEGORIES } from "./communities/communityConfig";
import { EVENT_REPORT_CATEGORIES } from "./events/eventConfig";

// Garde-fou de dérive client/base : un motif proposé à l'utilisateur que la
// contrainte CHECK de la base refuse fait échouer le signalement avec une
// erreur générique (cas réel : « Mineur suspecté » sur une publication).
const sql = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

function allowedIn(file, pattern) {
  const m = sql(file).match(pattern);
  if (!m) throw new Error(`contrainte introuvable dans ${file}`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}
const values = (list) => list.map((c) => c.value);

describe("catégories de signalement alignées sur la base", () => {
  it("profils (reports) : mêmes valeurs que supabase-report-minor-category.sql", () => {
    const allowed = allowedIn("supabase-report-minor-category.sql", /category in \(([^)]*)\)/);
    expect(values(PROFILE_REPORT_CATEGORIES).sort()).toEqual([...allowed].sort());
  });

  it("publications (post_reports) : chaque motif proposé est accepté par supabase-feed-posts.sql", () => {
    const m = sql("supabase-feed-posts.sql").match(/create table[^;]*post_reports[\s\S]*?category text not null check \(category in \(([^)]*)\)\)/i);
    const allowed = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    for (const v of values(POST_REPORT_CATEGORIES)) expect(allowed).toContain(v);
    expect(values(POST_REPORT_CATEGORIES)).not.toContain("mineur_suspecte");
  });

  it("communautés : mêmes valeurs que la contrainte la plus récente (supabase-scale-security-2.sql)", () => {
    const allowed = allowedIn("supabase-scale-security-2.sql", /community_reports_category_check\s*check \(category in \(([^)]*)\)\)/);
    expect(values(COMMUNITY_REPORT_CATEGORIES).sort()).toEqual([...allowed].sort());
  });

  it("événements : mêmes valeurs que supabase-events-v2.sql", () => {
    const m = sql("supabase-events-v2.sql").match(/create table[^;]*event_reports[\s\S]*?category text not null check \(category in \(([^)]*)\)\)/i);
    const allowed = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    expect(values(EVENT_REPORT_CATEGORIES).sort()).toEqual([...allowed].sort());
  });
});
