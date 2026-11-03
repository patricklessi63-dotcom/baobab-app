-- ============================================================================
-- Export de la STRUCTURE (aucune donnée) du schéma « public » de la production,
-- pour reconstruire le projet de répétition (LANCEMENT.md §9.7).
--
-- LECTURE SEULE : ne contient que des SELECT sur les catalogues Postgres
-- (pg_class, pg_attribute, pg_constraint, pg_type…). Aucune ligne de table
-- applicative n'est lue, rien n'est modifié.
--
-- À EXÉCUTER PAR LE PROPRIÉTAIRE dans le SQL Editor de la production, puis :
--   1. cliquer la cellule du résultat (colonne « ddl ») -> « Copy » ;
--   2. coller le contenu dans un fichier `schema-prod.sql` à la racine du dépôt
--      (ignoré par git : ne pas le committer).
-- Il crée : types enum, tables (colonnes, défauts), contraintes (PK, FK, unique,
-- check), index. Les fonctions, déclencheurs, politiques RLS et publications
-- viennent ensuite des fichiers supabase-*.sql déjà versionnés.
-- ============================================================================

with enums as (
  select 10 as ord, format('do $$ begin create type public.%I as enum (%s); exception when duplicate_object then null; end $$;',
           t.typname, string_agg(quote_literal(e.enumlabel), ',' order by e.enumsortorder)) as s
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  where t.typnamespace = 'public'::regnamespace
  group by t.typname
),
tabs as (
  select 20 as ord, format('create table if not exists public.%I (%s);', c.relname,
           string_agg(format('%I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
             case when a.attnotnull then ' not null' else '' end,
             case when d.adbin is not null and a.attgenerated = '' then ' default ' || pg_get_expr(d.adbin, d.adrelid) else '' end),
             ', ' order by a.attnum)) as s
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  group by c.relname
),
-- PK / unique d'abord (les FK en dépendent), puis check, puis FK.
cons as (
  select case con.contype when 'p' then 30 when 'u' then 31 when 'c' then 32 else 33 end as ord,
         format('do $$ begin alter table %s add constraint %I %s; exception when others then null; end $$;',
                con.conrelid::regclass, con.conname, pg_get_constraintdef(con.oid)) as s
  from pg_constraint con
  where con.connamespace = 'public'::regnamespace and con.contype in ('p', 'u', 'c', 'f')
),
idx as (
  select 40 as ord, indexdef || ';' as s
  from pg_indexes
  where schemaname = 'public'
    and indexname not in (select conname from pg_constraint where connamespace = 'public'::regnamespace)
)
select string_agg(s, E'\n' order by ord) as ddl, count(*) as nb_instructions
from (select * from enums union all select * from tabs union all select * from cons union all select * from idx) x;
