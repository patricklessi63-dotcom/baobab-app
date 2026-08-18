-- ============================================================================
-- Phase 10 — Baobab Scale & Security 🚀 — corrections issues de l'audit RLS
-- et de performance. Additif uniquement, jamais destructif pour les données
-- existantes. À exécuter dans Supabase : SQL Editor (une fois), après tous
-- les fichiers supabase-*.sql précédents.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. 🔴 CRITIQUE — "profiles" INSERT acceptait n'importe quelle ligne
-- (with check (true), jamais corrigée depuis le prototype initial). Un
-- client (même non authentifié, le prédicat était littéralement "true")
-- pouvait insérer un profil avec le user_id de n'importe qui d'autre.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;

  create policy "Creation de son propre profil uniquement"
  on profiles for insert
  with check (auth.uid() = user_id);
end $$;

-- ----------------------------------------------------------------------------
-- 2. 🔴 CRITIQUE — aucune contrainte d'unicité sur profiles.user_id.
-- Combiné au bug ci-dessus, un utilisateur pouvait créer un second profil
-- portant le user_id d'une victime, ce qui casse toute policy du type
-- "(select id from profiles where user_id = auth.uid())" pour cette victime
-- (Postgres lève "more than one row returned by a subquery" -> blocage total
-- de son compte sur likes/passes/messages/blocks/favorites/etc.).
--
-- ATTENTION : si cette contrainte échoue, c'est qu'il existe déjà des
-- doublons en base (résidu du bug ci-dessus ou de tests manuels) — il faut
-- d'abord les identifier et les nettoyer manuellement avant de relancer ce
-- bloc :
--   select user_id, count(*) from profiles group by user_id having count(*) > 1;
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_user_id_unique') then
    alter table profiles add constraint profiles_user_id_unique unique (user_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. 🔴 CRITIQUE — "profiles" SELECT était lisible par le rôle "anon"
-- (using (true) sans restriction de rôle), exposant user_id (= auth.users.id)
-- et birth_date à quiconque, même sans compte. Les booléens show_city/
-- show_country etc. sont documentés comme UI-only, pas une protection DB.
-- Restriction au rôle "authenticated" : app.jsx ne charge jamais "profiles"
-- avant qu'une session existe (confirmé : loadAll() n'est appelé qu'après
-- "session !== null"), donc ce resserrement ne casse aucun usage réel.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.profiles', pol.policyname);
  end loop;

  create policy "Lecture des profils par les utilisateurs connectes"
  on profiles for select
  to authenticated
  using (true);
end $$;

-- ----------------------------------------------------------------------------
-- 4. 🟡 "messages" INSERT (et son miroir storage "chat-media") acceptaient
-- un match_key de plus de 2 segments tant qu'AU MOINS un des autres segments
-- correspondait à un match mutuel réel — un match_key à 3 segments
-- (moi__vrai_match__tiers_non_implique) satisfaisait donc la policy sans
-- que le tiers n'ait de relation avec l'expéditeur. Non exploitable via
-- l'UI actuelle (App.jsx construit toujours des clés à 2 segments) mais un
-- vrai trou RLS si appelé directement via l'API PostgREST. Fermeture par
-- une contrainte stricte de longueur.
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
    )
  );
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'chat-media: televerse dans une conversation matchee' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "chat-media: televerse dans une conversation matchee"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and array_length(string_to_array((storage.foldername(name))[1], '__'), 1) = 2
    and (select id from profiles where user_id = auth.uid())::text
      = any (string_to_array((storage.foldername(name))[1], '__'))
    and exists (
      select 1
      from unnest(string_to_array((storage.foldername(name))[1], '__')) as other_id
      where other_id::uuid <> (select id from profiles where user_id = auth.uid())
        and exists (
          select 1 from likes
          where from_id = (select id from profiles where user_id = auth.uid())
            and to_id = other_id::uuid
        )
        and exists (
          select 1 from likes
          where from_id = other_id::uuid
            and to_id = (select id from profiles where user_id = auth.uid())
        )
        and not exists (
          select 1 from blocks
          where (blocks.from_id = (select id from profiles where user_id = auth.uid()) and blocks.to_id = other_id::uuid)
             or (blocks.from_id = other_id::uuid and blocks.to_id = (select id from profiles where user_id = auth.uid()))
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 5. 🟡 "events" UPDATE ne revérifiait pas l'appartenance communautaire lors
-- d'un changement de visibilite/community_id — un organisateur pouvait
-- rattacher son événement à une communauté dont il n'est pas membre.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'events' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.events', pol.policyname);
  end loop;

  create policy "Le staff modifie son evenement"
  on events for update
  using (is_event_staff(id))
  with check (is_event_staff(id) and (visibility <> 'community' or is_community_member(community_id)));
end $$;

-- ----------------------------------------------------------------------------
-- 6. 🟡 "event_attendees" UPDATE : un membre du staff pouvait faire passer
-- directement quelqu'un d'autre à 'going' sur un événement à capacité
-- limitée sans aucune revérification du compteur (contournement de la
-- limite en PATCHant directement au lieu de passer par join_event()).
-- Garde-fou ajouté : le nombre de "going" au moment de la modification doit
-- rester sous le plafond. Non atomique (contrairement à join_event() qui
-- verrouille la ligne "events"), mais suffisant pour une action reservee au
-- staff (pas une escalade de privilege inter-utilisateurs).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_attendees' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.event_attendees', pol.policyname);
  end loop;

  create policy "Modifier sa participation, sauf forcer going sur un evenement plafonne"
  on event_attendees for update
  using (profile_id = current_profile_id() or is_event_mod(event_id))
  with check (
    status <> 'going'
    or (select max_participants from events where id = event_attendees.event_id) is null
    or (
      profile_id <> current_profile_id()
      and (select count(*) from event_attendees ea where ea.event_id = event_attendees.event_id and ea.status = 'going')
          < (select max_participants from events where id = event_attendees.event_id)
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 7. 🟡 Bucket "avatars" — jamais défini dans une migration versionnée
-- (créé manuellement via le dashboard Supabase à une phase antérieure).
-- Défini ici de façon idempotente pour documenter et garantir les policies
-- attendues : lecture publique (nécessaire pour l'affichage des photos de
-- profil aux autres utilisateurs), écriture/suppression restreintes à son
-- propre dossier (convention de chemin confirmée dans App.jsx :
-- "{userId}/photo-....ext", où userId = auth.uid()).
--
-- ⚠️ IMPORTANT : si des policies plus permissives existent déjà sur ce
-- bucket côté dashboard (créées manuellement, hors de ce fichier), elles
-- restent actives en parallèle (les policies RLS Postgres pour une même
-- commande sont combinées en OR, pas en AND) — va vérifier dans le
-- Dashboard Supabase > Storage > avatars > Policies et supprimer toute
-- policy INSERT/UPDATE/DELETE qui ne serait pas restreinte au dossier de
-- l'utilisateur, sans quoi ce correctif est cosmétique et non réellement
-- appliqué.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "avatars: lecture publique"
  on storage.objects for select
  using (bucket_id = 'avatars');

  create policy "avatars: televerse dans son propre dossier"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "avatars: modifie ses propres fichiers"
  on storage.objects for update
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "avatars: supprime ses propres fichiers"
  on storage.objects for delete
  using (bucket_id = 'avatars' and owner = auth.uid());
end $$;

-- ----------------------------------------------------------------------------
-- 8. Idempotence des notifications de participation — join_event() notifiait
-- systématiquement à chaque appel, même quand le statut résultant était
-- identique au précédent (double-tap, deux onglets). Corrigé : notifie
-- seulement si le statut a réellement changé.
-- ----------------------------------------------------------------------------
create or replace function join_event(p_event_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_max int; v_canceled timestamptz; v_going int; v_status text; v_row event_attendees; v_old_status text;
begin
  select max_participants, canceled_at into v_max, v_canceled from events where id = p_event_id for update;
  if not found then raise exception 'Evenement introuvable'; end if;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
  if not can_view_event(p_event_id) then raise exception 'Non autorise'; end if;

  select status into v_old_status from event_attendees where event_id = p_event_id and profile_id = current_profile_id();

  select count(*) into v_going from event_attendees where event_id = p_event_id and status = 'going';
  v_status := case when v_max is null or v_going < v_max then 'going' else 'waitlisted' end;

  insert into event_attendees (event_id, profile_id, status)
  values (p_event_id, current_profile_id(), v_status)
  on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now()
  returning * into v_row;

  if v_old_status is distinct from v_status then
    insert into notifications (recipient_id, type, actor_id, target_type, target_id, payload)
    values (current_profile_id(), 'event_participation_confirmed', current_profile_id(), 'event', p_event_id,
      jsonb_build_object('status', v_status));
  end if;

  return v_row;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. send_event_reminders() — l'INSERT et l'UPDATE relisaient indépendamment
-- la même condition ("reminder_..._sent_at is null") sans verrou partagé :
-- deux appels concurrents de la fonction (ex. double déclenchement d'un
-- futur cron) pouvaient tous deux passer l'INSERT avant que l'un des deux
-- ne pose l'UPDATE, doublant la notification. Corrigé en une seule
-- opération atomique par créneau : l'UPDATE réclame les lignes (et les
-- retourne), l'INSERT ne notifie que celles réellement réclamées par CET
-- appel — un second appel concurrent ne trouve alors plus aucune ligne
-- éligible.
-- ----------------------------------------------------------------------------
create or replace function send_event_reminders()
returns void language plpgsql security definer set search_path = public as $$
begin
  with claimed as (
    update event_attendees ea set reminder_24h_sent_at = now()
    from events e
    where e.id = ea.event_id and ea.status = 'going' and e.canceled_at is null
      and e.event_date between now() + interval '23 hours' and now() + interval '24 hours'
      and ea.reminder_24h_sent_at is null
    returning ea.profile_id, e.created_by, e.id as event_id
  )
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select profile_id, 'event_reminder_24h', created_by, 'event', event_id from claimed;

  with claimed as (
    update event_attendees ea set reminder_1h_sent_at = now()
    from events e
    where e.id = ea.event_id and ea.status = 'going' and e.canceled_at is null
      and e.event_date between now() + interval '45 minutes' and now() + interval '1 hour'
      and ea.reminder_1h_sent_at is null
    returning ea.profile_id, e.created_by, e.id as event_id
  )
  insert into notifications (recipient_id, type, actor_id, target_type, target_id)
  select profile_id, 'event_reminder_1h', created_by, 'event', event_id from claimed;
end;
$$;
