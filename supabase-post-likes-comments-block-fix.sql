-- ============================================================================
-- CORRECTIF — un utilisateur bloqué (ou ayant bloqué) l'auteur d'une
-- publication peut toujours LIKER ou COMMENTER cette publication via un
-- appel direct à l'API PostgREST, malgré le blocage entre les deux profils.
--
-- CONTEXTE (audit de régression, 2026-09-09, angle "système de blocage
-- appliqué au fil de publications") : supabase-posts-account-state-guard-fix.sql
-- (commits 4debb4d/12565e6) a ajouté aux policies INSERT de "posts",
-- "post_media", "post_likes" et "post_comments" les 3 gardes d'état de
-- compte (banni/suspendu, onboarding incomplet, suppression en attente),
-- avec ce raisonnement pour justifier l'absence de garde de BLOCAGE sur les
-- 4 tables : « le blocage entre profils ne s'applique pas ici, ces 4 tables
-- n'ont pas de notion de destinataire distinct : l'acteur agit sur du
-- CONTENU, pas sur un autre profil ».
--
-- Ce raisonnement est correct pour "posts" et "post_media" (créer sa propre
-- publication ou y attacher un média ne cible personne). Il est FAUX pour
-- "post_likes" et "post_comments" : liker ou commenter une publication cible
-- bel et bien un destinataire distinct et identifiable — l'auteur de la
-- publication (post_likes.post_id / post_comments.post_id -> posts.author_id)
-- — exactement le même schéma que "event_invitations.invited_profile_id"
-- (invited_by -> invited_profile_id via la table events), déjà protégé
-- contre le blocage par supabase-block-bypass-fix.sql. Cette table sœur avait
-- été oubliée car "posts"/post_media/post_likes/post_comments n'existaient
-- pas encore quand supabase-block-bypass-fix.sql a été écrit, et l'audit
-- suivant (posts-account-state-guard-fix) a traité les 4 tables comme un bloc
-- homogène sans distinguer ce cas.
--
-- IMPACT CONCRET : si Alice bloque Bob (table "blocks", peu importe le sens
-- from_id/to_id puisque le contrôle ci-dessous porte sur les deux sens),
-- Bob peut TOUJOURS, par appel direct à l'API Supabase (fetch/PostgREST,
-- indépendamment de ce que l'UI React masque côté client dans SocialShell/
-- App.jsx) :
--   - liker une publication d'Alice (table "post_likes"),
--   - commenter une publication d'Alice (table "post_comments"),
-- ce qui déclenche en plus une notification "post_liked"/"post_commented"
-- vers Alice (trigger notify_post_like / notify_post_comment déjà en place
-- dans supabase-feed-posts.sql) — donc un contact indirect forcé malgré le
-- blocage, exactement le type d'impact déjà documenté pour "follows" dans
-- supabase-block-bypass-fix.sql.
--
-- NOTE (angle SELECT, audité et volontairement non modifié ici) : les
-- policies SELECT de "posts"/"post_likes"/"post_comments" restent en
-- "using (true) to authenticated" — un utilisateur bloqué peut donc toujours
-- LIRE les publications/commentaires/likes de la personne qui l'a bloqué (et
-- réciproquement) via un appel API direct. Ce n'est PAS une régression
-- propre au fil de publications : c'est exactement le même choix déjà fait
-- et documenté pour "community_posts"/"community_comments"/"community_post_
-- likes" (supabase-communities.sql) et pour la lecture de "profiles" en
-- général — le filtrage des profils bloqués dans les listes/fils publics est
-- assumé comme un filtrage d'affichage côté client partout ailleurs dans ce
-- dépôt, pas comme une garantie RLS. Durcir uniquement "posts" sans toucher
-- au même motif ailleurs créerait une incohérence plutôt qu'un vrai
-- correctif ; laissé tel quel, à traiter dans un futur audit dédié et
-- global si ce choix de produit doit changer.
--
-- CORRECTIF : réplique le garde-fou "not exists (select 1 from blocks ...)"
-- déjà utilisé pour messages/likes/follows/favorites/event_invitations, en
-- l'adaptant à l'indirection post_id -> posts.author_id, tout en conservant
-- intégralement les 3 gardes d'état de compte déjà posés par
-- supabase-posts-account-state-guard-fix.sql (repris ici tels quels, pas de
-- régression si ce fichier n'a pas encore été exécuté). Idempotent
-- (drop + create). Nouveau fichier : ni supabase-posts-account-state-guard-
-- fix.sql ni supabase-COMBINED-pending-fixes.sql (fichiers des 2 derniers
-- commits) ne sont édités directement, par précaution (statut d'exécution en
-- production non confirmé). À exécuter dans Supabase : SQL Editor, après
-- supabase-posts-account-state-guard-fix.sql (ou seul si celui-ci n'a pas
-- encore été exécuté — le résultat final est le même dans les deux cas
-- grâce au drop + create). Jamais exécuté contre la production par cette
-- session.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "post_likes" — ajoute le garde de blocage (les deux sens) entre l'auteur
-- du like et l'auteur de la publication likée, en plus des 3 gardes d'état
-- de compte déjà en place.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'post_likes' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.post_likes', pol.policyname);
  end loop;

  create policy "Liker en son propre nom"
  on post_likes for insert to authenticated
  with check (
    profile_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = post_likes.profile_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = post_likes.profile_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = post_likes.profile_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from posts p
      where p.id = post_likes.post_id
        and exists (
          select 1 from blocks b
          where (b.from_id = post_likes.profile_id and b.to_id = p.author_id)
             or (b.from_id = p.author_id and b.to_id = post_likes.profile_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- 2. "post_comments" — même garde, entre l'auteur du commentaire et l'auteur
-- de la publication commentée.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'post_comments' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.post_comments', pol.policyname);
  end loop;

  create policy "Commenter en son propre nom"
  on post_comments for insert to authenticated
  with check (
    author_id = current_profile_id()
    and not exists (
      select 1 from profiles p
      where p.id = post_comments.author_id
        and (p.banned_at is not null or (p.suspended_until is not null and p.suspended_until > now()))
    )
    and not exists (
      select 1 from profiles p
      where p.id = post_comments.author_id
        and p.onboarding_completed_at is null
    )
    and not exists (
      select 1 from profiles p
      where p.id = post_comments.author_id
        and p.deletion_requested_at is not null
    )
    and not exists (
      select 1 from posts p
      where p.id = post_comments.post_id
        and exists (
          select 1 from blocks b
          where (b.from_id = post_comments.author_id and b.to_id = p.author_id)
             or (b.from_id = p.author_id and b.to_id = post_comments.author_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — les deux policies
-- doivent chacune contenir "blocks" dans leur "with check" :
-- select tablename, policyname, pg_get_expr(polwithcheck, polrelid) as with_check
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('post_likes','post_comments') and cmd = 'a';
-- ============================================================================
