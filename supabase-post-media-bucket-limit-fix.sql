-- ============================================================================
-- CORRECTIF — bucket Storage "post-media" sans file_size_limit ni
-- allowed_mime_types (trouvé lors de l'audit autonome du 3 septembre 2026,
-- angle "cohérence limite de taille affichée au client vs limite réellement
-- appliquée côté Storage").
--
-- supabase-feed-posts.sql (déjà exécuté en prod) crée le bucket "post-media"
-- ainsi :
--   insert into storage.buckets (id, name, public)
--   values ('post-media', 'post-media', true)
--   on conflict (id) do nothing;
-- — sans file_size_limit (NULL = illimité côté serveur) ni allowed_mime_types
-- (NULL = tout type accepté). C'est le SEUL bucket du projet dans ce cas :
-- "avatars", "chat-media", "community-media", "event-media" et
-- "event-covers" ont tous les deux réglés dès leur création (ou corrigés
-- ensuite, voir supabase-stories-2.sql qui a déjà comblé exactement ce même
-- trou pour "avatars" avec ce commentaire : "vaut NULL (illimite) en
-- production : aucune limite serveur ne protegeait contre un contournement
-- de la validation cote client").
--
-- PostsFeed.jsx (composeur multi-médias du fil général) valide côté client
-- via validateMediaFile(file, "image"|"video") — src/lib/mediaConstants.js :
-- image ≤ 8 Mo (jpeg/png/webp/gif), vidéo ≤ 50 Mo (mp4/webm/quicktime).
-- L'utilisateur voit donc "Fichier trop volumineux (max 8 Mo / 50 Mo)" —
-- mais rien ne l'empêchait, en contournant ce contrôle client (DevTools,
-- appel direct à l'API Storage avec le JWT du navigateur), d'envoyer un
-- fichier de n'importe quelle taille et de n'importe quel type (exécutable,
-- script, etc.) vers ce bucket rendu PUBLIC en lecture. Écart trompeur
-- entre le message affiché et la limite réellement appliquée.
--
-- Correctif : aligne "post-media" sur les mêmes MIME autorisés que le
-- composeur (image + vidéo) et sur le plafond serveur déjà utilisé pour les
-- autres buckets mixtes image/vidéo (50 Mo — chat-media, community-media,
-- avatars). Additif, ne touche aucun fichier déjà uploadé (une limite plus
-- basse sur un bucket existant ne s'applique qu'aux futurs uploads, jamais
-- rétroactivement aux objets déjà stockés). À exécuter dans Supabase :
-- SQL Editor, après supabase-feed-posts.sql.
-- ============================================================================

update storage.buckets
set file_size_limit = 52428800, -- 50 Mo, même plafond serveur que chat-media/community-media/avatars
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']
where id = 'post-media';

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'post-media';
-- ============================================================================
