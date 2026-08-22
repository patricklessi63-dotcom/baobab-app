// Crée une session du Stripe Billing Portal (interface hébergée par
// Stripe) — c'est la vraie solution pour "Gérer mon abonnement" :
// annulation, changement de moyen de paiement, factures. Baobab ne
// construit jamais cette UI lui-même et ne voit jamais de donnée bancaire.
//
// Secrets requis : STRIPE_SECRET_KEY, SITE_URL
// (SUPABASE_URL/SUPABASE_ANON_KEY déjà injectés par la plateforme)

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { UserError, toUserMessage } from "../_shared/errors.ts";

// Lus paresseusement (pas au chargement du module) : si un secret manque,
// "new Stripe(undefined)" lève immédiatement et empêche Deno.serve de
// répondre à QUOI QUE CE SOIT, y compris le préflight OPTIONS — ce qui se
// manifeste côté navigateur comme une erreur CORS trompeuse plutôt que le
// vrai message d'erreur ci-dessous.
const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;
const SITE_URL = Deno.env.get("SITE_URL");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!stripe || !SITE_URL) throw new UserError("Gestion de l'abonnement temporairement indisponible.");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserError("Non authentifié.");

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

    const { data: sub, error: subError } = await supabase
      .from("subscriptions").select("stripe_customer_id")
      .eq("profile_id", profile.id).not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (subError || !sub?.stripe_customer_id) throw new UserError("Aucun abonnement trouvé pour ce compte.");

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${SITE_URL}/`,
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: toUserMessage(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
