-- ============================================================================
-- Protection anti-auto-attribution du badge Premium (profiles.is_premium).
-- Additif à supabase-premium-badge.sql. À exécuter dans Supabase : SQL Editor.
-- ============================================================================
-- Bug trouvé lors de l'audit Premium/paywall (2026-08-22) : la policy RLS
-- UPDATE existante sur "profiles" ("Un utilisateur modifie son propre
-- profil", voir supabase-profile-onboarding.sql) autorise déjà un
-- utilisateur à modifier N'IMPORTE QUELLE colonne de sa propre ligne,
-- is_premium inclus — rien n'empêchait aujourd'hui un utilisateur d'appeler
-- supabase.from("profiles").update({is_premium:true}) sur son propre id et
-- de s'attribuer lui-même le badge 💎 Premium sans jamais payer.
--
-- is_founder a déjà reçu cette protection (protect_founder_flag, voir
-- supabase-founder-badge.sql) au moment de sa création, mais is_premium —
-- ajoutée plus tard par supabase-premium-badge.sql comme simple colonne de
-- cache dénormalisée synchronisée par trigger depuis "subscriptions" — ne
-- l'a jamais reçue. Même remède : un trigger BEFORE UPDATE qui bloque toute
-- modification de is_premium venant d'une requête authentifiée (PostgREST),
-- tout en laissant passer la mise à jour légitime faite par
-- sync_profile_premium_flag (déclenchée par le webhook Stripe, qui écrit
-- dans "subscriptions" via la clé service_role — auth.role() y vaut
-- 'service_role', jamais 'authenticated').
--
-- Remarque : ceci ne corrige qu'un contournement cosmétique (le badge
-- affiché sur le profil), pas un contournement de paiement — le vrai statut
-- Premium (accès aux fonctions filtrées, ex. AdmirersModal/DiscoverTab) est
-- calculé côté client à partir de "subscriptions" (usePremiumStatus.js), une
-- table qu'un utilisateur ne peut pas écrire (RLS, voir supabase-premium.sql).
-- Mais un badge Premium usurpé reste trompeur pour les autres membres et
-- mérite d'être bloqué au même endroit que is_founder.
-- ============================================================================

create or replace function protect_premium_flag()
returns trigger language plpgsql as $$
begin
  if new.is_premium is distinct from old.is_premium and auth.role() = 'authenticated' then
    raise exception 'is_premium ne peut pas etre modifie via l''application — synchronise automatiquement depuis les abonnements.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_premium_flag on profiles;
create trigger trg_protect_premium_flag
before update on profiles
for each row
execute function protect_premium_flag();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- -- doit échouer avec l'exception ci-dessus, en tant qu'utilisateur authentifié :
-- -- update profiles set is_premium = true where id = '<mon_profile_id>';
-- select tgname from pg_trigger where tgname = 'trg_protect_premium_flag';
-- ============================================================================
