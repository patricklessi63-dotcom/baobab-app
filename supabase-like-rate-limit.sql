-- ============================================================================
-- Limite de débit sur "likes" (prompt-rencontres-matching-baobab.md, section
-- Sécurité : "Limiter le nombre de nouvelles mises en relation initiées par
-- une même personne sur une courte période"). Même motif et même style que
-- check_message_rate_limit() / check_follow_rate_limit()
-- (supabase-scale-security-2.sql) : garde-fou serveur, généreux pour ne
-- jamais gêner un usage normal (150 likes/24h — largement au-dessus d'un
-- usage réel de swipe), mais bloquant un script sollicitant en masse.
-- À exécuter dans Supabase : SQL Editor (une fois).
-- ============================================================================

create or replace function check_like_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from likes
    where from_id = new.from_id and created_at > now() - interval '24 hours';
  if v_count >= 150 then
    raise exception 'Trop de mises en relation initiees recemment, reessaie plus tard';
  end if;
  return new;
end; $$;
drop trigger if exists trg_like_rate_limit on likes;
create trigger trg_like_rate_limit before insert on likes
for each row execute function check_like_rate_limit();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select proname from pg_proc where proname = 'check_like_rate_limit';
-- ============================================================================
