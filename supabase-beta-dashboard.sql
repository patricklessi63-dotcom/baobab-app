-- ============================================================================
-- Tableau de bord bêta privée — Phase 11, sections 18 (rétention) et 24
-- (rapport bêta). À exécuter dans Supabase SQL Editor, autant de fois que
-- tu veux pendant la bêta (lecture seule, aucun impact sur les données).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. VUE D'ENSEMBLE — un chiffre par ligne, à suivre dans le temps.
-- ----------------------------------------------------------------------------
select 'Comptes créés' as metrique, count(*)::text as valeur from profiles
union all
select 'Profils complétés (onboarding fini)', count(*)::text from profiles where onboarding_completed_at is not null
union all
select 'Actifs derniers 7 jours (last_seen)', count(*)::text from profiles where last_seen > now() - interval '7 days'
union all
select 'Actifs dernières 24h', count(*)::text from profiles where last_seen > now() - interval '1 day'
union all
select 'Publications créées', count(*)::text from posts
union all
select 'Statuts créés au total (historique, expirés inclus)', count(*)::text from stories
union all
select 'Messages envoyés', count(*)::text from messages
union all
select 'Abonnements (follows)', count(*)::text from follows
union all
select 'Likes envoyés (rencontres)', count(*)::text from likes
union all
select 'Matchs mutuels', count(*)::text from likes l1 where exists (
  select 1 from likes l2 where l2.from_id = l1.to_id and l2.to_id = l1.from_id
)
union all
select 'Communautés créées', count(*)::text from communities
union all
select 'Adhésions à des communautés', count(*)::text from community_members
union all
select 'Retours bêta reçus (beta_feedback)', count(*)::text from beta_feedback
union all
select 'Comptes suspendus', count(*)::text from profiles where suspended_until > now()
union all
select 'Comptes bannis', count(*)::text from profiles where banned_at is not null;

-- ----------------------------------------------------------------------------
-- 2. RÉTENTION PAR COHORTE — pour chaque compte, a-t-il été actif après son
-- inscription (J1/J3/J7) ? "Oui" = un last_seen postérieur au seuil.
-- ----------------------------------------------------------------------------
select
  p.name,
  p.created_at::date as inscrit_le,
  (p.last_seen > p.created_at + interval '1 day') as actif_j1,
  (p.last_seen > p.created_at + interval '3 days') as actif_j3,
  (p.last_seen > p.created_at + interval '7 days') as actif_j7,
  p.onboarding_completed_at is not null as profil_complete
from profiles p
order by p.created_at asc;

-- ----------------------------------------------------------------------------
-- 3. TOP DES RETOURS BÊTA — répartition par catégorie (👍/👎/🐛/💡) et
-- derniers commentaires reçus (nécessite d'avoir exécuté
-- supabase-beta-feedback-category.sql au préalable).
-- ----------------------------------------------------------------------------
select category, count(*) as nb
from beta_feedback
group by category
order by nb desc;

select p.name, bf.category, bf.message, bf.screen, bf.created_at
from beta_feedback bf
join profiles p on p.id = bf.profile_id
order by bf.created_at desc
limit 30;

-- ----------------------------------------------------------------------------
-- 4. ACTIVITÉ PAR COMPTE — pour repérer qui utilise vraiment Baobab
-- (utile pour identifier tes testeurs les plus/moins engagés).
-- ----------------------------------------------------------------------------
select
  p.name,
  p.created_at::date as inscrit_le,
  p.last_seen,
  (select count(*) from posts where author_id = p.id) as publications,
  (select count(*) from messages where from_id = p.id) as messages_envoyes,
  (select count(*) from follows where from_id = p.id) as abonnements,
  (select count(*) from likes where from_id = p.id) as likes_envoyes,
  (select count(*) from community_members where profile_id = p.id) as communautes
from profiles p
order by p.created_at asc;
-- ============================================================================
