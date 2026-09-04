-- ============================================================================
-- Corrige une fuite confirmee EMPIRIQUEMENT (curl anonyme, cle publique anon
-- uniquement, aucune session) : n'importe quel visiteur, meme jamais
-- connecte a Baobab, peut lister l'INTEGRALITE du contenu des buckets
-- Storage "avatars" et "post-media" via l'API Storage
-- (POST /storage/v1/object/list/<bucket>), avec le nom exact de chaque
-- fichier, sa taille et ses dates.
--
-- Ce n'est PAS le meme probleme que le contournement NULL des gardes RLS sur
-- les TABLES (supabase-authz-null-bypass-CRITIQUE-fix.sql) : ici c'est une
-- policy RLS sur storage.objects qui a toujours ete trop large par
-- conception (aucune clause "to authenticated"), verifiee ce jour avec :
--   curl -X POST "https://<projet>.supabase.co/storage/v1/object/list/avatars" \
--     -H "apikey: <cle anon>" -H "Authorization: Bearer <cle anon>" \
--     -H "Content-Type: application/json" -d '{"prefix":"","limit":1000,"offset":0}'
-- -> renvoie la liste reelle des dossiers (un par profil_id) puis, avec un
-- prefix "<uuid>/", la liste des fichiers de ce profil — y compris les
-- fichiers "story-*.jpg"/"story-*.mp4" (les stories sont stockees dans le
-- bucket "avatars", voir SocialShell.jsx ligne ~1550), donc y compris des
-- stories deja EXPIREES dans l'app (l'expiration est un filtre de requete,
-- pas une suppression du fichier Storage sous-jacent — voir
-- supabase-stories-expiration.sql). Meme resultat pour "post-media".
--
-- A l'inverse, "chat-media"/"community-media"/"event-media"/"event-covers"
-- renvoient [] pour ce meme test car leurs policies SELECT conditionnent
-- l'acces a une appartenance/visibilite reelle (is_community_member,
-- can_view_event, "conversation matchee"...) qui echoue naturellement pour
-- un appelant anonyme sans session.
--
-- Correctif : restreindre la policy SELECT de "avatars" et "post-media" au
-- role authenticated. Sans impact sur l'affichage normal des photos dans
-- l'app (getPublicUrl() continue de fonctionner pour un lien direct connu :
-- ces deux buckets sont marques public=true dans storage.buckets, ce qui
-- fait deja sauter la verification RLS pour une LECTURE DIRECTE d'un
-- fichier dont on connait l'URL exacte — c'est voulu, c'est ainsi que les
-- photos de profil s'affichent). Seule la capacite de LISTER
-- (enumerer) le contenu du bucket sans rien connaitre a l'avance passe par
-- cette policy RLS, et c'est elle qui est resserree ici. LandingPage.jsx
-- (page publique avant connexion) n'affiche aucune vraie photo de profil —
-- verifie, aucun appel Storage cote non-connecte a preserver.
--
-- A executer dans Supabase : SQL Editor (une fois), sans dependance
-- nouvelle sur d'autres migrations.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars:%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "avatars: lecture publique"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatars');

  create policy "avatars: televerse dans son propre dossier"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "avatars: modifie ses propres fichiers"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "avatars: supprime ses propres fichiers"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname like '%post-media%' loop
    execute format('drop policy %I on storage.objects', pol.policyname);
  end loop;

  create policy "Lecture publique post-media"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'post-media');

  create policy "Televersement post-media dans son propre dossier"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);

  create policy "Suppression post-media dans son propre dossier"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
end $$;

-- Verification apres execution — refaire le curl anonyme ci-dessus depuis un
-- terminal : la liste doit desormais etre vide / l'appel doit echouer sans
-- jeton d'un compte reellement connecte (Authorization: Bearer <access_token
-- de session>, pas juste la cle anon publique).
