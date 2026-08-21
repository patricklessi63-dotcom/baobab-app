-- ============================================================================
-- Phase — Baobab Info Canada 2.0 — à exécuter dans Supabase : SQL Editor
-- (une fois).
-- ============================================================================
-- AUDIT PRÉALABLE : aucune table "info_*" n'existait avant cette phase —
-- module entièrement nouveau, contrairement aux phases précédentes
-- (Rencontres/Communautés) qui réutilisaient une base déjà construite.
-- Catégories et provinces restent des configs statiques côté frontend
-- (même motif que COMMUNITY_CATEGORIES) — pas de table dédiée, pour ne pas
-- créer de tables inutiles (item 42).
--
-- RÈGLE ABSOLUE DU CAHIER DES CHARGES : une IA ne doit jamais publier seule
-- une information sensible ; toute publication passe par une validation
-- humaine explicite (rôle "admin"). Ce fichier construit UNIQUEMENT
-- l'infrastructure (schéma, RLS, workflow) — aucun contenu factuel
-- (immigration, santé, emploi, dates, chiffres, procédures) n'est inséré
-- ici : ce serait exactement le risque d'hallucination que la règle
-- interdit. Le contenu réel doit être saisi par un·e éditeur·rice humain·e
-- via l'interface admin, à partir de sources officielles vérifiées.

-- ----------------------------------------------------------------------------
-- 1. info_editors — qui peut créer/modifier/valider/publier. Table sensible
-- (contrôle qui peut afficher du contenu comme "officiel" à tous les
-- utilisateurs) : même motif que beta_testers — aucune policy INSERT/UPDATE/
-- DELETE cliente, gérée uniquement par le propriétaire via le SQL Editor.
-- Une seule policy SELECT pour qu'un utilisateur puisse savoir s'il/elle est
-- éditeur (affichage conditionnel du bouton "Baobab Info Admin").
-- ----------------------------------------------------------------------------
create table if not exists info_editors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'editor' check (role in ('editor','admin')),
  added_at timestamptz default now(),
  unique (profile_id)
);
alter table info_editors enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='info_editors' loop
    execute format('drop policy %I on public.info_editors', pol.policyname);
  end loop;

  create policy "Un utilisateur voit son propre statut editeur"
  on info_editors for select using (profile_id = current_profile_id());
end $$;

create or replace function info_role(p_profile_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from info_editors where profile_id = p_profile_id;
$$;

create or replace function is_info_editor()
returns boolean language sql stable security definer set search_path = public as $$
  select info_role(current_profile_id()) in ('editor','admin');
$$;

create or replace function is_info_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select info_role(current_profile_id()) = 'admin';
$$;

-- ----------------------------------------------------------------------------
-- 2. info_articles
-- ----------------------------------------------------------------------------
create table if not exists info_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 500),
  body text not null check (char_length(body) between 1 and 20000),
  category text not null,
  province text, -- null = "Canada" (portée nationale) ; jamais présenté comme national si renseigné (item 21)
  city text, -- optionnel, pour "informations locales" (item 22)
  language text not null default 'fr' check (language in ('fr','en')),
  is_priority boolean not null default false, -- section "À savoir maintenant"
  is_guide boolean not null default false, -- filtre "Guide" (item 20)
  status text not null default 'draft' check (status in ('draft','pending_review','approved','published','archived')),
  source_name text,
  source_url text,
  source_name_2 text,
  source_url_2 text,
  published_at timestamptz,
  updated_at timestamptz default now(),
  verified_at timestamptz,
  expires_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  published_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table info_articles enable row level security;
create index if not exists idx_info_articles_status on info_articles(status);
create index if not exists idx_info_articles_category on info_articles(category);
create index if not exists idx_info_articles_published on info_articles(published_at desc) where status = 'published';

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='info_articles' loop
    execute format('drop policy %I on public.info_articles', pol.policyname);
  end loop;

  -- Publié = visible par tout utilisateur authentifié. Non publié = réservé
  -- aux éditeurs (jamais exposé à un utilisateur normal, même en brouillon).
  create policy "Lecture des articles publies ou par les editeurs"
  on info_articles for select
  to authenticated
  using (status = 'published' or is_info_editor());

  -- Toute écriture passe par les RPC ci-dessous (jamais un insert/update
  -- brut côté client) — seule façon de garantir qu'un brouillon ne saute
  -- jamais l'étape de validation humaine (RÈGLE ABSOLUE). Policies quand
  -- même posées pour que les RPC security definer aient un filet, et pour
  -- documenter l'intention.
  create policy "Les editeurs creent des articles"
  on info_articles for insert
  to authenticated
  with check (is_info_editor() and created_by = current_profile_id() and status = 'draft');

  create policy "Les editeurs modifient les articles"
  on info_articles for update
  to authenticated
  using (is_info_editor());
end $$;

-- ----------------------------------------------------------------------------
-- 3. info_article_revisions — historique (items 16/17), snapshot AVANT
-- chaque modification de contenu.
-- ----------------------------------------------------------------------------
create table if not exists info_article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references info_articles(id) on delete cascade,
  title text not null,
  summary text not null,
  body text not null,
  status text not null,
  edited_by uuid references profiles(id) on delete set null,
  created_at timestamptz default now()
);
alter table info_article_revisions enable row level security;
create index if not exists idx_info_revisions_article on info_article_revisions(article_id, created_at desc);

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='info_article_revisions' loop
    execute format('drop policy %I on public.info_article_revisions', pol.policyname);
  end loop;

  create policy "Les editeurs consultent l'historique"
  on info_article_revisions for select to authenticated using (is_info_editor());
  -- Pas de policy insert cliente : uniquement via update_info_article() (security definer).
end $$;

-- ----------------------------------------------------------------------------
-- 4. RPC — cycle de vie éditorial. Chaque transition vérifie explicitement
-- le rôle ET l'état de départ (jamais de saut d'étape, ex. publier un
-- brouillon directement).
-- ----------------------------------------------------------------------------
create or replace function create_info_article(
  p_title text, p_summary text, p_body text, p_category text, p_province text, p_city text,
  p_language text, p_is_priority boolean, p_is_guide boolean,
  p_source_name text, p_source_url text, p_source_name_2 text, p_source_url_2 text, p_expires_at timestamptz
)
returns info_articles
language plpgsql security definer set search_path = public
as $$
declare v_article info_articles;
begin
  if not is_info_editor() then
    raise exception 'Non autorise';
  end if;
  insert into info_articles (
    title, summary, body, category, province, city, language, is_priority, is_guide,
    source_name, source_url, source_name_2, source_url_2, expires_at, created_by
  ) values (
    trim(p_title), trim(p_summary), p_body, p_category, p_province, p_city,
    coalesce(p_language, 'fr'), coalesce(p_is_priority, false), coalesce(p_is_guide, false),
    p_source_name, p_source_url, p_source_name_2, p_source_url_2, p_expires_at, current_profile_id()
  ) returning * into v_article;
  return v_article;
end;
$$;

create or replace function update_info_article(
  p_id uuid, p_title text, p_summary text, p_body text, p_category text, p_province text, p_city text,
  p_source_name text, p_source_url text, p_source_name_2 text, p_source_url_2 text, p_expires_at timestamptz
)
returns info_articles
language plpgsql security definer set search_path = public
as $$
declare v_article info_articles;
begin
  if not is_info_editor() then
    raise exception 'Non autorise';
  end if;
  select * into v_article from info_articles where id = p_id;
  if not found then
    raise exception 'Article introuvable';
  end if;

  insert into info_article_revisions (article_id, title, summary, body, status, edited_by)
  values (v_article.id, v_article.title, v_article.summary, v_article.body, v_article.status, current_profile_id());

  update info_articles set
    title = trim(p_title), summary = trim(p_summary), body = p_body, category = p_category,
    province = p_province, city = p_city, source_name = p_source_name, source_url = p_source_url,
    source_name_2 = p_source_name_2, source_url_2 = p_source_url_2, expires_at = p_expires_at,
    updated_at = now()
  where id = p_id
  returning * into v_article;

  return v_article;
end;
$$;

create or replace function submit_info_article_for_review(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_info_editor() then raise exception 'Non autorise'; end if;
  update info_articles set status = 'pending_review', updated_at = now()
  where id = p_id and status = 'draft';
  if not found then raise exception 'Article introuvable ou statut invalide'; end if;
end;
$$;

-- Validation humaine (RÈGLE ABSOLUE) : seul un role "admin" peut approuver.
create or replace function approve_info_article(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_info_admin() then raise exception 'Non autorise'; end if;
  update info_articles set status = 'approved', approved_by = current_profile_id(), verified_at = now(), updated_at = now()
  where id = p_id and status = 'pending_review';
  if not found then raise exception 'Article introuvable ou statut invalide'; end if;
end;
$$;

create or replace function publish_info_article(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_info_admin() then raise exception 'Non autorise'; end if;
  update info_articles set
    status = 'published', published_by = current_profile_id(),
    published_at = coalesce(published_at, now()), updated_at = now()
  where id = p_id and status = 'approved';
  if not found then raise exception 'Article introuvable ou statut invalide'; end if;
end;
$$;

create or replace function archive_info_article(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_info_editor() then raise exception 'Non autorise'; end if;
  update info_articles set status = 'archived', updated_at = now() where id = p_id;
  if not found then raise exception 'Article introuvable'; end if;
end;
$$;

-- Renvoyer un article publié en brouillon pour correction (item 29).
create or replace function revert_info_article_to_draft(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_info_editor() then raise exception 'Non autorise'; end if;
  update info_articles set status = 'draft', updated_at = now() where id = p_id;
  if not found then raise exception 'Article introuvable'; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. info_bookmarks — meme motif que community_post_likes.
-- ----------------------------------------------------------------------------
create table if not exists info_bookmarks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references info_articles(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (article_id, profile_id)
);
alter table info_bookmarks enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='info_bookmarks' loop
    execute format('drop policy %I on public.info_bookmarks', pol.policyname);
  end loop;

  create policy "Lecture de ses propres favoris"
  on info_bookmarks for select using (profile_id = current_profile_id());

  create policy "Sauvegarder en son propre nom"
  on info_bookmarks for insert with check (profile_id = current_profile_id());

  create policy "Retirer son propre favori"
  on info_bookmarks for delete using (profile_id = current_profile_id());
end $$;

-- ----------------------------------------------------------------------------
-- 6. info_reports — signaler une erreur (item 28), meme motif que
-- community_reports (SELECT reserve aux editeurs).
-- ----------------------------------------------------------------------------
create table if not exists info_reports (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references info_articles(id) on delete cascade,
  from_id uuid not null references profiles(id) on delete cascade,
  category text not null check (category in ('obsolete','lien_incorrect','erreur','source_indisponible','trompeuse','autre')),
  reason text,
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at timestamptz default now()
);
alter table info_reports enable row level security;

do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='info_reports' loop
    execute format('drop policy %I on public.info_reports', pol.policyname);
  end loop;

  create policy "Signaler en son propre nom"
  on info_reports for insert with check (from_id = current_profile_id());

  create policy "Les editeurs voient les signalements"
  on info_reports for select using (is_info_editor());

  create policy "Les editeurs traitent les signalements"
  on info_reports for update using (is_info_editor());
end $$;

-- ----------------------------------------------------------------------------
-- 7. Préférences de catégories (item 24) — reutilise notification_preferences
-- existant (jsonb sur profiles) sous une nouvelle cle "info_categories"
-- plutot que d'ajouter une colonne/table dediee.
-- Aucune migration necessaire : lu/ecrit directement par le frontend comme
-- currentUser.notification_preferences?.info_categories (array).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 8. Notification "nouvelle information importante" — reutilise la table
-- notifications generique existante.
-- ----------------------------------------------------------------------------
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (type in (
  'join_request_received','join_request_accepted','invite_received','report_received',
  'event_invite','event_participation_confirmed','event_updated','event_cancelled',
  'event_reminder_24h','event_reminder_1h','event_report_received','event_waitlist_promoted',
  'premium_activated','premium_payment_failed','premium_cancelled','premium_renewing_soon',
  'new_follower','post_liked','post_commented','new_like','new_match','new_message',
  'info_article_published'
));

-- Fan-out limite (item 23) : seulement pour les articles marques prioritaires,
-- vers les profils ayant explicitement choisi cette categorie dans leurs
-- preferences (item 24) — opt-in strict, jamais d'envoi de masse par defaut.
create or replace function notify_info_article_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (old.status is distinct from 'published') and new.is_priority then
    insert into notifications (recipient_id, type, target_type, target_id, payload)
    select p.id, 'info_article_published', 'info_article', new.id, jsonb_build_object('title', new.title)
    from profiles p
    where p.notification_preferences->'info_categories' @> to_jsonb(new.category::text);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_notify_info_article_published on info_articles;
create trigger trg_notify_info_article_published after update on info_articles
for each row execute function notify_info_article_published();

-- ----------------------------------------------------------------------------
-- 9. Se nommer soi-meme premier admin (a executer separement, une fois,
-- avec ton propre profile_id) :
-- insert into info_editors (profile_id, role)
--   select id, 'admin' from profiles where user_id = auth.uid();
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select tablename from pg_tables where schemaname='public' and tablename like 'info_%';
-- select proname from pg_proc where proname like '%info_article%';
-- select policyname, cmd from pg_policies where tablename like 'info_%';
-- ============================================================================
