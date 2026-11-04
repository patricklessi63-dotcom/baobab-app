// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-comment-rate-limit-fix.sql sur un SCHÉMA FACTICE (PGlite) : trois tables de
// commentaires sans limite (comme en production avant correctif), puis les déclencheurs. Ce n'est PAS la
// base Supabase ; même scénario joué sur la répétition (60 commentaires de suite acceptés avant, refus après).

const FIX = fs.readFileSync(path.join(process.cwd(), "supabase-comment-rate-limit-fix.sql"), "utf8");
const A1 = "10000001-0000-0000-0000-000000000000";
const A2 = "10000002-0000-0000-0000-000000000000";
const TABLES = ["post_comments", "community_comments", "event_comments"];
let db;
const ins = async (table, author, extra = "") => {
  try { await db.exec(`insert into public.${table} (author_id, body ${extra ? ", created_at" : ""}) values ('${author}', 'c' ${extra ? ", " + extra : ""})`); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message) }; }
};
const many = async (table, author, n) => { let ok = 0; for (let i = 0; i < n; i++) if ((await ins(table, author)).ok) ok++; return ok; };
const reset = () => db.exec(TABLES.map((t) => `truncate public.${t};`).join(""));

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin;");
  await db.exec(TABLES.map((t) => `create table public.${t} (id bigint generated always as identity primary key, author_id uuid not null, body text, created_at timestamptz not null default now());`).join("\n"));
});
afterAll(async () => { await db.close(); });

describe("commentaires — AVANT le correctif", () => {
  it("un auteur poste 60 commentaires de suite", async () => {
    expect(await many("post_comments", A1, 60)).toBe(60);
    await reset();
  });
});

describe("commentaires — APRÈS supabase-comment-rate-limit-fix.sql", () => {
  beforeAll(async () => { await db.exec(FIX); });

  for (const t of TABLES) {
    it(`${t} : 20 commentaires en 5 minutes passent, le 21e est refusé ; un autre auteur n'est pas affecté`, async () => {
      expect(await many(t, A1, 25)).toBe(20);
      const r = await ins(t, A1);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/Trop de commentaires/);
      expect((await ins(t, A2)).ok).toBe(true);
      await reset();
    });
  }

  it("plafond journalier : 300 commentaires espacés (hors fenêtre de 5 minutes) bloquent le suivant", async () => {
    await db.exec("insert into public.post_comments (author_id, body, created_at) select '" + A1 + "', 'old', now() - interval '2 hours' from generate_series(1, 300)");
    expect((await ins("post_comments", A1)).ok).toBe(false);
    await reset();
  });

  it("les commentaires de plus de 24 h ne comptent plus", async () => {
    await db.exec("insert into public.post_comments (author_id, body, created_at) select '" + A1 + "', 'old', now() - interval '3 days' from generate_series(1, 300)");
    expect((await ins("post_comments", A1)).ok).toBe(true);
    await reset();
  });

  it("une table inattendue est refusée ; la fonction n'est exécutable par personne en direct ; fichier rejouable", async () => {
    await db.exec("create table public.autre (id bigint generated always as identity primary key, author_id uuid, created_at timestamptz default now());");
    await db.exec("create trigger t_autre before insert on public.autre for each row execute function public.check_comment_rate_limit('autre');");
    await expect(db.exec(`insert into public.autre (author_id) values ('${A1}')`)).rejects.toThrow(/table inattendue/);
    const r = await db.query("select has_function_privilege('anon','public.check_comment_rate_limit()','execute') a");
    expect(r.rows[0].a).toBe(false);
    await db.exec(FIX); await db.exec(FIX);
  });
});
