// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// Validation de supabase-premium-collections.sql (SQL-38) sur un SCHÉMA FACTICE (PGlite : PostgreSQL en
// WebAssembly), SQL-37 chargé pour de vrai juste avant. Honnêteté : ce n'est pas la base Supabase ;
// is_premium() est recopiée de supabase-premium.sql, current_profile_id() et is_admin_or_above() sont des
// interrupteurs de test. Les rôles `anon` / `authenticated` sont réels : les policies et privilèges sont joués.

const SQL37 = fs.readFileSync(path.join(process.cwd(), "supabase-premium-entitlements.sql"), "utf8");
const SQL38 = fs.readFileSync(path.join(process.cwd(), "supabase-premium-collections.sql"), "utf8");

const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const PREMIUM = id(1);
const FREE = id(2);
const OTHER = id(3);
const EXPIRING = id(4);
const POST = id(100);

const PREREQ = `
  create role anon nologin; create role authenticated nologin;
  grant usage on schema public to anon, authenticated;
  create table public.profiles (id uuid primary key);
  create table public.posts (id uuid primary key, author_id uuid, body text);
  create table public.subscriptions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references public.profiles(id),
    stripe_customer_id text not null default 'cus',
    plan text, status text not null, current_period_end timestamptz,
    cancel_at_period_end boolean not null default false,
    created_at timestamptz default now(), updated_at timestamptz default now()
  );
  create or replace function public.is_premium(p_profile_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select exists (select 1 from subscriptions where profile_id = p_profile_id and status in ('active','trialing')
      and (current_period_end is null or current_period_end > now()));
  $$;
  create or replace function public.is_admin_or_above() returns boolean language sql stable as $$ select false $$;
  create or replace function public.current_profile_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
`;

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(PREREQ);
  await db.exec(`
    insert into public.profiles values ('${PREMIUM}'),('${FREE}'),('${OTHER}'),('${EXPIRING}');
    insert into public.posts values ('${POST}', '${OTHER}', 'Bonjour');
    insert into public.subscriptions (profile_id, plan, status, current_period_end) values
      ('${PREMIUM}', 'monthly', 'active', now() + interval '10 days'),
      ('${OTHER}', 'monthly', 'active', now() + interval '10 days'),
      ('${EXPIRING}', 'monthly', 'active', now() + interval '10 days');
  `);
  await db.exec(SQL37);
  await db.exec(SQL38);
});
afterAll(async () => { await db.close(); });

// Exécute `fn` en tant que compte connecté `uid` (rôle authenticated), puis rétablit le rôle.
async function as(uid, fn) {
  await db.exec(`select set_config('test.uid', '${uid}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role; select set_config('test.uid', '', false);"); }
}
const insertCollection = (owner, name) => db.query("insert into public.post_collections (owner_id, name) values ($1, $2) returning id", [owner, name]);

describe("SQL-38 — prérequis", () => {
  it("s'arrête avec un message clair si SQL-37 n'est pas passé", async () => {
    const empty = new PGlite();
    await empty.exec("create function public.current_profile_id() returns uuid language sql as $$ select null::uuid $$; create table public.posts (id uuid primary key);");
    await expect(empty.exec(SQL38)).rejects.toThrow(/has_premium_feature\(\) introuvable/);
    await empty.close();
  });

  it("ajoute l'avantage au catalogue", async () => {
    const { rows } = await db.query("select active from public.premium_entitlements where key = 'private_collections'");
    expect(rows).toEqual([{ active: true }]);
  });
});

describe("création : réservée à Premium, vérifiée côté serveur", () => {
  it("un compte Premium crée une collection et y range une publication", async () => {
    await as(PREMIUM, async () => {
      const { rows } = await insertCollection(PREMIUM, "  À relire  ");
      const cid = rows[0].id;
      const saved = await db.query("select name from public.post_collections where id = $1", [cid]);
      expect(saved.rows[0].name).toBe("À relire"); // nom rogné par le trigger
      await db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [cid, POST, PREMIUM]);
      expect((await db.query("select count(*)::int as n from public.post_collection_items")).rows[0].n).toBe(1);
    });
  });

  it("un compte gratuit qui forge la requête est refusé (collection et publication)", async () => {
    await as(FREE, async () => {
      await expect(insertCollection(FREE, "Pirate")).rejects.toThrow(/row-level security/i);
    });
    // Même en visant la collection d'un·e abonné·e avec son propre owner_id : refusé.
    const target = (await db.query("select id from public.post_collections limit 1")).rows[0].id;
    await as(FREE, async () => {
      await expect(db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [target, POST, FREE])).rejects.toThrow(/row-level security/i);
    });
  });

  it("un compte Premium ne peut ni créer au nom d'un autre, ni ranger dans la collection d'un autre", async () => {
    await as(PREMIUM, async () => {
      await expect(insertCollection(OTHER, "Au nom d'un autre")).rejects.toThrow(/row-level security/i);
    });
    const otherCid = await as(OTHER, async () => (await insertCollection(OTHER, "À moi")).rows[0].id);
    await as(PREMIUM, async () => {
      await expect(db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [otherCid, POST, PREMIUM])).rejects.toThrow(/row-level security/i);
      await expect(db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [otherCid, POST, OTHER])).rejects.toThrow(/row-level security/i);
    });
  });

  it("l'avantage désactivé au catalogue coupe aussi la création", async () => {
    await db.exec("update public.premium_entitlements set active = false where key = 'private_collections'");
    await as(PREMIUM, async () => {
      await expect(insertCollection(PREMIUM, "Interdite pour l'instant")).rejects.toThrow(/row-level security/i);
    });
    await db.exec("update public.premium_entitlements set active = true where key = 'private_collections'");
  });
});

describe("confidentialité", () => {
  it("personne d'autre ne voit mes collections ni mes publications rangées", async () => {
    await as(FREE, async () => {
      expect((await db.query("select count(*)::int as n from public.post_collections")).rows[0].n).toBe(0);
      expect((await db.query("select count(*)::int as n from public.post_collection_items")).rows[0].n).toBe(0);
    });
    await as(OTHER, async () => {
      // OTHER voit sa propre collection « À moi » seulement, pas celle de PREMIUM.
      const { rows } = await db.query("select name from public.post_collections order by name");
      expect(rows).toEqual([{ name: "À moi" }]);
    });
  });

  it("un visiteur anonyme n'a aucun privilège", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from public.post_collections")).rejects.toThrow(/permission denied/i);
      await expect(db.query("select * from public.post_collection_items")).rejects.toThrow(/permission denied/i);
    } finally { await db.exec("reset role"); }
  });

  it("on ne peut changer que le nom d'une collection, pas son propriétaire", async () => {
    await as(PREMIUM, async () => {
      await db.query("update public.post_collections set name = 'Renommée' where owner_id = $1", [PREMIUM]);
      expect((await db.query("select name from public.post_collections where owner_id = $1", [PREMIUM])).rows[0].name).toBe("Renommée");
      await expect(db.query("update public.post_collections set owner_id = $1 where owner_id = $2", [OTHER, PREMIUM])).rejects.toThrow(/permission denied/i);
    });
  });
});

describe("résiliation : on garde ce qu'on a rangé, on n'en crée plus", () => {
  it("après expiration : lecture, retrait et suppression permis ; création refusée", async () => {
    const cid = await as(EXPIRING, async () => {
      const c = (await insertCollection(EXPIRING, "Avant la fin")).rows[0].id;
      await db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [c, POST, EXPIRING]);
      return c;
    });
    await db.exec(`update public.subscriptions set status = 'canceled' where profile_id = '${EXPIRING}'`);
    await as(EXPIRING, async () => {
      expect((await db.query("select count(*)::int as n from public.post_collection_items")).rows[0].n).toBe(1);
      await expect(insertCollection(EXPIRING, "Après la fin")).rejects.toThrow(/row-level security/i);
      await db.query("delete from public.post_collection_items where collection_id = $1", [cid]);
      await db.query("delete from public.post_collections where id = $1", [cid]);
      expect((await db.query("select count(*)::int as n from public.post_collections")).rows[0].n).toBe(0);
    });
  });
});

describe("limites et intégrité", () => {
  it("refuse un nom vide, un doublon et la 21e collection", async () => {
    await db.exec(`select set_config('test.uid', '${PREMIUM}', false); set role authenticated;`);
    try {
      await expect(insertCollection(PREMIUM, "   ")).rejects.toThrow(/check/i);
      await expect(insertCollection(PREMIUM, "Renommée")).rejects.toThrow(/unique|duplicate/i);
      await expect(insertCollection(PREMIUM, "x".repeat(41))).rejects.toThrow(/check/i);
      const existing = (await db.query("select count(*)::int as n from public.post_collections")).rows[0].n;
      for (let i = existing; i < 20; i += 1) await insertCollection(PREMIUM, `Collection ${i}`);
      await expect(insertCollection(PREMIUM, "La de trop")).rejects.toThrow(/COLLECTION_LIMIT/);
    } finally { await db.exec("reset role; select set_config('test.uid', '', false);"); }
  });

  it("refuse la 501e publication d'une collection", async () => {
    const cid = (await db.query("select id from public.post_collections where owner_id = $1 limit 1", [PREMIUM])).rows[0].id;
    await db.exec(`
      insert into public.posts select gen_random_uuid(), '${OTHER}', 'p' from generate_series(1, 500);
      insert into public.post_collection_items (collection_id, post_id, owner_id)
        select '${cid}', id, '${PREMIUM}' from public.posts where id <> '${POST}' limit 499;
    `);
    // 499 + la publication déjà rangée éventuellement : on complète exactement à 500.
    const n = (await db.query("select count(*)::int as n from public.post_collection_items where collection_id = $1", [cid])).rows[0].n;
    for (let i = n; i < 500; i += 1) {
      await db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) select $1, id, $2 from public.posts p where not exists (select 1 from public.post_collection_items i where i.collection_id = $1 and i.post_id = p.id) limit 1", [cid, PREMIUM]);
    }
    await as(PREMIUM, async () => {
      const extra = id(999);
      await db.exec(`reset role; insert into public.posts values ('${extra}', '${OTHER}', 'dernier'); set role authenticated;`);
      await expect(db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [cid, extra, PREMIUM])).rejects.toThrow(/COLLECTION_ITEM_LIMIT/);
    });
  });

  it("supprimer une publication la retire de toutes les collections", async () => {
    const victim = id(777);
    await db.exec(`insert into public.posts values ('${victim}', '${OTHER}', 'à supprimer')`);
    const cid = (await db.query("select id from public.post_collections where owner_id = $1 order by name limit 1 offset 3", [PREMIUM])).rows[0].id;
    await db.query("insert into public.post_collection_items (collection_id, post_id, owner_id) values ($1, $2, $3)", [cid, victim, PREMIUM]);
    await db.exec(`delete from public.posts where id = '${victim}'`);
    expect((await db.query("select count(*)::int as n from public.post_collection_items where post_id = $1", [victim])).rows[0].n).toBe(0);
  });
});
