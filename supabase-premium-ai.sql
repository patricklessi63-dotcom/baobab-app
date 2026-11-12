-- ============================================================================
-- SQL-39 — Outils d'écriture IA réservés à Premium : avantage au catalogue + index de comptage.
--
-- LIVRÉ, NON EXÉCUTÉ (aucun SQL de production sans autorisation explicite du propriétaire).
-- Écrit le 11 novembre 2026. Prérequis : SQL-37 (supabase-premium-entitlements.sql, EXÉCUTÉ en production
-- le 10 novembre) et supabase-intelligence.sql (table ai_usage). Le fichier s'arrête avec un message clair
-- si l'un manque.
--
-- CE QUE LE FICHIER AJOUTE (additif, idempotent) :
--   1. La ligne 'ai_writing_tools' du catalogue premium_entitlements. C'est cette ligne que l'Edge Function
--      ai-assist interroge (has_premium_feature) pour ouvrir les outils « Corriger mon texte » et « Rédiger à
--      partir de mon idée ». Désactiver la ligne (active = false) coupe ces deux outils pour tout le monde
--      sans redéployer : c'est l'interrupteur de coût.
--   2. Un index sur ai_usage(created_at), pour le plafond mensuel GLOBAL d'appels (comptage sur toute la
--      plateforme). L'index existant (profile_id, created_at) sert aux quotas par personne.
--
-- Sans ce fichier : les deux outils restent refusés à tout le monde (la clé est absente, donc
-- has_premium_feature renvoie faux) ; les actions IA existantes ne changent pas.
--
-- DÉPLOIEMENT : l'Edge Function ai-assist (nouvelle version, avec quotas) se redéploie APRÈS ce fichier ;
-- côté application rien d'autre que VITE_FEATURE_PREMIUM et VITE_FEATURE_AI (clé ANTHROPIC_API_KEY posée).
--
-- VÉRIFICATIONS APRÈS EXÉCUTION (lecture seule) :
--   select key, active from premium_entitlements where key = 'ai_writing_tools';        -- 1 ligne, active
--   select indexname from pg_indexes where tablename = 'ai_usage';                        -- idx_ai_usage_created_at présent
--
-- RETOUR ARRIÈRE :
--   delete from public.premium_entitlements where key = 'ai_writing_tools';
--   drop index if exists public.idx_ai_usage_created_at;
-- ============================================================================

do $$
begin
  if to_regclass('public.premium_entitlements') is null then
    raise exception 'premium_entitlements introuvable : exécuter d''abord SQL-37 (supabase-premium-entitlements.sql)';
  end if;
  if to_regclass('public.ai_usage') is null then
    raise exception 'ai_usage introuvable : exécuter d''abord supabase-intelligence.sql';
  end if;
end $$;

insert into public.premium_entitlements (key, label)
values ('ai_writing_tools', 'Outils d''écriture IA (correction, aide à la rédaction)')
on conflict (key) do nothing;

create index if not exists idx_ai_usage_created_at on public.ai_usage (created_at);

-- Hygiene : ai_usage n'est ecrite QUE par la fonction ai-assist (cle de service) ; aucun compte connecte n'a a y inserer,
-- modifier ou effacer sa propre consommation (l'unique policy est un SELECT, mais les privileges de table etaient ouverts).
revoke insert, update, delete on public.ai_usage from authenticated;
revoke all on public.ai_usage from anon;
