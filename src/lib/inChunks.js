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

// PostgREST tronque silencieusement toute réponse à `max_rows` lignes (1000 par
// défaut sur Supabase), sans erreur. Un lot de 100 ids peut dépasser ce plafond
// quand on lit des lignes « enfant » (ex. likes/commentaires de 100 posts) :
// `buildPage(from, to)` doit renvoyer la requête du lot avec `.order(<clé
// unique>)` (pagination par décalage stable) et `.range(from, to)`. On enchaîne
// les pages tant qu'une page est pleine. Une erreur à une page invalide tout le
// lot (`{ data: null, error }`) : des compteurs partiels seraient faux. À passer
// comme `runLot` de selectInChunks. `maxPages` borne la boucle (50 000 lignes).
export const PAGE_SIZE = 1000;

export async function selectAllPages(buildPage, { pageSize = PAGE_SIZE, maxPages = 50 } = {}) {
  const data = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const res = (await buildPage(from, from + pageSize - 1)) || { data: null, error: null };
    if (res.error) return { data: null, error: res.error };
    const rows = Array.isArray(res.data) ? res.data : [];
    for (const r of rows) data.push(r);
    if (rows.length < pageSize) break;
  }
  return { data, error: null };
}
