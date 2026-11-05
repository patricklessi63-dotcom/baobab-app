-- ============================================================================
-- SQL-31 — Modération de texte, sanctions progressives, signalements d'images (100 % gratuit)
--
-- LIVRÉ, NON EXÉCUTÉ. À jouer d'abord sur le PROJET DE RÉPÉTITION (LANCEMENT.md §9.7), jamais
-- collé depuis une page web ni depuis un éditeur qui abîme les émojis : ce fichier ne contient
-- AUCUN émoji ni caractère spécial en clair (tout passe par des codes Unicode E'\uXXXX' / chr()).
-- Lecture complète : MODERATION.md (installation, retour arrière, limites, décisions à valider).
--
-- Contenu :
--   1. Réglages (moderation_settings) et interrupteur général text_filter_enabled.
--   2. Liste de termes interdits et d'exceptions, modifiables par les administrateurs.
--   3. moderation_normalize() / moderation_check() : MIROIR de src/lib/contentModeration.js.
--   4. Infractions, sanctions progressives (échelle configurable), décisions, appels.
--   5. moderation_screen() : appelée par l'application quand elle détecte un texte à refuser.
--   6. Déclencheurs « filet » sur messages, publications, commentaires, statuts, biographies :
--      refusent côté serveur même si l'application est contournée (échec OUVERT : une panne
--      du filtre ne bloque jamais la messagerie).
--   7. Signalements d'images : masquage temporaire après N signalements indépendants,
--      file de modération humaine, jamais de suppression automatique définitive.
--   8. Fonctions réservées aux modérateurs / administrateurs.
--
-- Prérequis (déjà en production) : current_profile_id(), platform_role(), is_moderator_or_above(),
-- is_admin_or_above() (supabase-admin.sql), colonnes profiles.suspended_until / banned_at.
-- PostgreSQL 13+ (fonction normalize(), présente sur Supabase).
-- Retour arrière : supabase-moderation-text-rollback.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Réglages (une seule ligne)
-- ----------------------------------------------------------------------------
create table if not exists moderation_settings (
  id int primary key default 1 check (id = 1),
  text_filter_enabled boolean not null default true,
  -- Fenêtre de décompte des infractions confirmées (les anciennes ne comptent plus).
  window_days int not null default 365 check (window_days between 1 and 3650),
  -- Échelle (voir moderation_apply_ladder) : les colonnes warnings_before_suspension, suspension_hours
  -- et suspensions_before_ban sont ajoutées juste après (alter ... add column if not exists), pour que
  -- le fichier reste rejouable sur une base où l'ancienne version (colonne « steps ») aurait été jouée.
  -- Faux : le palier « ban » devient une suspension de 30 jours à confirmer par un modérateur.
  -- Vrai (défaut, conforme au cahier des charges) : bannissement automatique à la 3e suspension.
  -- Garde-fous : seules les détections CERTAINES comptent, un modérateur peut annuler, la personne peut
  -- contester, et l'interrupteur général / ce réglage restent modifiables par un administrateur.
  auto_ban_enabled boolean not null default true,
  media_report_threshold int not null default 3 check (media_report_threshold >= 2),
  media_reports_per_hour int not null default 10 check (media_reports_per_hour >= 1),
  -- Réservé à une future analyse automatique d'images : AUCUN fournisseur n'est actif.
  image_provider text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id) on delete set null
);
-- Échelle de sanctions : infractions 1 à `warnings_before_suspension` = avertissement ; la suivante = suspension
-- de `suspension_hours` heures ; on continue de compter ; la `suspensions_before_ban`-ième suspension = bannissement.
alter table moderation_settings add column if not exists warnings_before_suspension int not null default 4 check (warnings_before_suspension between 0 and 50);
alter table moderation_settings add column if not exists suspension_hours int not null default 24 check (suspension_hours between 1 and 8760);
alter table moderation_settings add column if not exists suspensions_before_ban int not null default 3 check (suspensions_before_ban between 1 and 20);
-- Defauts du cahier des charges aussi sur une table deja creee par une version precedente. La LIGNE existante n'est
-- jamais ecrasee (un administrateur a pu regler autrement) : voir MODERATION.md, section 3, pour l'aligner a la main.
alter table moderation_settings alter column window_days set default 365;
alter table moderation_settings alter column auto_ban_enabled set default true;
insert into moderation_settings (id) values (1) on conflict (id) do nothing;
alter table moderation_settings enable row level security;
drop policy if exists "Reglages de moderation lisibles par les moderateurs" on moderation_settings;
create policy "Reglages de moderation lisibles par les moderateurs"
on moderation_settings for select to authenticated using (is_moderator_or_above());

-- ----------------------------------------------------------------------------
-- 2. Termes interdits et exceptions
-- ----------------------------------------------------------------------------
create table if not exists moderation_terms (
  id bigint generated always as identity primary key,
  term text not null check (char_length(btrim(term)) between 2 and 80),
  term_norm text not null,
  category text not null check (category in ('insulte','racisme','homophobie','menace','harcelement')),
  severity text not null default 'block' check (severity in ('block','review')),
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists moderation_terms_norm_key on moderation_terms (term_norm);

create table if not exists moderation_exceptions (
  id bigint generated always as identity primary key,
  phrase text not null check (char_length(btrim(phrase)) between 2 and 80),
  phrase_norm text not null,
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists moderation_exceptions_norm_key on moderation_exceptions (phrase_norm);

alter table moderation_terms enable row level security;
alter table moderation_exceptions enable row level security;
-- Lisibles par les comptes connectés : l'application s'en sert pour refuser avant l'envoi.
-- Compromis connu : la liste est donc lisible (voir MODERATION.md, limites).
drop policy if exists "Termes actifs lisibles" on moderation_terms;
create policy "Termes actifs lisibles" on moderation_terms for select to authenticated using (active or is_moderator_or_above());
drop policy if exists "Exceptions actives lisibles" on moderation_exceptions;
create policy "Exceptions actives lisibles" on moderation_exceptions for select to authenticated using (active or is_moderator_or_above());

-- ----------------------------------------------------------------------------
-- 3. Normalisation et détection — MIROIR de src/lib/contentModeration.js
--    (toute modification ici doit être reportée dans le fichier JS, et inversement ;
--     contentModeration.sqlMirror.test.js vérifie les tables de caractères).
-- ----------------------------------------------------------------------------
create or replace function moderation_normalize(p_text text)
returns text language plpgsql immutable set search_path = public as $$
declare
  s text;
  toks text[];
  tok text;
  outt text[] := '{}';
  run text[] := '{}';
begin
  s := lower(coalesce(p_text, ''));
  -- caractères invisibles : U+200B U+200C U+200D U+FEFF U+00AD U+2060
  s := regexp_replace(s, '[' || chr(8203) || chr(8204) || chr(8205) || chr(65279) || chr(173) || chr(8288) || ']', '', 'g');
  -- décomposition (pleine chasse, accents), puis suppression des signes combinants U+0300-U+036F
  s := regexp_replace(normalize(s, NFKD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g');
  -- homoglyphes cyrilliques et grecs -> lettres latines
  s := translate(s,
    E'\u0430\u0432\u0441\u0435\u043d\u043a\u043c\u043e\u0440\u0442\u0443\u0445\u0456\u0458\u0455\u03bf\u03b1\u03b5\u03b9\u03bd\u03c4\u03c5\u03c1\u03ba\u03c7',
    'abcehkmoptyxijsoaeivtupkx');
  -- substitutions : 0=o 1=i 3=e 4=a 5=s 7=t @=a $=s (euro)=e +=t
  s := translate(s, E'013457@$\u20ac+', 'oieastaset');
  s := btrim(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'));
  -- répétitions de 3 lettres ou plus réduites à 2
  s := regexp_replace(s, '(.)\1\1+', '\1\1', 'g');
  if s = '' then return ''; end if;
  -- lettres isolées recollées (3 ou plus d'affilée) : c.o.n.n.a.r.d, f.d.p
  toks := string_to_array(s, ' ');
  foreach tok in array toks loop
    if length(tok) = 1 then
      run := run || tok;
    else
      if coalesce(array_length(run, 1), 0) >= 3 then outt := outt || array_to_string(run, '');
      else outt := outt || run; end if;
      run := '{}';
      outt := outt || tok;
    end if;
  end loop;
  if coalesce(array_length(run, 1), 0) >= 3 then outt := outt || array_to_string(run, '');
  else outt := outt || run; end if;
  return array_to_string(outt, ' ');
end;
$$;

-- Forme normalisée d'un TERME de la liste (sans recollage ni réduction).
create or replace function moderation_normalize_term(p_term text)
returns text language plpgsql immutable set search_path = public as $$
declare s text;
begin
  s := lower(coalesce(p_term, ''));
  s := regexp_replace(s, '[' || chr(8203) || chr(8204) || chr(8205) || chr(65279) || chr(173) || chr(8288) || ']', '', 'g');
  s := regexp_replace(normalize(s, NFKD), '[' || chr(768) || '-' || chr(879) || ']', '', 'g');
  return btrim(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'));
end;
$$;

create or replace function moderation_terms_set_norm()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'moderation_terms' then
    new.term_norm := moderation_normalize_term(new.term);
    if new.term_norm = '' then raise exception 'Terme invalide'; end if;
  else
    new.phrase_norm := moderation_normalize_term(new.phrase);
    if new.phrase_norm = '' then raise exception 'Expression invalide'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_moderation_terms_norm on moderation_terms;
create trigger trg_moderation_terms_norm before insert or update of term on moderation_terms
  for each row execute function moderation_terms_set_norm();
drop trigger if exists trg_moderation_exceptions_norm on moderation_exceptions;
create trigger trg_moderation_exceptions_norm before insert or update of phrase on moderation_exceptions
  for each row execute function moderation_terms_set_norm();

-- Résultat : une ligne. blocked = refus ; flagged = accepté mais à relire (terme « review »).
create or replace function moderation_check(p_text text)
returns table (blocked boolean, flagged boolean, category text, term text, severity text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_norm text;
  ex record;
  t record;
begin
  blocked := false; flagged := false; category := null; term := null; severity := null;
  v_norm := ' ' || moderation_normalize(p_text) || ' ';
  if btrim(v_norm) = '' then return next; return; end if;
  for ex in select e.phrase_norm from moderation_exceptions e where e.active loop
    v_norm := replace(v_norm, ' ' || ex.phrase_norm || ' ', ' ');
  end loop;
  v_norm := btrim(v_norm);
  for t in
    select m.term as term_raw, m.term_norm as term_norm, m.category as cat, m.severity as sev
    from moderation_terms m where m.active
    order by (m.severity = 'block') desc, m.id
  loop
    if v_norm ~ ('(^| )' || t.term_norm || '(s|es|x)?( |$)') then
      if t.sev = 'block' then
        blocked := true; flagged := false; category := t.cat; term := t.term_raw; severity := 'block';
        return next; return;
      end if;
      if not flagged then
        flagged := true; category := t.cat; term := t.term_raw; severity := 'review';
      end if;
    end if;
  end loop;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Infractions, sanctions, décisions
-- ----------------------------------------------------------------------------
create table if not exists moderation_violations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  source text not null check (source in ('message','post','comment','community_post','bio','status')),
  category text,
  term text,
  severity text,
  excerpt text check (excerpt is null or char_length(excerpt) <= 200),
  text_hash text not null,
  -- counted : infraction certaine, compte pour l'échelle ; flagged : à relire, ne compte pas ;
  -- overturned : annulée par un modérateur.
  status text not null default 'counted' check (status in ('counted','flagged','overturned')),
  created_at timestamptz not null default now()
);
create index if not exists moderation_violations_profile_idx on moderation_violations (profile_id, created_at desc);
create index if not exists moderation_violations_status_idx on moderation_violations (status, created_at desc);
alter table moderation_violations enable row level security;
drop policy if exists "Infractions lisibles par les moderateurs" on moderation_violations;
create policy "Infractions lisibles par les moderateurs" on moderation_violations for select to authenticated using (is_moderator_or_above());

create table if not exists moderation_sanctions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  violation_id uuid references moderation_violations(id) on delete set null,
  kind text not null check (kind in ('warning','suspension','ban')),
  until_at timestamptz,
  reason text,
  automatic boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references profiles(id) on delete set null,
  revoke_reason text,
  appeal_status text check (appeal_status in ('pending','accepted','rejected')),
  appeal_text text check (appeal_text is null or char_length(appeal_text) <= 1000),
  appeal_at timestamptz
);
-- Une infraction ne produit jamais deux sanctions.
create unique index if not exists moderation_sanctions_one_per_violation on moderation_sanctions (violation_id) where violation_id is not null;
create index if not exists moderation_sanctions_profile_idx on moderation_sanctions (profile_id, created_at desc);
create index if not exists moderation_sanctions_appeal_idx on moderation_sanctions (appeal_status) where appeal_status = 'pending';
alter table moderation_sanctions enable row level security;
drop policy if exists "Sanctions visibles par la personne et les moderateurs" on moderation_sanctions;
create policy "Sanctions visibles par la personne et les moderateurs"
on moderation_sanctions for select to authenticated
using (profile_id = current_profile_id() or is_moderator_or_above());

-- Journal des décisions humaines de la modération (en complément de admin_actions).
create table if not exists moderation_decisions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,
  target_profile_id uuid references profiles(id) on delete set null,
  target_ref text,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists moderation_decisions_created_idx on moderation_decisions (created_at desc);
alter table moderation_decisions enable row level security;
drop policy if exists "Decisions lisibles par les moderateurs" on moderation_decisions;
create policy "Decisions lisibles par les moderateurs" on moderation_decisions for select to authenticated using (is_moderator_or_above());

-- Applique l'échelle de sanctions à une infraction CONFIRMÉE (status = 'counted').
-- Règle (réglages modifiables par un administrateur) : avec W = warnings_before_suspension (4 par défaut),
-- les infractions 1 à W sont des avertissements ; la (W+1)-ième = suspension de suspension_hours heures (24) ;
-- on CONTINUE de compter ; chaque multiple de (W+1) est une nouvelle suspension ; la suspensions_before_ban-ième
-- (3) = bannissement (si auto_ban_enabled ; sinon suspension de 30 jours à confirmer par un modérateur).
-- Une infraction ne produit jamais deux sanctions (index unique) ; un signalement non vérifié ne compte jamais.
create or replace function moderation_apply_ladder(p_profile uuid, p_violation uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s moderation_settings%rowtype;
  n int;
  v_cycle int;
  v_rank int;
  v_action text;
  v_kind text;
  v_hours int;
  v_until timestamptz;
  v_reason text := 'Moderation automatique : propos non autorises';
begin
  -- verrou par compte : deux infractions simultanées ne peuvent pas lire le même décompte (même rang de sanction)
  perform pg_advisory_xact_lock(hashtextextended(p_profile::text, 0));
  select * into s from moderation_settings where id = 1;
  -- l'équipe de la plateforme n'est jamais sanctionnée automatiquement
  if platform_role(p_profile) is not null then return jsonb_build_object('sanction', null, 'staff', true); end if;
  -- une infraction = une sanction au plus
  if exists (select 1 from moderation_sanctions where violation_id = p_violation) then
    return jsonb_build_object('sanction', null, 'duplicate', true);
  end if;

  select count(*) into n from moderation_violations
  where profile_id = p_profile and status = 'counted'
    and created_at > now() - make_interval(days => s.window_days);

  v_cycle := s.warnings_before_suspension + 1;
  if n % v_cycle <> 0 then
    v_action := 'warning';
  else
    v_rank := n / v_cycle; -- numéro de la suspension (1re, 2e, 3e...)
    v_action := case when v_rank >= s.suspensions_before_ban then 'ban' else 'suspend' end;
    v_hours := s.suspension_hours;
    if v_action = 'ban' and not s.auto_ban_enabled then
      v_action := 'suspend';
      v_hours := 720;
      v_reason := v_reason || ' (bannissement a confirmer par un moderateur)';
    end if;
  end if;

  -- Ecriture serveur autorisee sur les colonnes protegees de profiles (suspended_until, banned_at...) : sans ce drapeau,
  -- trg_protect_profile_trust_columns refuse l'UPDATE quand l'appel vient d'un compte connecte (comme suspend_user / ban_user).
  perform set_config('baobab.trust_column_write', 'on', true);
  if v_action = 'warning' then
    v_kind := 'warning';
  elsif v_action = 'suspend' then
    v_kind := 'suspension';
    v_until := now() + make_interval(hours => v_hours);
    update profiles
      set suspended_until = greatest(coalesce(suspended_until, v_until), v_until), suspend_reason = v_reason
      where id = p_profile;
  else
    v_kind := 'ban';
    update profiles set banned_at = coalesce(banned_at, now()), ban_reason = v_reason where id = p_profile;
  end if;

  insert into moderation_sanctions (profile_id, violation_id, kind, until_at, reason)
  values (p_profile, p_violation, v_kind, v_until, v_reason);
  return jsonb_build_object('sanction', v_kind, 'until', v_until, 'count', n,
    'warnings_left', case when v_kind = 'warning' then s.warnings_before_suspension - (n % v_cycle) else null end);
end;
$$;

create or replace function moderation_record_flag(p_profile uuid, p_source text, p_text text, p_category text, p_term text, p_severity text)
returns void language plpgsql security definer set search_path = public as $$
declare v_hash text := md5(moderation_normalize(p_text));
begin
  -- VIE PRIVEE : un message prive n'entre jamais dans la file de relecture humaine (ni texte ni extrait).
  if p_source = 'message' then return; end if;
  -- même texte déjà relevé depuis moins de 24 h : pas de doublon dans la file
  if exists (select 1 from moderation_violations where profile_id = p_profile and text_hash = v_hash and created_at > now() - interval '1 day') then return; end if;
  insert into moderation_violations (profile_id, source, category, term, severity, excerpt, text_hash, status)
  values (p_profile, p_source, p_category, p_term, p_severity, left(p_text, 200), v_hash, 'flagged');
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. moderation_screen() — appelée par l'application quand elle détecte un texte à refuser
--    ou à relire. Le serveur REFAIT la détection : il ne fait jamais confiance au client.
-- ----------------------------------------------------------------------------
create or replace function moderation_screen(p_source text, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile uuid := current_profile_id();
  s moderation_settings%rowtype;
  r record;
  v_hash text;
  v_id uuid;
  v_text text;
begin
  if v_profile is null then raise exception 'Non autorise'; end if;
  if p_source not in ('message','post','comment','community_post','bio','status') then raise exception 'Source invalide'; end if;
  select * into s from moderation_settings where id = 1;
  if not s.text_filter_enabled then return jsonb_build_object('allowed', true); end if;
  v_text := left(coalesce(p_text, ''), 4000);
  select * into r from moderation_check(v_text);
  if not r.blocked and not r.flagged then return jsonb_build_object('allowed', true); end if;
  if not r.blocked then
    perform moderation_record_flag(v_profile, p_source, v_text, r.category, r.term, r.severity);
    return jsonb_build_object('allowed', true, 'flagged', true);
  end if;
  v_hash := md5(moderation_normalize(v_text));
  -- le même texte renvoyé en boucle n'est PAS une nouvelle infraction (10 minutes)
  if exists (select 1 from moderation_violations
             where profile_id = v_profile and text_hash = v_hash and status = 'counted'
               and created_at > now() - interval '10 minutes') then
    return jsonb_build_object('allowed', false, 'duplicate', true);
  end if;
  insert into moderation_violations (profile_id, source, category, term, severity, excerpt, text_hash, status)
  values (v_profile, p_source, r.category, r.term, 'block',
          case when p_source = 'message' then null else left(v_text, 200) end, v_hash, 'counted')
  returning id into v_id;
  return jsonb_build_object('allowed', false) || moderation_apply_ladder(v_profile, v_id);
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Déclencheurs « filet » (refus côté serveur même si l'application est contournée)
--    Échec OUVERT : une erreur interne du filtre laisse passer le texte (jamais de
--    messagerie bloquée par une panne). Interrupteur : moderation_settings.text_filter_enabled.
--    Un refus lève P0001 'MODERATION_REFUSED: ...' que friendlyDbError() affiche tel quel.
--    Un refus annule l'insertion : l'infraction n'est PAS comptée ici (voir MODERATION.md).
-- ----------------------------------------------------------------------------
create or replace function moderation_guard_text()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_col text := tg_argv[0];
  v_source text := tg_argv[1];
  v_txt text;
  v_block boolean := false;
  v_enabled boolean;
  v_profile uuid;
  r record;
begin
  v_txt := to_jsonb(new) ->> v_col;
  if v_txt is null or btrim(v_txt) = '' then return new; end if;
  if tg_op = 'UPDATE' and (to_jsonb(old) ->> v_col) is not distinct from v_txt then return new; end if;
  if tg_table_name = 'messages' and coalesce(to_jsonb(new) ->> 'kind', 'text') <> 'text' then return new; end if;
  -- insertions système (clé de service) : pas d'utilisateur connecté, pas de contrôle
  if auth.uid() is null then return new; end if;
  begin
    select text_filter_enabled into v_enabled from moderation_settings where id = 1;
    if coalesce(v_enabled, false) then
      select * into r from moderation_check(left(v_txt, 4000));
      if r.blocked then
        v_block := true;
      elsif r.flagged then
        v_profile := current_profile_id();
        if v_profile is not null then
          perform moderation_record_flag(v_profile, v_source, v_txt, r.category, r.term, r.severity);
        end if;
      end if;
    end if;
  exception when others then
    v_block := false; -- échec ouvert
  end;
  if v_block then
    raise exception '%', 'MODERATION_REFUSED: Ce contenu contient des propos non autoris' || chr(233) || 's. Les r' || chr(233) || 'cidives entra' || chr(238) || 'nent une suspension, puis un bannissement (voir les Conditions d''utilisation).' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_moderation_messages on messages;
create trigger trg_moderation_messages before insert or update of text on messages
  for each row execute function moderation_guard_text('text', 'message');
drop trigger if exists trg_moderation_posts on posts;
create trigger trg_moderation_posts before insert or update of body on posts
  for each row execute function moderation_guard_text('body', 'post');
drop trigger if exists trg_moderation_post_comments on post_comments;
create trigger trg_moderation_post_comments before insert or update of body on post_comments
  for each row execute function moderation_guard_text('body', 'comment');
drop trigger if exists trg_moderation_community_posts on community_posts;
create trigger trg_moderation_community_posts before insert or update of body on community_posts
  for each row execute function moderation_guard_text('body', 'community_post');
drop trigger if exists trg_moderation_community_comments on community_comments;
create trigger trg_moderation_community_comments before insert or update of body on community_comments
  for each row execute function moderation_guard_text('body', 'comment');
drop trigger if exists trg_moderation_event_comments on event_comments;
create trigger trg_moderation_event_comments before insert or update of body on event_comments
  for each row execute function moderation_guard_text('body', 'comment');
drop trigger if exists trg_moderation_stories on stories;
create trigger trg_moderation_stories before insert or update of text on stories
  for each row execute function moderation_guard_text('text', 'status');
-- Profil : biographie, nom affiche, nom de famille, metier (textes visibles par les autres membres). INSERT compris :
-- un profil cree directement avec un nom injurieux serait sinon accepte. Les refus comptent sous la source 'bio' (texte de profil).
drop trigger if exists trg_moderation_profiles_bio on profiles;
create trigger trg_moderation_profiles_bio before insert or update of bio on profiles
  for each row execute function moderation_guard_text('bio', 'bio');
drop trigger if exists trg_moderation_profiles_name on profiles;
create trigger trg_moderation_profiles_name before insert or update of name on profiles
  for each row execute function moderation_guard_text('name', 'bio');
drop trigger if exists trg_moderation_profiles_last_name on profiles;
create trigger trg_moderation_profiles_last_name before insert or update of last_name on profiles
  for each row execute function moderation_guard_text('last_name', 'bio');
drop trigger if exists trg_moderation_profiles_occupation on profiles;
create trigger trg_moderation_profiles_occupation before insert or update of occupation on profiles
  for each row execute function moderation_guard_text('occupation', 'bio');

-- ----------------------------------------------------------------------------
-- 7. Signalements d'images
-- ----------------------------------------------------------------------------
create table if not exists media_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_kind text not null check (target_kind in ('story','post','post_media','community_post','event_media','message_media','avatar','profile_photo')),
  -- text et non uuid : profile_photos.id est un ENTIER (bigint) en production, les autres medias ont un uuid.
  target_id text not null,
  reason text not null check (reason in ('sexuel','violence','haine','harcelement','mineur','autre')),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  -- un signalement par personne et par image : impossible de gonfler le compteur
  unique (reporter_id, target_kind, target_id)
);
create index if not exists media_reports_target_idx on media_reports (target_kind, target_id);
create index if not exists media_reports_reporter_idx on media_reports (reporter_id, created_at desc);
alter table media_reports enable row level security;
drop policy if exists "Signalements d'images lisibles par les moderateurs" on media_reports;
create policy "Signalements d'images lisibles par les moderateurs" on media_reports for select to authenticated using (is_moderator_or_above());

create table if not exists media_moderation (
  target_kind text not null,
  target_id text not null,
  status text not null default 'visible' check (status in ('visible','hidden','removed')),
  report_count int not null default 0,
  -- suspicious : seuil atteint mais surtout par des comptes très récents (campagne possible) :
  -- l'image reste visible et attend un humain.
  suspicious boolean not null default false,
  -- locked : un modérateur a tranché (rétablie) ; plus aucun masquage automatique.
  locked boolean not null default false,
  hidden_at timestamptz,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  -- Réservés à une future analyse automatique (aucun fournisseur actif aujourd'hui).
  provider text,
  scores jsonb,
  updated_at timestamptz not null default now(),
  primary key (target_kind, target_id)
);
alter table media_moderation enable row level security;
-- Lisible par les comptes connectés : l'application masque les images « hidden » / « removed ».
drop policy if exists "Etat de moderation des images lisible" on media_moderation;
create policy "Etat de moderation des images lisible" on media_moderation for select to authenticated using (true);

-- Mise a niveau d'une base ou la version precedente (target_id uuid) a deja ete jouee : colonnes uuid -> text, anciennes signatures retirees
-- (sans quoi les deux versions coexisteraient et l'appel serait ambigu). Sans effet sur une base neuve.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_reports' and column_name = 'target_id' and data_type = 'uuid') then
    alter table media_reports alter column target_id type text using target_id::text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'media_moderation' and column_name = 'target_id' and data_type = 'uuid') then
    alter table media_moderation alter column target_id type text using target_id::text;
  end if;
end;
$$;
drop function if exists report_media(text, uuid, text, text);
drop function if exists moderate_media(text, uuid, text, text);
drop function if exists admin_media_info(text, uuid);
drop function if exists admin_media_queue(int);

create or replace function report_media(p_kind text, p_id text, p_reason text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rep uuid := current_profile_id();
  s moderation_settings%rowtype;
  v_recent int;
  v_total int;
  v_new int;
  v_cur media_moderation%rowtype;
  v_hide boolean;
begin
  if v_rep is null then raise exception 'Non autorise'; end if;
  select * into s from moderation_settings where id = 1;
  select count(*) into v_recent from media_reports where reporter_id = v_rep and created_at > now() - interval '1 hour';
  if v_recent >= s.media_reports_per_hour then
    raise exception 'REPORT_RATE_LIMIT: Trop de signalements en peu de temps, reessaie plus tard.' using errcode = 'P0001';
  end if;
  insert into media_reports (reporter_id, target_kind, target_id, reason, note)
  values (v_rep, p_kind, p_id, p_reason, left(p_note, 500))
  on conflict (reporter_id, target_kind, target_id) do nothing;
  if not found then return jsonb_build_object('duplicate', true); end if;

  select count(*), count(*) filter (where p.created_at > now() - interval '2 days')
    into v_total, v_new
  from media_reports r join profiles p on p.id = r.reporter_id
  where r.target_kind = p_kind and r.target_id = p_id;

  insert into media_moderation (target_kind, target_id) values (p_kind, p_id) on conflict do nothing;
  select * into v_cur from media_moderation where target_kind = p_kind and target_id = p_id for update;

  v_hide := v_total >= s.media_report_threshold and (v_new * 2) <= v_total and not v_cur.locked and v_cur.status = 'visible';
  update media_moderation
    set report_count = v_total,
        suspicious = (v_total >= s.media_report_threshold and (v_new * 2) > v_total),
        status = case when v_hide then 'hidden' else status end,
        hidden_at = case when v_hide then now() else hidden_at end,
        updated_at = now()
    where target_kind = p_kind and target_id = p_id;
  return jsonb_build_object('reports', v_total, 'hidden', v_hide);
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Fonctions réservées aux modérateurs et administrateurs
-- ----------------------------------------------------------------------------
create or replace function moderation_require_moderator()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  -- coalesce : is_*_or_above() renvoie NULL (pas faux) pour une personne sans rôle ; `if not NULL` ne lèverait rien
  if not coalesce(is_moderator_or_above(), false) then raise exception 'Non autorise'; end if;
end;
$$;

-- File « textes à relire » et historique des infractions.
create or replace function admin_moderation_violations(p_status text default 'flagged', p_limit int default 100)
returns table (id uuid, profile_id uuid, profile_name text, source text, category text, term text, severity text, excerpt text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  return query
    select v.id, v.profile_id, p.name, v.source, v.category, v.term, v.severity, v.excerpt, v.status, v.created_at
    from moderation_violations v join profiles p on p.id = v.profile_id
    where (p_status = 'all' or v.status = p_status)
    order by v.created_at desc limit least(greatest(p_limit, 1), 500);
end;
$$;

create or replace function admin_moderation_sanctions(p_only_appeals boolean default false, p_limit int default 100)
returns table (id uuid, profile_id uuid, profile_name text, kind text, until_at timestamptz, reason text, automatic boolean, created_at timestamptz, revoked_at timestamptz, appeal_status text, appeal_text text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  return query
    select x.id, x.profile_id, p.name, x.kind, x.until_at, x.reason, x.automatic, x.created_at, x.revoked_at, x.appeal_status, x.appeal_text
    from moderation_sanctions x join profiles p on p.id = x.profile_id
    where (not p_only_appeals or x.appeal_status = 'pending')
    order by x.created_at desc limit least(greatest(p_limit, 1), 500);
end;
$$;

create or replace function admin_media_queue(p_limit int default 100)
returns table (target_kind text, target_id text, status text, report_count int, suspicious boolean, locked boolean, hidden_at timestamptz, reasons text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  return query
    select m.target_kind, m.target_id, m.status, m.report_count, m.suspicious, m.locked, m.hidden_at,
           (select string_agg(distinct r.reason, ', ') from media_reports r where r.target_kind = m.target_kind and r.target_id = m.target_id)
    from media_moderation m
    where m.status = 'hidden' or m.suspicious
    order by m.updated_at desc limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Un texte « à relire » : approuver (rien) ou confirmer (compte dans l'échelle + sanction).
create or replace function moderation_resolve_flag(p_violation_id uuid, p_confirm boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v moderation_violations%rowtype; res jsonb := '{}'::jsonb;
begin
  perform moderation_require_moderator();
  select * into v from moderation_violations where id = p_violation_id for update;
  if not found or v.status <> 'flagged' then raise exception 'Infraction introuvable ou deja traitee'; end if;
  if p_confirm then
    update moderation_violations set status = 'counted' where id = v.id;
    res := moderation_apply_ladder(v.profile_id, v.id);
  else
    update moderation_violations set status = 'overturned' where id = v.id;
  end if;
  insert into moderation_decisions (actor_id, action, target_profile_id, target_ref, reason)
  values (current_profile_id(), case when p_confirm then 'flag_confirmed' else 'flag_approved' end, v.profile_id, v.id::text, p_reason);
  return res;
end;
$$;

-- Annule une sanction (modérateur) : rétablit le compte si aucune autre sanction active.
create or replace function moderation_revoke_sanction(p_sanction_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare x moderation_sanctions%rowtype; v_until timestamptz;
begin
  perform moderation_require_moderator();
  select * into x from moderation_sanctions where id = p_sanction_id for update;
  if not found then raise exception 'Sanction introuvable'; end if;
  if x.revoked_at is not null then return; end if;
  perform set_config('baobab.trust_column_write', 'on', true);
  update moderation_sanctions set revoked_at = now(), revoked_by = current_profile_id(), revoke_reason = p_reason where id = x.id;
  if x.violation_id is not null then update moderation_violations set status = 'overturned' where id = x.violation_id; end if;
  if x.kind = 'suspension' then
    select max(until_at) into v_until from moderation_sanctions
      where profile_id = x.profile_id and kind = 'suspension' and revoked_at is null and until_at > now();
    update profiles set suspended_until = v_until, suspend_reason = case when v_until is null then null else suspend_reason end where id = x.profile_id;
  elsif x.kind = 'ban' then
    if not exists (select 1 from moderation_sanctions where profile_id = x.profile_id and kind = 'ban' and revoked_at is null) then
      update profiles set banned_at = null, ban_reason = null where id = x.profile_id;
    end if;
  end if;
  insert into moderation_decisions (actor_id, action, target_profile_id, target_ref, reason)
  values (current_profile_id(), 'sanction_revoked', x.profile_id, x.id::text, p_reason);
end;
$$;

-- Appel de la personne sanctionnée (une seule contestation par sanction).
create or replace function moderation_appeal(p_sanction_id uuid, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare x moderation_sanctions%rowtype;
begin
  if char_length(btrim(coalesce(p_text, ''))) < 10 then raise exception 'APPEAL_TOO_SHORT: Explique ta contestation en quelques phrases.' using errcode = 'P0001'; end if;
  select * into x from moderation_sanctions where id = p_sanction_id for update;
  if not found or x.profile_id <> current_profile_id() then raise exception 'Non autorise'; end if;
  if x.revoked_at is not null or x.appeal_status is not null then raise exception 'APPEAL_UNAVAILABLE: Cette sanction ne peut plus etre contestee.' using errcode = 'P0001'; end if;
  update moderation_sanctions set appeal_status = 'pending', appeal_text = left(btrim(p_text), 1000), appeal_at = now() where id = x.id;
end;
$$;

create or replace function moderation_decide_appeal(p_sanction_id uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare x moderation_sanctions%rowtype;
begin
  perform moderation_require_moderator();
  select * into x from moderation_sanctions where id = p_sanction_id for update;
  if not found or x.appeal_status is distinct from 'pending' then raise exception 'Aucun appel en attente'; end if;
  if p_accept then
    perform moderation_revoke_sanction(x.id, coalesce(p_reason, 'Appel accepte'));
    update moderation_sanctions set appeal_status = 'accepted' where id = x.id;
  else
    update moderation_sanctions set appeal_status = 'rejected' where id = x.id;
  end if;
  insert into moderation_decisions (actor_id, action, target_profile_id, target_ref, reason)
  values (current_profile_id(), case when p_accept then 'appeal_accepted' else 'appeal_rejected' end, x.profile_id, x.id::text, p_reason);
end;
$$;

-- Image : rétablir (verrouille contre le masquage automatique) / masquer / retirer.
-- « removed » ne supprime AUCUN fichier : seul un humain décide ensuite de l'effacer.
create or replace function moderate_media(p_kind text, p_id text, p_action text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  if p_action not in ('restore','hide','remove') then raise exception 'Action invalide'; end if;
  insert into media_moderation (target_kind, target_id) values (p_kind, p_id) on conflict do nothing;
  update media_moderation
    set status = case p_action when 'restore' then 'visible' when 'hide' then 'hidden' else 'removed' end,
        locked = (p_action = 'restore'),
        suspicious = false,
        hidden_at = case when p_action = 'restore' then null else coalesce(hidden_at, now()) end,
        decided_by = current_profile_id(), decided_at = now(), decision_reason = p_reason, updated_at = now()
    where target_kind = p_kind and target_id = p_id;
  insert into moderation_decisions (actor_id, action, target_ref, reason)
  values (current_profile_id(), 'media_' || p_action, p_kind || ':' || p_id::text, p_reason);
end;
$$;

-- Adresse de l'image signalée et auteur, pour que le modérateur VOIE ce qu'il décide (la lecture directe
-- n'est pas garantie pour lui : la RLS de ces tables suit la visibilité d'un membre ordinaire).
-- Types résolus : story, post_media, community_post, profile_photo, avatar. Les médias privés
-- (messages, événements : chemin de stockage non public) renvoient une adresse nulle.
create or replace function admin_media_info(p_kind text, p_id text)
returns table (url text, owner_id uuid, owner_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  if p_kind = 'story' then
    return query select st.media_url, st.profile_id, p.name, st.created_at from stories st join profiles p on p.id = st.profile_id where st.id::text = p_id;
  elsif p_kind = 'post_media' then
    return query select pm.url, po.author_id, p.name, pm.created_at from post_media pm join posts po on po.id = pm.post_id join profiles p on p.id = po.author_id where pm.id::text = p_id;
  elsif p_kind = 'community_post' then
    return query select cp.media_url, cp.author_id, p.name, cp.created_at from community_posts cp join profiles p on p.id = cp.author_id where cp.id::text = p_id;
  elsif p_kind = 'profile_photo' then
    return query select pp.url, pp.profile_id, p.name, pp.created_at from profile_photos pp join profiles p on p.id = pp.profile_id where pp.id::text = p_id;
  elsif p_kind = 'avatar' then
    return query select p.avatar_url, p.id, p.name, p.created_at from profiles p where p.id::text = p_id;
  end if;
end;
$$;

-- Durée de conservation : supprime les infractions plus anciennes que p_days jours (365 par défaut) et retourne
-- leur nombre. L'historique des SANCTIONS est conservé (la liaison à l'infraction est simplement effacée).
-- À lancer à la main (ou par pg_cron, voir MODERATION.md), réservé aux administrateurs.
create or replace function moderation_purge_old(p_days int default 365)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not coalesce(is_admin_or_above(), false) then raise exception 'Non autorise'; end if;
  if p_days < 30 then raise exception 'Duree minimale : 30 jours'; end if;
  delete from moderation_violations where created_at < now() - make_interval(days => p_days);
  get diagnostics v_count = row_count;
  insert into moderation_decisions (actor_id, action, reason) values (current_profile_id(), 'violations_purged', v_count::text || ' infractions de plus de ' || p_days::text || ' jours');
  return v_count;
end;
$$;

-- Administration de la liste et des réglages (administrateurs).
create or replace function admin_upsert_moderation_term(p_term text, p_category text, p_severity text default 'block', p_active boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_admin_or_above(), false) then raise exception 'Non autorise'; end if;
  insert into moderation_terms (term, term_norm, category, severity, active, created_by)
  values (btrim(p_term), '', p_category, p_severity, p_active, current_profile_id())
  on conflict (term_norm) do update set category = excluded.category, severity = excluded.severity, active = excluded.active;
  insert into moderation_decisions (actor_id, action, target_ref, reason) values (current_profile_id(), 'term_upserted', btrim(p_term), p_category || '/' || p_severity);
end;
$$;

create or replace function admin_delete_moderation_term(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_admin_or_above(), false) then raise exception 'Non autorise'; end if;
  delete from moderation_terms where id = p_id;
  insert into moderation_decisions (actor_id, action, target_ref) values (current_profile_id(), 'term_deleted', p_id::text);
end;
$$;

create or replace function admin_upsert_moderation_exception(p_phrase text, p_active boolean default true)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_admin_or_above(), false) then raise exception 'Non autorise'; end if;
  insert into moderation_exceptions (phrase, phrase_norm, active, created_by)
  values (btrim(p_phrase), '', p_active, current_profile_id())
  on conflict (phrase_norm) do update set active = excluded.active;
end;
$$;

create or replace function admin_update_moderation_settings(p_settings jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(is_admin_or_above(), false) then raise exception 'Non autorise'; end if;
  update moderation_settings set
    text_filter_enabled = coalesce((p_settings ->> 'text_filter_enabled')::boolean, text_filter_enabled),
    window_days = coalesce((p_settings ->> 'window_days')::int, window_days),
    warnings_before_suspension = coalesce((p_settings ->> 'warnings_before_suspension')::int, warnings_before_suspension),
    suspension_hours = coalesce((p_settings ->> 'suspension_hours')::int, suspension_hours),
    suspensions_before_ban = coalesce((p_settings ->> 'suspensions_before_ban')::int, suspensions_before_ban),
    auto_ban_enabled = coalesce((p_settings ->> 'auto_ban_enabled')::boolean, auto_ban_enabled),
    media_report_threshold = coalesce((p_settings ->> 'media_report_threshold')::int, media_report_threshold),
    media_reports_per_hour = coalesce((p_settings ->> 'media_reports_per_hour')::int, media_reports_per_hour),
    updated_at = now(), updated_by = current_profile_id()
  where id = 1;
  insert into moderation_decisions (actor_id, action, reason) values (current_profile_id(), 'settings_updated', left(p_settings::text, 500));
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Bannissement : sessions revoquees, registre d'identites bannies, inscription bloquee
--    Pas d'adresse IP stockee (faux positifs : reseaux partages, VPN, mobile). Seule une EMPREINTE
--    salee de l'e-mail normalise (sans +alias, points Gmail retires) est conservee, jamais l'e-mail en clair.
-- ----------------------------------------------------------------------------
create table if not exists moderation_private (
  id int primary key default 1 check (id = 1),
  email_salt text not null default encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex')
);
insert into moderation_private (id) values (1) on conflict (id) do nothing;
alter table moderation_private enable row level security;

-- Une ligne par (empreinte, compte) : deux comptes bannis qui partagent la meme adresse normalisee ont chacun leur ligne,
-- lever le bannissement de l'un ne libere donc pas l'adresse de l'autre.
create table if not exists banned_identities (
  id bigint generated always as identity primary key,
  email_key text not null,
  profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists banned_identities_key_idx on banned_identities (email_key);
create unique index if not exists banned_identities_key_profile_uniq on banned_identities (email_key, profile_id);
create index if not exists banned_identities_profile_idx on banned_identities (profile_id);
alter table banned_identities enable row level security;

create or replace function moderation_email_key(p_email text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_local text; v_domain text; v_salt text;
begin
  if p_email is null or position('@' in p_email) = 0 then return null; end if;
  v_local := split_part(lower(btrim(split_part(p_email, '@', 1))), '+', 1);
  v_domain := lower(btrim(split_part(p_email, '@', 2)));
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;
  select email_salt into v_salt from moderation_private where id = 1;
  return encode(sha256(convert_to(coalesce(v_salt, '') || ':' || v_local || '@' || v_domain, 'UTF8')), 'hex');
end;
$$;

-- Quand un compte est banni (par l'echelle automatique OU par un moderateur via ban_user) : ses sessions sont
-- revoquees et l'empreinte de son e-mail est inscrite au registre. Quand le bannissement est leve, l'empreinte
-- est retiree. Un jeton d'acces deja emis reste valable jusqu'a son expiration (~1 h) : ce sont les policies RLS
-- (qui verifient banned_at) qui refusent le compte dans l'intervalle. Le nettoyage ne bloque JAMAIS le bannissement.
create or replace function moderation_on_ban_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_email text;
begin
  if new.banned_at is not null and old.banned_at is null then
    v_user := new.user_id;
    if v_user is not null then
      begin
        if to_regclass('auth.users') is not null then
          execute 'select email from auth.users where id = $1' into v_email using v_user;
          if v_email is not null then
            insert into banned_identities (email_key, profile_id) values (moderation_email_key(v_email), new.id) on conflict (email_key, profile_id) do nothing;
          end if;
        end if;
        if to_regclass('auth.refresh_tokens') is not null then
          execute 'update auth.refresh_tokens set revoked = true where user_id = $1' using v_user::text;
        end if;
        -- connexion refusee (GoTrue refuse un compte dont banned_until est dans le futur) : pas seulement les sessions en cours
        if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
          execute 'update auth.users set banned_until = now() + interval ''100 years'' where id = $1' using v_user;
        end if;
        if to_regclass('auth.sessions') is not null then
          execute 'delete from auth.sessions where user_id = $1' using v_user;
        end if;
      exception when others then
        insert into moderation_decisions (action, target_profile_id, reason) values ('ban_cleanup_failed', new.id, left(sqlerrm, 200));
      end;
    end if;
    insert into moderation_decisions (actor_id, action, target_profile_id, reason)
    values (current_profile_id(), 'ban_applied', new.id, left(coalesce(new.ban_reason, ''), 200));
  elsif new.banned_at is null and old.banned_at is not null then
    delete from banned_identities where profile_id = new.id;
    begin
      if new.user_id is not null and exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
        execute 'update auth.users set banned_until = null where id = $1' using new.user_id;
      end if;
    exception when others then
      insert into moderation_decisions (action, target_profile_id, reason) values ('ban_lift_cleanup_failed', new.id, left(sqlerrm, 200));
    end;
    insert into moderation_decisions (actor_id, action, target_profile_id) values (current_profile_id(), 'ban_lifted', new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_modban_change on profiles;
create trigger trg_modban_change after update of banned_at on profiles
  for each row when (old.banned_at is distinct from new.banned_at) execute function moderation_on_ban_change();

create or replace function moderation_block_banned_signup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and exists (select 1 from banned_identities where email_key = moderation_email_key(new.email)) then
    raise exception 'ACCOUNT_BANNED: Cette adresse ne peut pas etre utilisee.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
-- Declencheur sur auth.users : a poser avec le role proprietaire (SQL Editor). S'il echoue (droits), le reste du
-- fichier n'est pas affecte : repeter cette seule instruction depuis un role autorise (voir MODERATION.md).
do $$
begin
  if to_regclass('auth.users') is not null then
    execute 'drop trigger if exists trg_modban_signup on auth.users';
    execute 'drop trigger if exists trg_modban_email on auth.users';
    execute 'create trigger trg_modban_signup before insert on auth.users for each row execute function public.moderation_block_banned_signup()';
    -- changement REEL d''adresse seulement : une simple reecriture de la ligne (connexion) ne declenche rien
    execute 'create trigger trg_modban_email before update of email on auth.users for each row when (old.email is distinct from new.email) execute function public.moderation_block_banned_signup()';
  end if;
exception when others then
  raise notice 'Declencheur d''inscription non pose : %', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- 10. Journal des decisions NON MODIFIABLE : ni UPDATE ni DELETE (sauf la mise a NULL d'une reference quand
--     un compte est supprime, faite par la cle etrangere).
-- ----------------------------------------------------------------------------
create or replace function moderation_decisions_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Le journal des decisions de moderation est non modifiable';
  end if;
  if new.action is distinct from old.action or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at or new.target_ref is distinct from old.target_ref
     or (new.actor_id is distinct from old.actor_id and new.actor_id is not null)
     or (new.target_profile_id is distinct from old.target_profile_id and new.target_profile_id is not null) then
    raise exception 'Le journal des decisions de moderation est non modifiable';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_modlog_immutable on moderation_decisions;
create trigger trg_modlog_immutable before update or delete on moderation_decisions
  for each row execute function moderation_decisions_immutable();

-- ----------------------------------------------------------------------------
-- 11. Moderation adaptative : precision des regles, suggestions a valider, test sans effet.
--     RIEN n'est jamais applique automatiquement : une suggestion ne devient une regle que par decision d'un administrateur.
-- ----------------------------------------------------------------------------
create table if not exists moderation_rule_suggestions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_term', 'new_variant', 'false_positive', 'false_negative')),
  term text not null check (char_length(btrim(term)) between 2 and 80),
  category text not null default 'insulte',
  severity text not null default 'review' check (severity in ('block', 'review')),
  rationale text check (rationale is null or char_length(rationale) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  proposed_by uuid references profiles(id) on delete set null,
  decided_by uuid references profiles(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now()
);
create index if not exists moderation_rule_suggestions_status_idx on moderation_rule_suggestions (status, created_at desc);
alter table moderation_rule_suggestions enable row level security;
drop policy if exists "Suggestions lisibles par les moderateurs" on moderation_rule_suggestions;
create policy "Suggestions lisibles par les moderateurs" on moderation_rule_suggestions for select to authenticated using (is_moderator_or_above());

-- Un moderateur propose (faux positif a excepter, faux negatif ou nouvelle variante a ajouter).
create or replace function moderation_suggest_rule(p_kind text, p_term text, p_category text default 'insulte', p_severity text default 'review', p_rationale text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform moderation_require_moderator();
  insert into moderation_rule_suggestions (kind, term, category, severity, rationale, proposed_by)
  values (p_kind, btrim(p_term), coalesce(p_category, 'insulte'), coalesce(p_severity, 'review'), left(p_rationale, 500), current_profile_id())
  returning id into v_id;
  insert into moderation_decisions (actor_id, action, target_ref, reason) values (current_profile_id(), 'rule_suggested', v_id::text, p_kind || ': ' || btrim(p_term));
  return v_id;
end;
$$;

-- Un administrateur accepte (la regle est alors creee) ou rejette. false_positive -> exception ; le reste -> terme.
create or replace function admin_decide_rule_suggestion(p_id uuid, p_accept boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare x moderation_rule_suggestions%rowtype;
begin
  if not coalesce(is_admin_or_above(), false) then raise exception 'Non autorise'; end if;
  select * into x from moderation_rule_suggestions where id = p_id for update;
  if not found or x.status <> 'pending' then raise exception 'Suggestion introuvable ou deja traitee'; end if;
  if p_accept then
    if x.kind = 'false_positive' then
      perform admin_upsert_moderation_exception(x.term, true);
    else
      perform admin_upsert_moderation_term(x.term, x.category, x.severity, true);
    end if;
  end if;
  update moderation_rule_suggestions
    set status = case when p_accept then 'accepted' else 'rejected' end, decided_by = current_profile_id(), decided_at = now(), decision_reason = left(p_reason, 500)
    where id = x.id;
  insert into moderation_decisions (actor_id, action, target_ref, reason)
  values (current_profile_id(), case when p_accept then 'rule_accepted' else 'rule_rejected' end, x.id::text, p_reason);
end;
$$;

create or replace function admin_moderation_suggestions(p_status text default 'pending', p_limit int default 100)
returns setof moderation_rule_suggestions
language plpgsql stable security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  return query select * from moderation_rule_suggestions where (p_status = 'all' or status = p_status) order by created_at desc limit least(greatest(p_limit, 1), 500);
end;
$$;

-- Precision de chaque terme : confirmees (counted) contre annulees (overturned = faux positifs) ; a relire en attente.
create or replace function admin_moderation_term_stats(p_days int default 90)
returns table (term text, category text, confirmed int, false_positives int, pending int, precision_ratio numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  perform moderation_require_moderator();
  return query
    select v.term, max(v.category), count(*) filter (where v.status = 'counted')::int, count(*) filter (where v.status = 'overturned')::int,
           count(*) filter (where v.status = 'flagged')::int,
           case when count(*) filter (where v.status in ('counted', 'overturned')) = 0 then null
                else round(count(*) filter (where v.status = 'counted')::numeric / count(*) filter (where v.status in ('counted', 'overturned')), 3) end
    from moderation_violations v
    where v.term is not null and v.created_at > now() - make_interval(days => greatest(p_days, 1))
    group by v.term order by 3 desc, 1;
end;
$$;

-- Teste un texte (et, facultativement, un terme candidat pas encore actif) SANS rien enregistrer ni sanctionner.
create or replace function admin_test_moderation(p_text text, p_candidate_term text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; v_norm text; v_cand text; v_hit boolean := null;
begin
  perform moderation_require_moderator();
  select * into r from moderation_check(left(coalesce(p_text, ''), 4000));
  if p_candidate_term is not null and btrim(p_candidate_term) <> '' then
    v_cand := moderation_normalize_term(p_candidate_term);
    v_norm := ' ' || moderation_normalize(left(coalesce(p_text, ''), 4000)) || ' ';
    v_hit := v_cand <> '' and (btrim(v_norm) ~ ('(^| )' || v_cand || '(s|es|x)?( |$)'));
  end if;
  return jsonb_build_object('blocked', r.blocked, 'flagged', r.flagged, 'category', r.category, 'term', r.term, 'severity', r.severity, 'candidate_match', v_hit);
end;
$$;

-- Etat de moderation de la personne connectee : de quoi lui expliquer sa sanction (regle, nombre d'infractions
-- confirmees, duree, contestation). Ne revele jamais l'identite d'un declarant.
create or replace function my_moderation_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_p uuid := current_profile_id(); s moderation_settings%rowtype; n int; x moderation_sanctions%rowtype;
begin
  if v_p is null then raise exception 'Non autorise'; end if;
  select * into s from moderation_settings where id = 1;
  select count(*) into n from moderation_violations where profile_id = v_p and status = 'counted' and created_at > now() - make_interval(days => s.window_days);
  select * into x from moderation_sanctions where profile_id = v_p and revoked_at is null order by created_at desc limit 1;
  return jsonb_build_object(
    'confirmed_violations', n, 'window_days', s.window_days,
    'warnings_before_suspension', s.warnings_before_suspension, 'suspension_hours', s.suspension_hours, 'suspensions_before_ban', s.suspensions_before_ban,
    'sanction', case when x.id is null then null else jsonb_build_object('id', x.id, 'kind', x.kind, 'until', x.until_at, 'reason', x.reason, 'created_at', x.created_at, 'appeal_status', x.appeal_status) end);
end;
$$;

-- ----------------------------------------------------------------------------
-- Droits : aucune fonction appelable sans compte ; les écritures directes sont fermées
-- (aucune policy INSERT/UPDATE/DELETE : tout passe par les fonctions ci-dessus).
-- ----------------------------------------------------------------------------
revoke all on moderation_settings, moderation_terms, moderation_exceptions, moderation_violations,
  moderation_sanctions, moderation_decisions, media_reports, media_moderation from anon;
revoke all on moderation_private, banned_identities from public, anon, authenticated;
revoke all on moderation_rule_suggestions from anon;
revoke insert, update, delete on moderation_rule_suggestions from authenticated;
revoke insert, update, delete on moderation_settings, moderation_terms, moderation_exceptions, moderation_violations,
  moderation_sanctions, moderation_decisions, media_reports, media_moderation from authenticated;

revoke all on function moderation_normalize(text), moderation_normalize_term(text), moderation_check(text),
  moderation_apply_ladder(uuid, uuid), moderation_record_flag(uuid, text, text, text, text, text),
  moderation_guard_text(), moderation_require_moderator(), moderation_terms_set_norm() from public, anon, authenticated;
revoke all on function moderation_screen(text, text), report_media(text, text, text, text),
  admin_moderation_violations(text, int), admin_moderation_sanctions(boolean, int), admin_media_queue(int), admin_media_info(text, text),
  moderation_resolve_flag(uuid, boolean, text), moderation_revoke_sanction(uuid, text),
  moderation_appeal(uuid, text), moderation_decide_appeal(uuid, boolean, text), moderate_media(text, text, text, text),
  admin_upsert_moderation_term(text, text, text, boolean), admin_delete_moderation_term(bigint),
  admin_upsert_moderation_exception(text, boolean), admin_update_moderation_settings(jsonb), moderation_purge_old(int) from public, anon;
-- Fonctions internes (declencheurs, empreinte) : jamais appelables par un client, meme connecte.
revoke all on function moderation_email_key(text), moderation_on_ban_change(), moderation_block_banned_signup(), moderation_decisions_immutable() from public, anon, authenticated;
-- Nouvelles fonctions : retirees a public et anon, accordees aux comptes connectes ; chacune verifie le role elle-meme.
revoke all on function moderation_suggest_rule(text, text, text, text, text), admin_decide_rule_suggestion(uuid, boolean, text),
  admin_moderation_suggestions(text, int), admin_moderation_term_stats(int), admin_test_moderation(text, text), my_moderation_status() from public, anon;
grant execute on function moderation_suggest_rule(text, text, text, text, text), admin_decide_rule_suggestion(uuid, boolean, text),
  admin_moderation_suggestions(text, int), admin_moderation_term_stats(int), admin_test_moderation(text, text), my_moderation_status() to authenticated;
grant execute on function moderation_screen(text, text), report_media(text, text, text, text),
  admin_moderation_violations(text, int), admin_moderation_sanctions(boolean, int), admin_media_queue(int), admin_media_info(text, text),
  moderation_resolve_flag(uuid, boolean, text), moderation_revoke_sanction(uuid, text),
  moderation_appeal(uuid, text), moderation_decide_appeal(uuid, boolean, text), moderate_media(text, text, text, text),
  admin_upsert_moderation_term(text, text, text, boolean), admin_delete_moderation_term(bigint),
  admin_upsert_moderation_exception(text, boolean), admin_update_moderation_settings(jsonb), moderation_purge_old(int) to authenticated;

-- ----------------------------------------------------------------------------
-- Liste de départ (générée depuis src/config/moderationTerms.seed.json par
-- scripts/gen-moderation-seed.mjs ; ne pas modifier à la main).
-- ----------------------------------------------------------------------------
-- BEGIN SEED
insert into moderation_terms (term, term_norm, category, severity) values
  ('connard', '', 'insulte', 'block'),
  ('connasse', '', 'insulte', 'block'),
  ('conne', '', 'insulte', 'review'),
  ('con', '', 'insulte', 'review'),
  ('salaud', '', 'insulte', 'block'),
  ('salopard', '', 'insulte', 'block'),
  ('salope', '', 'insulte', 'block'),
  ('pute', '', 'insulte', 'block'),
  ('putain de merde', '', 'insulte', 'block'),
  ('enculer', '', 'insulte', 'block'),
  ('encule', '', 'insulte', 'block'),
  ('enfoire', '', 'insulte', 'block'),
  ('batard', '', 'insulte', 'block'),
  ('fdp', '', 'insulte', 'block'),
  ('ntm', '', 'insulte', 'block'),
  ('tg', '', 'insulte', 'review'),
  ('ta gueule', '', 'insulte', 'block'),
  ('ferme ta gueule', '', 'insulte', 'block'),
  ('merde', '', 'insulte', 'review'),
  ('merdeux', '', 'insulte', 'block'),
  ('abruti', '', 'insulte', 'block'),
  ('abrutie', '', 'insulte', 'block'),
  ('debile', '', 'insulte', 'block'),
  ('imbecile', '', 'insulte', 'block'),
  ('idiot', '', 'insulte', 'review'),
  ('idiote', '', 'insulte', 'review'),
  ('cretin', '', 'insulte', 'block'),
  ('cretine', '', 'insulte', 'block'),
  ('ordure', '', 'insulte', 'block'),
  ('petasse', '', 'insulte', 'block'),
  ('pouffiasse', '', 'insulte', 'block'),
  ('grognasse', '', 'insulte', 'block'),
  ('tarlouze', '', 'homophobie', 'block'),
  ('pede', '', 'homophobie', 'block'),
  ('pd', '', 'homophobie', 'review'),
  ('tapette', '', 'homophobie', 'block'),
  ('gouine', '', 'homophobie', 'block'),
  ('sale pd', '', 'homophobie', 'block'),
  ('negre', '', 'racisme', 'block'),
  ('negresse', '', 'racisme', 'block'),
  ('sale noir', '', 'racisme', 'block'),
  ('sale arabe', '', 'racisme', 'block'),
  ('sale juif', '', 'racisme', 'block'),
  ('sale blanc', '', 'racisme', 'block'),
  ('sale chinois', '', 'racisme', 'block'),
  ('bougnoule', '', 'racisme', 'block'),
  ('bicot', '', 'racisme', 'block'),
  ('youpin', '', 'racisme', 'block'),
  ('chintoque', '', 'racisme', 'block'),
  ('retourne dans ton pays', '', 'racisme', 'block'),
  ('rentre chez toi', '', 'racisme', 'review'),
  ('sale etranger', '', 'racisme', 'block'),
  ('sale immigre', '', 'racisme', 'block'),
  ('je vais te tuer', '', 'menace', 'block'),
  ('je vais te buter', '', 'menace', 'block'),
  ('je vais te retrouver', '', 'menace', 'review'),
  ('je vais te frapper', '', 'menace', 'block'),
  ('je vais te casser la gueule', '', 'menace', 'block'),
  ('je te tue', '', 'menace', 'block'),
  ('tu vas mourir', '', 'menace', 'block'),
  ('va te faire foutre', '', 'harcelement', 'block'),
  ('va te faire enculer', '', 'harcelement', 'block'),
  ('va crever', '', 'harcelement', 'block'),
  ('suicide toi', '', 'harcelement', 'block'),
  ('personne ne t aime', '', 'harcelement', 'review'),
  ('tu es moche', '', 'harcelement', 'review'),
  ('fuck you', '', 'insulte', 'block'),
  ('fuck off', '', 'insulte', 'block'),
  ('fucker', '', 'insulte', 'block'),
  ('motherfucker', '', 'insulte', 'block'),
  ('asshole', '', 'insulte', 'block'),
  ('bitch', '', 'insulte', 'block'),
  ('bastard', '', 'insulte', 'block'),
  ('dickhead', '', 'insulte', 'block'),
  ('douchebag', '', 'insulte', 'block'),
  ('slut', '', 'insulte', 'block'),
  ('whore', '', 'insulte', 'block'),
  ('cunt', '', 'insulte', 'block'),
  ('moron', '', 'insulte', 'review'),
  ('stfu', '', 'insulte', 'review'),
  ('piece of shit', '', 'insulte', 'block'),
  ('faggot', '', 'homophobie', 'block'),
  ('fag', '', 'homophobie', 'block'),
  ('dyke', '', 'homophobie', 'block'),
  ('tranny', '', 'homophobie', 'block'),
  ('nigger', '', 'racisme', 'block'),
  ('nigga', '', 'racisme', 'block'),
  ('chink', '', 'racisme', 'block'),
  ('spic', '', 'racisme', 'block'),
  ('kike', '', 'racisme', 'block'),
  ('paki', '', 'racisme', 'block'),
  ('go back to your country', '', 'racisme', 'block'),
  ('i will kill you', '', 'menace', 'block'),
  ('i m going to kill you', '', 'menace', 'block'),
  ('i will find you', '', 'menace', 'review'),
  ('kill yourself', '', 'harcelement', 'block'),
  ('kys', '', 'harcelement', 'block'),
  ('go die', '', 'harcelement', 'block'),
  ('nobody likes you', '', 'harcelement', 'review'),
  ('retarded', '', 'insulte', 'block'),
  ('fuck', '', 'insulte', 'review')
on conflict (term_norm) do nothing;

insert into moderation_exceptions (phrase, phrase_norm) values
  ('pas con', ''),
  ('pas idiot', ''),
  ('pas idiote', ''),
  ('pas conne', '')
on conflict (phrase_norm) do nothing;
-- END SEED

-- ----------------------------------------------------------------------------
-- Vérifications après exécution (lecture seule) :
--   select * from moderation_check('c.o.n.n.a.r.d');            -- blocked = true
--   select * from moderation_check('Un concert a Montreal');     -- blocked = false, flagged = false
--   select moderation_normalize('c0nn@rd  m3rde');                -- connard merde
--   select count(*) from moderation_terms;                        -- 100 environ
--   select tgname from pg_trigger where tgname like 'trg_moderation_%';   -- 10 lignes (8 contrôles de texte + 2 normalisations)
-- ----------------------------------------------------------------------------
