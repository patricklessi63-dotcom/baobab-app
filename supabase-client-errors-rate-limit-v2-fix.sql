-- ============================================================================
-- SQL-31 — client_errors : plafonds PAR CATÉGORIE + dédoublonnage + plafond de TAILLE.
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Remplace le CORPS de la fonction `client_errors_guard()` posée par SQL-28
-- (supabase-client-errors-rate-limit-fix.sql, exécuté le 04/11/2026) ; le déclencheur reste le même.
--
-- POURQUOI : revue croisée du 4 novembre 2026. Les plafonds de SQL-28 sont GLOBAUX (30/min, 300/jour,
-- 3 000 au total) :
--   (1) un seul visiteur anonyme pouvait épuiser les 30/min et aveugler la remontée d'erreurs de tous ;
--   (2) le jour du lancement, un vrai bug touchant beaucoup de monde atteindrait 300/jour en quelques
--       minutes : la table cesserait d'enregistrer quand on en a le plus besoin ;
--   (3) 3 000 lignes au total se remplissent en ~10 jours à 300/jour alors que la purge est à 30 jours.
--
-- CORRECTIF :
--   1. DÉDOUBLONNAGE : une erreur déjà reçue (même message ET même 1re ligne de pile) dans les
--      10 dernières minutes est IGNORÉE EN SILENCE (aucune erreur côté client, aucune ligne, ne compte pas
--      dans les plafonds). Un bug massif tient donc en quelques lignes au lieu d'en saturer des milliers.
--   2. DEUX COMPARTIMENTS indépendants (le profil_id, imposé par le serveur, les distingue) :
--        anonymes      : 20 / minute et 500 / jour ;
--        connectés     : 120 / minute et 5 000 / jour.
--      Un visiteur anonyme malveillant ne peut plus aveugler les comptes connectés.
--   3. PLAFOND DE TAILLE au lieu d'un nombre de lignes : refus quand la table (index compris) dépasse
--      100 Mo — borne réelle de ce qui peut remplir l'offre gratuite (500 Mo), quelle que soit la taille
--      moyenne d'une ligne. (La purge à 30 jours existante libère de la place.)
--   4. `profile_id` toujours imposé (celui de l'appelant connecté, sinon NULL) : inchangé.
--
-- ADDITIF : `create or replace` d'une fonction ; le déclencheur, la policy et les contraintes ne bougent pas.
-- RETOUR ARRIÈRE : rejouer supabase-client-errors-rate-limit-fix.sql (version SQL-28).
-- CONTRÔLE : select prosrc ilike '%dedoublon%' from pg_proc where proname = 'client_errors_guard'; -- true
-- Validé sur schéma factice PGlite (src/native/clientErrorsRateLimitV2.test.js) et sur la répétition.
-- ============================================================================

create or replace function public.client_errors_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid;
  v_minute int;
  v_day int;
  v_max_minute int;
  v_max_day int;
begin
  -- profile_id : seulement celui de l'appelant authentifié (sinon NULL), jamais celui fourni par le client.
  v_profile := (select p.id from public.profiles p where p.user_id = auth.uid() limit 1);
  new.profile_id := v_profile;

  -- 1. dedoublonnage : même message + même 1re ligne de pile dans les 10 dernières minutes -> ignoré.
  if exists (
    select 1 from public.client_errors e
    where e.created_at > now() - interval '10 minutes'
      and e.message is not distinct from new.message
      and coalesce(split_part(e.stack, E'\n', 1), '') = coalesce(split_part(new.stack, E'\n', 1), '')
  ) then
    return null; -- la ligne n'est pas insérée, sans erreur
  end if;

  -- 2. compartiments : anonymes (profile_id NULL) et connectés.
  if v_profile is null then
    v_max_minute := 20;  v_max_day := 500;
    select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
      into v_minute, v_day
      from public.client_errors
      where profile_id is null and created_at > now() - interval '1 day';
  else
    v_max_minute := 120; v_max_day := 5000;
    select count(*) filter (where created_at > now() - interval '1 minute'), count(*)
      into v_minute, v_day
      from public.client_errors
      where profile_id is not null and created_at > now() - interval '1 day';
  end if;

  if v_minute >= v_max_minute or v_day >= v_max_day then
    raise exception 'client_errors : limite d''écriture atteinte' using errcode = 'P0001';
  end if;

  -- 3. plafond de taille (index compris) : 100 Mo.
  if pg_total_relation_size('public.client_errors') > 100 * 1024 * 1024 then
    raise exception 'client_errors : taille maximale atteinte' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.client_errors_guard() from public;
revoke all on function public.client_errors_guard() from anon;
revoke all on function public.client_errors_guard() from authenticated;

-- Le déclencheur de SQL-28 reste en place ; recréé ici pour que ce fichier se suffise à lui-même.
drop trigger if exists trg_client_errors_guard on public.client_errors;
create trigger trg_client_errors_guard
before insert on public.client_errors
for each row execute function public.client_errors_guard();
