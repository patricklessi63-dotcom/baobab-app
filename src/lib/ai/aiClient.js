import { supabase } from "../../supabaseClient";

const TIMEOUT_MS = 15000;

// Garde-fou client CÔTÉ UX, pas de sécurité — la vraie limite est déjà
// appliquée côté serveur (ai-assist/index.ts, RATE_LIMIT_PER_HOUR, 20/h par
// défaut). Corrige un trou trouvé à l'audit : aucun appelant d'invokeAI
// (traduction à la demande dans ConversationPane, reformulation/suggestions
// dans AiSuggestButton/AiConversationSuggestions/CommunityCreateForm) n'avait
// le moindre anti-rebond, contrairement à checkRateLimit déjà utilisé pour
// l'envoi de messages. Un seul bouton se désactive déjà pendant son propre
// appel (état "loading" local), mais rien n'empêchait de cliquer "Traduire"
// sur 10-15 messages différents en quelques secondes — chacun a son propre
// bouton/état indépendant — déclenchant autant d'appels réseau parallèles
// avant même que le quota horaire serveur ne les bloque. Centralisé ici
// (plutôt que dans chaque composant) pour protéger tous les appelants
// uniformément sans dépendre de chacun d'eux pour l'appliquer.
const AI_CLIENT_RATE_LIMIT = { maxCalls: 5, windowMs: 10000 };
let recentAiCallTimestamps = [];

function checkAiClientRateLimit(now = Date.now()) {
  const cutoff = now - AI_CLIENT_RATE_LIMIT.windowMs;
  recentAiCallTimestamps = recentAiCallTimestamps.filter((t) => t > cutoff);
  if (recentAiCallTimestamps.length >= AI_CLIENT_RATE_LIMIT.maxCalls) return false;
  recentAiCallTimestamps.push(now);
  return true;
}

// Enveloppe fine autour de la Edge Function ai-assist — jamais appelée
// directement depuis les composants (item 26). Timeout côté client pour ne
// jamais laisser l'UI bloquée en attente (items 28-29). Ne lève jamais
// d'exception — retourne toujours { data, error }, l'appelant reste
// fonctionnel même si le service IA est indisponible.
export async function invokeAI(action, payload = {}) {
  if (!checkAiClientRateLimit()) {
    return { data: null, error: "Trop de demandes IA en peu de temps. Attends quelques secondes et réessaie." };
  }
  try {
    const result = await Promise.race([
      supabase.functions.invoke("ai-assist", { body: { action, ...payload } }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    const { data, error } = result;
    if (error) {
      // supabase-js ne met JAMAIS le corps JSON dans `data` pour un statut
      // non-2xx (400/429) — il faut le relire depuis error.context (Response
      // brute de FunctionsHttpError). Sans ça, TOUTE erreur "attendue" de la
      // Edge Function (limite horaire de suggestions IA atteinte, non
      // authentifié, suggestions IA désactivées pour ce compte...) était
      // remplacée par un "Réessaie" générique : l'utilisateur qui venait de
      // dépasser son quota horaire ne le savait jamais et retentait aussitôt
      // pour rien.
      const serverMessage = await readServerErrorMessage(error);
      return { data: null, error: serverMessage || "Le service IA n'a pas pu répondre. Réessaie." };
    }
    if (data?.error) return { data: null, error: data.error };
    return { data, error: null };
  } catch (e) {
    if (e.message === "timeout") return { data: null, error: "Le service IA met trop de temps à répondre." };
    return { data: null, error: "Le service IA n'est pas disponible pour le moment." };
  }
}

// Extrait le message français rédigé côté serveur (voir ai-assist/index.ts,
// toUserMessage) depuis la Response brute portée par FunctionsHttpError.
// Défensif : le corps peut être vide, non-JSON, ou déjà consommé.
async function readServerErrorMessage(error) {
  try {
    const response = error?.context;
    if (!response || typeof response.json !== "function") return null;
    const body = await (typeof response.clone === "function" ? response.clone() : response).json();
    return typeof body?.error === "string" ? body.error : null;
  } catch (_) {
    return null;
  }
}
