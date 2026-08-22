-- ============================================================================
-- Immigration & Integration 2.0 - favoris uniquement. La recherche et les
-- indicateurs de fraicheur (vert/jaune/rouge) sont calcules cote client a
-- partir des colonnes deja existantes (published_at) : aucune colonne ni
-- fonction serveur necessaire pour ca.
--
-- Le pipeline existant (immigration_news, immigration_news_fetch_log,
-- fetch-immigration-news) republie deja uniquement le titre/resume/lien
-- fournis tels quels par IRCC/ASFC, sans jamais reformuler ni generer de
-- contenu juridique -- pas de systeme brouillon/verification/validation
-- ajoute ici : il n'y a rien a valider avant publication puisque rien n'est
-- genere, seulement indexe depuis la source officielle.
-- ============================================================================

create table if not exists immigration_news_favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  news_id uuid not null references immigration_news(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, news_id)
);

alter table immigration_news_favorites enable row level security;

drop policy if exists "Lecture de ses propres favoris" on immigration_news_favorites;
create policy "Lecture de ses propres favoris"
on immigration_news_favorites for select
to authenticated
using (profile_id = current_profile_id());

drop policy if exists "Ajouter un favori" on immigration_news_favorites;
create policy "Ajouter un favori"
on immigration_news_favorites for insert
to authenticated
with check (profile_id = current_profile_id());

drop policy if exists "Retirer son propre favori" on immigration_news_favorites;
create policy "Retirer son propre favori"
on immigration_news_favorites for delete
to authenticated
using (profile_id = current_profile_id());

-- ----------------------------------------------------------------------------
-- Verification (facultatif) :
-- select * from immigration_news_favorites limit 5;
-- ============================================================================
