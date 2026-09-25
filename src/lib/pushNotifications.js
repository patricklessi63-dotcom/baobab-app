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
//
// Bug corrigé à l'audit : "activé" était déduit uniquement de l'état local
// du navigateur (Boolean(subscription)). Or PushManager peut rester
// abonné côté navigateur sans que la ligne push_subscriptions existe côté
// serveur — par exemple si l'upsert de enablePushNotifications() a échoué
// après coup (réseau coupé juste après l'abonnement navigateur) ou si le
// navigateur a fait tourner discrètement l'abonnement (endpoint renouvelé
// sans notify explicite ailleurs dans l'app). Dans ce cas précis, l'ancien
// code affichait "Désactiver" comme si tout fonctionnait, alors qu'aucun
// push ne peut jamais être livré (send-push ne trouve aucune ligne pour cet
// utilisateur). On revérifie donc que la ligne existe réellement en base
// pour cet endpoint et on tente une réparation best-effort (ré-upsert des
// clés déjà connues localement, sans nouvelle demande de permission) avant
// de considérer l'abonnement comme valide ; si la réparation échoue aussi
// (ex. hors-ligne), on remonte honnêtement "non abonné".
export async function getPushSubscriptionStatus() {
  if (!isPushSupported()) return { supported: false, permission: "unsupported", subscribed: false };
  const permission = Notification.permission;
  if (permission !== "granted") return { supported: true, permission, subscribed: false };
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return { supported: true, permission, subscribed: false };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supported: true, permission, subscribed: false };

  const { data: existing } = await supabase
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", subscription.endpoint)
    .maybeSingle();
  if (existing) return { supported: true, permission, subscribed: true };

  try {
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
    return { supported: true, permission, subscribed: true };
  } catch (e) {
    console.error(e);
    return { supported: true, permission, subscribed: false };
  }
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
