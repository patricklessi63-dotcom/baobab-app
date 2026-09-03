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
