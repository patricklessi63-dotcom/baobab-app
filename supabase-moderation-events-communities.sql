-- ============================================================================
-- SQL-45 : moderation du texte des EVENEMENTS et des COMMUNAUTES
-- (livre le 26/11/2026, NON execute : attend un ordre du proprietaire nommant ce fichier)
-- ============================================================================
-- Prerequis : supabase-moderation-text.sql (SQL-31, execute le 05/11/2026) pour
-- moderation_guard_text() et moderation_settings ; tables events et communities.
--
-- Defaut corrige (audit du 26/11/2026) : SQL-31 pose ses declencheurs " filet " sur
-- les messages, publications, commentaires, statuts et textes de profil, mais PAS sur
-- les evenements ni les communautes. Un titre, une description, un lieu ou des regles
-- injurieux etaient donc acceptes tels quels, et un evenement ou une communaute
-- PUBLICS les affichent a tous les membres, sur l'accueil, dans " Pres de toi ",
-- dans les invitations et les cartes partagees. Cote application, aucun formulaire
-- (EventCreateForm, EventEditForm, CommunityCreateForm) ne passait non plus par
-- screenText() : corrige dans le meme lot, mais seul le serveur fait autorite
-- (appel direct a l'API, RPC create_event / create_community, ancienne version de l'app).
--
-- Meme mecanique que SQL-31, sans rien y changer : moderation_guard_text(colonne, source)
--   - ne controle que le texte NOUVEAU ou MODIFIE (une mise a jour qui ne touche pas la
--     colonne passe toujours : corriger la date d'un ancien evenement reste possible) ;
--   - laisse passer les ecritures systeme (auth.uid() nul : cle de service, taches planifiees) ;
--   - echec OUVERT (une panne du filtre ne bloque jamais la creation) ;
--   - suit l'interrupteur moderation_settings.text_filter_enabled ;
--   - un refus leve P0001 " MODERATION_REFUSED: ... ", que friendlyDbError() affiche tel quel.
-- create_event() et create_community() sont SECURITY DEFINER mais auth.uid() y reste
-- celui de l'appelant : leurs insertions sont donc controlees aussi.
-- Sources : 'post' pour les evenements, 'community_post' pour les communautes (les seules
-- valeurs publiques admises par la contrainte de moderation_violations.source et par
-- moderation_screen() ; aucune contrainte n'est modifiee ici).
--
-- Noms en trg_modtext_* (et non trg_moderation_*) : le controle en lecture seule de SQL-31
-- (scripts/verify-prod-sql31-and-statuses.sql) compte exactement 11 declencheurs trg_moderation_*.
--
-- Additif et reversible : seulement des declencheurs. Retour arriere en bas du fichier.
-- Fichier entierement ASCII (meme regle que SQL-31).
-- ============================================================================

-- Garde-fou de prerequis : sans SQL-31, rien n est pose et le message dit quoi faire.
do $$
begin
  if to_regprocedure('public.moderation_guard_text()') is null then
    raise exception 'SQL-45 : prerequis manquant, la fonction public.moderation_guard_text() (supabase-moderation-text.sql, SQL-31) n existe pas. Executer SQL-31 d abord.';
  end if;
end;
$$;

-- Evenements : titre, description, ville, lieu
drop trigger if exists trg_modtext_events_title on events;
create trigger trg_modtext_events_title before insert or update of title on events
  for each row execute function moderation_guard_text('title', 'post');
drop trigger if exists trg_modtext_events_description on events;
create trigger trg_modtext_events_description before insert or update of description on events
  for each row execute function moderation_guard_text('description', 'post');
drop trigger if exists trg_modtext_events_city on events;
create trigger trg_modtext_events_city before insert or update of city on events
  for each row execute function moderation_guard_text('city', 'post');
drop trigger if exists trg_modtext_events_location on events;
create trigger trg_modtext_events_location before insert or update of location on events
  for each row execute function moderation_guard_text('location', 'post');

-- Communautes : nom, description, ville, regles
drop trigger if exists trg_modtext_communities_name on communities;
create trigger trg_modtext_communities_name before insert or update of name on communities
  for each row execute function moderation_guard_text('name', 'community_post');
drop trigger if exists trg_modtext_communities_description on communities;
create trigger trg_modtext_communities_description before insert or update of description on communities
  for each row execute function moderation_guard_text('description', 'community_post');
drop trigger if exists trg_modtext_communities_city on communities;
create trigger trg_modtext_communities_city before insert or update of city on communities
  for each row execute function moderation_guard_text('city', 'community_post');
drop trigger if exists trg_modtext_communities_rules on communities;
create trigger trg_modtext_communities_rules before insert or update of rules on communities
  for each row execute function moderation_guard_text('rules', 'community_post');

-- ----------------------------------------------------------------------------
-- Verification en lecture seule (a executer separement apres) : 8 lignes attendues.
-- select tgrelid::regclass as table_name, tgname from pg_trigger
--   where tgname like 'trg_modtext_events_%' or tgname like 'trg_modtext_communities_%'
--   order by 1, 2;
--
-- Contenus DEJA en base : ce fichier ne les touche pas (il ne controle que les ecritures
-- futures). Pour les reperer, en lecture seule :
-- select 'event' as kind, id, title as texte from events e
--   where (select blocked from moderation_check(concat_ws(' ', e.title, e.description, e.city, e.location)))
-- union all
-- select 'community', id, name from communities c
--   where (select blocked from moderation_check(concat_ws(' ', c.name, c.description, c.city, c.rules)));
--
-- Retour arriere (coupure immediate, sans perte de donnees) ; les memes lignes figurent dans la
-- section B de supabase-moderation-text-rollback.sql (sinon sa section C ne pourrait plus supprimer
-- moderation_guard_text(), dont ces declencheurs dependent) :
-- drop trigger if exists trg_modtext_events_title on events;
-- drop trigger if exists trg_modtext_events_description on events;
-- drop trigger if exists trg_modtext_events_city on events;
-- drop trigger if exists trg_modtext_events_location on events;
-- drop trigger if exists trg_modtext_communities_name on communities;
-- drop trigger if exists trg_modtext_communities_description on communities;
-- drop trigger if exists trg_modtext_communities_city on communities;
-- drop trigger if exists trg_modtext_communities_rules on communities;
-- ============================================================================
