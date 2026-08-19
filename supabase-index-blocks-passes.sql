-- ============================================================================
-- Index manquants sur blocks.to_id et passes.to_id. À exécuter dans
-- Supabase : SQL Editor.
-- ============================================================================
-- Trouvé par l'audit pré-lancement (phase "Production Ready") : App.jsx et
-- EventsTab.jsx interrogent likes/passes/blocks avec
-- .or(`from_id.eq.${id},to_id.eq.${id}`) — idx_likes_to_id existe déjà pour
-- "likes" (raison identique), mais le même index n'avait jamais été ajouté
-- pour "passes" et "blocks". IF NOT EXISTS : sans effet si déjà présent,
-- opération purement additive (aucune perte de données, aucun changement de
-- comportement, uniquement les temps de requête à l'échelle).

create index if not exists idx_blocks_to_id on public.blocks (to_id);
create index if not exists idx_passes_to_id on public.passes (to_id);

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename, indexname from pg_indexes where schemaname = 'public' and tablename in ('blocks','passes') order by 1,2;
-- ============================================================================
