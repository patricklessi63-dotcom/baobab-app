import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

// "Masquer une recommandation" (item 10) — persistant et réel, respecté
// immédiatement (exclusion locale optimiste + insertion réelle en base).
// Même motif que favorites/blocks : une ligne self -> target, RLS self-only.
export function useHiddenRecommendations(currentUser, targetType) {
  const [hiddenIds, setHiddenIds] = useState(new Set());

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
    if (!currentUser) return;
    setHiddenIds((s) => new Set(s).add(targetId));
    const { error } = await supabase
      .from("hidden_recommendations")
      .insert({ profile_id: currentUser.id, target_type: targetType, target_id: targetId });
    if (error && error.code !== "23505") console.error(error.message, error.code, error.details, error.hint);
  };

  return { hiddenIds, hide };
}
