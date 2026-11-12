// Reçoit et vérifie les webhooks Stripe — seul écrivain légitime de
// "subscriptions"/"subscription_events" (clé service_role, contourne la
// RLS). Le frontend n'est JAMAIS la source de vérité du statut Premium.
//
// Déployer SANS vérification JWT (Stripe appelle directement, sans
// session Supabase) :
//   supabase functions deploy stripe-webhook --no-verify-jwt
//
// Secrets requis : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ce dernier n'est PAS injecté
// automatiquement pour les Edge Functions — doit être ajouté explicitement
// via `supabase secrets set`, jamais exposé au client).

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { handleStripeEvent } from "../_shared/stripeWebhookCore.ts";

// Lus paresseusement (pas au chargement du module), même motif que
// create-checkout-session/create-portal-session : un secret manquant ici
// (en particulier SUPABASE_SERVICE_ROLE_KEY, qui n'est PAS injecté
// automatiquement pour les Edge Functions — voir commentaire en tête de
// fichier) ferait planter tout l'isolate Deno au démarrage si ces appels
// étaient faits au niveau module. Résultat concret : Stripe reçoit une
// erreur de boot opaque sur CHAQUE tentative (y compris les retries), sans
// jamais atteindre le message clair renvoyé ci-dessous.
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const admin = serviceRoleKey && supabaseUrl ? createClient(supabaseUrl, serviceRoleKey) : null;

Deno.serve(async (req) => {
  if (!stripe || !webhookSecret || !admin) {
    // Config incomplète (secret manquant côté Supabase) : on log clairement
    // côté serveur et on renvoie 500 pour que Stripe retente plus tard une
    // fois le secret ajouté, plutôt que de laisser l'isolate planter au
    // boot sans aucun message exploitable dans les logs de la fonction.
    console.error(
      "stripe-webhook : configuration incomplète —",
      !stripeSecret ? "STRIPE_SECRET_KEY manquant" : null,
      !webhookSecret ? "STRIPE_WEBHOOK_SECRET manquant" : null,
      !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY manquant" : null,
      !supabaseUrl ? "SUPABASE_URL manquant" : null,
    );
    return new Response("Configuration serveur incomplète.", { status: 500 });
  }

  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text(); // corps BRUT obligatoire pour la vérification de signature — ne jamais parser le JSON avant
  if (!signature) return new Response("Signature manquante.", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Signature webhook invalide:", err);
    return new Response("Signature invalide.", { status: 400 });
  }

  // Tout le traitement (réservation anti-doublon, garde anti-désordre, écritures vérifiées, libération de la
  // réservation en cas d'échec pour que le retry de Stripe retraite vraiment l'événement) est dans
  // _shared/stripeWebhookCore.ts, testé par stripeWebhookCore.test.ts.
  const result = await handleStripeEvent(event, {
    admin,
    retrieveSubscription: (id: string) => stripe.subscriptions.retrieve(id),
  });
  return new Response(result.body, { status: result.status });
});
