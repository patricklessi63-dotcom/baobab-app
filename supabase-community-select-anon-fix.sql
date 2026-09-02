-- ============================================================================
-- CORRECTIF — policies RLS "communities" / "community_members" /
-- "event_staff" lisibles par le rôle "anon" (trouvé lors de l'audit
-- autonome du 2 septembre 2026, passage 149, angle : policies RLS des
-- tables sensibles, en complément de l'audit "security definer" du
-- passage 148 déjà déclaré exhaustif).
--
-- MÊME BUG que celui déjà identifié et corrigé pour "profiles" dans
-- supabase-scale-security.sql (§3, "🔴 CRITIQUE — profiles SELECT était
-- lisible par le rôle anon"), mais jamais reporté sur les policies
-- équivalentes créées ensuite dans supabase-communities.sql et
-- supabase-events-v2.sql :
--
--   - "communities" (supabase-communities.sql ligne ~81) :
--     create policy "Lecture publique des communautes"
--     on communities for select using (true);
--     Le commentaire juste au-dessus dit explicitement l'intention :
--     "select ouverte à tous les authentifiés" — mais la policy ne
--     restreint à aucun rôle (pas de "to authenticated"), donc "using
--     (true)" s'applique par défaut à TOUT rôle Postgres, "anon" inclus.
--     N'importe qui possédant la clé publique "anon" (embarquée dans le
--     build front, donc publique de fait) peut lister toutes les
--     communautés, y compris les communautés "private"/"invite_only"
--     (nom, description, ville, catégorie), sans aucun compte Baobab.
--
--   - "community_members" (supabase-communities.sql ligne ~113) :
--     create policy "Lecture publique des membres"
--     on community_members for select using (true);
--     Même défaut, conséquence plus grave : la liste NOMINATIVE des
--     membres de N'IMPORTE QUELLE communauté (y compris une communauté
--     privée créée pour un groupe vulnérable — statut migratoire,
--     orientation, communauté religieuse ou ethnique précise) est lisible
--     par quiconque, sans authentification. C'est exactement le type de
--     fuite de confidentialité déjà corrigé 17 fois lors des passages
--     précédents, jamais appliqué ici.
--
--   - "event_staff" (supabase-events-v2.sql ligne ~241) :
--     create policy "Lecture publique du staff d'evenement"
--     on event_staff for select using (true);
--     Le commentaire qui suit cette policy la décrit lui-même comme
--     "l'équivalent du bug corrigé en Phase 6 sur community_members" —
--     mais ce commentaire ne visait que la policy INSERT juste en dessous
--     (empêcher un client de s'auto-promouvoir organisateur), pas le
--     SELECT : le même oubli de restriction de rôle a donc été reproduit
--     ici au moment même où l'auteur pensait corriger l'équivalent du bug
--     "community_members".
--
-- Vérifié dans src/ : CommunitiesTab.jsx, EventsTab.jsx, FeedTab.jsx et
-- SocialShell.jsx (les seuls endroits qui lisent "communities",
-- "community_members" ou "event_staff") ne sont montés qu'à l'intérieur
-- de l'app authentifiée, jamais avant qu'une session existe (même garde
-- que celle déjà vérifiée pour "profiles" dans supabase-scale-security.sql
-- : session === null bloque tout chargement de données dans App.jsx) —
-- ce resserrement ne casse donc aucun usage réel de l'app, comme pour le
-- correctif original sur "profiles".
--
-- NE TOUCHE PAS : "events"/"event_attendees"/"event_invitations"/
-- "event_media" (visibilité déjà gérée finement par can_view_event(), où
-- la branche 'public' est délibérément ouverte à tout le monde — retirer
-- cet accès serait un choix produit, pas la correction d'un bug, donc
-- hors périmètre de ce correctif ciblé sur les policies "using (true)"
-- sans restriction de rôle).
--
-- À exécuter dans Supabase : SQL Editor (une fois), après
-- supabase-communities.sql et supabase-events-v2.sql. Additif/idempotent,
-- ne touche aucune donnée existante — remplace seulement 3 policies par
-- leur équivalent restreint au rôle "authenticated".
-- ============================================================================

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'communities' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.communities', pol.policyname);
  end loop;

  create policy "Lecture des communautes par les utilisateurs connectes"
  on communities for select
  to authenticated
  using (true);
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'community_members' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.community_members', pol.policyname);
  end loop;

  create policy "Lecture des membres par les utilisateurs connectes"
  on community_members for select
  to authenticated
  using (true);
end $$;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'event_staff' and cmd = 'SELECT' loop
    execute format('drop policy %I on public.event_staff', pol.policyname);
  end loop;

  create policy "Lecture du staff d'evenement par les utilisateurs connectes"
  on event_staff for select
  to authenticated
  using (true);
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après, avec le client
-- "anon" — clé publique, PAS la clé service_role) :
-- select count(*) from communities;        -- doit échouer / renvoyer 0 lignes
-- select count(*) from community_members;  -- doit échouer / renvoyer 0 lignes
-- select count(*) from event_staff;        -- doit échouer / renvoyer 0 lignes
--
-- select policyname, roles, cmd from pg_policies
-- where tablename in ('communities','community_members','event_staff') and cmd = 'SELECT';
-- -- "roles" doit afficher {authenticated}, jamais {public}.
-- ============================================================================
