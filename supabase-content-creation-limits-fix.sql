-- ============================================================================
-- CORRECTIF — deux failles trouvées en poursuivant l'angle "policy trop
-- permissive au niveau colonne" côté INSERT cette fois (déjà fait côté
-- UPDATE dans supabase-profile-trust-columns-protect-fix.sql et
-- supabase-event-media-columns-protect-fix.sql), et l'angle "création de
-- lignes en nombre illimité, non couverte par le rate-limit global"
-- (supabase-global-action-rate-limit-fix.sql ne compte que messages/likes/
-- follows/reports/event_invitations).
--
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-communities.sql, supabase-communities-2.sql, supabase-events.sql,
-- supabase-events-v2.sql, supabase-stories.sql, supabase-feed-posts.sql et
-- supabase-global-action-rate-limit-fix.sql (les tables/fonctions qu'il
-- patche doivent déjà exister). Additif et idempotent (create or replace +
-- drop/create policy/trigger).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTIE 1 — community_join_requests : la policy INSERT ("Demander a
-- rejoindre une communaute privee en son propre nom", supabase-
-- communities.sql) vérifie seulement "profile_id = current_profile_id()" et
-- la visibilité de la communauté visée — elle ne dit RIEN sur "status",
-- "decided_at" ni "decided_by", alors que la table définit
-- "status default 'pending'" en s'attendant à ce que seul accept_join_request/
-- reject_join_request (RPC SECURITY DEFINER, staff uniquement) la fasse
-- passer à 'accepted'/'rejected'.
--
-- Un simple insert direct via l'API PostgREST peut donc aujourd'hui écrire :
--   insert into community_join_requests (community_id, profile_id, status, decided_at, decided_by)
--   values (<communaute privee ciblee>, <soi-meme>, 'accepted', now(), <n'importe quel profil, y compris un owner reel>);
-- ce qui n'accorde heureusement PAS l'adhésion réelle (community_members
-- n'est modifiée que par les RPC), mais :
--   1) forge un faux enregistrement "accepté par <owner choisi arbitrairement>"
--      dans une table que ce même owner peut consulter (policy SELECT
--      "profile_id = current_profile_id() or is_community_staff(...)") —
--      usurpation d'une décision jamais prise ;
--   2) contourne l'index unique partiel "un seul PENDING a la fois" (qui ne
--      s'applique qu'a status='pending') : rien n'empêche d'insérer un
--      nombre illimité de lignes 'accepted'/'rejected' vers la même
--      communauté, et le trigger trg_notify_join_request (AFTER INSERT,
--      sans condition sur status) notifie TOUT le staff de la communauté à
--      chaque insertion — spam de notifications non couvert par le
--      rate-limit global (qui ne compte pas cette table).
--
-- Correctif : la policy n'autorise plus que la création d'une demande dans
-- l'état initial exact prévu par le produit ; le passage à accepted/rejected
-- reste exclusivement du ressort des RPC (qui, elles, écrivent en tant que
-- SECURITY DEFINER et ne sont donc pas soumises à cette policy INSERT).
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname='public' and tablename='community_join_requests' and cmd='INSERT'
  loop
    execute format('drop policy %I on public.community_join_requests', pol.policyname);
  end loop;

  create policy "Demander a rejoindre une communaute privee en son propre nom"
  on community_join_requests for insert
  with check (
    profile_id = current_profile_id()
    and status = 'pending'
    and decided_at is null
    and decided_by is null
    and exists (select 1 from communities c where c.id = community_id and c.visibility = 'private')
  );
end $$;

-- ----------------------------------------------------------------------------
-- PARTIE 2 — création de contenu en nombre illimité. Aucune des tables
-- ci-dessous n'a de contrainte de débit : un compte peut aujourd'hui créer
-- des centaines de communautés/événements/statuts/publications par minute
-- via un script, chacun visible publiquement (ou notifiant d'autres
-- membres), sans jamais toucher aux compteurs déjà audités (messages,
-- likes, follows, reports, invitations d'événement). Plafonds généreux
-- (aucun usage humain normal ne les approche) posés en trigger BEFORE
-- INSERT — donc valables que la création passe par une RPC SECURITY
-- DEFINER (create_community, create_event) ou par un insert direct
-- (stories, posts, community_posts).
-- ----------------------------------------------------------------------------

create or replace function check_community_creation_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from communities
    where created_by = new.created_by and created_at > now() - interval '24 hours';
  if v_count >= 5 then
    raise exception 'Trop de communautes creees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_community_creation_rate_limit on communities;
create trigger trg_community_creation_rate_limit before insert on communities
for each row execute function check_community_creation_rate_limit();

create or replace function check_event_creation_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from events
    where created_by = new.created_by and created_at > now() - interval '24 hours';
  if v_count >= 10 then
    raise exception 'Trop d evenements crees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_event_creation_rate_limit on events;
create trigger trg_event_creation_rate_limit before insert on events
for each row execute function check_event_creation_rate_limit();

create or replace function check_story_creation_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from stories
    where profile_id = new.profile_id and created_at > now() - interval '24 hours';
  if v_count >= 30 then
    raise exception 'Trop de statuts crees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_story_creation_rate_limit on stories;
create trigger trg_story_creation_rate_limit before insert on stories
for each row execute function check_story_creation_rate_limit();

create or replace function check_post_creation_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from posts
    where author_id = new.author_id and created_at > now() - interval '24 hours';
  if v_count >= 50 then
    raise exception 'Trop de publications creees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_post_creation_rate_limit on posts;
create trigger trg_post_creation_rate_limit before insert on posts
for each row execute function check_post_creation_rate_limit();

create or replace function check_community_post_creation_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from community_posts
    where author_id = new.author_id and created_at > now() - interval '24 hours';
  if v_count >= 50 then
    raise exception 'Trop de publications creees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_community_post_creation_rate_limit on community_posts;
create trigger trg_community_post_creation_rate_limit before insert on community_posts
for each row execute function check_community_post_creation_rate_limit();

create or replace function check_join_request_creation_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from community_join_requests
    where profile_id = new.profile_id and created_at > now() - interval '24 hours';
  if v_count >= 30 then
    raise exception 'Trop de demandes d adhesion envoyees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_join_request_creation_rate_limit on community_join_requests;
create trigger trg_join_request_creation_rate_limit before insert on community_join_requests
for each row execute function check_join_request_creation_rate_limit();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd from pg_policies where tablename = 'community_join_requests';
-- select tgname from pg_trigger where tgrelid = 'public.communities'::regclass;
-- select tgname from pg_trigger where tgrelid = 'public.events'::regclass;
-- select tgname from pg_trigger where tgrelid = 'public.stories'::regclass;
-- select tgname from pg_trigger where tgrelid = 'public.posts'::regclass;
-- select tgname from pg_trigger where tgrelid = 'public.community_posts'::regclass;
-- select tgname from pg_trigger where tgrelid = 'public.community_join_requests'::regclass;
-- ============================================================================
