-- ============================================================================
-- SQL-40 — « Mes statistiques » (avantage Premium) : les interactions réelles reçues par mes publications
-- et mon profil, calculées à la demande, SANS aucun nouveau suivi des personnes.
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 11 novembre 2026. Phase P4 du chantier « Baobab Premium ».
--
-- PRINCIPE DE RESPECT DE LA VIE PRIVÉE : ce fichier ne crée AUCUNE table et n'enregistre AUCUNE visite.
-- Il ne compte que ce qui existe déjà et que chacun·e peut voir : j'aime (post_likes), commentaires
-- (post_comments), abonnés (follows) et publications (posts). Baobab ne sait pas — et ne cherche pas à
-- savoir — qui a consulté un profil ou lu une publication ; l'interface le dit clairement. Les résultats
-- sont des NOMBRES : jamais une liste de personnes (pas d'identité exposée en plus de ce que le fil
-- montre déjà).
--
-- CE QUE LE FICHIER AJOUTE (additif) :
--   1. L'avantage 'creator_stats' au catalogue premium_entitlements (SQL-37). Mettre active = false
--      coupe la fonction pour tout le monde sans redéployer.
--   2. my_creator_stats(jours) : renvoie, pour le compte connecté UNIQUEMENT (current_profile_id()),
--      un JSON : publications, j'aime et commentaires reçus (hors les siens), abonnés, nouveaux abonnés,
--      cinq publications les plus appréciées et une courbe par semaine. Refusée (42501) si le compte n'a
--      pas l'avantage — vérifié ici, côté serveur, jamais d'après un indicateur envoyé par le client.
--      `jours` est borné entre 7 et 90.
--   Après une résiliation, la fonction se ferme avec l'avantage : ce sont des statistiques de consultation,
--   pas des données que la personne a créées (ses publications, j'aime et abonnés ne bougent pas).
--
-- PRÉREQUIS : SQL-37 (supabase-premium-entitlements.sql), supabase-feed-posts.sql (posts, post_likes,
-- post_comments), supabase-follows.sql, supabase-communities.sql (current_profile_id).
-- Le fichier s'arrête avec un message clair si l'un manque.
--
-- DÉPLOIEMENT : un client qui n'a pas la fonction affiche simplement « pas encore disponible ».
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   select key, active from premium_entitlements where key = 'creator_stats';   -- 1 ligne, active = true
--   select has_function_privilege('anon', 'public.my_creator_stats(integer)', 'EXECUTE');           -- false
--   select has_function_privilege('authenticated', 'public.my_creator_stats(integer)', 'EXECUTE');  -- true
--
-- RETOUR ARRIÈRE :
--   drop function if exists public.my_creator_stats(integer);
--   delete from public.premium_entitlements where key = 'creator_stats';
-- ============================================================================

do $$
begin
  if to_regprocedure('public.has_premium_feature(uuid,text)') is null then
    raise exception 'has_premium_feature() introuvable : exécuter d''abord supabase-premium-entitlements.sql (SQL-37)';
  end if;
  if to_regprocedure('public.current_profile_id()') is null then
    raise exception 'current_profile_id() introuvable : exécuter d''abord supabase-communities.sql';
  end if;
  if to_regclass('public.posts') is null or to_regclass('public.post_likes') is null or to_regclass('public.post_comments') is null then
    raise exception 'posts / post_likes / post_comments introuvables : exécuter d''abord supabase-feed-posts.sql';
  end if;
  if to_regclass('public.follows') is null then
    raise exception 'follows introuvable : exécuter d''abord supabase-follows.sql';
  end if;
end $$;

insert into public.premium_entitlements (key, label) values
  ('creator_stats', 'Statistiques de mes publications et de mon profil')
on conflict (key) do nothing;

create or replace function public.my_creator_stats(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := public.current_profile_id();
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_since timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 7), 90));
  v_result jsonb;
begin
  if v_me is null then
    raise exception 'Non connecte' using errcode = '42501';
  end if;
  if not public.has_premium_feature(v_me, 'creator_stats') then
    raise exception 'Reserve aux abonnes Premium' using errcode = '42501';
  end if;

  with mine as (
    select id, body, created_at from public.posts where author_id = v_me
  ),
  likes as (   -- j'aime reçus : jamais les siens
    select pl.post_id, pl.created_at from public.post_likes pl
    join mine m on m.id = pl.post_id
    where pl.profile_id <> v_me
  ),
  comments as ( -- commentaires reçus : jamais les siens
    select pc.post_id, pc.created_at from public.post_comments pc
    join mine m on m.id = pc.post_id
    where pc.author_id <> v_me
  ),
  weeks as (
    select generate_series(date_trunc('week', v_since), date_trunc('week', now()), interval '1 week') as week
  )
  select jsonb_build_object(
    'period_days',         v_days,
    'posts_total',         (select count(*) from mine),
    'posts_period',        (select count(*) from mine where created_at >= v_since),
    'likes_total',         (select count(*) from likes),
    'likes_period',        (select count(*) from likes where created_at >= v_since),
    'comments_total',      (select count(*) from comments),
    'comments_period',     (select count(*) from comments where created_at >= v_since),
    'followers_total',     (select count(*) from public.follows where to_id = v_me),
    'followers_period',    (select count(*) from public.follows where to_id = v_me and created_at >= v_since),
    'top_posts', coalesce((
      select jsonb_agg(t order by t.score desc, t.created_at desc) from (
        select m.id, left(m.body, 140) as excerpt, m.created_at,
               (select count(*) from likes l where l.post_id = m.id) as likes,
               (select count(*) from comments c where c.post_id = m.id) as comments,
               (select count(*) from likes l where l.post_id = m.id) + (select count(*) from comments c where c.post_id = m.id) as score
        from mine m
        order by score desc, m.created_at desc
        limit 5
      ) t where t.score > 0
    ), '[]'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w.week, 'YYYY-MM-DD'),
        'posts',    (select count(*) from mine    where date_trunc('week', created_at) = w.week),
        'likes',    (select count(*) from likes    where date_trunc('week', created_at) = w.week),
        'comments', (select count(*) from comments where date_trunc('week', created_at) = w.week)
      ) order by w.week) from weeks w
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.my_creator_stats(integer) from public, anon;
grant execute on function public.my_creator_stats(integer) to authenticated;
