-- ============================================================================
-- supabase-close-read-leaks.sql — FERMETURE DES FUITES DE LECTURE (20 oct. 2026)
-- ============================================================================
-- Rédigé pour fermer les constats C1, C2, I3 de AUDIT-BAOBAB.md :
--   C2  `profile_photos` lisible SANS connexion (11 lignes, URL d'images directes).
--   I3  `EXECUTE` resté accordé à `anon` / PUBLIC sur des fonctions SECURITY DEFINER.
--   C1  colonnes sensibles de `profiles` (birth_date, ban_reason, report_count...)
--       lisibles par TOUT compte connecté.
--   R   Realtime : les événements DELETE ne passent pas par la RLS.
--
-- >>> CE FICHIER N'A JAMAIS ÉTÉ EXÉCUTÉ CONTRE LA BASE RÉELLE. <<<
-- Il a été validé uniquement sur un SCHÉMA FACTICE (moteur PGlite = PostgreSQL local,
-- voir src/native/closeReadLeaks.test.js). La vraie base peut différer (politiques
-- posées à la main, fonctions inconnues, version de PostgreSQL). RÈGLE : le jouer
-- D'ABORD sur un projet Supabase de RÉPÉTITION (LANCEMENT.md, « Projet de répétition »),
-- puis en production, BLOC PAR BLOC, jamais le fichier entier d'un coup.
--
-- COMMENT UTILISER CE FICHIER
--   Chaque bloc a six rubriques repérables :
--     [OBJECTIF]  [PRÉ-CONTRÔLE]  [CORRECTIF]  [CONTRÔLE APRÈS]  [IMPACT APP]  [RETOUR ARRIÈRE]
--   1. Colle UNIQUEMENT le [PRÉ-CONTRÔLE] du bloc, lis le résultat, garde-le (capture).
--   2. Colle UNIQUEMENT le [CORRECTIF] du bloc (de « -- >>> CORRECTIF » jusqu'à « -- <<< »).
--   3. Colle le [CONTRÔLE APRÈS] et compare à l'attendu écrit dans le bloc.
--   Les lignes du retour arrière sont en commentaire préfixé « --| » : retire ce préfixe pour les jouer.
--
-- SÉCURITÉ ANTI-ERREUR : les blocs 1B, 3B et 4B sont « armés ». Leur correctif vérifie qu'une ligne d'armement a été
--   collée AU-DESSUS, dans la même exécution, par une personne qui sait ce qu'elle fait :
--       set baobab.arm = 'bloc3b';      (ou 'bloc1b', 'bloc4b' selon le bloc)
--   Sans cette ligne, le correctif lève une erreur. Si on colle le fichier ENTIER par erreur, le premier bloc armé (1B) lève
--   une erreur et l'éditeur annule normalement TOUT (une seule transaction) : rien n'est appliqué. Il faut donc coller
--   les blocs un par un.
--
-- JOURNAL DE SAUVEGARDE (ajouté à la revue indépendante du 28 oct. 2026) : les correctifs 1, 2, 3B et 4A/4B enregistrent, AVANT de
--   modifier quoi que ce soit, l'état d'origine sous forme de SQL rejouable dans la table `public.baobab_sql22_backup`
--   (invisible pour l'API : RLS active, aucun droit pour anon/authenticated). Une relecture du correctif n'écrase pas cet état
--   d'origine. Le retour arrière de chaque bloc commence par un `do $$ ... baobab_sql22_backup ... $$;` (lignes `--|`) qui rejoue
--   la sauvegarde. Ne supprime PAS cette table avant la fin de la surveillance post-lancement.
--   Le SQL Editor n'affiche pas toujours les messages RAISE NOTICE : ce sont les requêtes [CONTRÔLE APRÈS] qui font foi.
--
-- ORDRE RECOMMANDÉ (détails et justification : LANCEMENT.md, fiche SQL-22)
--   Bloc 1  (profile_photos)             -> aucun changement de code requis. À faire en premier.
--   Bloc 2  (EXECUTE anon + search_path) -> aucun changement de code requis.
--   Bloc 4A (Realtime blocks/passes)     -> aucun changement de code requis.
--   Bloc 3A (fonction get_my_profile)    -> additif, à faire AVANT de déployer le code client.
--   (déployer le code client qui lit son propre profil via get_my_profile(), puis vérifier)
--   Bloc 3B (colonnes sensibles)         -> UNIQUEMENT après le déploiement du code client.
--   Blocs 1B et 4B                       -> OPTIONNELS, chantiers distincts (voir leurs impacts).
-- ============================================================================


-- ############################################################################
-- BLOC 1 — `profile_photos` : RLS + politiques minimales
-- ############################################################################
-- [OBJECTIF]
--   Aujourd'hui un visiteur sans compte lit `profile_photos` (colonnes id, profile_id, url,
--   position, created_at) : `url` est l'URL PUBLIQUE d'une image du bucket `avatars`, donc
--   l'image elle-même est téléchargeable sans compte. La table n'est créée par aucun fichier
--   SQL du dépôt (créée à la main) : ce bloc la VERSIONNE (create table if not exists : sans
--   effet là où elle existe), active la RLS, supprime TOUTES les politiques existantes (inconnues)
--   et recrée quatre politiques minimales :
--     - lecture : comptes connectés seulement, sauf si le propriétaire de la photo est bloqué
--       avec moi (dans un sens ou dans l'autre), banni, suspendu ou en suppression de compte ;
--       ses propres photos sont toujours lisibles ;
--     - insertion / modification / suppression : uniquement ses propres photos.
--   Le rôle `anon` perd tout privilège sur la table.
--   Ce que ce bloc NE fait PAS : il n'empêche pas de télécharger une image dont on connaît déjà
--   l'URL (bucket `avatars` public) — voir le bloc 1B.
--
-- [PRÉ-CONTRÔLE] (lecture seule : à coller AVANT, résultats à conserver)
--   -- 1.a  La table existe-t-elle, la RLS est-elle active ?
--   select c.relname, c.relrowsecurity as rls_active, c.relforcerowsecurity as rls_forcee
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname = 'profile_photos';
--
--   -- 1.b  Politiques actuelles (inconnues : c'est ici qu'on découvre pourquoi un anonyme lit)
--   select policyname, permissive, roles, cmd, qual, with_check
--   from pg_policies where schemaname = 'public' and tablename = 'profile_photos'
--   order by cmd, policyname;
--
--   -- 1.c  Droits de table (cherche une ligne grantee = 'anon' ou 'PUBLIC')
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'profile_photos'
--   order by grantee, privilege_type;
--
--   -- 1.d  Colonnes réelles (le bloc suppose profile_id, url, position ; id = uuid)
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'profile_photos' order by ordinal_position;
--
--   -- 1.e  Nombre total de lignes (l'éditeur SQL lit en tant que propriétaire : c'est le chiffre que la sonde HTTP anonyme voyait, 11 le 20 oct.)
--   select count(*) as lignes_total from public.profile_photos;
--
--   -- 1.f  SAUVEGARDE EXACTE des politiques actuelles, sous forme de SQL rejouable.
--   --      COPIE TOUT LE RÉSULTAT DANS UN FICHIER HORS DÉPÔT AVANT de coller le correctif (le correctif en garde aussi une copie
--   --      dans public.baobab_sql22_backup, mais une copie à toi vaut mieux qu'une seule).
--   select format('create policy %I on %I.%I as %s for %s to %s%s%s;',
--            policyname, schemaname, tablename, permissive, cmd,
--            array_to_string(roles, ', '),
--            case when qual is not null then ' using (' || qual || ')' else '' end,
--            case when with_check is not null then ' with check (' || with_check || ')' else '' end) as sql_de_sauvegarde
--   from pg_policies where schemaname = 'public' and tablename = 'profile_photos';
--
--   -- 1.g  Le bucket `avatars` est-il public ? (attendu : public = true, ce qui est le sujet du bloc 1B)
--   select id, public, file_size_limit from storage.buckets where id = 'avatars';
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 1
-- Journal de sauvegarde (voir l'en-tête du fichier ; sans effet s'il existe déjà).
do $$
begin
  create table if not exists public.baobab_sql22_backup (
    seq bigint generated always as identity,
    bloc text not null,
    objet text not null,
    restore_sql text not null,
    taken_at timestamptz not null default now(),
    primary key (bloc, objet)
  );
  alter table public.baobab_sql22_backup enable row level security;
  revoke all on public.baobab_sql22_backup from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.baobab_sql22_backup from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.baobab_sql22_backup from authenticated; end if;
end $$;

-- Garde de structure : si une colonne dont dépendent les politiques manque (table de production différente de celle
-- que le client suppose), on s'arrête ICI avec un message clair, avant toute modification.
do $$
declare v_manque text;
begin
  select string_agg(x, ', ' order by x) into v_manque from (
    select 'profiles.' || c as x from unnest(array['id','user_id','banned_at','suspended_until','deletion_requested_at']) c
      where not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = c and attnum > 0 and not attisdropped)
    union all
    select 'blocks.' || c from unnest(array['from_id','to_id']) c
      where to_regclass('public.blocks') is null
         or not exists (select 1 from pg_attribute where attrelid = to_regclass('public.blocks') and attname = c and attnum > 0 and not attisdropped)
    union all
    select 'profile_photos.profile_id'
      where to_regclass('public.profile_photos') is not null
        and not exists (select 1 from pg_attribute where attrelid = to_regclass('public.profile_photos') and attname = 'profile_id' and attnum > 0 and not attisdropped)
  ) q;
  if v_manque is not null then
    raise exception 'BLOC 1 : colonne(s) ou table introuvable(s) : % . Rien n''a été modifié. Envoie le résultat des pré-contrôles 1.d à l''assistant.', v_manque;
  end if;
end $$;

-- Sauvegarde de l'état actuel (inconnu du dépôt) AVANT toute modification : politiques, RLS, droits de table.
do $$
declare r record; v_privs text;
begin
  if to_regclass('public.profile_photos') is null then return; end if;   -- table absente : elle va être créée, rien à sauvegarder
  -- Le retour arrière commence par retirer les quatre nouvelles politiques et la fonction (ordre : « 00 » d'abord).
  insert into public.baobab_sql22_backup (bloc, objet, restore_sql) values ('1', '00-retirer-les-nouvelles-politiques',
    'drop policy if exists "profile_photos: lecture par les comptes connectes" on public.profile_photos; '
    || 'drop policy if exists "profile_photos: ajout de ses propres photos" on public.profile_photos; '
    || 'drop policy if exists "profile_photos: modification de ses propres photos" on public.profile_photos; '
    || 'drop policy if exists "profile_photos: suppression de ses propres photos" on public.profile_photos; '
    || 'drop function if exists public.can_view_profile_photos(uuid);')
  on conflict do nothing;
  insert into public.baobab_sql22_backup (bloc, objet, restore_sql)
  select '1', 'politique:' || policyname,
         format('create policy %I on %I.%I as %s for %s to %s%s%s;', policyname, schemaname, tablename, permissive, cmd,
                array_to_string(roles, ', '),
                case when qual is not null then ' using (' || qual || ')' else '' end,
                case when with_check is not null then ' with check (' || with_check || ')' else '' end)
  from pg_policies
  where schemaname = 'public' and tablename = 'profile_photos' and policyname not like 'profile_photos: %'
  on conflict do nothing;
  if not (select relrowsecurity from pg_class where oid = 'public.profile_photos'::regclass) then
    insert into public.baobab_sql22_backup (bloc, objet, restore_sql)
    values ('1', 'rls-desactivee', 'alter table public.profile_photos disable row level security;') on conflict do nothing;
  end if;
  for r in select v.nom, v.oid from (values ('anon', (select oid from pg_roles where rolname = 'anon')), ('public', 0::oid)) v(nom, oid) where v.oid is not null loop
    select string_agg(a.privilege_type, ', ' order by a.privilege_type) into v_privs
    from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid = 'public.profile_photos'::regclass and a.grantee = r.oid;
    if v_privs is not null then
      insert into public.baobab_sql22_backup (bloc, objet, restore_sql)
      values ('1', 'droits-table:' || r.nom, format('grant %s on public.profile_photos to %s;', v_privs, r.nom)) on conflict do nothing;
    end if;
  end loop;
end $$;

-- Table versionnée (sans effet si elle existe déjà ; structure déduite du code client).
create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profile_photos enable row level security;

-- Qui peut voir les photos du profil p_profile_id ? SECURITY DEFINER pour lire `blocks`
-- dans les DEUX sens (la RLS de `blocks` ne montre que mes propres blocages) et l'état du
-- compte propriétaire. Retourne false pour un appelant non connecté.
create or replace function public.can_view_profile_photos(p_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null or p_profile_id is null then false
    when p_profile_id = (select id from public.profiles where user_id = auth.uid()) then true
    else
      not exists (
        select 1 from public.blocks b
        where (b.from_id = (select id from public.profiles where user_id = auth.uid()) and b.to_id = p_profile_id)
           or (b.from_id = p_profile_id and b.to_id = (select id from public.profiles where user_id = auth.uid()))
      )
      and exists (
        select 1 from public.profiles o
        where o.id = p_profile_id
          and o.banned_at is null
          and (o.suspended_until is null or o.suspended_until <= now())
          and o.deletion_requested_at is null
      )
  end;
$$;
revoke all on function public.can_view_profile_photos(uuid) from public, anon;
grant execute on function public.can_view_profile_photos(uuid) to authenticated;

-- Supprime TOUTES les politiques existantes (inconnues), puis recrée les quatre minimales.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profile_photos' loop
    execute format('drop policy %I on public.profile_photos', pol.policyname);
  end loop;
end $$;

create policy "profile_photos: lecture par les comptes connectes"
on public.profile_photos for select to authenticated
using (public.can_view_profile_photos(profile_id));

create policy "profile_photos: ajout de ses propres photos"
on public.profile_photos for insert to authenticated
with check (profile_id = (select id from public.profiles where user_id = auth.uid()));

create policy "profile_photos: modification de ses propres photos"
on public.profile_photos for update to authenticated
using (profile_id = (select id from public.profiles where user_id = auth.uid()))
with check (profile_id = (select id from public.profiles where user_id = auth.uid()));

create policy "profile_photos: suppression de ses propres photos"
on public.profile_photos for delete to authenticated
using (profile_id = (select id from public.profiles where user_id = auth.uid()));

-- Droits de table : plus rien pour anon / PUBLIC ; les comptes connectés gardent les quatre droits
-- (la RLS ci-dessus fait le tri ligne par ligne).
revoke all on public.profile_photos from anon, public;
grant select, insert, update, delete on public.profile_photos to authenticated;
-- <<<
--
-- [CONTRÔLE APRÈS]
--   select relrowsecurity as rls_active from pg_class where oid = 'public.profile_photos'::regclass;    -- attendu : true
--   select policyname, cmd, roles from pg_policies where tablename = 'profile_photos' order by cmd;      -- attendu : 4 lignes, roles = {authenticated}
--   select has_table_privilege('anon', 'public.profile_photos', 'SELECT') as anon_peut_lire;             -- attendu : false
--   select has_function_privilege('anon', 'public.can_view_profile_photos(uuid)', 'EXECUTE');            -- attendu : false
--   Sonde HTTP anonyme (clé publique, comptage seulement) :
--     curl -s -H "apikey: <clé publique>" -H "Authorization: Bearer <clé publique>" -H "Prefer: count=exact" \
--          -I "https://<projet>.supabase.co/rest/v1/profile_photos?select=id&limit=0"
--     attendu : HTTP 401 (permission denied) — et plus « content-range: */11 ».
--   Test à deux comptes (répétition) : A voit les photos de B ; si A bloque B (ou B bloque A), A ne voit plus la
--   galerie de B (la photo principale reste visible : elle est dans profiles.avatar_url) ; A ne peut ni modifier
--   ni supprimer une photo de B ; l'ajout/la suppression/le réordonnancement de ses propres photos fonctionnent.
--
-- [IMPACT APP] (lecteurs et écrivains de `profile_photos` dans src/, tous vérifiés)
--   - src/lib/initialLoad.js:120  select("*").in("profile_id", lot) pour les ~500 profils chargés + le sien :
--     compte connecté -> inchangé, sauf galeries des profils bloqués/bannis/suspendus (que l'app masque déjà).
--   - src/App.jsx:1917 delete().eq("id")        : ses propres photos -> inchangé.
--   - src/App.jsx:1974 upsert([{id,profile_id,url,position}]) (réordonner) : INSERT ... ON CONFLICT DO UPDATE
--     sur ses propres lignes -> couvert par les politiques insert + update + lecture de ses lignes.
--   - src/App.jsx:2125 et OnboardingWizard.jsx:258  insert(rows).select() : profile_id = mon profil -> inchangé.
--   - src/App.jsx:2224 et OnboardingWizard.jsx:334  delete().in("id") (annulation) : ses propres lignes -> inchangé.
--   - OnboardingWizard.jsx:247 et src/lib/exportData.js:23  select("*").eq("profile_id", moi) : inchangé.
--   - Page publique (LandingPage) : n'utilise pas cette table. Edge functions : n'y accèdent pas (service_role
--     de toute façon exempté de RLS ; les lignes disparaissent par la cascade du profil).
--   - Les images elles-mêmes restent servies par le bucket public `avatars` (bloc 1B).
--
-- [RETOUR ARRIÈRE] (rouvre la fuite : à ne faire qu'en cas de panne avérée)
--| -- Voie simple : rejoue la sauvegarde automatique du correctif (politiques d'origine, RLS, droits de anon) :
--| do $$ declare r record; begin if to_regclass('public.baobab_sql22_backup') is not null then
--|   for r in select restore_sql from public.baobab_sql22_backup where bloc = '1' order by seq loop execute r.restore_sql; end loop; end if;
--| end $$;
--| -- Voie manuelle (si la sauvegarde est absente) :
--| drop policy if exists "profile_photos: lecture par les comptes connectes" on public.profile_photos;
--| drop policy if exists "profile_photos: ajout de ses propres photos" on public.profile_photos;
--| drop policy if exists "profile_photos: modification de ses propres photos" on public.profile_photos;
--| drop policy if exists "profile_photos: suppression de ses propres photos" on public.profile_photos;
--| -- puis rejouer les lignes « create policy ... » sauvegardées par le pré-contrôle 1.f ;
--| -- si la RLS était désactivée avant (pré-contrôle 1.a, rls_active = false) :
--| --   alter table public.profile_photos disable row level security;
--| -- si anon avait des droits avant (pré-contrôle 1.c) :
--| --   grant select, insert, update, delete on public.profile_photos to anon;
--| drop function if exists public.can_view_profile_photos(uuid);


-- ############################################################################
-- BLOC 1B — OPTIONNEL : bucket `avatars` privé (les images ne sont plus devinables)
-- ############################################################################
-- [OBJECTIF]
--   Le bloc 1 ferme le CATALOGUE des URL, mais le bucket `avatars` est PUBLIC (supabase-scale-security.sql:213) :
--   toute URL déjà connue (les 11 que l'API anonyme a pu livrer avant le correctif, toute URL copiée, partagée ou
--   mise en cache) continue d'afficher l'image SANS compte, indéfiniment. Seul un bucket privé + URL signées
--   (comme `chat-media`, src/lib/signedUrlCache.js) y met fin.
--
-- >>> NE PAS EXÉCUTER AVANT D'AVOIR MIGRÉ LE CODE CLIENT. <<<
--   Toutes les images (avatar, galerie, couverture, statuts, couvertures de communautés) sont stockées dans la base
--   sous forme d'URL PUBLIQUES complètes (…/storage/v1/object/public/avatars/…). Dès que le bucket est privé, ces URL
--   répondent 400/404 : TOUTES les photos du site se cassent tant que le client n'a pas remplacé chaque
--   <img src={url}> par une URL signée (createSignedUrl, durée limitée, mise en cache) — des dizaines d'écrans
--   (Découverte, Fil, statuts, profils, messagerie, communautés). C'est un chantier à part (plusieurs jours + tests),
--   non fait. Alternative moins chère pour le 15 novembre : laisser le bucket public (noms de fichiers déjà non
--   devinables : <uuid-auth>/photo-<horodatage>-<n>.<ext>, listage anonyme fermé par supabase-storage-anon-listing-fix.sql)
--   et, si l'une des 11 photos exposées pose problème, la remplacer (la supprimer puis la re-téléverser change l'URL).
--
-- [PRÉ-CONTRÔLE]
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';   -- attendu : public = true
--   select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'avatars:%';                                                                 -- lecture réservée à authenticated
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 1B
do $$
begin
  if coalesce(current_setting('baobab.arm', true), '') <> 'bloc1b' then
    raise exception 'BLOC 1B non armé : ne se joue que seul, après migration du client vers les URL signées';
  end if;
end $$;
update storage.buckets set public = false where id = 'avatars';
reset baobab.arm;
-- <<<
--
-- [CONTRÔLE APRÈS]
--   select id, public from storage.buckets where id = 'avatars';    -- attendu : public = false
--   Une URL publique ancienne (…/object/public/avatars/…) doit répondre 400/404 SANS compte.
--
-- [IMPACT APP] voir ci-dessus : tout l'affichage d'images doit passer par des URL signées AVANT ce bloc.
--
-- [RETOUR ARRIÈRE]
--| update storage.buckets set public = true where id = 'avatars';


-- ############################################################################
-- BLOC 2 — Fonctions SECURITY DEFINER : retirer EXECUTE à anon/PUBLIC, fixer search_path
-- ############################################################################
-- [OBJECTIF]
--   `revoke ... from public` ne retire PAS le droit direct que Supabase accorde par défaut à `anon` : une
--   fonction SECURITY DEFINER reste donc appelable par un visiteur sans compte (preuve du 20 oct. :
--   `admin_dashboard_stats` atteint son corps). Ce bloc, pour TOUTES les fonctions/procédures SECURITY DEFINER
--   du schéma public (hors extensions) :
--     - ajoute `set search_path = public, extensions, pg_temp` (ou `public, pg_temp` si le schéma extensions n'existe pas)
--       à celles qui n'en ont pas (contre le détournement par un schéma temporaire ; « extensions » est toujours inclus :
--       une fonction qui appelle sans préfixe unaccent, pgcrypto, pg_trgm ou postgis continue de les trouver) ;
--     - retire EXECUTE à PUBLIC et à `anon` ;
--     - conserve EXACTEMENT les droits de TOUS les autres rôles (authenticated, service_role, supabase_auth_admin,
--       supabase_functions_admin, dashboard_user, authenticator, supabase_storage_admin... : rien n'est ajouté ni retiré pour eux) ;
--     - ne touche pas aux fonctions dont le propriétaire est un autre rôle (ex. supabase_admin) ni à celles d'une extension :
--       elles sont journalisées (NOTICE) et le contrôle final les montrera si elles restent appelables par anon ;
--     - LISTE BLANCHE : les fonctions listées dans v_liste_blanche restent appelables par `anon` (+ authenticated).
--   Puis il règle les privilèges PAR DÉFAUT pour que toute FUTURE fonction ne soit plus appelable par anon/PUBLIC.
--
-- LISTE BLANCHE (déduite de TOUS les appels `supabase.rpc(` de src/, classés avant/après connexion) :
--   AVANT connexion (anon, clé publique) : public_user_count   (LandingPage.jsx:22 — compteur de la page d'accueil)
--   Hook d'inscription (appelé par le service Auth, pas par le client) : check_beta_whitelist -> supabase_auth_admin
--     (déjà réglé par supabase-security-definer-revoke-grant-audit-fix.sql ; ce bloc préserve ce droit)
--   APRÈS connexion (authenticated, jeton de session) : get_my_likers, get_liker_profile_reveal, unmatch_profile,
--     nearby_profiles, register_device_push_token, create_community, accept_invite, decline_invite,
--     accept_join_request, reject_join_request, create_event, join_event, accept_event_invitation,
--     decline_event_invitation, admin_dashboard_stats, admin_search_users, admin_list_reports,
--     admin_resolve_report, admin_list_feedback, admin_update_feedback, suspend_user, unsuspend_user,
--     ban_user, unban_user, grant_platform_role, revoke_platform_role, public_user_count (HomeHeader.jsx:21).
--   Aucune autre fonction n'est appelée avant la connexion (Auth.jsx n'utilise que supabase.auth.*).
--
-- [PRÉ-CONTRÔLE] (lecture seule)
--   -- 2.a  Fonctions SECURITY DEFINER du schéma public et ce que anon / authenticated peuvent exécuter
--   select p.oid::regprocedure as fonction,
--          has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
--          exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') as search_path_fixe
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
--   order by anon_exec desc, p.proname;
--
--   -- 2.b  Combien sont à corriger ?
--   select count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as appelables_par_anon,
--          count(*) filter (where not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) as sans_search_path,
--          count(*) as total_definer
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
--
--   -- 2.c  Privilèges par défaut actuels (futures fonctions)
--   select defaclrole::regrole as pour_le_role, defaclnamespace::regnamespace as schema, defaclobjtype as type, defaclacl
--   from pg_default_acl order by 1, 2;
--
--   -- 2.e  Trois pièges propres à Supabase (attendu : voir chaque commentaire) :
--   --      (i) un réglage PostgREST qui appelle une fonction AVANT chaque requête (si une fonction listée ici est révoquée à anon,
--   --          TOUTES les requêtes anonymes échouent) — attendu : aucune ligne mentionnant pre_request :
--   select coalesce(r.rolname, '(tous)') as role, s.setconfig from pg_db_role_setting s left join pg_roles r on r.oid = s.setrole
--   where array_to_string(s.setconfig, ',') ~* '(pre_request|pgrst)';
--   --      (ii) politiques lisibles par anon/PUBLIC dont la condition appelle une fonction SECURITY DEFINER du schéma public : pour un
--   --          anonyme, ces tables répondront 401 au lieu de [] (aucune donnée exposée ; attendu : aucune table que l'app lit AVANT connexion —
--   --          avant connexion l'app n'écrit que dans client_errors et n'appelle que public_user_count) :
--   select pol.tablename, pol.policyname, pol.cmd, pol.roles from pg_policies pol
--   where pol.schemaname = 'public' and ('public' = any (pol.roles) or 'anon' = any (pol.roles))
--     and exists (select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace
--                 where n.nspname = 'public' and f.prosecdef and f.proname <> 'public_user_count'
--                   and coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, '') ~ ('\m' || f.proname || '\s*\('))
--   order by 1, 2;
--   --      (iii) fonctions que ce rôle ne peut PAS modifier (propriétaire différent) : attendu : 0 ligne (sinon elles resteront appelables par anon) :
--   select p.oid::regprocedure as fonction, p.proowner::regrole as proprietaire from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef and not pg_has_role(current_user, p.proowner, 'USAGE');
--
--   -- 2.d  SAUVEGARDE des droits actuels sous forme de SQL (retour arrière exact) :
--   select format('grant execute on function %s to %s;', p.oid::regprocedure,
--            (select string_agg(quote_ident(r.rolname), ', ') from pg_roles r
--             where r.rolname in ('anon') and has_function_privilege(r.rolname, p.oid, 'EXECUTE'))) as sql_de_sauvegarde
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
--     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 2
-- Journal de sauvegarde (voir l'en-tête du fichier ; sans effet s'il existe déjà).
do $$
begin
  create table if not exists public.baobab_sql22_backup (
    seq bigint generated always as identity,
    bloc text not null,
    objet text not null,
    restore_sql text not null,
    taken_at timestamptz not null default now(),
    primary key (bloc, objet)
  );
  alter table public.baobab_sql22_backup enable row level security;
  revoke all on public.baobab_sql22_backup from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.baobab_sql22_backup from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.baobab_sql22_backup from authenticated; end if;
end $$;

do $$
declare
  v_liste_blanche text[] := array['public_user_count'];   -- appelables par anon
  v_roles_gardes  text[];   -- TOUS les rôles autres que anon (hors rôles internes pg_* et super-utilisateurs) : ce qu'ils pouvaient exécuter, ils le gardent
  r record;
  v_kind text;
  v_sig text;
  v_roles_avant text[];
  v_role text;
  v_sp text;
  v_restore text;
  v_anon_oid oid := (select oid from pg_roles where rolname = 'anon');
  v_ext boolean := exists (select 1 from pg_namespace where nspname = 'extensions');
  v_n_revoques int := 0;
  v_n_sp int := 0;
  v_n_echecs int := 0;
begin
  select coalesce(array_agg(rolname order by rolname), '{}') into v_roles_gardes
  from pg_roles where rolname <> 'anon' and rolname !~ '^pg_' and not rolsuper;

  for r in
    select p.oid, p.proname, p.prokind, p.proconfig, p.proowner, p.proacl,
           format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname, p.oid
  loop
    begin
      v_kind := case r.prokind when 'p' then 'procedure' else 'function' end;
      v_sig := r.sig;

      -- Fonction appartenant à un autre rôle (ex. supabase_admin) : on n'y touche pas (échec journalisé, le contrôle final la montrera).
      if not pg_has_role(current_user, r.proowner, 'USAGE') then
        v_n_echecs := v_n_echecs + 1;
        raise notice 'BLOC 2 : fonction % ignorée (propriétaire : %)', v_sig, r.proowner::regrole;
        continue;
      end if;

      -- (0) sauvegarde de l'état d'origine (première exécution seulement) : search_path, droits de PUBLIC et de anon
      v_restore := '';
      if not exists (select 1 from unnest(coalesce(r.proconfig, '{}')) c where c like 'search_path=%') then
        v_restore := format('alter %s %s reset search_path; ', v_kind, v_sig);
      end if;
      if exists (select 1 from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') then
        v_restore := v_restore || format('grant execute on %s %s to public; ', v_kind, v_sig);
      end if;
      if v_anon_oid is not null and exists (select 1 from aclexplode(coalesce(r.proacl, acldefault('f', r.proowner))) a where a.grantee = v_anon_oid and a.privilege_type = 'EXECUTE') then
        v_restore := v_restore || format('grant execute on %s %s to anon; ', v_kind, v_sig);
      end if;
      if v_restore <> '' then
        insert into public.baobab_sql22_backup (bloc, objet, restore_sql) values ('2', 'fonction:' || v_sig, v_restore) on conflict do nothing;
      end if;

      -- (a) search_path obligatoire. « extensions » est inclus dès que ce schéma existe : une fonction dont le corps appelle sans
      --     préfixe une fonction d'extension (unaccent, pgcrypto, pg_trgm, postgis...) continue de la trouver, détectée par un
      --     motif ou non ; seul le propriétaire de la base peut créer des objets dans ce schéma.
      if not exists (select 1 from unnest(coalesce(r.proconfig, '{}')) c where c like 'search_path=%') then
        v_sp := case when v_ext then 'public, extensions, pg_temp' else 'public, pg_temp' end;
        execute format('alter %s %s set search_path = %s', v_kind, v_sig, v_sp);
        v_n_sp := v_n_sp + 1;
      end if;

      -- (b) mémorise qui pouvait exécuter (hors anon / PUBLIC)
      v_roles_avant := '{}';
      foreach v_role in array v_roles_gardes loop
        if has_function_privilege(v_role, r.oid, 'EXECUTE') then
          v_roles_avant := v_roles_avant || v_role;
        end if;
      end loop;

      -- (c) retire anon et PUBLIC (sauf liste blanche : PUBLIC seulement, anon explicitement conservé)
      if r.proname = any (v_liste_blanche) then
        execute format('revoke all on %s %s from public', v_kind, v_sig);
        execute format('grant execute on %s %s to anon, authenticated', v_kind, v_sig);
      else
        execute format('revoke all on %s %s from public, anon', v_kind, v_sig);
      end if;

      -- (d) rend explicitement aux rôles gardés ce qu'ils tenaient peut-être de PUBLIC
      foreach v_role in array v_roles_avant loop
        execute format('grant execute on %s %s to %I', v_kind, v_sig, v_role);
      end loop;

      v_n_revoques := v_n_revoques + 1;
    exception when others then
      v_n_echecs := v_n_echecs + 1;
      raise notice 'BLOC 2 : fonction % ignorée (%)', r.proname, sqlerrm;
    end;
  end loop;
  raise notice 'BLOC 2 : % fonction(s) traitée(s), % search_path ajouté(s), % échec(s)', v_n_revoques, v_n_sp, v_n_echecs;
end $$;

-- Privilèges PAR DÉFAUT : une future fonction créée par `postgres` n'est plus exécutable par anon / PUBLIC.
-- (Pour exposer une future RPC à anon, il faudra un `grant execute ... to anon` explicite.)
-- Le retrait global de PUBLIC (seul moyen d'empêcher anon de recevoir EXECUTE par PUBLIC) vaut pour TOUT schéma ;
-- on rend donc explicitement ce que PUBLIC donnait avant, là où c'est nécessaire :
--   - public : authenticated et service_role (déjà le réglage de Supabase, rappelé au cas où il aurait été modifié) ;
--   - extensions : anon, authenticated, service_role (sinon une extension installée plus tard par `postgres`, ex. unaccent
--     ou pg_trgm (SQL-18), serait inutilisable par les comptes connectés : « permission denied for function »).
-- Les privilèges par défaut de `supabase_admin` ne sont PAS modifiés (les extensions activées depuis le tableau de bord
-- sont créées par ce rôle : un retrait global de PUBLIC les rendrait inutilisables).
do $$
begin
  begin
    alter default privileges for role postgres in schema public revoke execute on functions from anon;
  exception when others then raise notice 'BLOC 2 : default privileges (postgres, public, anon) : %', sqlerrm; end;
  begin
    alter default privileges for role postgres revoke execute on functions from public;
  exception when others then raise notice 'BLOC 2 : default privileges (postgres, public) : %', sqlerrm; end;
  begin
    alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;
  exception when others then raise notice 'BLOC 2 : default privileges (postgres, public, authenticated) : %', sqlerrm; end;
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    begin
      alter default privileges for role postgres in schema extensions grant execute on functions to anon, authenticated, service_role;
    exception when others then raise notice 'BLOC 2 : default privileges (postgres, extensions) : %', sqlerrm; end;
  end if;
  insert into public.baobab_sql22_backup (bloc, objet, restore_sql) values ('2', '00-privileges-par-defaut',
    'alter default privileges for role postgres in schema public grant execute on functions to anon; '
    || 'alter default privileges for role postgres grant execute on functions to public;')
  on conflict do nothing;
end $$;
-- <<<
--
-- [CONTRÔLE APRÈS]
--   -- Doit renvoyer UNIQUEMENT la liste blanche (public_user_count) : toute autre ligne est un échec.
--   select p.oid::regprocedure as fonction_encore_appelable_par_anon
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE')
--     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
--   -- Doit renvoyer 0 ligne (tout SECURITY DEFINER a un search_path) :
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.prosecdef
--     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
--     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
--   -- Sondes HTTP anonymes : POST /rest/v1/rpc/admin_dashboard_stats -> 401/403 AVANT le corps (plus de « Non autorise » P0001) ;
--   --                        POST /rest/v1/rpc/public_user_count -> 200 (la landing doit continuer d'afficher son compteur).
--   -- Test connecté : ouvrir l'app avec un compte de test (Découverte, messagerie, communautés, événements, admin si modérateur).
--
-- [IMPACT APP]
--   - Aucun changement de code : les 26 RPC appelées APRÈS connexion (hors public_user_count) gardent EXECUTE pour `authenticated` (droit préservé
--     fonction par fonction). Seul `public_user_count` est appelé avant connexion et reste dans la liste blanche.
--   - Les fonctions d'aide utilisées dans les politiques RLS (current_profile_id, can_view_event, is_community_member...)
--     sont évaluées avec le rôle de l'appelant : pour un ANONYME, une requête sur une table dont la politique les appelle
--     répond désormais 401 (permission denied for function) au lieu de `[]`. Aucune donnée n'est exposée dans les deux cas ;
--     les critères de sonde « anonyme = [] » du plan de lancement (S1) deviennent « anonyme = [] OU 401 ».
--   - Une session expirée dont le client retombe sur la clé publique (src/lib/sessionGuard.js) obtient 401 sur ces RPC :
--     c'était déjà le cas pour les tables.
--   - Les crons (pg_cron, rôle postgres), les triggers (pas de contrôle EXECUTE à l'exécution) et les edge functions
--     (service_role, droit préservé) ne sont pas touchés. Le hook d'inscription garde `supabase_auth_admin`.
--   - Avant connexion, l'app n'appelle que `public_user_count` (rpc) et n'écrit que dans `client_errors` (politique INSERT sans fonction) :
--     vérifié dans src/ (LandingPage, Auth, errorReporter). Le pré-contrôle 2.e(ii) liste les politiques que anon ne pourra plus évaluer.
--   - Piège connu : une extension installée PLUS TARD (SQL-18 : unaccent, pg_trgm) par `postgres` dans le schéma `extensions` reste
--     exécutable grâce aux privilèges par défaut ajoutés ci-dessus ; si l'une est créée par un autre rôle (tableau de bord), vérifier
--     avec : select has_function_privilege('authenticated', 'extensions.unaccent(text)', 'EXECUTE');
--   - Les fonctions SECURITY DEFINER qui n'avaient pas de search_path en prod sont inconnues du dépôt (le dépôt n'en a
--     aucune) : le pré-contrôle 2.a les liste ; relire leur corps si l'une d'elles appelle un objet d'un autre schéma.
--
-- [RETOUR ARRIÈRE]
--| -- Voie simple : rejoue la sauvegarde automatique du correctif (pour chaque fonction : droits de PUBLIC et de anon d'origine, retrait
--| -- du search_path ajouté ; puis privilèges par défaut). Les droits explicites que le correctif a donnés aux AUTRES rôles restent (sans effet nuisible) :
--| do $$ declare r record; begin if to_regclass('public.baobab_sql22_backup') is not null then
--|   for r in select restore_sql from public.baobab_sql22_backup where bloc = '2' order by seq loop
--|     begin execute r.restore_sql; exception when others then raise notice 'retour arrière bloc 2 : % (%)', r.restore_sql, sqlerrm; end;
--|   end loop; end if;
--| end $$;
--| -- Voie manuelle (si la sauvegarde est absente) : rejouer les lignes du pré-contrôle 2.d gardées en fichier, ou pour une fonction précise :
--| --   grant execute on function public.nom(args) to anon;      -- retirer un search_path : alter function public.nom(args) reset search_path;
--| alter default privileges for role postgres in schema public grant execute on functions to anon;
--| alter default privileges for role postgres grant execute on functions to public;


-- ############################################################################
-- BLOC 3A — fonction `get_my_profile()` (additif, préalable au bloc 3B)
-- ############################################################################
-- [OBJECTIF]
--   Permettre à un compte de lire SON PROPRE profil complet (toutes les colonnes, y compris birth_date, ban_reason,
--   notification_preferences...) sans passer par un `select("*")` direct sur la table — car le bloc 3B retirera
--   l'accès direct aux colonnes sensibles. Strictement additif : ne change aucun droit existant.
--
-- [PRÉ-CONTRÔLE]
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'get_my_profile';                   -- attendu : 0 ligne
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 3A
create or replace function public.get_my_profile()
returns setof public.profiles
language sql stable security definer
set search_path = public, pg_temp
as $$
  select * from public.profiles where user_id = auth.uid();
$$;
revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;
-- Demande à l'API de recharger son cache de schéma (sinon la fonction peut répondre « introuvable » quelques secondes ; sans danger).
notify pgrst, 'reload schema';
-- <<<
--
-- [CONTRÔLE APRÈS]
--   select has_function_privilege('anon', 'public.get_my_profile()', 'EXECUTE');            -- attendu : false
--   select has_function_privilege('authenticated', 'public.get_my_profile()', 'EXECUTE');   -- attendu : true
--   Test connecté (répétition) : supabase.rpc("get_my_profile").maybeSingle() renvoie MA ligne seulement (jamais celle d'un autre).
--
-- [IMPACT APP] aucun tant que le code client ne l'appelle pas. Le code client (src/lib/ownProfile.js) l'appelle avec repli
--   sur l'ancienne lecture directe si la fonction n'existe pas encore.
--
-- [RETOUR ARRIÈRE]
--| drop function if exists public.get_my_profile();


-- ############################################################################
-- BLOC 3B — colonnes sensibles de `profiles` : retrait du SELECT direct aux comptes connectés
-- ############################################################################
-- [OBJECTIF]
--   Aujourd'hui (supabase-scale-security.sql:63-66, `using (true)`) tout compte connecté peut lire, par un
--   `select=*` direct sur l'API, birth_date (date de naissance EXACTE), ban_reason, suspend_reason, report_count,
--   flagged_for_review, notification_preferences de TOUS les profils. La RLS filtre des LIGNES, pas des colonnes :
--   la seule parade minimale est le privilège SELECT PAR COLONNE. Ce bloc retire le SELECT de table à `authenticated`
--   et à `anon` sur `profiles`, puis le ré-accorde colonne par colonne SAUF pour les six colonnes sensibles.
--   Chacun lit son propre profil complet via get_my_profile() (bloc 3A, SECURITY DEFINER, ne renvoie que sa ligne).
--   Ce qui reste visible des autres : toutes les colonnes de OTHER_PROFILE_COLUMNS (src/lib/otherProfileColumns.js),
--   qui n'incluent déjà aucune des six.
--
-- >>> À EXÉCUTER UNIQUEMENT APRÈS le déploiement du code client qui n'utilise plus `select("*")` / `.select()`
-- >>> sur `profiles` (voir [IMPACT APP]) : sinon l'app répond « permission denied for table profiles ».
--
-- PIÈGE : `select *` s'étend à toutes les colonnes ; dès qu'une seule est interdite, la requête entière échoue (42501).
-- PIÈGE : toute colonne AJOUTÉE plus tard à `profiles` (SQL du dépôt joué après ce bloc, ex. un futur `alter table profiles add column`)
--         n'est pas lisible par les comptes connectés tant qu'on n'a pas exécuté `grant select (nouvelle_colonne) on public.profiles to authenticated;`
--         OU rejoué ce correctif 3B (idempotent : il recalcule la liste de toutes les colonnes existantes sauf les six). Jouer d'abord TOUS les SQL
--         qui ajoutent des colonnes à profiles (SQL-1 à SQL-15 : LANCEMENT.md), puis seulement 3B. Après chaque SQL ajoutant une colonne à profiles :
--         la requête 3.f ci-dessous doit rendre exactement les six colonnes sensibles.
--
-- [PRÉ-CONTRÔLE]
--   -- 3.a  Colonnes de profiles
--   select attname from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped order by attnum;
--   -- 3.b  Existe-t-il des colonnes sensibles inconnues du dépôt ? (cherche aussi : email, phone, address, ip...)
--   select attname from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
--     and attname ~* '(email|phone|tel|address|adresse|ip|birth|naiss|ssn|reason|report|flag|token|secret|note)' order by 1;
--   -- 3.c  Politiques ou fonctions NON-DEFINER qui lisent une colonne sensible (elles casseraient au 3B ; attendu : 0 ligne)
--   select 'policy' as type, tablename || ' / ' || policyname as objet from pg_policies
--     where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~* '(birth_date|ban_reason|suspend_reason|report_count|flagged_for_review|notification_preferences)'
--   union all
--   select 'fonction invoker', p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f'
--       and p.prosrc ~* '(birth_date|ban_reason|suspend_reason|report_count|flagged_for_review|notification_preferences)'
--   union all
--   select 'vue', schemaname || '.' || viewname from pg_views where schemaname = 'public'
--     and definition ~* '(birth_date|ban_reason|suspend_reason|report_count|flagged_for_review|notification_preferences)';
--   -- 3.c2 Fonctions NON-DEFINER qui lisent TOUTES les colonnes de profiles (`select *`, `p.*`, to_jsonb(p.*)) : elles casseraient au 3B (attendu : 0 ligne)
--   select p.oid::regprocedure as fonction_invoker_select_etoile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and not p.prosecdef and p.prokind = 'f' and p.prosrc ~* 'profiles' and p.prosrc ~* '(\.\*|select\s+\*)';
--   -- 3.d  Privilèges actuels sur la table
--   select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'profiles' order by 1, 2;
--   -- 3.e  Colonnes lues par le client chez autrui (OTHER_PROFILE_COLUMNS) ABSENTES de la table (attendu : 0 ligne ; sinon le client échoue déjà)
--   select c as colonne_du_client_absente from unnest(array[
--     'id', 'name', 'age', 'city', 'country', 'languages', 'arrived_since', 'looking_for', 'bio', 'created_at',
--     'avatar_url', 'cover_url', 'occupation', 'education_level', 'interests', 'is_online', 'last_seen',
--     'show_online_status', 'email_verified', 'phone_verified', 'is_founder', 'is_premium', 'show_birth_year',
--     'show_city', 'show_country', 'show_occupation', 'show_studies', 'show_canada_journey', 'show_life_project',
--     'show_interests', 'immigration_status', 'arrival_city', 'languages_detail', 'relationship_values',
--     'wants_children', 'family_importance', 'career_goal', 'geographic_openness', 'personality_evening',
--     'personality_travel', 'relationship_needs', 'dating_enabled', 'banned_at', 'suspended_until',
--     'onboarding_completed_at', 'deletion_requested_at'
--   ]) c where not exists (select 1 from pg_attribute where attrelid = 'public.profiles'::regclass and attname = c and attnum > 0 and not attisdropped);
--   -- 3.f  Colonnes que les comptes connectés NE peuvent PAS lire (avant le correctif : 0 ligne ; APRÈS : exactement les six sensibles)
--   select attname as colonne_illisible from pg_attribute
--     where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
--       and not has_column_privilege('authenticated', attrelid, attnum, 'SELECT') order by 1;
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 3B
-- Journal de sauvegarde (voir l'en-tête du fichier ; sans effet s'il existe déjà).
do $$
begin
  create table if not exists public.baobab_sql22_backup (
    seq bigint generated always as identity,
    bloc text not null,
    objet text not null,
    restore_sql text not null,
    taken_at timestamptz not null default now(),
    primary key (bloc, objet)
  );
  alter table public.baobab_sql22_backup enable row level security;
  revoke all on public.baobab_sql22_backup from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.baobab_sql22_backup from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.baobab_sql22_backup from authenticated; end if;
end $$;

do $$
declare
  v_sensibles text[] := array['birth_date','ban_reason','suspend_reason','report_count','flagged_for_review','notification_preferences'];
  v_cols text;
  v_n_illisibles int;
  v_n_attendus int;
  r record;
begin
  if coalesce(current_setting('baobab.arm', true), '') <> 'bloc3b' then
    raise exception 'BLOC 3B non armé : ne se joue que seul, après déploiement du code client (get_my_profile)';
  end if;
  if to_regprocedure('public.get_my_profile()') is null then
    raise exception 'BLOC 3B : jouer d''abord le bloc 3A (get_my_profile)';
  end if;
  -- Sauvegarde du droit de lecture de table d'origine (première exécution seulement).
  for r in select v.nom, v.oid from (values ('authenticated', (select oid from pg_roles where rolname = 'authenticated')),
                                            ('anon', (select oid from pg_roles where rolname = 'anon')), ('public', 0::oid)) v(nom, oid) where v.oid is not null loop
    if exists (select 1 from pg_class c, lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
               where c.oid = 'public.profiles'::regclass and a.grantee = r.oid and a.privilege_type = 'SELECT') then
      insert into public.baobab_sql22_backup (bloc, objet, restore_sql)
      values ('3B', 'droit-lecture-table:' || r.nom, format('grant select on public.profiles to %s;', r.nom)) on conflict do nothing;
    end if;
  end loop;
  -- Toutes les colonnes EXISTANT AU MOMENT DE L'EXÉCUTION sauf les six sensibles (donc aucune colonne connue n'est oubliée).
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
  from pg_attribute
  where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped and attname <> all (v_sensibles);
  if v_cols is null then raise exception 'BLOC 3B : aucune colonne lisible calculée (table profiles inattendue)'; end if;
  execute 'revoke select on public.profiles from authenticated, anon, public';
  execute format('grant select (%s) on public.profiles to authenticated', v_cols);
  -- Vérification interne : exactement les colonnes sensibles EXISTANTES sont devenues illisibles, rien d'autre ; sinon tout est annulé.
  select count(*) into v_n_illisibles from pg_attribute
  where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
    and not has_column_privilege('authenticated', attrelid, attnum, 'SELECT');
  select count(*) into v_n_attendus from pg_attribute
  where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped and attname = any (v_sensibles);
  if v_n_illisibles <> v_n_attendus
     or not has_column_privilege('authenticated', 'public.profiles', 'id', 'SELECT')
     or not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'SELECT') then
    raise exception 'BLOC 3B : vérification interne échouée (% colonne(s) illisible(s), % attendue(s)) : rien n''est appliqué', v_n_illisibles, v_n_attendus;
  end if;
end $$;
reset baobab.arm;
-- <<<
--
-- [CONTRÔLE APRÈS]
--   select has_column_privilege('authenticated', 'public.profiles', c, 'SELECT') as lisible, c as colonne
--   from unnest(array['birth_date','ban_reason','suspend_reason','report_count','flagged_for_review','notification_preferences',
--                     'id','name','avatar_url','age','banned_at']) c;
--       -- attendu : false pour les six premières, true pour les cinq dernières
--   select has_table_privilege('anon', 'public.profiles', 'SELECT');     -- attendu : false
--   select attname as colonne_illisible from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped
--     and not has_column_privilege('authenticated', attrelid, attnum, 'SELECT') order by 1;    -- attendu : EXACTEMENT les six colonnes sensibles, rien d'autre
--   Test à deux comptes (S2 du plan) : avec le jeton de A, GET /rest/v1/profiles?select=*&id=eq.<B> -> 401/403 (permission denied) ;
--   GET /rest/v1/profiles?select=id,name,age,avatar_url&id=eq.<B> -> 200 ; POST /rest/v1/rpc/get_my_profile -> MA ligne complète.
--
-- [IMPACT APP] (analyse exacte)
--   Le client lit-il birth_date/ban_reason... d'AUTRUI ? NON : tous les chargements de profils tiers utilisent
--   OTHER_PROFILE_COLUMNS (initialLoad.js:148, App.jsx:3315, SocialShell.jsx:1484,1540,1721,2135) ou une liste explicite
--   (SocialShell.jsx:436,649,684 ; EventsTab.jsx:347 ; embeds `profiles(...)` de CommunitiesTab/EventsTab) : aucune des six.
--   Le client lit-il les siennes ? OUI, par `select("*")` direct et par le RETURNING de `.update().select()` / `.insert().select()`.
--   Ces 9 sites ont DÉJÀ été migrés vers src/lib/ownProfile.js (readOwnProfile / updateOwnProfile / insertOwnProfile) :
--     - src/lib/initialLoad.js (fetchOwnProfile)     - src/App.jsx (retour de session, handleSaveProfile)
--     - src/screens/onboarding/OnboardingWizard.jsx (étapes 1 à 10, « terminer plus tard »)
--   Comportement du code : requêtes IDENTIQUES à avant tant que ce bloc n'est pas joué ; dès qu'une requête répond 42501, bascule sur
--   get_my_profile() (bloc 3A) et le mémorise dans le navigateur. Il FAUT donc avoir déployé ce code avant de jouer 3B ; un test de CI
--   (src/lib/ownProfile.test.js) interdit de réintroduire un select("*") direct sur profiles. Une session déjà ouverte avec l'ANCIEN
--   bundle (onglet resté ouvert) verra l'erreur 42501 jusqu'au rechargement : prévoir de jouer 3B hors heures de pointe.
--   (un `.select()` après insert/update = RETURNING de toutes les colonnes : même échec sans ce code.)
--   Les écritures (update/insert sans retour) ne sont pas touchées : seul le droit de LECTURE change.
--   Le filtre `.eq("user_id", ...)` reste possible (user_id n'est pas retiré).
--   Les RPC SECURITY DEFINER admin_*/nearby_profiles/get_my_likers lisent la table avec les droits du propriétaire : inchangé.
--   Les edge functions (service_role) : inchangé.
--
-- [RETOUR ARRIÈRE]
--| -- Voie simple : rejoue la sauvegarde automatique (droits de lecture de table d'origine) :
--| do $$ declare r record; begin if to_regclass('public.baobab_sql22_backup') is not null then
--|   for r in select restore_sql from public.baobab_sql22_backup where bloc = '3B' order by seq loop execute r.restore_sql; end loop; end if;
--| end $$;
--| -- Voie manuelle :
--| grant select on public.profiles to authenticated;
--| -- si le pré-contrôle 3.d montrait que anon avait ce droit (la voie simple le rétablit déjà) : grant select on public.profiles to anon;


-- ############################################################################
-- BLOC 4A — Realtime : événements DELETE de `blocks` et `passes`
-- ############################################################################
-- [OBJECTIF]
--   Documentation Supabase (guides/realtime/postgres-changes) : « RLS policies are not applied to DELETE statements ».
--   Les événements INSERT/UPDATE sont filtrés par la RLS ; les DELETE ne le sont pas. Avec `replica identity full`
--   (posée par supabase-follows-favorites-blocks-passes-realtime-fix.sql sur blocks, passes, favorites, follows, et par
--   supabase-likes-realtime-replica-identity-fix.sql sur likes), l'événement DELETE embarque la LIGNE ENTIÈRE
--   (from_id, to_id, created_at) : un abonné qui n'est pas concerné peut, en principe, voir « A a débloqué B »
--   ou « A a retiré sa passe sur B ». Les blocages sont l'information la plus sensible de ce lot.
--   Correctif minimal : remettre `replica identity default` sur `blocks` et `passes` : l'événement DELETE ne porte plus
--   que la clé primaire (id, un uuid sans signification). Les filtres `from_id=eq.moi` sur DELETE ne correspondent plus
--   -> les écouteurs DELETE du client deviennent inertes (aucune erreur : voir le commentaire du fichier d'origine).
--   Même constat, moins grave, pour `message_reactions` (clé primaire composite message_id + profile_id + emoji : un DELETE expose
--   ces trois valeurs) : risque accepté, non traité ici.
--   NON VÉRIFIÉ : si un abonné anonyme/non concerné reçoit réellement ces DELETE, et si Realtime exige le droit SELECT
--   sur la table pour s'abonner : à tester à deux comptes sur le projet de répétition (procédure dans LANCEMENT.md).
--
-- [PRÉ-CONTRÔLE]
--   select c.relname, case c.relreplident when 'd' then 'default (clé primaire)' when 'f' then 'FULL (ligne entière)'
--          when 'n' then 'nothing' else 'index' end as replica_identity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname in ('likes','passes','blocks','favorites','follows','messages','message_reactions');
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;    -- tables diffusées
--   -- Clé primaire OBLIGATOIRE (sans elle, `replica identity default` interdit tout DELETE/UPDATE sur une table publiée : le
--   -- correctif refuse alors de s'exécuter). Attendu : une ligne par table, a_cle_primaire = true :
--   select c.relname, exists (select 1 from pg_index i where i.indrelid = c.oid and i.indisprimary) as a_cle_primaire
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relname in ('blocks','passes','likes','follows','favorites') order by 1;
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 4A
-- Journal de sauvegarde (voir l'en-tête du fichier ; sans effet s'il existe déjà).
do $$
begin
  create table if not exists public.baobab_sql22_backup (
    seq bigint generated always as identity,
    bloc text not null,
    objet text not null,
    restore_sql text not null,
    taken_at timestamptz not null default now(),
    primary key (bloc, objet)
  );
  alter table public.baobab_sql22_backup enable row level security;
  revoke all on public.baobab_sql22_backup from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.baobab_sql22_backup from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.baobab_sql22_backup from authenticated; end if;
end $$;

do $$
declare t text; v_oid regclass; v_ident "char"; v_idx text;
begin
  foreach t in array array['blocks','passes'] loop
    v_oid := to_regclass('public.' || t);
    if v_oid is not null then
      -- Garde : sans clé primaire, `replica identity default` interdit TOUT delete/update sur une table publiée par Realtime
      -- (erreur 55000) : on s'arrête avant de rien modifier.
      if not exists (select 1 from pg_index where indrelid = v_oid and indisprimary) then
        raise exception 'BLOC 4A : public.% n''a pas de clé primaire : replica identity default empêcherait tout DELETE/UPDATE. Rien n''est appliqué.', t;
      end if;
      select relreplident into v_ident from pg_class where oid = v_oid;
      if v_ident <> 'd' then
        select quote_ident(i.relname) into v_idx from pg_index x join pg_class i on i.oid = x.indexrelid where x.indrelid = v_oid and x.indisreplident;
        insert into public.baobab_sql22_backup (bloc, objet, restore_sql)
        values ('4A', 'replica:' || t, format('alter table public.%I replica identity %s;', t,
                case v_ident when 'f' then 'full' when 'n' then 'nothing' else 'using index ' || coalesce(v_idx, 'full') end))
        on conflict do nothing;
        execute format('alter table public.%I replica identity default', t);
      end if;
    end if;
  end loop;
end $$;
-- <<<
--
-- [CONTRÔLE APRÈS]
--   -- relancer le pré-contrôle : blocks et passes -> « default (clé primaire) » ; likes/follows/favorites inchangés (FULL).
--
-- [IMPACT APP]
--   - src/App.jsx (canal « blocks-passes-own », ~3300-3380) : les écouteurs DELETE sur blocks (from_id=moi, to_id=moi)
--     ne reçoivent plus d'événement. Conséquence : un blocage retiré (ou un déblocage fait par l'autre personne) n'est plus
--     répercuté EN DIRECT sur mes autres onglets/appareils ; il l'est au prochain rechargement ou resync réseau
--     (resyncSocialGraph). Les INSERT (nouveau blocage, nouvelle passe) continuent d'être livrés en direct, filtrés par la RLS.
--   - Aucun écouteur DELETE n'existe sur `passes`. Aucune erreur, aucun changement de code.
--   - Vérifié dans le code (revue du 28 oct.) : les deux écouteurs DELETE de blocks lisent `payload.old.to_id` / `payload.old.from_id`.
--     Si Realtime livrait quand même l'événement (sans filtre), ces champs seraient `undefined` : les filtres de état (`filter(pair => ...)`)
--     ne retirent alors rien et ne lèvent aucune erreur. La documentation Supabase dit que les DELETE ne sont filtrables que si la table
--     est en `replica identity full` : avec `default`, le filtre `from_id=eq.moi` ne livre simplement plus l'événement.
--     Effet visible : si A débloque B, B garde A masqué (Découverte, conversation) jusqu'à son prochain rechargement : dégradation
--     côté « prudent » (masquage de trop, jamais de fuite).
--   - Sans clé primaire, ce bloc refuserait de s'exécuter (voir le pré-contrôle) : `blocks` a été créée à la main en production.
--
-- [RETOUR ARRIÈRE]
--| -- Voie simple : rejoue la sauvegarde automatique (valeur d'origine de replica identity de chaque table) :
--| do $$ declare r record; begin if to_regclass('public.baobab_sql22_backup') is not null then
--|   for r in select restore_sql from public.baobab_sql22_backup where bloc = '4A' order by seq loop execute r.restore_sql; end loop; end if;
--| end $$;
--| -- Voie manuelle :
--| alter table public.blocks replica identity full;
--| alter table public.passes replica identity full;


-- ############################################################################
-- BLOC 4B — OPTIONNEL : même mesure pour `likes`, `follows`, `favorites`
-- ############################################################################
-- [OBJECTIF] Voir 4A. Moins sensible (aimer / suivre / mettre en favori est visible dans l'app) mais l'événement DELETE
--   révèle quand un lien est retiré. Recommandation : NE PAS appliquer pour le 15 novembre (voir LANCEMENT.md : risque
--   accepté et justifié) ; à appliquer si le test de répétition montre qu'un abonné non concerné reçoit ces DELETE.
--   Perte fonctionnelle assumée : le retrait d'un like / abonnement / favori n'est plus répercuté en direct sur mes autres
--   appareils (supabase-likes-realtime-replica-identity-fix.sql) ni sur le badge « personnes qui m'ont aimé » (App.jsx,
--   canal « likes-received »), jusqu'au rechargement ou au resync réseau.
-- [PRÉ-CONTRÔLE] celui du bloc 4A.
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 4B
-- Journal de sauvegarde (voir l'en-tête du fichier ; sans effet s'il existe déjà).
do $$
begin
  create table if not exists public.baobab_sql22_backup (
    seq bigint generated always as identity,
    bloc text not null,
    objet text not null,
    restore_sql text not null,
    taken_at timestamptz not null default now(),
    primary key (bloc, objet)
  );
  alter table public.baobab_sql22_backup enable row level security;
  revoke all on public.baobab_sql22_backup from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.baobab_sql22_backup from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.baobab_sql22_backup from authenticated; end if;
end $$;

do $$
declare t text; v_oid regclass; v_ident "char"; v_idx text;
begin
  if coalesce(current_setting('baobab.arm', true), '') <> 'bloc4b' then
    raise exception 'BLOC 4B non armé : optionnel, se joue seul';
  end if;
  foreach t in array array['likes','follows','favorites'] loop
    v_oid := to_regclass('public.' || t);
    if v_oid is not null then
      if not exists (select 1 from pg_index where indrelid = v_oid and indisprimary) then
        raise exception 'BLOC 4B : public.% n''a pas de clé primaire : replica identity default empêcherait tout DELETE/UPDATE. Rien n''est appliqué.', t;
      end if;
      select relreplident into v_ident from pg_class where oid = v_oid;
      if v_ident <> 'd' then
        select quote_ident(i.relname) into v_idx from pg_index x join pg_class i on i.oid = x.indexrelid where x.indrelid = v_oid and x.indisreplident;
        insert into public.baobab_sql22_backup (bloc, objet, restore_sql)
        values ('4B', 'replica:' || t, format('alter table public.%I replica identity %s;', t,
                case v_ident when 'f' then 'full' when 'n' then 'nothing' else 'using index ' || coalesce(v_idx, 'full') end))
        on conflict do nothing;
        execute format('alter table public.%I replica identity default', t);
      end if;
    end if;
  end loop;
end $$;
reset baobab.arm;
-- <<<
-- [CONTRÔLE APRÈS] relancer le pré-contrôle : likes, follows, favorites -> « default (clé primaire) ».
-- [IMPACT APP] voir [OBJECTIF] ; aucun changement de code, aucune erreur.
-- [RETOUR ARRIÈRE]
--| do $$ declare r record; begin if to_regclass('public.baobab_sql22_backup') is not null then
--|   for r in select restore_sql from public.baobab_sql22_backup where bloc = '4B' order by seq loop execute r.restore_sql; end loop; end if;
--| end $$;
--| alter table public.likes replica identity full;
--| alter table public.follows replica identity full;
--| alter table public.favorites replica identity full;
-- ============================================================================
-- Fin de supabase-close-read-leaks.sql
-- ============================================================================
