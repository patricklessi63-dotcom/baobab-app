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
--   --      Copie tout le résultat dans un fichier hors dépôt : c'est le retour arrière.
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
--     - ajoute `set search_path = public, pg_temp` à celles qui n'en ont pas (contre le détournement par un
--       schéma temporaire ; `public, extensions, pg_temp` si le corps appelle une fonction d'extension non qualifiée) ;
--     - retire EXECUTE à PUBLIC et à `anon` ;
--     - conserve EXACTEMENT les droits qu'avaient `authenticated`, `service_role`, `supabase_auth_admin`,
--       `supabase_functions_admin` et `dashboard_user` (rien n'est ajouté ni retiré pour eux) ;
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
do $$
declare
  v_liste_blanche text[] := array['public_user_count'];   -- appelables par anon
  v_roles_gardes  text[] := array['authenticated','service_role','supabase_auth_admin','supabase_functions_admin','dashboard_user'];
  r record;
  v_kind text;
  v_sig text;
  v_roles_avant text[];
  v_role text;
  v_sp text;
  v_ext boolean := exists (select 1 from pg_namespace where nspname = 'extensions');
  v_n_revoques int := 0;
  v_n_sp int := 0;
  v_n_echecs int := 0;
begin
  for r in
    select p.oid, p.proname, p.prokind, p.proconfig, p.prosrc
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    order by p.proname, p.oid
  loop
    begin
      v_kind := case r.prokind when 'p' then 'procedure' else 'function' end;
      v_sig := r.oid::regprocedure::text;

      -- (a) search_path obligatoire
      if not exists (select 1 from unnest(coalesce(r.proconfig, '{}')) c where c like 'search_path=%') then
        v_sp := case
          when v_ext and r.prosrc ~* '\m(unaccent|gen_random_bytes|digest|crypt|gen_salt|hmac|uuid_generate_v[0-9a-z]+|similarity|word_similarity|pgp_[a-z_]+)\s*\('
            then 'public, extensions, pg_temp'
          else 'public, pg_temp' end;
        execute format('alter %s %s set search_path = %s', v_kind, v_sig, v_sp);
        v_n_sp := v_n_sp + 1;
      end if;

      -- (b) mémorise qui pouvait exécuter (hors anon / PUBLIC)
      v_roles_avant := '{}';
      foreach v_role in array v_roles_gardes loop
        -- (test explicite : SQL ne garantit pas l'ordre d'évaluation d'un AND, d'où la boucle)
        if exists (select 1 from pg_roles where rolname = v_role) then
          if has_function_privilege(v_role, r.oid, 'EXECUTE') then
            v_roles_avant := v_roles_avant || v_role;
          end if;
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
do $$
begin
  begin
    alter default privileges for role postgres in schema public revoke execute on functions from anon;
  exception when others then raise notice 'BLOC 2 : default privileges (postgres, public, anon) : %', sqlerrm; end;
  begin
    alter default privileges for role postgres revoke execute on functions from public;
  exception when others then raise notice 'BLOC 2 : default privileges (postgres, public) : %', sqlerrm; end;
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    begin
      alter default privileges for role supabase_admin in schema public revoke execute on functions from anon;
      alter default privileges for role supabase_admin revoke execute on functions from public;
    exception when others then raise notice 'BLOC 2 : default privileges (supabase_admin) ignorés : %', sqlerrm; end;
  end if;
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
--   - Les fonctions SECURITY DEFINER qui n'avaient pas de search_path en prod sont inconnues du dépôt (le dépôt n'en a
--     aucune) : le pré-contrôle 2.a les liste ; relire leur corps si l'une d'elles appelle un objet d'un autre schéma.
--
-- [RETOUR ARRIÈRE]
--| -- Rendre anon exécutable sur tout ce qui l'était (rejouer les lignes du pré-contrôle 2.d, gardées en fichier ; le droit PUBLIC n'est pas
--| -- restitué, ce qui est équivalent pour anon) ;
--| -- ou, pour une fonction précise : grant execute on function public.nom(args) to anon;
--| -- Retirer un search_path : alter function public.nom(args) reset search_path;
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
-- PIÈGE : toute colonne AJOUTÉE plus tard à `profiles` n'est pas lisible tant qu'on n'a pas exécuté
--         `grant select (nouvelle_colonne) on public.profiles to authenticated;`
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
--   -- 3.d  Privilèges actuels sur la table
--   select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'profiles' order by 1, 2;
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 3B
do $$
declare
  v_sensibles text[] := array['birth_date','ban_reason','suspend_reason','report_count','flagged_for_review','notification_preferences'];
  v_cols text;
begin
  if coalesce(current_setting('baobab.arm', true), '') <> 'bloc3b' then
    raise exception 'BLOC 3B non armé : ne se joue que seul, après déploiement du code client (get_my_profile)';
  end if;
  if to_regprocedure('public.get_my_profile()') is null then
    raise exception 'BLOC 3B : jouer d''abord le bloc 3A (get_my_profile)';
  end if;
  select string_agg(quote_ident(attname), ', ' order by attnum) into v_cols
  from pg_attribute
  where attrelid = 'public.profiles'::regclass and attnum > 0 and not attisdropped and attname <> all (v_sensibles);
  execute 'revoke select on public.profiles from authenticated, anon';
  execute format('grant select (%s) on public.profiles to authenticated', v_cols);
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
--| grant select on public.profiles to authenticated;
--| grant select on public.profiles to anon;      -- seulement si le pré-contrôle 3.d montrait que anon l'avait


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
--
-- [CORRECTIF]
-- >>> CORRECTIF BLOC 4A
do $$
begin
  if to_regclass('public.blocks') is not null then
    execute 'alter table public.blocks replica identity default';
  end if;
  if to_regclass('public.passes') is not null then
    execute 'alter table public.passes replica identity default';
  end if;
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
--
-- [RETOUR ARRIÈRE]
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
do $$
declare t text;
begin
  if coalesce(current_setting('baobab.arm', true), '') <> 'bloc4b' then
    raise exception 'BLOC 4B non armé : optionnel, se joue seul';
  end if;
  foreach t in array array['likes','follows','favorites'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I replica identity default', t);
    end if;
  end loop;
end $$;
reset baobab.arm;
-- <<<
-- [CONTRÔLE APRÈS] relancer le pré-contrôle : likes, follows, favorites -> « default (clé primaire) ».
-- [IMPACT APP] voir [OBJECTIF] ; aucun changement de code, aucune erreur.
-- [RETOUR ARRIÈRE]
--| alter table public.likes replica identity full;
--| alter table public.follows replica identity full;
--| alter table public.favorites replica identity full;
-- ============================================================================
-- Fin de supabase-close-read-leaks.sql
-- ============================================================================
