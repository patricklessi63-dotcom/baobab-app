-- ============================================================================
-- Phase 5.5 — Audit et stabilisation — corrections de sécurité et de données.
-- À exécuter dans Supabase : SQL Editor (une fois).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BUG CRITIQUE : la policy INSERT sur "messages" vérifiait seulement que
-- l'expéditeur est bien authentifié en son propre nom ET que son id figure
-- dans match_key — mais ne vérifiait JAMAIS qu'un match réciproque existe
-- réellement entre les deux personnes. Comme "profiles" est en lecture
-- publique (nécessaire pour la découverte), n'importe quel utilisateur
-- authentifié pouvait construire un match_key avec l'id de n'importe quel
-- autre profil et lui envoyer un message SANS jamais avoir été mutuellement
-- likés — contournant entièrement la règle "Match réciproque -> conversation
-- autorisée" énoncée en Phase 5. Corrigé ci-dessous : la policy exige
-- désormais un like mutuel réel (et l'absence de blocage) entre les deux
-- profils avant d'autoriser l'insertion.
-- ----------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'messages' and cmd = 'INSERT' loop
    execute format('drop policy %I on public.messages', pol.policyname);
  end loop;

  create policy "Un utilisateur envoie seulement dans une conversation matchee"
  on messages for insert
  with check (
    auth.uid() = (select user_id from profiles where id = messages.from_id)
    and (select id from profiles where user_id = auth.uid())::text
      = any (string_to_array(messages.match_key, '__'))
    and exists (
      select 1
      from unnest(string_to_array(messages.match_key, '__')) as other_id
      where other_id::uuid <> messages.from_id
        and exists (select 1 from likes where from_id = messages.from_id and to_id = other_id::uuid)
        and exists (select 1 from likes where from_id = other_id::uuid and to_id = messages.from_id)
        and not exists (
          select 1 from blocks
          where (blocks.from_id = messages.from_id and blocks.to_id = other_id::uuid)
             or (blocks.from_id = other_id::uuid and blocks.to_id = messages.from_id)
        )
    )
  );
end $$;

-- ----------------------------------------------------------------------------
-- Vérification (facultatif, à exécuter séparément après) :
-- select policyname, cmd, with_check from pg_policies
-- where schemaname='public' and tablename='messages' and cmd='INSERT';
-- ----------------------------------------------------------------------------
