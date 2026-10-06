// Récupération d'une écriture dont l'issue est incertaine (publication,
// commentaire, ligne de média...) — même problème que les messages (voir
// messageGhost.js) pour les tables SANS identifiant fourni par le client :
// quand la connexion tombe PENDANT l'INSERT, le client ignore si la ligne a été
// créée ; un nouveau clic sur « Publier » créait alors un doublon visible de
// tous. Ici l'identifiant est un uuid généré par la base, pas de repère d'id
// croissant : on cherche une ligne identique (mêmes colonnes d'identité), de
// MOI, créée dans la dernière heure et qui n'est pas déjà connue de l'écran.
// Aucune écriture SQL requise ; une vraie clé d'idempotence serveur reste la
// solution complète (voir DEPLOIEMENT.md §10).

import { isAmbiguousWriteError } from "./networkError";

const WINDOW_MS = 60 * 60 * 1000;

// Cherche une ligne récente correspondant à `filters` (égalités) et absente de
// `knownIds`. Ne lève jamais : { row, error }.
export async function findRecentOwnDuplicate(client, table, filters, { select = "*", knownIds = new Set(), now = Date.now() } = {}) {
  try {
    let query = client.from(table).select(select);
    for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
    const { data, error } = await query
      .gt("created_at", new Date(now - WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return { row: null, error };
    return { row: (data || []).find((r) => !knownIds.has(r.id)) || null, error: null };
  } catch (e) {
    return { row: null, error: e };
  }
}

// INSERT d'une ligne avec récupération. `attempt()` exécute l'INSERT et renvoie
// { data, error }. Retourne { data } en cas de succès (ou de ligne déjà créée
// retrouvée), sinon { error, ambiguous } — ambiguous : on ignore si la ligne
// existe, l'appelant doit vérifier avant de recommencer (retry:true au
// prochain appel).
//  - retry : un essai précédent a échoué sans qu'on sache s'il avait abouti.
export async function insertWithRecovery({ client, table, attempt, filters, select, knownIds, retry = false }) {
  if (retry) {
    const probe = await findRecentOwnDuplicate(client, table, filters, { select, knownIds });
    if (probe.error) return { error: probe.error, ambiguous: true };
    if (probe.row) return { data: probe.row, adopted: true };
  }
  let result;
  try {
    result = await attempt();
  } catch (e) {
    result = { data: null, error: e };
  }
  if (!result.error && result.data) return { data: result.data };
  const error = result.error || new Error("Réponse vide");
  if (!isAmbiguousWriteError(error)) return { error, ambiguous: false };
  const probe = await findRecentOwnDuplicate(client, table, filters, { select, knownIds });
  if (probe.error) return { error, ambiguous: true };
  if (probe.row) return { data: probe.row, adopted: true };
  return { error, ambiguous: false };
}
