// Audit de sécurité par l'API contre le projet de RÉPÉTITION uniquement (jamais la production).
//   node scripts/staging-security.mjs
// Tests AUTORISÉS sur l'environnement du projet : un utilisateur ordinaire (A), un second (B) et l'anonyme
// tentent des accès interdits. Un contrôle « OK » signifie que l'attaque a été REFUSÉE ou sans effet.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env.staging.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = "https://zqbvrnnmqiuhsigmxyud.supabase.co";
const KEY = "sb_publishable_bHCKcAlAilnmgjLFTHNf_g_cwsWU4CM";
if (URL_.includes("vozehymbihnckzklxesw")) throw new Error("PRODUCTION : refus");
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (area, name, ok, detail = "") => { results.push({ area, name, ok: Boolean(ok), detail }); console.log(`${ok ? "OK  " : "FAIL"} [${area}] ${name}${detail ? " — " + String(detail).slice(0, 140) : ""}`); };

async function login(email, password) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const { data: p } = await c.from("profiles").select("id").eq("user_id", data.user.id).maybeSingle();
  return { c, userId: data.user.id, profileId: p?.id };
}
const A = await login(env.TEST_A_EMAIL, env.TEST_A_PASSWORD);
const B = await login(env.TEST_B_EMAIL, env.TEST_B_PASSWORD);
const anon = mk();
const refused = (r) => Boolean(r.error) || (Array.isArray(r.data) ? r.data.length === 0 : !r.data);

// ---------- 1. Anonyme : aucune donnée privée
const PRIVATE_TABLES = ["profiles", "messages", "message_reactions", "likes", "passes", "blocks", "favorites", "follows", "profile_photos", "user_locations", "notifications", "device_push_tokens", "push_subscriptions", "subscriptions", "subscription_events", "reports", "post_reports", "community_reports", "event_reports", "info_reports", "beta_feedback", "beta_testers", "beta_events", "admin_actions", "platform_roles", "client_errors", "analytics_events", "ai_usage", "hidden_recommendations", "recommendation_feedback", "story_views", "story_reactions", "stories", "event_invitations", "community_invites", "community_join_requests"];
for (const t of PRIVATE_TABLES) {
  const r = await anon.from(t).select("*").limit(5);
  check("anonyme", `lecture de « ${t} » refusée`, refused(r), r.error?.message || `lignes: ${r.data?.length}`);
}
for (const fn of ["admin_dashboard_stats", "admin_search_users", "admin_list_reports", "admin_list_feedback", "ban_user", "admin_set_monetization", "get_my_profile"]) {
  const args = { admin_search_users: { p_query: "a" }, admin_list_reports: { p_status: "pending" }, admin_list_feedback: { p_status: "new" }, ban_user: { p_profile_id: A.profileId, p_reason: "x" }, admin_set_monetization: { p_enabled: true } }[fn] || {};
  const r = await anon.rpc(fn, args);
  check("anonyme", `RPC ${fn} refusée`, Boolean(r.error), r.error?.message || "ACCEPTÉE");
}
const anonStorage = await anon.storage.from("chat-media").list("");
check("anonyme", "listage du bucket chat-media refusé/vide", Boolean(anonStorage.error) || (anonStorage.data || []).length === 0);
for (const b of ["avatars", "post-media"]) {
  const l = await anon.storage.from(b).list("");
  check("anonyme", `listage du bucket public « ${b} » refusé/vide (pas d'énumération)`, Boolean(l.error) || (l.data || []).length === 0, `entrées: ${l.data?.length}`);
}

// ---------- 2. Utilisateur ordinaire : élévation de privilèges
const PRIV = [["is_premium", true], ["is_founder", true], ["email_verified", true], ["phone_verified", true], ["banned_at", null], ["suspended_until", null], ["risk_level", "low"], ["report_count", 0]];
for (const [col, val] of PRIV) {
  const before = await A.c.from("profiles").select(col).eq("id", A.profileId).maybeSingle();
  if (before.error) { check("élévation", `colonne ${col} : lecture directe fermée (get_my_profile)`, true, before.error.message); continue; }
  const flip = typeof before.data?.[col] === "boolean" ? !before.data[col] : val;
  const up = await A.c.from("profiles").update({ [col]: flip }).eq("id", A.profileId).select(col);
  const after = await A.c.from("profiles").select(col).eq("id", A.profileId).maybeSingle();
  check("élévation", `modifier soi-même « ${col} » est sans effet / refusé`, up.error || after.data?.[col] === before.data?.[col], up.error?.message || `inchangé: ${after.data?.[col]}`);
}
const roles = await A.c.from("platform_roles").select("*");
check("élévation", "platform_roles : A ne voit pas les rôles des autres", !roles.error ? (roles.data || []).every((r) => r.profile_id === A.profileId || r.user_id === A.userId) : true, roles.error?.message || `lignes: ${roles.data?.length}`);
const selfAdmin = await A.c.from("platform_roles").insert({ profile_id: A.profileId, user_id: A.userId, role: "admin" });
check("élévation", "s'attribuer le rôle admin (INSERT platform_roles) refusé", Boolean(selfAdmin.error), selfAdmin.error?.message || "ACCEPTÉ");
for (const [fn, args] of [["admin_dashboard_stats", {}], ["admin_search_users", { p_query: "a" }], ["admin_list_reports", { p_status: "pending" }], ["admin_list_feedback", { p_status: "new" }], ["ban_user", { p_profile_id: B.profileId, p_reason: "test" }], ["admin_set_monetization", { p_enabled: true }]]) {
  const r = await A.c.rpc(fn, args);
  check("élévation", `utilisateur ordinaire : RPC ${fn} refusée`, Boolean(r.error), r.error?.message || "ACCEPTÉE");
}
const bAfter = await B.c.from("profiles").select("id").eq("id", B.profileId);
check("élévation", "B n'a pas été banni par la tentative de A", (bAfter.data || []).length === 1);

// ---------- 3. Données d'autrui
const modB = await A.c.from("profiles").update({ name: "PIRATÉ" }).eq("id", B.profileId).select();
check("données d'autrui", "A ne peut pas modifier le profil de B", Boolean(modB.error) || (modB.data || []).length === 0, modB.error?.message || "0 ligne");
const delB = await A.c.from("profiles").delete().eq("id", B.profileId).select();
check("données d'autrui", "A ne peut pas supprimer le profil de B", Boolean(delB.error) || (delB.data || []).length === 0);
const bName = await B.c.from("profiles").select("name").eq("id", B.profileId).maybeSingle();
check("données d'autrui", "le profil de B est intact", bName.data?.name === "TesteurB", bName.data?.name);
for (const t of ["user_locations", "device_push_tokens", "push_subscriptions", "subscriptions", "notifications", "reports", "beta_feedback", "admin_actions", "client_errors", "analytics_events", "ai_usage", "hidden_recommendations", "story_views", "blocks", "passes", "favorites"]) {
  const r = await A.c.from(t).select("*").limit(50);
  const foreign = (r.data || []).filter((row) => {
    const owner = row.user_id ?? row.profile_id ?? row.from_id ?? row.recipient_id ?? row.reporter_id ?? row.viewer_id;
    return owner && owner !== A.userId && owner !== A.profileId;
  });
  check("données d'autrui", `« ${t} » : A ne lit que ses propres lignes`, !r.error ? foreign.length === 0 : true, r.error?.message || `lignes d'autrui: ${foreign.length}/${r.data?.length}`);
}
const locB = await A.c.from("user_locations").select("latitude_approx,longitude_approx").eq("user_id", B.userId);
check("données d'autrui", "A ne lit pas la position de B", refused(locB), locB.error?.message || `lignes: ${locB.data?.length}`);
const sens = await A.c.from("profiles").select("birth_date,ban_reason,suspend_reason,notification_preferences").eq("id", B.profileId);
check("données d'autrui", "colonnes sensibles de profiles (birth_date, ban_reason…) illisibles pour A", Boolean(sens.error), sens.error?.message || "LISIBLES");
const spoofNotif = await A.c.from("notifications").insert({ recipient_id: B.profileId, type: "new_message", title: "faux" });
check("données d'autrui", "A ne peut pas fabriquer une notification pour B", Boolean(spoofNotif.error), spoofNotif.error?.message || "ACCEPTÉ");
const spoofLike = await A.c.from("likes").insert({ from_id: B.profileId, to_id: A.profileId });
check("données d'autrui", "A ne peut pas liker au nom de B", Boolean(spoofLike.error), spoofLike.error?.message || "ACCEPTÉ");
const photoB = await A.c.from("profile_photos").insert({ profile_id: B.profileId, url: "https://example.com/x.jpg", position: 9 });
check("données d'autrui", "A ne peut pas ajouter une photo au profil de B", Boolean(photoB.error), photoB.error?.message || "ACCEPTÉ");
const photoBDel = await A.c.from("profile_photos").delete().eq("profile_id", B.profileId).select();
check("données d'autrui", "A ne peut pas supprimer les photos de B", Boolean(photoBDel.error) || (photoBDel.data || []).length === 0, photoBDel.error?.message || "0 ligne");

// ---------- 4. Contenu : publications / commentaires
const post = await B.c.from("posts").insert({ author_id: B.profileId, body: "post de B (audit sécurité)" }).select().maybeSingle();
if (post.error) {
  check("contenu", "B peut publier (prérequis du test)", false, post.error.message);
} else {
  const pid = post.data.id;
  const e1 = await A.c.from("posts").update({ body: "modifié par A" }).eq("id", pid).select();
  check("contenu", "A ne peut pas modifier la publication de B", Boolean(e1.error) || (e1.data || []).length === 0, e1.error?.message || "0 ligne");
  const e2 = await A.c.from("posts").delete().eq("id", pid).select();
  check("contenu", "A ne peut pas supprimer la publication de B", Boolean(e2.error) || (e2.data || []).length === 0, e2.error?.message || "0 ligne");
  const spoofPost = await A.c.from("posts").insert({ author_id: B.profileId, body: "usurpation" });
  check("contenu", "A ne peut pas publier au nom de B", Boolean(spoofPost.error), spoofPost.error?.message || "ACCEPTÉ");
  const cm = await B.c.from("post_comments").insert({ post_id: pid, author_id: B.profileId, body: "commentaire de B" }).select().maybeSingle();
  if (!cm.error) {
    const c1 = await A.c.from("post_comments").update({ body: "piraté" }).eq("id", cm.data.id).select();
    check("contenu", "A ne peut pas modifier le commentaire de B", Boolean(c1.error) || (c1.data || []).length === 0, c1.error?.message || "0 ligne");
    const c2 = await A.c.from("post_comments").delete().eq("id", cm.data.id).select();
    check("contenu", "A ne peut pas supprimer le commentaire de B", Boolean(c2.error) || (c2.data || []).length === 0, c2.error?.message || "0 ligne");
  }
  const xss = await B.c.from("posts").insert({ author_id: B.profileId, body: "<img src=x onerror=alert(1)><script>alert(1)</script>" }).select().maybeSingle();
  check("contenu", "texte HTML stocké tel quel (l'échappement est fait à l'affichage par React)", !xss.error, xss.error?.message);
  await B.c.from("posts").delete().eq("id", pid);
  if (xss.data?.id) await B.c.from("posts").delete().eq("id", xss.data.id);
}

// ---------- 5. Stockage : fichiers d'autrui
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
for (const bucket of ["avatars", "post-media"]) {
  const mine = await B.c.storage.from(bucket).upload(`${B.userId}/audit-${Date.now()}.png`, png, { contentType: "image/png" });
  const inA = await A.c.storage.from(bucket).upload(`${B.userId}/intrus-${Date.now()}.png`, png, { contentType: "image/png" });
  check("stockage", `${bucket} : A ne peut pas écrire dans le dossier de B`, Boolean(inA.error), inA.error?.message || "ACCEPTÉ");
  if (!mine.error) {
    const over = await A.c.storage.from(bucket).upload(mine.data.path, png, { contentType: "image/png", upsert: true });
    check("stockage", `${bucket} : A ne peut pas écraser un fichier de B`, Boolean(over.error), over.error?.message || "ACCEPTÉ");
    const rem = await A.c.storage.from(bucket).remove([mine.data.path]);
    const still = await B.c.storage.from(bucket).download(mine.data.path);
    check("stockage", `${bucket} : A ne peut pas supprimer un fichier de B`, !still.error, still.error?.message || "fichier toujours présent");
    await B.c.storage.from(bucket).remove([mine.data.path]);
  }
  const html = await A.c.storage.from(bucket).upload(`${A.userId}/x-${Date.now()}.html`, new Blob(["<script>1</script>"], { type: "text/html" }), { contentType: "text/html" });
  check("stockage", `${bucket} : type text/html refusé`, Boolean(html.error), html.error?.message || "ACCEPTÉ");
  const svg = await A.c.storage.from(bucket).upload(`${A.userId}/x-${Date.now()}.svg`, new Blob(["<svg onload=alert(1)/>"], { type: "image/svg+xml" }), { contentType: "image/svg+xml" });
  check("stockage", `${bucket} : type image/svg+xml refusé (XSS)`, Boolean(svg.error), svg.error?.message || "ACCEPTÉ");
}

// ---------- 6. Abus : tentatives de connexion répétées
let limited = 0, tried = 0, firstLimitAt = null;
for (let i = 0; i < 15; i++) {
  const c = mk();
  const r = await c.auth.signInWithPassword({ email: env.TEST_B_EMAIL, password: "mauvais-mot-de-passe-" + i });
  tried++;
  if (r.error && (r.error.status === 429 || /rate|trop|too many/i.test(r.error.message))) { limited++; firstLimitAt ??= tried; }
}
console.log(`INFO tentatives de connexion échouées : ${tried}, limitées (429) : ${limited}${firstLimitAt ? ", dès la tentative " + firstLimitAt : ""}`);
results.push({ area: "abus", name: "limitation des connexions échouées", ok: true, info: true, detail: `${limited}/${tried} limitées` });

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} contrôles réussis`);
if (failed.length) console.log("ÉCHECS :\n" + failed.map((f) => ` - [${f.area}] ${f.name} — ${f.detail}`).join("\n"));
fs.writeFileSync(new URL("../.staging-security-result.json", import.meta.url), JSON.stringify(results, null, 1));
process.exit(0);
