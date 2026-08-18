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

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Un seul type de notification par événement traité — réutilise la table
// "notifications" existante (Phase 6), aucun nouveau système.
const NOTIFY_TYPE: Record<string, string> = {
  "checkout.session.completed": "premium_activated",
  "customer.subscription.deleted": "premium_cancelled",
  "invoice.payment_failed": "premium_payment_failed",
};

Deno.serve(async (req) => {
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

  // Déduplication : Stripe peut renvoyer le même événement plusieurs fois.
  const { data: alreadyProcessed } = await admin
    .from("subscription_events").select("id").eq("stripe_event_id", event.id).maybeSingle();
  if (alreadyProcessed) return new Response("ok (déjà traité)", { status: 200 });

  try {
    let profileId: string | null = null;

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      profileId = (session.metadata?.profile_id as string) ?? null;
      if (profileId && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await upsertSubscription(profileId, session.customer as string, subscription);
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      profileId = (subscription.metadata?.profile_id as string) ?? await profileIdForCustomer(subscription.customer as string);
      if (profileId) await upsertSubscription(profileId, subscription.customer as string, subscription);
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      profileId = (subscription.metadata?.profile_id as string) ?? await profileIdForCustomer(subscription.customer as string);
      await admin.from("subscriptions")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscription.id);
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      profileId = await profileIdForCustomer(invoice.customer as string);
      if (invoice.subscription) {
        await admin.from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", invoice.subscription as string);
      }
    }

    await admin.from("subscription_events").insert({
      profile_id: profileId,
      stripe_event_id: event.id,
      type: event.type,
      payload: event.data.object,
    });

    const notifType = profileId ? NOTIFY_TYPE[event.type] : undefined;
    if (notifType) {
      await admin.from("notifications").insert({
        recipient_id: profileId,
        type: notifType,
        target_type: "subscription",
      });
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("Erreur de traitement du webhook:", err);
    // 500 pour que Stripe retente automatiquement cet événement plus tard.
    return new Response("Erreur de traitement.", { status: 500 });
  }
});

async function profileIdForCustomer(customerId: string): Promise<string | null> {
  const { data } = await admin.from("subscriptions").select("profile_id")
    .eq("stripe_customer_id", customerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data?.profile_id ?? null;
}

async function upsertSubscription(profileId: string, customerId: string, subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price;
  const plan = price?.recurring?.interval === "year" ? "yearly" : "monthly";
  await admin.from("subscriptions").upsert(
    {
      profile_id: profileId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: price?.id ?? null,
      plan,
      status: subscription.status,
      current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );
}
