-- ============================================================================
-- Expiration réelle des statuts (24h) — à exécuter dans Supabase : SQL Editor,
-- après supabase-stories.sql et supabase-scale-security-2.sql (fournit
-- current_profile_id()).
-- ============================================================================
-- Corrige un bug identifié à l'audit : aucune colonne d'expiration n'existait,
-- les statuts restaient visibles indéfiniment. Colonne calculée par trigger
-- (pas "generated always as" — Postgres refuse ça pour timestamptz + interval,
-- l'expression n'est pas IMMUTABLE à cause des transitions d'heure d'été) +
-- policy SELECT réécrite pour que le backend, pas le client, détermine la
-- visibilité.

alter table stories add column if not exists expires_at timestamptz;

create or replace function set_story_expiry()
returns trigger language plpgsql as $$
begin
  new.expires_at := new.created_at + interval '24 hours';
  return new;
end; $$;

drop trigger if exists trg_set_story_expiry on stories;
create trigger trg_set_story_expiry before insert on stories
for each row execute function set_story_expiry();

-- Rattrapage pour les statuts déjà existants (expires_at encore null).
update stories set expires_at = created_at + interval '24 hours' where expires_at is null;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'stories' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.stories', pol.policyname);
  end loop;

  create policy "Statuts non expires visibles par soi-meme ou match mutuel"
  on stories for select
  to authenticated
  using (
    expires_at > now() and (
      profile_id = current_profile_id()
      or (
        exists (select 1 from likes l1 where l1.from_id = current_profile_id() and l1.to_id = stories.profile_id)
        and exists (select 1 from likes l2 where l2.from_id = stories.profile_id and l2.to_id = current_profile_id())
        and not exists (
          select 1 from blocks b
          where (b.from_id = current_profile_id() and b.to_id = stories.profile_id)
             or (b.from_id = stories.profile_id and b.to_id = current_profile_id())
        )
      )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select expires_at, created_at from stories limit 1; -- confirme expires_at = created_at + 24h
-- select policyname, cmd from pg_policies where tablename='stories';
-- ============================================================================
