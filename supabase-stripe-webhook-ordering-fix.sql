-- ============================================================================
-- Corrige deux failles de fiabilite du webhook Stripe (supabase/functions/
-- stripe-webhook/index.ts) sur la table "subscriptions" — a executer dans
-- Supabase : SQL Editor (une fois), APRES supabase-premium.sql (deja en
-- production).
--
-- Contexte : ce fichier accompagne un changement de code dans
-- stripe-webhook/index.ts (deploiement de l'Edge Function requis en plus de
-- ce script SQL — "supabase functions deploy stripe-webhook --no-verify-jwt").
--
-- Probleme 1 — desordre de livraison : Stripe garantit une livraison "au
-- moins une fois" mais PAS l'ordre de livraison (voir doc Stripe : "Webhook
-- events aren't guaranteed to be sent in the order in which they're
-- generated"). L'ancien code ecrivait aveuglement dans "subscriptions" des
-- qu'un evenement customer.subscription.* arrivait, sans jamais comparer son
-- horodatage a celui du dernier evenement deja applique. Un evenement
-- retarde (retry reseau, event.created plus ancien) livre APRES un evenement
-- plus recent pouvait donc ecraser l'etat courant avec des donnees perimees
-- (ex. reactiver "active"/cancel_at_period_end=false apres une annulation
-- deja traitee).
--
-- Cette colonne memorise le "event.created" Stripe (temps ou Stripe a
-- genere l'evenement, pas l'heure de reception) du dernier evenement
-- reellement applique a cette ligne. Le nouveau code du webhook n'ecrit
-- une mise a jour que si elle est strictement plus recente que la valeur
-- deja enregistree.
-- ============================================================================

alter table subscriptions
  add column if not exists stripe_event_created_at timestamptz;

comment on column subscriptions.stripe_event_created_at is
  'Horodatage (event.created, temps Stripe) du dernier evenement webhook reellement applique a cette ligne. Sert de garde anti-desordre : un evenement plus ancien que cette valeur est ignore par stripe-webhook/index.ts au lieu d''ecraser un etat plus recent.';

-- Verification optionnelle post-execution :
-- select stripe_subscription_id, status, cancel_at_period_end, stripe_event_created_at, updated_at
-- from subscriptions order by updated_at desc limit 20;
