-- ============================================================================
-- CORRECTIF — régressions silencieuses introduites par l'ORDRE de concaténation
-- de supabase-COMBINED-pending-fixes.sql (script exécuté en prod le 2026-09-09).
--
-- CONSTAT (audit de vérification post-déploiement, 2026-09-09, soir) :
-- l'en-tête du script consolidé (point 4) affirme que le DDL actif des trois
-- sections SUPERSEDED (supabase-block-bypass-fix.sql,
-- supabase-report-rate-limit-fix.sql, supabase-events-duration-guard.sql)
-- « a été retiré ou neutralisé ». CE N'EST PAS LE CAS dans le fichier
-- réellement exécuté : les trois sections contiennent encore leur DDL
-- d'origine, concaténé APRÈS les versions plus récentes des mêmes objets, et
-- gagnent donc en dernier. Résultat après exécution du script consolidé tel
-- quel :
--
--   1. Policies INSERT de likes / follows / favorites / event_invitations :
--      la section « SOURCE : supabase-block-bypass-fix.sql » (lignes ~4206+)
--      les redéfinit une dernière fois avec la SEULE condition de blocage,
--      effaçant les gardes banni/suspendu + onboarding incomplet +
--      suppression en attente posées juste avant par la section
--      supabase-target-account-state-guards-CONSOLIDATED-fix.sql.
--      -> un compte banni/suspendu, un profil n'ayant jamais terminé son
--         onboarding, ou un compte en attente de suppression peut de nouveau
--         liker / suivre / mettre en favori / inviter à un événement par
--         appel direct à l'API PostgREST. ("messages" n'est PAS touché par
--         block-bypass et conserve ses 4 gardes — seule table intacte.)
--
--   2. check_report_rate_limit() : la section « SOURCE :
--      supabase-report-rate-limit-fix.sql » (lignes ~4350+) la redéfinit une
--      dernière fois SANS l'appel à global_recent_action_count(), effaçant le
--      garde-fou transversal (40 actions / 60 s toutes tables confondues)
--      ajouté par supabase-global-action-rate-limit-fix.sql.
--      -> un script en boucle qui alterne les TYPES d'action pour rester sous
--         chaque limite individuelle n'est plus freiné sur le volet
--         "reports". (Les 4 autres triggers — message/follow/like/
--         event_invite — ne sont définis qu'une fois et gardent le garde
--         global.)
--
--   3. create_event() : la section « SOURCE :
--      supabase-events-duration-guard.sql » (lignes ~3632+) la redéfinit une
--      dernière fois SANS la garde d'authentification explicite
--      (current_profile_id() is null) ajoutée par
--      supabase-create-community-event-authz-fix.sql.
--      -> impact limité (un appel anonyme échoue de toute façon plus loin sur
--         une contrainte NOT NULL, sans ligne orpheline), mais message
--         d'erreur brut au lieu du rejet propre attendu.
--
-- CE FICHIER redéfinit une bonne fois pour toutes, dans le bon ordre final,
-- les objets clobérés — versions AUTHORITAIRES reprises verbatim des sections
-- correspondantes du script consolidé. Idempotent (drop + create /
-- create or replace). AUCUN risque de régression pour un compte en règle,
-- non bloqué et authentifié. Additif uniquement.
--
-- À EXÉCUTER PAR PATRICK dans Supabase SQL Editor, EN UNE FOIS, APRÈS le
-- script consolidé (il corrige l'état final laissé par celui-ci).
--
-- NOTE : ne PAS ré-exécuter les fichiers sources séparés — ils sont déjà
-- "consommés" par le script consolidé. Ce fichier suffit.
-- ============================================================================


-- ============================================================================
-- PARTIE 1 — Policies INSERT : likes / follows / favorites / messages /
-- event_invitations avec les 4 gardes cumulés (blocage + banni/suspendu +
-- onboarding incomplet + suppression en attente).
-- Repris verbatim de la section
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "likes"
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'likes' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.likes', pol.policyname);
  end loop;

  create policy "Un utilisateur like en son propre nom"
  on likes for insert
  with check (
    auth.uid() = (select user_id from profiles where id = likes.from_id)
    and likes.from_id <> likes.to_id
    and not exists (
      select 1 from blocks
      where (blocks.from_id = likes.from_id and blocks.to_id = likes.to_id)
         or (blocks.from_id = likes.to_id and blocks.to_id = likes.from_id)
    )
    and not exists (
      select 1 from profiles p
      where p.id in (likes.from_id, likes.to_id)
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id in (likes.from_id, likes.to_id)
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id in (likes.from_id, likes.to_id)
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "follows"
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'follows' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.follows', pol.policyname);
  end loop;

  create policy "Un utilisateur s'abonne en son propre nom"
  on follows for insert
  with check (
    current_profile_id() = follows.from_id
    and follows.from_id <> follows.to_id
    and not exists (
      select 1 from blocks
      where (blocks.from_id = follows.from_id and blocks.to_id = follows.to_id)
         or (blocks.from_id = follows.to_id and blocks.to_id = follows.from_id)
    )
    and not exists (
      select 1 from profiles p
      where p.id in (follows.from_id, follows.to_id)
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id in (follows.from_id, follows.to_id)
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id in (follows.from_id, follows.to_id)
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. "favorites"
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'favorites' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.favorites', pol.policyname);
  end loop;

  create policy "Un utilisateur ajoute ses propres favoris"
  on favorites for insert
  with check (
    auth.uid() = (select user_id from profiles where id = favorites.from_id)
    and not exists (
      select 1 from blocks
      where (blocks.from_id = favorites.from_id and blocks.to_id = favorites.to_id)
         or (blocks.from_id = favorites.to_id and blocks.to_id = favorites.from_id)
    )
    and not exists (
      select 1 from profiles p
      where p.id in (favorites.from_id, favorites.to_id)
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id in (favorites.from_id, favorites.to_id)
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id in (favorites.from_id, favorites.to_id)
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "messages" — restate complet (identique à l'état laissé par le script
-- consolidé ; inclus ici uniquement pour garantir un jeu de conditions
-- cohérent si ce fichier est joué seul).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'messages' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.messages', pol.policyname);
  end loop;

  create policy "Un utilisateur envoie seulement dans une conversation matchee"
  on messages for insert
  with check (
    auth.uid() = (select user_id from profiles where id = messages.from_id)
    and array_length(string_to_array(messages.match_key, '__'), 1) = 2
    and (select id from profiles where user_id = auth.uid())::text
      = any (string_to_array(messages.match_key, '__'))
    and exists (
      select 1
      from unnest(string_to_array(messages.match_key, '__')) as other_id
      where other_id::uuid <> messages.from_id
        and exists (select 1 from likes where from_id = messages.from_id and to_id = other_id::uuid)
        and exists (select 1 from likes where from_id = other_id::uuid and to_id = messages.from_id)
        and not exists (
          select 1 from blocks
          where (blocks.from_id = messages.from_id and blocks.to_id = other_id::uuid)
             or (blocks.from_id = other_id::uuid and blocks.to_id = messages.from_id)
        )
        and not exists (
          select 1 from profiles p
          where p.id in (messages.from_id, other_id::uuid)
            and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
        )
        and not exists (
          select 1 from profiles p
          where p.id in (messages.from_id, other_id::uuid)
            and p.onboarding_completed_at is null
        )
        and not exists (
          select 1 from profiles p
          where p.id in (messages.from_id, other_id::uuid)
            and p.deletion_requested_at is not null
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 5. "event_invitations"
-- ----------------------------------------------------------------------------
drop policy if exists "Inviter en son propre nom si participant et connexion reelle" on event_invitations;
create policy "Inviter en son propre nom si participant et connexion reelle"
on event_invitations for insert
with check (
  invited_by = current_profile_id()
  and not exists (select 1 from events e where e.id = event_id and e.canceled_at is not null)
  and (is_event_participant(event_id) or is_event_mod(event_id))
  and not exists (
    select 1 from blocks
    where (blocks.from_id = current_profile_id() and blocks.to_id = invited_profile_id)
       or (blocks.from_id = invited_profile_id and blocks.to_id = current_profile_id())
  )
  and not exists (
    select 1 from profiles p
    where p.id in (current_profile_id(), invited_profile_id)
      and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
  )
  and not exists (
    select 1 from profiles p
    where p.id in (current_profile_id(), invited_profile_id)
      and p.onboarding_completed_at is null
  )
  and not exists (
    select 1 from profiles p
    where p.id in (current_profile_id(), invited_profile_id)
      and p.deletion_requested_at is not null
  )
  and (
    (
      exists (select 1 from likes where from_id = current_profile_id() and to_id = invited_profile_id)
      and exists (select 1 from likes where from_id = invited_profile_id and to_id = current_profile_id())
    )
    or (
      (select community_id from events where id = event_id) is not null
      and is_community_member((select community_id from events where id = event_id))
    )
  )
);


-- ============================================================================
-- PARTIE 2 — check_report_rate_limit() : réintègre le garde-fou transversal
-- global_recent_action_count(...) >= 40. global_recent_action_count() est
-- déjà défini par le script consolidé (section
-- supabase-global-action-rate-limit-fix.sql) ; on le laisse tel quel et on
-- ne redéfinit QUE le trigger "reports".
-- Repris verbatim de cette même section.
-- ============================================================================

create or replace function check_report_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from reports
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 20 then
    raise exception 'Trop de signalements envoyes recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_report_rate_limit on reports;
create trigger trg_report_rate_limit before insert on reports
for each row execute function check_report_rate_limit();


-- ============================================================================
-- PARTIE 3 — create_event() : réintègre la garde d'authentification explicite
-- en tête de fonction. Repris verbatim de la section
-- supabase-create-community-event-authz-fix.sql.
-- (create_community() n'est PAS touché : aucune section postérieure du script
-- consolidé ne le redéfinit, il conserve déjà sa garde d'auth.)
-- ============================================================================

create or replace function create_event(
  p_title text, p_description text, p_category text, p_cover_url text,
  p_event_date timestamptz, p_duration_minutes integer,
  p_city text, p_location text, p_max_participants integer,
  p_visibility text, p_community_id uuid, p_timezone text default null
)
returns events
language plpgsql security definer set search_path = public
as $$
declare v_event events;
begin
  if current_profile_id() is null then
    raise exception 'Non authentifie';
  end if;
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'Le titre est requis';
  end if;
  if p_city is null or char_length(trim(p_city)) = 0 then
    raise exception 'La ville est requise';
  end if;
  if p_event_date is null or p_event_date <= now() then
    raise exception 'La date doit etre dans le futur';
  end if;
  if p_duration_minutes is not null and p_duration_minutes <= 0 then
    raise exception 'La duree doit etre un nombre de minutes positif';
  end if;
  if p_max_participants is not null and p_max_participants <= 0 then
    raise exception 'Le nombre maximum de participants doit etre positif';
  end if;
  if coalesce(p_visibility, 'public') = 'community' and p_community_id is null then
    raise exception 'Une communaute est requise pour un evenement communautaire';
  end if;
  if p_community_id is not null and not is_community_member(p_community_id) then
    raise exception 'Tu dois etre membre de cette communaute';
  end if;

  insert into events (
    title, description, category, cover_url, event_date, duration_minutes,
    city, location, max_participants, visibility, community_id, created_by, timezone
  )
  values (
    trim(p_title), p_description, p_category, p_cover_url, p_event_date, p_duration_minutes,
    trim(p_city), nullif(trim(coalesce(p_location, '')), ''), p_max_participants,
    coalesce(p_visibility, 'public'), p_community_id, current_profile_id(), p_timezone
  )
  returning * into v_event;

  insert into event_staff (event_id, profile_id, role) values (v_event.id, current_profile_id(), 'organizer');
  insert into event_attendees (event_id, profile_id, status) values (v_event.id, current_profile_id(), 'going');

  return v_event;
end;
$$;


-- ============================================================================
-- Vérification (facultatif, à exécuter séparément après) :
--
-- 1. Les 5 policies INSERT doivent contenir blocks + banned_at +
--    onboarding_completed_at + deletion_requested_at :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid)
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('likes','follows','favorites','messages','event_invitations')
--   and cmd = 'a';
--
-- 2. check_report_rate_limit() doit appeler global_recent_action_count :
-- select pg_get_functiondef('check_report_rate_limit'::regproc);
--
-- 3. create_event() doit tester current_profile_id() is null :
-- select pg_get_functiondef('create_event'::regproc);
-- ============================================================================
