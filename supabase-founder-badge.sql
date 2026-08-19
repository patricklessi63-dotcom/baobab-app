-- ============================================================================
-- Espace fondateur : profil unique et visuellement distinct de Patrick,
-- fondateur de Baobab. À exécuter dans Supabase : SQL Editor. Additif
-- uniquement, sans lien avec email_verified/phone_verified (badge de
-- vérification réel, laissé intact pour tous les utilisateurs — le badge
-- fondateur est un marqueur séparé, pas un remplacement de la vérification).
-- ============================================================================

alter table profiles add column if not exists is_founder boolean not null default false;

-- Un seul profil peut porter ce marqueur — appliqué via un index unique
-- partiel plutôt qu'une contrainte classique (n'a de sens que pour
-- is_founder = true, ne bloque jamais les lignes is_founder = false). C'est
-- aussi la vérification automatique anti-régression demandée (item 7) :
-- toute tentative d'attribuer ce statut à un 2e profil échoue au niveau
-- base de données, pas seulement via un test qu'on pourrait oublier de lancer.
create unique index if not exists idx_profiles_single_founder on profiles ((is_founder)) where is_founder = true;

-- Attribution au fondateur (compte patricklessi63@gmail.com, UID auth
-- 297b3fbf-6636-4934-a54e-ef455561f2fa confirmé dans Authentication > Users).
update profiles set is_founder = true where user_id = '297b3fbf-6636-4934-a54e-ef455561f2fa';

-- ----------------------------------------------------------------------------
-- Protection anti-auto-attribution (item 3) : la policy RLS UPDATE existante
-- ("Un utilisateur modifie son propre profil") autorise déjà un utilisateur à
-- modifier N'IMPORTE QUELLE colonne de sa propre ligne, is_founder inclus —
-- rien n'empêchait aujourd'hui un utilisateur d'appeler
-- supabase.from("profiles").update({is_founder:true}) sur son propre id et
-- de se l'attribuer lui-même (l'index unique ci-dessus l'aurait seulement
-- empêché si un autre profil l'avait déjà, pas dans le cas général).
--
-- Un trigger (pas une policy) est nécessaire ici car il faut comparer
-- l'ancienne et la nouvelle valeur (OLD/NEW), inaccessible dans un simple
-- WITH CHECK. auth.role() = 'authenticated' cible spécifiquement les
-- requêtes venant de l'app (PostgREST) — les requêtes lancées ici même
-- depuis le SQL Editor (rôle postgres) ne sont jamais bloquées, donc une
-- réattribution future reste possible en admin.
-- ----------------------------------------------------------------------------
create or replace function protect_founder_flag()
returns trigger language plpgsql as $$
begin
  if new.is_founder is distinct from old.is_founder and auth.role() = 'authenticated' then
    raise exception 'is_founder ne peut pas etre modifie via l''application — action admin requise.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_founder_flag on profiles;
create trigger trg_protect_founder_flag
before update on profiles
for each row
execute function protect_founder_flag();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select id, name, is_founder from profiles where is_founder = true;
-- select count(*) from profiles where is_founder = true; -- doit toujours valoir 1
-- ============================================================================
