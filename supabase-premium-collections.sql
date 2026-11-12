-- ============================================================================
-- SQL-38 — Collections privées de publications (avantage Baobab Premium, phase P2).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 10 novembre 2026. Prérequis : SQL-37 (supabase-premium-entitlements.sql : has_premium_feature)
-- et supabase-feed-posts.sql (table posts). Le fichier s'arrête avec un message clair si l'un manque.
--
-- CE QUE C'EST : un·e abonné·e Premium range des publications du fil dans des collections PRIVÉES
-- (jusqu'à 20 collections de 500 publications). Personne d'autre ne les voit, jamais.
--
-- DROITS (vérifiés ICI, côté serveur ; le client ne fait qu'afficher) :
--   - CRÉER une collection ou y AJOUTER une publication : exige has_premium_feature(moi, 'private_collections')
--     (donc un abonnement active/trialing non échu, et l'avantage actif au catalogue). Un compte gratuit qui
--     forge la requête reçoit un rejet RLS (42501).
--   - LIRE, RENOMMER, RETIRER, SUPPRIMER : toujours permis sur SES propres lignes, même après la fin de
--     l'abonnement. Résilier ne détruit jamais ce que la personne a rangé ; cela empêche seulement d'en
--     créer de nouvelles.
--   - Les publications elles-mêmes restent soumises à leurs propres règles de lecture (blocages, suppression) :
--     ranger une publication ne donne aucun accès à son contenu ; une publication supprimée disparaît des
--     collections (ON DELETE CASCADE).
--
-- LIMITES (triggers, pour qu'aucune boucle ne remplisse la base) : 20 collections par personne, 500 publications
-- par collection, nom de 1 à 40 caractères, deux collections d'une même personne ne peuvent pas porter le même nom.
--
-- DÉPLOIEMENT : sans effet visible tant que VITE_FEATURE_PREMIUM n'est pas allumé (le client masque tout).
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   select key, active from premium_entitlements where key = 'private_collections';      -- 1 ligne, active
--   select tablename, rowsecurity from pg_tables where tablename in ('post_collections','post_collection_items');
--   select polrelid::regclass::text, polname, polcmd from pg_policy
--   where polrelid in ('public.post_collections'::regclass, 'public.post_collection_items'::regclass) order by 1, 2;
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name in ('post_collections','post_collection_items') and grantee = 'anon';   -- aucune ligne
--
-- RETOUR ARRIÈRE :
--   drop table if exists public.post_collection_items;
--   drop table if exists public.post_collections;
--   drop function if exists public.enforce_collection_limits(), public.enforce_collection_item_limits();
--   delete from public.premium_entitlements where key = 'private_collections';
-- ============================================================================

do $$
begin
  if to_regprocedure('public.has_premium_feature(uuid,text)') is null then
    raise exception 'has_premium_feature() introuvable : exécuter d''abord SQL-37 (supabase-premium-entitlements.sql)';
  end if;
  if to_regclass('public.posts') is null then
    raise exception 'table posts introuvable : exécuter d''abord supabase-feed-posts.sql';
  end if;
  if to_regprocedure('public.current_profile_id()') is null then
    raise exception 'current_profile_id() introuvable';
  end if;
end $$;

insert into public.premium_entitlements (key, label)
values ('private_collections', 'Collections privées de publications')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.post_collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.post_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.post_collections(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (collection_id, post_id)
);

create index if not exists idx_post_collections_owner on public.post_collections(owner_id);
create index if not exists idx_post_collection_items_collection on public.post_collection_items(collection_id, created_at desc);
create index if not exists idx_post_collection_items_owner_post on public.post_collection_items(owner_id, post_id);
create index if not exists idx_post_collection_items_post on public.post_collection_items(post_id);

alter table public.post_collections enable row level security;
alter table public.post_collection_items enable row level security;

-- ----------------------------------------------------------------------------
-- Policies : lecture/suppression/renommage = les siennes, toujours ; création = Premium.
-- ----------------------------------------------------------------------------
drop policy if exists "post_collections_select_own" on public.post_collections;
create policy "post_collections_select_own" on public.post_collections
  for select to authenticated using (owner_id = public.current_profile_id());

drop policy if exists "post_collections_insert_premium" on public.post_collections;
create policy "post_collections_insert_premium" on public.post_collections
  for insert to authenticated
  with check (owner_id = public.current_profile_id() and public.has_premium_feature(owner_id, 'private_collections'));

drop policy if exists "post_collections_update_own" on public.post_collections;
create policy "post_collections_update_own" on public.post_collections
  for update to authenticated
  using (owner_id = public.current_profile_id())
  with check (owner_id = public.current_profile_id());

drop policy if exists "post_collections_delete_own" on public.post_collections;
create policy "post_collections_delete_own" on public.post_collections
  for delete to authenticated using (owner_id = public.current_profile_id());

drop policy if exists "post_collection_items_select_own" on public.post_collection_items;
create policy "post_collection_items_select_own" on public.post_collection_items
  for select to authenticated using (owner_id = public.current_profile_id());

drop policy if exists "post_collection_items_insert_premium" on public.post_collection_items;
create policy "post_collection_items_insert_premium" on public.post_collection_items
  for insert to authenticated
  with check (
    owner_id = public.current_profile_id()
    and public.has_premium_feature(owner_id, 'private_collections')
    and exists (select 1 from public.post_collections c where c.id = collection_id and c.owner_id = public.current_profile_id())
  );

drop policy if exists "post_collection_items_delete_own" on public.post_collection_items;
create policy "post_collection_items_delete_own" on public.post_collection_items
  for delete to authenticated using (owner_id = public.current_profile_id());

-- Pas de UPDATE sur les items : on retire et on remet. Pas de privilège pour anon.
revoke all on public.post_collections, public.post_collection_items from anon;
revoke all on public.post_collections, public.post_collection_items from authenticated;
grant select, insert, delete on public.post_collections, public.post_collection_items to authenticated;
grant update (name) on public.post_collections to authenticated;

-- ----------------------------------------------------------------------------
-- Limites
-- ----------------------------------------------------------------------------
create or replace function public.enforce_collection_limits()
returns trigger language plpgsql set search_path = public as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' and (select count(*) from public.post_collections where owner_id = new.owner_id) >= 20 then
    raise exception 'COLLECTION_LIMIT: 20 collections au maximum.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_collection_limits on public.post_collections;
create trigger trg_enforce_collection_limits
  before insert or update of name on public.post_collections
  for each row execute function public.enforce_collection_limits();

create or replace function public.enforce_collection_item_limits()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.post_collection_items where collection_id = new.collection_id) >= 500 then
    raise exception 'COLLECTION_ITEM_LIMIT: 500 publications au maximum par collection.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_collection_item_limits on public.post_collection_items;
create trigger trg_enforce_collection_item_limits
  before insert on public.post_collection_items
  for each row execute function public.enforce_collection_item_limits();
