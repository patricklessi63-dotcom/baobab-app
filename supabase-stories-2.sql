-- ============================================================================
-- Statuts 2.0 — vues, reactions, fond de couleur pour les statuts texte, et
-- durcissement du stockage. Complete stories.sql / stories-media.sql /
-- stories-expiration.sql (deja en place, non modifies ici) plutot que de
-- creer un deuxieme systeme.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fond de couleur choisi pour un statut texte (remplace le degrade
-- deterministe par profil quand l'auteur en choisit un explicitement).
-- ----------------------------------------------------------------------------
alter table stories add column if not exists bg_color text;

-- ----------------------------------------------------------------------------
-- 2. Vues — un statut peut etre marque vu au plus une fois par spectateur.
-- Lecture reservee au spectateur (sa propre ligne) et a l'auteur du statut
-- (pour la liste "Personnes ayant vu ton statut").
-- ----------------------------------------------------------------------------
create table if not exists story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  unique (story_id, viewer_id)
);

alter table story_views enable row level security;

drop policy if exists "Lecture de ses propres vues ou par l'auteur du statut" on story_views;
create policy "Lecture de ses propres vues ou par l'auteur du statut"
on story_views for select
to authenticated
using (
  viewer_id = current_profile_id()
  or exists (select 1 from stories s where s.id = story_views.story_id and s.profile_id = current_profile_id())
);

-- L'insertion passe par la RLS SELECT de "stories" elle-meme (la sous-requete
-- ci-dessous est executee avec les droits de l'appelant) : impossible de
-- marquer "vu" un statut qu'on n'a pas le droit de voir.
drop policy if exists "Marquer un statut visible comme vu" on story_views;
create policy "Marquer un statut visible comme vu"
on story_views for insert
to authenticated
with check (
  viewer_id = current_profile_id()
  and exists (select 1 from stories s where s.id = story_views.story_id)
);

-- ----------------------------------------------------------------------------
-- 3. Reactions rapides — une seule reaction active par spectateur et par
-- statut (upsert cote client sur le conflit), visible par le spectateur et
-- par l'auteur du statut (affichee dans la liste des vues).
-- ----------------------------------------------------------------------------
create table if not exists story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','😂','😍','😮','👏','🔥')),
  created_at timestamptz not null default now(),
  unique (story_id, profile_id)
);

alter table story_reactions enable row level security;

drop policy if exists "Lecture de sa reaction ou par l'auteur du statut" on story_reactions;
create policy "Lecture de sa reaction ou par l'auteur du statut"
on story_reactions for select
to authenticated
using (
  profile_id = current_profile_id()
  or exists (select 1 from stories s where s.id = story_reactions.story_id and s.profile_id = current_profile_id())
);

drop policy if exists "Reagir a un statut visible" on story_reactions;
create policy "Reagir a un statut visible"
on story_reactions for insert
to authenticated
with check (
  profile_id = current_profile_id()
  and exists (select 1 from stories s where s.id = story_reactions.story_id)
);

drop policy if exists "Modifier sa propre reaction" on story_reactions;
create policy "Modifier sa propre reaction"
on story_reactions for update
to authenticated
using (profile_id = current_profile_id())
with check (profile_id = current_profile_id());

drop policy if exists "Retirer sa propre reaction" on story_reactions;
create policy "Retirer sa propre reaction"
on story_reactions for delete
to authenticated
using (profile_id = current_profile_id());

-- ----------------------------------------------------------------------------
-- 4. Durcissement stockage (item 21/27) — la limite de taille du bucket
-- "avatars" (reutilise pour les statuts) datait d'avant les statuts video
-- et vaut NULL (illimite) en production : aucune limite serveur ne
-- protegeait contre un contournement de la validation cote client (50 Mo,
-- src/lib/mediaConstants.js). Alignee ici pour une vraie defense en
-- profondeur, pas seulement cote client.
-- ----------------------------------------------------------------------------
update storage.buckets set file_size_limit = 52428800 where id = 'avatars';

-- ----------------------------------------------------------------------------
-- Verification (facultatif) :
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';
-- select * from story_views limit 5;
-- select * from story_reactions limit 5;
-- ============================================================================
