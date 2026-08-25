import { supabase } from "../supabaseClient";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Statut affiché dans les préférences : suit à la fois la permission
// navigateur (source de vérité pour "refusé") et l'existence d'un
// abonnement PushManager actif (source de vérité pour "activé").
export async function getPushSubscriptionStatus() {
  if (!isPushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  const permission = Notification.permission;
  if (permission !== "granted") return { supported: true, permission, subscribed: false };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return { supported: true, permission, subscribed: Boolean(subscription) };
}

export async function enablePushNotifications() {
  if (!isPushSupported()) throw new Error("Les notifications push ne sont pas prises en charge sur cet appareil.");
  if (!VAPID_PUBLIC_KEY) throw new Error("Configuration push manquante (clé VAPID absente).");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission de notification refusée.");

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié");

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;

  return subscription;
}

export async function disablePushNotifications() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  // Les deux étapes sont tentées indépendamment : si la suppression en base
  // échoue (réseau coupé, etc.), on désabonne quand même le navigateur pour
  // que le statut affiché à l'utilisateur reste cohérent avec son geste.
  // L'erreur de suppression, elle, est reportée à l'appelant pour affichage.
  let dbError = null;
  try {
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
    if (error) dbError = error;
  } catch (e) {
    dbError = e;
  }

  await subscription.unsubscribe();

  if (dbError) throw dbError;
}
