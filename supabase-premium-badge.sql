-- ============================================================================
-- Badge Premium visible — colonne mise en cache sur "profiles", synchronisée
-- depuis "subscriptions" par trigger. Nécessaire car le client ne peut PAS
-- lire subscriptions d'un autre utilisateur (RLS : "profile_id =
-- current_profile_id()" uniquement, voir supabase-premium.sql) — impossible
-- donc d'afficher un badge Premium sur le profil de quelqu'un d'autre sans
-- cette colonne dénormalisée, lisible via la policy SELECT déjà en place
-- sur "profiles". Réutilise is_premium(profile_id), déjà définie dans
-- supabase-premium.sql, comme seule source de vérité du calcul.
-- À exécuter dans Supabase : SQL Editor. Additif uniquement.
-- ============================================================================

alter table profiles add column if not exists is_premium boolean not null default false;

create or replace function sync_profile_premium_flag()
returns trigger language plpgsql as $$
begin
  update profiles set is_premium = is_premium(coalesce(new.profile_id, old.profile_id))
  where id = coalesce(new.profile_id, old.profile_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_profile_premium_flag on subscriptions;
create trigger trg_sync_profile_premium_flag
after insert or update or delete on subscriptions
for each row
execute function sync_profile_premium_flag();

-- Initialise la colonne pour les abonnements déjà existants (pas d'effet
-- pour les profils sans ligne dans "subscriptions", qui restent à false).
update profiles set is_premium = is_premium(id)
where id in (select distinct profile_id from subscriptions);

-- ----------------------------------------------------------------------------
-- Abonnement offert au fondateur (compte patricklessi63@gmail.com, profile
-- id f04a1c4c-393e-404f-aebb-b37c974b7e39) — pas un vrai abonnement Stripe,
-- stripe_customer_id volontairement marqué "comp_founder" pour rester
-- traçable comme cas particulier si jamais un webhook Stripe légitime doit
-- être réconcilié plus tard. status "active", current_period_end laissé
-- null (is_premium() le traite comme "jamais expiré").
-- ----------------------------------------------------------------------------
insert into subscriptions (profile_id, stripe_customer_id, plan, status)
values ('f04a1c4c-393e-404f-aebb-b37c974b7e39', 'comp_founder', 'yearly', 'active')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif) :
-- select p.id, p.name, p.is_premium, s.status from profiles p join subscriptions s on s.profile_id = p.id;
-- ============================================================================
