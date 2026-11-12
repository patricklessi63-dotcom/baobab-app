// Cœur du webhook Stripe, sans dépendance à Deno ni à Stripe (testable avec Vitest, comme aiPolicy.ts).
// stripe-webhook/index.ts vérifie la signature, puis délègue ici. Ce module ne reçoit qu'un événement DÉJÀ
// authentifié, un client Supabase « service_role » et une fonction pour relire un abonnement chez Stripe.
//
// Garanties (le webhook est le SEUL écrivain de `subscriptions`, donc ce qui décide qui est Premium) :
//  - une même livraison traitée deux fois (retry Stripe, livraisons concurrentes) n'a d'effet qu'une fois :
//    la ligne de `subscription_events` est RÉSERVÉE atomiquement (contrainte UNIQUE stripe_event_id) ;
//  - TOUTE écriture en base vérifie son erreur : un échec n'est jamais présenté à Stripe comme un succès ;
//  - en cas d'échec la réservation est LIBÉRÉE et on répond 500, pour que le retry de Stripe retraite
//    vraiment l'événement (avant : la réservation restait, le retry répondait « déjà traité » et une
//    personne qui avait payé pouvait ne jamais devenir Premium) ;
//  - un événement plus ancien que l'état déjà enregistré n'écrase rien (Stripe ne garantit pas l'ordre) ;
//  - la notification et le rattachement du profil au journal sont « au mieux » : leur échec ne défait pas
//    un abonnement déjà enregistré.

// deno-lint-ignore no-explicit-any
type Admin = any;
// deno-lint-ignore no-explicit-any
type StripeObject = any;

export type WebhookEvent = { id: string; type: string; created: number; data: { object: StripeObject } };
export type WebhookDeps = {
  admin: Admin;
  retrieveSubscription: (id: string) => Promise<StripeObject>;
  log?: { error: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
};
export type WebhookResult = { status: number; body: string };

// Un seul type de notification par événement traité (table `notifications` existante).
export const NOTIFY_TYPE: Record<string, string> = {
  "checkout.session.completed": "premium_activated",
  "customer.subscription.deleted": "premium_cancelled",
  "invoice.payment_failed": "premium_payment_failed",
};

// Lève si la requête Supabase a renvoyé une erreur (le client Supabase ne lève pas tout seul).
function must<T extends { error?: unknown }>(res: T, what: string): T {
  if (res && res.error) {
    const e = res.error as { message?: string };
    throw new Error(`${what} : ${e.message ?? String(res.error)}`);
  }
  return res;
}

export async function handleStripeEvent(event: WebhookEvent, deps: WebhookDeps): Promise<WebhookResult> {
  const { admin, retrieveSubscription } = deps;
  const log = deps.log ?? console;

  // Réservation atomique de l'événement (profile_id inconnu à ce stade, rempli plus bas).
  const claim = await admin.from("subscription_events").insert({
    profile_id: null,
    stripe_event_id: event.id,
    type: event.type,
    payload: event.data.object,
  });
  if (claim.error) {
    // 23505 : un autre appel a déjà réservé (et traité, ou traite) cet événement — rien à refaire.
    if (claim.error.code === "23505") return { status: 200, body: "ok (déjà traité)" };
    log.error("Erreur lors de la déduplication du webhook:", claim.error);
    return { status: 500, body: "Erreur de traitement." };
  }

  const eventCreatedAt = new Date(event.created * 1000).toISOString();

  let profileId: string | null = null;
  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      profileId = (session.metadata?.profile_id as string) ?? null;
      if (profileId && session.subscription) {
        const subscription = await retrieveSubscription(session.subscription as string);
        await upsertSubscription(admin, log, profileId, session.customer as string, subscription, eventCreatedAt);
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      profileId = (subscription.metadata?.profile_id as string) ?? await profileIdForCustomer(admin, subscription.customer as string);
      if (profileId) await upsertSubscription(admin, log, profileId, subscription.customer as string, subscription, eventCreatedAt);
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      profileId = (subscription.metadata?.profile_id as string) ?? await profileIdForCustomer(admin, subscription.customer as string);
      must(
        await admin.from("subscriptions")
          .update({ status: "canceled", updated_at: new Date().toISOString(), stripe_event_created_at: eventCreatedAt })
          .eq("stripe_subscription_id", subscription.id)
          .or(`stripe_event_created_at.is.null,stripe_event_created_at.lt.${eventCreatedAt}`),
        "résiliation de l'abonnement",
      );
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      profileId = await profileIdForCustomer(admin, invoice.customer as string);
      if (invoice.subscription) {
        must(
          await admin.from("subscriptions")
            .update({ status: "past_due", updated_at: new Date().toISOString(), stripe_event_created_at: eventCreatedAt })
            .eq("stripe_subscription_id", invoice.subscription as string)
            .or(`stripe_event_created_at.is.null,stripe_event_created_at.lt.${eventCreatedAt}`),
          "passage en impayé",
        );
      }
    }
  } catch (err) {
    log.error("Erreur de traitement du webhook:", err);
    // Libère la réservation pour que le retry de Stripe retraite vraiment l'événement.
    const release = await admin.from("subscription_events").delete().eq("stripe_event_id", event.id);
    if (release.error) log.error("Réservation de l'événement non libérée (le retry sera ignoré) :", release.error);
    return { status: 500, body: "Erreur de traitement." };
  }

  // Le travail essentiel est fait (l'abonnement est enregistré) : le reste est « au mieux ».
  if (profileId) {
    const upd = await admin.from("subscription_events").update({ profile_id: profileId }).eq("stripe_event_id", event.id);
    if (upd.error) log.warn("Journal d'événement : profil non rattaché", upd.error);
    const notifType = NOTIFY_TYPE[event.type];
    if (notifType) {
      const ins = await admin.from("notifications").insert({ recipient_id: profileId, type: notifType, target_type: "subscription" });
      if (ins.error) log.warn("Notification Premium non créée", ins.error);
    }
  }
  return { status: 200, body: "ok" };
}

async function profileIdForCustomer(admin: Admin, customerId: string): Promise<string | null> {
  const res = await admin.from("subscriptions").select("profile_id")
    .eq("stripe_customer_id", customerId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  must(res, "recherche du profil par client Stripe");
  return res.data?.profile_id ?? null;
}

async function upsertSubscription(
  admin: Admin, log: NonNullable<WebhookDeps["log"]>, profileId: string, customerId: string,
  subscription: StripeObject, eventCreatedAt: string,
) {
  // Garde anti-désordre : on n'écrase pas un état plus récent par une donnée périmée.
  const existingRes = must(
    await admin.from("subscriptions").select("stripe_event_created_at").eq("stripe_subscription_id", subscription.id).maybeSingle(),
    "lecture de l'abonnement existant",
  );
  const existing = existingRes.data;
  if (existing?.stripe_event_created_at && existing.stripe_event_created_at >= eventCreatedAt) {
    log.warn(`Événement Stripe ignoré (plus ancien que l'état déjà enregistré) pour l'abonnement ${subscription.id}`);
    return;
  }

  const price = subscription.items?.data?.[0]?.price;
  const plan = price?.recurring?.interval === "year" ? "yearly" : "monthly";
  must(
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
        stripe_event_created_at: eventCreatedAt,
      },
      { onConflict: "stripe_subscription_id" },
    ),
    "enregistrement de l'abonnement",
  );
}
