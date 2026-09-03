-- ============================================================================
-- Complète le correctif "sessions multiples" apporté à SocialShell.jsx
-- (canaux Realtime "favorites-own:<id>" et "follows-own:<id>") et à App.jsx
-- (canal "blocks-passes-own:<id>") : un favori/abonnement/blocage/passe
-- retiré (DELETE) sur un appareil/onglet ne se répercutait pas sur les
-- autres sessions ouvertes du même compte avant un rechargement complet.
--
-- Même cause que supabase-likes-realtime-replica-identity-fix.sql (voir ce
-- fichier pour l'explication détaillée) : "favorites", "follows" et
-- "blocks" ont une clé primaire à colonne unique ("id uuid"), from_id/to_id
-- n'étant qu'une contrainte UNIQUE — donc par défaut (REPLICA IDENTITY
-- DEFAULT), un DELETE ne transmet dans payload.old QUE "id", jamais
-- from_id/to_id. Sans ce script, les écouteurs DELETE ajoutés côté client
-- restent inertes (payload.old.to_id toujours undefined) : aucune
-- régression, mais le retrait d'un favori/abonnement/blocage fait sur un
-- autre appareil ne se propage pas tant que ce script n'est pas exécuté.
--
-- "passes" est inclus par cohérence (même canal côté client, même famille de
-- table que "likes") même si seul un écouteur INSERT y est ajouté pour
-- l'instant côté App.jsx (aucune action "retirer un passe" n'existe dans
-- l'app) — élargir sa réplique maintenant évite d'avoir à revenir dessus si
-- un DELETE y est ajouté plus tard.
--
-- Ajoute aussi ces 4 tables à la publication "supabase_realtime" si elles n'y
-- sont pas déjà (condition nécessaire, en plus de REPLICA IDENTITY, pour que
-- postgres_changes reçoive quoi que ce soit — voir supabase-realtime-
-- messages.sql où "messages" avait le même trou). Bloc conditionnel car
-- "alter publication ... add table" échoue si la table y est déjà (ce qui
-- est possible pour "favorites"/"follows"/"blocks" : leurs bugs corrigés
-- précédemment, comme la modale "Comptes bloqués", laissent penser qu'elles
-- y sont peut-être déjà — on ne peut pas le savoir sans interroger la base).
--
-- À exécuter dans Supabase : SQL Editor (une fois, indépendant des autres
-- scripts de cette liste).
-- ============================================================================

alter table public.favorites replica identity full;
alter table public.follows replica identity full;
alter table public.blocks replica identity full;
alter table public.passes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'favorites'
  ) then
    alter publication supabase_realtime add table public.favorites;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'follows'
  ) then
    alter publication supabase_realtime add table public.follows;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'blocks'
  ) then
    alter publication supabase_realtime add table public.blocks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'passes'
  ) then
    alter publication supabase_realtime add table public.passes;
  end if;
end $$;
