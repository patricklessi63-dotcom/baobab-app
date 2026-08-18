import { supabase } from "../../supabaseClient";

const TIMEOUT_MS = 15000;

// Enveloppe fine autour de la Edge Function ai-assist — jamais appelée
// directement depuis les composants (item 26). Timeout côté client pour ne
// jamais laisser l'UI bloquée en attente (items 28-29). Ne lève jamais
// d'exception — retourne toujours { data, error }, l'appelant reste
// fonctionnel même si le service IA est indisponible.
export async function invokeAI(action, payload = {}) {
  try {
    const result = await Promise.race([
      supabase.functions.invoke("ai-assist", { body: { action, ...payload } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const { data, error } = result;
    if (error) return { data: null, error: "Le service IA n'a pas pu répondre. Réessaie." };
    if (data?.error) return { data: null, error: data.error };
    return { data, error: null };
  } catch (e) {
    if (e.message === "timeout") return { data: null, error: "Le service IA met trop de temps à répondre." };
    return { data: null, error: "Le service IA n'est pas disponible pour le moment." };
  }
}
