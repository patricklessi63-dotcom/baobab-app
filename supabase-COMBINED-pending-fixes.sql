-- ============================================================================
-- SCRIPT CONSOLIDÉ — tous les correctifs SQL en attente (23 fichiers)
-- Régénéré le 2026-09-04 12:38 à partir des fichiers supabase-*-fix.sql
-- individuels du dépôt. Chaque section est idempotente (drop/create ou
-- create or replace), donc rejouer ce script entier ne pose pas de
-- problème si une partie a déjà été appliquée séparément.
--
-- ORDRE VOLONTAIRE : les 4 premières sections (sécurité critique/active,
-- trouvées et corrigées après la première version de ce script consolidé)
-- passent en premier. Si tu as déjà exécuté l'ancienne version de ce
-- script (19 fichiers), tu peux exécuter UNIQUEMENT ces 4 premières
-- sections plutôt que tout le fichier — repère les séparateurs "SOURCE :".
--
-- 1. supabase-authz-null-bypass-CRITIQUE-fix.sql — LE PLUS URGENT. Sans
--    lui, admin_search_users()/admin_list_feedback() et plusieurs autres
--    fonctions exposent de vraies données à n'importe quel visiteur
--    anonyme, confirmé en direct contre la production.
-- 2. supabase-storage-anon-listing-fix.sql — les buckets avatars/post-media
--    sont lisibles et listables par n'importe qui sans compte.
-- 3. supabase-stripe-webhook-ordering-fix.sql — nécessite AUSSI un
--    redéploiement de la fonction après exécution du SQL :
--      supabase functions deploy stripe-webhook --no-verify-jwt
-- 4. supabase-create-community-event-authz-fix.sql — moins urgent (pas
--    exploitable aujourd'hui), inclus pour être complet.
--
-- À exécuter en une fois dans Supabase SQL Editor. Si une erreur survient
-- sur une section, note le nom du fichier source (marqué ci-dessous) et
-- signale-le : le reste du script peut être rejoué séparément.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-authz-null-bypass-CRITIQUE-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF CRITIQUE — les gardes d'autorisation "if not is_X() then raise
-- exception" sont contournables par NIMPORTE QUEL appelant qui n'a PAS de
-- rôle privilégié (donc la quasi-totalité des utilisateurs normaux).
--
-- Trouvé en vérifiant en lecture seule, contre la production, que le
-- correctif supabase-user-risk-level-authz-fix.sql (qui vient d'être exécuté)
-- fonctionnait réellement : un appel anonyme (clé publique, sans session
-- utilisateur) à user_risk_level() a renvoyé 'normal' avec HTTP 200 au lieu
-- de lever l'exception attendue.
--
-- CAUSE RACINE (logique à trois valeurs de SQL) :
--   is_moderator_or_above() est défini ainsi (supabase-admin.sql) :
--     select platform_role(current_profile_id()) in ('moderator','admin','super_admin');
--   Pour un utilisateur SANS ligne dans platform_roles (donc TOUT utilisateur
--   normal, connecté ou non), platform_role(...) renvoie NULL (aucune ligne
--   trouvée) — pas 'aucun rôle', littéralement NULL.
--   `NULL in (...)` vaut NULL en SQL, ni vrai ni faux.
--   Le résultat de la fonction est donc NULL, pas FALSE.
--
--   Ensuite, dans TOUTES les fonctions qui font :
--     if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
--   `not NULL` vaut NULL, et en PL/pgSQL, un IF dont la condition est NULL
--   est traité comme FAUX (la doc PostgreSQL le dit explicitement) — donc la
--   branche "raise exception" n'est JAMAIS exécutée pour ce cas. L'appelant
--   passe le contrôle silencieusement, alors que l'intention était de le
--   rejeter.
--
-- PORTÉE — vérifiée exhaustivement (grep sur "returns boolean language sql"
-- dans tous les fichiers .sql du dépôt, 13 fonctions au total) :
--   BUGUÉES (utilisent "X() in (...)" ou "X() = 'y'", NULL-propagation) :
--     is_moderator_or_above(), is_admin_or_above(), is_super_admin()   [supabase-admin.sql]
--     is_community_staff(), is_community_mod()                        [supabase-communities.sql]
--     is_event_staff()                                                [supabase-events-v2.sql]
--     is_info_editor(), is_info_admin()                                [supabase-info.sql]
--   SAINES (utilisent "is not null" ou "exists(...)", jamais NULL) :
--     is_community_member(), is_event_mod(), is_event_participant(),
--     can_view_event(), is_premium(), role_rank()
--
-- Ces 8 fonctions buguées servent de garde à TRÈS nombreuses fonctions
-- "security definer" à travers le projet (admin_dashboard_stats,
-- admin_list_reports, admin_list_feedback, admin_search_users,
-- grant_platform_role, revoke_platform_role, suspend_user, ban_user,
-- resolve_report, dismiss_report, les actions de modération beta-feedback,
-- premium-messaging, profile-reports-moderation, report-minor-category, les
-- actions d'édition de communauté réservées au staff, les actions d'édition
-- d'articles Info réservées aux éditeurs, et désormais user_risk_level et
-- platform_role elles-mêmes) — TOUTES potentiellement exécutables par un
-- utilisateur normal sans le rôle requis, malgré une garde qui semblait
-- correcte à la lecture du code.
--
-- CORRECTIF — un seul changement par fonction : envelopper le résultat dans
-- coalesce(..., false), pour que "aucun rôle trouvé" redevienne
-- explicitement FALSE au lieu de NULL. Aucun changement de comportement pour
-- un appelant qui a réellement le rôle requis (le calcul renvoie alors un
-- vrai TRUE/FALSE, jamais NULL, coalesce est alors un no-op). Idempotent
-- (create or replace) — corrige d'un coup TOUS les appelants listés
-- ci-dessus, sans avoir à toucher chacune de leurs définitions.
--
-- À EXÉCUTER EN PRIORITÉ ABSOLUE, avant même le reste du script consolidé
-- si ce n'est pas déjà fait — c'est la vulnérabilité la plus large de toute
-- la session d'audit.
-- ============================================================================

create or replace function is_moderator_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(platform_role(current_profile_id()) in ('moderator','admin','super_admin'), false);
$$;

create or replace function is_admin_or_above()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(platform_role(current_profile_id()) in ('admin','super_admin'), false);
$$;

create or replace function is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(platform_role(current_profile_id()) = 'super_admin', false);
$$;

create or replace function is_community_staff(p_community_id uuid) -- owner/admin, peut editer
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(community_member_role(p_community_id, current_profile_id()) in ('owner','admin'), false);
$$;

create or replace function is_community_mod(p_community_id uuid) -- + moderator, peut moderer
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(community_member_role(p_community_id, current_profile_id()) in ('owner','admin','moderator'), false);
$$;

create or replace function is_event_staff(p_event_id uuid) -- organizer/co_organizer, peut editer
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(event_staff_role(p_event_id, current_profile_id()) in ('organizer','co_organizer'), false);
$$;

create or replace function is_info_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(info_role(current_profile_id()) in ('editor','admin'), false);
$$;

create or replace function is_info_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(info_role(current_profile_id()) = 'admin', false);
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, en te déconnectant
-- ou avec la clé anonyme, jamais avec ton propre compte admin) :
--   select is_moderator_or_above(); -- doit renvoyer "false", plus jamais NULL
--   select user_risk_level('<uuid-quelconque>'); -- doit lever "Non autorise"
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-storage-anon-listing-fix.sql
-- ============================================================================
-- ============================================================================
-- Corrige une fuite confirmee EMPIRIQUEMENT (curl anonyme, cle publique anon
-- uniquement, aucune session) : n'importe quel visiteur, meme jamais
-- connecte a Baobab, peut lister l'INTEGRALITE du contenu des buckets
-- Storage "avatars" et "post-media" via l'API Storage
-- (POST /storage/v1/object/list/<bucket>), avec le nom exact de chaque
-- fichier, sa taille et ses dates.
--
-- Ce n'est PAS le meme probleme que le contournement NULL des gardes RLS sur
-- les TABLES (supabase-authz-null-bypass-CRITIQUE-fix.sql) : ici c'est une
-- policy RLS sur storage.objects qui a toujours ete trop large par
-- conception (aucune clause "to authenticated"), verifiee ce jour avec :
--   curl -X POST "https://<projet>.supabase.co/storage/v1/object/list/avatars" \
--     -H "apikey: <cle anon>" -H "Authorization: Bearer <cle anon>" \
--     -H "Content-Type: application/json" -d '{"prefix":"","limit":1000,"offset":0}'
-- -> renvoie la liste reelle des dossiers (un par profil_id) puis, avec un
-- prefix "<uuid>/", la liste des fichiers de ce profil — y compris les
-- fichiers "story-*.jpg"/"story-*.mp4" (les stories sont stockees dans le
-- bucket "avatars", voir SocialShell.jsx ligne ~1550), donc y compris des
-- stories deja EXPIREES dans l'app (l'expiration est un filtre de requete,
-- pas une suppression du fichier Storage sous-jacent — voir
-- supabase-stories-expiration.sql). Meme resultat pour "post-media".
--
-- A l'inverse, "chat-media"/"community-media"/"event-media"/"event-covers"
-- renvoient [] pour ce meme test car leurs policies SELECT conditionnent
-- l'acces a une appartenance/visibilite reelle (is_community_member,
-- can_view_event, "conversation matchee"...) qui echoue naturellement pour
-- un appelant anonyme sans session.
--
-- Correctif : restreindre la policy SELECT de "avatars" et "post-media" au
-- role authenticated. Sans impact sur l'affichage normal des photos dans
-- l'app (getPublicUrl() continue de fonctionner pour un lien direct connu :
-- ces deux buckets sont marques public=true dans storage.buckets, ce qui
-- fait deja sauter la verification RLS pour une LECTURE DIRECTE d'un
-- fichier dont on connait l'URL exacte — c'est voulu, c'est ainsi que les
-- photos de profil s'affichent). Seule la capacite de LISTER
-- (enumerer) le contenu du bucket sans rien connaitre a l'avance passe par
-- cette policy RLS, et c'est elle qui est resserree ici. LandingPage.jsx
-- (page publique avant connexion) n'affiche aucune vraie photo de profil —
-- verifie, aucun appel Storage cote non-connecte a preserver.
--
-- A executer dans Supabase : SQL Editor (une fois), sans dependance
-- nouvelle sur d'autres migrations.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "avatars: lecture publique"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

  create policy "avatars: televerse dans son propre dossier"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "avatars: modifie ses propres fichiers"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "avatars: supprime ses propres fichiers"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%post-media%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "Lecture publique post-media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'post-media');

  create policy "Televersement post-media dans son propre dossier"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "Suppression post-media dans son propre dossier"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
end $$;

-- Verification apres execution — refaire le curl anonyme ci-dessus depuis un
-- terminal : la liste doit desormais etre vide / l'appel doit echouer sans
-- jeton d'un compte reellement connecte (Authorization: Bearer <access_token
-- de session>, pas juste la cle anon publique).


-- ============================================================================
-- SOURCE : supabase-stripe-webhook-ordering-fix.sql
-- ============================================================================
-- ============================================================================
-- Corrige deux failles de fiabilite du webhook Stripe (supabase/functions/
-- stripe-webhook/index.ts) sur la table "subscriptions" — a executer dans
-- Supabase : SQL Editor (une fois), APRES supabase-premium.sql (deja en
-- production).
--
-- Contexte : ce fichier accompagne un changement de code dans
-- stripe-webhook/index.ts (deploiement de l'Edge Function requis en plus de
-- ce script SQL — "supabase functions deploy stripe-webhook --no-verify-jwt").
--
-- Probleme 1 — desordre de livraison : Stripe garantit une livraison "au
-- moins une fois" mais PAS l'ordre de livraison (voir doc Stripe : "Webhook
-- events aren't guaranteed to be sent in the order in which they're
-- generated"). L'ancien code ecrivait aveuglement dans "subscriptions" des
-- qu'un evenement customer.subscription.* arrivait, sans jamais comparer son
-- horodatage a celui du dernier evenement deja applique. Un evenement
-- retarde (retry reseau, event.created plus ancien) livre APRES un evenement
-- plus recent pouvait donc ecraser l'etat courant avec des donnees perimees
-- (ex. reactiver "active"/cancel_at_period_end=false apres une annulation
-- deja traitee).
--
-- Cette colonne memorise le "event.created" Stripe (temps ou Stripe a
-- genere l'evenement, pas l'heure de reception) du dernier evenement
-- reellement applique a cette ligne. Le nouveau code du webhook n'ecrit
-- une mise a jour que si elle est strictement plus recente que la valeur
-- deja enregistree.
-- ============================================================================

alter table subscriptions
  add column if not exists stripe_event_created_at timestamptz;

comment on column subscriptions.stripe_event_created_at is
  'Horodatage (event.created, temps Stripe) du dernier evenement webhook reellement applique a cette ligne. Sert de garde anti-desordre : un evenement plus ancien que cette valeur est ignore par stripe-webhook/index.ts au lieu d''ecraser un etat plus recent.';

-- Verification optionnelle post-execution :
-- select stripe_subscription_id, status, cancel_at_period_end, stripe_event_created_at, updated_at
-- from subscriptions order by updated_at desc limit 20;


-- ============================================================================
-- SOURCE : supabase-create-community-event-authz-fix.sql
-- ============================================================================
-- ============================================================================
-- Corrige un défaut relevé à l'audit (passage suivant le correctif CRITIQUE
-- NULL-bypass) : create_community() et create_event() sont les deux SEULES
-- fonctions "create_xxx" du schéma à n'avoir AUCUNE vérification d'auth
-- explicite en tête de fonction (toutes les autres, ex. create_info_article,
-- appellent un garde type is_xxx() en premier). Elles valident bien les
-- champs métier (titre, ville, date...) mais pas l'identité de l'appelant.
--
-- Ce n'était PAS le bug NULL-bypass déjà corrigé (aucune garde
-- "X() in (...)" ici à contourner) : un appel anonyme (current_profile_id()
-- = null, aucun profil) atteignait quand même l'INSERT, qui échouait
-- seulement PAR ACCIDENT sur une contrainte "not null" en aval :
--   - create_community() : communities.created_by est nullable (on delete
--     set null), donc le premier insert réussit ; c'est le second insert,
--     "insert into community_members (..., profile_id, ...)" avec
--     profile_id not null references profiles(id), qui échoue en dernier
--     avec une erreur Postgres brute ("null value in column profile_id
--     violates not-null constraint") — un détail d'implémentation exposé
--     tel quel au client au lieu d'un message propre.
--   - create_event() : même mécanisme via event_staff.profile_id /
--     event_attendees.profile_id (tous deux not null).
--
-- Rien d'exploitable ici (l'appel finissait de toute façon par échouer,
-- aucune ligne orpheline créée grâce aux FK not null), mais le message
-- d'erreur brut fuite un détail de schéma. Correctif : rejet explicite et
-- propre en tête de fonction, comme le fait déjà create_info_article() avec
-- is_info_editor(). Audit complémentaire : aucune autre fonction "create_xxx"
-- du schéma n'a ce défaut (toutes les autres ont déjà une garde explicite).
--
-- Restate complet des dernières versions en date :
--   - create_community() : signature avec p_rules (supabase-communities-2.sql,
--     la plus récente).
--   - create_event() : signature avec p_timezone + garde durée
--     (supabase-events-duration-guard.sql, la plus récente).
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste — mais APRÈS supabase-communities-2.sql et
-- supabase-events-duration-guard.sql s'ils ne sont pas encore appliqués,
-- puisque ce fichier restate les mêmes signatures).
-- ============================================================================

create or replace function create_community(
  p_name text, p_description text, p_category text, p_city text, p_visibility text, p_cover_url text, p_rules text default null
)
returns communities
language plpgsql security definer set search_path = public
as $$
declare v_community communities;
begin
  if current_profile_id() is null then
    raise exception 'Non authentifie';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'Le nom est requis';
  end if;
  insert into communities (name, description, category, city, visibility, cover_url, rules, created_by)
  values (trim(p_name), p_description, p_category, p_city, coalesce(p_visibility, 'public'), p_cover_url, p_rules, current_profile_id())
  returning * into v_community;

  insert into community_members (community_id, profile_id, role)
  values (v_community.id, current_profile_id(), 'owner');

  return v_community;
end;
$$;

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
-- SOURCE : supabase-user-risk-level-authz-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — user_risk_level() sans aucune vérification d'autorisation
-- (trouvé lors de l'audit autonome du 2 septembre 2026, passage 147, angle
-- "les fonctions RPC elles-mêmes respectent-elles la confidentialité côté
-- serveur, pas seulement le code React qui les consomme" — supabase-intelligence.sql).
--
-- user_risk_level(p_profile_id uuid) est "security definer" et calcule des
-- signaux comportementaux sensibles sur N'IMPORTE QUEL profil (rafale de
-- messages, messages répétés/spam, invitations d'événements en masse,
-- "profil quasi vide mais déjà actif en messagerie") puis renvoie un verdict
-- 'normal' / 'suspect' / 'limited'.
--
-- Contrairement à TOUTES les autres fonctions de modération du projet
-- (admin_dashboard_stats, admin_search_users, admin_list_reports,
-- suspend_user, ban_user, ...), qui commencent systématiquement par
-- "if not is_moderator_or_above() then raise exception 'Non autorise'",
-- user_risk_level() ne vérifiait AUCUN rôle. Le commentaire d'origine dit
-- "pas encore consommée par une UI" — vrai côté React (aucune référence
-- dans src/), mais PostgreSQL accorde EXECUTE sur une fonction à PUBLIC par
-- défaut à la création, et aucun "revoke execute" n'existe dans ce fichier
-- ni ailleurs. N'importe quel utilisateur connecté pouvait donc appeler
-- directement supabase.rpc('user_risk_level', { p_profile_id: '<uuid>' })
-- depuis la console du navigateur et apprendre si un autre utilisateur est
-- signalé 'suspect'/'limited' par ce scoring anti-spam/anti-harcèlement —
-- une information de modération qui ne devrait être visible que par le
-- staff, exactement le même type de fuite que les show_city/show_interests
-- déjà corrigés, mais côté fonction RPC plutôt que côté React.
--
-- Correctif : ajoute la même garde is_moderator_or_above() que partout
-- ailleurs dans le projet. Idempotent (create or replace) — à exécuter une
-- fois dans Supabase SQL Editor, après supabase-intelligence.sql et
-- supabase-admin.sql (dépendance sur is_moderator_or_above()).
-- ============================================================================

create or replace function user_risk_level(p_profile_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_recent_messages int;
  v_repeated_messages int;
  v_recent_invitations int;
  v_incomplete_and_active boolean;
  v_signal_count int := 0;
begin
  -- Correction : aucune verification n'existait avant cette ligne — n'importe
  -- quel utilisateur connecte pouvait scorer n'importe quel autre profil.
  if not is_moderator_or_above() then
    raise exception 'Non autorise';
  end if;

  -- Rafale de messages (frequence).
  select count(*) into v_recent_messages from messages
    where from_id = p_profile_id and created_at > now() - interval '5 minutes';
  if v_recent_messages >= 20 then v_signal_count := v_signal_count + 1; end if;

  -- Messages textuels identiques repetes (comportement automatise).
  select count(*) into v_repeated_messages from (
    select text from messages
    where from_id = p_profile_id and kind = 'text' and created_at > now() - interval '30 minutes'
    group by text having count(*) >= 5
  ) dup;
  if v_repeated_messages > 0 then v_signal_count := v_signal_count + 1; end if;

  -- Invitations d'evenement en masse (proche du seuil anti-spam deja
  -- applique par le trigger de supabase-events-v2.sql).
  select count(*) into v_recent_invitations from event_invitations
    where invited_by = p_profile_id and created_at > now() - interval '24 hours';
  if v_recent_invitations >= 25 then v_signal_count := v_signal_count + 1; end if;

  -- Profil quasi vide mais deja tres actif en messagerie — motif classique
  -- de compte cree pour spammer plutot que pour se connecter.
  select (coalesce(bio, '') = '' and coalesce(interests, '') = '' and created_at > now() - interval '1 hour')
    into v_incomplete_and_active from profiles where id = p_profile_id;
  if coalesce(v_incomplete_and_active, false) and v_recent_messages >= 10 then
    v_signal_count := v_signal_count + 1;
  end if;

  if v_signal_count >= 2 then return 'limited';
  elsif v_signal_count = 1 then return 'suspect';
  else return 'normal';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- set role authenticated; -- ou se connecter avec un compte non-moderateur
-- select user_risk_level('<uuid-dun-profil-de-test>'); -- doit lever "Non autorise"
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-platform-role-authz-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — platform_role() sans aucune vérification d'autorisation
-- (trouvé lors de l'audit autonome du 2 septembre 2026, passage 148, angle
-- "toutes les fonctions RPC 'security definer' du projet ont-elles une
-- garde d'autorisation" — supabase-admin.sql).
--
-- platform_role(p_profile_id uuid) est "security definer" et renvoie le
-- rôle plateforme (moderator/admin/super_admin ou null) de N'IMPORTE QUEL
-- profil, sans aucune vérification. Or la table platform_roles a une seule
-- policy RLS SELECT, explicite : "Un utilisateur voit son propre role
-- plateforme" (profile_id = current_profile_id()) — c'est-à-dire que
-- l'intention du projet est clairement qu'on ne doit voir QUE son propre
-- rôle. platform_role() étant "security definer", elle contourne cette RLS
-- et, faute de garde interne, exposait donc directement via
-- supabase.rpc('platform_role', { p_profile_id: '<uuid-de-quelquun-dautre>' })
-- le statut modérateur/admin/super_admin de n'importe quel autre
-- utilisateur connecté — une information d'identité du staff qui ne
-- devrait être visible que par le staff lui-même, exactement le même
-- schéma que la faille déjà corrigée sur user_risk_level()
-- (supabase-user-risk-level-authz-fix.sql, passage 147).
--
-- Différence importante avec nearby_profiles()/is_premium() (jugées saines
-- à l'audit) : ces deux-là exposent une information déjà rendue publique
-- ailleurs par construction (nearby_profiles filtre par relation de
-- proximité consentie ; is_premium() ne fait que refléter la colonne
-- profiles.is_premium, déjà publique pour le badge Premium). Le rôle
-- plateforme n'a, lui, JAMAIS d'équivalent public : aucune colonne sur
-- "profiles", aucun badge affiché — la RLS de platform_roles le confirme
-- explicitement en restreignant la lecture à sa propre ligne.
--
-- Vérifié : aucun appel existant de platform_role() avec un p_profile_id
-- différent de current_profile_id() n'a besoin d'un accès "libre" — dans
-- supabase-admin.sql, tous les appels avec un profil tiers
-- (revoke_platform_role, suspend_user, ban_user, admin_search_users) ont
-- lieu soit après confirmation que l'appelant est déjà modérateur+, soit
-- suivis d'une vérification du rang de l'acteur qui rejette de toute façon
-- un appelant non autorisé — le correctif ci-dessous (qui n'autorise la
-- lecture du rôle d'un tiers qu'aux membres du staff) ne change donc le
-- comportement d'AUCUN de ces appels internes.
--
-- Correctif : la lecture reste ouverte sur soi-même (indispensable —
-- is_moderator_or_above()/is_admin_or_above()/is_super_admin() en dépendent
-- pour calculer le rôle de l'appelant), et s'ouvre aussi aux membres du
-- staff pour consulter le rôle d'un tiers (nécessaire à
-- admin_search_users()/grant_platform_role()/revoke_platform_role()/
-- suspend_user()/ban_user()) ; un utilisateur normal ne peut plus
-- apprendre le rôle plateforme de quelqu'un d'autre. Vérification directe
-- sur platform_roles (pas d'appel à is_moderator_or_above(), pour éviter
-- toute récursion puisque cette dernière appelle déjà platform_role()).
-- Idempotent (create or replace) — à exécuter une fois dans Supabase SQL
-- Editor, après supabase-admin.sql.
-- ============================================================================

create or replace function platform_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from platform_roles
  where profile_id = p_profile_id
    and (
      -- Toujours autorisé à lire son propre rôle (utilisé par
      -- is_moderator_or_above/is_admin_or_above/is_super_admin).
      p_profile_id = current_profile_id()
      -- Sinon, réservé au staff (moderator/admin/super_admin) — requête
      -- directe sur platform_roles, jamais via is_moderator_or_above(),
      -- pour ne pas créer de dépendance circulaire.
      or exists (
        select 1 from platform_roles pr
        where pr.profile_id = current_profile_id()
          and pr.role in ('moderator','admin','super_admin')
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- set role authenticated; -- ou se connecter avec un compte non-staff
-- select platform_role('<uuid-dun-profil-de-test-different-du-tien>');
-- -- doit renvoyer NULL (aucune ligne) pour un appelant non-staff, et doit
-- -- continuer à renvoyer le rôle correct pour select platform_role(<son-propre-id>)
-- -- ainsi que pour un appelant modérateur+ interrogeant un tiers.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-info-role-authz-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — info_role() sans aucune vérification d'autorisation (trouvé
-- lors de l'audit autonome du 2 septembre 2026, passage 148, même angle que
-- supabase-platform-role-authz-fix.sql — supabase-info.sql).
--
-- info_role(p_profile_id uuid) est "security definer" et renvoie le rôle
-- éditorial Baobab Info (editor/admin ou null) de N'IMPORTE QUEL profil,
-- sans aucune vérification. La table info_editors a une seule policy RLS
-- SELECT, explicite : "Un utilisateur voit son propre statut editeur"
-- (profile_id = current_profile_id()) — même intention que platform_roles.
-- info_role() étant "security definer", elle contourne cette RLS et, faute
-- de garde interne, exposait directement via
-- supabase.rpc('info_role', { p_profile_id: '<uuid-de-quelquun-dautre>' })
-- le statut éditeur/admin de n'importe quel autre utilisateur connecté.
--
-- Vérifié (grep sur tous les supabase-*.sql) : info_role() n'est appelée
-- nulle part ailleurs dans le projet qu'avec current_profile_id() — aucun
-- appel avec le profil d'un tiers, contrairement à platform_role(). Le
-- correctif ci-dessous peut donc être encore plus strict : lecture limitée
-- à son propre statut, sans aucune ouverture au staff (si un futur écran
-- d'administration des éditeurs Baobab Info a besoin de lister les rôles
-- d'autrui, il devra passer par une RPC dédiée gardée par
-- is_info_admin(), comme admin_search_users() le fait déjà pour les rôles
-- plateforme — jamais en assouplissant cette fonction de base).
--
-- Correctif : idempotent (create or replace) — à exécuter une fois dans
-- Supabase SQL Editor, après supabase-info.sql.
-- ============================================================================

create or replace function info_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from info_editors
  where profile_id = p_profile_id
    and p_profile_id = current_profile_id();
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- set role authenticated; -- ou se connecter avec un compte quelconque
-- select info_role('<uuid-dun-profil-de-test-different-du-tien>');
-- -- doit renvoyer NULL (aucune ligne), y compris pour un compte admin
-- -- Baobab Info interrogeant un tiers.
-- select info_role('<ton-propre-id>'); -- doit continuer à fonctionner normalement.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-event-participant-count-authz-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — event_participant_count(uuid) sans aucune vérification de
-- visibilité (trouvé lors de l'audit autonome du 2 septembre 2026, passage
-- 148, même angle que les deux correctifs "*-role-authz-fix.sql" —
-- supabase-events-v2.sql).
--
-- event_participant_count() existe en DEUX surcharges :
--   - event_participant_count(e events) : reçoit la ligne "events" ENTIÈRE,
--     donc appelée en pratique comme colonne calculée PostgREST sur un
--     .select('*, event_participant_count') — la ligne "e" n'a pu être
--     lue par le client qu'après passage par la policy SELECT de "events"
--     (using (can_view_event(id))), donc aucun problème : par construction
--     on ne peut jamais recevoir "e" pour un événement qu'on n'a pas le
--     droit de voir. Confirmé par grep sur src/ : les 3 usages existants
--     (CommunitiesTab.jsx, EventsTab.jsx, FeedTab.jsx) passent tous par ce
--     chemin.
--   - event_participant_count(p_event_id uuid) : reçoit seulement un uuid,
--     "security definer", et ne vérifie RIEN — ni can_view_event(), ni
--     aucune autre garde. Cette surcharge n'est appelée nulle part côté
--     client, mais reste exécutable directement par n'importe quel
--     utilisateur connecté via
--     supabase.rpc('event_participant_count', { p_event_id: '<uuid> ' }),
--     ce qui contourne la policy SELECT de "events" et révèle le nombre de
--     participants d'un événement 'private' ou 'community' auquel
--     l'appelant n'a pas accès (il faut connaître/deviner l'uuid, mais
--     c'est exactement le même modèle de menace que user_risk_level()
--     avant son correctif). Sévérité plus faible que les autres correctifs
--     de cette session (un simple compte agrégé, jamais l'identité des
--     participants), mais même défaut de conception : aucune garde là où
--     la RLS de la table qu'elle contourne en a explicitement une.
--
-- Correctif : ajoute la même garde can_view_event() que join_event()/
-- accept_event_invitation() utilisent déjà pour ce genre de vérification.
-- Ne touche PAS la surcharge event_participant_count(e events), déjà saine
-- et utilisée en production par les 3 écrans ci-dessus — la modifier
-- casserait sans raison la colonne calculée. Idempotent (create or
-- replace) — à exécuter une fois dans Supabase SQL Editor, après
-- supabase-events-v2.sql.
-- ============================================================================

create or replace function event_participant_count(p_event_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select case when can_view_event(p_event_id)
    then (select count(*)::int from event_attendees where event_id = p_event_id and status = 'going')
    else null end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select event_participant_count('<uuid-dun-evenement-prive-auquel-tu-nas-pas-acces>');
-- -- doit renvoyer NULL pour un tel événement, et le vrai compte pour un
-- -- événement public ou auquel tu as accès.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-community-select-anon-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — policies RLS "communities" / "community_members" /
-- "event_staff" lisibles par le rôle "anon" (trouvé lors de l'audit
-- autonome du 2 septembre 2026, passage 149, angle : policies RLS des
-- tables sensibles, en complément de l'audit "security definer" du
-- passage 148 déjà déclaré exhaustif).
--
-- MÊME BUG que celui déjà identifié et corrigé pour "profiles" dans
-- supabase-scale-security.sql (§3, "🔴 CRITIQUE — profiles SELECT était
-- lisible par le rôle anon"), mais jamais reporté sur les policies
-- équivalentes créées ensuite dans supabase-communities.sql et
-- supabase-events-v2.sql :
--
--   - "communities" (supabase-communities.sql ligne ~81) :
--     create policy "Lecture publique des communautes"
--     on communities for select using (true);
--     Le commentaire juste au-dessus dit explicitement l'intention :
--     "select ouverte à tous les authentifiés" — mais la policy ne
--     restreint à aucun rôle (pas de "to authenticated"), donc "using
--     (true)" s'applique par défaut à TOUT rôle Postgres, "anon" inclus.
--     N'importe qui possédant la clé publique "anon" (embarquée dans le
--     build front, donc publique de fait) peut lister toutes les
--     communautés, y compris les communautés "private"/"invite_only"
--     (nom, description, ville, catégorie), sans aucun compte Baobab.
--
--   - "community_members" (supabase-communities.sql ligne ~113) :
--     create policy "Lecture publique des membres"
--     on community_members for select using (true);
--     Même défaut, conséquence plus grave : la liste NOMINATIVE des
--     membres de N'IMPORTE QUELLE communauté (y compris une communauté
--     privée créée pour un groupe vulnérable — statut migratoire,
--     orientation, communauté religieuse ou ethnique précise) est lisible
--     par quiconque, sans authentification. C'est exactement le type de
--     fuite de confidentialité déjà corrigé 17 fois lors des passages
--     précédents, jamais appliqué ici.
--
--   - "event_staff" (supabase-events-v2.sql ligne ~241) :
--     create policy "Lecture publique du staff d'evenement"
--     on event_staff for select using (true);
--     Le commentaire qui suit cette policy la décrit lui-même comme
--     "l'équivalent du bug corrigé en Phase 6 sur community_members" —
--     mais ce commentaire ne visait que la policy INSERT juste en dessous
--     (empêcher un client de s'auto-promouvoir organisateur), pas le
--     SELECT : le même oubli de restriction de rôle a donc été reproduit
--     ici au moment même où l'auteur pensait corriger l'équivalent du bug
--     "community_members".
--
-- Vérifié dans src/ : CommunitiesTab.jsx, EventsTab.jsx, FeedTab.jsx et
-- SocialShell.jsx (les seuls endroits qui lisent "communities",
-- "community_members" ou "event_staff") ne sont montés qu'à l'intérieur
-- de l'app authentifiée, jamais avant qu'une session existe (même garde
-- que celle déjà vérifiée pour "profiles" dans supabase-scale-security.sql
-- : session === null bloque tout chargement de données dans App.jsx) —
-- ce resserrement ne casse donc aucun usage réel de l'app, comme pour le
-- correctif original sur "profiles".
--
-- NE TOUCHE PAS : "events"/"event_attendees"/"event_invitations"/
-- "event_media" (visibilité déjà gérée finement par can_view_event(), où
-- la branche 'public' est délibérément ouverte à tout le monde — retirer
-- cet accès serait un choix produit, pas la correction d'un bug, donc
-- hors périmètre de ce correctif ciblé sur les policies "using (true)"
-- sans restriction de rôle).
--
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-communities.sql et supabase-events-v2.sql. Additif/idempotent,
-- ne touche aucune donnée existante — remplace seulement 3 policies par
-- leur équivalent restreint au rôle "authenticated".
-- ============================================================================

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'communities' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.communities', pol.policyname);
  end loop;

  create policy "Lecture des communautes par les utilisateurs connectes"
  on communities for select
  to authenticated
  using (true);
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'community_members' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.community_members', pol.policyname);
  end loop;

  create policy "Lecture des membres par les utilisateurs connectes"
  on community_members for select
  to authenticated
  using (true);
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_staff' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.event_staff', pol.policyname);
  end loop;

  create policy "Lecture du staff d'evenement par les utilisateurs connectes"
  on event_staff for select
  to authenticated
  using (true);
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, avec le client
-- "anon" — clé publique, PAS la clé service_role) :
-- select count(*) from communities;        -- doit échouer / renvoyer 0 lignes
-- select count(*) from community_members;  -- doit échouer / renvoyer 0 lignes
-- select count(*) from event_staff;        -- doit échouer / renvoyer 0 lignes
--
-- select policyname, roles, cmd from pg_policies
-- where tablename in ('communities','community_members','event_staff') and cmd = 'SELECT';
-- -- "roles" doit afficher {authenticated}, jamais {public}.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-message-reactions-select-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — policy RLS "message_reactions_select" lisible par n'importe
-- quel rôle et pour n'importe quelle conversation (trouvé lors de l'audit
-- autonome du 2 septembre 2026, passage 151, angle : policies INSERT/UPDATE/
-- DELETE des tables sensibles — cette fuite a été repérée en cours de route
-- en vérifiant les policies voisines de "message_reactions", et est trop
-- grave pour être laissée de côté au motif qu'elle est techniquement SELECT).
--
-- Définie dans supabase-messaging-2.sql (jamais modifié ici, voir consigne
-- "jamais modifier un fichier SQL déjà potentiellement exécuté en prod") :
--
--   create policy "message_reactions_select" on public.message_reactions
--   for select
--   using (exists (select 1 from public.messages m where m.id = message_reactions.message_id));
--
-- Deux défauts cumulés :
--
-- 1. Pas de "to authenticated" : la policy s'applique par défaut à TOUT
--    rôle Postgres, "anon" inclus — même bug que celui déjà corrigé pour
--    "communities"/"community_members"/"event_staff" dans
--    supabase-community-select-anon-fix.sql.
--
-- 2. Le "using" ne vérifie que l'EXISTENCE du message (m.id = ...), jamais
--    que l'appelant fait partie de la conversation. Le commentaire du
--    fichier d'origine dit vouloir "restreindre à ce qui appartient à sa
--    propre conversation" (voir supabase-messaging-2.sql ligne ~80), mais
--    le prédicat écrit ne le fait pas : n'importe quel utilisateur connecté
--    peut lire message_id/profile_id/emoji de TOUTES les réactions de TOUS
--    les messages de TOUTES les conversations de la plateforme.
--
-- Impact réel confirmé côté client (src/App.jsx) : la fonction
-- loadReactionsFor() s'appuie sur cette policy pour filtrer côté serveur
-- (elle ne fait AUCUN filtre applicatif par conversation sur la requête
-- .from("message_reactions").select(...).in("message_id", messageIds)), et
-- surtout l'abonnement realtime (src/App.jsx ~ligne 1975) s'abonne aux
-- événements INSERT/DELETE de TOUTE la table "message_reactions" sans
-- filtre serveur, en comptant explicitement sur cette policy pour ne
-- recevoir que ses propres conversations (commentaire ligne ~1971 :
-- "RLS (message_reactions_select) restreint déjà ce qui est livré à ce qui
-- appartient à mes propres conversations" — faux avec la policy actuelle).
-- Résultat : chaque client recevait en temps réel, pour CHAQUE réaction
-- ajoutée ou retirée par N'IMPORTE QUEL utilisateur sur la plateforme,
-- {message_id, profile_id, emoji} — une fuite de confidentialité
-- exploitable en inspectant simplement le trafic réseau/WebSocket du
-- navigateur, révélant qui échange avec qui et avec quelle réaction, bien
-- au-delà de ses propres conversations.
--
-- Correction : même prédicat que la policy SELECT canonique de "messages"
-- (supabase-protect-rls.sql) — le profil de l'appelant doit figurer dans le
-- match_key du message concerné — et restriction explicite au rôle
-- "authenticated". Aucun changement requis côté React : le filtre
-- applicatif existant (par messageIds chargés) reste une protection
-- supplémentaire légitime, RLS redevient simplement la barrière réelle
-- qu'elle était censée être.
--
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-messaging-2.sql. Additif/idempotent, ne touche aucune donnée
-- existante — remplace uniquement la policy SELECT de message_reactions.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'message_reactions' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.message_reactions', pol.policyname);
  end loop;

  create policy "message_reactions_select"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and (select id from public.profiles where user_id = auth.uid())::text
          = any (string_to_array(m.match_key, '__'))
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, avec le client
-- "anon" — clé publique, PAS la clé service_role) :
-- select count(*) from message_reactions;
-- -- doit échouer / renvoyer 0 lignes pour "anon".
--
-- Avec une session authentifiée n'appartenant à AUCUNE conversation
-- concernée :
-- select * from message_reactions where message_id = <id d'un message
--   d'une conversation étrangère>;
-- -- doit renvoyer 0 ligne.
--
-- select policyname, roles, cmd, qual from pg_policies
-- where tablename = 'message_reactions' and cmd = 'SELECT';
-- -- "roles" doit afficher {authenticated}, jamais {public}.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-admin-search-escape-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — admin_search_users() : jokers ILIKE ("%"/"_") non échappés
-- dans la recherche admin (trouvé lors de l'audit autonome du 2 septembre
-- 2026, dernier passage, angle "autres endroits qui font une recherche
-- ILIKE/.or() sans passer par escapeLikePattern/escapeOrFilterValue" — même
-- classe de bug que celui corrigé côté client dans CommunitiesTab.jsx /
-- EventsTab.jsx / SocialShell.jsx, mais ici côté serveur).
--
-- admin_search_users(p_query) (supabase-admin.sql, ~ligne 320) construit le
-- pattern ILIKE ainsi :
--   p.name ilike '%' || p_query || '%'
-- p_query est un paramètre lié (via supabase.rpc), donc AUCUNE injection SQL
-- n'est possible ici — mais "%" et "_" restent des jokers du moteur
-- ILIKE/LIKE de Postgres même une fois la valeur liée : si un·e
-- modérateur·rice/admin cherche un nom contenant littéralement "_" (assez
-- courant dans un pseudo/handle, ex. "jean_dupont") ou "%", ces caractères
-- sont interprétés comme "n'importe quel caractère" / "n'importe quelle
-- suite de caractères" au lieu du texte exact saisi — la recherche renvoie
-- alors des profils qui ne correspondent pas à la saisie littérale
-- (résultats trop larges, silencieusement).
--
-- Correctif : échapper "\", "%" et "_" dans p_query avant de construire le
-- pattern (même ordre que escapeLikePattern côté JS dans
-- src/lib/searchQuery.js — backslash en premier car c'est le caractère
-- d'échappement lui-même). Aucun ajout de clause "escape" nécessaire :
-- backslash est déjà le caractère d'échappement par défaut de LIKE/ILIKE en
-- Postgres. Pas de risque d'erreur 400 façon PGRST100 ici (pas de
-- .or()/virgule impliqué, une seule condition ILIKE simple) — seul
-- escapeLikePattern a un équivalent utile côté SQL, pas escapeOrFilterValue.
-- Idempotent (create or replace) — à exécuter une fois dans Supabase SQL
-- Editor, après supabase-admin.sql.
-- ============================================================================

create or replace function admin_search_users(p_query text default '')
returns table (
  id uuid, name text, avatar_url text, created_at timestamptz,
  role text, suspended_until timestamptz, banned_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select p.id, p.name, p.avatar_url, p.created_at,
      platform_role(p.id), p.suspended_until, p.banned_at
    from profiles p
    where p_query = '' or p.name ilike '%' ||
      replace(replace(replace(p_query, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by p.created_at desc
    limit 100;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- -- créer/renommer temporairement un profil de test en "test_user" puis :
-- select name from admin_search_users('test_user');
-- -- doit renvoyer uniquement "test_user" (pas tout profil dont le nom
-- -- contiendrait "test" + un caractère + "user"), en étant connecté avec un
-- -- compte modérateur+.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-admin-dashboard-stats-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — conflit de migrations non fusionnées sur admin_dashboard_stats()
-- (trouvé lors de l'audit autonome du 1er septembre 2026, passage 59,
-- section AdminDashboard.jsx).
--
-- Quatre fichiers redéfinissent admin_dashboard_stats() via
-- "create or replace function" au fil des sessions :
--   1. supabase-admin.sql (base) : total_users/suspended_users/banned_users/
--      open_reports(4 sources)/pending_info_review.
--   2. supabase-premium-messaging.sql : ajoute "monetization".
--   3. supabase-profile-reports-moderation.sql : ajoute les signalements de
--      profil (table "reports") à open_reports, et FUSIONNE bien
--      "monetization" (voir son propre commentaire — c'était déjà un
--      correctif d'un conflit précédent, commit 8e0778c).
--   4. supabase-beta-feedback-admin.sql (exécuté le plus récemment) : ajoute
--      "open_feedback"/"critical_feedback", mais est reparti de la version
--      DE BASE (1) — sans "monetization" et sans les signalements de profil
--      dans open_reports. Son "create or replace" écrase donc silencieusement
--      les deux : le champ "monetization" disparaît du JSON, et le compteur
--      "Signalements ouverts" du dashboard admin sous-compte en excluant les
--      signalements de profil (rencontre/messagerie — la catégorie la plus
--      sensible : harcèlement, arnaque entre deux personnes mises en
--      relation), alors que l'onglet "Signalements" (admin_list_reports, lui
--      non touché par ce fichier) les affiche bien. Incohérence visible :
--      des signalements de profil ouverts apparaissent dans la liste mais ne
--      sont pas comptés dans la carte de stats "Signalements ouverts".
--
-- Ce fichier fusionne les quatre pour de bon. Idempotent (create or
-- replace) — à exécuter une fois dans Supabase SQL Editor, après les
-- quatre fichiers ci-dessus.
-- ============================================================================

create or replace function admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  select jsonb_build_object(
    'total_users', (select count(*) from profiles),
    'suspended_users', (select count(*) from profiles where suspended_until is not null and suspended_until > now()),
    'banned_users', (select count(*) from profiles where banned_at is not null),
    'open_reports', (
      (select count(*) from community_reports where status = 'open') +
      (select count(*) from event_reports where status = 'open') +
      (select count(*) from post_reports where coalesce(status,'open') = 'open') +
      (select count(*) from info_reports where status = 'open') +
      (select count(*) from reports where status = 'open')
    ),
    'pending_info_review', (select count(*) from info_articles where status = 'pending_review'),
    'monetization', (select jsonb_build_object(
      'enabled', monetization_enabled,
      'threshold', premium_threshold,
      'free_message_limit', free_message_limit
    ) from app_config),
    'open_feedback', (select count(*) from beta_feedback where status not in ('resolu','ferme')),
    'critical_feedback', (select count(*) from beta_feedback where priority = 'critique' and status not in ('resolu','ferme'))
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select admin_dashboard_stats(); -- doit contenir monetization + open_feedback + critical_feedback,
--                                 -- et open_reports doit inclure les signalements de profil.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-admin-lists-limit-fix.sql
-- ============================================================================
-- ============================================================================
-- Plafonne les résultats de admin_list_reports() et admin_list_feedback(),
-- les deux seules RPC admin (avec admin_search_users, déjà plafonnée à 100
-- lignes) à renvoyer une liste complète sans aucune limite. Le tableau de
-- bord (AdminDashboard.jsx) n'a ni pagination ni "charger plus" : il rend
-- purement et simplement tout ce que la RPC retourne. Tant que les
-- signalements/retours restent peu nombreux ça ne se voit pas, mais rien
-- n'empêchait ces deux requêtes de charger des milliers de lignes d'un coup
-- (tous les signalements "ouverts" jamais traités, tout l'historique de
-- retours bêta) le jour où l'app grossit — page qui se fige, mémoire
-- navigateur qui explose. À exécuter dans Supabase : SQL Editor. Additif
-- uniquement (create or replace), ne change aucune donnée.
--
-- CORRIGÉ avant exécution (audit du 3 septembre 2026, croisement des
-- migrations SQL les plus récentes) : la première version de ce fichier
-- repartait de la définition de base d'admin_list_reports() (celle de
-- supabase-admin.sql, "order by created_at desc" simple) pour y ajouter
-- "limit 200" — exactement le même type d'oubli que celui déjà corrigé
-- pour admin_dashboard_stats() dans supabase-admin-dashboard-stats-fix.sql
-- (migration non fusionnée avec une évolution plus récente de la même
-- fonction). Ce faisant, elle effaçait silencieusement le tri par priorité
-- ajouté par supabase-report-minor-category.sql (mineur_suspecte, puis
-- arnaque, puis harcelement, TOUJOURS avant les autres catégories, quel
-- que soit l'horodatage — voir ReportModal.jsx et le commentaire de ce
-- fichier). adminApi.js (listReports) et AdminDashboard.jsx affichent les
-- signalements exactement dans l'ordre renvoyé par la RPC, sans aucun tri
-- côté client : sans ce correctif, un signalement "mineur suspecté" se
-- serait retrouvé noyé dans la liste par simple ordre chronologique, alors
-- que c'est justement la catégorie qui doit remonter en tête de file de
-- modération. La version ci-dessous restaure ce tri par priorité et
-- ajoute la limite par-dessus.
-- ============================================================================

create or replace function admin_list_reports(p_status text default 'open')
returns table (
  source text, id uuid, target_type text, target_id text, from_id uuid,
  category text, reason text, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select 'community'::text, cr.id, cr.target_type, cr.target_id::text, cr.from_id, cr.category, cr.reason, cr.status, cr.created_at
    from community_reports cr where cr.status = p_status
    union all
    select 'event'::text, er.id, 'event'::text, er.event_id::text, er.from_id, er.category, er.reason, er.status, er.created_at
    from event_reports er where er.status = p_status
    union all
    select 'post'::text, pr.id, pr.target_type, pr.target_id::text, pr.from_id, pr.category, pr.reason, coalesce(pr.status,'open'), pr.created_at
    from post_reports pr where coalesce(pr.status,'open') = p_status
    union all
    select 'info'::text, ir.id, 'info_article'::text, ir.article_id::text, ir.from_id, ir.category, ir.reason, ir.status, ir.created_at
    from info_reports ir where ir.status = p_status
    union all
    select 'profile'::text, r.id, 'profile'::text, r.to_id::text, r.from_id, r.category, r.reason, r.status, r.created_at
    from reports r where r.status = p_status
    order by
      case category when 'mineur_suspecte' then 0 when 'arnaque' then 1 when 'harcelement' then 2 else 3 end,
      created_at desc
    limit 200;
end;
$$;

create or replace function admin_list_feedback(p_status text default null)
returns table (
  id uuid, profile_id uuid, author_name text, message text, category text,
  categories text[], priority text, status text, screen text, device text,
  browser text, app_version text, admin_notes text, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  return query
    select bf.id, bf.profile_id, p.name, bf.message, bf.category, bf.categories,
           bf.priority, bf.status, bf.screen, bf.device, bf.browser, bf.app_version,
           bf.admin_notes, bf.created_at, bf.updated_at
    from beta_feedback bf
    join profiles p on p.id = bf.profile_id
    where p_status is null or bf.status = p_status
    order by
      case bf.priority when 'critique' then 0 when 'elevee' then 1 when 'moyenne' then 2 else 3 end,
      bf.created_at desc
    limit 200;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select count(*) from admin_list_reports('open'); -- doit être <= 200
-- select count(*) from admin_list_feedback(null);  -- doit être <= 200
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-block-bypass-fix.sql
-- ============================================================================
-- ============================================================================
-- Correctif — contournement du blocage via likes / follows / favorites /
-- invitations d'événement.
--
-- CONTEXTE : la policy INSERT de "messages" (supabase-scale-security.sql)
-- vérifie déjà qu'aucun blocage n'existe entre les deux profils dans un sens
-- ou l'autre avant d'autoriser l'envoi. Mais en croisant ce même pattern sur
-- les tables sœurs qui créent aussi une interaction dirigée vers une autre
-- personne (likes, follows, favorites, event_invitations), AUCUNE d'elles ne
-- fait ce contrôle : leur policy INSERT vérifie seulement que l'auteur agit
-- en son propre nom (auth.uid() = ... from_id), jamais l'absence de blocage.
--
-- IMPACT CONCRET : le filtrage "blockedIds" dans l'app (SocialShell.jsx,
-- App.jsx, matchingService.js) est fait CÔTÉ CLIENT — il masque les profils
-- bloqués dans les listes affichées, mais ne protège en rien contre un appel
-- direct à l'API Supabase (fetch/Postgrest) avec un to_id/invited_profile_id
-- arbitraire. Concrètement, une personne qui vient d'être bloquée par sa
-- victime peut TOUJOURS, par ce chemin détourné :
--   - la liker à nouveau (table "likes"),
--   - s'abonner à elle (table "follows", ce qui déclenche une notification
--     "new_follower" — donc un contact indirect malgré le blocage),
--   - l'ajouter à ses favoris (table "favorites"),
--   - l'inviter à un événement si un like mutuel existait avant le blocage,
--     ou si les deux sont membres de la même communauté (table
--     "event_invitations" — déclenche aussi une notification "event_invite").
--
-- CORRECTIF : réplique exactement le garde-fou "not exists (select 1 from
-- blocks where ...)" déjà utilisé pour "messages" sur ces 4 tables. Additif
-- et sans risque de régression : un utilisateur non bloqué n'est jamais
-- affecté, la condition n'ajoute qu'un NOT EXISTS supplémentaire aux checks
-- déjà en place.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "likes" — un blocage (dans un sens ou l'autre) empêche désormais tout
-- nouveau like entre les deux profils.
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "follows" — idem : impossible de s'abonner à quelqu'un avec qui un
-- blocage existe (dans un sens ou l'autre).
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 3. "favorites" — idem.
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
  );
end $$;

-- ----------------------------------------------------------------------------
-- 4. "event_invitations" — un like mutuel antérieur au blocage (branche
-- "connexion réelle") ou une appartenance commune à une communauté (branche
-- communautaire) restaient tous deux exploitables après blocage. Ajout du
-- même garde-fou sur les deux branches du OR existant.
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

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('likes','follows','favorites','event_invitations');
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-report-rate-limit-fix.sql
-- ============================================================================
-- ============================================================================
-- Limite de débit sur "reports" (signalements) — même croisement que les
-- rate limits déjà en place sur messages/likes/follows/event_invitations
-- (supabase-scale-security-2.sql, supabase-like-rate-limit.sql,
-- supabase-events-v2.sql) : "reports" était la seule table d'action dirigée
-- vers un autre profil à n'avoir AUCUNE limite de débit ni contrainte
-- d'unicité (from_id, to_id) — un script pouvait signaler la même victime
-- (ou n'importe qui) en boucle par appel direct à l'API PostgREST,
-- inondant la file de modération (AdminDashboard, onglet "Signalements")
-- de doublons et rendant plus difficile le repérage des vrais signalements.
--
-- Plafond généreux (20 signalements/24h) : un usage normal ne signale
-- jamais plus de quelques profils par jour ; ce garde-fou ne vise que le
-- script en boucle. Même style exact que check_like_rate_limit()/
-- check_follow_rate_limit() (SECURITY DEFINER + search_path fixé).
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
  return new;
end; $$;
drop trigger if exists trg_report_rate_limit on reports;
create trigger trg_report_rate_limit before insert on reports
for each row execute function check_report_rate_limit();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname = 'check_report_rate_limit';
-- select tgname from pg_trigger where tgname = 'trg_report_rate_limit';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-events-duration-guard.sql
-- ============================================================================
-- ============================================================================
-- Corrige un bug identifié à l'audit (passage 74) : duration_minutes n'a
-- jamais eu de contrainte serveur, contrairement à max_participants
-- (events_max_participants_positive, supabase-events-v2.sql). Le formulaire
-- client (EventCreateForm/EventEditForm) utilise un <input type="number"
-- min="1">, mais l'attribut "min" n'empêche pas de taper "-30" ou "0" au
-- clavier — ce n'est qu'une aide native de <form>, jamais déclenchée ici
-- (soumission par onClick, pas par submit). Une durée négative ou nulle
-- était donc acceptée SILENCIEUSEMENT par create_event() et par l'UPDATE
-- direct d'EventEditForm, avec deux conséquences visibles :
--   - durationLabel() (EventDetailView.jsx) affichait des valeurs absurdes
--     comme "-1 h -30" pour une durée de -30 minutes (le modulo JS conserve
--     le signe du dividende) ;
--   - l'export .ics (calendarExport.js) calculait une heure de fin
--     ANTÉRIEURE à l'heure de début.
-- Le correctif client (garde côté formulaire) est déjà en place ; ce script
-- ajoute la garde serveur manquante, symétrique à celle de
-- max_participants, pour bloquer aussi tout appel direct à l'API/RPC.
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Contrainte table — symétrique à events_max_participants_positive.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_duration_minutes_positive') then
    alter table events add constraint events_duration_minutes_positive
      check (duration_minutes is null or duration_minutes > 0);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. create_event() — restate complet (signature avec p_timezone, la plus
-- récente : supabase-events-timezone.sql), ajout de la validation
-- p_duration_minutes juste à côté de celle de p_max_participants.
-- ----------------------------------------------------------------------------
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
-- SOURCE : supabase-communities-4.sql
-- ============================================================================
-- ============================================================================
-- Phase — Baobab Communautés — correctif réactions multi-emoji.
-- À exécuter dans Supabase : SQL Editor (une fois), APRÈS supabase-communities.sql,
-- supabase-communities-2.sql et supabase-communities-3.sql.
-- ============================================================================
-- Bug corrigé : CommunitiesTab.jsx (handleReact) changeait la réaction d'un
-- membre sur une publication de communauté via un DELETE puis un INSERT
-- séparés (supabase-communities-3.sql avait choisi ce motif en notant
-- "aucune policy UPDATE requise"). Problème : ce sont deux requêtes réseau
-- distinctes, pas une transaction. Si le DELETE réussit et que l'INSERT
-- échoue ensuite (coupure réseau, l'utilisateur ferme l'onglet, etc.), le
-- code applicatif restaure l'ancienne réaction seulement dans l'état React
-- local (catch), alors qu'en base la ligne a bel et bien été supprimée : la
-- réaction affichée à l'écran n'existe plus côté serveur et disparaît sans
-- action de l'utilisateur au prochain chargement de la communauté.
--
-- Correctif : une seule requête UPDATE de la ligne existante (post_id +
-- profile_id est unique, voir supabase-communities.sql) quand on change
-- d'émoji sur une réaction déjà posée — DELETE seul pour retirer sa
-- réaction, INSERT seul pour une toute première réaction, comme avant.
-- Nécessite la policy UPDATE ci-dessous, absente jusqu'ici.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_post_likes' and cmd='UPDATE' loop
    execute format('drop policy %I on public.community_post_likes', pol.policyname);
  end loop;

  -- Changer d'émoji sur sa propre réaction — jamais celle d'un tiers.
  create policy "Modifier sa propre reaction"
  on community_post_likes for update
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd from pg_policies where tablename='community_post_likes';


-- ============================================================================
-- SOURCE : supabase-user-locations-rls-hardening.sql
-- ============================================================================
-- ============================================================================
-- Filet de sécurité pour l'erreur console non expliquée :
--   GET /rest/v1/user_locations?select=* → 400
--
-- Contexte de l'investigation (passage 83, audit continu) :
-- - current_profile_id() existe bel et bien (défini dans supabase-communities.sql)
--   mais n'est PAS utilisé par user_locations : ses policies comparent
--   directement auth.uid() = user_id (voir supabase-geolocation.sql). Piste
--   écartée.
-- - Aucun autre fichier .sql du dépôt ne redéfinit la table ou les policies
--   de user_locations de façon incompatible. Piste écartée.
-- - Testé avec la version installée de @supabase/postgrest-js (2.112.3) :
--   .maybeSingle() n'envoie plus l'en-tête Accept:
--   application/vnd.pgrst.object+json (comportement des anciennes versions)
--   — la requête part comme un GET tout ce qu'il y a de plus normal, sans
--   filtre, et le tri "0 ou 1 ligne" se fait côté client. Piste écartée.
-- - Un seul appel dans tout le code (src/lib/locationApi.js:fetchMyLocation)
--   fait ce SELECT ; aucune autre syntaxe concurrente trouvée. Piste écartée.
-- - numeric(6,2) est cohérent avec les plages lat/lng réellement utilisées,
--   et de toute façon une contrainte numeric ne peut jamais faire échouer un
--   SELECT (seulement une écriture) — piste écartée par construction.
-- - Testé en direct (curl, requête anonyme, sans session) :
--   GET .../user_locations?select=* → 200 [] : confirme que la table, ses
--   colonnes et les droits de base sont sains pour le rôle "anon".
-- - Reproduit qu'une erreur Postgres de classe 42 (colonne/fonction
--   inexistante) est bien ce qui produit un vrai 400 chez PostgREST (testé
--   avec une colonne volontairement inventée : {"code":"42703", ...} → 400).
--   Un JWT invalide/expiré donne systématiquement 401 (PGRST301), jamais 400
--   — donc la piste "session pas encore prête" est écartée.
--
-- Hypothèse retenue, non vérifiable sans accès direct à la base de
-- production (aucune clé service_role disponible ici, et la création d'un
-- compte de test pour forger un JWT authentifié est une action interdite
-- pour cet agent) : une policy RLS ou un droit (GRANT) ajouté un jour
-- directement depuis le tableau de bord Supabase — donc invisible dans ce
-- dépôt — s'applique spécifiquement au rôle "authenticated" et référence une
-- colonne qui n'existe plus (ou n'a jamais existé), ce qui expliquerait
-- pourquoi seule une requête *authentifiée* échoue alors que la requête
-- anonyme équivalente réussit.
--
-- Ce script est idempotent et sans risque : il supprime TOUTES les policies
-- actuellement posées sur public.user_locations (quel que soit leur nom,
-- y compris une éventuelle policy fantôme créée hors dépôt) puis recrée
-- exactement les 4 policies canoniques de supabase-geolocation.sql, et
-- pose des GRANT explicites pour éliminer toute dérive de droits.
-- À exécuter une fois dans Supabase : SQL Editor.
-- ============================================================================

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_locations'
  loop
    execute format('drop policy if exists %I on public.user_locations', pol.policyname);
  end loop;
end $$;

create policy "user_locations_select_own" on public.user_locations
  for select using (auth.uid() = user_id);

create policy "user_locations_insert_own" on public.user_locations
  for insert with check (auth.uid() = user_id);

create policy "user_locations_update_own" on public.user_locations
  for update using (auth.uid() = user_id);

create policy "user_locations_delete_own" on public.user_locations
  for delete using (auth.uid() = user_id);

-- Droits explicites (au cas où le GRANT initial aurait été partiel ou
-- posé au niveau colonne depuis le tableau de bord) — RLS reste la seule
-- barrière réelle, ces GRANT ne donnent accès à aucune ligne d'un autre
-- utilisateur.
grant select, insert, update, delete on public.user_locations to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, roles, cmd, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 'user_locations';
-- select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'user_locations';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-profile-text-length-guard-fix.sql
-- ============================================================================
-- ============================================================================
-- Corrige un bug d'audit (profil/matching, passage de nettoyage
-- focus-visible + exploration matching/EditProfileForm) : plusieurs champs
-- texte libre de "profiles" (name, last_name, country, province, city,
-- occupation, arrival_city) n'avaient AUCUNE limite de longueur, ni côté
-- client (EditProfileForm.jsx, Step1Identity.jsx, Step3Location.jsx,
-- Step4CanadaJourney.jsx — contrairement à "bio", limitée à 300 caractères
-- des deux côtés) ni côté serveur (colonnes "text" sans contrainte, voir
-- supabase-schema.sql). Un utilisateur pouvait donc coller un texte
-- arbitrairement long (des dizaines de milliers de caractères) dans
-- "Prénom" ou "Ville" : ce texte est ensuite affiché tel quel sur de
-- nombreuses cartes/badges dans toute l'app (Discover, MatchCard,
-- PublicProfileModal, filtres...), et sert aussi de donnée d'entrée au
-- calcul de compatibilité (matchingService.js) — au mieux une mise en page
-- cassée, au pire une base gonflée inutilement.
--
-- Le correctif client (maxLength sur chaque <input>) est déjà en place ;
-- ce script ajoute la garde serveur symétrique manquante, sur le même
-- modèle que events_duration_minutes_positive
-- (supabase-events-duration-guard.sql) — idempotent, sans jamais valider
-- rétroactivement les lignes déjà en base (NOT VALID : les profils
-- existants, même hors bornes, ne sont jamais bloqués en lecture ni cassés
-- par ce script ; seules les prochaines écritures sont contrôlées).
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_length') then
    alter table profiles add constraint profiles_name_length
      check (char_length(name) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_last_name_length') then
    alter table profiles add constraint profiles_last_name_length
      check (last_name is null or char_length(last_name) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_country_length') then
    alter table profiles add constraint profiles_country_length
      check (country is null or char_length(country) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_province_length') then
    alter table profiles add constraint profiles_province_length
      check (province is null or char_length(province) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_city_length') then
    alter table profiles add constraint profiles_city_length
      check (city is null or char_length(city) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_occupation_length') then
    alter table profiles add constraint profiles_occupation_length
      check (occupation is null or char_length(occupation) <= 120) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_arrival_city_length') then
    alter table profiles add constraint profiles_arrival_city_length
      check (arrival_city is null or char_length(arrival_city) <= 80) not valid;
  end if;
end $$;

-- Optionnel, une fois toutes les lignes existantes vérifiées propres :
-- valider réellement les contraintes ci-dessus (les rend opposables aux
-- lignes déjà en base, pas seulement aux futures écritures) :
--   alter table profiles validate constraint profiles_name_length;
--   alter table profiles validate constraint profiles_last_name_length;
--   alter table profiles validate constraint profiles_country_length;
--   alter table profiles validate constraint profiles_province_length;
--   alter table profiles validate constraint profiles_city_length;
--   alter table profiles validate constraint profiles_occupation_length;
--   alter table profiles validate constraint profiles_arrival_city_length;


-- ============================================================================
-- SOURCE : supabase-post-media.sql
-- ============================================================================
-- ============================================================================
-- post_media — galerie multi-photos/vidéos pour le fil général (Feed). À
-- exécuter dans Supabase : SQL Editor, après supabase-feed-posts.sql (fournit
-- la table posts et current_profile_id()).
-- ============================================================================
-- posts.media_url/media_kind (colonnes uniques, une seule pièce jointe par
-- publication) restent en place pour les publications déjà existantes — le
-- nouveau composeur (refonte multi-médias) écrit désormais dans cette table
-- séparée à la place, sans supprimer ni migrer les anciennes lignes. Le
-- rendu (PostCard.jsx) lit post_media en priorité et retombe sur
-- media_url/media_kind si post_media est vide, pour ne rien casser sur les
-- publications déjà publiées.

create table if not exists post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  url text not null,
  kind text not null check (kind in ('photo', 'video')),
  position int not null default 0,
  created_at timestamptz default now()
);
alter table post_media enable row level security;
create index if not exists idx_post_media_post on post_media(post_id, position);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='post_media' loop
    execute format('drop policy %I on public.post_media', pol.policyname);
  end loop;

  -- Même motif que posts : lecture ouverte à tout utilisateur authentifié,
  -- écriture/suppression réservées à l'auteur de la publication parente
  -- (post_media n'a pas sa propre colonne author_id, on la dérive de posts).
  create policy "Lecture des medias par tout utilisateur authentifie"
  on post_media for select
  to authenticated
  using (true);

  create policy "Ajouter un media a sa propre publication"
  on post_media for insert
  to authenticated
  with check (
    exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = current_profile_id())
  );

  create policy "Supprimer un media de sa propre publication"
  on post_media for delete
  to authenticated
  using (
    exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = current_profile_id())
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename='post_media';
-- select policyname from pg_policies where schemaname='public' and tablename='post_media';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-post-media-bucket-limit-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — bucket Storage "post-media" sans file_size_limit ni
-- allowed_mime_types (trouvé lors de l'audit autonome du 3 septembre 2026,
-- angle "cohérence limite de taille affichée au client vs limite réellement
-- appliquée côté Storage").
--
-- supabase-feed-posts.sql (déjà exécuté en prod) crée le bucket "post-media"
-- ainsi :
--   insert into storage.buckets (id, name, public)
--   values ('post-media', 'post-media', true)
--   on conflict (id) do nothing;
-- — sans file_size_limit (NULL = illimité côté serveur) ni allowed_mime_types
-- (NULL = tout type accepté). C'est le SEUL bucket du projet dans ce cas :
-- "avatars", "chat-media", "community-media", "event-media" et
-- "event-covers" ont tous les deux réglés dès leur création (ou corrigés
-- ensuite, voir supabase-stories-2.sql qui a déjà comblé exactement ce même
-- trou pour "avatars" avec ce commentaire : "vaut NULL (illimite) en
-- production : aucune limite serveur ne protegeait contre un contournement
-- de la validation cote client").
--
-- PostsFeed.jsx (composeur multi-médias du fil général) valide côté client
-- via validateMediaFile(file, "image"|"video") — src/lib/mediaConstants.js :
-- image ≤ 8 Mo (jpeg/png/webp/gif), vidéo ≤ 50 Mo (mp4/webm/quicktime).
-- L'utilisateur voit donc "Fichier trop volumineux (max 8 Mo / 50 Mo)" —
-- mais rien ne l'empêchait, en contournant ce contrôle client (DevTools,
-- appel direct à l'API Storage avec le JWT du navigateur), d'envoyer un
-- fichier de n'importe quelle taille et de n'importe quel type (exécutable,
-- script, etc.) vers ce bucket rendu PUBLIC en lecture. Écart trompeur
-- entre le message affiché et la limite réellement appliquée.
--
-- Correctif : aligne "post-media" sur les mêmes MIME autorisés que le
-- composeur (image + vidéo) et sur le plafond serveur déjà utilisé pour les
-- autres buckets mixtes image/vidéo (50 Mo — chat-media, community-media,
-- avatars). Additif, ne touche aucun fichier déjà uploadé (une limite plus
-- basse sur un bucket existant ne s'applique qu'aux futurs uploads, jamais
-- rétroactivement aux objets déjà stockés). À exécuter dans Supabase :
-- SQL Editor, après supabase-feed-posts.sql.
-- ============================================================================

update storage.buckets
set file_size_limit = 52428800, -- 50 Mo, même plafond serveur que chat-media/community-media/avatars
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id = 'post-media';

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'post-media';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-likes-realtime-replica-identity-fix.sql
-- ============================================================================
-- ============================================================================
-- Complète le correctif "sessions multiples" apporté à App.jsx (abonnement
-- Realtime "likes-received:<id>") : un retrait de like (handleUnlike) fait
-- sur un appareil/onglet ne se répercutait pas sur les autres sessions
-- ouvertes du même compte avant un rechargement complet — hasLiked()
-- restait donc à tort "vrai" ailleurs pour un profil qu'on venait pourtant
-- de "déliker".
--
-- Le nouvel écouteur DELETE (filter from_id=eq.<moi>) ajouté côté client a
-- besoin de lire payload.old.to_id pour savoir QUEL like a été retiré. Par
-- défaut (REPLICA IDENTITY DEFAULT), Postgres/Supabase Realtime n'inclut
-- dans "old" QUE les colonnes de la clé primaire lors d'un DELETE — ici
-- seulement "id" (bigint identity), jamais from_id/to_id (voir
-- supabase-schema.sql : "id bigint ... primary key, from_id uuid, to_id
-- uuid, unique(from_id, to_id)" — from_id/to_id ne sont qu'une contrainte
-- UNIQUE, pas la clé primaire). Sans ce script, l'écouteur DELETE ajouté
-- reste donc inerte (payload.old.to_id toujours undefined) : aucune
-- régression, mais le correctif "unlike" ne prend pas effet tant que ce
-- script n'est pas exécuté.
--
-- Même famille de correctif que le composite primary key de
-- message_reactions (supabase-messaging-2.sql) qui permet déjà à son propre
-- écouteur DELETE de lire payload.old.message_id/profile_id sans ce réglage
-- — "likes" n'a pas cette chance (clé primaire à colonne unique), donc on
-- élargit explicitement la réplique via REPLICA IDENTITY FULL. Impact :
-- légèrement plus de données transitent dans le flux de réplication/
-- Realtime pour cette table (toutes les colonnes au lieu de la seule clé),
-- négligeable vu le volume et la taille des lignes de "likes".
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

alter table public.likes replica identity full;


-- ============================================================================
-- SOURCE : supabase-follows-favorites-blocks-passes-realtime-fix.sql
-- ============================================================================
-- ============================================================================
-- Complète le correctif "sessions multiples" apporté à SocialShell.jsx
-- (canaux Realtime "favorites-own:<id>" et "follows-own:<id>") et à App.jsx
-- (canal "blocks-passes-own:<id>") : un favori/abonnement/blocage/passe
-- retiré (DELETE) sur un appareil/onglet ne se répercutait pas sur les
-- autres sessions ouvertes du même compte avant un rechargement complet.
--
-- Même cause que supabase-likes-realtime-replica-identity-fix.sql (voir ce
-- fichier pour l'explication détaillée) : "favorites", "follows" et
-- "blocks" ont une clé primaire à colonne unique ("id uuid"), from_id/to_id
-- n'étant qu'une contrainte UNIQUE — donc par défaut (REPLICA IDENTITY
-- DEFAULT), un DELETE ne transmet dans payload.old QUE "id", jamais
-- from_id/to_id. Sans ce script, les écouteurs DELETE ajoutés côté client
-- restent inertes (payload.old.to_id toujours undefined) : aucune
-- régression, mais le retrait d'un favori/abonnement/blocage fait sur un
-- autre appareil ne se propage pas tant que ce script n'est pas exécuté.
--
-- "passes" est inclus par cohérence (même canal côté client, même famille de
-- table que "likes") même si seul un écouteur INSERT y est ajouté pour
-- l'instant côté App.jsx (aucune action "retirer un passe" n'existe dans
-- l'app) — élargir sa réplique maintenant évite d'avoir à revenir dessus si
-- un DELETE y est ajouté plus tard.
--
-- Ajoute aussi ces 4 tables à la publication "supabase_realtime" si elles n'y
-- sont pas déjà (condition nécessaire, en plus de REPLICA IDENTITY, pour que
-- postgres_changes reçoive quoi que ce soit — voir supabase-realtime-
-- messages.sql où "messages" avait le même trou). Bloc conditionnel car
-- "alter publication ... add table" échoue si la table y est déjà (ce qui
-- est possible pour "favorites"/"follows"/"blocks" : leurs bugs corrigés
-- précédemment, comme la modale "Comptes bloqués", laissent penser qu'elles
-- y sont peut-être déjà — on ne peut pas le savoir sans interroger la base).
--
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

alter table public.favorites replica identity full;
alter table public.follows replica identity full;
alter table public.blocks replica identity full;
alter table public.passes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'favorites'
  ) then
    alter publication supabase_realtime add table public.favorites;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'follows'
  ) then
    alter publication supabase_realtime add table public.follows;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'blocks'
  ) then
    alter publication supabase_realtime add table public.blocks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'passes'
  ) then
    alter publication supabase_realtime add table public.passes;
  end if;
end $$;

