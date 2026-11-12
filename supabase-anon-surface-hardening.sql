-- ============================================================================
-- SQL-41 — Réduire la SURFACE du rôle anonyme (visiteur sans compte) au strict nécessaire.
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 12 novembre 2026. Défense en profondeur : aujourd'hui, la RLS refuse déjà tout à un anonyme (sonde du
-- 12 novembre sur la répétition : 74 tables, 0 lisible par un anonyme ; audit de production du 5 novembre : toutes les
-- tables en RLS). Mais le rôle `anon` GARDE les privilèges de table SELECT / INSERT / UPDATE / DELETE sur ~58 tables
-- (privilèges par défaut de Supabase) et l'EXECUTE sur 13 fonctions publiques. Un seul oubli de RLS sur une future table
-- l'exposerait. Ce fichier retire ces privilèges inutiles : un oubli de RLS ne suffit plus à ouvrir une table.
--
-- CE QUE LE VISITEUR ANONYME A RÉELLEMENT BESOIN DE FAIRE (relevé du client, 12 nov. 2026) :
--   - appeler la fonction public_user_count() (compteur de la page d'accueil) ;
--   - INSÉRER dans client_errors (rapport d'erreurs envoyé même avant la connexion ; policy client_errors_insert_anyone
--     et déclencheur de limite de débit, SQL-28/34).
-- Tout le reste passe par l'API d'authentification (schéma auth, hors de ce fichier) ou par un compte connecté.
-- Ce fichier garde donc EXACTEMENT ces deux droits, et rien d'autre, pour anon.
--
-- CE QUE LE FICHIER FAIT (schéma public uniquement ; idempotent ; ne touche ni à auth, ni à storage, ni à cron) :
--   1. Tables, vues, séquences : REVOKE ALL pour anon, puis GRANT INSERT sur client_errors.
--   2. Fonctions : pour chaque fonction du schéma public que anon peut exécuter (sauf public_user_count), retire
--      EXECUTE à PUBLIC et à anon et le REDONNE à authenticated et service_role (rien ne change pour les comptes connectés
--      ni pour les Edge Functions). Les fonctions de déclencheur ne sont pas concernées par ce droit à l'exécution.
--   3. Privilèges PAR DÉFAUT du rôle postgres dans public : les futurs objets ne sont plus ouverts à anon.
--      (Les futurs fichiers SQL qui ont besoin d'un droit anon devront le demander explicitement.)
--
-- AVANT D'EXÉCUTER : copier hors dépôt le résultat de ces deux requêtes (lecture seule), c'est le retour arrière exact :
--   select c.relname, string_agg(distinct a.privilege_type, ',') from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
--   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m') and a.grantee = (select oid from pg_roles where rolname = 'anon')
--   group by 1 order by 1;
--   select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1;
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   -- tables : seule client_errors (INSERT) reste ouverte à anon
--   select c.relname, string_agg(a.privilege_type, ',') from pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
--   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p','v','m') and a.grantee = (select oid from pg_roles where rolname = 'anon') group by 1;
--   -- fonctions : seule public_user_count()
--   select p.oid::regprocedure::text from pg_proc p where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE');
--   -- et les comptes connectés ne perdent rien : has_function_privilege('authenticated', oid, 'EXECUTE') identique à avant.
--
-- RETOUR ARRIÈRE : rejouer les GRANT d'origine à partir de la copie « avant » (au minimum :
--   grant all on all tables in schema public to anon;  -- rétablit le défaut Supabase, RLS inchangée
--   grant execute on function <chaque fonction de la copie> to anon;)
-- ============================================================================

do $$
declare
  r record;
begin
  -- 1. Tables, vues, vues matérialisées, tables partitionnées
  for r in
    select c.oid::regclass::text as rel
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('revoke all on %s from anon', r.rel);
  end loop;
  -- séquences
  for r in
    select c.oid::regclass::text as rel
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
  loop
    execute format('revoke all on sequence %s from anon', r.rel);
  end loop;

  -- 2. Fonctions exécutables par anon (hors public_user_count)
  for r in
    select p.oid::regprocedure::text as fn
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind in ('f', 'p')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.proname <> 'public_user_count'
      -- jamais les fonctions d'une extension installée dans public
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;

-- Les deux droits dont le visiteur a besoin
grant insert on public.client_errors to anon;
do $$
begin
  if to_regprocedure('public.public_user_count()') is not null then
    grant execute on function public.public_user_count() to anon;
  end if;
end $$;

-- 3. Privilèges par défaut des futurs objets créés par le rôle qui exécute ce fichier dans public
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
