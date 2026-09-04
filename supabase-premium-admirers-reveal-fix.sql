-- ============================================================================
-- Correctif : "Qui m'a aimé" (avantage Premium) n'était protégé QUE côté
-- affichage, jamais côté serveur — même famille de bug que l'audit
-- "client vs serveur" mené sur les statuts de compte (banni/suspendu/
-- onboarding incomplet/suppression en attente), appliquée ici au Premium.
--
-- Constat (src/App.jsx, loadAll) :
--   supabase.from("likes").select("from_id, profile:from_id(*)").eq("to_id", myProfileId)
-- renvoie le PROFIL COMPLET (nom, photo, ville, âge, bio...) de TOUT LE
-- MONDE qui a liké l'utilisateur courant, peu importe son statut Premium.
-- AdmirersModal.jsx se contente ensuite d'afficher un Paywall à la place de
-- la liste si !isPremium — mais la donnée elle-même a déjà transité en
-- clair dans la réponse réseau (visible depuis l'onglet Réseau du
-- navigateur ou le state React) AVANT toute vérification Premium. Un
-- utilisateur gratuit un peu curieux peut donc voir l'identité de qui l'a
-- aimé sans jamais payer, alors que c'est précisément la fonctionnalité
-- vendue par l'abonnement. Même chose pour l'abonnement realtime "likes"
-- (INSERT to_id=moi) : il refait un select("*") direct sur "profiles" dès
-- qu'un nouveau like arrive, toujours sans vérifier is_premium().
--
-- Un match MUTUEL (les deux se sont likés) n'est PAS concerné : voir qui a
-- matché avec soi n'a jamais été un avantage Premium dans cette app (voir
-- getMatches() dans App.jsx) — seul le like à SENS UNIQUE (qui m'a aimé
-- sans que je l'aie encore aimé en retour) doit rester caché à un compte
-- gratuit.
--
-- Prérequis : supabase-premium.sql (is_premium, current_profile_id),
-- supabase-matching.sql / supabase-protect-rls.sql (table "likes" existante
-- avec RLS lecture sur from_id/to_id = soi).
-- Additif uniquement : n'importe pas les policies RLS existantes sur
-- "likes"/"profiles", ajoute seulement deux fonctions RPC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. get_my_likers() — remplace le select("from_id, profile:from_id(*)")
-- fait directement depuis le client dans loadAll(). Ne renvoie le profil
-- complet d'un·e admirateur·ice à sens unique que si l'appelant est
-- Premium ; les profils de match mutuel sont toujours inclus. Le compteur
-- "admirers_count" (aucune identité dedans) permet quand même d'afficher
-- "X personnes t'ont déjà aimé·e" et le badge "(N)" de l'onglet Profil à un
-- compte gratuit, sans rien révéler.
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

-- ----------------------------------------------------------------------------
-- 2. get_liker_profile_reveal(p_from_id) — équivalent pour l'abonnement
-- realtime "likes" (nouvel INSERT reçu en direct pendant la session). Ne
-- renvoie le profil que si un like réel de p_from_id vers moi existe déjà
-- en base ET (match mutuel OU je suis Premium) ; sinon renvoie null, sans
-- toucher à "profiles" du tout — le client garde juste le compteur à jour
-- côté React sans jamais recevoir l'identité.
-- ----------------------------------------------------------------------------
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
-- Vérification (facultatif, à exécuter séparément après) :
-- select get_my_likers(); -- en tant qu'utilisateur connecté, via l'API PostgREST/RPC
-- select get_liker_profile_reveal('<uuid-de-quelquun-qui-ma-like>');
-- ============================================================================
