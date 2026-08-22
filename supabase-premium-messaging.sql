-- ============================================================================
-- Monétisation de la messagerie post-match — CODÉ ET PRÊT, DÉSACTIVÉ par
-- défaut (monetization_enabled = false). L'admin l'active manuellement une
-- fois le seuil d'utilisateurs atteint (jamais automatique — voir rapport).
--
-- Réutilise is_premium(profile_id) déjà défini dans supabase-premium.sql
-- (source unique de vérité pour le statut Premium, alimenté par le webhook
-- Stripe) — aucune nouvelle notion de "premium" inventée ici.
--
-- Prérequis : supabase-admin.sql (admin_actions, is_admin_or_above,
-- current_profile_id), supabase-premium.sql (is_premium), supabase-scale-
-- security.sql (RLS messages déjà en place, non modifiée par ce fichier).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Configuration centrale — une seule ligne, jamais dispersée dans le
-- code React (item 9 du cahier des charges). Lecture publique (nécessaire
-- pour que le client sache afficher "X/20 messages" et griser
-- photo/vidéo), écriture uniquement via la RPC admin plus bas.
-- ----------------------------------------------------------------------------
create table if not exists app_config (
  id boolean primary key default true,
  constraint app_config_singleton check (id = true),
  monetization_enabled boolean not null default false,
  premium_threshold int not null default 500,
  free_message_limit int not null default 20,
  updated_at timestamptz not null default now()
);
insert into app_config (id) values (true) on conflict (id) do nothing;

alter table app_config enable row level security;
drop policy if exists "Lecture par les utilisateurs connectes" on app_config;
create policy "Lecture par les utilisateurs connectes"
on app_config for select to authenticated using (true);
-- Aucune policy insert/update/delete cliente : seule admin_set_monetization()
-- (SECURITY DEFINER) peut modifier cette ligne.

-- ----------------------------------------------------------------------------
-- 2. Compteur de messages gratuits — pas de table de compteur séparée :
-- deleted_for/deleted_at sur "messages" sont des suppressions LOGIQUES (la
-- ligne reste en base, voir supabase-messaging-2.sql), donc un simple
-- COUNT(*) reste fiable après une suppression "pour moi" ou "pour tout le
-- monde" — un utilisateur ne peut pas regagner des messages gratuits en
-- supprimant puis renvoyant (item 10/11 du cahier des charges).
-- ----------------------------------------------------------------------------
create or replace function enforce_premium_message_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_cfg app_config;
  v_used int;
begin
  select * into v_cfg from app_config where id = true;
  if v_cfg is null or not v_cfg.monetization_enabled then
    return new;
  end if;
  if is_premium(new.from_id) then
    return new;
  end if;

  if new.kind in ('photo', 'video') then
    raise exception 'PREMIUM_MEDIA_REQUIRED: l''envoi de photos et vidéos nécessite Baobab Premium.';
  end if;

  if new.kind = 'text' then
    select count(*) into v_used
    from messages
    where match_key = new.match_key and from_id = new.from_id and kind = 'text';
    if v_used >= v_cfg.free_message_limit then
      raise exception 'FREE_MESSAGE_LIMIT_REACHED: limite de % messages gratuits atteinte pour cette conversation.', v_cfg.free_message_limit;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_premium_message_limits on messages;
create trigger trg_enforce_premium_message_limits
before insert on messages
for each row execute function enforce_premium_message_limits();

-- ----------------------------------------------------------------------------
-- 3. RPC de lecture du quota — évite au client de compter lui-même (source
-- unique de vérité côté serveur, item 12 : jamais de vérification
-- "if (count >= 20)" côté React seul).
-- ----------------------------------------------------------------------------
create or replace function get_message_quota(p_match_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
  v_cfg app_config;
  v_used int;
begin
  if v_me is null or v_me::text <> any (string_to_array(p_match_key, '__')) then
    raise exception 'Non autorise';
  end if;
  select * into v_cfg from app_config where id = true;
  select count(*) into v_used from messages
  where match_key = p_match_key and from_id = v_me and kind = 'text';
  return jsonb_build_object(
    'monetization_enabled', coalesce(v_cfg.monetization_enabled, false),
    'is_premium', is_premium(v_me),
    'used', v_used,
    'limit', coalesce(v_cfg.free_message_limit, 20)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC admin — active/désactive la monétisation. Jamais automatique même
-- si le seuil est atteint (item 7/26/27 du cahier des charges).
-- ----------------------------------------------------------------------------
alter table admin_actions drop constraint if exists admin_actions_action_type_check;
alter table admin_actions add constraint admin_actions_action_type_check check (action_type in (
  'role_granted','role_revoked','user_suspended','user_unsuspended',
  'user_banned','user_unbanned','report_resolved','report_dismissed',
  'monetization_enabled','monetization_disabled'
));

create or replace function admin_set_monetization(p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin_or_above() then raise exception 'Non autorise'; end if;
  update app_config set monetization_enabled = p_enabled, updated_at = now() where id = true;
  insert into admin_actions (actor_id, action_type)
  values (current_profile_id(), case when p_enabled then 'monetization_enabled' else 'monetization_disabled' end);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. Étend les statistiques admin existantes avec le compteur d'utilisateurs
-- et la config monétisation (item 8 : dashboard "⚙️ Monétisation").
-- ----------------------------------------------------------------------------
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
      (select count(*) from info_reports where status = 'open')
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
-- Vérification (facultatif) :
-- select * from app_config;
-- select get_message_quota('<uuid1>__<uuid2>');
-- select admin_set_monetization(true); -- puis false pour annuler le test
-- ============================================================================
