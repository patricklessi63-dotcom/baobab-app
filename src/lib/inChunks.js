import { chunk } from "./chunk.js";

// Exécute une requête Supabase `.in("col", [...])` en lots (voir chunk.js : une
// URL PostgREST trop longue est refusée par la passerelle, ~8-16 ko, soit
// ~220 uuid). `runLot(lot)` doit renvoyer la requête (thenable) construite pour
// UN lot d'ids ; les lots partent en parallèle borné (`concurrency`, 4 par
// défaut) puis les résultats sont fusionnés.
//
// Ne lève jamais : une erreur sur un lot (réponse `error` ou rejet) ne fait pas
// perdre les lots réussis. L'appelant choisit : tolérer (journaliser `errors`)
// ou propager (`if (errors.length) throw errors[0]`) selon son comportement
// historique. `failedLots` permet de ne pas écraser un état précédent pour les
// ids dont le lot a échoué.
export const IN_CHUNK_SIZE = 100;

export async function selectInChunks(ids, runLot, { size = IN_CHUNK_SIZE, concurrency = 4 } = {}) {
  const lots = chunk(ids, size);
  const results = new Array(lots.length);
  let next = 0;
  const worker = async () => {
    while (next < lots.length) {
      const i = next++;
      try {
        results[i] = (await runLot(lots[i])) || { data: null, error: null };
      } catch (error) {
        results[i] = { data: null, error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), lots.length) }, worker));
  const data = [];
  const errors = [];
  const failedLots = [];
  results.forEach((r, i) => {
    if (r.error) { errors.push(r.error); failedLots.push(lots[i]); return; }
    if (Array.isArray(r.data)) data.push(...r.data);
  });
  return { data, errors, failedLots };
}
