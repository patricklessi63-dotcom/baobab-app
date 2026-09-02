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
