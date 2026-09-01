-- ============================================================================
-- Phase — Baobab Communautés — correctif réactions multi-emoji.
-- À exécuter dans Supabase : SQL Editor (une fois), APRÈS supabase-communities.sql,
-- supabase-communities-2.sql et supabase-communities-3.sql.
-- ============================================================================
-- Bug corrigé : CommunitiesTab.jsx (handleReact) changeait la réaction d'un
-- membre sur une publication de communauté via un DELETE puis un INSERT
-- séparés (supabase-communities-3.sql avait choisi ce motif en notant
-- "aucune policy UPDATE requise"). Problème : ce sont deux requêtes réseau
-- distinctes, pas une transaction. Si le DELETE réussit et que l'INSERT
-- échoue ensuite (coupure réseau, l'utilisateur ferme l'onglet, etc.), le
-- code applicatif restaure l'ancienne réaction seulement dans l'état React
-- local (catch), alors qu'en base la ligne a bel et bien été supprimée : la
-- réaction affichée à l'écran n'existe plus côté serveur et disparaît sans
-- action de l'utilisateur au prochain chargement de la communauté.
--
-- Correctif : une seule requête UPDATE de la ligne existante (post_id +
-- profile_id est unique, voir supabase-communities.sql) quand on change
-- d'émoji sur une réaction déjà posée — DELETE seul pour retirer sa
-- réaction, INSERT seul pour une toute première réaction, comme avant.
-- Nécessite la policy UPDATE ci-dessous, absente jusqu'ici.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='community_post_likes' and cmd='UPDATE' loop
    execute format('drop policy %I on public.community_post_likes', pol.policyname);
  end loop;

  -- Changer d'émoji sur sa propre réaction — jamais celle d'un tiers.
  create policy "Modifier sa propre reaction"
  on community_post_likes for update
  using (profile_id = current_profile_id())
  with check (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd from pg_policies where tablename='community_post_likes';
