-- ============================================================================
-- SQL-28 — client_errors : plafonner les écritures anonymes (déni de service du stockage).
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Constaté le 4 novembre 2026 par un essai sur le projet de répétition : la policy
-- `client_errors_insert_anyone` (INSERT ouvert à `anon`, with check (true)) accepte, en UNE requête
-- sans compte, 2 000 lignes de 8 Ko (16 Mo). Répété, cela remplit les 500 Mo de l'offre gratuite en
-- quelques minutes : la base passe en lecture seule pour TOUTE l'application. Les bornes de longueur
-- de chaque champ existent déjà, mais rien ne borne le NOMBRE de lignes (déjà listé comme ouvert dans
-- LANCEMENT.md : « client_errors sans limite de débit »).
--
-- CORRECTIF (additif ; la policy et les contraintes existantes ne sont ni supprimées ni modifiées) :
-- un déclencheur BEFORE INSERT refuse l'écriture quand l'une des limites GLOBALES est atteinte :
--     - 30 lignes par minute,
--     - 300 lignes par jour,
--     - 3 000 lignes au total dans la table.
-- Pire cas borné : 3 000 lignes x ~13 Ko = ~40 Mo (contre l'infini). Une insertion en lot est comptée
-- ligne par ligne et échoue en entier au dépassement. Les limites sont globales (on ne connaît pas
-- l'identité d'un visiteur anonyme) : pendant une inondation, de vrais rapports d'erreur peuvent être
-- perdus — ce rapporteur est « au mieux » (10 rapports max par session, échec silencieux), la perte est
-- sans gravité ; la base, elle, reste disponible.
-- Le déclencheur impose aussi `profile_id` : celui de l'appelant authentifié, sinon NULL (impossible
-- d'attribuer une erreur fabriquée au profil de quelqu'un d'autre).
--
-- CONTRÔLES :
--   select tgname from pg_trigger where tgrelid = 'public.client_errors'::regclass and not tgisinternal;
--   -- doit montrer « trg_client_errors_guard ».
-- RETOUR ARRIÈRE :
--   drop trigger if exists trg_client_errors_guard on public.client_errors;
--   drop function if exists public.client_errors_guard();
-- Validé sur schéma factice PGlite (src/native/clientErrorsRateLimit.test.js) et sur la répétition.
-- ============================================================================

create or replace function public.client_errors_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_minute int;
  v_day    int;
  v_total  int;
begin
  -- Le déclencheur s'exécute avec les droits du propriétaire : il peut compter malgré la RLS (anon n'a
  -- aucune policy SELECT) et voit les lignes déjà insérées par la même instruction (fonction volatile).
  select count(*) filter (where created_at > now() - interval '1 minute'),
         count(*) filter (where created_at > now() - interval '1 day'),
         count(*)
    into v_minute, v_day, v_total
    from public.client_errors;

  if v_minute >= 30 or v_day >= 300 or v_total >= 3000 then
    raise exception 'client_errors : limite d''écriture atteinte' using errcode = 'P0001';
  end if;

  -- profile_id : seulement celui de l'appelant authentifié.
  new.profile_id := (select p.id from public.profiles p where p.user_id = auth.uid() limit 1);
  return new;
end;
$$;

revoke all on function public.client_errors_guard() from public;
revoke all on function public.client_errors_guard() from anon;
revoke all on function public.client_errors_guard() from authenticated;

drop trigger if exists trg_client_errors_guard on public.client_errors;
create trigger trg_client_errors_guard
before insert on public.client_errors
for each row execute function public.client_errors_guard();
