// Lecture / écriture de SON PROPRE profil, compatible avec la fermeture des colonnes sensibles
// (supabase-close-read-leaks.sql, blocs 3A et 3B).
//
// Contexte : après le bloc 3B, les comptes connectés n'ont plus le droit SELECT sur six colonnes de `profiles`
// (birth_date, ban_reason, suspend_reason, report_count, flagged_for_review, notification_preferences). Or
// `select("*")` et le RETURNING d'un `.update().select()` s'étendent à TOUTES les colonnes : ils échouent alors avec
// l'erreur 42501 « permission denied for table profiles ». Son propre profil complet se lit désormais par la fonction
// SECURITY DEFINER `get_my_profile()` (bloc 3A), qui ne renvoie que la ligne de l'appelant.
//
// Comportement (aucune étape d'ordre imposée au propriétaire, pas de variable d'environnement) :
//  - Tant que le bloc 3B n'est pas exécuté : EXACTEMENT les mêmes requêtes qu'avant (select("*"), update().select().single()).
//  - Si l'une d'elles échoue avec 42501 (le bloc 3B vient d'être joué), on bascule sur get_my_profile() et on mémorise ce
//    choix dans le navigateur : les chargements suivants appellent get_my_profile() d'emblée (aucun 403 de plus dans la console).
//  - Si get_my_profile() est introuvable (bloc 3A annulé), on oublie ce choix et on revient aux requêtes directes.
// Une écriture refusée avec 42501 n'a RIEN écrit (une seule instruction SQL, annulée en bloc) : la rejouer sans RETURNING est sûre.

const PREF_KEY = "baobab:ownProfileViaRpc";

function rpcPreferred() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
  }
}

function setRpcPreferred(on) {
  try {
    if (typeof localStorage === "undefined") return;
    if (on) localStorage.setItem(PREF_KEY, "1");
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* stockage indisponible (navigation privée...) : le repli 42501 suffit */
  }
}

export function isPermissionDenied(error) {
  if (!error) return false;
  return error.code === "42501" || /permission denied/i.test(String(error.message || ""));
}

export function isMissingRpc(error) {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883" || error.status === 404 || /could not find the function/i.test(String(error.message || ""));
}

const hasRpc = (client) => typeof client?.rpc === "function";

// get_my_profile() renvoie un `setof profiles` ; .maybeSingle() donne l'objet, ou null s'il n'y a pas de profil.
function callGetMyProfile(client) {
  return Promise.resolve(client.rpc("get_my_profile").maybeSingle());
}

// Lecture de son propre profil par user_id (chargement initial, retour de session).
export async function readOwnProfile(client, authUserId) {
  if (rpcPreferred() && hasRpc(client)) {
    const viaRpc = await callGetMyProfile(client);
    if (!viaRpc.error) return viaRpc;
    if (!isMissingRpc(viaRpc.error)) return viaRpc;
    setRpcPreferred(false);
  }
  const direct = await Promise.resolve(client.from("profiles").select("*").eq("user_id", authUserId).maybeSingle());
  if (direct?.error && isPermissionDenied(direct.error) && hasRpc(client)) {
    const viaRpc = await callGetMyProfile(client);
    if (!viaRpc.error) {
      setRpcPreferred(true);
      return viaRpc;
    }
    return direct; // fonction absente ou autre erreur : on garde l'erreur d'origine, plus parlante
  }
  return direct;
}

// Après une écriture réussie : relit la ligne complète. Renvoie { data, error } comme `.select().single()`.
async function reread(client, id) {
  const res = await callGetMyProfile(client);
  if (res.error) return res;
  if (!res.data) return { data: null, error: { code: "PGRST116", message: "Profil introuvable après écriture", details: `id=${id}` } };
  setRpcPreferred(true);
  return res;
}

// Remplace `from("profiles").update(payload).eq("id", id).select().single()`.
export async function updateOwnProfile(client, id, payload) {
  if (!rpcPreferred() || !hasRpc(client)) {
    const direct = await Promise.resolve(client.from("profiles").update(payload).eq("id", id).select().single());
    if (!(direct?.error && isPermissionDenied(direct.error) && hasRpc(client))) return direct;
  }
  const written = await Promise.resolve(client.from("profiles").update(payload).eq("id", id).select("id").single());
  if (written?.error) return written;
  return reread(client, id);
}

// Remplace `from("profiles").insert(payload).select().single()`.
export async function insertOwnProfile(client, payload) {
  if (!rpcPreferred() || !hasRpc(client)) {
    const direct = await Promise.resolve(client.from("profiles").insert(payload).select().single());
    if (!(direct?.error && isPermissionDenied(direct.error) && hasRpc(client))) return direct;
  }
  const written = await Promise.resolve(client.from("profiles").insert(payload).select("id").single());
  if (written?.error) return written;
  return reread(client, written.data?.id);
}
