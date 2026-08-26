// Traite les suppressions de compte différées (délai de grâce de 24h).
// Appelée exclusivement par la tâche planifiée pg_cron/pg_net (voir
// supabase-account-deletion.sql) — jamais directement par un client. Pas de
// JWT utilisateur ici (aucun utilisateur "appelant" : la fonction traite
// potentiellement plusieurs comptes en un seul passage), l'autorisation se
// fait donc par correspondance exacte avec la clé service role elle-même.
//
// Corrige aussi la limite connue de delete-account/index.ts (fichiers
// Storage jamais nettoyés) : cette fonction supprime réellement avatars,
// chat-media et event-media du compte avant de supprimer les lignes de
// base de données.
//
// Important : "communities.created_by" et "events.created_by" sont en
// "on delete set null" (voir supabase-communities.sql / supabase-events.sql)
// — une communauté ou un événement créé par ce profil SURVIT à sa
// suppression (seule l'attribution disparaît). Le nettoyage Storage ne doit
// donc jamais effacer une image de couverture encore utilisée par une
// communauté/un événement qui continue d'exister, sous peine d'afficher une
// image cassée à tous ses membres restants.

import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

async function cleanupStorage(profileId: string, userId: string) {
  const { data: avatarFiles } = await admin.storage.from("avatars").list(userId);
  if (avatarFiles?.length) {
    // Les couvertures de communautés créées par ce profil (CommunityCreateForm)
    // sont uploadées dans ce même dossier "avatars/<userId>/", au milieu des
    // photos de profil — mais la communauté, elle, n'est pas supprimée (voir
    // note plus haut). On exclut donc ces fichiers précis de l'effacement : le
    // "created_by" est encore intact à ce stade (le profil n'est supprimé
    // qu'après cet appel), donc la requête ne peut pas manquer de communautés.
    const { data: ownedCommunities } = await admin
      .from("communities")
      .select("cover_url")
      .eq("created_by", profileId);
    const keepNames = new Set(
      (ownedCommunities || [])
        .map((c) => c.cover_url)
        .filter(Boolean)
        .map((url) => {
          const marker = `/avatars/${userId}/`;
          const idx = url.indexOf(marker);
          return idx === -1 ? null : decodeURIComponent(url.slice(idx + marker.length));
        })
        .filter(Boolean)
    );
    const toRemove = avatarFiles.filter((f) => !keepNames.has(f.name)).map((f) => `${userId}/${f.name}`);
    if (toRemove.length) await admin.storage.from("avatars").remove(toRemove);
  }

  const [{ data: asFirst }, { data: asSecond }] = await Promise.all([
    admin.from("messages").select("match_key").ilike("match_key", `${profileId}__%`),
    admin.from("messages").select("match_key").ilike("match_key", `%__${profileId}`),
  ]);
  const matchKeys = [...new Set([...(asFirst || []), ...(asSecond || [])].map((r) => r.match_key))];
  for (const key of matchKeys) {
    const { data: files } = await admin.storage.from("chat-media").list(key);
    if (files?.length) await admin.storage.from("chat-media").remove(files.map((f) => `${key}/${f.name}`));
  }

  // Note : les couvertures d'événements ("event-covers") ne sont PAS
  // nettoyées ici. Contrairement à "event_media" (dont les lignes sont en
  // "on delete cascade" sur uploaded_by, donc réellement supprimées), un
  // événement créé par ce profil continue d'exister après la suppression de
  // son compte (created_by passe à NULL). Effacer sa couverture casserait
  // l'affichage de l'événement pour tous les participants restants.

  const { data: mediaRows } = await admin.from("event_media").select("storage_path").eq("uploaded_by", profileId);
  if (mediaRows?.length) {
    await admin.storage.from("event-media").remove(mediaRows.map((r) => r.storage_path));
  }

  const { data: postFiles } = await admin.storage.from("post-media").list(userId);
  if (postFiles?.length) {
    await admin.storage.from("post-media").remove(postFiles.map((f) => `${userId}/${f.name}`));
  }
}

async function cancelStripeSubscriptions(profileId: string) {
  if (!stripe) return;
  const { data: subs } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("profile_id", profileId)
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Non autorisé." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: dueProfiles, error: dueError } = await admin
      .from("profiles")
      .select("id, user_id")
      .not("deletion_requested_at", "is", null)
      .lte("deletion_requested_at", cutoff);
    if (dueError) throw dueError;

    const results: { profile_id: string; ok: boolean; error?: string }[] = [];
    for (const profile of dueProfiles || []) {
      try {
        await cancelStripeSubscriptions(profile.id);
        await cleanupStorage(profile.id, profile.user_id);
        const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", profile.id);
        if (deleteProfileError) throw deleteProfileError;
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(profile.user_id);
        if (deleteUserError) throw deleteUserError;
        results.push({ profile_id: profile.id, ok: true });
      } catch (e) {
        console.error("Suppression différée échouée pour le profil", profile.id, e);
        results.push({ profile_id: profile.id, ok: false, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Une erreur est survenue." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
