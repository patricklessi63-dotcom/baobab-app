-- ============================================================================
-- CORRECTIF — policies INSERT de "posts" et "post_media" (fil général)
-- n'appliquaient AUCUN des 4 gardes d'état de compte déjà posés sur
-- likes/follows/favorites/messages/event_invitations par
-- supabase-target-account-state-guards-CONSOLIDATED-fix.sql (banni/suspendu,
-- onboarding incomplet, suppression en attente — le blocage entre profils ne
-- s'applique pas ici, "posts" n'a pas de notion de destinataire).
--
-- TROUVÉ (audit de régression, 2026-09-09, angle "post_media aligné sur le
-- pattern des guards d'état de compte") :
--
-- 1. supabase-feed-posts.sql — policy "Publier en son propre nom" sur
--    "posts" (for insert) ne vérifie QUE "author_id = current_profile_id()".
--    Un compte banni, suspendu, n'ayant jamais terminé l'onboarding, ou en
--    attente de suppression peut donc toujours créer une nouvelle
--    publication texte par appel direct à l'API PostgREST — le blocage
--    "own.banned_at → setView('banned')" dans App.jsx (ligne ~810) est
--    réel pour l'app elle-même, mais n'a jamais été qu'un garde côté client,
--    comme déjà noté pour likes/follows/favorites avant leur correctif.
--
-- 2. supabase-post-media.sql — policy "Ajouter un media a sa propre
--    publication" sur "post_media" (for insert) ne vérifie que l'appartenance
--    de la publication parente ("p.author_id = current_profile_id()"), sans
--    aucun garde d'état de compte. Donc même une fois (1) corrigé, un compte
--    banni/suspendu/onboarding incomplet/suppression en attente qui possède
--    déjà une publication ANTÉRIEURE à son changement d'état (créée quand il
--    était en règle) peut continuer à lui attacher indéfiniment de nouvelles
--    photos/vidéos par appel direct à l'API — réponse à la question posée :
--    OUI, un compte banni peut toujours publier via post_media tant que (1)
--    et (2) ne sont pas corrigés ensemble.
--
-- IMPACT : les deux trous se cumulent. (1) seul seul ne suffit pas : un
-- compte déjà banni après coup garde ses publications existantes et peut
-- toujours y ajouter des médias via (2). (2) seul ne suffit pas non plus :
-- un compte banni peut créer une publication texte fraîche via (1) puis lui
-- attacher des médias tant que (2) n'est pas corrigé. D'où un correctif
-- unique couvrant les deux tables.
--
-- Hors périmètre volontairement : "post_likes" et "post_comments" (même
-- fichier supabase-feed-posts.sql) ont exactement la même lacune, mais ne
-- font pas partie de l'angle d'audit choisi ici (guards d'état de compte sur
-- post_media) — à traiter dans un correctif séparé si l'équipe le souhaite.
--
-- Idempotent (drop + create). Sans risque de régression pour un compte en
-- règle : les 4 "not exists" ne portent que sur les états banni/suspendu/
-- onboarding incomplet/suppression en attente, jamais sur le contenu.
-- À exécuter dans Supabase : SQL Editor, après supabase-post-media.sql (et
-- donc après supabase-feed-posts.sql). Jamais exécuté contre la base de
-- production par cette session (règle de sécurité de cet audit).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "posts" — garde porté sur l'auteur lui-même (pas de notion de
-- destinataire distinct ici, contrairement à likes/follows/favorites).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'posts' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.posts', pol.policyname);
  end loop;

  create policy "Publier en son propre nom"
  on posts for insert
  to authenticated
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
-- 2. "post_media" — garde porté sur l'auteur de la publication parente
-- (post_media n'a pas sa propre colonne author_id).
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'post_media' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.post_media', pol.policyname);
  end loop;

  create policy "Ajouter un media a sa propre publication"
  on post_media for insert
  to authenticated
  with check (
    exists (select 1 from posts p where p.id = post_media.post_id and p.author_id = current_profile_id())
    and not exists (
      select 1 from posts p
      join profiles pr on pr.id = p.author_id
      where p.id = post_media.post_id
        and (pr.banned_at is not null or (pr.suspended_until is not null and pr.suspended_until > now()))
    )
    and not exists (
      select 1 from posts p
      join profiles pr on pr.id = p.author_id
      where p.id = post_media.post_id
        and pr.onboarding_completed_at is null
    )
    and not exists (
      select 1 from posts p
      join profiles pr on pr.id = p.author_id
      where p.id = post_media.post_id
        and pr.deletion_requested_at is not null
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — les deux policies
-- doivent chacune contenir "banned_at", "onboarding_completed_at" ET
-- "deletion_requested_at" dans leur "with check" :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('posts','post_media') and cmd = 'a';
-- ============================================================================
