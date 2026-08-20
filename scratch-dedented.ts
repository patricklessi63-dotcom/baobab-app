import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:contact@baobab.app";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
return new Response("unauthorized", { status: 401 });
}

try {
const payload = await req.json();
const record = payload.record;
if (!record || !record.match_key || !record.from_id) {
return new Response("ok", { status: 200 });
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const ids = String(record.match_key).split("__");
const otherProfileId = ids.find((id: string) => id !== record.from_id);
if (!otherProfileId) return new Response("ok", { status: 200 });

const { data: recipient } = await supabase
.from("profiles")
.select("id,user_id,notification_preferences")
.eq("id", otherProfileId)
.maybeSingle();
if (!recipient) return new Response("ok", { status: 200 });
if (recipient.notification_preferences?.messages === false) {
return new Response("ok", { status: 200 });
}

const { data: subs } = await supabase
.from("push_subscriptions")
.select("endpoint,p256dh,auth")
.eq("user_id", recipient.user_id);
if (!subs || subs.length === 0) return new Response("ok", { status: 200 });

const { data: sender } = await supabase
.from("profiles")
.select("name")
.eq("id", record.from_id)
.maybeSingle();

const bodyText = record.kind === "text" ? String(record.text || "").slice(0, 120) : "Nouveau message";
const notifPayload = JSON.stringify({
title: sender?.name || "Baobab",
body: bodyText,
url: "/",
});

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

return new Response("ok", { status: 200 });
} catch (e) {
console.error(e);
return new Response("error", { status: 200 });
}
});
