// BAOBAB — Envoi de notifications push (Web Push / VAPID)
// Origines possibles :
// - Déclenché par le trigger pg_net sur "messages" INSERT (payload
//   { record: { match_key, from_id, ... } }, forme historique).
// - Déclenché par le trigger pg_net sur "likes" INSERT quand un match se
//   forme (payload { type: "match", record: { recipient_id, actor_id } }).
// - Déclenché par le trigger pg_net sur "likes" INSERT pour CHAQUE like,
//   mutuel ou non (payload { type: "like", record: { recipient_id, actor_id } }).
// - Déclenché par le trigger pg_net sur "follows" INSERT (payload
//   { type: "follow", record: { recipient_id, actor_id } }).
// Les mêmes évènements partent AUSSI vers les applications natives (table
// device_push_tokens : FCM pour Android, APNs pour iOS) — voir
// _shared/nativePush.ts et MOBILE.md (« Étape 3a »). Le Web Push ci-dessous est
// strictement inchangé ; l'envoi natif est isolé (jamais d'exception, ignoré si
// ses variables d'environnement ou sa table sont absentes).
// Authentifié par un secret partagé dans l'en-tête x-webhook-secret (le
// trigger n'a pas de JWT utilisateur) plutôt qu'un endpoint ouvert.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  createNativePushClient,
  deepLinkPathFor,
  isCategoryEnabled,
  loadNativePushConfig,
  type NativeTokenRow,
} from "../_shared/nativePush.ts";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contact@baobab.app";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Configuration native (facultative) : FCM_SERVICE_ACCOUNT_JSON (Android),
// APNS_KEY_P8 + APNS_KEY_ID + APNS_TEAM_ID [+ APNS_BUNDLE_ID, APNS_USE_SANDBOX] (iOS).
// Une valeur manquante ou illisible désactive simplement la plateforme.
const NATIVE_CONFIG = loadNativePushConfig((name) => Deno.env.get(name));
if (!NATIVE_CONFIG.fcm && !NATIVE_CONFIG.apns) {
  console.log("send-push: aucune configuration push native (FCM/APNs) : Web Push uniquement.");
}

// Client natif unique (le jeton d'accès Google et le jeton APNs sont mis en cache
// entre deux requêtes tant que l'instance de la fonction reste chaude).
const nativeAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const nativeClient = createNativePushClient(NATIVE_CONFIG, {
  fetch,
  removeToken: async (token: string) => {
    await nativeAdmin.from("device_push_tokens").delete().eq("token", token);
  },
  log: (m: string) => console.log(m),
});

// Envoi natif : jamais d'exception vers l'appelant, jamais bloquant pour le Web Push.
async function sendNative(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  notif: { title: string; body: string },
  nativeUrl: string
) {
  if (!NATIVE_CONFIG.fcm && !NATIVE_CONFIG.apns) return;
  try {
    const { data: rows, error } = await supabase
      .from("device_push_tokens")
      .select("token,platform")
      .eq("user_id", userId);
    // Table absente (supabase-device-tokens.sql pas encore exécuté) ou autre
    // erreur : on n'envoie rien en natif et on continue.
    if (error || !rows || rows.length === 0) return;
    await nativeClient.send(rows as NativeTokenRow[], { title: notif.title, body: notif.body, url: nativeUrl });
  } catch (e) {
    console.error("send-push: envoi natif échoué", (e as Error)?.message);
  }
}

async function sendToRecipient(
  supabase: ReturnType<typeof createClient>,
  recipientProfileId: string,
  prefKey: string,
  notif: { title: string; body: string },
  nativeUrl: string
) {
  // Charge utile Web Push : octet pour octet celle d'avant l'ajout du natif.
  const notifPayload = JSON.stringify({ title: notif.title, body: notif.body, url: "/" });
  const { data: recipient } = await supabase
    .from("profiles")
    .select("id,user_id,notification_preferences")
    .eq("id", recipientProfileId)
    .maybeSingle();
  if (!recipient) return;
  if (!isCategoryEnabled(recipient.notification_preferences, prefKey)) return;

  await Promise.allSettled([
    sendWebPush(supabase, recipient.user_id, notifPayload),
    sendNative(supabase, recipient.user_id, notif, nativeUrl),
  ]);
}

async function sendWebPush(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  notifPayload: string
) {
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  await Promise.allSettled(
    subs.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notifPayload
        );
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }
    })
  );
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (payload.type === "match") {
      const recipientId = payload.record?.recipient_id;
      const actorId = payload.record?.actor_id;
      if (!recipientId || !actorId) return new Response("ok", { status: 200 });

      const { data: actor } = await supabase.from("profiles").select("name").eq("id", actorId).maybeSingle();
      const notif = {
        title: "❤️ Nouveau match",
        body: `Toi et ${actor?.name || "quelqu'un"} vous êtes mutuellement plu·es !`,
      };
      await sendToRecipient(supabase, recipientId, "match", notif, deepLinkPathFor("match", actorId));
      return new Response("ok", { status: 200 });
    }

    if (payload.type === "like") {
      const recipientId = payload.record?.recipient_id;
      const actorId = payload.record?.actor_id;
      if (!recipientId || !actorId) return new Response("ok", { status: 200 });

      const { data: actor } = await supabase.from("profiles").select("name").eq("id", actorId).maybeSingle();
      const notif = {
        title: "❤️ Nouveau like",
        body: `${actor?.name || "Quelqu'un"} a aimé ton profil !`,
      };
      await sendToRecipient(supabase, recipientId, "likes", notif, deepLinkPathFor("like", actorId));
      return new Response("ok", { status: 200 });
    }

    if (payload.type === "follow") {
      const recipientId = payload.record?.recipient_id;
      const actorId = payload.record?.actor_id;
      if (!recipientId || !actorId) return new Response("ok", { status: 200 });

      const { data: actor } = await supabase.from("profiles").select("name").eq("id", actorId).maybeSingle();
      const notif = {
        title: "👋 Nouvel abonné",
        body: `${actor?.name || "Quelqu'un"} s'est abonné·e à toi !`,
      };
      await sendToRecipient(supabase, recipientId, "follows", notif, deepLinkPathFor("follow", actorId));
      return new Response("ok", { status: 200 });
    }

    const record = payload.record;
    if (!record || !record.match_key || !record.from_id) {
      return new Response("ok", { status: 200 });
    }

    const ids = String(record.match_key).split("__");
    const otherProfileId = ids.find((id: string) => id !== record.from_id);
    if (!otherProfileId) return new Response("ok", { status: 200 });

    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("id", record.from_id)
      .maybeSingle();

    // Aperçu masquable (confidentialité messagerie, item 6) — préférence
    // du DESTINATAIRE, pas de l'expéditeur : c'est son écran verrouillé.
    const { data: recipient } = await supabase
      .from("profiles")
      .select("notification_preferences")
      .eq("id", otherProfileId)
      .maybeSingle();
    const hidePreview = recipient?.notification_preferences?.hide_message_preview === true;

    const bodyText = hidePreview
      ? "Nouveau message"
      : record.kind === "text" ? String(record.text || "").slice(0, 120) : "Nouveau message";
    const notif = {
      title: hidePreview ? "Baobab" : (sender?.name || "Baobab"),
      body: bodyText,
    };
    await sendToRecipient(supabase, otherProfileId, "messages", notif, deepLinkPathFor("message", record.from_id));

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 200 });
  }
});
