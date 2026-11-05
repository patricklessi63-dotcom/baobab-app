// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Garde-fou de confidentialité : lire `profiles` avec `select("*")` (ou un `.update().select()` sans
// colonnes, ou une jointure `profiles(*)`) ramène TOUTES les colonnes, y compris celles que SQL-22
// ferme aux comptes connectés (birth_date, ban_reason, suspend_reason, report_count,
// flagged_for_review, notification_preferences). Depuis SQL-22 (bloc 3B), un tel appel échoue côté
// serveur (42501) ; avant lui, il expose ces colonnes. Seul `src/lib/ownProfile.js` (lecture de SON
// propre profil, avec repli sur get_my_profile) est autorisé à le faire ; tout autre profil se lit
// avec la liste de colonnes `OTHER_PROFILE_COLUMNS`.

const root = path.join(process.cwd(), "src");
const ALLOWED = new Set([path.join("src", "lib", "ownProfile.js")]);

// Retourne les extraits fautifs d'un source.
export function findProfilesSelectStar(source) {
  const hits = [];
  // 1. Chaîne `.from("profiles")` jusqu'au prochain `;` : un `.select()` sans argument ou avec "*" en premier argument.
  const fromRe = /\.from\(\s*["'`]profiles["'`]\s*\)/g;
  let m;
  while ((m = fromRe.exec(source))) {
    const rest = source.slice(m.index + m[0].length);
    const end = rest.indexOf(";");
    const chain = end === -1 ? rest : rest.slice(0, end);
    // `select()` vide, ou une chaîne dont le premier champ est `*` : "*", "*, extra".
    const sel = /\.select\(\s*(\)|["'`]\s*\*\s*(?:,[^"'`]*)?["'`])/.exec(chain);
    if (sel) hits.push(`from("profiles")…${sel[0].trim()}`);
  }
  // 2. Jointure ou alias vers profiles qui prend toutes les colonnes : profiles(*), x:profiles(*), profiles!fk(*).
  const joinRe = /profiles(?:![A-Za-z0-9_]+)?\(\s*\*\s*\)/g;
  while ((m = joinRe.exec(source))) hits.push(m[0]);
  return hits;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(js|jsx)$/.test(e.name) && !/\.test\.(js|jsx)$/.test(e.name) ? [p] : [];
  });
}

describe("détecteur findProfilesSelectStar", () => {
  it("repère select(\"*\"), select() vide après écriture et jointures profiles(*)", () => {
    expect(findProfilesSelectStar('await supabase.from("profiles").select("*").eq("id", 1)')).toHaveLength(1);
    expect(findProfilesSelectStar("await supabase.from('profiles').select('*, extra')")).toHaveLength(1);
    expect(findProfilesSelectStar('supabase.from("profiles").update({ a: 1 }).eq("id", 2).select().single()')).toHaveLength(1);
    expect(findProfilesSelectStar('supabase.from("follows").select("from_id, profiles(*)")')).toHaveLength(1);
    expect(findProfilesSelectStar('supabase.from("follows").select("*, p:profiles!follows_to_id_fkey(*)")')).toHaveLength(1);
  });

  it("ne signale pas les lectures à colonnes explicites ni les autres tables", () => {
    expect(findProfilesSelectStar('supabase.from("profiles").select("id, name, avatar_url").in("id", ids)')).toEqual([]);
    expect(findProfilesSelectStar('supabase.from("profiles").select(OTHER_PROFILE_COLUMNS)')).toEqual([]);
    expect(findProfilesSelectStar('supabase.from("messages").select("*").eq("match_key", k)')).toEqual([]);
    expect(findProfilesSelectStar('supabase.from("follows").select("*, profiles(id, name)")')).toEqual([]);
    expect(findProfilesSelectStar('supabase.from("profiles").update({ a: 1 }).eq("id", 2); supabase.from("x").select("*")')).toEqual([]);
  });
});

describe("profils : aucun select(\"*\") hors ownProfile.js", () => {
  it("le code de l'application ne lit jamais toutes les colonnes de profiles en dehors de ownProfile.js", () => {
    const offenders = [];
    let scanned = 0;
    for (const file of sourceFiles(root)) {
      const rel = path.relative(process.cwd(), file);
      scanned += 1;
      if (ALLOWED.has(rel)) continue;
      const hits = findProfilesSelectStar(fs.readFileSync(file, "utf8"));
      hits.forEach((h) => offenders.push(`${rel} : ${h}`));
    }
    expect(scanned).toBeGreaterThan(100); // le test ne passe pas à vide
    expect(
      offenders,
      `Lecture de TOUTES les colonnes de profiles hors ownProfile.js (exposition de colonnes fermées par SQL-22). Utilise OTHER_PROFILE_COLUMNS ou ownProfile.js :\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
