// Traite les suppressions de compte différées (délai de grâce de 24h).
// Appelée exclusivement par la tâche planifiée pg_cron/pg_net (voir
// supabase-account-deletion.sql) — jamais directement par un client. Pas de
// JWT utilisateur ici (aucun utilisateur "appelant" : la fonction traite
// potentiellement plusieurs comptes en un seul passage), l'autorisation se
// fait donc par correspondance exacte avec la clé service role elle-même.
//
// Corrige aussi la limite connue de delete-account/index.ts (fichiers
// Storage jamais nettoyés) : cette fonction supprime réellement avatars
// (photos de profil + médias de statuts), chat-media, event-media, post-media
// et community-media du compte avant de supprimer les lignes de base de
// données. NON nettoyés volontairement : event-covers et les couvertures de
// communautés (la communauté/l'événement survit au compte).
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
import { chunkList, listAllFileNames, uniqueStoragePaths } from "../_shared/storagePaths.ts";

const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2024-06-20" }) : null;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

// Nettoyage Storage = au mieux (comme avant) : une erreur de listage ou de suppression est
// journalisée mais NE BLOQUE JAMAIS la suppression du compte (sinon une panne Storage
// empêcherait indéfiniment l'effacement du profil, exigé par Apple 5.1.1(v) / Google Play).
async function removeInChunks(bucket: string, paths: string[]) {
  for (const batch of chunkList(paths, 100)) {
    try {
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) console.error("Suppression Storage partielle", bucket, error);
    } catch (e) {
      console.error("Suppression Storage échouée", bucket, e);
    }
  }
}

async function listAllSafe(bucket: string, prefix: string): Promise<string[]> {
  try {
    return await listAllFileNames((p, opts) => admin.storage.from(bucket).list(p, opts), prefix);
  } catch (e) {
    console.error("Listage Storage échoué", bucket, e);
    return [];
  }
}

async function cleanupStorage(profileId: string, userId: string) {
  // listAllFileNames : storage.list() ne renvoie que 100 entrées par défaut — au-delà, les
  // fichiers restaient après la suppression du compte (voir _shared/storagePaths.ts).
  const avatarNames = await listAllSafe("avatars", userId);
  const avatarFiles = avatarNames.map((name) => ({ name }));
  if (avatarFiles.length) {
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
    if (toRemove.length) await removeInChunks("avatars", toRemove);
  }

  // Bug corrigé : le dossier chat-media/<match_key>/ est PARTAGÉ par les
  // deux participants (voir supabase-chat-media-storage.sql, "convention de
  // chemin"). "messages.from_id" est en "on delete cascade" — seuls les
  // messages ENVOYÉS par ce profil disparaissent de la table ; les messages
  // de l'autre participant restent bien réels, media_path compris. L'ancien
  // code listait puis vidait le dossier ENTIER du match_key dès qu'un des
  // deux participants supprimait son compte, effaçant au passage les
  // images/vidéos/audios/fichiers envoyés par l'autre personne — qui se
  // retrouvait avec des messages cassés dans une conversation qu'elle n'a
  // pourtant pas supprimée. Correctif : ne supprimer que les fichiers
  // réellement envoyés par CE profil (from_id = profileId), récupérés via
  // messages.media_path avant que la ligne "profiles" (et donc la cascade
  // sur messages.from_id) ne soit déclenchée plus bas.
  const { data: ownMedia } = await admin
    .from("messages")
    .select("media_path")
    .eq("from_id", profileId)
    .not("media_path", "is", null);
  const ownMediaPaths = [...new Set((ownMedia || []).map((r) => r.media_path).filter(Boolean))];
  if (ownMediaPaths.length) {
    await removeInChunks("chat-media", ownMediaPaths);
  }

  // Note : les couvertures d'événements ("event-covers") ne sont PAS
  // nettoyées ici. Contrairement à "event_media" (dont les lignes sont en
  // "on delete cascade" sur uploaded_by, donc réellement supprimées), un
  // événement créé par ce profil continue d'exister après la suppression de
  // son compte (created_by passe à NULL). Effacer sa couverture casserait
  // l'affichage de l'événement pour tous les participants restants.

  const { data: mediaRows } = await admin.from("event_media").select("storage_path").eq("uploaded_by", profileId);
  if (mediaRows?.length) {
    await removeInChunks("event-media", mediaRows.map((r) => r.storage_path));
  }

  const postFileNames = await listAllSafe("post-media", userId);
  if (postFileNames.length) {
    await removeInChunks("post-media", postFileNames.map((name) => `${userId}/${name}`));
  }

  // Médias des publications de COMMUNAUTÉ : les lignes community_posts partent par cascade
  // (author_id on delete cascade), mais leurs fichiers vivent dans le bucket "community-media",
  // sous <id communauté>/..., et n'étaient jamais supprimés (fichiers orphelins). La colonne
  // media_url contient une URL signée : on en retrouve le chemin AVANT la suppression du profil.
  const { data: communityPostRows } = await admin
    .from("community_posts")
    .select("media_url")
    .eq("author_id", profileId)
    .not("media_url", "is", null);
  const communityMediaPaths = uniqueStoragePaths(communityPostRows, "community-media");
  if (communityMediaPaths.length) {
    await removeInChunks("community-media", communityMediaPaths);
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
        // Ordre important : auth.users AVANT profiles. "profiles.user_id" a une
        // FK "on delete cascade" vers auth.users (voir supabase-scale-security-2.sql,
        // section 4) — supprimer le compte auth élimine donc déjà la ligne
        // profiles automatiquement. Avec l'ancien ordre (profiles puis auth),
        // un échec réseau/API sur deleteUser laissait un compte auth.users
        // orphelin PERMANENT : la requête de sélection ci-dessus filtre sur
        // "profiles", donc une ligne profiles déjà supprimée ne serait plus
        // jamais reprise par une exécution suivante pour réessayer deleteUser.
        // Avec ce nouvel ordre, un échec de deleteUser laisse le profil intact
        // (rien n'a encore été supprimé) : la prochaine exécution du cron
        // retentera normalement le même profil.
        const { error: deleteUserError } = await admin.auth.admin.deleteUser(profile.user_id);
        if (deleteUserError) throw deleteUserError;
        // No-op attendu si la cascade a déjà fait le travail ci-dessus ; conservé
        // en filet de sécurité si jamais la contrainte FK venait à manquer.
        const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", profile.id);
        if (deleteProfileError) throw deleteProfileError;
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
