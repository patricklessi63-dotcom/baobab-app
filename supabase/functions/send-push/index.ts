// BAOBAB — Envoi de notifications push (Web Push / VAPID)
// Deux origines possibles :
// - Déclenché par le trigger pg_net sur "messages" INSERT (payload
//   { record: { match_key, from_id, ... } }, forme historique).
// - Déclenché par le trigger pg_net sur "likes" INSERT quand un match se
//   forme (payload { type: "match", record: { recipient_id, actor_id } }).
// Authentifié par un secret partagé dans l'en-tête x-webhook-secret (le
// trigger n'a pas de JWT utilisateur) plutôt qu'un endpoint ouvert.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contact@baobab.app";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

async function sendToRecipient(
  supabase: ReturnType<typeof createClient>,
  recipientProfileId: string,
  prefKey: string,
  notifPayload: string
) {
  const { data: recipient } = await supabase
    .from("profiles")
    .select("id,user_id,notification_preferences")
    .eq("id", recipientProfileId)
    .maybeSingle();
  if (!recipient) return;
  if (recipient.notification_preferences?.[prefKey] === false) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", recipient.user_id);
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
      const notifPayload = JSON.stringify({
        title: "❤️ Nouveau match",
        body: `Toi et ${actor?.name || "quelqu'un"} vous êtes mutuellement plu·es !`,
        url: "/",
      });
      await sendToRecipient(supabase, recipientId, "match", notifPayload);
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
    const notifPayload = JSON.stringify({
      title: hidePreview ? "Baobab" : (sender?.name || "Baobab"),
      body: bodyText,
      url: "/",
    });
    await sendToRecipient(supabase, otherProfileId, "messages", notifPayload);

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 200 });
  }
});
