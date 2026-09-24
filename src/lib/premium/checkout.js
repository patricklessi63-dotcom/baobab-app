import { supabase } from "../../supabaseClient";

// Bug corrigé (24 sept., signalé en prod) : create-checkout-session et
// create-portal-session renvoient déjà un message précis et actionnable en
// cas d'échec (ex. "Aucun abonnement trouvé pour ce compte.", "Non
// authentifié.") — voir supabase/functions/*/index.ts, toUserMessage(). Mais
// quand une edge function répond avec un statut non-2xx, le SDK supabase-js
// ne met JAMAIS ce corps JSON dans `data` (qui reste `null`) : il faut le
// relire depuis `error.context`, le vrai objet Response HTTP porté par la
// FunctionsHttpError (voir la doc supabase-js : `await error.context.json()`).
// Sans ce correctif, `if (error) throw ...` court-circuitait avant même
// d'atteindre le fallback `data?.error` de la ligne suivante (déjà prévu
// pour ce cas mais jamais atteignable) — masquant la vraie raison aussi
// bien à l'utilisateur qu'à nous en support (impossible de diagnostiquer
// depuis un simple message "Réessaie").
async function extractFunctionErrorMessage(error, fallback) {
  try {
    if (error?.context?.json) {
      const body = await error.context.json();
      if (body?.error) return body.error;
    }
  } catch (_) {
    // Corps non-JSON ou déjà consommé (FunctionsRelayError/FetchError sans
    // context exploitable) — on retombe sur le message générique.
  }
  return fallback;
}

// Redirige vers Stripe Checkout (hébergé par Stripe — Baobab ne voit
// jamais de donnée bancaire). Lève une erreur lisible en cas d'échec,
// à afficher via le mécanisme d'erreur existant (onError).
export async function startCheckout(plan) {
  const { data, error } = await supabase.functions.invoke("create-checkout-session", { body: { plan } });
  if (error) throw new Error(await extractFunctionErrorMessage(error, "Impossible de démarrer le paiement. Réessaie."));
  if (!data?.url) throw new Error(data?.error || "Impossible de démarrer le paiement.");
  window.location.href = data.url;
}

// Redirige vers le Stripe Billing Portal (hébergé) — gestion complète de
// l'abonnement (annulation, moyen de paiement, factures) sans que Baobab
// ait à construire cette interface lui-même.
export async function openBillingPortal() {
  const { data, error } = await supabase.functions.invoke("create-portal-session");
  if (error) throw new Error(await extractFunctionErrorMessage(error, "Impossible d'ouvrir la gestion de l'abonnement. Réessaie."));
  if (!data?.url) throw new Error(data?.error || "Impossible d'ouvrir la gestion de l'abonnement.");
  window.location.href = data.url;
}
