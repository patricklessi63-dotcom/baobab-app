import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOOKALIKE_FROM, LOOKALIKE_TO, LEET_FROM, LEET_TO } from "./contentModeration.js";
import seed from "../config/moderationTerms.seed.json";
import { applySeed } from "../../scripts/gen-moderation-seed.mjs";

const sql = readFileSync(join(process.cwd(), "supabase-moderation-text.sql"), "utf8");
const BS = String.fromCharCode(92);
const toEscapes = (s) => [...s].map((c) => BS + "u" + c.codePointAt(0).toString(16).padStart(4, "0")).join("");

// Le SQL (serveur, fait autorité) et le JS (retour immédiat) doivent normaliser pareil : ce test
// verrouille les tables de caractères et la liste de départ contre toute dérive.
describe("supabase-moderation-text.sql reste le miroir de contentModeration.js", () => {
  it("homoglyphes : mêmes caractères d'entrée et de sortie", () => {
    expect(sql).toContain(`E'${toEscapes(LOOKALIKE_FROM)}'`);
    expect(sql).toContain(`'${LOOKALIKE_TO}'`);
    expect([...LOOKALIKE_FROM]).toHaveLength(LOOKALIKE_TO.length);
  });
  it("substitutions « leet » : mêmes correspondances", () => {
    // € est écrit par code Unicode dans le SQL (jamais en clair)
    const leetSql = LEET_FROM.replace("€", BS + "u20ac");
    expect(sql).toContain(`E'${leetSql}'`);
    expect(sql).toContain(`'${LEET_TO}'`);
    expect([...LEET_FROM]).toHaveLength(LEET_TO.length);
  });
  it("la liste de départ du SQL est à jour (relancer node scripts/gen-moderation-seed.mjs sinon)", () => {
    expect(applySeed(sql, seed)).toBe(sql);
  });
  it("aucun caractère non ASCII dans le code SQL (hors commentaires) : insensible à l'éditeur", () => {
    const code = sql.split("\n").filter((l) => !/^\s*--/.test(l)).map((l) => l.replace(/--.*$/, ""));
    expect(code.filter((l) => /[^\x00-\x7f]/.test(l))).toEqual([]);
  });
  it("les huit zones de texte sont protégées par un déclencheur", () => {
    for (const t of ["messages", "posts", "post_comments", "community_posts", "community_comments", "event_comments", "stories", "profiles"]) {
      expect(sql, t).toMatch(new RegExp("create trigger trg_moderation_[a-z_]+ before (insert or )?update of [a-z_]+ on " + t + "[^a-z_]"));
    }
  });
  it("aucune fonction de modération n'est appelable sans compte", () => {
    expect(sql).toMatch(/revoke all on function[\s\S]*moderation_screen[\s\S]*from public, anon;/);
    expect(sql).not.toMatch(/grant execute[^;]*to anon/);
  });
  it("le refus serveur porte le marqueur lu par l'application", async () => {
    const { SERVER_REFUSAL_MARKER } = await import("./contentGate.js");
    expect(sql).toContain(`'${SERVER_REFUSAL_MARKER}:`);
  });
});
