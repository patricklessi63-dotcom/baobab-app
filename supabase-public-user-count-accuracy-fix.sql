-- ============================================================================
-- CORRECTIF — public_user_count() comptait TOUS les profils sans distinction
-- (trouvé lors de l'audit autonome du 4 septembre 2026, angle "fiabilité du
-- chiffre affiché sur la page d'accueil publique").
-- ============================================================================
-- public_user_count() (supabase-public-user-count.sql) fait actuellement :
--   select count(*) from profiles;
-- sans AUCUN filtre. Ce nombre est affiché comme preuve sociale aux
-- visiteurs NON connectés ("X membres déjà sur Baobab",
-- src/screens/public/LandingPage.jsx) et dans l'app connectée
-- (src/components/home/HomeHeader.jsx, "X membres sur Baobab"). Il inclut
-- donc actuellement :
--   - les comptes BANNIS (profiles.banned_at is not null)
--   - les comptes actuellement SUSPENDUS
--     (profiles.suspended_until is not null and suspended_until > now())
--   - les comptes en cours de SUPPRESSION DIFFÉRÉE
--     (profiles.deletion_requested_at is not null — fenêtre de grâce avant
--     suppression effective, supabase-account-deletion.sql)
--   - les comptes qui n'ont JAMAIS terminé l'onboarding
--     (profiles.onboarding_completed_at is null — une ligne "profiles"
--     existe dès l'inscription, avant même que la personne choisisse un nom
--     ou une photo ; supabase-profile-onboarding.sql)
--
-- Résultat concret : un visiteur qui voit "X membres déjà sur Baobab" peut
-- voir un chiffre qui inclut des comptes bannis pour comportement abusif et
-- des inscriptions jamais finalisées — pas des "membres" au sens où ce
-- chiffre est présenté (preuve sociale de communauté active).
--
-- Vérifié EMPIRIQUEMENT (curl, clé anon, lecture seule) le 4 septembre 2026 :
-- public_user_count() renvoyait 4 en production — impossible de savoir sans
-- ce correctif combien de ces 4 comptes sont réellement des membres complets
-- et en règle.
--
-- Remarque — pas touché ici : admin_dashboard_stats().total_users
-- (supabase-admin-dashboard-stats-fix.sql) fait le même "select count(*)
-- from profiles" sans filtre, donc le chiffre public N'ÉTAIT PAS incohérent
-- avec le tableau de bord admin (les deux comptaient pareil) — mais les deux
-- étaient gonflés de la même façon. Ce correctif ne touche QUE
-- public_user_count() : "total_users" côté admin sert un usage différent
-- (vue d'ensemble brute pour le propriétaire, où voir aussi les comptes
-- bannis/incomplets a du sens) et reste inchangé volontairement.
-- ============================================================================

create or replace function public_user_count()
returns bigint
language sql stable security definer set search_path = public
as $$
  select count(*) from profiles
  where onboarding_completed_at is not null
    and banned_at is null
    and (suspended_until is null or suspended_until <= now())
    and deletion_requested_at is null;
$$;

-- "create or replace" préserve les grants déjà en place :
-- grant execute on function public_user_count() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select public_user_count();          -- nouveau chiffre, filtré
-- select count(*) from profiles;        -- ancien chiffre, pour comparer
-- ============================================================================
