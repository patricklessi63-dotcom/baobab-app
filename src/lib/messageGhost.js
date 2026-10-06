// Envoi de message fiable face aux coupures réseau (audit du 6 oct. 2026).
//
// Problème : `supabase.from("messages").insert(row)` n'a aucune clé
// d'idempotence (`messages.id` est une identity générée par la base, le client
// ne peut pas la fournir). Quand la connexion tombe PENDANT l'envoi, le client
// ne sait pas si l'INSERT a été exécuté : si oui, le message existe côté
// serveur (et le destinataire l'a reçu) alors que l'expéditeur voit « échec ».
// Trois conséquences, toutes corrigées ici sans toucher au SQL :
//  1. l'écho Realtime du vrai message s'affichait À CÔTÉ du message « échec »
//     (deux bulles identiques chez l'expéditeur) ;
//  2. « Réessayer » — et surtout le renvoi AUTOMATIQUE au retour en ligne —
//     insérait une seconde fois le même message (doublon chez le destinataire) ;
//  3. pour un média, le fichier Storage était supprimé après l'échec alors que
//     la ligne existait bel et bien : message livré avec une pièce jointe cassée.
//
// Principe : après une erreur « sans code » (issue incertaine, voir
// networkError.js), on cherche le « fantôme » — une ligne de MOI, même
// conversation, même contenu, dont l'id est postérieur au dernier id connu au
// moment de l'envoi (ids croissants : aucune dépendance à l'horloge du
// téléphone). Trouvé : on l'adopte au lieu de réinsérer. Pas trouvé : l'échec
// est définitif (le fichier peut être supprimé). Recherche impossible
// (réseau toujours coupé) : on ne réinsère PAS, on garde le message en échec.
//
// Un renvoi manuel après un VRAI doublon voulu reste possible : l'adoption ne
// concerne que des lignes postérieures à `afterId` et, pour du texte, le même
// contenu exact envoyé par moi dans la même conversation depuis cet envoi.

import { isAmbiguousWriteError } from "./networkError";

// Sérialisation JSON à clés triées : jsonb renvoie les clés dans un autre ordre
// que celui d'envoi, une comparaison naïve de JSON.stringify échouerait.
function stable(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Plus grand id réel (numérique) d'une liste de messages. Les messages
// optimistes ont un id texte « temp-... » et sont ignorés.
export function maxRealMessageId(messages) {
  let max = 0;
  for (const m of messages || []) {
    if (typeof m?.id === "number" && m.id > max) max = m.id;
  }
  return max;
}

// `candidate` : la ligne d'insertion (row) OU un message optimiste de l'état
// (mêmes champs utiles). `serverRow` : ligne lue en base.
export function isGhostOf(candidate, serverRow, afterId) {
  if (!candidate || !serverRow) return false;
  if (typeof serverRow.id !== "number" || serverRow.id <= (afterId || 0)) return false;
  if (serverRow.from_id !== candidate.from_id || serverRow.match_key !== candidate.match_key) return false;
  if (serverRow.kind !== candidate.kind) return false;
  if ((serverRow.reply_to_id ?? null) !== (candidate.reply_to_id ?? null)) return false;
  const path = candidate.media_path || candidate._uploadedPath || null;
  if (path) return serverRow.media_path === path;
  if ((serverRow.text ?? null) !== (candidate.text ?? null)) return false;
  return stable(serverRow.media_meta) === stable(candidate.media_meta);
}

// Recherche, côté serveur, des lignes qui pourraient être le fantôme de
// `candidate`. Ne renvoie jamais une exception : { rows, error }.
export async function fetchGhostCandidates(client, candidate, afterId) {
  try {
    let query = client
      .from("messages")
      .select("*")
      .eq("match_key", candidate.match_key)
      .eq("from_id", candidate.from_id)
      .eq("kind", candidate.kind)
      .gt("id", afterId || 0);
    const path = candidate.media_path || candidate._uploadedPath || null;
    if (path) query = query.eq("media_path", path);
    else if (candidate.kind === "text" && typeof candidate.text === "string") query = query.eq("text", candidate.text);
    const { data, error } = await query.order("id", { ascending: true }).limit(50);
    if (error) return { rows: [], error };
    return { rows: data || [], error: null };
  } catch (e) {
    return { rows: [], error: e };
  }
}

// Insertion d'un message avec récupération. Retourne toujours un objet :
//  { outcome: "sent", data }      — INSERT confirmé par le serveur ;
//  { outcome: "adopted", data }   — le message existait déjà (fantôme), adopté ;
//  { outcome: "failed", error, ambiguous } — échec ; `ambiguous` = on ignore
//    si le message existe (ne pas supprimer le média, ne pas réinsérer à
//    l'aveugle).
// `afterId` (obligatoire pour la détection) : plus grand id réel connu AVANT
// le premier essai (voir maxRealMessageId) ; `retry` : true si un essai précédent a échoué sans
// qu'on sache s'il avait abouti (vérifier AVANT de réinsérer).
export async function insertMessageWithRecovery(client, row, { afterId, retry = false } = {}) {
  // Sans repère d'id fiable, impossible de distinguer un fantôme d'un ancien
  // message identique : on ne cherche rien (comportement d'origine).
  const canProbe = Number.isFinite(afterId);
  if (retry && canProbe) {
    const probe = await fetchGhostCandidates(client, row, afterId);
    if (probe.error) return { outcome: "failed", error: probe.error, ambiguous: true };
    const ghost = probe.rows.find((r) => isGhostOf(row, r, afterId));
    if (ghost) return { outcome: "adopted", data: ghost };
  }
  let result;
  try {
    result = await client.from("messages").insert(row).select().single();
  } catch (e) {
    result = { data: null, error: e };
  }
  if (!result.error && result.data) return { outcome: "sent", data: result.data };
  const error = result.error || new Error("Réponse vide");
  if (!isAmbiguousWriteError(error)) return { outcome: "failed", error, ambiguous: false };
  // Issue incertaine : une vérification immédiate lève le doute si le réseau
  // est revenu (réponse perdue, timeout), sans attendre un renvoi.
  if (!canProbe) return { outcome: "failed", error, ambiguous: true };
  const probe = await fetchGhostCandidates(client, row, afterId);
  if (probe.error) return { outcome: "failed", error, ambiguous: true };
  const ghost = probe.rows.find((r) => isGhostOf(row, r, afterId));
  if (ghost) return { outcome: "adopted", data: ghost };
  return { outcome: "failed", error, ambiguous: false };
}

// Un nouveau message de MOI arrive (écho Realtime) : s'il correspond à un
// message optimiste resté en échec « incertain », c'est son fantôme — on
// retire la bulle d'échec pour ne garder que le vrai message.
export function dropGhostTemps(messages, newRow) {
  const idx = messages.findIndex(
    (m) => typeof m.id === "string" && m._status === "failed" && m._maybeSent && isGhostOf(m, newRow, m._afterId)
  );
  if (idx === -1) return messages;
  return messages.filter((_, i) => i !== idx);
}

// Résultat d'un rechargement de la conversation (refreshMessages) : lignes
// serveur + messages optimistes qui ne sont pas encore en base. Auparavant le
// rechargement REMPLAÇAIT tout l'état, ce qui faisait disparaître un message
// en cours d'envoi/d'upload (son accusé de réception ne trouvait plus rien à
// remplacer : le message n'apparaissait qu'au prochain rechargement).
export function mergeRefreshedMessages({ serverRows, current, cachedFailed, key }) {
  const serverIds = new Set(serverRows.map((m) => m.id));
  const claimed = new Set();
  const seen = new Set();
  const temps = [];
  const inFlight = (current || []).filter(
    (m) => m.match_key === key && typeof m.id === "string" && (m._status === "sending" || m._status === "uploading")
  );
  for (const m of [...inFlight, ...(cachedFailed || [])]) {
    if (seen.has(m.id) || serverIds.has(m.id)) continue;
    seen.add(m.id);
    if (m._status === "failed" && m._maybeSent) {
      const ghost = serverRows.find((r) => !claimed.has(r.id) && isGhostOf(m, r, m._afterId));
      if (ghost) { claimed.add(ghost.id); continue; }
    }
    temps.push(m);
  }
  // Historique déjà chargé (« Charger les messages précédents ») : le serveur ne
  // renvoie que la dernière page, on garde donc les lignes réelles de CETTE
  // conversation plus anciennes que sa première ligne. Sans cela, chaque reprise
  // après veille (rechargement de fond) effaçait l'historique remonté à la main
  // et faisait sauter la liste.
  const first = serverRows[0];
  const firstTime = first ? Date.parse(first.created_at) : NaN;
  const older = first && Number.isFinite(firstTime)
    ? (current || []).filter((m) => {
        if (m.match_key !== key || typeof m.id !== "number" || serverIds.has(m.id)) return false;
        const t = Date.parse(m.created_at);
        return Number.isFinite(t) && (t < firstTime || (t === firstTime && m.id < first.id));
      })
    : [];
  // Lignes réelles PLUS RÉCENTES que la dernière ligne lue : arrivées (écho
  // Realtime, accusé d'un envoi qui vient d'aboutir) pendant que la requête de
  // rechargement était en vol — absentes de son instantané, elles disparaissaient
  // jusqu'au rechargement suivant. Les ids (identity) sont croissants.
  const maxServerId = serverRows.reduce((max, r) => (typeof r.id === "number" && r.id > max ? r.id : max), 0);
  const newer = (current || []).filter(
    (m) => m.match_key === key && typeof m.id === "number" && !serverIds.has(m.id) && m.id > maxServerId
  );
  return [...older, ...serverRows, ...newer, ...temps];
}
