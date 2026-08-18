import { supabase } from "../../supabaseClient";

// Redirige vers Stripe Checkout (hébergé par Stripe — Baobab ne voit
// jamais de donnée bancaire). Lève une erreur lisible en cas d'échec,
// à afficher via le mécanisme d'erreur existant (onError).
export async function startCheckout(plan) {
  const { data, error } = await supabase.functions.invoke("create-checkout-session", { body: { plan } });
  if (error) throw new Error("Impossible de démarrer le paiement. Réessaie.");
  if (!data?.url) throw new Error(data?.error || "Impossible de démarrer le paiement.");
  window.location.href = data.url;
}

// Redirige vers le Stripe Billing Portal (hébergé) — gestion complète de
// l'abonnement (annulation, moyen de paiement, factures) sans que Baobab
// ait à construire cette interface lui-même.
export async function openBillingPortal() {
  const { data, error } = await supabase.functions.invoke("create-portal-session");
  if (error) throw new Error("Impossible d'ouvrir la gestion de l'abonnement. Réessaie.");
  if (!data?.url) throw new Error(data?.error || "Impossible d'ouvrir la gestion de l'abonnement.");
  window.location.href = data.url;
}
