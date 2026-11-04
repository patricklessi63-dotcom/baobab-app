// Point d'entrée unique de la modération de texte côté application (voir contentModeration.js pour
// l'algorithme et supabase-moderation-text.sql pour l'application côté serveur, qui fait autorité).
//
// Usage à chaque point d'envoi (message, publication, commentaire, biographie, statut) :
//   await screenText(supabase, "post", body);   // lève une Error(MODERATION_REFUSAL) si refusé
// et, sur une erreur de la base : if (isModerationRefusal(error)) onError(MODERATION_REFUSAL).

import { checkText, MODERATION_REFUSAL, setModerationTerms } from "./contentModeration";

export { MODERATION_REFUSAL };

// Le déclencheur SQL lève un message contenant ce marqueur quand le serveur refuse un texte que
// l'application avait laissé passer (liste modifiée entre-temps, appel direct à l'API…).
export const SERVER_REFUSAL_MARKER = "MODERATION_REFUSED";

export const isModerationRefusal = (error) =>
  Boolean(error) && (error.moderation === true || String(error.message || error).includes(SERVER_REFUSAL_MARKER));

let termsLoad = null;
// Pour les tests : oublie le chargement déjà fait.
export const resetModerationTermsLoad = () => { termsLoad = null; };

// Charge la liste vivante (table moderation_terms, modifiable par les administrateurs). Une seule
// fois par session ; si la table n'existe pas encore ou n'est pas lisible, on garde la liste de
// départ du dépôt — jamais de blocage de l'application pour une liste introuvable.
export function loadModerationTerms(supabase) {
  if (termsLoad) return termsLoad;
  termsLoad = (async () => {
    try {
      const [terms, exceptions] = await Promise.all([
        supabase.from("moderation_terms").select("term, category, severity").eq("active", true).limit(2000),
        supabase.from("moderation_exceptions").select("phrase").eq("active", true).limit(500),
      ]);
      if (terms.error || !terms.data?.length) return false;
      setModerationTerms(terms.data, (exceptions.data || []).map((e) => e.phrase));
      return true;
    } catch (_) {
      return false;
    }
  })();
  return termsLoad;
}

// Contrôle un texte avant envoi. Retourne le résultat si le texte est accepté (éventuellement
// « flagged » = accepté mais à relire) ; lève Error(MODERATION_REFUSAL) si refusé.
// Le serveur est prévenu (RPC moderation_screen) UNIQUEMENT quand quelque chose est détecté : il
// enregistre l'infraction ou le signalement et applique la sanction progressive. L'appel est
// « au mieux » : un échec (fonction pas encore déployée, réseau) ne change jamais la décision.
export async function screenText(supabase, source, text) {
  await loadModerationTerms(supabase);
  const result = checkText(text);
  if (result.blocked || result.flagged) {
    try {
      const { data } = await supabase.rpc("moderation_screen", { p_source: source, p_text: String(text ?? "") });
      if (data && data.sanction && result.blocked) result.sanction = data.sanction;
    } catch (_) { /* silencieux */ }
  }
  if (result.blocked) {
    const err = new Error(MODERATION_REFUSAL);
    err.moderation = true;
    err.result = result;
    throw err;
  }
  return result;
}
