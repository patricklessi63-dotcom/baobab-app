-- ============================================================================
-- Phase 7 — Baobab Evenements. A executer dans Supabase : SQL Editor (une fois),
-- APRES supabase-events.sql et supabase-communities.sql (deja en production).
-- ============================================================================
-- Etend le systeme d'evenements minimal existant (events/event_attendees)
-- au lieu de le remplacer : categorie, image, plafond de participants,
-- visibilite, roles d'organisation, invitations, signalements, photos,
-- discussion, rappels. Reutilise les fonctions/notifications centrales de
-- la Phase 6 (current_profile_id, is_community_member, table notifications)
-- au lieu d'en recreer une deuxieme infrastructure.

-- ----------------------------------------------------------------------------
-- 1. Extension de "events" (alter, pas de recreation)
-- ----------------------------------------------------------------------------
alter table events
  add column if not exists category text,
  add column if not exists cover_url text,
  add column if not exists duration_minutes integer,
  add column if not exists max_participants integer,
  add column if not exists visibility text not null default 'public' check (visibility in ('public','community','private')),
  add column if not exists participants_visible boolean not null default true,
  add column if not exists canceled_at timestamptz,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists city text;

-- "location" devenait le seul champ texte pour la ville — il redevient un
-- lieu public optionnel ("Cafe Aunja"), "city" porte desormais la
-- ville/quartier approximatif. Retro-remplissage sans perte, puis "city"
-- devient obligatoire et "location" optionnel.
update events set city = location where city is null;
alter table events alter column city set not null;
alter table events alter column location drop not null;
comment on column events.location is
  'Lieu public optionnel (ex: Cafe Aunja) — jamais une adresse exacte. La ville/quartier vit dans city.';
comment on column events.city is
  'Ville ou quartier approximatif uniquement — jamais une adresse exacte ni des coordonnees GPS.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_max_participants_positive') then
    alter table events add constraint events_max_participants_positive
      check (max_participants is null or max_participants > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'events_community_visibility_consistent') then
    alter table events add constraint events_community_visibility_consistent
      check (visibility <> 'community' or community_id is not null);
  end if;
end $$;

create index if not exists idx_events_event_date on events(event_date);
create index if not exists idx_events_city on events(city);
create index if not exists idx_events_category on events(category);
create index if not exists idx_events_community_id on events(community_id);
create index if not exists idx_events_visibility on events(visibility);

-- ----------------------------------------------------------------------------
-- 2. Extension de "event_attendees" (statut, pas une nouvelle table de
-- participants — going/interested/not_going/waitlisted).
-- ----------------------------------------------------------------------------
alter table event_attendees
  add column if not exists status text not null default 'going' check (status in ('going','interested','not_going','waitlisted')),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz;

create index if not exists idx_event_attendees_event_status on event_attendees(event_id, status);
create index if not exists idx_event_attendees_profile on event_attendees(profile_id);

-- ----------------------------------------------------------------------------
-- 3. event_staff (organizer/co_organizer/moderator) — structure D'ABORD,
-- comme "community_members" en Phase 6, car les fonctions ci-dessous la
-- referencent.
-- ----------------------------------------------------------------------------
create table if not exists event_staff (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null check (role in ('organizer','co_organizer','moderator')),
  created_at timestamptz default now(),
  unique (event_id, profile_id)
);
alter table event_staff enable row level security;

-- ----------------------------------------------------------------------------
-- 4. event_invitations — structure D'ABORD (referencee par can_view_event).
-- ----------------------------------------------------------------------------
create table if not exists event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  invited_by uuid not null references profiles(id) on delete cascade,
  invited_profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  unique (event_id, invited_profile_id)
);
alter table event_invitations enable row level security;

-- ----------------------------------------------------------------------------
-- 5. Fonctions centrales — meme motif que la Phase 6 (current_profile_id
-- et is_community_member existent deja, reutilisees telles quelles).
-- ----------------------------------------------------------------------------
create or replace function event_staff_role(p_event_id uuid, p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from event_staff where event_id = p_event_id and profile_id = p_profile_id;
$$;

create or replace function is_event_staff(p_event_id uuid) -- organizer/co_organizer, peut editer
returns boolean language sql stable security definer set search_path = public as $$
  select event_staff_role(p_event_id, current_profile_id()) in ('organizer','co_organizer');
$$;

create or replace function is_event_mod(p_event_id uuid) -- + moderator, peut moderer
returns boolean language sql stable security definer set search_path = public as $$
  select event_staff_role(p_event_id, current_profile_id()) is not null;
$$;

create or replace function is_event_participant(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from event_attendees
    where event_id = p_event_id and profile_id = current_profile_id()
      and status in ('going','interested','waitlisted')
  );
$$;

create or replace function can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case ev.visibility
    when 'public' then true
    when 'community' then is_community_member(ev.community_id)
    when 'private' then (
      is_event_mod(ev.id) or is_event_participant(ev.id)
      or exists (select 1 from event_invitations where event_id = ev.id and invited_profile_id = current_profile_id())
    )
    else false end
  from events ev where ev.id = p_event_id;
$$;

create or replace function event_participant_count(p_event_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from event_attendees where event_id = p_event_id and status = 'going';
$$;

-- Surcharge "colonne calculee" PostgREST : accepte la ligne "events" en
-- entier (pas juste son id) pour pouvoir l'inclure directement dans un
-- .select('*, event_participant_count') sur une LISTE d'evenements, sans
-- N appels RPC separes ni fuite du nombre reel via un simple count() de
-- event_attendees (qui serait tronque par la policy SELECT quand
-- participants_visible = false).
create or replace function event_participant_count(e events)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from event_attendees where event_id = e.id and status = 'going';
$$;

-- ----------------------------------------------------------------------------
-- 6. RLS de "events" — reecriture complete (les fonctions existent maintenant).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='events' loop
    execute format('drop policy %I on public.events', pol.policyname);
  end loop;

  create policy "Lecture des evenements selon visibilite"
  on events for select using (can_view_event(id));

  -- Pas de policy INSERT : creation exclusivement via create_event() (RPC),
  -- pour garantir qu'un evenement n'existe jamais sans organisateur
  -- recuperable (un evenement orphelin serait definitivement immoderable
  -- et ineditable par personne — pire ici qu'une communaute orpheline).

  create policy "Le staff modifie son evenement"
  on events for update using (is_event_staff(id));

  -- Pas de policy DELETE : preferer annulation (canceled_at) / archivage,
  -- conforme a la consigne de ne jamais supprimer brutalement un evenement.
end $$;

-- ----------------------------------------------------------------------------
-- 7. RLS de "event_attendees" — reecriture complete.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='event_attendees' loop
    execute format('drop policy %I on public.event_attendees', pol.policyname);
  end loop;

  -- Le compteur reel reste toujours exact via event_participant_count() ;
  -- ici seule la LISTE nominative est protegee par participants_visible.
  create policy "Lecture des participants selon visibilite"
  on event_attendees for select
  using (
    can_view_event(event_id)
    and (
      profile_id = current_profile_id()
      or is_event_mod(event_id)
      or (select participants_visible from events where id = event_id) = true
    )
  );

  -- Point de securite critique : une insertion directe en 'going' n'est
  -- autorisee que si l'evenement n'a PAS de plafond — au-dela, seule la
  -- fonction join_event() (verrou + comptage atomique) peut faire passer
  -- quelqu'un a 'going', ce qui empeche de contourner la capacite en
  -- appelant directement l'API REST.
  create policy "Rejoindre directement si pas de plafond, sinon via RPC"
  on event_attendees for insert
  with check (
    profile_id = current_profile_id()
    and can_view_event(event_id)
    and not exists (select 1 from events e where e.id = event_id and e.canceled_at is not null)
    and (status <> 'going' or (select max_participants from events where id = event_id) is null)
  );

  create policy "Modifier sa participation, sauf forcer going sur un evenement plafonne"
  on event_attendees for update
  using (profile_id = current_profile_id() or is_event_mod(event_id))
  with check (
    status <> 'going'
    or (select max_participants from events where id = event_id) is null
    or profile_id <> current_profile_id()
  );

  create policy "Se retirer ou etre retire par le staff"
  on event_attendees for delete
  using (profile_id = current_profile_id() or is_event_mod(event_id));
end $$;

-- ----------------------------------------------------------------------------
-- 8. RLS de "event_staff".
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='event_staff' loop
    execute format('drop policy %I on public.event_staff', pol.policyname);
  end loop;

  create policy "Lecture publique du staff d'evenement"
  on event_staff for select using (true);

  -- Point de securite critique (equivalent du bug corrige en Phase 6 sur
  -- community_members) : AUCUNE policy INSERT cote client. Sans ceci,
  -- n'importe quel utilisateur pourrait s'inserer comme 'organizer' sur
  -- l'evenement de quelqu'un d'autre et en prendre le controle. Les lignes
  -- n'entrent que via create_event() (SECURITY DEFINER) ou une promotion
  -- hierarchique ci-dessous.
  create policy "Changement de role selon la hierarchie evenement"
  on event_staff for update
  using (
    event_staff_role(event_id, current_profile_id()) = 'organizer'
    or (event_staff_role(event_id, current_profile_id()) = 'co_organizer' and role = 'moderator')
  )
  with check (
    event_staff_role(event_id, current_profile_id()) = 'organizer'
    or (event_staff_role(event_id, current_profile_id()) = 'co_organizer' and role = 'moderator')
  );

  create policy "Quitter le staff ou etre retire par l'organisateur"
  on event_staff for delete
  using (
    (profile_id = current_profile_id() and role <> 'organizer')
    or (event_staff_role(event_id, current_profile_id()) = 'organizer' and profile_id <> current_profile_id())
  );
end $$;

-- ----------------------------------------------------------------------------
-- 9. RLS de "event_invitations" + anti-spam reel (seule action visee
-- explicitement par la consigne anti-spam avec un vrai risque d'abus en
-- masse — les autres limites restent des garde-fous cote client).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='event_invitations' loop
    execute format('drop policy %I on public.event_invitations', pol.policyname);
  end loop;

  create policy "Voir ses invitations recues, envoyees, ou en tant que staff"
  on event_invitations for select
  using (invited_profile_id = current_profile_id() or invited_by = current_profile_id() or is_event_mod(event_id));

  -- La cible doit etre une vraie connexion mutuelle (deux lignes "likes"
  -- croisees — il n'existe pas de table "matches" dans ce schema) ou un
  -- membre de la communaute associee a l'evenement.
  create policy "Inviter en son propre nom si participant et connexion reelle"
  on event_invitations for insert
  with check (
    invited_by = current_profile_id()
    and (is_event_participant(event_id) or is_event_mod(event_id))
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

  -- Le staff ne peut que revoquer (declined) — l'acceptation passe
  -- uniquement par accept_event_invitation() pour rester atomique avec la
  -- verification de capacite.
  create policy "Le staff revoque une invitation"
  on event_invitations for update
  using (is_event_mod(event_id))
  with check (status = 'declined');
end $$;

create or replace function check_event_invite_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from event_invitations
    where invited_by = new.invited_by and created_at > now() - interval '24 hours';
  if v_count >= 30 then
    raise exception 'Trop d invitations envoyees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_event_invite_rate_limit on event_invitations;
create trigger trg_event_invite_rate_limit before insert on event_invitations
for each row execute function check_event_invite_rate_limit();

-- ----------------------------------------------------------------------------
-- 10. event_reports — miroir de community_reports (Phase 6).
-- ----------------------------------------------------------------------------
create table if not exists event_reports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  from_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('spam','arnaque','faux_evenement','harcelement','contenu_inapproprie','autre')),
  reason text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz default now()
);
alter table event_reports enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='event_reports' loop
    execute format('drop policy %I on public.event_reports', pol.policyname);
  end loop;

  create policy "Signaler un evenement en son propre nom"
  on event_reports for insert with check (from_id = current_profile_id());

  create policy "Le staff voit les signalements de son evenement"
  on event_reports for select using (is_event_mod(event_id));

  create policy "Le staff traite les signalements"
  on event_reports for update using (is_event_mod(event_id));
end $$;

-- ----------------------------------------------------------------------------
-- 11. event_media (photos) — bucket Storage prive dedie, cree plus bas.
-- ----------------------------------------------------------------------------
create table if not exists event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  uploaded_by uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  created_at timestamptz default now()
);
alter table event_media enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='event_media' loop
    execute format('drop policy %I on public.event_media', pol.policyname);
  end loop;

  create policy "Lecture des photos selon visibilite"
  on event_media for select
  using (can_view_event(event_id) and (status = 'visible' or is_event_mod(event_id)));

  create policy "Un participant partage une photo"
  on event_media for insert
  with check (
    uploaded_by = current_profile_id()
    and (is_event_participant(event_id) or is_event_mod(event_id))
    and not exists (select 1 from events e where e.id = event_id and e.canceled_at is not null)
  );

  create policy "L'auteur ou le staff modifie une photo"
  on event_media for update using (uploaded_by = current_profile_id() or is_event_mod(event_id));

  create policy "L'auteur ou le staff supprime une photo"
  on event_media for delete using (uploaded_by = current_profile_id() or is_event_mod(event_id));
end $$;

-- ----------------------------------------------------------------------------
-- 12. event_comments (discussion) — miroir de community_comments (Phase 6),
-- pas une extension de la messagerie 1:1 (voir rapport pour le raisonnement).
-- Poster (pas seulement lire) exige d'etre participant, comme
-- community_posts exige d'etre membre meme pour une communaute publique.
-- ----------------------------------------------------------------------------
create table if not exists event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now()
);
alter table event_comments enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='event_comments' loop
    execute format('drop policy %I on public.event_comments', pol.policyname);
  end loop;

  create policy "Lecture des commentaires selon visibilite"
  on event_comments for select using (can_view_event(event_id));

  create policy "Un participant commente en son propre nom"
  on event_comments for insert
  with check (
    author_id = current_profile_id()
    and (is_event_participant(event_id) or is_event_mod(event_id))
  );

  create policy "Auteur ou moderateur supprime un commentaire"
  on event_comments for delete
  using (author_id = current_profile_id() or is_event_mod(event_id));
end $$;

-- ----------------------------------------------------------------------------
-- 13. RPC — memes conventions que la Phase 6 (SECURITY DEFINER plpgsql
-- pour toute operation multi-etapes qui doit rester atomique).
-- ----------------------------------------------------------------------------

-- Cree l'evenement ET la ligne organizer ET la participation du createur en
-- une seule transaction — un insert client brut ne pourrait pas le faire
-- (aucune policy INSERT n'existe sur events ni event_staff).
create or replace function create_event(
  p_title text, p_description text, p_category text, p_cover_url text,
  p_event_date timestamptz, p_duration_minutes integer,
  p_city text, p_location text, p_max_participants integer,
  p_visibility text, p_community_id uuid
)
returns events
language plpgsql security definer set search_path = public
as $$
declare v_event events;
begin
  if p_title is null or char_length(trim(p_title)) = 0 then
    raise exception 'Le titre est requis';
  end if;
  if p_city is null or char_length(trim(p_city)) = 0 then
    raise exception 'La ville est requise';
  end if;
  if p_event_date is null or p_event_date <= now() then
    raise exception 'La date doit etre dans le futur';
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
    city, location, max_participants, visibility, community_id, created_by
  )
  values (
    trim(p_title), p_description, p_category, p_cover_url, p_event_date, p_duration_minutes,
    trim(p_city), nullif(trim(coalesce(p_location, '')), ''), p_max_participants,
    coalesce(p_visibility, 'public'), p_community_id, current_profile_id()
  )
  returning * into v_event;

  insert into event_staff (event_id, profile_id, role) values (v_event.id, current_profile_id(), 'organizer');
  insert into event_attendees (event_id, profile_id, status) values (v_event.id, current_profile_id(), 'going');

  return v_event;
end;
$$;

-- Rejoindre un evenement : verrouille la ligne events (evite une condition
-- de course entre deux inscriptions simultanees sur un evenement plafonne),
-- decide going/waitlisted, upsert.
create or replace function join_event(p_event_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_max int; v_canceled timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select max_participants, canceled_at into v_max, v_canceled from events where id = p_event_id for update;
  if not found then raise exception 'Evenement introuvable'; end if;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
  if not can_view_event(p_event_id) then raise exception 'Non autorise'; end if;

  select count(*) into v_going from event_attendees where event_id = p_event_id and status = 'going';
  v_status := case when v_max is null or v_going < v_max then 'going' else 'waitlisted' end;

  insert into event_attendees (event_id, profile_id, status)
  values (p_event_id, current_profile_id(), v_status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now()
  returning * into v_row;

  insert into notifications (recipient_id, type, actor_id, target_type, target_id, payload)
  values (current_profile_id(), 'event_participation_confirmed', current_profile_id(), 'event', p_event_id,
    jsonb_build_object('status', v_status));

  return v_row;
end;
$$;

create or replace function accept_event_invitation(p_invitation_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_event_id uuid; v_max int; v_canceled timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select event_id into v_event_id from event_invitations
    where id = p_invitation_id and status = 'pending' and invited_profile_id = current_profile_id()
    for update;
  if not found then raise exception 'Invitation introuvable ou deja traitee'; end if;

  select max_participants, canceled_at into v_max, v_canceled from events where id = v_event_id for update;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;

  update event_invitations set status = 'accepted' where id = p_invitation_id;

  select count(*) into v_going from event_attendees where event_id = v_event_id and status = 'going';
  v_status := case when v_max is null or v_going < v_max then 'going' else 'waitlisted' end;

  insert into event_attendees (event_id, profile_id, status)
  values (v_event_id, current_profile_id(), v_status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function decline_event_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update event_invitations set status = 'declined'
  where id = p_invitation_id and status = 'pending' and invited_profile_id = current_profile_id();
  if not found then raise exception 'Invitation introuvable ou deja traitee'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 14. Promotion automatique de la liste d'attente des qu'une place 'going'
-- se libere (desinscription volontaire ou retrait par le staff) — un seul
-- mecanisme couvre les deux cas.
-- ----------------------------------------------------------------------------
create or replace function promote_from_waitlist()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event_id uuid; v_max int; v_going int; v_next event_attendees;
begin
  v_event_id := coalesce(old.event_id, new.event_id);

  if old.status <> 'going' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and new.status = 'going' then
    return new;
  end if;

  select max_participants into v_max from events where id = v_event_id;
  if v_max is null then return coalesce(new, old); end if;

  select count(*) into v_going from event_attendees where event_id = v_event_id and status = 'going';
  if v_going >= v_max then return coalesce(new, old); end if;

  select * into v_next from event_attendees
    where event_id = v_event_id and status = 'waitlisted'
    order by updated_at asc limit 1;
  if found then
    update event_attendees set status = 'going', updated_at = now() where id = v_next.id;
    insert into notifications (recipient_id, type, actor_id, target_type, target_id)
    values (v_next.profile_id, 'event_waitlist_promoted', v_next.profile_id, 'event', v_event_id);
  end if;

  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_promote_waitlist on event_attendees;
create trigger trg_promote_waitlist after update or delete on event_attendees
for each row execute function promote_from_waitlist();

-- ----------------------------------------------------------------------------
-- 15. Notifications — extension de la table generique existante (Phase 6),
-- aucune nouvelle table. App.jsx a deja un abonnement Realtime dessus :
-- aucun nouveau code d'ecoute frontend n'est necessaire.
-- ----------------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'join_request_received','join_request_accepted','invite_received','report_received',
  'event_invite','event_participation_confirmed','event_updated','event_cancelled',
  'event_reminder_24h','event_reminder_1h','event_report_received','event_waitlist_promoted'
));

create or replace function notify_event_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  values (new.invited_profile_id, 'event_invite', new.invited_by, 'event', new.event_id);
  return new;
end; $$;
drop trigger if exists trg_notify_event_invite on event_invitations;
create trigger trg_notify_event_invite after insert on event_invitations
for each row execute function notify_event_invite();

create or replace function notify_event_report()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select es.profile_id, 'event_report_received', new.from_id, 'event', new.event_id
  from event_staff es where es.event_id = new.event_id;
  return new;
end; $$;
drop trigger if exists trg_notify_event_report on event_reports;
create trigger trg_notify_event_report after insert on event_reports
for each row execute function notify_event_report();

-- Clause WHEN : ne notifie que sur un changement reel (date/lieu/ville/
-- duree), pas une simple correction de description.
create or replace function notify_event_updated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select ea.profile_id, 'event_updated', new.created_by, 'event', new.id
  from event_attendees ea where ea.event_id = new.id and ea.status in ('going','interested','waitlisted');
  return new;
end; $$;
drop trigger if exists trg_notify_event_updated on events;
create trigger trg_notify_event_updated after update on events
for each row
when (
  old.event_date is distinct from new.event_date or old.location is distinct from new.location
  or old.city is distinct from new.city or old.duration_minutes is distinct from new.duration_minutes
)
execute function notify_event_updated();

create or replace function notify_event_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select ea.profile_id, 'event_cancelled', new.created_by, 'event', new.id
  from event_attendees ea where ea.event_id = new.id and ea.status in ('going','interested','waitlisted');
  return new;
end; $$;
drop trigger if exists trg_notify_event_cancelled on events;
create trigger trg_notify_event_cancelled after update on events
for each row when (old.canceled_at is null and new.canceled_at is not null)
execute function notify_event_cancelled();

-- Rappels 24h/1h avant l'evenement — fonction appelable, PAS un trigger,
-- et PAS de tache planifiee activee automatiquement (voir rapport final :
-- necessite "pg_cron", verification/activation manuelle laissee a
-- l'utilisateur). Tamponne reminder_24h_sent_at/reminder_1h_sent_at pour
-- ne jamais notifier deux fois le meme creneau.
create or replace function send_event_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select ea.profile_id, 'event_reminder_24h', e.created_by, 'event', e.id
  from event_attendees ea join events e on e.id = ea.event_id
  where ea.status = 'going' and e.canceled_at is null
    and e.event_date between now() + interval '23 hours' and now() + interval '24 hours'
    and ea.reminder_24h_sent_at is null;

  update event_attendees ea set reminder_24h_sent_at = now()
  from events e
  where e.id = ea.event_id and ea.status = 'going' and e.canceled_at is null
    and e.event_date between now() + interval '23 hours' and now() + interval '24 hours'
    and ea.reminder_24h_sent_at is null;

  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select ea.profile_id, 'event_reminder_1h', e.created_by, 'event', e.id
  from event_attendees ea join events e on e.id = ea.event_id
  where ea.status = 'going' and e.canceled_at is null
    and e.event_date between now() + interval '45 minutes' and now() + interval '1 hour'
    and ea.reminder_1h_sent_at is null;

  update event_attendees ea set reminder_1h_sent_at = now()
  from events e
  where e.id = ea.event_id and ea.status = 'going' and e.canceled_at is null
    and e.event_date between now() + interval '45 minutes' and now() + interval '1 hour'
    and ea.reminder_1h_sent_at is null;
end;
$$;

-- ----------------------------------------------------------------------------
-- 16. Profil — affichage optionnel des evenements a venir (item 55 :
-- uniquement si l'utilisateur a choisi de l'afficher).
-- ----------------------------------------------------------------------------
alter table profiles add column if not exists show_upcoming_events boolean not null default true;

-- ----------------------------------------------------------------------------
-- 17. Messagerie — reutilisation reelle de l'extensibilite messages.kind
-- (Phase 5.5) pour "Partager cet evenement dans une conversation", aucune
-- nouvelle RLS necessaire (les policies existantes sur messages suffisent).
-- ----------------------------------------------------------------------------
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check
  check (kind in ('text','image','video','audio','file','sticker','event'));

alter table messages drop constraint if exists messages_kind_shape_check;
alter table messages add constraint messages_kind_shape_check
  check (
    (kind = 'text' and text is not null and text <> '' and media_path is null)
    or (kind = 'sticker' and media_path is null and media_meta ? 'emoji')
    or (kind in ('image','video','audio','file') and media_path is not null)
    or (kind = 'event' and media_path is null and media_meta ? 'event_id')
  );

-- ----------------------------------------------------------------------------
-- 18. Storage — deux nouveaux buckets prives (jamais "avatars", public :
-- une image de couverture d'evenement prive resterait sinon accessible par
-- URL brute a n'importe qui, en contournant totalement can_view_event()).
-- Convention de chemin : {event_id}/{horodatage}-{suffixe}.{ext}.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 20971520, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'event-media:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "event-media: partage une photo si participant"
  on storage.objects for insert
  with check (
    bucket_id = 'event-media'
    and (
      is_event_participant(((storage.foldername(name))[1])::uuid)
      or is_event_mod(((storage.foldername(name))[1])::uuid)
    )
  );

  create policy "event-media: lit selon visibilite de l'evenement"
  on storage.objects for select
  using (bucket_id = 'event-media' and can_view_event(((storage.foldername(name))[1])::uuid));

  create policy "event-media: supprime ses propres fichiers"
  on storage.objects for delete
  using (bucket_id = 'event-media' and owner = auth.uid());
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'event-covers:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "event-covers: le staff televerse une couverture"
  on storage.objects for insert
  with check (bucket_id = 'event-covers' and is_event_staff(((storage.foldername(name))[1])::uuid));

  create policy "event-covers: lit selon visibilite de l'evenement"
  on storage.objects for select
  using (bucket_id = 'event-covers' and can_view_event(((storage.foldername(name))[1])::uuid));

  create policy "event-covers: le staff supprime la couverture"
  on storage.objects for delete
  using (
    bucket_id = 'event-covers'
    and (owner = auth.uid() or is_event_staff(((storage.foldername(name))[1])::uuid))
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns where table_name='events' and column_name in ('city','visibility','max_participants','category');
-- select tablename from pg_tables where schemaname='public' and tablename like 'event_%';
-- select proname from pg_proc where proname in ('create_event','join_event','accept_event_invitation','decline_event_invitation','send_event_reminders');
-- select policyname, cmd from pg_policies where tablename in ('events','event_attendees','event_staff','event_invitations','event_reports','event_media','event_comments') order by tablename, cmd;
-- select id, public, file_size_limit from storage.buckets where id in ('event-media','event-covers');
-- ============================================================================
