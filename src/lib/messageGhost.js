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

const MAX_TEXT_FILTER_LENGTH = 1500;

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
    // Texte très long (jusqu'à 4000 caractères, parfois des émojis = 12 octets
    // chacun une fois encodés) : le filtre irait dans l'URL de la requête GET et
    // dépasserait la limite de la passerelle (414/431) — la vérification échouerait
    // alors À CHAQUE essai et le message resterait bloqué en échec. On filtre alors
    // côté client (isGhostOf compare le texte exact sur les 50 lignes récentes).
    else if (candidate.kind === "text" && typeof candidate.text === "string" && encodeURIComponent(candidate.text).length <= MAX_TEXT_FILTER_LENGTH) query = query.eq("text", candidate.text);
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

// Plafond de lignes relues par un rechargement de fond (voir planRefresh).
export const REFRESH_MAX_ROWS = 500;

function rowTime(m) {
  return Date.parse(m?.created_at);
}

// Plan de la requête de rechargement d'une conversation (refreshMessages).
//
// Une reprise après veille / un retour en ligne rechargeait seulement la
// DERNIÈRE page (30 lignes) puis recollait l'historique déjà remonté « à la
// main » : si plus d'une page de messages était arrivée pendant l'absence, il
// restait un TROU entre l'historique gardé et la page rechargée (les messages
// du milieu n'apparaissaient plus nulle part — le curseur de « Charger les
// précédents » part du plus ancien affiché, donc il ne les rechargeait jamais),
// et les lignes plus anciennes gardées n'étaient jamais mises à jour
// (suppression « pour tous », coches de lecture ratées pendant la coupure).
// Quand des lignes réelles de CETTE conversation sont déjà affichées, on relit
// donc TOUT depuis la plus ancienne (created_at >= since), plafonné à
// `maxRows` : la plage est contiguë et fraîche. Sinon : la dernière page.
export function planRefresh({ current, key, pageSize, maxRows = REFRESH_MAX_ROWS }) {
  let oldest = null;
  for (const m of current || []) {
    if (m?.match_key !== key || typeof m.id !== "number" || !Number.isFinite(rowTime(m))) continue;
    // Même milliseconde : le texte (microsecondes) départage, puis l'id — `since`
    // doit être le plus ancien au sens de la colonne, sinon une ligne de la même
    // milliseconde mais antérieure serait exclue de la plage relue.
    if (!oldest || rowTime(m) < rowTime(oldest) || (rowTime(m) === rowTime(oldest) && (m.created_at < oldest.created_at || (m.created_at === oldest.created_at && m.id < oldest.id)))) oldest = m;
  }
  if (!oldest) return { since: null, limit: pageSize };
  return { since: { created_at: oldest.created_at, id: oldest.id }, limit: Math.max(maxRows, pageSize) };
}

// « Charger les messages précédents » reste proposé : après une relecture
// complète depuis `since` (non plafonnée), rien n'a changé quant à l'historique
// plus ancien ; sinon la réponse pleine indique qu'il en reste.
export function refreshHasMore({ since, serverCount, limit, previous }) {
  if (since && serverCount < limit) return Boolean(previous);
  return serverCount >= limit;
}

// Un instantané serveur peut être PLUS VIEUX qu'un changement déjà appliqué
// localement (écho Realtime d'une suppression/lecture, suppression que je viens
// de faire) quand la requête de rechargement était en vol : il ne doit pas le
// défaire. Ces champs ne reviennent jamais en arrière côté serveur (read_at,
// deleted_at/deleted_by, deleted_for ne font que s'ajouter) ; un échec d'écriture
// restaure explicitement la ligne après coup (deleteMessageFor*).
function keepLocalFlags(serverRow, localRow) {
  if (!localRow) return serverRow;
  let out = serverRow;
  if (localRow.read_at && !serverRow.read_at) out = { ...out, read_at: localRow.read_at };
  if (localRow.deleted_at && !serverRow.deleted_at) out = { ...out, deleted_at: localRow.deleted_at, deleted_by: localRow.deleted_by ?? serverRow.deleted_by };
  const serverFor = Array.isArray(serverRow.deleted_for) ? serverRow.deleted_for : [];
  const extra = (Array.isArray(localRow.deleted_for) ? localRow.deleted_for : []).filter((id) => !serverFor.includes(id));
  if (extra.length > 0) out = { ...out, deleted_for: [...serverFor, ...extra] };
  return out;
}

// Résultat d'un rechargement de la conversation (refreshMessages) : lignes
// serveur + messages optimistes qui ne sont pas encore en base. Auparavant le
// rechargement REMPLAÇAIT tout l'état, ce qui faisait disparaître un message
// en cours d'envoi/d'upload (son accusé de réception ne trouvait plus rien à
// remplacer : le message n'apparaissait qu'au prochain rechargement).
//  - `since` / `limit` : le plan de la requête (voir planRefresh) ; `serverRows`
//    couvre alors toute la plage >= since tant que la réponse n'atteint pas
//    `limit` (réponse « pleine » = seulement la fin de la conversation).
export function mergeRefreshedMessages({ serverRows, current, cachedFailed, key, since = null, limit = Infinity }) {
  const currentList = current || [];
  const serverIds = new Set(serverRows.map((m) => m.id));
  const localById = new Map();
  for (const m of currentList) if (m.match_key === key && typeof m.id === "number") localById.set(m.id, m);
  const claimed = new Set();
  const seen = new Set();
  const temps = [];
  // Messages optimistes de l'état courant (en cours ou en échec) d'abord : leur
  // version est plus récente que celle du cache. Le cache ne sert que quand la
  // conversation n'est pas affichée (réouverture) : sinon il peut contenir un
  // échec déjà résolu (renvoi abouti) que l'effet de synchronisation n'a pas
  // encore retiré.
  const ownTemps = currentList.filter(
    (m) => m.match_key === key && typeof m.id === "string" && (m._status === "sending" || m._status === "uploading" || m._status === "failed")
  );
  const displayed = localById.size > 0 || ownTemps.length > 0;
  for (const m of [...ownTemps, ...(displayed ? [] : cachedFailed || [])]) {
    if (seen.has(m.id) || serverIds.has(m.id)) continue;
    seen.add(m.id);
    if (m._status === "failed" && m._maybeSent) {
      const ghost = serverRows.find((r) => !claimed.has(r.id) && isGhostOf(m, r, m._afterId));
      if (ghost) { claimed.add(ghost.id); continue; }
    }
    temps.push(m);
  }
  // Historique remonté à la main PENDANT la requête (« Charger les messages
  // précédents » terminé avant elle) : plus ancien que la plage relue, donc
  // absent de l'instantané. Rien à garder si la réponse est pleine (plage
  // tronquée : la contiguïté n'est pas garantie) ou sans plan `since`.
  const sinceTime = since ? Date.parse(since.created_at) : NaN;
  const capped = serverRows.length >= limit;
  const older = Number.isFinite(sinceTime) && !capped
    ? currentList.filter((m) => m.match_key === key && typeof m.id === "number" && !serverIds.has(m.id) && rowTime(m) < sinceTime)
    : [];
  // Lignes réelles PLUS RÉCENTES que la dernière ligne lue : arrivées (écho
  // Realtime, accusé d'un envoi qui vient d'aboutir) pendant que la requête de
  // rechargement était en vol — absentes de son instantané, elles disparaissaient
  // jusqu'au rechargement suivant. Les ids (identity) sont croissants.
  const maxServerId = serverRows.reduce((max, r) => (typeof r.id === "number" && r.id > max ? r.id : max), 0);
  const newer = currentList.filter(
    (m) => m.match_key === key && typeof m.id === "number" && !serverIds.has(m.id) && m.id > maxServerId
  );
  return [...older, ...serverRows.map((r) => keepLocalFlags(r, localById.get(r.id))), ...newer, ...temps];
}
