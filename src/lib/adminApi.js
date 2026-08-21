import { supabase } from "../supabaseClient";

// Toute la protection réelle vit dans les RPC (security definer, vérifient
// le rôle plateforme à chaque appel) — ces wrappers ne font que les
// invoquer. Aucune de ces fonctions n'a d'effet si l'appelant n'est pas
// moderator+ (ou admin+ selon l'action), quoi que fasse le frontend.

export async function fetchDashboardStats() {
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error) throw error;
  return data;
}

export async function searchUsers(query = "") {
  const { data, error } = await supabase.rpc("admin_search_users", { p_query: query });
  if (error) throw error;
  return data || [];
}

export async function listReports(status = "open") {
  const { data, error } = await supabase.rpc("admin_list_reports", { p_status: status });
  if (error) throw error;
  return data || [];
}

export async function resolveReport(source, id, dismiss = false) {
  const { error } = await supabase.rpc("admin_resolve_report", { p_source: source, p_id: id, p_dismiss: dismiss });
  if (error) throw error;
}

export async function suspendUser(profileId, until, reason) {
  const { error } = await supabase.rpc("suspend_user", { p_profile_id: profileId, p_until: until, p_reason: reason });
  if (error) throw error;
}

export async function unsuspendUser(profileId) {
  const { error } = await supabase.rpc("unsuspend_user", { p_profile_id: profileId });
  if (error) throw error;
}

export async function banUser(profileId, reason) {
  const { error } = await supabase.rpc("ban_user", { p_profile_id: profileId, p_reason: reason });
  if (error) throw error;
}

export async function unbanUser(profileId) {
  const { error } = await supabase.rpc("unban_user", { p_profile_id: profileId });
  if (error) throw error;
}

export async function grantRole(profileId, role) {
  const { error } = await supabase.rpc("grant_platform_role", { p_profile_id: profileId, p_role: role });
  if (error) throw error;
}

export async function revokeRole(profileId) {
  const { error } = await supabase.rpc("revoke_platform_role", { p_profile_id: profileId });
  if (error) throw error;
}
