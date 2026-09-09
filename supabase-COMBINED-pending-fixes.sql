-- ============================================================================
-- SCRIPT CONSOLIDÉ — tous les correctifs SQL en attente (37 fichiers)
-- Régénéré le 2026-09-09 (fin d'après-midi) pour ajouter un fichier manquant
-- trouvé lors d'un audit de vérification empirique (curl) : les fonctions
-- admin_dashboard_stats()/admin_list_reports() référencent reports.status,
-- une colonne ajoutée par supabase-profile-reports-moderation.sql — un
-- fichier ANTÉRIEUR à cette session (22 août) qui n'avait jamais été inclus
-- dans les scripts consolidés précédents. Confirmé en direct contre la
-- prod : ces deux fonctions échouent aujourd'hui même pour un vrai
-- modérateur (erreur 42703 "column status does not exist").
--
-- ⚠️ ORDRE IMPORTANT ET VOLONTAIRE — ne pas réordonner les sections
-- manuellement :
-- 1. "get_my_likers()/get_liker_profile_reveal()" apparaissent 3 fois —
--    seule la DERNIÈRE occurrence (supabase-likers-profile-overexposure-fix.sql)
--    doit rester active, elle seule filtre les colonnes sensibles.
-- 2. Les triggers de colonnes de confiance de "profiles" apparaissent 2
--    fois — la seconde (INSERT+UPDATE) doit gagner sur la première (UPDATE
--    seul), sans quoi l'auto-attribution Premium/Fondateur à l'inscription
--    redevient possible.
-- 3. supabase-profile-reports-moderation.sql (nouveau dans cette version)
--    doit s'exécuter AVANT supabase-admin-dashboard-stats-fix.sql et
--    supabase-admin-lists-limit-fix.sql, qui dépendent de la colonne
--    reports.status qu'il ajoute — c'est déjà l'ordre de ce fichier,
--    ne pas déplacer sa section plus bas.
-- 4. supabase-block-bypass-fix.sql, supabase-events-duration-guard.sql et
--    supabase-report-rate-limit-fix.sql sont conservés uniquement pour
--    leur valeur d'audit historique (commentaires en tête "SUPERSEDED") —
--    leur DDL actif a été retiré ou neutralisé, ne les réactive pas.
--
-- SECTIONS LES PLUS URGENTES (sécurité active, à faire en premier si tu ne
-- fais pas tout le fichier d'un coup) :
-- 1. supabase-authz-null-bypass-CRITIQUE-fix.sql — LE PLUS URGENT.
-- 2. supabase-storage-anon-listing-fix.sql — buckets avatars/post-media
--    lisibles et listables par n'importe qui sans compte.
-- 3. supabase-stripe-webhook-ordering-fix.sql — nécessite AUSSI un
--    redéploiement : supabase functions deploy stripe-webhook --no-verify-jwt
-- 4. supabase-existence-oracle-fix.sql — join_event/accept_join_request/
--    reject_join_request exécutables SANS AUCUNE authentification.
-- 5. supabase-security-definer-revoke-grant-audit-fix.sql —
--    check_beta_whitelist et send_event_reminders exécutables sans
--    authentification.
-- 6. supabase-profile-insert-trust-columns-protect-fix.sql — CRITIQUE : un
--    compte tout juste créé pouvait s'auto-attribuer is_premium/is_founder/
--    email_verified/phone_verified à l'inscription.
-- 7. supabase-profile-reports-moderation.sql — sans lui, le tableau de bord
--    admin (statistiques + liste des signalements) est cassé pour tout le
--    monde, y compris les vrais modérateurs.
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
-- SOURCE : supabase-existence-oracle-fix.sql
-- ============================================================================
-- ============================================================================
-- Correctif : oracle d'existence via message d'erreur différentiel (IDOR
-- "binaire") sur join_event()/accept_join_request()/reject_join_request().
--
-- Angle inédit de cette passe d'audit : pas une fuite de colonnes ni une
-- liste sans limite (patterns déjà clos ce soir), mais une fuite
-- d'information via le CONTENU du message d'erreur d'une RPC qui prend un
-- UUID en paramètre.
--
-- Constat (lecture du code, confirmé par relecture des définitions SQL
-- actuellement déployées) :
--
-- 1. join_event(p_event_id uuid) [supabase-events-guards.sql] :
--      - UUID inexistant                         -> 'Evenement introuvable'
--      - UUID existant mais can_view_event() faux -> 'Non autorise'
--      - UUID existant, visible, mais annulé      -> 'Cet evenement est annule'
--      - UUID existant, visible, mais passé       -> 'Cet evenement est deja passe'
--    N'importe quel utilisateur AUTHENTIFIÉ peut donc distinguer "cet id
--    n'existe pas" de "cet id existe mais m'est fermé" — et même, pour un
--    événement fermé, savoir en plus s'il est annulé ou déjà passé — pour
--    un événement privé/communautaire auquel il n'a jamais eu accès (lien
--    partagé puis retiré, invitation révoquée, ancien membre d'une
--    communauté qu'il a quittée, ou simple essai d'UUID au hasard).
--
-- 2. accept_join_request(p_request_id uuid) et reject_join_request(...)
--    [supabase-communities.sql] :
--      - UUID inexistant OU déjà traité -> 'Demande introuvable ou deja traitee'
--      - UUID existant, en attente, mais staff communautaire faux -> 'Non autorise'
--    Même schéma : "Non autorise" confirme à n'importe quel utilisateur
--    authentifié qu'une demande d'adhésion EN ATTENTE existe avec cet UUID
--    précis dans UNE communauté quelconque (pas forcément la sienne), sans
--    jamais avoir eu de raison légitime de la consulter.
--
-- Sévérité pratique limitée (UUID v4 non énumérable par force brute), mais
-- même famille de bug que "confirmer qu'un compte/une ressource existe sans
-- y avoir droit" — corrigé ici en supprimant la branche d'erreur distincte
-- et en la fusionnant avec le message générique "introuvable", AVANT toute
-- autre vérification qui révélerait un détail supplémentaire (annulé/passé)
-- sur une ressource à laquelle l'appelant n'a de toute façon pas accès.
--
-- Aucune connexion active, aucune ligne modifiée : ce fichier redéfinit
-- uniquement le corps de trois fonctions déjà déployées, à exécuter
-- manuellement (jamais par l'agent) via l'éditeur SQL Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. join_event(p_event_id) — la vérification can_view_event() passe
--    maintenant AVANT toute autre vérification (annulé/passé), et son échec
--    est fusionné avec le cas "introuvable" plutôt que de lever 'Non autorise'.
-- ----------------------------------------------------------------------------
create or replace function join_event(p_event_id uuid)
returns event_attendees
language plpgsql security definer set search_path = public
as $$
declare v_max int; v_canceled timestamptz; v_date timestamptz; v_going int; v_status text; v_row event_attendees;
begin
  select max_participants, canceled_at, event_date into v_max, v_canceled, v_date from events where id = p_event_id for update;
  if not found then raise exception 'Evenement introuvable'; end if;
  -- Vérification d'accès déplacée ICI (avant tout autre exception) et
  -- message fusionné avec le cas "introuvable" : un événement privé auquel
  -- l'appelant n'a pas accès doit être indiscernable, dans la réponse
  -- d'erreur, d'un événement qui n'existe pas — que ce soit sur le simple
  -- fait de son existence, ou sur son statut (annulé/passé), qui ne
  -- regarde pas quelqu'un qui n'a de toute façon pas le droit de le voir.
  if not can_view_event(p_event_id) then raise exception 'Evenement introuvable'; end if;
  if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
  if v_date is not null and v_date <= now() then raise exception 'Cet evenement est deja passe'; end if;

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

-- ----------------------------------------------------------------------------
-- 2. accept_join_request(p_request_id) — 'Non autorise' fusionné avec le
--    message générique "introuvable ou deja traitee".
-- ----------------------------------------------------------------------------
create or replace function accept_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid; v_profile_id uuid;
begin
  select community_id, profile_id into v_community_id, v_profile_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  -- Message fusionné avec le cas "introuvable" ci-dessus (au lieu de 'Non
  -- autorise') : sinon, n'importe quel utilisateur authentifié pouvait
  -- confirmer qu'une demande d'adhésion EN ATTENTE existe avec un UUID
  -- donné dans une communauté quelconque, simplement en observant lequel
  -- des deux messages revient — sans jamais avoir été concerné par cette
  -- communauté.
  if not is_community_staff(v_community_id) then
    raise exception 'Demande introuvable ou deja traitee';
  end if;

  update community_join_requests
  set status = 'accepted', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;

  insert into community_members (community_id, profile_id, role)
  values (v_community_id, v_profile_id, 'member')
  on conflict (community_id, profile_id) do nothing;

  insert into notifications (recipient_id, type, actor_id, community_id)
  values (v_profile_id, 'join_request_accepted', current_profile_id(), v_community_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. reject_join_request(p_request_id) — même correctif que ci-dessus.
-- ----------------------------------------------------------------------------
create or replace function reject_join_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_community_id uuid;
begin
  select community_id into v_community_id
    from community_join_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'Demande introuvable ou deja traitee';
  end if;
  -- Même fusion de message que accept_join_request() ci-dessus.
  if not is_community_staff(v_community_id) then
    raise exception 'Demande introuvable ou deja traitee';
  end if;

  update community_join_requests
  set status = 'rejected', decided_at = now(), decided_by = current_profile_id()
  where id = p_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Durcissement complémentaire (constaté en testant ce correctif, lecture
--    seule, avec la clé anonyme publique déjà présente dans le bundle
--    client — aucune mutation, aucun compte réel utilisé) : ces trois
--    fonctions n'ont JAMAIS eu de "revoke ... from public" contrairement à
--    unmatch_profile()/decline_invite() dans ce même projet. Un appel POST
--    anonyme (rôle "anon", sans session) sur
--    /rest/v1/rpc/join_event et /rest/v1/rpc/accept_join_request avec un
--    UUID au hasard exécute réellement la fonction et renvoie le message
--    d'erreur normal ('Evenement introuvable' / 'Demande introuvable ou deja
--    traitee') au lieu d'un refus de permission — l'oracle d'existence
--    corrigé ci-dessus était donc exploitable sans même créer de compte.
--    Le correctif de message ci-dessus le neutralise déjà (même message
--    dans les deux cas, authentifié ou non), mais on restreint aussi
--    l'exécution au rôle "authenticated" par défense en profondeur, comme
--    c'est déjà le cas pour les fonctions équivalentes du fichier.
-- ----------------------------------------------------------------------------
revoke all on function join_event(uuid) from public;
grant execute on function join_event(uuid) to authenticated;

revoke all on function accept_join_request(uuid) from public;
grant execute on function accept_join_request(uuid) to authenticated;

revoke all on function reject_join_request(uuid) from public;
grant execute on function reject_join_request(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname, prosrc from pg_proc where proname in ('join_event','accept_join_request','reject_join_request');
-- -- Confirmer qu'aucune des trois ne contient plus la chaîne 'Non autorise'.
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges
--   where routine_name in ('join_event','accept_join_request','reject_join_request');
-- -- Confirmer qu'il ne reste plus de ligne grantee = 'PUBLIC'/'anon'.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-security-definer-revoke-grant-audit-fix.sql
-- ============================================================================
-- ============================================================================
-- CROISEMENT EXHAUSTIF — pattern "fonction RPC security definer jamais
-- protégée par revoke/grant" (suite de supabase-existence-oracle-fix.sql,
-- qui avait trouvé ce trou sur join_event()/accept_join_request()/
-- reject_join_request()). Cette passe relit TOUTES les fonctions
-- "security definer" du dépôt (version la plus récente de chacune) et
-- vérifie, pour chacune, l'existence d'un "revoke ... from public" suivi
-- d'un "grant execute ... to authenticated" (ou équivalent).
--
-- MÉTHODE DE VÉRIFICATION EXPLOITÉE, PAS SEULEMENT LUE : rappel que
-- PostgreSQL accorde EXECUTE à PUBLIC (donc au rôle "anon" ET "authenticated"
-- de Supabase) sur toute fonction, par défaut, dès sa création — un simple
-- "grant execute ... to authenticated" ajouté PLUS TARD ne retire jamais ce
-- droit hérité de PUBLIC ; seul un "revoke ... from public" explicite le
-- fait. Deux familles de trous trouvées ici :
--   A. Aucun grant ET aucun revoke n'a jamais existé (comme join_event()
--      avant son correctif) — fonctions listées en sections 1 et 2.
--   B. Un "grant execute ... to authenticated" a bien été ajouté (dans
--      supabase-geolocation.sql / supabase-geolocation-privacy-fix.sql /
--      supabase-likers-profile-overexposure-fix.sql / supabase-premium-
--      admirers-reveal-fix.sql / supabase-schema-cache-404-400-fix.sql),
--      mais SANS jamais retirer le droit hérité de PUBLIC avant — donc le
--      rôle "anon" (visiteur non connecté, clé publique) a QUAND MÊME pu
--      exécuter ces fonctions depuis le tout début, malgré l'intention
--      affichée dans ces fichiers. Section 3.
--
-- VERDICT DÉTAILLÉ PAR FONCTION (toutes les fonctions "security definer" du
-- dépôt ont été passées en revue ; seules celles listées ci-dessous manquent
-- de protection — voir le résumé final envoyé à l'utilisateur pour la liste
-- complète des fonctions déjà protégées et de celles jugées non applicables,
-- ex. les fonctions déclenchées uniquement par trigger — "returns trigger"
-- — que PostgreSQL empêche déjà d'appeler directement via RPC, donc hors de
-- portée de ce pattern par construction).
--
-- Aucune connexion active, aucune ligne modifiée par ce fichier lui-même :
-- uniquement des "revoke"/"grant" sur des fonctions déjà déployées. À
-- exécuter manuellement (jamais par l'agent) via l'éditeur SQL Supabase,
-- dans l'ordre, après les fichiers qui définissent chaque fonction listée
-- (supabase-admin.sql, supabase-communities.sql, supabase-communities-2.sql,
-- supabase-events-v2.sql, supabase-create-community-event-authz-fix.sql,
-- supabase-info.sql, supabase-beta-access.sql, supabase-beta-feedback-
-- admin.sql, supabase-premium-messaging.sql, supabase-user-risk-level-authz-
-- fix.sql, supabase-geolocation.sql, supabase-likers-profile-overexposure-
-- fix.sql — tous déjà en prod ou en attente).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LE VRAI NOUVEAU TROU DE CETTE PASSE — check_beta_whitelist(event jsonb)
-- [supabase-beta-access.sql]. C'est une fonction d'Auth Hook Supabase
-- ("Before User Created"), censée n'être appelée QUE par le rôle interne
-- "supabase_auth_admin" lors d'une inscription — jamais par le client. Or
-- elle n'a JAMAIS eu de revoke/grant, donc PUBLIC (y compris "anon", sans
-- aucun compte) peut l'appeler directement via
-- supabase.rpc('check_beta_whitelist', { event: {...} }), ce qui expose
-- DEUX problèmes réels, cumulables sans jamais créer de compte :
--   - Oracle d'existence sur la liste blanche : la réponse (objet d'erreur
--     403 vs objet vide) révèle si un email précis est déjà invité en beta,
--     permettant d'énumérer/vérifier des adresses email de la table
--     beta_testers (jamais censée être lisible depuis le client — RLS sans
--     aucune policy sur cette table, précisément pour l'empêcher).
--   - Effet de bord réel sans jamais s'inscrire : l'appel fait aussi
--     "update beta_testers set used_at = now()" pour tout email déjà
--     invité — n'importe qui peut donc marquer à distance l'invitation de
--     quelqu'un d'autre comme "déjà utilisée" sans que cette personne ait
--     jamais créé de compte, corrompant le suivi de la liste blanche.
-- Correctif : restreindre l'exécution au seul rôle "supabase_auth_admin"
-- (convention officielle Supabase pour les Auth Hooks), en retirant
-- explicitement tout accès à "anon"/"authenticated"/public.
-- ----------------------------------------------------------------------------
revoke all on function check_beta_whitelist(jsonb) from public;
revoke all on function check_beta_whitelist(jsonb) from anon, authenticated;
grant execute on function check_beta_whitelist(jsonb) to supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- 2. Fonction appelable "system-only" sans AUCUNE garde d'auth interne —
-- send_event_reminders() [supabase-events-v2.sql, section "Rappels
-- 24h/1h"]. Le fichier d'origine dit explicitement "fonction appelable, PAS
-- un trigger" et prévue pour tourner via pg_cron/le propriétaire de la
-- base — jamais un appel client. Sans revoke, PUBLIC (anon compris) peut la
-- déclencher à volonté via supabase.rpc('send_event_reminders'), ce qui
-- exécute des INSERT/UPDATE réels sur les notifications et jeux
-- d'inscription (event_attendees) d'autres utilisateurs sans aucune
-- vérification d'identité de l'appelant. Impact pratique limité par le
-- garde-fou reminder_24h_sent_at/reminder_1h_sent_at (idempotent, ne double
-- jamais un envoi), mais reste un appel non authentifié à une fonction à
-- effet de bord qui ne devrait être déclenchable que par une tâche
-- planifiée/le propriétaire — même défaut de conception que join_event()
-- avant son correctif. Aucun grant ajouté : ni "anon" ni "authenticated"
-- n'ont de raison légitime de l'appeler ; seul le propriétaire de la
-- fonction (rôle d'exécution de pg_cron, non soumis aux grants) doit
-- pouvoir la déclencher.
-- ----------------------------------------------------------------------------
revoke all on function send_event_reminders() from public;
revoke all on function send_event_reminders() from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. "grant" ajouté sans jamais avoir fait le "revoke" correspondant — le
-- droit hérité de PUBLIC (donc "anon", visiteur SANS compte) n'a jamais été
-- retiré, malgré l'intention affichée dans les fichiers d'origine. Impact
-- réel limité (les deux fonctions renvoient un résultat vide/null pour un
-- appelant non connecté, current_profile_id()/auth.uid() étant alors NULL
-- et vérifié en premier dans chaque corps de fonction — pas de fuite de
-- données ni d'effet de bord confirmé pour "anon"), mais c'est exactement
-- la même case "convention non appliquée" que le reste de cette passe :
--   - get_my_likers() / get_liker_profile_reveal(uuid)
--     [supabase-likers-profile-overexposure-fix.sql /
--      supabase-premium-admirers-reveal-fix.sql /
--      supabase-schema-cache-404-400-fix.sql — 3 fichiers ont réécrit ces
--      fonctions et ajouté le grant, aucun n'a ajouté le revoke]
--   - nearby_profiles(text, numeric)
--     [supabase-geolocation.sql / supabase-geolocation-privacy-fix.sql —
--      même oubli]
-- ----------------------------------------------------------------------------
revoke all on function get_my_likers() from public;
grant execute on function get_my_likers() to authenticated;

revoke all on function get_liker_profile_reveal(uuid) from public;
grant execute on function get_liker_profile_reveal(uuid) to authenticated;

revoke all on function public.nearby_profiles(text, numeric) from public;
grant execute on function public.nearby_profiles(text, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Fonctions à EFFET DE BORD (INSERT/UPDATE/DELETE) déjà protégées par une
-- garde interne explicite (raise exception si non authentifié / non
-- autorisé) — donc non exploitables aujourd'hui même sans revoke/grant,
-- contrairement à join_event()/accept_join_request()/reject_join_request()
-- avant leur correctif (qui laissaient l'INSERT/UPDATE s'exécuter avant ou
-- sans jamais vérifier l'identité de l'appelant). Ajout du revoke/grant ici
-- par pure défense en profondeur et cohérence avec le reste du projet
-- (decline_invite()/unmatch_profile() ont déjà ce traitement pour la même
-- famille de fonctions) — AUCUN changement de comportement attendu pour un
-- appelant légitime déjà authentifié.
--
-- accept_invite(uuid) [supabase-communities.sql] : filtre déjà
-- "invited_profile_id = current_profile_id()" dans la clause WHERE de
-- lecture -> un appelant anonyme ou tiers tombe sur "introuvable", jamais
-- d'accès à l'invitation d'autrui (contrairement au bug corrigé sur
-- accept_join_request(), où la vérification de droit arrivait dans un IF
-- séparé APRÈS confirmation d'existence, créant l'oracle).
-- ----------------------------------------------------------------------------
revoke all on function accept_invite(uuid) from public;
grant execute on function accept_invite(uuid) to authenticated;

-- accept_event_invitation(uuid) / decline_event_invitation(uuid)
-- [supabase-events-v2.sql] : même motif qu'accept_invite() ci-dessus
-- (filtre invited_profile_id = current_profile_id() dans le SELECT/UPDATE).
revoke all on function accept_event_invitation(uuid) from public;
grant execute on function accept_event_invitation(uuid) to authenticated;

revoke all on function decline_event_invitation(uuid) from public;
grant execute on function decline_event_invitation(uuid) to authenticated;

-- create_community(...) / create_event(...)
-- [supabase-create-community-event-authz-fix.sql, versions les plus
-- récentes] : commencent explicitement par
-- "if current_profile_id() is null then raise exception 'Non authentifie'".
revoke all on function create_community(text, text, text, text, text, text, text) from public;
grant execute on function create_community(text, text, text, text, text, text, text) to authenticated;

revoke all on function create_event(text, text, text, text, timestamptz, integer, text, text, integer, text, uuid, text) from public;
grant execute on function create_event(text, text, text, text, timestamptz, integer, text, text, integer, text, uuid, text) to authenticated;

-- Rôles/modération plateforme [supabase-admin.sql] : chacune commence par
-- "if not is_moderator_or_above()/is_admin_or_above() then raise exception"
-- (ou une vérification de rang équivalente). Note d'honnêteté : cette garde
-- dépend elle-même du correctif NULL-bypass
-- (supabase-authz-null-bypass-CRITIQUE-fix.sql, "coalesce(..., false)") pour
-- être fiable côté "authenticated" sans rôle — s'il n'est pas encore
-- appliqué en prod, ces fonctions restent vulnérables à un contournement
-- PAR UN COMPTE AUTHENTIFIÉ (pas par "anon", que ce fichier bloque bien).
-- Le revoke/grant ci-dessous ferme au moins la voie "anon" dans tous les cas.
revoke all on function grant_platform_role(uuid, text) from public;
grant execute on function grant_platform_role(uuid, text) to authenticated;

revoke all on function revoke_platform_role(uuid) from public;
grant execute on function revoke_platform_role(uuid) to authenticated;

revoke all on function suspend_user(uuid, timestamptz, text) from public;
grant execute on function suspend_user(uuid, timestamptz, text) to authenticated;

revoke all on function unsuspend_user(uuid) from public;
grant execute on function unsuspend_user(uuid) to authenticated;

revoke all on function ban_user(uuid, text) from public;
grant execute on function ban_user(uuid, text) to authenticated;

revoke all on function unban_user(uuid) from public;
grant execute on function unban_user(uuid) to authenticated;

revoke all on function admin_resolve_report(text, uuid, boolean) from public;
grant execute on function admin_resolve_report(text, uuid, boolean) to authenticated;

revoke all on function admin_set_monetization(boolean) from public;
grant execute on function admin_set_monetization(boolean) to authenticated;

revoke all on function admin_update_feedback(uuid, text, text, text) from public;
grant execute on function admin_update_feedback(uuid, text, text, text) to authenticated;

-- Cycle éditorial Baobab Info [supabase-info.sql] : chacune commence par
-- "if not is_info_editor()/is_info_admin() then raise exception".
revoke all on function create_info_article(text, text, text, text, text, text, text, boolean, boolean, text, text, text, text, timestamptz) from public;
grant execute on function create_info_article(text, text, text, text, text, text, text, boolean, boolean, text, text, text, text, timestamptz) to authenticated;

revoke all on function update_info_article(uuid, text, text, text, text, text, text, text, text, text, text, timestamptz) from public;
grant execute on function update_info_article(uuid, text, text, text, text, text, text, text, text, text, text, timestamptz) to authenticated;

revoke all on function submit_info_article_for_review(uuid) from public;
grant execute on function submit_info_article_for_review(uuid) to authenticated;

revoke all on function approve_info_article(uuid) from public;
grant execute on function approve_info_article(uuid) to authenticated;

revoke all on function publish_info_article(uuid) from public;
grant execute on function publish_info_article(uuid) to authenticated;

revoke all on function archive_info_article(uuid) from public;
grant execute on function archive_info_article(uuid) to authenticated;

revoke all on function revert_info_article_to_draft(uuid) from public;
grant execute on function revert_info_article_to_draft(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Fonctions EN LECTURE SEULE (aucun INSERT/UPDATE/DELETE dans leur corps)
-- déjà protégées par une garde interne (is_moderator_or_above() ou
-- vérification équivalente basée sur current_profile_id()) — donc sans
-- fuite de données confirmée aujourd'hui, mais listées ici pour la même
-- raison de cohérence/défense en profondeur que la section 4 (même remarque
-- sur la dépendance au correctif NULL-bypass pour un appelant "authenticated"
-- sans rôle).
-- ----------------------------------------------------------------------------
revoke all on function admin_dashboard_stats() from public;
grant execute on function admin_dashboard_stats() to authenticated;

revoke all on function admin_search_users(text) from public;
grant execute on function admin_search_users(text) to authenticated;

revoke all on function admin_list_reports(text) from public;
grant execute on function admin_list_reports(text) to authenticated;

revoke all on function admin_list_feedback(text) from public;
grant execute on function admin_list_feedback(text) to authenticated;

revoke all on function user_risk_level(uuid) from public;
grant execute on function user_risk_level(uuid) to authenticated;

revoke all on function get_message_quota(text) from public;
grant execute on function get_message_quota(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select routine_name, grantee, privilege_type from information_schema.routine_privileges
--   where routine_name in (
--     'check_beta_whitelist','send_event_reminders','get_my_likers',
--     'get_liker_profile_reveal','nearby_profiles','accept_invite',
--     'accept_event_invitation','decline_event_invitation','create_community',
--     'create_event','grant_platform_role','revoke_platform_role',
--     'suspend_user','unsuspend_user','ban_user','unban_user',
--     'admin_resolve_report','admin_set_monetization','admin_update_feedback',
--     'create_info_article','update_info_article',
--     'submit_info_article_for_review','approve_info_article',
--     'publish_info_article','archive_info_article',
--     'revert_info_article_to_draft','admin_dashboard_stats',
--     'admin_search_users','admin_list_reports','admin_list_feedback',
--     'user_risk_level','get_message_quota'
--   )
--   order by routine_name, grantee;
-- -- Confirmer qu'aucune ligne ne reste avec grantee = 'PUBLIC' (sauf
-- -- check_beta_whitelist, dont le seul grantee attendu est
-- -- 'supabase_auth_admin' et surtout pas 'public'/'anon'/'authenticated').
-- ============================================================================


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
-- SOURCE : supabase-premium-admirers-reveal-fix.sql
-- ============================================================================
-- ============================================================================
-- Correctif : "Qui m'a aimé" (avantage Premium) n'était protégé QUE côté
-- affichage, jamais côté serveur — même famille de bug que l'audit
-- "client vs serveur" mené sur les statuts de compte (banni/suspendu/
-- onboarding incomplet/suppression en attente), appliquée ici au Premium.
--
-- Constat (src/App.jsx, loadAll) :
--   supabase.from("likes").select("from_id, profile:from_id(*)").eq("to_id", myProfileId)
-- renvoie le PROFIL COMPLET (nom, photo, ville, âge, bio...) de TOUT LE
-- MONDE qui a liké l'utilisateur courant, peu importe son statut Premium.
-- AdmirersModal.jsx se contente ensuite d'afficher un Paywall à la place de
-- la liste si !isPremium — mais la donnée elle-même a déjà transité en
-- clair dans la réponse réseau (visible depuis l'onglet Réseau du
-- navigateur ou le state React) AVANT toute vérification Premium. Un
-- utilisateur gratuit un peu curieux peut donc voir l'identité de qui l'a
-- aimé sans jamais payer, alors que c'est précisément la fonctionnalité
-- vendue par l'abonnement. Même chose pour l'abonnement realtime "likes"
-- (INSERT to_id=moi) : il refait un select("*") direct sur "profiles" dès
-- qu'un nouveau like arrive, toujours sans vérifier is_premium().
--
-- Un match MUTUEL (les deux se sont likés) n'est PAS concerné : voir qui a
-- matché avec soi n'a jamais été un avantage Premium dans cette app (voir
-- getMatches() dans App.jsx) — seul le like à SENS UNIQUE (qui m'a aimé
-- sans que je l'aie encore aimé en retour) doit rester caché à un compte
-- gratuit.
--
-- Prérequis : supabase-premium.sql (is_premium, current_profile_id),
-- supabase-matching.sql / supabase-protect-rls.sql (table "likes" existante
-- avec RLS lecture sur from_id/to_id = soi).
-- Additif uniquement : n'importe pas les policies RLS existantes sur
-- "likes"/"profiles", ajoute seulement deux fonctions RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_my_likers() — remplace le select("from_id, profile:from_id(*)")
-- fait directement depuis le client dans loadAll(). Ne renvoie le profil
-- complet d'un·e admirateur·ice à sens unique que si l'appelant est
-- Premium ; les profils de match mutuel sont toujours inclus. Le compteur
-- "admirers_count" (aucune identité dedans) permet quand même d'afficher
-- "X personnes t'ont déjà aimé·e" et le badge "(N)" de l'onglet Profil à un
-- compte gratuit, sans rien révéler.
-- ----------------------------------------------------------------------------
create or replace function get_my_likers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
  v_premium boolean;
  v_likers jsonb;
  v_admirers_count int;
begin
  if v_me is null then
    return jsonb_build_object('likers', '[]'::jsonb, 'admirers_count', 0);
  end if;

  v_premium := is_premium(v_me);

  select coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
  into v_likers
  from likes l
  join profiles p on p.id = l.from_id
  where l.to_id = v_me
    and (
      v_premium
      or exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id)
    );

  select count(*) into v_admirers_count
  from likes l
  where l.to_id = v_me
    and not exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id);

  return jsonb_build_object('likers', v_likers, 'admirers_count', v_admirers_count);
end;
$$;

grant execute on function get_my_likers() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_liker_profile_reveal(p_from_id) — équivalent pour l'abonnement
-- realtime "likes" (nouvel INSERT reçu en direct pendant la session). Ne
-- renvoie le profil que si un like réel de p_from_id vers moi existe déjà
-- en base ET (match mutuel OU je suis Premium) ; sinon renvoie null, sans
-- toucher à "profiles" du tout — le client garde juste le compteur à jour
-- côté React sans jamais recevoir l'identité.
-- ----------------------------------------------------------------------------
create or replace function get_liker_profile_reveal(p_from_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
begin
  if v_me is null or p_from_id is null then
    return null;
  end if;

  if not exists (select 1 from likes where from_id = p_from_id and to_id = v_me) then
    return null;
  end if;

  if is_premium(v_me) or exists (select 1 from likes where from_id = v_me and to_id = p_from_id) then
    return (select to_jsonb(p.*) from profiles p where p.id = p_from_id);
  end if;

  return null;
end;
$$;

grant execute on function get_liker_profile_reveal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select get_my_likers(); -- en tant qu'utilisateur connecté, via l'API PostgREST/RPC
-- select get_liker_profile_reveal('<uuid-de-quelquun-qui-ma-like>');
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-schema-cache-404-400-fix.sql
-- ============================================================================
-- ============================================================================
-- Correctif : deux erreurs console en production, causes CONFIRMÉES par un
-- test en conditions réelles (vrai compte créé via le flux d'inscription
-- normal, onboarding jusqu'au bout, contre la vraie base de prod
-- vozehymbihnckzklxesw.supabase.co — pas une hypothèse cette fois).
--
-- 1) GET/POST .../user_locations?select=* → 400
--    Message PostgREST exact observé :
--      {"code":"PGRST204","details":null,"hint":null,
--       "message":"Could not find the 'last_in_canada_at' column of
--       'user_locations' in the schema cache"}
--    Origine : src/App.jsx appelle upsertMyLocation({ last_in_canada_at: ... })
--    (garde-fou "Canada" du module Rencontres, voir supabase-canada-gate.sql)
--    mais PostgREST ne voit pas cette colonne dans son cache de schéma —
--    soit parce que supabase-canada-gate.sql n'a en réalité jamais été
--    exécuté sur cette base de production, soit parce qu'il l'a été mais
--    que le cache de schéma de PostgREST n'a jamais été rafraîchi depuis
--    (arrive parfois avec du DDL passé par certains clients SQL). Impact
--    réel au-delà du bruit console : le garde-fou de période de grâce
--    "hors Canada" (discoverGateBlocked, src/App.jsx) ne peut jamais
--    enregistrer last_in_canada_at, donc ne fonctionne jamais tel que conçu.
--
-- 2) RPC get_my_likers() → 404
--    Message PostgREST exact observé :
--      {"code":"PGRST202","details":"Searched for the function
--       public.get_my_likers without parameters, but no matches were found
--       in the schema cache.","hint":"Perhaps you meant to call the function
--       public.get_message_quota","message":"Could not find the function
--       public.get_my_likers without parameters in the schema cache"}
--    Origine : supabase-premium-admirers-reveal-fix.sql définit cette
--    fonction, appelée par TOUT compte connecté ayant un profil (loadAll(),
--    src/App.jsx) — même cause probable que ci-dessus (jamais exécuté en
--    prod, ou cache non rafraîchi). Impact réel : avant le correctif
--    apporté au même commit à src/App.jsx (le throw sur likerRes.error
--    faisait échouer TOUT loadAll()), cette seule RPC manquante empêchait le
--    chargement des profils/likes/passes/blocages/photos pour tout le monde
--    et affichait le bandeau "Impossible de charger les données. Réessaie."
--
-- Ce fichier réapplique les deux correctifs (idempotents dans leurs fichiers
-- d'origine — add column if not exists / create or replace function) et
-- force explicitement un rechargement du cache de schéma PostgREST, pour
-- couvrir les deux causes possibles à la fois. Sans risque à exécuter même
-- si supabase-canada-gate.sql et supabase-premium-admirers-reveal-fix.sql
-- ont déjà été appliqués avec succès.
-- À exécuter dans Supabase : SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne last_in_canada_at (identique à supabase-canada-gate.sql)
-- ----------------------------------------------------------------------------
alter table public.user_locations add column if not exists last_in_canada_at timestamptz;

update public.user_locations set last_in_canada_at = now() where last_in_canada_at is null;

-- ----------------------------------------------------------------------------
-- 2. Fonctions get_my_likers() / get_liker_profile_reveal() (identique à
-- supabase-premium-admirers-reveal-fix.sql) — prérequis : is_premium() et
-- current_profile_id() (supabase-premium.sql / supabase-communities.sql).
-- ----------------------------------------------------------------------------
create or replace function get_my_likers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
  v_premium boolean;
  v_likers jsonb;
  v_admirers_count int;
begin
  if v_me is null then
    return jsonb_build_object('likers', '[]'::jsonb, 'admirers_count', 0);
  end if;

  v_premium := is_premium(v_me);

  select coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
  into v_likers
  from likes l
  join profiles p on p.id = l.from_id
  where l.to_id = v_me
    and (
      v_premium
      or exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id)
    );

  select count(*) into v_admirers_count
  from likes l
  where l.to_id = v_me
    and not exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id);

  return jsonb_build_object('likers', v_likers, 'admirers_count', v_admirers_count);
end;
$$;

grant execute on function get_my_likers() to authenticated;

create or replace function get_liker_profile_reveal(p_from_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
begin
  if v_me is null or p_from_id is null then
    return null;
  end if;

  if not exists (select 1 from likes where from_id = p_from_id and to_id = v_me) then
    return null;
  end if;

  if is_premium(v_me) or exists (select 1 from likes where from_id = v_me and to_id = p_from_id) then
    return (select to_jsonb(p.*) from profiles p where p.id = p_from_id);
  end if;

  return null;
end;
$$;

grant execute on function get_liker_profile_reveal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Rechargement explicite du cache de schéma PostgREST — normalement
-- automatique après du DDL exécuté depuis le SQL Editor (event trigger
-- Supabase), mais sans effet indésirable si redondant. C'est la seule étape
-- de ce fichier qui a un sens si les deux blocs ci-dessus étaient déjà
-- appliqués avec succès mais que le cache n'avait simplement jamais suivi.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'user_locations'
--   and column_name = 'last_in_canada_at';
-- select proname from pg_proc where proname in ('get_my_likers', 'get_liker_profile_reveal');
-- select get_my_likers(); -- en tant qu'utilisateur connecté, via l'API PostgREST/RPC
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-likers-profile-overexposure-fix.sql
-- ============================================================================
-- ============================================================================
-- Correctif : "Qui m'a aimé" / matchs renvoyaient le PROFIL COMPLET (toutes
-- les colonnes de "profiles") au lieu d'un sous-ensemble sûr — même famille
-- de bug que supabase-premium-admirers-reveal-fix.sql (client vs serveur),
-- mais un cran plus loin : ce fichier-là a corrigé QUI peut recevoir le
-- profil d'un·e admirateur·ice (gate Premium/match mutuel), pas QUELLES
-- COLONNES sont renvoyées une fois l'accès autorisé.
--
-- Constat (get_my_likers()/get_liker_profile_reveal(), déjà en prod depuis
-- supabase-premium-admirers-reveal-fix.sql) : `to_jsonb(p.*)` renvoie
-- LITTÉRALEMENT toutes les colonnes de "profiles" à quiconque a un match
-- mutuel (aucune restriction Premium sur les matchs) ou qui est Premium —
-- y compris des colonnes jamais destinées à un autre utilisateur que le
-- titulaire du compte : ban_reason, suspend_reason, flagged_for_review,
-- report_count, deletion_requested_at, birth_date (date de naissance EXACTE,
-- bien plus précise que l'année que show_birth_year prétend masquer),
-- notification_preferences, pref_age_min/pref_age_max/pref_distance/
-- pref_looking_for, onboarding_step, usage_goals. AdmirersModal.jsx/
-- MatchCard.jsx/ConversationPane.jsx/MessagesTab.jsx n'affichent qu'une
-- poignée de ces champs (voir profile_public_json ci-dessous, dont la liste
-- est dérivée de l'usage réel côté client — PublicProfileModal.jsx a déjà le
-- même principe : "allow-list explicite des champs affichés, jamais de
-- spread {...profile}"), mais la donnée en trop a déjà transité en clair
-- dans la réponse réseau du RPC (onglet Réseau du navigateur), qu'elle soit
-- affichée ou non.
--
-- Portée volontairement limitée à ces deux RPC (pas de refonte de loadAll()
-- dans App.jsx, qui charge encore "profiles" en `select("*")` pour la liste
-- de candidats/le cache local — un chantier plus large, à traiter à part vu
-- son ampleur et son rôle central dans l'app). Additif uniquement.
--
-- Prérequis : supabase-premium-admirers-reveal-fix.sql (fonctions à
-- remplacer ci-dessous), supabase-premium.sql (current_profile_id/
-- is_premium). À exécuter dans Supabase : SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Allow-list partagée — un seul endroit à maintenir si une carte a besoin
-- d'un nouveau champ public plus tard, au lieu de dupliquer la liste dans
-- chaque fonction. Ne renvoie jamais : user_id, ban_reason, suspend_reason,
-- flagged_for_review, report_count, deletion_requested_at, birth_date,
-- notification_preferences, pref_*, onboarding_*, usage_goals, last_name,
-- province, created_at.
-- ----------------------------------------------------------------------------
create or replace function public.profile_public_json(p profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'avatar_url', p.avatar_url,
    'cover_url', p.cover_url,
    'age', p.age,
    'show_birth_year', p.show_birth_year,
    'city', p.city,
    'show_city', p.show_city,
    'country', p.country,
    'show_country', p.show_country,
    'arrived_since', p.arrived_since,
    'immigration_status', p.immigration_status,
    'arrival_city', p.arrival_city,
    'show_canada_journey', p.show_canada_journey,
    'looking_for', p.looking_for,
    'relationship_values', p.relationship_values,
    'languages', p.languages,
    'languages_detail', p.languages_detail,
    'occupation', p.occupation,
    'show_occupation', p.show_occupation,
    'education_level', p.education_level,
    'show_studies', p.show_studies,
    'interests', p.interests,
    'show_interests', p.show_interests,
    'wants_children', p.wants_children,
    'family_importance', p.family_importance,
    'career_goal', p.career_goal,
    'geographic_openness', p.geographic_openness,
    'show_life_project', p.show_life_project,
    'bio', p.bio,
    'email_verified', p.email_verified,
    'phone_verified', p.phone_verified,
    'is_founder', p.is_founder,
    'is_premium', p.is_premium,
    'is_online', p.is_online,
    'last_seen', p.last_seen,
    'show_online_status', p.show_online_status,
    'banned_at', p.banned_at,
    'suspended_until', p.suspended_until
  );
$$;

-- ----------------------------------------------------------------------------
-- 1. get_my_likers() — même logique d'autorisation qu'avant (inchangée),
-- seule la projection de colonnes change (to_jsonb(p.*) -> profile_public_json(p)).
-- ----------------------------------------------------------------------------
create or replace function get_my_likers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
  v_premium boolean;
  v_likers jsonb;
  v_admirers_count int;
begin
  if v_me is null then
    return jsonb_build_object('likers', '[]'::jsonb, 'admirers_count', 0);
  end if;

  v_premium := is_premium(v_me);

  select coalesce(jsonb_agg(profile_public_json(p)), '[]'::jsonb)
  into v_likers
  from likes l
  join profiles p on p.id = l.from_id
  where l.to_id = v_me
    and (
      v_premium
      or exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id)
    );

  select count(*) into v_admirers_count
  from likes l
  where l.to_id = v_me
    and not exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id);

  return jsonb_build_object('likers', v_likers, 'admirers_count', v_admirers_count);
end;
$$;

grant execute on function get_my_likers() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_liker_profile_reveal(p_from_id) — même changement.
-- ----------------------------------------------------------------------------
create or replace function get_liker_profile_reveal(p_from_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
begin
  if v_me is null or p_from_id is null then
    return null;
  end if;

  if not exists (select 1 from likes where from_id = p_from_id and to_id = v_me) then
    return null;
  end if;

  if is_premium(v_me) or exists (select 1 from likes where from_id = v_me and to_id = p_from_id) then
    return (select profile_public_json(p) from profiles p where p.id = p_from_id);
  end if;

  return null;
end;
$$;

grant execute on function get_liker_profile_reveal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select get_my_likers(); -- en tant qu'utilisateur connecté
-- select jsonb_object_keys((get_my_likers()->'likers'->0)); -- doit lister
--   uniquement les clés de profile_public_json ci-dessus, jamais ban_reason/
--   birth_date/report_count/etc.
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-global-action-rate-limit-fix.sql
-- ============================================================================
-- ============================================================================
-- Limite de débit GLOBALE, transversale à toutes les actions dirigées vers
-- un·e autre membre (messages / likes / follows / reports / invitations
-- d'événement) — trouvé à l'audit (angle "rate limit global").
--
-- CONSTAT : chaque action a déjà sa propre limite serveur indépendante
-- (supabase-scale-security-2.sql : messages 30/min, follows 100/24h ;
-- supabase-like-rate-limit.sql : likes 150/24h ; supabase-report-rate-
-- limit-fix.sql : reports 20/24h ; supabase-events-v2.sql : invitations
-- 30/24h). Chacune compte UNIQUEMENT sa propre table sur sa propre
-- fenêtre. Un script qui enchaîne rapidement des actions DIFFÉRENTES en
-- boucle (un like, puis un message, puis un follow, puis un like, sur des
-- cibles différentes) ne fait jamais monter un seul compteur assez vite
-- pour déclencher SA limite individuelle, alors que le débit combiné sur
-- le compte est anormalement élevé — exactement le signal de comportement
-- de bot qu'aucune limite par-action ne capture isolément.
--
-- CORRECTIF : une fonction utilitaire additionne, sur une fenêtre courte
-- (60 secondes), le nombre d'insertions récentes du même profil dans les
-- cinq tables ci-dessus, et chacun des cinq triggers "check_*_rate_limit"
-- existants l'appelle en plus de son propre compteur. Plafond généreux
-- (40 actions/60s toutes tables confondues) : un usage normal, même une
-- personne qui tape des messages très vite dans une conversation, n'a
-- aucune raison d'approcher ce total en combinant plusieurs TYPES d'action
-- différents sur une seule minute ; seul un script en boucle peut
-- l'atteindre en alternant les types pour rester sous chaque limite
-- individuelle. Ne remplace aucune des limites par-action existantes,
-- s'ajoute strictement par-dessus.
--
-- Additif uniquement, idempotent (create or replace + drop/create trigger).
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-scale-security-2.sql, supabase-like-rate-limit.sql,
-- supabase-report-rate-limit-fix.sql et supabase-events-v2.sql (les
-- fonctions qu'il patche doivent déjà exister).
-- ============================================================================

create or replace function global_recent_action_count(p_profile_id uuid)
returns int language sql security definer set search_path = public stable as $$
  select
    (select count(*) from messages where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from likes where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from follows where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from reports where from_id = p_profile_id and created_at > now() - interval '60 seconds')
    + (select count(*) from event_invitations where invited_by = p_profile_id and created_at > now() - interval '60 seconds');
$$;

create or replace function check_message_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from messages
    where from_id = new.from_id and created_at > now() - interval '1 minute';
  if v_count >= 30 then
    raise exception 'Trop de messages envoyes recemment, reessaie dans un instant';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_message_rate_limit on messages;
create trigger trg_message_rate_limit before insert on messages
for each row execute function check_message_rate_limit();

create or replace function check_follow_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from follows
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 100 then
    raise exception 'Trop d abonnements crees recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_follow_rate_limit on follows;
create trigger trg_follow_rate_limit before insert on follows
for each row execute function check_follow_rate_limit();

create or replace function check_like_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from likes
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 150 then
    raise exception 'Trop de mises en relation initiees recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.from_id) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_like_rate_limit on likes;
create trigger trg_like_rate_limit before insert on likes
for each row execute function check_like_rate_limit();

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

create or replace function check_event_invite_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from event_invitations
    where invited_by = new.invited_by and created_at > now() - interval '24 hours';
  if v_count >= 30 then
    raise exception 'Trop d invitations envoyees recemment, reessaie plus tard';
  end if;
  if global_recent_action_count(new.invited_by) >= 40 then
    raise exception 'Trop d actions envoyees recemment, reessaie dans un instant';
  end if;
  return new;
end; $$;
drop trigger if exists trg_event_invite_rate_limit on event_invitations;
create trigger trg_event_invite_rate_limit before insert on event_invitations
for each row execute function check_event_invite_rate_limit();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname in
--   ('global_recent_action_count','check_message_rate_limit',
--    'check_follow_rate_limit','check_like_rate_limit',
--    'check_report_rate_limit','check_event_invite_rate_limit');
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-target-account-state-guards-CONSOLIDATED-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF CONSOLIDÉ — remplace, dans cet ordre exact d'application logique,
-- supabase-block-bypass-fix.sql + supabase-banned-target-action-fix.sql +
-- supabase-onboarding-incomplete-target-action-fix.sql +
-- supabase-deletion-pending-target-action-fix.sql pour les policies INSERT de
-- likes / follows / favorites / messages / event_invitations.
--
-- BUG TROUVÉ (audit de régression, 2026-09-09) : les trois fichiers
-- "*-target-action-fix.sql" (commits c4fe934, 915df69, a2b120a) sont chacun
-- BIEN conçus en interne — chaque fichier redéfinit la policy en entier avec
-- l'ENSEMBLE CUMULÉ des conditions des fichiers précédents (blocage + banni/
-- suspendu + onboarding incomplet + suppression en attente), pas seulement
-- sa propre condition ajoutée. Exécutés seuls, dans n'importe quel ordre,
-- ils ne se marchent donc PAS dessus entre eux.
--
-- Le problème est ailleurs : dans supabase-COMBINED-pending-fixes.sql, la
-- section "SOURCE : supabase-block-bypass-fix.sql" (fix plus ANCIEN,
-- commit 5756068 du 2026-09-03, qui ne connaît que la condition de blocage)
-- a été concaténée APRÈS les trois fixes plus récents (2026-09-04), alors
-- que son contenu est un sous-ensemble strict du leur. Ce fichier fait lui
-- aussi un "drop policy + create policy" sur likes/follows/favorites/
-- event_invitations (mais jamais sur messages, qui avait déjà son check de
-- blocage via supabase-scale-security.sql et n'est pas touché par ce
-- fichier). Résultat : exécuter supabase-COMBINED-pending-fixes.sql de haut
-- en bas sur une base fraîche redéfinit CES 4 TABLES une quatrième fois,
-- en dernier, avec SEULEMENT la condition de blocage — effaçant purement et
-- simplement les gardes banni/suspendu, onboarding incomplet et suppression
-- en attente qui venaient d'être posées juste avant pour ces 4 tables.
-- Seule "messages" ressort intacte avec les 4 conditions cumulées, car
-- supabase-block-bypass-fix.sql ne la redéfinit jamais.
--
-- IMPACT : quiconque exécute le script consolidé tel quel se retrouve avec
-- une protection RÉELLE (au niveau base, contournable par appel API direct)
-- uniquement sur "messages" ; sur likes/follows/favorites/event_invitations,
-- un compte banni/suspendu, un profil n'ayant jamais terminé l'onboarding,
-- ou un compte en attente de suppression peut de nouveau émettre/recevoir
-- ces actions dirigées — exactement le trou que les 3 fixes visaient à
-- combler, silencieusement rouvert par l'ordre de concaténation.
--
-- CORRECTIF : ce fichier redéfinit une bonne fois pour toutes, pour les 5
-- tables, la policy INSERT avec LES 4 CONDITIONS À LA FOIS (blocage OR
-- banni/suspendu OR onboarding incomplet OR suppression en attente — chaque
-- "not exists" est indépendant, donc en pratique un ET logique entre les 4
-- gardes). Idempotent (drop + create), sans risque de régression pour un
-- compte en règle. À exécuter :
--   - après le script consolidé complet (pour corriger l'état final), ou
--   - seul, sur une base qui a déjà reçu un sous-ensemble quelconque des
--     4 fichiers ci-dessus, dans n'importe quel ordre — le résultat final
--     est toujours le même jeu de conditions complet.
--
-- Les 4 fichiers suivants sont donc SUPERSEDED par celui-ci pour la partie
-- policies RLS de likes/follows/favorites/messages/event_invitations :
--   - supabase-block-bypass-fix.sql
--   - supabase-banned-target-action-fix.sql
--   - supabase-onboarding-incomplete-target-action-fix.sql
--   - supabase-deletion-pending-target-action-fix.sql
-- (voir la note ajoutée en tête de chacun). Le reste de leur contenu
-- (commentaires d'audit, contexte) reste valable et n'est pas dupliqué ici.
--
-- NUANCE CONSERVÉE TELLE QUELLE (héritée de deletion-pending-target-action-
-- fix.sql, non tranchée par cet audit) : le bloc "messages" coupe aussi
-- l'envoi de nouveaux messages dans une conversation déjà matchée AVANT une
-- demande de suppression, dès qu'un des deux comptes est en attente de
-- suppression — à retirer de la section 4 ci-dessous si ce n'est pas le
-- comportement voulu par l'équipe.
--
-- IMPORTANT : fichier fourni pour revue/exécution manuelle par l'équipe.
-- Non exécuté automatiquement (règle de sécurité de cet audit). Jamais
-- exécuté contre la base de production par cette session.
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
-- 4. "messages" — même check ajouté à l'intérieur de la clause qui porte déjà
-- sur "other_id" (l'autre personne de la conversation), à côté du contrôle de
-- blocage existant. Voir la NUANCE en tête de fichier pour la portée exacte
-- du bloc suppression-en-attente sur les conversations déjà matchées.
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

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — les 5 policies
-- doivent chacune contenir "blocks", "banned_at", "onboarding_completed_at"
-- ET "deletion_requested_at" dans leur "with check" :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('likes','follows','favorites','messages','event_invitations')
--   and cmd = 'a';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-public-user-count-accuracy-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — public_user_count() comptait TOUS les profils sans distinction
-- (trouvé lors de l'audit autonome du 4 septembre 2026, angle "fiabilité du
-- chiffre affiché sur la page d'accueil publique").
-- ============================================================================
-- public_user_count() (supabase-public-user-count.sql) fait actuellement :
--   select count(*) from profiles;
-- sans AUCUN filtre. Ce nombre est affiché comme preuve sociale aux
-- visiteurs NON connectés ("X membres déjà sur Baobab",
-- src/screens/public/LandingPage.jsx) et dans l'app connectée
-- (src/components/home/HomeHeader.jsx, "X membres sur Baobab"). Il inclut
-- donc actuellement :
--   - les comptes BANNIS (profiles.banned_at is not null)
--   - les comptes actuellement SUSPENDUS
--     (profiles.suspended_until is not null and suspended_until > now())
--   - les comptes en cours de SUPPRESSION DIFFÉRÉE
--     (profiles.deletion_requested_at is not null — fenêtre de grâce avant
--     suppression effective, supabase-account-deletion.sql)
--   - les comptes qui n'ont JAMAIS terminé l'onboarding
--     (profiles.onboarding_completed_at is null — une ligne "profiles"
--     existe dès l'inscription, avant même que la personne choisisse un nom
--     ou une photo ; supabase-profile-onboarding.sql)
--
-- Résultat concret : un visiteur qui voit "X membres déjà sur Baobab" peut
-- voir un chiffre qui inclut des comptes bannis pour comportement abusif et
-- des inscriptions jamais finalisées — pas des "membres" au sens où ce
-- chiffre est présenté (preuve sociale de communauté active).
--
-- Vérifié EMPIRIQUEMENT (curl, clé anon, lecture seule) le 4 septembre 2026 :
-- public_user_count() renvoyait 4 en production — impossible de savoir sans
-- ce correctif combien de ces 4 comptes sont réellement des membres complets
-- et en règle.
--
-- Remarque — pas touché ici : admin_dashboard_stats().total_users
-- (supabase-admin-dashboard-stats-fix.sql) fait le même "select count(*)
-- from profiles" sans filtre, donc le chiffre public N'ÉTAIT PAS incohérent
-- avec le tableau de bord admin (les deux comptaient pareil) — mais les deux
-- étaient gonflés de la même façon. Ce correctif ne touche QUE
-- public_user_count() : "total_users" côté admin sert un usage différent
-- (vue d'ensemble brute pour le propriétaire, où voir aussi les comptes
-- bannis/incomplets a du sens) et reste inchangé volontairement.
-- ============================================================================

create or replace function public_user_count()
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*) from profiles
  where onboarding_completed_at is not null
    and banned_at is null
    and (suspended_until is null or suspended_until <= now())
    and deletion_requested_at is null;
$$;

-- "create or replace" préserve les grants déjà en place :
-- grant execute on function public_user_count() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select public_user_count();          -- nouveau chiffre, filtré
-- select count(*) from profiles;        -- ancien chiffre, pour comparer
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-event-media-columns-protect-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — colonnes sensibles de "event_media" modifiables directement
-- par un simple UPDATE de l'application (contournement des restrictions
-- d'appartenance/moderation deja en place a l'INSERT).
--
-- Trouve lors du croisement exhaustif du 8 septembre 2026, angle "policy RLS
-- UPDATE trop permissive au niveau colonne — le proprietaire peut
-- legitimement modifier SA ligne mais pas n'importe quelle colonne dedans",
-- applique a TOUTES les tables du projet (suite a
-- supabase-profile-trust-columns-protect-fix.sql, qui ne traitait que
-- "profiles"). Tables verifiees sans nouveau probleme : subscriptions/
-- subscription_events (aucune policy UPDATE cliente), community_members et
-- event_staff (deja restreints par hierarchie de role, cf. commentaire "item
-- 28" dans supabase-communities.sql), community_join_requests (aucune
-- policy UPDATE, statut change uniquement via RPC SECURITY DEFINER),
-- messages (deja protegee colonne par colonne par
-- enforce_message_update_rules, supabase-messaging-2.sql), likes/passes/
-- blocks/follows/favorites/post_likes/community_post_likes/story_reactions/
-- post_reports/community_reports/event_reports/info_reports (aucune policy
-- UPDATE cliente, ou repointage de cle etrangere deja possible via INSERT
-- donc pas une escalade nouvelle). Un seul cas confirme : "event_media".
--
-- Constat : supabase-events-v2.sql (et sa redefinition identique dans
-- supabase-scale-security-2.sql) definit
--   on event_media for update
--   using (uploaded_by = current_profile_id() or is_event_mod(event_id))
--   with check (uploaded_by = current_profile_id() or is_event_mod(event_id));
-- Le with check n'est satisfait que par la condition OR "uploaded_by =
-- current_profile_id()" pour un simple participant qui garde son propre id
-- comme uploaded_by — ce qui rend "event_id" et "status" librement
-- modifiables sur sa propre ligne, sans plus aucun rapport avec les
-- restrictions imposees a l'INSERT :
--   - "event_id" : la policy INSERT exige d'etre participant/staff de
--     l'evenement cible ("Un participant partage une photo"). Un simple
--     UPDATE de sa propre ligne event_media permet de reassigner event_id
--     vers N'IMPORTE QUEL AUTRE evenement (y compris un evenement prive
--     dont on n'est ni participant ni staff), sans jamais repasser par
--     cette verification.
--   - "status" ('visible'/'hidden'/'removed') : colonne de moderation
--     normalement pilotee par le staff de l'evenement (policy "L'auteur ou
--     le staff modifie une photo" combine les deux usages dans la meme
--     policy). Un simple auteur peut aujourd'hui remettre lui-meme
--     status='visible' sur une photo que le staff venait de masquer/retirer
--     pour non-conformite — la moderation est totalement contournable.
-- ("uploaded_by" n'a pas besoin d'un traitement separe : le with check
-- existant bloque deja sa reassignation vers un tiers, la nouvelle valeur
-- devant satisfaire elle-meme "= current_profile_id() ou is_event_mod(...)".)
--
-- Verifie : src/components/social/EventsTab.jsx n'appelle jamais
-- .update() sur "event_media" (seulement .insert() et .delete()) — ce
-- correctif ne retire donc aucune fonctionnalite existante de
-- l'application, il ferme uniquement une possibilite d'appel direct via
-- l'API Supabase (hors interface).
--
-- Ordre d'execution : a executer APRES supabase-events-v2.sql (et
-- supabase-scale-security-2.sql si deja applique) — la table et la
-- fonction is_event_mod() doivent deja exister. "create or replace
-- function" et "drop trigger if exists" rendent ce fichier idempotent.
-- ============================================================================

create or replace function protect_event_media_columns()
returns trigger language plpgsql as $$
begin
  -- Aucun cas d'usage reel (ni dans l'app, ni cote staff) ne deplace une
  -- photo existante vers un autre evenement : plus simple et plus sur de
  -- l'interdire completement plutot que de re-verifier l'appartenance au
  -- nouvel evenement a chaque fois.
  if new.event_id is distinct from old.event_id then
    raise exception 'Impossible de deplacer une photo vers un autre evenement.';
  end if;

  -- Le statut de moderation ne peut etre change que par le staff de
  -- l'evenement (organizer/co_organizer/moderator) — jamais par l'auteur
  -- de la photo lui-meme, sous peine de pouvoir annuler sa propre
  -- moderation.
  if new.status is distinct from old.status and not is_event_mod(old.event_id) then
    raise exception 'Seul le staff de l''evenement peut changer le statut d''une photo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_event_media_columns on event_media;
create trigger trg_protect_event_media_columns
before update on event_media
for each row
execute function protect_event_media_columns();

-- ----------------------------------------------------------------------------
-- Verification (facultatif, a executer separement apres) :
--
-- -- en tant qu'auteur de la photo (pas staff) :
-- update event_media set event_id = '<uuid_autre_evenement>' where id = '<ma_photo>';
-- -- doit lever : "Impossible de deplacer une photo vers un autre evenement."
-- update event_media set status = 'visible' where id = '<ma_photo_masquee_par_le_staff>';
-- -- doit lever : "Seul le staff de l'evenement peut changer le statut..."
--
-- -- en tant que staff (organizer/co_organizer/moderator) de l'evenement :
-- update event_media set status = 'hidden' where id = '<photo_dans_mon_evenement>';
-- -- doit toujours reussir (moderation normale, inchangee).
--
-- select tgname from pg_trigger where tgname = 'trg_protect_event_media_columns';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-content-creation-limits-fix.sql
-- ============================================================================
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


-- ============================================================================
-- SOURCE : supabase-profile-trust-columns-protect-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — colonnes de confiance/modération de "profiles" modifiables
-- directement par un simple UPDATE de l'application (contournement des RPC
-- de modération dédiées).
--
-- Trouvé lors de l'audit autonome du 8 septembre 2026, angle "policies RLS
-- UPDATE/DELETE + triggers pouvant laisser un utilisateur modifier des
-- colonnes qu'il ne devrait jamais pouvoir changer lui-même".
--
-- Constat : la policy RLS UPDATE sur "profiles" (voir
-- supabase-profile-onboarding.sql, "Un utilisateur modifie son propre
-- profil") est, comme documenté dans son propre commentaire, volontairement
-- ouverte à TOUTES les colonnes de la ligne du propriétaire :
--   using (auth.uid() = user_id) with check (auth.uid() = user_id)
-- Deux colonnes ont déjà reçu une protection dédiée par trigger BEFORE
-- UPDATE (is_founder via supabase-founder-badge.sql, is_premium via
-- supabase-premium-badge-protect.sql), et la table "messages" a déjà le même
-- traitement pour ses propres colonnes sensibles (voir
-- messages_restrict_update_to_read_at dans supabase-messaging.sql et
-- enforce_message_update_rules dans supabase-messaging-2.sql). Mais six
-- autres colonnes de "profiles", tout aussi sensibles, n'ont jamais reçu ce
-- traitement et restaient donc modifiables par n'importe quel utilisateur
-- authentifié sur SA PROPRE ligne, via un simple
-- supabase.from('profiles').update({...}).eq('id', monProfilId) :
--
--   - banned_at / ban_reason       -> un compte banni pouvait s'auto-débannir
--     (update profiles set banned_at = null, ban_reason = null where id = moi)
--   - suspended_until / suspend_reason -> idem pour une suspension temporaire
--   - report_count / flagged_for_review -> un profil signalé 3 fois (drapeau
--     posé par flag_profile_on_reports, supabase-dating-2.sql) pouvait remettre
--     son propre compteur à 0 et lever son propre drapeau de vigilance
--   - email_verified / phone_verified -> un compte non vérifié pouvait
--     s'auto-attribuer les badges de vérification email/téléphone sans jamais
--     confirmer quoi que ce soit, alors que ces colonnes sont normalement
--     synchronisées uniquement depuis auth.users (supabase-protect-rls.sql)
--
-- Ces colonnes ne sont normalement écrites QUE par : suspend_user/ban_user/
-- unsuspend_user/unban_user (supabase-admin.sql, réservées au staff),
-- flag_profile_on_reports (supabase-dating-2.sql, trigger système sur
-- "reports") et sync_profile_verification (supabase-protect-rls.sql, trigger
-- système sur auth.users). Toutes ces écritures légitimes ont lieu alors que
-- auth.role() vaut encore 'authenticated' (SECURITY DEFINER ne change pas le
-- rôle JWT de la requête PostgREST d'origine), SAUF sync_profile_verification
-- qui est déclenchée par le service Auth lui-même (connexion directe, jamais
-- via PostgREST, donc auth.role() y est déjà NULL) — c'est pourquoi le simple
-- garde-fou "auth.role() = 'authenticated'" utilisé par
-- protect_founder_flag/protect_premium_flag ne suffit PAS ici : il bloquerait
-- aussi les appels légitimes de suspend_user/ban_user/unsuspend_user/
-- unban_user/flag_profile_on_reports, qui s'exécutent dans le même contexte
-- authentifié que l'utilisateur qui a déclenché l'action. Ce correctif ajoute
-- donc un drapeau de session transactionnel (set_config(..., true) = portée
-- limitée à la transaction en cours, jamais persistant, jamais visible par
-- une autre requête même sur une connexion réutilisée par le pooler) que ces
-- fonctions posent juste avant leur UPDATE interne, et que le trigger exige
-- pour laisser passer un changement sur l'une de ces colonnes.
--
-- Ordre d'exécution : aucun autre fichier supabase-*-fix.sql existant ne
-- redéfinit suspend_user/ban_user/unsuspend_user/unban_user (originales dans
-- supabase-admin.sql) ni flag_profile_on_reports (originale dans
-- supabase-dating-2.sql) — vérifié par grep sur tout le dépôt avant d'écrire
-- ce fichier. Ce correctif doit néanmoins s'exécuter APRÈS supabase-admin.sql,
-- supabase-dating-2.sql et supabase-protect-rls.sql (les colonnes protégées
-- doivent déjà exister). "create or replace function" étant idempotent, le
-- réexécuter plusieurs fois est sans risque. Si un futur correctif redéfinit
-- à nouveau l'une de ces 5 fonctions après celui-ci, il DEVRA reprendre la
-- ligne "perform set_config('baobab.trust_column_write', 'on', true);"
-- avant son UPDATE sur profiles, sous peine de recasser silencieusement la
-- modération (suspend_user/ban_user cesseraient de fonctionner, pas de
-- lever d'exception visible côté staff au premier abord — juste un profil
-- qui reste non banni malgré l'appel RPC réussi).
--
-- MISE A JOUR (9 septembre 2026) - piege de nom de trigger partage trouve
-- apres coup : le trigger trg_protect_profile_trust_columns cree ci-dessous
-- est en BEFORE UPDATE seulement. supabase-profile-insert-trust-columns-
-- protect-fix.sql redefinit ensuite CE MEME trigger (meme nom, sur
-- "profiles") en BEFORE INSERT OR UPDATE, pour bloquer aussi
-- l'auto-attribution de ces colonnes de confiance a LA CREATION du profil
-- (banned_at/report_count/email_verified/etc. choisis librement dans le
-- premier insert). Si CE fichier-ci est re-execute APRES
-- supabase-profile-insert-trust-columns-protect-fix.sql (ordre alphabetique
-- inverse des deux noms de fichiers : "insert" vient avant "trust"), le
-- "drop trigger if exists" + "create trigger ... before update" ci-dessous
-- ecrase SILENCIEUSEMENT la version BEFORE INSERT OR UPDATE, reintroduisant
-- le contournement cote INSERT sans aucune erreur visible. Si vous devez
-- reprendre ce fichier apres coup, re-executez immediatement apres
-- supabase-profile-insert-trust-columns-protect-fix.sql pour restaurer la
-- protection INSERT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger de protection — même principe que protect_founder_flag /
-- protect_premium_flag, étendu à un drapeau de contournement transactionnel.
-- ----------------------------------------------------------------------------
create or replace function protect_profile_trust_columns()
returns trigger language plpgsql as $$
begin
  if auth.role() = 'authenticated'
     and coalesce(current_setting('baobab.trust_column_write', true), '') <> 'on'
     and (
       new.banned_at is distinct from old.banned_at
       or new.ban_reason is distinct from old.ban_reason
       or new.suspended_until is distinct from old.suspended_until
       or new.suspend_reason is distinct from old.suspend_reason
       or new.report_count is distinct from old.report_count
       or new.flagged_for_review is distinct from old.flagged_for_review
       or new.email_verified is distinct from old.email_verified
       or new.phone_verified is distinct from old.phone_verified
     )
  then
    raise exception 'Cette colonne ne peut pas etre modifiee directement via l''application — action serveur (moderation ou verification) requise.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_trust_columns on profiles;
create trigger trg_protect_profile_trust_columns
before update on profiles
for each row
execute function protect_profile_trust_columns();

-- ----------------------------------------------------------------------------
-- 2. RPC de modération (supabase-admin.sql) — ajout du drapeau de
-- contournement juste avant leur UPDATE interne. Logique métier inchangée.
-- ----------------------------------------------------------------------------
create or replace function suspend_user(p_profile_id uuid, p_until timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_rank int; v_target_rank int;
begin
  if p_profile_id = current_profile_id() then raise exception 'Cible invalide'; end if;
  v_actor_rank := role_rank(platform_role(current_profile_id()));
  v_target_rank := role_rank(platform_role(p_profile_id));
  if v_actor_rank < 1 then raise exception 'Non autorise'; end if;
  if v_target_rank >= v_actor_rank then raise exception 'Impossible d''agir sur ce compte'; end if;

  perform set_config('baobab.trust_column_write', 'on', true);
  update profiles set suspended_until = p_until, suspend_reason = p_reason where id = p_profile_id;

  insert into admin_actions (actor_id, action_type, target_profile_id, reason, metadata)
  values (current_profile_id(), 'user_suspended', p_profile_id, p_reason, jsonb_build_object('until', p_until));
end;
$$;

create or replace function unsuspend_user(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  perform set_config('baobab.trust_column_write', 'on', true);
  update profiles set suspended_until = null, suspend_reason = null where id = p_profile_id;
  insert into admin_actions (actor_id, action_type, target_profile_id)
  values (current_profile_id(), 'user_unsuspended', p_profile_id);
end;
$$;

create or replace function ban_user(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor_rank int; v_target_rank int;
begin
  if p_profile_id = current_profile_id() then raise exception 'Cible invalide'; end if;
  v_actor_rank := role_rank(platform_role(current_profile_id()));
  v_target_rank := role_rank(platform_role(p_profile_id));
  if v_actor_rank < 2 then raise exception 'Non autorise'; end if; -- ban reserve a admin+
  if v_target_rank >= v_actor_rank then raise exception 'Impossible d''agir sur ce compte'; end if;

  perform set_config('baobab.trust_column_write', 'on', true);
  update profiles set banned_at = now(), ban_reason = p_reason where id = p_profile_id;

  insert into admin_actions (actor_id, action_type, target_profile_id, reason)
  values (current_profile_id(), 'user_banned', p_profile_id, p_reason);
end;
$$;

create or replace function unban_user(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_or_above() then raise exception 'Non autorise'; end if;
  perform set_config('baobab.trust_column_write', 'on', true);
  update profiles set banned_at = null, ban_reason = null where id = p_profile_id;
  insert into admin_actions (actor_id, action_type, target_profile_id)
  values (current_profile_id(), 'user_unbanned', p_profile_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Trigger système de signalement (supabase-dating-2.sql) — même ajout.
-- ----------------------------------------------------------------------------
create or replace function flag_profile_on_reports()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('baobab.trust_column_write', 'on', true);
  update profiles
  set report_count = report_count + 1,
      flagged_for_review = (report_count + 1) >= 3
  where id = new.to_id;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
--
-- -- en tant qu'utilisateur authentifié normal, sur SON PROPRE profil :
-- update profiles set banned_at = null where id = '<mon_profile_id>';
-- -- doit lever : "Cette colonne ne peut pas etre modifiee directement..."
-- update profiles set suspended_until = null where id = '<mon_profile_id>';
-- update profiles set report_count = 0 where id = '<mon_profile_id>';
-- update profiles set flagged_for_review = false where id = '<mon_profile_id>';
-- update profiles set email_verified = true where id = '<mon_profile_id>';
-- update profiles set phone_verified = true where id = '<mon_profile_id>';
-- -- toutes doivent échouer avec la même exception.
--
-- -- en tant que compte admin/super_admin (déjà présent dans platform_roles) :
-- select ban_user('<uuid_profil_de_test>', 'test'); -- doit toujours réussir
-- select unban_user('<uuid_profil_de_test>');        -- doit toujours réussir
-- select suspend_user('<uuid_profil_de_test>', now() + interval '1 day', 'test');
-- select unsuspend_user('<uuid_profil_de_test>');
--
-- select tgname from pg_trigger where tgname = 'trg_protect_profile_trust_columns';
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-profile-insert-trust-columns-protect-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF CRITIQUE — colonnes de confiance de "profiles" librement
-- choisies A LA CREATION du profil (contournement total des protections
-- déjà posées côté UPDATE).
--
-- Trouvé en poursuivant l'angle "policy RLS trop permissive au niveau
-- colonne" côté INSERT cette fois (déjà fait côté UPDATE dans
-- supabase-profile-trust-columns-protect-fix.sql, supabase-founder-badge.sql
-- et supabase-premium-badge-protect.sql).
--
-- CONSTAT : la policy INSERT sur "profiles" (supabase-scale-security.sql,
-- "Creation de son propre profil uniquement") ne vérifie QUE la propriété
-- de la ligne :
--   with check (auth.uid() = user_id)
-- Elle ne dit RIEN sur les autres colonnes. Et les TROIS triggers qui
-- protègent normalement les colonnes sensibles de "profiles" sont tous les
-- trois déclarés "BEFORE UPDATE" uniquement (comparaison NEW vs OLD) :
--   - protect_profile_trust_columns (supabase-profile-trust-columns-protect-fix.sql)
--   - protect_founder_flag (supabase-founder-badge.sql)
--   - protect_premium_flag (supabase-premium-badge-protect.sql)
-- Aucun des trois ne s'exécute sur INSERT (il n'y a même pas de ligne OLD à
-- comparer) — un simple appel authentifié
--   supabase.from('profiles').insert({ user_id: auth.uid(), name: '...',
--     is_founder: true, is_premium: true, email_verified: true,
--     phone_verified: true, banned_at: null, report_count: 0,
--     flagged_for_review: false })
-- crée directement le profil dans l'état "de confiance maximale", sans
-- jamais passer par Stripe, par la vérification email/téléphone réelle, ni
-- par un badge fondateur unique attribué manuellement. Aucune table
-- "profiles" existante n'est écrasée (contrainte d'unicité sur user_id,
-- supabase-scale-security.sql) : l'attaque ne fonctionne que sur SA PROPRE
-- toute première création de profil (juste après l'inscription, avant ou à
-- la place de l'insert habituel fait par l'application) — largement
-- suffisant pour un compte flambant neuf qui s'auto-attribue Premium/le
-- badge fondateur/les vérifications email+téléphone dès l'inscription.
--
-- CORRECTIF : les trois triggers deviennent BEFORE INSERT OR UPDATE. Sur
-- INSERT (pas de ligne OLD), chaque colonne sensible doit valoir exactement
-- sa valeur par défaut sûre, sauf si le drapeau de contournement
-- transactionnel (déjà utilisé pour l'UPDATE) est actif. Le comportement
-- UPDATE existant est repris à l'identique (aucune régression).
--
-- Ordre d'exécution : à appliquer APRÈS supabase-profile-trust-columns-
-- protect-fix.sql, supabase-founder-badge.sql et supabase-premium-badge-
-- protect.sql (ce correctif fait un "create or replace" des trois fonctions
-- qui y sont définies et un "create trigger" avec les mêmes noms — idempotent).
-- ============================================================================

create or replace function protect_profile_trust_columns()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if auth.role() = 'authenticated'
       and coalesce(current_setting('baobab.trust_column_write', true), '') <> 'on'
       and (
         new.banned_at is not null
         or new.ban_reason is not null
         or new.suspended_until is not null
         or new.suspend_reason is not null
         or coalesce(new.report_count, 0) <> 0
         or coalesce(new.flagged_for_review, false) <> false
         or coalesce(new.email_verified, false) <> false
         or coalesce(new.phone_verified, false) <> false
       )
    then
      raise exception 'Cette colonne ne peut pas etre definie a la creation du profil — action serveur (moderation ou verification) requise.';
    end if;
    return new;
  end if;

  if auth.role() = 'authenticated'
     and coalesce(current_setting('baobab.trust_column_write', true), '') <> 'on'
     and (
       new.banned_at is distinct from old.banned_at
       or new.ban_reason is distinct from old.ban_reason
       or new.suspended_until is distinct from old.suspended_until
       or new.suspend_reason is distinct from old.suspend_reason
       or new.report_count is distinct from old.report_count
       or new.flagged_for_review is distinct from old.flagged_for_review
       or new.email_verified is distinct from old.email_verified
       or new.phone_verified is distinct from old.phone_verified
     )
  then
    raise exception 'Cette colonne ne peut pas etre modifiee directement via l''application — action serveur (moderation ou verification) requise.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_trust_columns on profiles;
create trigger trg_protect_profile_trust_columns
before insert or update on profiles
for each row
execute function protect_profile_trust_columns();

create or replace function protect_founder_flag()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if coalesce(new.is_founder, false) = true and auth.role() = 'authenticated' then
      raise exception 'is_founder ne peut pas etre defini a la creation du profil — action admin requise.';
    end if;
    return new;
  end if;

  if new.is_founder is distinct from old.is_founder and auth.role() = 'authenticated' then
    raise exception 'is_founder ne peut pas etre modifie via l''application — action admin requise.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_founder_flag on profiles;
create trigger trg_protect_founder_flag
before insert or update on profiles
for each row
execute function protect_founder_flag();

create or replace function protect_premium_flag()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if coalesce(new.is_premium, false) = true and auth.role() = 'authenticated' then
      raise exception 'is_premium ne peut pas etre defini a la creation du profil — synchronise automatiquement depuis les abonnements.';
    end if;
    return new;
  end if;

  if new.is_premium is distinct from old.is_premium and auth.role() = 'authenticated' then
    raise exception 'is_premium ne peut pas etre modifie via l''application — synchronise automatiquement depuis les abonnements.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_premium_flag on profiles;
create trigger trg_protect_premium_flag
before insert or update on profiles
for each row
execute function protect_premium_flag();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
--
-- -- en tant qu'utilisateur authentifie normal, en creant un NOUVEAU profil :
-- insert into profiles (user_id, name, is_founder) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, is_premium) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, email_verified) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, phone_verified) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, report_count) values (auth.uid(), 'Test', 5);
-- -- toutes doivent echouer avec l'exception correspondante ; un insert sans
-- -- ces colonnes (valeurs par defaut) doit toujours reussir normalement.
--
-- select tgname, tgtype from pg_trigger
--   where tgrelid = 'public.profiles'::regclass
--   and tgname in ('trg_protect_profile_trust_columns','trg_protect_founder_flag','trg_protect_premium_flag');
-- ============================================================================


-- ============================================================================
-- SOURCE : supabase-profile-bio-length-guard-fix.sql
-- ============================================================================
-- ============================================================================
-- Corrige un bug d'audit (passe applicatif/UX : cohérence validation client
-- vs serveur du formulaire de profil) : le champ "bio" de "profiles" est
-- limité à 300 caractères CÔTÉ CLIENT à trois endroits (EditProfileForm.jsx,
-- Step9PersonalityBio.jsx à l'onboarding, et la troncature appliquée au
-- résultat d'AiSuggestButton "Améliorer ma bio" dans les deux écrans) — mais
-- ne l'était NULLE PART côté serveur : la colonne "bio" est un simple "text"
-- sans aucune contrainte (voir supabase-schema.sql, ligne "bio text,").
--
-- supabase-profile-text-length-guard-fix.sql avait déjà ajouté la garde
-- serveur symétrique pour name/last_name/country/province/city/occupation/
-- arrival_city, mais son commentaire affirmait par erreur que "bio" était
-- "limitée à 300 caractères des deux côtés" : ce n'est vrai que côté client.
-- Un appel direct à l'API Supabase (contournant l'UI, avec un JWT valide déjà
-- authentifié) peut donc toujours écrire une bio arbitrairement longue,
-- ensuite affichée telle quelle sur PublicProfileModal/ProfileTab/les cartes
-- de match, comme les autres champs déjà corrigés.
--
-- Même modèle que supabase-profile-text-length-guard-fix.sql : idempotent,
-- NOT VALID (ne valide jamais rétroactivement les lignes déjà en base — seules
-- les prochaines écritures sont contrôlées).
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_length') then
    alter table profiles add constraint profiles_bio_length
      check (bio is null or char_length(bio) <= 300) not valid;
  end if;
end $$;

-- Optionnel, une fois toutes les lignes existantes vérifiées propres :
-- valider réellement la contrainte ci-dessus (la rend opposable aux lignes
-- déjà en base, pas seulement aux futures écritures) :
--   alter table profiles validate constraint profiles_bio_length;


-- ============================================================================
-- SOURCE : supabase-remaining-text-length-guards-fix.sql
-- ============================================================================
-- ============================================================================
-- Audit de confiance (cette passe) : un correctif précédent
-- (supabase-profile-text-length-guard-fix.sql) affirmait dans son propre
-- commentaire que "bio" était "déjà protégée côté serveur", ce qui était
-- faux — jamais vérifié empiriquement, seulement supposé
-- (supabase-profile-bio-length-guard-fix.sql a corrigé "bio" seule). Cette
-- passe relit donc RÉELLEMENT le SQL de base de chaque colonne prétendument
-- protégée, puis étend la vérification à toutes les colonnes texte libre de
-- contenu généré par l'utilisateur trouvées dans le dépôt.
--
-- Résultat de l'audit des correctifs déjà écrits (aucune correction requise
-- ici, seulement une vérification) :
--   - supabase-profile-text-length-guard-fix.sql (name/last_name/country/
--     province/city/occupation/arrival_city) : contraintes CHECK réellement
--     présentes dans ce même fichier, aucune autre définition de "profiles"
--     ne les contredit. Confirmé correct.
--   - supabase-profile-bio-length-guard-fix.sql (bio) : idem, confirmé correct.
--   - community_posts.body / post_comments.body / posts.body (fil général)
--     (supabase-communities.sql, supabase-feed-posts.sql) : la contrainte
--     "check (char_length(body) between 1 and 4000)" / "...1000)" est posée
--     directement à la création de la table — confirmé correct par lecture
--     directe, pas par confiance au commentaire.
--   - event_comments.body (supabase-events-v2.sql) : même motif, confirmé
--     correct (between 1 and 1000).
--   - messages.text (supabase-scale-security-2.sql) : "check (text is null
--     or char_length(text) <= 4000)" réellement présent. Confirmé correct —
--     couvre aussi la réponse à un statut (sendStoryReply -> messages).
--   - immigration-news/info/beta-feedback (title/summary/body/message) :
--     contraintes "between X and Y" réellement présentes à la création des
--     tables (supabase-info.sql, supabase-beta-tracking.sql,
--     supabase-beta-feedback-category.sql). Confirmé correct.
--
-- Colonnes texte libre trouvées SANS AUCUNE contrainte serveur réelle (vérifié
-- par lecture directe de supabase-communities.sql, supabase-events.sql,
-- supabase-events-v2.sql, supabase-stories.sql, supabase-messaging.sql,
-- supabase-info.sql — pas seulement grep des commentaires) — voir le tableau
-- complet dans le résumé de session. Toutes ont déjà une limite CÔTÉ CLIENT
-- (sauf communities.city / events.city / events.location, qui n'en ont
-- aucune, ni client ni serveur) ; ce script ajoute la garde serveur
-- manquante, au même modèle que les correctifs précédents : idempotent
-- (if not exists sur pg_constraint), NOT VALID (ne valide jamais
-- rétroactivement les lignes déjà en base — seules les prochaines écritures
-- sont contrôlées). À exécuter dans Supabase : SQL Editor (une fois,
-- indépendant des autres scripts de cette liste).
-- ============================================================================

-- ---------- communities (name/description/rules/city) ----------
-- Limites alignées sur le client (CommunityCreateForm.jsx : NAME_MAX=80,
-- DESCRIPTION_MAX=300, RULES_MAX=1000) ; "city" n'a de limite nulle part
-- (ni client ni serveur) — alignée sur profiles_city_length (80).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_name_length') then
    alter table communities add constraint communities_name_length
      check (char_length(name) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_description_length') then
    alter table communities add constraint communities_description_length
      check (description is null or char_length(description) <= 300) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_rules_length') then
    alter table communities add constraint communities_rules_length
      check (rules is null or char_length(rules) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_city_length') then
    alter table communities add constraint communities_city_length
      check (city is null or char_length(city) <= 80) not valid;
  end if;
end $$;

-- ---------- events (title/description/city/location) ----------
-- Limites alignées sur le client (EventCreateForm.jsx/EventEditForm.jsx :
-- TITLE_MAX=80, DESCRIPTION_MAX=500) ; "city" (alignée sur
-- profiles_city_length, 80) et "location" (lieu public optionnel, ex.
-- "Café Aunja, Plateau-Mont-Royal" — 150) n'ont de limite nulle part.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_title_length') then
    alter table events add constraint events_title_length
      check (char_length(title) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_description_length') then
    alter table events add constraint events_description_length
      check (description is null or char_length(description) <= 500) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_city_length') then
    alter table events add constraint events_city_length
      check (city is null or char_length(city) <= 80) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_location_length') then
    alter table events add constraint events_location_length
      check (location is null or char_length(location) <= 150) not valid;
  end if;
end $$;

-- ---------- stories.text (statuts) ----------
-- Limite alignée sur le client (StoryComposerModal.jsx : maxLength={280}).

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stories_text_length') then
    alter table stories add constraint stories_text_length
      check (text is null or char_length(text) <= 280) not valid;
  end if;
end $$;

-- ---------- reason des signalements (profil/communauté/post/événement/info)
-- ----------
-- Les cinq tables de signalement partagent la même modale côté client
-- (ReportModal.jsx), qui tronque déjà "reason" à 1000 caractères
-- (truncateUnicodeSafe(e.target.value, 1000)) — mais aucune des cinq tables
-- n'avait de contrainte serveur correspondante : un appel direct à l'API
-- pouvait toujours écrire un texte de taille arbitraire. "info_reports" et
-- "recommendation_feedback" ne sont pour l'instant appelées par aucun
-- composant de l'interface (fonctionnalité non branchée / feedback jamais
-- envoyé avec un motif) mais restent atteignables via l'API avec un JWT
-- valide — protégées par cohérence avec le reste de la famille.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_reason_length') then
    alter table reports add constraint reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'community_reports_reason_length') then
    alter table community_reports add constraint community_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'post_reports_reason_length') then
    alter table post_reports add constraint post_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_reports_reason_length') then
    alter table event_reports add constraint event_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'info_reports_reason_length') then
    alter table info_reports add constraint info_reports_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recommendation_feedback_reason_length') then
    alter table recommendation_feedback add constraint recommendation_feedback_reason_length
      check (reason is null or char_length(reason) <= 1000) not valid;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Colonnes texte volontairement NON incluses ci-dessus, vérifiées puis
-- écartées (pas une omission) :
--   - profiles.interests / usage_goals / pref_looking_for / relationship_values
--     / relationship_needs / wants_children / family_importance / career_goal
--     / geographic_openness / personality_evening / personality_travel /
--     immigration_status / education_level : toutes alimentées exclusivement
--     par des ChipSelect à vocabulaire FIXE côté client (constants.js), pas
--     du texte réellement libre — vérifié en lisant chaque Step*.jsx /
--     EditProfileForm.jsx, pas supposé.
--   - blocks : pas de colonne "reason" du tout (vérifié dans
--     supabase-matching.sql) — rien à protéger.
--   - suspend_reason / ban_reason (supabase-admin.sql) : saisis par un
--     modérateur/admin de confiance, jamais par un utilisateur final — hors
--     périmètre "contenu généré par l'utilisateur" de cet audit.
--   - user_locations.city/region/country (supabase-geolocation.sql) :
--     renseignées par le service de géolocalisation IP côté serveur, jamais
--     tapées par l'utilisateur.
--
-- Optionnel, une fois toutes les lignes existantes vérifiées propres :
-- valider réellement les contraintes ci-dessus (les rend opposables aux
-- lignes déjà en base, pas seulement aux futures écritures) :
--   alter table communities validate constraint communities_name_length;
--   alter table communities validate constraint communities_description_length;
--   alter table communities validate constraint communities_rules_length;
--   alter table communities validate constraint communities_city_length;
--   alter table events validate constraint events_title_length;
--   alter table events validate constraint events_description_length;
--   alter table events validate constraint events_city_length;
--   alter table events validate constraint events_location_length;
--   alter table stories validate constraint stories_text_length;
--   alter table reports validate constraint reports_reason_length;
--   alter table community_reports validate constraint community_reports_reason_length;
--   alter table post_reports validate constraint post_reports_reason_length;
--   alter table event_reports validate constraint event_reports_reason_length;
--   alter table info_reports validate constraint info_reports_reason_length;
--   alter table recommendation_feedback validate constraint recommendation_feedback_reason_length;


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
-- SOURCE : supabase-profile-reports-moderation.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF SÉCURITÉ — trouvé lors de l'audit autonome complet du 22 août
-- 2026 (prompt-audit-autonome-complet-baobab.md, section Sécurité/
-- vérification/modération) : les signalements de PROFIL (table "reports",
-- from_id/to_id — utilisés depuis Découverte, le profil public et la
-- messagerie, donc le type de signalement le plus sensible : harcèlement,
-- arnaque, comportement inapproprié entre deux personnes réellement mises
-- en relation) n'étaient JAMAIS visibles par un modérateur.
--
-- admin_list_reports()/admin_resolve_report() (supabase-admin.sql) ne
-- couvraient que community_reports/event_reports/post_reports/info_reports
-- — "reports" (profils) en était absent, et la table n'avait même pas de
-- colonne "status" pour en suivre le traitement. Un signalement de profil
-- soumis par un utilisateur restait donc inséré en base sans jamais être vu
-- ni traité par personne.
--
-- À exécuter dans Supabase : SQL Editor (une fois), après supabase-admin.sql
-- et supabase-messaging.sql. Additif uniquement.
-- ============================================================================

alter table reports add column if not exists status text not null default 'open';

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
    order by created_at desc;
end;
$$;

create or replace function admin_resolve_report(p_source text, p_id uuid, p_dismiss boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_status text := case when p_dismiss then 'dismissed' else 'resolved' end;
begin
  if not is_moderator_or_above() then raise exception 'Non autorise'; end if;
  if p_source = 'community' then
    update community_reports set status = v_status where id = p_id;
  elsif p_source = 'event' then
    update event_reports set status = v_status where id = p_id;
  elsif p_source = 'post' then
    update post_reports set status = v_status where id = p_id;
  elsif p_source = 'info' then
    update info_reports set status = v_status where id = p_id;
  elsif p_source = 'profile' then
    update reports set status = v_status where id = p_id;
  else
    raise exception 'Source inconnue';
  end if;

  insert into admin_actions (actor_id, action_type, metadata)
  values (current_profile_id(), case when p_dismiss then 'report_dismissed' else 'report_resolved' end,
    jsonb_build_object('source', p_source, 'report_id', p_id));
end;
$$;

-- Redéfinit admin_dashboard_stats() en fusionnant les signalements de profil
-- (ce fichier) avec le bloc "monetization" ajouté par
-- supabase-premium-messaging.sql (déjà exécutée en prod) : les deux fichiers
-- font un "create or replace function" sur la même fonction, donc exécuter
-- celui-ci APRÈS premium-messaging sans fusionner effacerait silencieusement
-- le champ "monetization" du JSON retourné.
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
    ) from app_config)
  ) into v_result;
  return v_result;
end;
$$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select admin_dashboard_stats();
-- select * from admin_list_reports('open');
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
-- SOURCE : supabase-events-duration-guard.sql
-- ============================================================================
-- ============================================================================
-- ⚠️ SUPERSEDED pour la partie create_event() (audit de régression,
-- 2026-09-09) : ce fichier (2026-09-01) redéfinit create_event() SANS
-- vérification d'authentification explicite (current_profile_id() is null).
-- supabase-create-community-event-authz-fix.sql (2026-09-04) redéfinit
-- ensuite la MÊME fonction en repartant de cette version-ci (garde durée
-- comprise) et en ajoutant la garde d'auth manquante en tête. Mais dans
-- supabase-COMBINED-pending-fixes.sql, l'ordre était inversé : la section
-- "supabase-create-community-event-authz-fix.sql" est concaténée AVANT la
-- section de CE fichier — donc rejouée dans cet ordre, c'est cette
-- version-ci (sans la garde d'auth) qui gagnait en dernier, effaçant
-- silencieusement la vérification d'authentification de create_event()
-- (impact limité : l'appel anonyme échouait de toute façon plus loin sur une
-- contrainte NOT NULL, sans créer de ligne orpheline — voir le fichier
-- authz pour le détail — mais avec un message d'erreur brut au lieu du rejet
-- propre attendu). Corrigé : la section de ce fichier dans le script
-- consolidé garde la contrainte de table (partie 1, inchangée et unique),
-- mais ne redéfinit plus create_event() (partie 2, retirée) — un commentaire
-- y renvoie vers la section supabase-create-community-event-authz-fix.sql
-- qui porte désormais la seule version à exécuter. Ce fichier est conservé
-- pour l'historique/le contexte ci-dessous, mais sa fonction create_event()
-- ne doit plus être exécutée seule après supabase-create-community-event-
-- authz-fix.sql.
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


-- ============================================================================
-- SOURCE : supabase-block-bypass-fix.sql
-- ============================================================================
-- ============================================================================
-- ⚠️ SUPERSEDED (audit de régression, 2026-09-09) : dans
-- supabase-COMBINED-pending-fixes.sql, ce fichier (2026-09-03, ne connaît que
-- la condition de blocage) est concaténé APRÈS supabase-banned-target-action-
-- fix.sql / supabase-onboarding-incomplete-target-action-fix.sql / supabase-
-- deletion-pending-target-action-fix.sql (2026-09-04, commits c4fe934/
-- 915df69/a2b120a), qui redéfinissent déjà ces mêmes policies avec le
-- blocage CUMULÉ à banni/suspendu + onboarding incomplet + suppression en
-- attente. Exécuté après eux, ce fichier-ci les redéfinit une 4e fois avec
-- SEULEMENT la condition de blocage — effaçant silencieusement les 3 autres
-- gardes sur likes/follows/favorites/event_invitations ("messages" n'est pas
-- touché par ce fichier et reste protégé). Utiliser désormais
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql (à exécuter en
-- dernier, ou seul) pour garantir les 4 conditions cumulées quel que soit
-- l'ordre d'exécution passé. Ce fichier est conservé pour le contexte/
-- l'historique de l'audit ci-dessous, mais ne doit plus être exécuté seul
-- après les trois fixes ci-dessus.
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
-- ⚠️ SUPERSEDED (audit de régression, 2026-09-09) : ce fichier (2026-09-03)
-- redéfinit check_report_rate_limit() avec SEULEMENT le compteur "reports"
-- (20/24h). supabase-global-action-rate-limit-fix.sql (2026-09-04) redéfinit
-- ensuite la MÊME fonction en ajoutant le garde-fou transversal
-- "global_recent_action_count(...) >= 40" — son propre en-tête dit d'ailleurs
-- explicitement devoir s'exécuter APRÈS ce fichier-ci. Mais dans
-- supabase-COMBINED-pending-fixes.sql, l'ordre était inversé : la section
-- "supabase-global-action-rate-limit-fix.sql" est concaténée AVANT la
-- section de CE fichier — donc rejouée dans cet ordre, c'est cette version-ci
-- (sans le compteur global) qui gagnait en dernier, effaçant silencieusement
-- le garde-fou transversal pour "reports" (les 4 autres tables — messages/
-- likes/follows/event_invitations — restaient protégées, non touchées par ce
-- fichier). Corrigé : la section de ce fichier dans le script consolidé ne
-- redéfinit plus la fonction (retirée), un commentaire y renvoie vers la
-- section supabase-global-action-rate-limit-fix.sql qui porte désormais la
-- seule version à exécuter. Ce fichier est conservé pour l'historique/le
-- contexte ci-dessous, mais ne doit plus être exécuté seul après
-- supabase-global-action-rate-limit-fix.sql.
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
-- SOURCE : supabase-posts-account-state-guard-fix.sql
-- ============================================================================
-- ============================================================================
-- CORRECTIF — policies INSERT de "posts" et "post_media" (fil général)
-- n'appliquaient AUCUN des 4 gardes d'état de compte déjà posés sur
-- likes/follows/favorites/messages/event_invitations par
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql (banni/suspendu,
-- onboarding incomplet, suppression en attente — le blocage entre profils ne
-- s'applique pas ici, "posts" n'a pas de notion de destinataire).
--
-- TROUVÉ (audit de régression, 2026-09-09, angle "post_media aligné sur le
-- pattern des guards d'état de compte") :
--
-- 1. supabase-feed-posts.sql — policy "Publier en son propre nom" sur
--    "posts" (for insert) ne vérifie QUE "author_id = current_profile_id()".
--    Un compte banni, suspendu, n'ayant jamais terminé l'onboarding, ou en
--    attente de suppression peut donc toujours créer une nouvelle
--    publication texte par appel direct à l'API PostgREST — le blocage
--    "own.banned_at → setView('banned')" dans App.jsx (ligne ~810) est
--    réel pour l'app elle-même, mais n'a jamais été qu'un garde côté client,
--    comme déjà noté pour likes/follows/favorites avant leur correctif.
--
-- 2. supabase-post-media.sql — policy "Ajouter un media a sa propre
--    publication" sur "post_media" (for insert) ne vérifie que l'appartenance
--    de la publication parente ("p.author_id = current_profile_id()"), sans
--    aucun garde d'état de compte. Donc même une fois (1) corrigé, un compte
--    banni/suspendu/onboarding incomplet/suppression en attente qui possède
--    déjà une publication ANTÉRIEURE à son changement d'état (créée quand il
--    était en règle) peut continuer à lui attacher indéfiniment de nouvelles
--    photos/vidéos par appel direct à l'API — réponse à la question posée :
--    OUI, un compte banni peut toujours publier via post_media tant que (1)
--    et (2) ne sont pas corrigés ensemble.
--
-- IMPACT : les deux trous se cumulent. (1) seul seul ne suffit pas : un
-- compte déjà banni après coup garde ses publications existantes et peut
-- toujours y ajouter des médias via (2). (2) seul ne suffit pas non plus :
-- un compte banni peut créer une publication texte fraîche via (1) puis lui
-- attacher des médias tant que (2) n'est pas corrigé. D'où un correctif
-- unique couvrant les deux tables.
--
-- Hors périmètre volontairement : "post_likes" et "post_comments" (même
-- fichier supabase-feed-posts.sql) ont exactement la même lacune, mais ne
-- font pas partie de l'angle d'audit choisi ici (guards d'état de compte sur
-- post_media) — à traiter dans un correctif séparé si l'équipe le souhaite.
--
-- Idempotent (drop + create). Sans risque de régression pour un compte en
-- règle : les 4 "not exists" ne portent que sur les états banni/suspendu/
-- onboarding incomplet/suppression en attente, jamais sur le contenu.
-- À exécuter dans Supabase : SQL Editor, après supabase-post-media.sql (et
-- donc après supabase-feed-posts.sql). Jamais exécuté contre la base de
-- production par cette session (règle de sécurité de cet audit).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "posts" — garde porté sur l'auteur lui-même (pas de notion de
-- destinataire distinct ici, contrairement à likes/follows/favorites).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'posts' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.posts', pol.policyname);
  end loop;

  create policy "Publier en son propre nom"
  on posts for insert
  to authenticated
  with check (
    author_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "post_media" — garde porté sur l'auteur de la publication parente
-- (post_media n'a pas sa propre colonne author_id).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'post_media' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.post_media', pol.policyname);
  end loop;

  create policy "Ajouter un media a sa propre publication"
  on post_media for insert
  to authenticated
  with check (
    exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = current_profile_id())
    and not exists (
      select 1 from posts p
      join profiles pr on pr.id = p.author_id
      where p.id = post_media.post_id
        and (pr.banned_at is not null or (pr.suspended_until is not null and pr.suspended_until > now()))
    )
    and not exists (
      select 1 from posts p
      join profiles pr on pr.id = p.author_id
      where p.id = post_media.post_id
        and pr.onboarding_completed_at is null
    )
    and not exists (
      select 1 from posts p
      join profiles pr on pr.id = p.author_id
      where p.id = post_media.post_id
        and pr.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — les deux policies
-- doivent chacune contenir "banned_at", "onboarding_completed_at" ET
-- "deletion_requested_at" dans leur "with check" :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('posts','post_media') and cmd = 'a';
-- ============================================================================

