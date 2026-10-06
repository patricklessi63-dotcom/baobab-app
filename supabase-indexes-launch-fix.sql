-- ============================================================================
-- Index manquants sur les chemins chauds du client (audit performance du
-- 6 octobre 2026). À exécuter dans Supabase : SQL Editor — idempotent, additif
-- (aucune table, colonne ni policy modifiée), peut être rejoué sans effet.
--
-- Méthode : chaque requête fréquente du client (src/) a été rapprochée des
-- index réellement déclarés dans les supabase-*.sql (clés primaires, contraintes
-- unique() et create index). Index déjà couverts, donc NON recréés :
--   messages(match_key, created_at desc)     supabase-scale-security-2.sql
--   notifications(recipient_id) where read_at is null   idem
--   likes(from_id)/(to_id), passes, blocks   unique(from_id,to_id) + idx *_to_id
--   follows(from_id)/(to_id)                 supabase-follows.sql
--   community_members(profile_id)            supabase-scale-security-2.sql
--   event_attendees(profile_id)/(event_id,status)   supabase-events-v2.sql
--   posts(created_at)/(author_id,created_at), post_comments(post_id),
--   post_likes(post_id), post_media(post_id,position), events(event_date...),
--   immigration_news(published_at), hidden_recommendations, ai_usage
--
-- Manquants confirmés (requête client -> index ajouté) :
--   favorites WHERE to_id = moi (démarrage, SocialShell : "qui m'a mis en
--     favori") + filtre Realtime to_id            -> favorites(to_id)
--     (unique(from_id,to_id) ne sert que from_id)
--   stories WHERE expires_at > now() ORDER BY created_at DESC LIMIT 500
--     (démarrage) — la table n'a AUCUN index, et les lignes expirées ne sont
--     jamais supprimées tant que l'edge function cleanup-expired-stories n'est
--     pas déployée                                 -> stories(expires_at), (profile_id, created_at desc)
--   profiles ORDER BY created_at LIMIT 500 (démarrage de CHAQUE session, avec
--     la RLS évaluée par ligne) : sans index = tri complet de la table à chaque
--     connexion                                    -> profiles(created_at)
--   profile_photos ORDER BY profile_id, position LIMIT 3200 (démarrage)
--                                                  -> profile_photos(profile_id, position)
--   community_posts WHERE community_id = ? ORDER BY created_at DESC (ouverture
--     d'une communauté, sans LIMIT côté client)    -> community_posts(community_id, created_at desc)
--   community_comments WHERE post_id IN (...)      -> community_comments(post_id)
--   event_comments WHERE event_id = ? ORDER BY created_at  -> event_comments(event_id, created_at)
--   event_invitations WHERE invited_profile_id = moi AND status = ? (accueil
--     Événements, 2 requêtes) : unique(event_id, invited_profile_id) ne sert
--     que le filtre par événement                  -> event_invitations(invited_profile_id, status)
--   community_invites WHERE invited_profile_id = moi AND status = 'pending'
--                                                  -> community_invites(invited_profile_id, status)
--   community_join_requests WHERE profile_id = moi AND status = 'pending'
--     (l'index unique partiel existant commence par community_id)
--                                                  -> community_join_requests(profile_id) where status = 'pending'
--   communities ORDER BY created_at DESC LIMIT 20 (Fil + liste)
--                                                  -> communities(created_at desc)
--
-- Honnêteté sur l'impact : aux volumes de la bêta (quelques centaines à
-- quelques milliers de lignes) un parcours séquentiel prend de l'ordre de la
-- milliseconde ; ces index n'accélèrent pas visiblement aujourd'hui, ils
-- empêchent que le coût de chaque connexion/ouverture d'écran croisse avec
-- la taille des tables après le lancement.
--
-- NOTE VERROUS : pas de "create index concurrently" — il est refusé dans
-- l'éditeur SQL Supabase (les scripts y tournent dans une transaction). Un
-- "create index" simple pose un verrou qui bloque les ÉCRITURES (pas les
-- lectures) sur la table pendant sa construction : quelques dizaines de
-- millisecondes à quelques secondes à ces volumes. À exécuter de préférence
-- hors pic de trafic. Si une table devenait énorme plus tard, créer l'index
-- avec "concurrently" via psql/la CLI (hors transaction) à la place.
--
-- Robustesse : chaque index est créé dans un bloc qui IGNORE (avec un NOTICE)
-- une table ou une colonne absente de cet environnement (ex. un fichier SQL
-- jamais exécuté), au lieu de faire échouer tout le script. profile_photos n'a
-- pas de fichier de création dans le dépôt (table créée à la main) : ses
-- colonnes profile_id/position sont déduites du code client.
-- ============================================================================

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('idx_favorites_to_id',                  'favorites',               '(to_id)'),
      ('idx_stories_expires_at',               'stories',                 '(expires_at)'),
      ('idx_stories_profile_created',          'stories',                 '(profile_id, created_at desc)'),
      ('idx_profiles_created_at',              'profiles',                '(created_at)'),
      ('idx_profile_photos_profile_position',  'profile_photos',          '(profile_id, position)'),
      ('idx_community_posts_community_created','community_posts',         '(community_id, created_at desc)'),
      ('idx_community_comments_post',          'community_comments',      '(post_id)'),
      ('idx_event_comments_event_created',     'event_comments',          '(event_id, created_at)'),
      ('idx_event_invitations_invited_status', 'event_invitations',       '(invited_profile_id, status)'),
      ('idx_community_invites_invited_status', 'community_invites',       '(invited_profile_id, status)'),
      ('idx_community_join_requests_profile_pending', 'community_join_requests', '(profile_id) where status = ''pending'''),
      ('idx_communities_created_at',           'communities',             '(created_at desc)')
    ) as t(idx_name, tbl, definition)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'Table public.% absente : index % ignoré', r.tbl, r.idx_name;
      continue;
    end if;
    begin
      execute format('create index if not exists %I on public.%I %s', r.idx_name, r.tbl, r.definition);
    exception
      when undefined_column then
        raise notice 'Colonne absente de public.% : index % ignoré', r.tbl, r.idx_name;
    end;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) — doit lister les
-- 12 index (moins ceux dont la table/colonne n'existe pas ici) :
-- select tablename, indexname from pg_indexes
--  where schemaname = 'public' and indexname in (
--    'idx_favorites_to_id','idx_stories_expires_at','idx_stories_profile_created',
--    'idx_profiles_created_at','idx_profile_photos_profile_position',
--    'idx_community_posts_community_created','idx_community_comments_post',
--    'idx_event_comments_event_created','idx_event_invitations_invited_status',
--    'idx_community_invites_invited_status',
--    'idx_community_join_requests_profile_pending','idx_communities_created_at')
--  order by tablename;
--
-- Contrôle de l'effet (facultatif) : avant/après, comparer le plan de la
-- requête de démarrage la plus lourde —
-- explain analyze select id from profiles order by created_at limit 500;
-- doit passer de "Sort / Seq Scan" à "Index Scan using idx_profiles_created_at".
-- ============================================================================
