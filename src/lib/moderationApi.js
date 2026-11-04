import { supabase } from "../supabaseClient";

// Enveloppes minces autour des fonctions SQL de supabase-moderation-text.sql (SQL-31). Toute la
// protection réelle vit dans la base (chaque fonction vérifie le rôle de l'appelant) : rien ici ne
// donne un droit. Tant que SQL-31 n'est pas exécuté, les appels échouent avec « function ... does not
// exist » : isModerationMissing() permet à l'écran d'afficher « pas encore installé » plutôt qu'une erreur.

export const isModerationMissing = (error) => {
  const msg = String(error?.message || error || "");
  return error?.code === "PGRST202" || error?.code === "42883" || error?.code === "42P01" || /does not exist|could not find the function/i.test(msg);
};

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const listViolations = (status = "flagged", limit = 100) => rpc("admin_moderation_violations", { p_status: status, p_limit: limit }).then((d) => d || []);
export const listSanctions = (onlyAppeals = false, limit = 100) => rpc("admin_moderation_sanctions", { p_only_appeals: onlyAppeals, p_limit: limit }).then((d) => d || []);
export const listMediaQueue = (limit = 100) => rpc("admin_media_queue", { p_limit: limit }).then((d) => d || []);
export const mediaInfo = (kind, id) => rpc("admin_media_info", { p_kind: kind, p_id: id }).then((d) => (Array.isArray(d) ? d[0] : d) || null);

export const resolveFlag = (violationId, confirm, reason = null) => rpc("moderation_resolve_flag", { p_violation_id: violationId, p_confirm: confirm, p_reason: reason });
export const revokeSanction = (sanctionId, reason = null) => rpc("moderation_revoke_sanction", { p_sanction_id: sanctionId, p_reason: reason });
export const decideAppeal = (sanctionId, accept, reason = null) => rpc("moderation_decide_appeal", { p_sanction_id: sanctionId, p_accept: accept, p_reason: reason });
export const moderateMedia = (kind, id, action, reason = null) => rpc("moderate_media", { p_kind: kind, p_id: id, p_action: action, p_reason: reason });

// Administrateurs
export const upsertTerm = (term, category, severity = "block", active = true) => rpc("admin_upsert_moderation_term", { p_term: term, p_category: category, p_severity: severity, p_active: active });
export const deleteTerm = (id) => rpc("admin_delete_moderation_term", { p_id: id });
export const upsertException = (phrase, active = true) => rpc("admin_upsert_moderation_exception", { p_phrase: phrase, p_active: active });
export const updateSettings = (settings) => rpc("admin_update_moderation_settings", { p_settings: settings });

export async function fetchSettings() {
  const { data, error } = await supabase.from("moderation_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data;
}
export async function fetchTerms() {
  const { data, error } = await supabase.from("moderation_terms").select("id, term, category, severity, active").order("category").order("term").limit(2000);
  if (error) throw error;
  return data || [];
}

// Utilisateur : signaler une image, contester une sanction, lire ses sanctions.
export const reportMedia = (kind, id, reason, note = null) => rpc("report_media", { p_kind: kind, p_id: id, p_reason: reason, p_note: note });
export const appealSanction = (sanctionId, text) => rpc("moderation_appeal", { p_sanction_id: sanctionId, p_text: text });
export async function fetchMySanctions() {
  const { data, error } = await supabase.from("moderation_sanctions")
    .select("id, kind, until_at, reason, created_at, revoked_at, appeal_status").is("revoked_at", null).order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return data || [];
}

// États de modération des images : « hidden » / « removed » sont masquées à l'affichage.
export async function fetchHiddenMedia(kind, ids) {
  try {
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length) return new Set();
    const { data, error } = await supabase.from("media_moderation").select("target_id, status").eq("target_kind", kind).in("target_id", list).neq("status", "visible");
    if (error) return new Set(); // table absente ou illisible : rien n'est masqué
    return new Set((data || []).map((r) => r.target_id));
  } catch (_) {
    return new Set();
  }
}
