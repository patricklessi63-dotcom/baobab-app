-- Contrôle d'intégrité et d'inventaire d'une base Baobab (LECTURE SEULE), utilisé :
--   - par la sauvegarde quotidienne (.github/workflows/backup-supabase.yml) : écrit le manifeste
--     « table,nombre_de_lignes » joint à chaque sauvegarde ;
--   - après une restauration (SAUVEGARDE.md §5) : on le rejoue sur la base restaurée et on compare
--     avec le manifeste de la sauvegarde.
-- Sortie (psql -At -F ','), une ligne par élément :
--   count,<table>,<lignes>        nombre de lignes de chaque table de public
--   fk_non_valide,<table>.<contrainte>,1   contrainte étrangère non validée (devrait être absent)
--   rls_desactivee,<table>,1      table de public SANS sécurité par ligne (devrait être absent)
-- Aucune donnée personnelle n'est lue : uniquement des comptages et des noms de tables.

select 'count',
       c.relname,
       (xpath('/row/n/text()',
              query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select 'fk_non_valide', conrelid::regclass::text || '.' || conname, '1'
from pg_constraint
where contype = 'f' and not convalidated and connamespace = 'public'::regnamespace
order by 2;

select 'rls_desactivee', c.relname, '1'
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 2;
