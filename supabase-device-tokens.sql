-- ============================================================================
-- BAOBAB — Jetons de notification push des applications natives (étape 3a)
-- Android : jeton FCM ; iOS : jeton APNs (voir MOBILE.md, « Étape 3a »).
--
-- À exécuter MANUELLEMENT par le propriétaire (éditeur SQL Supabase). Ce
-- fichier est idempotent (re-exécutable sans effet) et NE MODIFIE aucune table
-- existante : le Web Push (table push_subscriptions) est inchangé.
--
-- Tant que ce fichier n'est pas exécuté, l'application fonctionne : le client
-- journalise l'échec de l'enregistrement du jeton dans la console et continue
-- (aucune erreur affichée), et l'Edge Function send-push ignore silencieusement
-- l'absence de la table.
--
-- Prérequis : aucun (auth.users existe déjà).
-- ============================================================================

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('android', 'ios')),
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint device_push_tokens_token_key unique (token),
  -- Garde-fous de taille : un jeton FCM fait ~160 caractères, un jeton APNs 64
  -- caractères hexadécimaux ; 4096 est très large mais empêche tout abus.
  constraint device_push_tokens_token_length check (char_length(token) between 16 and 4096),
  constraint device_push_tokens_app_version_length check (app_version is null or char_length(app_version) <= 64)
);

create index if not exists device_push_tokens_user_id_idx on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

drop policy if exists "device_push_tokens_select_own" on public.device_push_tokens;
create policy "device_push_tokens_select_own" on public.device_push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "device_push_tokens_insert_own" on public.device_push_tokens;
create policy "device_push_tokens_insert_own" on public.device_push_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "device_push_tokens_update_own" on public.device_push_tokens;
create policy "device_push_tokens_update_own" on public.device_push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "device_push_tokens_delete_own" on public.device_push_tokens;
create policy "device_push_tokens_delete_own" on public.device_push_tokens
  for delete using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Réassignation d'un jeton à un autre compte sur le même appareil.
--
-- Cas : le compte A se déconnecte hors-ligne (la suppression de son jeton
-- échoue), puis le compte B se connecte sur le même téléphone. Le jeton (donné
-- par le système d'exploitation, donc preuve de possession de l'appareil) existe
-- déjà, rattaché à A : une simple upsert côté client échouerait (la politique
-- RLS « update own » interdit à B de modifier la ligne de A). Cette fonction
-- security definer fait l'insertion OU la réassignation à auth.uid() — jamais
-- un doublon (unique(token)). Elle ne permet pas de lire ni de modifier autre
-- chose que cette ligne, et exige une session authentifiée.
-- Le client retombe sur l'upsert direct si cette fonction n'existe pas encore.
-- ----------------------------------------------------------------------------
create or replace function public.register_device_push_token(
  p_token text,
  p_platform text,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;

  insert into public.device_push_tokens (user_id, token, platform, app_version)
  values (auth.uid(), p_token, p_platform, left(p_app_version, 64))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        updated_at = now();
end;
$$;

revoke all on function public.register_device_push_token(text, text, text) from public;
revoke all on function public.register_device_push_token(text, text, text) from anon;
grant execute on function public.register_device_push_token(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
--   select count(*) from public.device_push_tokens;                  -- 0 au départ
--   select policyname, cmd from pg_policies where tablename = 'device_push_tokens';
--     -- 4 lignes : select, insert, update, delete (…_own)
--   select proname from pg_proc where proname = 'register_device_push_token';
--   select has_function_privilege('anon', 'public.register_device_push_token(text,text,text)', 'execute');
--     -- doit renvoyer false
-- ============================================================================
