-- ============================================================================
-- DURCISSEMENT — aucun plafond de stockage TOTAL par compte (trouvé lors de
-- l'audit autonome du 4 septembre 2026, angle "un utilisateur malveillant
-- peut-il épuiser le quota Storage du projet en uploadant en boucle sans
-- jamais rien supprimer ?").
--
-- Constat : chaque bucket a bien un file_size_limit PAR FICHIER (50 Mo pour
-- avatars/post-media/chat-media/community-media/event-media/event-covers —
-- voir supabase-post-media-bucket-limit-fix.sql, supabase-stories-2.sql) et
-- chaque ACTION a une limite de NOMBRE de fichiers (ex. MAX_MEDIA_ITEMS = 10
-- par publication dans PostsFeed.jsx). Mais rien ne plafonne le volume total
-- accumulé par un même compte au fil du temps : un utilisateur authentifié
-- peut publier un nombre illimité de posts (chacun jusqu'à 10 fichiers de
-- 50 Mo), ne jamais rien supprimer, et faire croître indéfiniment l'usage
-- Storage du projet — un vecteur d'épuisement de quota (déni de service
-- économique/opérationnel sur le plan Supabase), distinct d'une faille RLS
-- (tous les uploads passent bien par les policies existantes, propriétaire
-- correct, buckets/chemins corrects).
--
-- Correctif proposé : trigger BEFORE INSERT sur storage.objects qui
-- recalcule à chaque upload le volume total déjà stocké par le
-- propriétaire (somme de metadata->>'size' sur TOUS ses fichiers, tous
-- buckets applicatifs confondus) et rejette l'insertion si le nouveau
-- total dépasserait le plafond STORAGE_QUOTA_BYTES_PER_USER défini
-- ci-dessous. Recalcul dynamique (pas de compteur séparé à maintenir en
-- synchronisation) : une suppression de fichier libère immédiatement de la
-- marge, sans logique additionnelle.
--
-- IMPORTANT — ce fichier NE DOIT PAS être exécuté tel quel sans relecture :
--   1. Le plafond ci-dessous (STORAGE_QUOTA_BYTES_PER_USER, 1 Go par défaut)
--      est une valeur arbitraire de départ, pas une décision produit. À
--      ajuster selon le plan Supabase réel et le nombre d'utilisateurs
--      attendu avant d'exécuter ce script en production.
--   2. Impact utilisateurs existants : si des comptes ont déjà accumulé plus
--      que ce plafond au moment de l'exécution, ils ne pourront plus rien
--      uploader de nouveau tant qu'ils n'auront pas supprimé des fichiers
--      (les fichiers déjà stockés ne sont jamais touchés — uniquement les
--      futurs uploads sont bloqués). Vérifier l'usage actuel avant
--      d'activer (requête de vérification fournie en bas de fichier).
--   3. Le bucket "avatars" sert aussi de dépôt pour les couvertures de
--      communauté et les médias de stories (voir commentaire dans
--      CommunityCreateForm.jsx) : il est donc inclus dans le calcul comme
--      les autres buckets applicatifs.
--
-- À exécuter dans Supabase : SQL Editor, une fois relu/ajusté — indépendant
-- des autres scripts de cette liste.
-- ============================================================================

create or replace function enforce_storage_account_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Plafond total par compte, tous buckets applicatifs confondus. Valeur de
  -- départ arbitraire (1 Go) — à ajuster avant exécution, voir note ci-dessus.
  v_quota_bytes bigint := 1073741824; -- 1 Go
  v_current_total bigint;
  v_new_size bigint;
begin
  -- Ne s'applique qu'aux buckets applicatifs connus, avec propriétaire
  -- identifié. Les inserts sans owner (ex. opérations service_role hors
  -- upload utilisateur, s'il y en a un jour) ne sont pas plafonnés ici.
  if new.owner is null or new.bucket_id not in
     ('avatars', 'post-media', 'chat-media', 'community-media', 'event-media', 'event-covers')
  then
    return new;
  end if;

  v_new_size := coalesce((new.metadata->>'size')::bigint, 0);

  select coalesce(sum((metadata->>'size')::bigint), 0)
    into v_current_total
    from storage.objects
    where owner = new.owner
      and bucket_id in ('avatars', 'post-media', 'chat-media', 'community-media', 'event-media', 'event-covers');

  if v_current_total + v_new_size > v_quota_bytes then
    raise exception 'STORAGE_QUOTA_EXCEEDED: limite de stockage de ton compte atteinte. Supprime des photos/vidéos avant d''en ajouter de nouvelles.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_storage_account_quota on storage.objects;
create trigger trg_enforce_storage_account_quota
  before insert on storage.objects
  for each row execute function enforce_storage_account_quota();

-- Accélère la requête SUM du trigger (une par upload) — sans index, chaque
-- upload scannerait toute la table storage.objects.
create index if not exists idx_storage_objects_owner_bucket
  on storage.objects (owner, bucket_id);

-- ----------------------------------------------------------------------------
-- Vérification AVANT d'activer (à exécuter séparément, en premier) : liste
-- les comptes déjà au-dessus du plafond envisagé — s'assurer que la liste
-- est vide/attendue avant d'exécuter le trigger ci-dessus, sinon ces
-- comptes seront immédiatement bloqués pour tout nouvel upload.
--
-- select owner, sum((metadata->>'size')::bigint) as total_bytes
--   from storage.objects
--   where bucket_id in ('avatars','post-media','chat-media','community-media','event-media','event-covers')
--   group by owner
--   having sum((metadata->>'size')::bigint) > 1073741824
--   order by total_bytes desc;
--
-- Vérification APRÈS activation :
-- select tgname from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'trg_enforce_storage_account_quota';
-- ============================================================================
