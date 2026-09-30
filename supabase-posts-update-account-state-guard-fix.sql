-- ============================================================================
-- CORRECTIF — la policy UPDATE de "posts" (édition d'une publication du fil
-- général) n'applique aucun des 3 gardes d'état de compte déjà posés sur
-- l'INSERT de la même table par supabase-posts-account-state-guard-fix.sql
-- (banni/suspendu, onboarding incomplet, suppression en attente).
--
-- TROUVÉ (audit du flux d'édition de publication, 2026-09-30) : la policy
-- "Editer sa propre publication" (supabase-feed-posts.sql) ne vérifie que
-- "author_id = current_profile_id()" pour l'UPDATE, sans jamais consulter
-- l'état du compte. Résultat : un compte banni/suspendu, n'ayant jamais
-- terminé l'onboarding, ou en attente de suppression peut toujours modifier
-- le TEXTE d'une publication déjà existante par appel direct à l'API
-- PostgREST — alors que l'INSERT (créer une nouvelle publication) est déjà
-- bloqué pour ces mêmes états depuis le correctif du 2026-09-09. Un compte
-- banni ne peut plus PUBLIER, mais peut toujours RÉÉCRIRE le contenu de ce
-- qu'il a publié avant son bannissement — la modération perd son effet sur
-- ce chemin précis.
--
-- CORRECTIF : redéfinit uniquement la policy UPDATE de "posts" (ne touche
-- pas SELECT/INSERT/DELETE, déjà corrects) en y ajoutant les 3 mêmes gardes
-- "not exists" que l'INSERT, dans le "using" ET le "with check" (l'un pour
-- pouvoir cibler la ligne, l'autre pour accepter la nouvelle valeur — les
-- deux doivent refuser un compte qui a basculé dans un de ces états, y
-- compris APRÈS la création du post). Idempotent (drop + create), sans
-- risque de régression pour un compte en règle. À exécuter dans le SQL
-- Editor de Supabase, après supabase-posts-account-state-guard-fix.sql.
-- Jamais exécuté contre la base de production par cette session.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'posts' and cmd = 'UPDATE' loop
    execute format('drop policy %I on public.posts', pol.policyname);
  end loop;

  create policy "Editer sa propre publication"
  on posts for update
  to authenticated
  using (
    author_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and p.deletion_requested_at is not null
    )
  )
  with check (
    author_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = posts.author_id
        and p.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, pg_get_expr(polqual, polrelid) as using_expr,
--        pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname = 'posts' and cmd = 'w';
-- ============================================================================
