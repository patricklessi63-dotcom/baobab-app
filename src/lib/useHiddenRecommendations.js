import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

// "Masquer une recommandation" (item 10) — persistant et réel, respecté
// immédiatement (exclusion locale optimiste + insertion réelle en base).
// Même motif que favorites/blocks : une ligne self -> target, RLS self-only.
//
// Bug corrigé : contrairement à toggleFavorite (SocialShell.jsx) et aux
// autres bascules optimistes de l'app, un échec de l'insert ici (RLS,
// coupure réseau...) n'était jamais répercuté — targetId restait marqué
// masqué côté client pour le reste de la session (le profil disparaît de
// la pile/grille) sans jamais l'être réellement en base, et sans le moindre
// message d'erreur. La prochaine visite (nouveau montage du hook) faisait
// alors réapparaître un profil que l'utilisateur croyait avoir masqué,
// sans explication. On revient maintenant sur l'exclusion optimiste et on
// prévient via onError en cas d'échec réel (23505 = déjà masqué, non-erreur
// silencieuse comme avant). onError est optionnel pour ne pas casser un
// éventuel autre appelant qui ne le fournirait pas.
export function useHiddenRecommendations(currentUser, targetType, onError = () => {}) {
  const [hiddenIds, setHiddenIds] = useState(new Set());
  // Garde anti-double-clic, même motif que favoriteInFlightRef dans
  // SocialShell.jsx : un double-tap sur "Masquer" pendant que le premier
  // insert est encore en vol ne doit pas déclencher un second insert.
  const hideInFlightRef = useRef(new Set());

  useEffect(() => {
    if (!currentUser) { setHiddenIds(new Set()); return; }
    let alive = true;
    supabase
      .from("hidden_recommendations")
      .select("target_id")
      .eq("profile_id", currentUser.id)
      .eq("target_type", targetType)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        setHiddenIds(new Set((data || []).map((r) => r.target_id)));
      });
    return () => { alive = false; };
  }, [currentUser?.id, targetType]);

  const hide = async (targetId) => {
    if (!currentUser || hideInFlightRef.current.has(targetId)) return;
    hideInFlightRef.current.add(targetId);
    setHiddenIds((s) => new Set(s).add(targetId));
    try {
      const { error } = await supabase
        .from("hidden_recommendations")
        .insert({ profile_id: currentUser.id, target_type: targetType, target_id: targetId });
      if (error && error.code !== "23505") throw error;
    } catch (error) {
      console.error(error.message, error.code, error.details, error.hint);
      // Annule l'exclusion optimiste : sans ça, le profil restait masqué
      // localement pour rien alors que rien n'a été persisté.
      setHiddenIds((s) => { const n = new Set(s); n.delete(targetId); return n; });
      onError("Impossible de masquer ce profil pour le moment.");
    } finally {
      hideInFlightRef.current.delete(targetId);
    }
  };

  return { hiddenIds, hide };
}
