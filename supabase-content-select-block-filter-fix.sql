-- ============================================================================
-- CORRECTIF — policies SELECT du contenu généré par les utilisateurs
-- (publications, commentaires, likes) toujours en "using (true)" (ou
-- équivalent sans garde de blocage) : un utilisateur bloqué (ou ayant bloqué)
-- l'auteur du contenu peut TOUJOURS le LIRE via un appel direct à l'API
-- PostgREST, alors que l'app React filtre déjà les profils bloqués côté
-- client (SocialShell.jsx/App.jsx). Ce filtrage client n'a jamais été une
-- garantie RLS pour la LECTURE de "posts"/"post_comments"/"post_likes" — déjà
-- documenté et volontairement laissé de côté (angle SELECT) par
-- supabase-post-likes-comments-block-fix.sql (qui n'avait durci que l'INSERT
-- de ces mêmes tables), avec la même remarque pour "community_posts"/
-- "community_comments"/"community_post_likes". Décision produit de Patrick
-- (2026-09-10) : durcir ce point, mais de façon COHÉRENTE sur tout le
-- contenu généré équivalent, pas seulement "posts" seul (qui créerait une
-- incohérence pire que l'état actuel).
--
-- PATTERN RÉUTILISÉ (exactement celui déjà en place sur "stories" —
-- supabase-stories.sql — et sur les policies INSERT déjà corrigées :
-- supabase-block-bypass-fix.sql / supabase-post-likes-comments-block-fix.sql
-- / supabase-content-account-state-block-guards-remaining-fix.sql) :
--   not exists (
--     select 1 from blocks b
--     where (b.from_id = current_profile_id() and b.to_id = <auteur>)
--        or (b.from_id = <auteur> and b.to_id = current_profile_id())
--   )
-- "blocks" a from_id/to_id (uuid -> profiles.id, unique(from_id, to_id)) et
-- "current_profile_id()" (supabase-communities.sql) renvoie l'id profil de
-- auth.uid(), ou NULL si non authentifié — dans ce cas from_id = NULL n'égale
-- jamais rien, donc le NOT EXISTS reste vrai et le comportement actuel (déjà
-- potentiellement ouvert au rôle anon sur certaines de ces tables — pas
-- traité ici, hors périmètre) n'est PAS modifié par ce correctif : additif,
-- zéro régression pour deux profils non bloqués, zéro impact sur ce que
-- l'app React affiche déjà (elle masque ces mêmes profils côté client).
--
-- RÉSOLUTION DE L'AUTEUR SELON LA TABLE :
--   - "posts" : auteur = author_id (colonne directe).
--   - "post_media"/"post_likes"/"post_comments" : pas de notion d'auteur
--     propre pertinente pour la lecture — comme déjà admis pour l'INSERT de
--     "post_media" (garde portée sur l'auteur de la publication PARENTE,
--     jamais sur l'acteur), l'auteur protégé est celui de la publication
--     parente (posts.author_id via post_id). Un blocage avec l'auteur de la
--     publication masque donc la publication ET tous ses médias/likes/
--     commentaires d'un bloc, quel que soit qui a liké/commenté — cohérent
--     avec "on ne voit plus rien de ce qui appartient à un profil bloqué".
--   - "community_posts" : auteur = author_id (colonne directe), condition de
--     blocage AJOUTÉE à la condition de visibilité existante (publique ou
--     membre), inchangée sinon.
--   - "community_post_likes"/"community_comments" : même principe que
--     post_likes/post_comments, auteur résolu via le community_post parent
--     (community_posts.author_id via post_id) — exactement le pattern déjà
--     utilisé pour l'INSERT de ces 2 tables dans
--     supabase-content-account-state-block-guards-remaining-fix.sql.
--   - "event_comments" : la policy SELECT existante ne porte pas sur un
--     "auteur de publication" mais sur la visibilité de l'événement
--     (can_view_event()) ; par cohérence avec le choix déjà fait pour
--     l'INSERT de cette même table (même fichier que ci-dessus), l'auteur
--     protégé est l'ORGANISATEUR de l'événement (events.created_by via
--     event_id), pas l'auteur du commentaire lui-même.
--
-- TABLES AUDITÉES ET VOLONTAIREMENT NON TOUCHÉES ICI (avec la raison) :
--   - "story_reactions"/"story_views" : leur policy SELECT n'est PAS en
--     "using (true)" — elle limite déjà la lecture à (a) sa propre ligne, ou
--     (b) l'auteur du statut lisant les vues/réactions sur SON PROPRE statut
--     (supabase-stories-2.sql). Un profil bloqué ne peut de toute façon plus
--     voir ni réagir à un statut dont l'auteur a un blocage avec lui (policy
--     SELECT de "stories" already gated on blocks — supabase-stories.sql),
--     et la branche (b) ne fait que permettre à l'auteur de lire les
--     interactions sur SON PROPRE contenu, ce qui n'est pas le scénario visé
--     ("un bloqué lit le contenu de son bloqueur"). Ajouter un garde ici
--     serait redondant, pas un vrai trou — déjà tranché dans le commentaire
--     d'origine de supabase-content-account-state-block-guards-remaining-fix.sql.
--   - Bucket de stockage "post-media" (storage.objects, policy "Lecture
--     publique post-media" dans supabase-post-media.sql) : c'est un objet de
--     stockage fichier, pas une ligne de contenu attribuable en base — son
--     chemin ne porte pas l'author_id de façon exploitable en RLS sans
--     réécrire toute la convention de nommage des fichiers, et un bucket
--     Supabase Storage marqué public expose de toute façon l'URL publique
--     indépendamment de la policy RLS de la table storage.objects (getPublicUrl
--     contourne RLS). Modifier cette policy n'atteindrait pas l'objectif et
--     risquerait de casser l'affichage des médias sans réel gain de
--     confidentialité — hors périmètre, à traiter séparément si besoin (ex.
--     bucket privé + URLs signées).
--   - "communities"/"community_members" : pas du contenu généré attribuable à
--     un auteur au sens de ce correctif (une communauté n'a pas un "auteur"
--     dont on protège le contenu ; la liste des membres est une question de
--     confidentialité d'appartenance à un groupe, un choix produit distinct
--     et plus large que le blocage profil-à-profil, non demandé ici). Pas
--     dans la liste de tables fournie par Patrick.
--   - "events"/"event_media" : la policy SELECT ("can_view_event()") est
--     partagée par plusieurs tables (events, event_media, event_attendees,
--     event_comments...) ; la retoucher directement aurait un rayon d'effet
--     bien plus large que ce correctif ciblé. Seule "event_comments" (qui a
--     sa propre policy SELECT indépendante) est dans la liste fournie par
--     Patrick — traitée ci-dessous SANS toucher à can_view_event() elle-même.
--   - "reports"/"community_reports"/"event_reports" : un signalement ne
--     devrait probablement PAS être masqué par un blocage (choix produit à
--     trancher séparément, pas un bug RLS) — déjà exclu avec le même
--     raisonnement dans supabase-content-account-state-block-guards-remaining-fix.sql.
--
-- INDEX "blocks" : déjà couverts, vérifié dans les fichiers existants — pas
-- de nouvel index nécessaire. "unique (from_id, to_id)" (supabase-matching.sql)
-- fournit déjà un index dont from_id est la colonne de tête (utile pour nos
-- deux branches du OR, toutes deux des égalités sur from_id) ; "to_id" a son
-- propre index depuis supabase-index-blocks-passes.sql
-- ("idx_blocks_to_id"). Ajouter un index mono-colonne redondant sur from_id
-- n'apporterait aucun gain de lecture ici et coûterait de l'écriture inutile.
--
-- Idempotent (drop policy if exists + create policy). Additif : aucune
-- régression pour deux profils non bloqués, aucun changement pour le rôle
-- anon là où il avait déjà accès (non traité, hors périmètre de ce
-- correctif). Fichier INDÉPENDANT de supabase-COMBINED-pending-fixes.sql
-- (déjà exécuté par Patrick) — à exécuter séparément, après lui. Jamais
-- exécuté contre la production par cette session (règle de sécurité de
-- l'audit).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "posts" — auteur direct (author_id).
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des publications par tout utilisateur authentifie" on posts;
create policy "Lecture des publications par tout utilisateur authentifie"
on posts for select
to authenticated
using (
  not exists (
    select 1 from blocks b
    where (b.from_id = current_profile_id() and b.to_id = posts.author_id)
       or (b.from_id = posts.author_id and b.to_id = current_profile_id())
  )
);

-- ----------------------------------------------------------------------------
-- 2. "post_media" — auteur résolu via la publication parente.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des medias par tout utilisateur authentifie" on post_media;
create policy "Lecture des medias par tout utilisateur authentifie"
on post_media for select
to authenticated
using (
  not exists (
    select 1 from posts p
    where p.id = post_media.post_id
      and exists (
        select 1 from blocks b
        where (b.from_id = current_profile_id() and b.to_id = p.author_id)
           or (b.from_id = p.author_id and b.to_id = current_profile_id())
      )
  )
);

-- ----------------------------------------------------------------------------
-- 3. "post_likes" — auteur résolu via la publication parente (même logique
-- que la garde déjà posée sur son INSERT dans
-- supabase-post-likes-comments-block-fix.sql).
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des likes par tout utilisateur authentifie" on post_likes;
create policy "Lecture des likes par tout utilisateur authentifie"
on post_likes for select
to authenticated
using (
  not exists (
    select 1 from posts p
    where p.id = post_likes.post_id
      and exists (
        select 1 from blocks b
        where (b.from_id = current_profile_id() and b.to_id = p.author_id)
           or (b.from_id = p.author_id and b.to_id = current_profile_id())
      )
  )
);

-- ----------------------------------------------------------------------------
-- 4. "post_comments" — idem.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des commentaires par tout utilisateur authentifie" on post_comments;
create policy "Lecture des commentaires par tout utilisateur authentifie"
on post_comments for select
to authenticated
using (
  not exists (
    select 1 from posts p
    where p.id = post_comments.post_id
      and exists (
        select 1 from blocks b
        where (b.from_id = current_profile_id() and b.to_id = p.author_id)
           or (b.from_id = p.author_id and b.to_id = current_profile_id())
      )
  )
);

-- ----------------------------------------------------------------------------
-- 5. "community_posts" — auteur direct (author_id). Condition de visibilité
-- existante (publique ou membre) conservée à l'identique, garde de blocage
-- ajoutée en plus.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des posts selon visibilite" on community_posts;
create policy "Lecture des posts selon visibilite"
on community_posts for select
using (
  exists (
    select 1 from communities c where c.id = community_posts.community_id
      and (c.visibility = 'public' or is_community_member(c.id))
  )
  and not exists (
    select 1 from blocks b
    where (b.from_id = current_profile_id() and b.to_id = community_posts.author_id)
       or (b.from_id = community_posts.author_id and b.to_id = current_profile_id())
  )
);

-- ----------------------------------------------------------------------------
-- 6. "community_post_likes" — auteur résolu via le post de communauté
-- parent. Condition de visibilité existante conservée à l'identique.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des likes selon visibilite du post" on community_post_likes;
create policy "Lecture des likes selon visibilite du post"
on community_post_likes for select
using (
  exists (
    select 1 from community_posts p join communities c on c.id = p.community_id
    where p.id = community_post_likes.post_id
      and (c.visibility = 'public' or is_community_member(c.id))
      and not exists (
        select 1 from blocks b
        where (b.from_id = current_profile_id() and b.to_id = p.author_id)
           or (b.from_id = p.author_id and b.to_id = current_profile_id())
      )
  )
);

-- ----------------------------------------------------------------------------
-- 7. "community_comments" — idem.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des commentaires selon visibilite du post" on community_comments;
create policy "Lecture des commentaires selon visibilite du post"
on community_comments for select
using (
  exists (
    select 1 from community_posts p join communities c on c.id = p.community_id
    where p.id = community_comments.post_id
      and (c.visibility = 'public' or is_community_member(c.id))
      and not exists (
        select 1 from blocks b
        where (b.from_id = current_profile_id() and b.to_id = p.author_id)
           or (b.from_id = p.author_id and b.to_id = current_profile_id())
      )
  )
);

-- ----------------------------------------------------------------------------
-- 8. "event_comments" — auteur protégé = organisateur de l'événement
-- (events.created_by), cohérent avec la garde déjà posée sur son INSERT.
-- Condition de visibilité existante (can_view_event) conservée à l'identique.
-- ----------------------------------------------------------------------------
drop policy if exists "Lecture des commentaires selon visibilite" on event_comments;
create policy "Lecture des commentaires selon visibilite"
on event_comments for select
using (
  can_view_event(event_id)
  and not exists (
    select 1 from events e
    where e.id = event_comments.event_id
      and e.created_by is not null
      and exists (
        select 1 from blocks b
        where (b.from_id = current_profile_id() and b.to_id = e.created_by)
           or (b.from_id = e.created_by and b.to_id = current_profile_id())
      )
  )
);

-- ============================================================================
-- Vérification (facultatif, à exécuter séparément après, avec un compte de
-- test) :
--
-- 1. Les 8 policies SELECT doivent chacune contenir "blocks" dans leur USING :
-- select tablename, policyname, pg_get_expr(polqual, polrelid) as using_expr
--   from pg_policy join pg_class on pg_class.oid = pg_policy.polrelid
--   where pg_class.relname in ('posts','post_media','post_likes','post_comments',
--     'community_posts','community_post_likes','community_comments','event_comments')
--   and cmd = 'r'
--   order by 1;
--
-- 2. Scénario de blocage (remplacer <A> par l'id profil bloqué, <B> par
-- l'id profil bloqueur, exécuter en tant que <A> via le client authentifié) :
-- select * from posts where author_id = '<B>';                 -- doit renvoyer 0 ligne
-- select * from post_media pm join posts p on p.id = pm.post_id
--   where p.author_id = '<B>';                                  -- doit renvoyer 0 ligne
-- select * from post_likes pl join posts p on p.id = pl.post_id
--   where p.author_id = '<B>';                                  -- doit renvoyer 0 ligne
-- select * from post_comments pc join posts p on p.id = pc.post_id
--   where p.author_id = '<B>';                                  -- doit renvoyer 0 ligne
-- select * from community_posts where author_id = '<B>';        -- doit renvoyer 0 ligne
-- select * from event_comments ec join events e on e.id = ec.event_id
--   where e.created_by = '<B>';                                 -- doit renvoyer 0 ligne
--
-- 3. Non-régression (deux profils <C>/<D> SANS blocage entre eux) : les
-- mêmes requêtes doivent continuer à renvoyer les lignes attendues.
-- ============================================================================
