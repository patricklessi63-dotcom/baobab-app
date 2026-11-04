// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

// ============================================================================
// Validation de supabase-message-delete-window.sql (SQL-27) sur un SCHÉMA FACTICE.
//
// HONNÊTETÉ : PGlite (PostgreSQL en WebAssembly, en mémoire). Le schéma reconstitue à la main ce que
// la production contient autour de `messages` : rôles anon/authenticated, auth.uid() lisant
// request.jwt.claim.sub, profiles, app_config (lecture par les comptes connectés), messages avec ses
// contraintes de forme, SES DEUX déclencheurs BEFORE UPDATE (définitions relevées en production le
// 04/11/2026) et les policies de participants. Ce n'est PAS la base Supabase : le test prouve que la
// syntaxe est valide et que le comportement décrit est obtenu sur ce schéma ; il ne remplace pas un
// essai sur le projet de répétition.
// ============================================================================

const SQL = fs.readFileSync(path.join(process.cwd(), "supabase-message-delete-window.sql"), "utf8");

const A = "00000000-0000-0000-0000-00000000000a"; // profil (expéditeur)
const B = "00000000-0000-0000-0000-00000000000b"; // profil (destinataire)
const C = "00000000-0000-0000-0000-00000000000c"; // profil tiers
const UA = "10000000-0000-0000-0000-00000000000a"; // auth.users
const UB = "10000000-0000-0000-0000-00000000000b";
const UC = "10000000-0000-0000-0000-00000000000c";
const KEY = `${A}__${B}`;

const BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create table public.profiles (id uuid primary key, user_id uuid unique);
  grant select on public.profiles to authenticated;
  insert into public.profiles values ('${A}', '${UA}'), ('${B}', '${UB}'), ('${C}', '${UC}');

  create table public.app_config (
    id boolean primary key default true,
    constraint app_config_singleton check (id = true),
    monetization_enabled boolean not null default false
  );
  insert into public.app_config (id) values (true);
  alter table public.app_config enable row level security;
  create policy "Lecture par les utilisateurs connectes" on public.app_config for select to authenticated using (true);
  grant select on public.app_config to authenticated;

  create table public.messages (
    id bigint generated always as identity primary key,
    match_key text not null,
    from_id uuid references public.profiles(id),
    text text,
    created_at timestamptz default now(),
    read_at timestamptz,
    kind text not null default 'text',
    media_path text,
    media_meta jsonb,
    reply_to_id bigint,
    deleted_at timestamptz,
    deleted_by uuid,
    deleted_for uuid[] not null default '{}',
    constraint messages_kind_check check (kind in ('text','image','video','audio','file','sticker','event')),
    constraint messages_kind_shape_check check (
      (kind = 'text' and text is not null and text <> '' and media_path is null)
      or (kind = 'sticker' and media_path is null and media_meta ? 'emoji')
      or (kind in ('image','video','audio','file') and media_path is not null)
      or (kind = 'event' and media_path is null and media_meta ? 'event_id')
    ),
    constraint messages_text_length_check check (text is null or char_length(text) <= 4000)
  );

  -- Déclencheur 1 (production, supabase-messages-media.sql) : seul read_at / deleted_* / deleted_for peuvent changer.
  create function public.messages_restrict_update_to_read_at() returns trigger language plpgsql as $$
  begin
    if new.text is distinct from old.text or new.from_id is distinct from old.from_id
       or new.match_key is distinct from old.match_key or new.created_at is distinct from old.created_at
       or new.kind is distinct from old.kind or new.media_path is distinct from old.media_path
       or new.media_meta is distinct from old.media_meta then
      raise exception 'Seul read_at peut etre modifie sur un message existant.';
    end if;
    return new;
  end; $$;
  create trigger messages_restrict_update before update on public.messages
    for each row execute function public.messages_restrict_update_to_read_at();

  -- Déclencheur 2 : définition d'origine relevée en production (remplacée par SQL-27).
  create function public.enforce_message_update_rules() returns trigger language plpgsql as $$
  declare my_profile_id uuid; begin select id into my_profile_id from public.profiles where user_id = auth.uid();
  if new.text is distinct from old.text or new.media_path is distinct from old.media_path or new.kind is distinct from old.kind
     or new.from_id is distinct from old.from_id or new.match_key is distinct from old.match_key
     or new.media_meta is distinct from old.media_meta or new.reply_to_id is distinct from old.reply_to_id
     or new.created_at is distinct from old.created_at then raise exception 'contenu non modifiable apres envoi'; end if;
  if (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by) and old.from_id <> my_profile_id
     then raise exception 'seul l auteur peut supprimer pour tous'; end if;
  if new.deleted_for is distinct from old.deleted_for then
     if not (old.deleted_for <@ new.deleted_for) or not (new.deleted_for <@ (old.deleted_for || my_profile_id))
     then raise exception 'deleted_for non autorise'; end if; end if; return new; end; $$;
  create trigger trg_enforce_message_update_rules before update on public.messages
    for each row execute function public.enforce_message_update_rules();

  alter table public.messages enable row level security;
  create policy messages_participant_select on public.messages for select to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.id::text = any(string_to_array(messages.match_key, '__'))));
  create policy messages_participant_update on public.messages for update to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.id::text = any(string_to_array(messages.match_key, '__'))))
    with check (true);
  grant select, update on public.messages to authenticated;
`;

let db;

async function asUser(uid, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

async function addMessage({ kind = "text", text = "Mon secret", mediaPath = null, mediaMeta = null, minutesAgo = 0 } = {}) {
  const { rows } = await db.query(
    `insert into public.messages (match_key, from_id, kind, text, media_path, media_meta, created_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, now() - ($7 || ' minutes')::interval) returning id`,
    [KEY, A, kind, kind === "text" ? text : null, mediaPath, mediaMeta ? JSON.stringify(mediaMeta) : null, String(minutesAgo)]
  );
  return rows[0].id;
}

const deleteForAll = (uid, id, extra = "") =>
  asUser(uid, () => db.query(`update public.messages set deleted_at = now(), deleted_by = '${uid === UA ? A : B}' ${extra} where id = ${id}`));

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(SQL);
});
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec(`delete from public.messages; update public.app_config set message_delete_window_minutes = 15;`);
});

describe("SQL-27 — suppression pour tout le monde : délai serveur et contenu effacé", () => {
  it("dans le délai : l'auteur supprime, le contenu d'origine disparaît de la base", async () => {
    const id = await addMessage({ text: "Mon numéro est 514-555-0199", minutesAgo: 5 });
    await deleteForAll(UA, id);
    const { rows } = await db.query("select text, deleted_at, deleted_by from public.messages where id = $1", [id]);
    expect(rows[0].text).toBe("Ce message a été supprimé.");
    expect(rows[0].deleted_at).not.toBeNull();
    expect(rows[0].deleted_by).toBe(A);
    const all = await db.query("select count(*)::int as n from public.messages where text like '%514%'");
    expect(all.rows[0].n).toBe(0);
  });

  it("l'autre participant voit immédiatement le message supprimé (même ligne, contenu neutralisé)", async () => {
    const id = await addMessage({ text: "Secret", minutesAgo: 1 });
    await deleteForAll(UA, id);
    const seen = await asUser(UB, () => db.query("select text, deleted_at from public.messages where id = $1", [id]));
    expect(seen.rows[0].text).toBe("Ce message a été supprimé.");
    expect(seen.rows[0].deleted_at).not.toBeNull();
  });

  it("après le délai (15 min par défaut) : refusé, le contenu reste intact", async () => {
    const id = await addMessage({ text: "Trop tard", minutesAgo: 20 });
    await expect(deleteForAll(UA, id)).rejects.toThrow(/délai pour supprimer/);
    const { rows } = await db.query("select text, deleted_at from public.messages where id = $1", [id]);
    expect(rows[0]).toMatchObject({ text: "Trop tard", deleted_at: null });
  });

  it("le délai est configurable côté serveur (effet immédiat)", async () => {
    const id = await addMessage({ minutesAgo: 20 });
    await db.exec("update public.app_config set message_delete_window_minutes = 60");
    await expect(deleteForAll(UA, id)).resolves.toBeDefined();
    const id2 = await addMessage({ minutesAgo: 5 });
    await db.exec("update public.app_config set message_delete_window_minutes = 2");
    await expect(deleteForAll(UA, id2)).rejects.toThrow(/délai pour supprimer/);
  });

  it("refuse un délai hors bornes (1 à 10080 minutes)", async () => {
    await expect(db.exec("update public.app_config set message_delete_window_minutes = 0")).rejects.toThrow();
    await expect(db.exec("update public.app_config set message_delete_window_minutes = 100000")).rejects.toThrow();
  });

  it("le destinataire ne peut pas supprimer le message de l'autre pour tous", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await expect(deleteForAll(UB, id)).rejects.toThrow(/seul l auteur/);
    const { rows } = await db.query("select deleted_at from public.messages where id = $1", [id]);
    expect(rows[0].deleted_at).toBeNull();
  });

  it("un tiers hors conversation ne peut ni lire ni modifier (RLS)", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await asUser(UC, () => db.query(`update public.messages set deleted_at = now(), deleted_by = '${C}' where id = ${id}`));
    const { rows } = await db.query("select deleted_at from public.messages where id = $1", [id]);
    expect(rows[0].deleted_at).toBeNull();
  });

  it("l'heure et l'identité envoyées par le client sont ignorées (valeurs posées par le serveur)", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await asUser(UA, () => db.query(`update public.messages set deleted_at = '2000-01-01', deleted_by = '${B}' where id = ${id}`));
    const { rows } = await db.query("select deleted_at, deleted_by, (now() - deleted_at) < interval '1 minute' as recent from public.messages where id = $1", [id]);
    expect(rows[0].recent).toBe(true);
    expect(rows[0].deleted_by).toBe(A);
  });

  it("idempotent : une seconde demande ne change rien et ne lève aucune erreur", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await deleteForAll(UA, id);
    const first = await db.query("select deleted_at from public.messages where id = $1", [id]);
    await expect(deleteForAll(UA, id)).resolves.toBeDefined();
    const second = await db.query("select deleted_at, text from public.messages where id = $1", [id]);
    expect(second.rows[0].deleted_at).toEqual(first.rows[0].deleted_at);
    expect(second.rows[0].text).toBe("Ce message a été supprimé.");
  });

  it("une suppression ne peut pas être annulée", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await deleteForAll(UA, id);
    await expect(asUser(UA, () => db.query(`update public.messages set deleted_at = null, deleted_by = null where id = ${id}`))).rejects.toThrow(/annulee/);
  });

  it("deleted_by ne se définit pas seul", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await expect(asUser(UA, () => db.query(`update public.messages set deleted_by = '${A}' where id = ${id}`))).rejects.toThrow(/deleted_by/);
  });

  it("le contenu ne peut toujours pas être modifié directement par l'API", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await expect(asUser(UA, () => db.query(`update public.messages set text = 'falsifié' where id = ${id}`))).rejects.toThrow();
    await expect(asUser(UA, () => db.query(`update public.messages set created_at = now() where id = ${id}`))).rejects.toThrow();
  });

  it("pièce jointe : la référence et les métadonnées sont neutralisées, les contraintes restent satisfaites", async () => {
    const id = await addMessage({ kind: "image", mediaPath: `${KEY}/photo.jpg`, mediaMeta: { original_name: "mon-passeport.jpg", size: 123 }, minutesAgo: 1 });
    await deleteForAll(UA, id);
    const { rows } = await db.query("select kind, text, media_path, media_meta from public.messages where id = $1", [id]);
    expect(rows[0].kind).toBe("image");
    expect(rows[0].media_path).toBe("deleted");
    expect(rows[0].media_meta).toEqual({});
    expect(rows[0].text).toBeNull();
  });

  it("sticker et carte d'événement : contenu neutralisé, forme valide conservée", async () => {
    const s = await addMessage({ kind: "sticker", mediaMeta: { emoji: "😍" }, minutesAgo: 1 });
    const e = await addMessage({ kind: "event", mediaMeta: { event_id: "abc" }, minutesAgo: 1 });
    await deleteForAll(UA, s);
    await deleteForAll(UA, e);
    const { rows } = await db.query("select id, media_meta from public.messages where id in ($1, $2) order by id", [s, e]);
    expect(rows[0].media_meta).toEqual({ emoji: "🚫" });
    expect(rows[1].media_meta).toEqual({ event_id: null });
  });

  it("« supprimer pour moi » reste possible pour chacun, jamais pour un autre", async () => {
    const id = await addMessage({ minutesAgo: 1 });
    await asUser(UB, () => db.query(`update public.messages set deleted_for = array['${B}']::uuid[] where id = ${id}`));
    let { rows } = await db.query("select deleted_for, deleted_at, text from public.messages where id = $1", [id]);
    expect(rows[0].deleted_for).toEqual([B]);
    expect(rows[0].deleted_at).toBeNull();
    expect(rows[0].text).toBe("Mon secret");
    await expect(asUser(UB, () => db.query(`update public.messages set deleted_for = array['${B}','${A}']::uuid[] where id = ${id}`))).rejects.toThrow(/deleted_for/);
  });

  it("hors compte connecté (service / modération SQL) : suppression possible sans le délai, contenu neutralisé", async () => {
    const id = await addMessage({ text: "Contenu abusif", minutesAgo: 600 });
    await db.query(`update public.messages set deleted_at = now(), deleted_by = '${C}' where id = ${id}`);
    const { rows } = await db.query("select text, deleted_by from public.messages where id = $1", [id]);
    expect(rows[0].text).toBe("Ce message a été supprimé.");
    expect(rows[0].deleted_by).toBe(C);
  });

  it("le fichier SQL documente le paramètre de délai et le retour arrière", () => {
    expect(SQL).toMatch(/message_delete_window_minutes/);
    expect(SQL).toMatch(/RETOUR ARRIÈRE/);
    expect(SQL).toMatch(/LIVRÉ, NON EXÉCUTÉ/);
  });
});
