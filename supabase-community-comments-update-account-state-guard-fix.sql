-- ============================================================================
-- CORRECTIF — la policy UPDATE de "community_comments" (édition d'un
-- commentaire de communauté, ajoutée par supabase-communities-3.sql) n'
-- applique aucun des 3 gardes d'état de compte déjà posés sur l'INSERT de la
-- même table par supabase-content-account-state-block-guards-remaining-fix.sql
-- (banni/suspendu, onboarding incomplet, suppression en attente) — même trou
-- que celui trouvé et corrigé sur "posts" par
-- supabase-posts-update-account-state-guard-fix.sql (2026-09-30).
--
-- TROUVÉ (audit du flux d'édition de commentaire, 2026-09-30, suite à l'audit
-- de l'édition de publication qui a produit les 2 correctifs client du même
-- jour) : la policy "L'auteur modifie son propre commentaire"
-- (supabase-communities-3.sql) ne vérifie que "author_id =
-- current_profile_id()" pour l'UPDATE, sans jamais consulter l'état du
-- compte. Résultat : un compte banni/suspendu, n'ayant jamais terminé
-- l'onboarding, ou en attente de suppression peut toujours modifier le TEXTE
-- d'un commentaire de communauté déjà existant par appel direct à l'API
-- PostgREST — alors que l'INSERT (créer un nouveau commentaire) est déjà
-- bloqué pour ces mêmes états. Un compte banni ne peut plus COMMENTER, mais
-- peut toujours RÉÉCRIRE le contenu de ce qu'il a commenté avant son
-- bannissement — la modération perd son effet sur ce chemin précis.
--
-- HORS PÉRIMÈTRE (volontairement, même logique que le correctif "posts") :
-- le garde de blocage entre l'auteur du commentaire et l'auteur du post
-- commenté, présent sur l'INSERT, n'est PAS repris ici. Éditer un commentaire
-- qu'on a déjà eu le droit de publier ne crée pas de nouvelle interaction
-- avec l'auteur du post ciblé (contrairement à l'INSERT initial) ; seul
-- l'état du compte de l'acteur peut changer APRÈS coup et doit donc être
-- reverifié à chaque UPDATE, exactement comme pour "posts".
--
-- CORRECTIF : redéfinit uniquement la policy UPDATE de "community_comments"
-- (ne touche pas SELECT/INSERT/DELETE, déjà corrects) en y ajoutant les 3
-- mêmes gardes "not exists" que l'INSERT, dans le "using" ET le "with check"
-- (l'un pour pouvoir cibler la ligne, l'autre pour accepter la nouvelle
-- valeur — les deux doivent refuser un compte qui a basculé dans un de ces
-- états, y compris APRÈS la création du commentaire). Idempotent (drop +
-- create), sans risque de régression pour un compte en règle. À exécuter
-- dans le SQL Editor de Supabase, après supabase-communities-3.sql et
-- supabase-content-account-state-block-guards-remaining-fix.sql. Jamais
-- exécuté contre la base de production par cette session.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'community_comments' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.community_comments', pol.policyname);
  end loop;

  create policy "L'auteur modifie son propre commentaire"
  on community_comments for update
  using (
    author_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and p.deletion_requested_at is not null
    )
  )
  with check (
    author_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = community_comments.author_id
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, pg_get_expr(polqual, polrelid) as using_expr,
--        pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname = 'community_comments' and cmd = 'w';
-- ============================================================================
