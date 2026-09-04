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
