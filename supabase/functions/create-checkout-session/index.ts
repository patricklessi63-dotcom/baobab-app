// Crée une session Stripe Checkout pour un abonnement Baobab Premium.
// Appelée par le client authentifié (supabase.functions.invoke — le JWT
// Supabase de l'utilisateur est vérifié automatiquement par la plateforme,
// pas besoin de --no-verify-jwt sur cette fonction).
//
// Secrets requis (supabase secrets set ...) :
//   STRIPE_SECRET_KEY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, SITE_URL
//   SUPABASE_URL, SUPABASE_ANON_KEY (déjà injectés automatiquement par la plateforme)
// Optionnel : STRIPE_TRIAL_DAYS (0 = pas d'essai gratuit, défaut)

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { UserError, toUserMessage } from "../_shared/errors.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const SITE_URL = Deno.env.get("SITE_URL")!;
const TRIAL_DAYS = Number(Deno.env.get("STRIPE_TRIAL_DAYS") || "0");
const PRICE_IDS: Record<string, string> = {
  monthly: Deno.env.get("STRIPE_PRICE_MONTHLY")!,
  yearly: Deno.env.get("STRIPE_PRICE_YEARLY")!,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserError("Non authentifié.");

    // Client "au nom de l'utilisateur" — sa RLS s'applique normalement,
    // aucune clé service_role nécessaire ici (juste une lecture de son
    // propre abonnement, déjà autorisée par la policy SELECT).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new UserError("Non authentifié.");

    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("id").eq("user_id", user.id).single();
    if (profileError || !profile) throw new UserError("Profil introuvable.");

    const { plan } = await req.json();
    if (plan !== "monthly" && plan !== "yearly") throw new UserError("Plan invalide.");

    // Réutilise un Customer Stripe déjà existant pour ce profil, pour
    // éviter d'en créer un nouveau à chaque tentative d'abonnement.
    const { data: existing } = await supabase
      .from("subscriptions").select("stripe_customer_id")
      .eq("profile_id", profile.id).not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    let customerId = existing?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { profile_id: profile.id },
      });
      customerId = customer.id;
    }

    const subscriptionData: Record<string, unknown> = { metadata: { profile_id: profile.id, plan } };
    if (TRIAL_DAYS > 0) subscriptionData.trial_period_days = TRIAL_DAYS;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      subscription_data: subscriptionData,
      success_url: `${SITE_URL}/?premium=success`,
      cancel_url: `${SITE_URL}/?premium=cancelled`,
      metadata: { profile_id: profile.id, plan },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: toUserMessage(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
