import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";

// Source UNIQUE du statut Premium côté frontend (item 10) — jamais de
// "if (user.subscription === ...)" dispersé dans les composants. Lit la
// ligne "subscriptions" la plus récente de l'utilisateur (RLS : lecture
// de sa propre ligne uniquement — voir supabase-premium.sql), jamais une
// colonne "premium" sur profiles, qui n'existe pas. Le calcul ci-dessous
// est le miroir client de la fonction SQL is_premium() — pratique pour
// l'affichage immédiat, mais jamais la barrière de sécurité réelle (les
// policies RLS et les webhooks Stripe le sont).
export function usePremiumStatus(currentUser) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  // Permet à PremiumPage de revérifier le statut à la demande (ex. juste
  // après un retour de Stripe Checkout, le temps que le webhook écrive la
  // ligne "subscriptions" — voir stripe-webhook/index.ts) sans dupliquer
  // la requête ci-dessous.
  const refresh = () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    if (!currentUser) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    supabase
      .from("subscriptions")
      .select("*")
      .eq("profile_id", currentUser.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          console.error(error.message, error.code, error.details, error.hint);
          setLoading(false);
          return;
        }
        setSubscription(data || null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [currentUser?.id, refreshTick]);

  const isPremium = Boolean(
    subscription
    && (subscription.status === "active" || subscription.status === "trialing")
    && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
  );

  return { isPremium, subscription, loading, refresh };
}
