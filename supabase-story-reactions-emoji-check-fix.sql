-- ============================================================================
-- SQL-26 — Réactions aux statuts : la contrainte `story_reactions_emoji_check`
-- de la PRODUCTION refuse les émojis du client.
--
-- Constaté en réel (console du navigateur, compte connecté, 4 nov. 2026) :
--   POST /rest/v1/story_reactions  ->  400
--   { "code": "23514", "message": "new row for relation \"story_reactions\"
--     violates check constraint \"story_reactions_emoji_check\"" }
-- en touchant le cœur d'un statut. Le fichier `supabase-stories-2.sql` définit pourtant
-- la liste ('❤️','😂','😍','😮','👏','🔥') et les octets du client sont identiques
-- (vérifié point de code par point de code, y compris le sélecteur de variante U+FE0F) :
-- la contrainte réellement présente en base diffère donc du fichier (créée à la main
-- avant, ou autre liste). Je ne peux pas la lire en production : ce script ne suppose rien.
--
-- Ce que fait le script (idempotent, rejouable) :
--   1. supprime TOUTE contrainte CHECK de `story_reactions` qui porte sur la colonne
--      `emoji` (quel que soit son nom) ;
--   2. recrée `story_reactions_emoji_check` avec les six émojis du client, chacun
--      accepté AVEC ou SANS le sélecteur de variante U+FE0F (certains claviers / copier-coller
--      retirent ce caractère invisible) ;
--   3. ne touche ni aux données, ni aux policies, ni à la contrainte d'unicité.
--
-- Avant de jouer : lecture seule, pour voir ce qui est en place.
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'public.story_reactions'::regclass and contype = 'c';
-- Retour arrière : le script est sans perte ; l'ancienne définition est visible par la
-- requête ci-dessus (à copier avant de jouer).
-- Vérification après : réagir à un statut depuis l'application (le POST doit répondre 201),
--   puis `select emoji, count(*) from story_reactions group by 1;`
-- ============================================================================

do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.story_reactions'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%emoji%'
  loop
    execute format('alter table public.story_reactions drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.story_reactions
  add constraint story_reactions_emoji_check
  check (replace(emoji, chr(65039), '') in ('❤', '😂', '😍', '😮', '👏', '🔥'));

-- Si une ligne existante était déjà hors liste, l'ALTER ci-dessus échoue sans rien modifier :
-- voir alors `select distinct emoji from story_reactions;` avant de décider quoi faire.
