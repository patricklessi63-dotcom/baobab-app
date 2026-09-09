-- ============================================================================
-- Correctif : deux erreurs console en production, causes CONFIRMÉES par un
-- test en conditions réelles (vrai compte créé via le flux d'inscription
-- normal, onboarding jusqu'au bout, contre la vraie base de prod
-- vozehymbihnckzklxesw.supabase.co — pas une hypothèse cette fois).
--
-- 1) GET/POST .../user_locations?select=* → 400
--    Message PostgREST exact observé :
--      {"code":"PGRST204","details":null,"hint":null,
--       "message":"Could not find the 'last_in_canada_at' column of
--       'user_locations' in the schema cache"}
--    Origine : src/App.jsx appelle upsertMyLocation({ last_in_canada_at: ... })
--    (garde-fou "Canada" du module Rencontres, voir supabase-canada-gate.sql)
--    mais PostgREST ne voit pas cette colonne dans son cache de schéma —
--    soit parce que supabase-canada-gate.sql n'a en réalité jamais été
--    exécuté sur cette base de production, soit parce qu'il l'a été mais
--    que le cache de schéma de PostgREST n'a jamais été rafraîchi depuis
--    (arrive parfois avec du DDL passé par certains clients SQL). Impact
--    réel au-delà du bruit console : le garde-fou de période de grâce
--    "hors Canada" (discoverGateBlocked, src/App.jsx) ne peut jamais
--    enregistrer last_in_canada_at, donc ne fonctionne jamais tel que conçu.
--
-- 2) RPC get_my_likers() → 404
--    Message PostgREST exact observé :
--      {"code":"PGRST202","details":"Searched for the function
--       public.get_my_likers without parameters, but no matches were found
--       in the schema cache.","hint":"Perhaps you meant to call the function
--       public.get_message_quota","message":"Could not find the function
--       public.get_my_likers without parameters in the schema cache"}
--    Origine : supabase-premium-admirers-reveal-fix.sql définit cette
--    fonction, appelée par TOUT compte connecté ayant un profil (loadAll(),
--    src/App.jsx) — même cause probable que ci-dessus (jamais exécuté en
--    prod, ou cache non rafraîchi). Impact réel : avant le correctif
--    apporté au même commit à src/App.jsx (le throw sur likerRes.error
--    faisait échouer TOUT loadAll()), cette seule RPC manquante empêchait le
--    chargement des profils/likes/passes/blocages/photos pour tout le monde
--    et affichait le bandeau "Impossible de charger les données. Réessaie."
--
-- Ce fichier réapplique les deux correctifs (idempotents dans leurs fichiers
-- d'origine — add column if not exists / create or replace function) et
-- force explicitement un rechargement du cache de schéma PostgREST, pour
-- couvrir les deux causes possibles à la fois. Sans risque à exécuter même
-- si supabase-canada-gate.sql et supabase-premium-admirers-reveal-fix.sql
-- ont déjà été appliqués avec succès.
-- À exécuter dans Supabase : SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne last_in_canada_at (identique à supabase-canada-gate.sql)
-- ----------------------------------------------------------------------------
alter table public.user_locations add column if not exists last_in_canada_at timestamptz;

update public.user_locations set last_in_canada_at = now() where last_in_canada_at is null;

-- ----------------------------------------------------------------------------
-- 2. Fonctions get_my_likers() / get_liker_profile_reveal() (identique à
-- supabase-premium-admirers-reveal-fix.sql) — prérequis : is_premium() et
-- current_profile_id() (supabase-premium.sql / supabase-communities.sql).
-- ----------------------------------------------------------------------------
create or replace function get_my_likers()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
  v_premium boolean;
  v_likers jsonb;
  v_admirers_count int;
begin
  if v_me is null then
    return jsonb_build_object('likers', '[]'::jsonb, 'admirers_count', 0);
  end if;

  v_premium := is_premium(v_me);

  select coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
  into v_likers
  from likes l
  join profiles p on p.id = l.from_id
  where l.to_id = v_me
    and (
      v_premium
      or exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id)
    );

  select count(*) into v_admirers_count
  from likes l
  where l.to_id = v_me
    and not exists (select 1 from likes m where m.from_id = v_me and m.to_id = l.from_id);

  return jsonb_build_object('likers', v_likers, 'admirers_count', v_admirers_count);
end;
$$;

grant execute on function get_my_likers() to authenticated;

create or replace function get_liker_profile_reveal(p_from_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := current_profile_id();
begin
  if v_me is null or p_from_id is null then
    return null;
  end if;

  if not exists (select 1 from likes where from_id = p_from_id and to_id = v_me) then
    return null;
  end if;

  if is_premium(v_me) or exists (select 1 from likes where from_id = v_me and to_id = p_from_id) then
    return (select to_jsonb(p.*) from profiles p where p.id = p_from_id);
  end if;

  return null;
end;
$$;

grant execute on function get_liker_profile_reveal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Rechargement explicite du cache de schéma PostgREST — normalement
-- automatique après du DDL exécuté depuis le SQL Editor (event trigger
-- Supabase), mais sans effet indésirable si redondant. C'est la seule étape
-- de ce fichier qui a un sens si les deux blocs ci-dessus étaient déjà
-- appliqués avec succès mais que le cache n'avait simplement jamais suivi.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'user_locations'
--   and column_name = 'last_in_canada_at';
-- select proname from pg_proc where proname in ('get_my_likers', 'get_liker_profile_reveal');
-- select get_my_likers(); -- en tant qu'utilisateur connecté, via l'API PostgREST/RPC
-- ============================================================================
