// Suppression réelle de compte (Phase 10, item 38) — jamais simulée.
// Appelée par le client authentifié (JWT vérifié automatiquement).
//
// Secrets requis : SUPABASE_SERVICE_ROLE_KEY (admin.deleteUser + bypass RLS
// pour la suppression en cascade). STRIPE_SECRET_KEY optionnel — si absent,
// l'annulation d'abonnement est simplement ignorée (le compte est quand
// même supprimé).
//
// Limite connue, signalée honnêtement (voir rapport) : les fichiers Storage
// de l'utilisateur (avatars, photos, chat-media, event-media...) ne sont
// PAS supprimés par cette fonction — seules les lignes de base de données
// le sont (via les "on delete cascade" déjà en place sur ~27 tables).

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { UserError, toUserMessage } from "../_shared/errors.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    // 1. Annuler tout abonnement Stripe actif AVANT de supprimer les
    // données (sinon la référence au Customer devient inaccessible).
    if (stripe) {
      const { data: subs } = await admin
        .from("subscriptions")
        .select("stripe_subscription_id, status")
        .eq("profile_id", profile.id)
        .in("status", ["active", "trialing", "past_due"]);
      for (const sub of subs || []) {
        if (sub.stripe_subscription_id) {
          try {
            await stripe.subscriptions.cancel(sub.stripe_subscription_id);
          } catch (e) {
            console.error("Annulation Stripe échouée pour", sub.stripe_subscription_id, e);
          }
        }
      }
    }

    // 2. Supprimer la ligne "profiles" — déclenche les "on delete cascade"
    // déjà en place sur ~27 tables (messages, matchs, communautés,
    // événements, abonnements, IA, etc.). Certaines colonnes d'attribution
    // ("created_by", "actor_id"...) sont volontairement "on delete set
    // null" pour ne pas effacer le contenu appartenant à d'autres
    // utilisateurs (ex : une communauté que cette personne a fondée reste,
    // simplement sans créateur attribuable).
    const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", profile.id);
    if (deleteProfileError) throw deleteProfileError;

    // 3. Supprimer le compte d'authentification lui-même — une ancienne
    // session ne doit plus permettre l'accès après ça (item 69).
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteUserError) throw deleteUserError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: toUserMessage(e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
