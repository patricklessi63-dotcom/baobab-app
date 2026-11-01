-- ============================================================================
-- Âge affiché des membres : le recalculer chaque jour (SQL-24, 1er novembre 2026).
--
-- PROBLÈME : `profiles.age` est un entier écrit UNE fois (à l'inscription ou quand le membre
-- modifie son profil, via computeAge() côté client). Rien ne le fait vieillir : un membre né
-- le 15 mars affichait son ancien âge jusqu'à sa prochaine modification de profil, et c'est
-- ce nombre-là que voient les autres membres (Découverte, profils, filtres d'âge). Constaté en
-- production le 01/11/2026 : 1 profil sur 5 avait déjà un âge périmé.
--
-- CORRECTIF : une fonction qui recalcule `age` à partir de `birth_date` pour les seules lignes
-- dont l'âge a changé (aux anniversaires : quelques lignes par jour, aucun verrou notable), et
-- une tâche pg_cron quotidienne. 09:00 UTC = 01:00 à Vancouver (heure d'hiver) : le jour est déjà
-- commencé dans tous les fuseaux du Canada, donc `current_date` (UTC) est la bonne date.
--
-- RISQUE : additif (1 fonction, 1 tâche). Aucune règle ni colonne modifiée. La fonction n'est
-- exécutable par aucun rôle de l'API (anon/authenticated) : seule la tâche (postgres) l'appelle.
-- ANNULER : select cron.unschedule('baobab-refresh-profile-ages'); drop function if exists public.refresh_profile_ages();
-- ============================================================================

create or replace function public.refresh_profile_ages()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  update public.profiles
     set age = date_part('year', age(current_date, birth_date))::int
   where birth_date is not null
     and age is distinct from date_part('year', age(current_date, birth_date))::int;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.refresh_profile_ages() from public, anon, authenticated;

-- >>> PLANIFICATION (pg_cron : absent des environnements de test locaux)
create extension if not exists pg_cron;

select cron.unschedule('baobab-refresh-profile-ages')
where exists (select 1 from cron.job where jobname = 'baobab-refresh-profile-ages');

select cron.schedule(
  'baobab-refresh-profile-ages',
  '0 9 * * *',
  $$ select public.refresh_profile_ages(); $$
);

-- Rattrapage immédiat des âges déjà périmés (renvoie le nombre de lignes corrigées).
select public.refresh_profile_ages() as ages_corriges;

-- ----------------------------------------------------------------------------
-- Vérification après exécution :
--   select jobname, schedule from cron.job where jobname = 'baobab-refresh-profile-ages';   -- 1 ligne, '0 9 * * *'
--   select count(*) from profiles where birth_date is not null
--     and age is distinct from date_part('year', age(current_date, birth_date))::int;       -- 0
--   select has_function_privilege('anon', 'public.refresh_profile_ages()', 'EXECUTE'),
--          has_function_privilege('authenticated', 'public.refresh_profile_ages()', 'EXECUTE');   -- false | false
-- ============================================================================
