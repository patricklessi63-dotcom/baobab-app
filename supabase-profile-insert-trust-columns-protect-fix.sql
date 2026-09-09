-- ============================================================================
-- CORRECTIF CRITIQUE — colonnes de confiance de "profiles" librement
-- choisies A LA CREATION du profil (contournement total des protections
-- déjà posées côté UPDATE).
--
-- Trouvé en poursuivant l'angle "policy RLS trop permissive au niveau
-- colonne" côté INSERT cette fois (déjà fait côté UPDATE dans
-- supabase-profile-trust-columns-protect-fix.sql, supabase-founder-badge.sql
-- et supabase-premium-badge-protect.sql).
--
-- CONSTAT : la policy INSERT sur "profiles" (supabase-scale-security.sql,
-- "Creation de son propre profil uniquement") ne vérifie QUE la propriété
-- de la ligne :
--   with check (auth.uid() = user_id)
-- Elle ne dit RIEN sur les autres colonnes. Et les TROIS triggers qui
-- protègent normalement les colonnes sensibles de "profiles" sont tous les
-- trois déclarés "BEFORE UPDATE" uniquement (comparaison NEW vs OLD) :
--   - protect_profile_trust_columns (supabase-profile-trust-columns-protect-fix.sql)
--   - protect_founder_flag (supabase-founder-badge.sql)
--   - protect_premium_flag (supabase-premium-badge-protect.sql)
-- Aucun des trois ne s'exécute sur INSERT (il n'y a même pas de ligne OLD à
-- comparer) — un simple appel authentifié
--   supabase.from('profiles').insert({ user_id: auth.uid(), name: '...',
--     is_founder: true, is_premium: true, email_verified: true,
--     phone_verified: true, banned_at: null, report_count: 0,
--     flagged_for_review: false })
-- crée directement le profil dans l'état "de confiance maximale", sans
-- jamais passer par Stripe, par la vérification email/téléphone réelle, ni
-- par un badge fondateur unique attribué manuellement. Aucune table
-- "profiles" existante n'est écrasée (contrainte d'unicité sur user_id,
-- supabase-scale-security.sql) : l'attaque ne fonctionne que sur SA PROPRE
-- toute première création de profil (juste après l'inscription, avant ou à
-- la place de l'insert habituel fait par l'application) — largement
-- suffisant pour un compte flambant neuf qui s'auto-attribue Premium/le
-- badge fondateur/les vérifications email+téléphone dès l'inscription.
--
-- CORRECTIF : les trois triggers deviennent BEFORE INSERT OR UPDATE. Sur
-- INSERT (pas de ligne OLD), chaque colonne sensible doit valoir exactement
-- sa valeur par défaut sûre, sauf si le drapeau de contournement
-- transactionnel (déjà utilisé pour l'UPDATE) est actif. Le comportement
-- UPDATE existant est repris à l'identique (aucune régression).
--
-- Ordre d'exécution : à appliquer APRÈS supabase-profile-trust-columns-
-- protect-fix.sql, supabase-founder-badge.sql et supabase-premium-badge-
-- protect.sql (ce correctif fait un "create or replace" des trois fonctions
-- qui y sont définies et un "create trigger" avec les mêmes noms — idempotent).
-- ============================================================================

create or replace function protect_profile_trust_columns()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if auth.role() = 'authenticated'
       and coalesce(current_setting('baobab.trust_column_write', true), '') <> 'on'
       and (
         new.banned_at is not null
         or new.ban_reason is not null
         or new.suspended_until is not null
         or new.suspend_reason is not null
         or coalesce(new.report_count, 0) <> 0
         or coalesce(new.flagged_for_review, false) <> false
         or coalesce(new.email_verified, false) <> false
         or coalesce(new.phone_verified, false) <> false
       )
    then
      raise exception 'Cette colonne ne peut pas etre definie a la creation du profil — action serveur (moderation ou verification) requise.';
    end if;
    return new;
  end if;

  if auth.role() = 'authenticated'
     and coalesce(current_setting('baobab.trust_column_write', true), '') <> 'on'
     and (
       new.banned_at is distinct from old.banned_at
       or new.ban_reason is distinct from old.ban_reason
       or new.suspended_until is distinct from old.suspended_until
       or new.suspend_reason is distinct from old.suspend_reason
       or new.report_count is distinct from old.report_count
       or new.flagged_for_review is distinct from old.flagged_for_review
       or new.email_verified is distinct from old.email_verified
       or new.phone_verified is distinct from old.phone_verified
     )
  then
    raise exception 'Cette colonne ne peut pas etre modifiee directement via l''application — action serveur (moderation ou verification) requise.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_trust_columns on profiles;
create trigger trg_protect_profile_trust_columns
before insert or update on profiles
for each row
execute function protect_profile_trust_columns();

create or replace function protect_founder_flag()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if coalesce(new.is_founder, false) = true and auth.role() = 'authenticated' then
      raise exception 'is_founder ne peut pas etre defini a la creation du profil — action admin requise.';
    end if;
    return new;
  end if;

  if new.is_founder is distinct from old.is_founder and auth.role() = 'authenticated' then
    raise exception 'is_founder ne peut pas etre modifie via l''application — action admin requise.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_founder_flag on profiles;
create trigger trg_protect_founder_flag
before insert or update on profiles
for each row
execute function protect_founder_flag();

create or replace function protect_premium_flag()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    if coalesce(new.is_premium, false) = true and auth.role() = 'authenticated' then
      raise exception 'is_premium ne peut pas etre defini a la creation du profil — synchronise automatiquement depuis les abonnements.';
    end if;
    return new;
  end if;

  if new.is_premium is distinct from old.is_premium and auth.role() = 'authenticated' then
    raise exception 'is_premium ne peut pas etre modifie via l''application — synchronise automatiquement depuis les abonnements.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_premium_flag on profiles;
create trigger trg_protect_premium_flag
before insert or update on profiles
for each row
execute function protect_premium_flag();

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
--
-- -- en tant qu'utilisateur authentifie normal, en creant un NOUVEAU profil :
-- insert into profiles (user_id, name, is_founder) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, is_premium) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, email_verified) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, phone_verified) values (auth.uid(), 'Test', true);
-- insert into profiles (user_id, name, report_count) values (auth.uid(), 'Test', 5);
-- -- toutes doivent echouer avec l'exception correspondante ; un insert sans
-- -- ces colonnes (valeurs par defaut) doit toujours reussir normalement.
--
-- select tgname, tgtype from pg_trigger
--   where tgrelid = 'public.profiles'::regclass
--   and tgname in ('trg_protect_profile_trust_columns','trg_protect_founder_flag','trg_protect_premium_flag');
-- ============================================================================
