import { supabase } from "../supabaseClient";

// Journal d'activation minimal (Phase 12a) — même motif "ne jamais lever"
// que invokeAI (src/lib/ai/aiClient.js) : l'action réelle (like, message,
// adhésion...) ne doit jamais échouer à cause d'un problème de tracking.
// La déduplication (une seule occurrence par type et par profil) est gérée
// côté base par unique(profile_id, event_type) — aucune vérification "est-ce
// la première fois ?" nécessaire pour la CORRECTION, un doublon échoue
// silencieusement.
//
// Audit performance (6 oct. 2026) : cette garde serveur ne dispense pas
// d'éviter l'appel réseau. "first_like" et "first_message" sont appelés à
// CHAQUE like et à CHAQUE message envoyé (App.jsx) : au-delà du premier, chaque
// appel est un POST supplémentaire voué à l'échec (409 / 23505), soit une
// requête réseau + une écriture refusée en base par message envoyé, et une
// erreur rouge dans la console du navigateur. On mémorise donc, par profil et
// par type, qu'un jalon est déjà enregistré (mémoire du module + localStorage
// pour les sessions suivantes) et on n'émet plus rien ensuite. Un jalon n'est
// marqué "fait" que si le serveur l'a accepté OU a répondu "déjà présent"
// (23505) ; un échec réseau/RLS ne le marque pas, il sera retenté.
const PERSIST_KEY = "bb-activation-sent";
const done = new Set(); // `${profileId}:${eventType}`

function readPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function persist(key) {
  try {
    const list = readPersisted();
    if (!list.includes(key)) {
      list.push(key);
      localStorage.setItem(PERSIST_KEY, JSON.stringify(list.slice(-50)));
    }
  } catch (_) {
    // localStorage indisponible (navigation privée, quota) : la mémoire du
    // module suffit pour la session en cours.
  }
}

function alreadyDone(key) {
  if (done.has(key)) return true;
  if (readPersisted().includes(key)) {
    done.add(key);
    return true;
  }
  return false;
}

// Réservé aux tests : vide la mémoire du module (le localStorage est nettoyé
// par le test lui-même).
export function _resetTrackActivationMemory() {
  done.clear();
}

export async function trackActivation(profileId, eventType) {
  if (!profileId) return;
  const key = `${profileId}:${eventType}`;
  if (alreadyDone(key)) return;
  // Marqué tout de suite (avant l'await) : deux appels rapprochés — ex. un
  // like puis un message dans la même seconde — ne partent pas en double.
  done.add(key);
  try {
    const { error } = await supabase.from("analytics_events").insert({ profile_id: profileId, event_type: eventType });
    if (!error || error.code === "23505") {
      persist(key);
    } else {
      done.delete(key); // échec réel (réseau, RLS) : on retentera au prochain appel
    }
  } catch (_) {
    done.delete(key);
    // Silencieux, intentionnel — jamais remonté à l'utilisateur.
  }
}
