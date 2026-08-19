-- ============================================================================
-- Phase 2 — Beta privée : liste blanche d'accès. À exécuter dans Supabase :
-- SQL Editor. Additif uniquement, aucun impact sur les tables existantes.
-- ============================================================================
-- L'inscription (supabase.auth.signUp côté client, src/Auth.jsx) ne peut pas
-- être filtrée par une policy RLS classique — auth.users n'est pas soumis
-- aux RLS du schéma public. Le blocage doit se faire via un Auth Hook
-- "before user created" (fonction Postgres ci-dessous), qui doit ensuite
-- être activé manuellement dans le Dashboard : Authentication > Hooks >
-- "Before User Created" > sélectionner cette fonction. Ce réglage touche le
-- contrôle d'accès aux comptes — à activer par le propriétaire du projet,
-- pas par un script automatisé.

create table if not exists beta_testers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  invited_at timestamptz default now(),
  used_at timestamptz,
  note text
);
alter table beta_testers enable row level security;
-- Aucune policy cliente : consultée uniquement par la fonction du hook
-- (SECURITY DEFINER, contourne RLS) et par le propriétaire via le Dashboard/
-- SQL Editor. Personne ne doit pouvoir lire ou écrire cette table depuis
-- l'app — ni la liste des emails invités, ni y ajouter le sien.

create or replace function check_beta_whitelist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_email text := event->'user'->>'email';
begin
  if not exists (select 1 from beta_testers where lower(email) = lower(candidate_email)) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'Baobab est en beta privée sur invitation. Cette adresse email n''est pas encore invitée.'
      )
    );
  end if;
  update beta_testers set used_at = now() where lower(email) = lower(candidate_email) and used_at is null;
  return jsonb_build_object();
end;
$$;

-- ----------------------------------------------------------------------------
-- Ajouter des testeurs (à exécuter séparément, une ligne par email invité) :
-- insert into beta_testers (email, note) values ('exemple@mail.com', 'ami proche');
--
-- Vérification :
-- select tablename from pg_tables where schemaname='public' and tablename='beta_testers';
-- select proname from pg_proc where proname='check_beta_whitelist';
-- ============================================================================
