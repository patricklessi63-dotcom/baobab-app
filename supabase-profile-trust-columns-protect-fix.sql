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
