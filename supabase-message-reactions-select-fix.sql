-- ============================================================================
-- CORRECTIF — policy RLS "message_reactions_select" lisible par n'importe
-- quel rôle et pour n'importe quelle conversation (trouvé lors de l'audit
-- autonome du 2 septembre 2026, passage 151, angle : policies INSERT/UPDATE/
-- DELETE des tables sensibles — cette fuite a été repérée en cours de route
-- en vérifiant les policies voisines de "message_reactions", et est trop
-- grave pour être laissée de côté au motif qu'elle est techniquement SELECT).
--
-- Définie dans supabase-messaging-2.sql (jamais modifié ici, voir consigne
-- "jamais modifier un fichier SQL déjà potentiellement exécuté en prod") :
--
--   create policy "message_reactions_select" on public.message_reactions
--   for select
--   using (exists (select 1 from public.messages m where m.id = message_reactions.message_id));
--
-- Deux défauts cumulés :
--
-- 1. Pas de "to authenticated" : la policy s'applique par défaut à TOUT
--    rôle Postgres, "anon" inclus — même bug que celui déjà corrigé pour
--    "communities"/"community_members"/"event_staff" dans
--    supabase-community-select-anon-fix.sql.
--
-- 2. Le "using" ne vérifie que l'EXISTENCE du message (m.id = ...), jamais
--    que l'appelant fait partie de la conversation. Le commentaire du
--    fichier d'origine dit vouloir "restreindre à ce qui appartient à sa
--    propre conversation" (voir supabase-messaging-2.sql ligne ~80), mais
--    le prédicat écrit ne le fait pas : n'importe quel utilisateur connecté
--    peut lire message_id/profile_id/emoji de TOUTES les réactions de TOUS
--    les messages de TOUTES les conversations de la plateforme.
--
-- Impact réel confirmé côté client (src/App.jsx) : la fonction
-- loadReactionsFor() s'appuie sur cette policy pour filtrer côté serveur
-- (elle ne fait AUCUN filtre applicatif par conversation sur la requête
-- .from("message_reactions").select(...).in("message_id", messageIds)), et
-- surtout l'abonnement realtime (src/App.jsx ~ligne 1975) s'abonne aux
-- événements INSERT/DELETE de TOUTE la table "message_reactions" sans
-- filtre serveur, en comptant explicitement sur cette policy pour ne
-- recevoir que ses propres conversations (commentaire ligne ~1971 :
-- "RLS (message_reactions_select) restreint déjà ce qui est livré à ce qui
-- appartient à mes propres conversations" — faux avec la policy actuelle).
-- Résultat : chaque client recevait en temps réel, pour CHAQUE réaction
-- ajoutée ou retirée par N'IMPORTE QUEL utilisateur sur la plateforme,
-- {message_id, profile_id, emoji} — une fuite de confidentialité
-- exploitable en inspectant simplement le trafic réseau/WebSocket du
-- navigateur, révélant qui échange avec qui et avec quelle réaction, bien
-- au-delà de ses propres conversations.
--
-- Correction : même prédicat que la policy SELECT canonique de "messages"
-- (supabase-protect-rls.sql) — le profil de l'appelant doit figurer dans le
-- match_key du message concerné — et restriction explicite au rôle
-- "authenticated". Aucun changement requis côté React : le filtre
-- applicatif existant (par messageIds chargés) reste une protection
-- supplémentaire légitime, RLS redevient simplement la barrière réelle
-- qu'elle était censée être.
--
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-messaging-2.sql. Additif/idempotent, ne touche aucune donnée
-- existante — remplace uniquement la policy SELECT de message_reactions.
-- ============================================================================

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'message_reactions' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.message_reactions', pol.policyname);
  end loop;

  create policy "message_reactions_select"
  on public.message_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and (select id from public.profiles where user_id = auth.uid())::text
          = any (string_to_array(m.match_key, '__'))
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, avec le client
-- "anon" — clé publique, PAS la clé service_role) :
-- select count(*) from message_reactions;
-- -- doit échouer / renvoyer 0 lignes pour "anon".
--
-- Avec une session authentifiée n'appartenant à AUCUNE conversation
-- concernée :
-- select * from message_reactions where message_id = <id d'un message
--   d'une conversation étrangère>;
-- -- doit renvoyer 0 ligne.
--
-- select policyname, roles, cmd, qual from pg_policies
-- where tablename = 'message_reactions' and cmd = 'SELECT';
-- -- "roles" doit afficher {authenticated}, jamais {public}.
-- ============================================================================
