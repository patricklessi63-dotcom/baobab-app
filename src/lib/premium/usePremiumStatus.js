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
  // Bug corrigé : en cas d'échec réseau de la requête "subscriptions"
  // ci-dessous, on se contentait de logger l'erreur en console puis de
  // couper `loading` sans jamais l'exposer aux appelants. Pour eux, ça se
  // voyait EXACTEMENT comme "chargement terminé, aucun abonnement" — donc
  // `isPremium` retombait à false, indiscernable d'un vrai statut gratuit.
  // Un·e abonné·e Premium dont la requête échouait (coupure réseau, panne
  // Supabase ponctuelle) se voyait donc traité·e comme non-Premium par
  // tous les écrans qui lisent ce hook (PremiumPage, badge de profil...),
  // au lieu de voir une erreur claire ou de garder une valeur de repli.
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // Permet à PremiumPage de revérifier le statut à la demande (ex. juste
  // après un retour de Stripe Checkout, le temps que le webhook écrive la
  // ligne "subscriptions" — voir stripe-webhook/index.ts) sans dupliquer
  // la requête ci-dessous.
  const refresh = () => setRefreshTick((t) => t + 1);

  useEffect(() => {
    if (!currentUser) {
      setSubscription(null);
      setError(null);
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
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) {
          console.error(err.message, err.code, err.details, err.hint);
          // On NE touche PAS à `subscription` : si un rafraîchissement
          // échoue après un chargement initial réussi, on garde la
          // dernière valeur connue plutôt que de la remplacer par "aucun
          // abonnement". `error` permet aux appelants de distinguer ce cas
          // d'un vrai statut gratuit confirmé.
          setError(err.message || "Erreur réseau.");
          setLoading(false);
          return;
        }
        setError(null);
        setSubscription(data || null);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [currentUser?.id, refreshTick]);

  // Bug corrigé : l'effet ci-dessus ne revérifie "subscriptions" qu'au
  // montage (changement de currentUser?.id) ou sur refresh() explicite
  // (PremiumPage après un retour de Stripe Checkout). Un composant qui
  // reste monté pendant toute la session (ex. l'onglet "Abonnement" de
  // ProfileTab) ne relance donc jamais cette requête tout seul : si
  // l'abonnement expire (current_period_end dépassé) ou bascule en
  // "past_due"/"canceled" chez Stripe PENDANT que l'onglet est resté
  // ouvert en arrière-plan (webhook stripe-webhook/index.ts déjà traité
  // entre-temps), `subscription` reste la valeur chargée avant l'expiration
  // et `isPremium` restait donc vrai jusqu'à un rechargement complet de la
  // page — un utilisateur pouvait continuer à voir/utiliser des
  // fonctionnalités Premium (ex. "Qui m'a aimé") après la fin réelle de son
  // abonnement. Même motif que le rafraîchissement de présence/bannissement
  // dans App.jsx : on revérifie au retour de focus sur l'onglet, pas
  // seulement au montage.
  useEffect(() => {
    if (!currentUser) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") setRefreshTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [currentUser?.id]);

  const isPremium = Boolean(
    subscription
    && (subscription.status === "active" || subscription.status === "trialing")
    && (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
  );

  return { isPremium, subscription, loading, error, refresh };
}
