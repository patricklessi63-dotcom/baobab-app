// Purge réelle des statuts expirés depuis plus de 7 jours (lignes + fichiers
// Storage associés). Appelée exclusivement par la tâche planifiée pg_cron/
// pg_net (voir supabase-cleanup-expired-stories-cron.sql) — jamais
// directement par un client — même motif d'autorisation que
// process-scheduled-deletions/index.ts (correspondance exacte avec la clé
// service role, pas de JWT utilisateur).
//
// Bug corrigé à l'audit : supabase-stories-expiration.sql (24h) fait
// disparaître un statut expiré de l'affichage via la policy RLS SELECT
// ("expires_at > now()"), mais ne supprime NI la ligne NI le fichier média
// dans le bucket "avatars" — contrairement à toutes les autres tâches de
// fond du projet (comptes, actualités immigration, rappels d'événements),
// qui ont toutes un cron de purge/traitement réel. Un statut expiré restait
// donc en base et son média orphelin en Storage pour toujours.
//
// Délai de 7 jours après expiration (pas une purge immédiate à l'expiration) :
// laisse une marge de modération (signalement d'un statut abusif encore
// consultable côté modération/support) avant suppression définitive — même
// logique de délai de grâce que process-scheduled-deletions (24h) pour les
// comptes, ici plus longue car un statut expiré n'est déjà plus visible par
// personne (contrairement à un compte en grâce, pleinement fonctionnel) :
// le délai ne sert donc qu'à la modération, pas à l'utilisateur.
//
// story_views et story_reactions référencent stories(id) en
// "on delete cascade" (voir supabase-stories-2.sql) : la suppression de la
// ligne "stories" ci-dessous élimine déjà ces lignes associées sans action
// supplémentaire ici.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

const RETENTION_DAYS = 7;

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
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: dueStories, error: dueError } = await admin
      .from("stories")
      .select("id, media_url")
      .lte("expires_at", cutoff);
    if (dueError) throw dueError;

    if (!dueStories?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Même convention de chemin que le nettoyage manuel côté client
    // (SocialShell.jsx, suppression de son propre statut) : le média est
    // publié dans le bucket "avatars" sous <profile_id>/story-..., et
    // media_url stocke l'URL publique complète.
    const marker = "/avatars/";
    const storagePaths = dueStories
      .map((s) => {
        const idx = s.media_url?.indexOf(marker);
        if (idx === undefined || idx === -1) return null;
        return decodeURIComponent(s.media_url.slice(idx + marker.length));
      })
      .filter((p): p is string => Boolean(p));

    if (storagePaths.length) {
      const { error: removeError } = await admin.storage.from("avatars").remove(storagePaths);
      // Un échec de suppression Storage (fichier déjà absent, etc.) ne doit
      // pas empêcher la purge des lignes en base — sinon un statut resterait
      // indéfiniment coincé en attente de purge à cause d'un seul fichier
      // problématique. On journalise seulement.
      if (removeError) console.error("Suppression Storage partielle échouée :", removeError);
    }

    const { error: deleteError } = await admin
      .from("stories")
      .delete()
      .in("id", dueStories.map((s) => s.id));
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ ok: true, processed: dueStories.length }), {
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
