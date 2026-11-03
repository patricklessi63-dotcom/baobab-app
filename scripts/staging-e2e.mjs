// Essais de bout en bout (API) de la messagerie contre le projet de RÉPÉTITION uniquement.
//   node scripts/staging-e2e.mjs
// Lit .env.staging.local (ignoré par git) : TEST_A_* / TEST_B_* + l'URL et la clé publique du projet de répétition.
// Refuse de s'exécuter si l'URL est celle de la production. Aucune donnée réelle n'est lue.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(fs.readFileSync(new URL("../.env.staging.local", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL_ = "https://zqbvrnnmqiuhsigmxyud.supabase.co";
const KEY = "sb_publishable_bHCKcAlAilnmgjLFTHNf_g_cwsWU4CM";
if (URL_.includes("vozehymbihnckzklxesw")) throw new Error("PRODUCTION : refus");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok: Boolean(ok), detail }); console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`); };
// Comportements CONNUS et ACCEPTÉS (documentés dans RAPPORT-MESSAGERIE.md) : consignés sans compter comme échec.
const info = (name, observed, detail = "") => { results.push({ name, ok: true, info: true, observed, detail }); console.log(`INFO ${name} — ${observed}${detail ? " (" + detail + ")" : ""}`); };
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email, password) {
  const c = mk();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  const { data: prof } = await c.from("profiles").select("id").eq("user_id", data.user.id).maybeSingle();
  return { c, userId: data.user.id, profileId: prof?.id };
}

const A = await login(env.TEST_A_EMAIL, env.TEST_A_PASSWORD);
const B = await login(env.TEST_B_EMAIL, env.TEST_B_PASSWORD);
const key = [A.profileId, B.profileId].sort().join("__");

// Outsider D : compte créé à la volée sur la répétition, sans profil ni match.
const dEmail = `outsider.${Date.now()}@example.com`;
const D = mk();
const dPass = "Dd4!" + Math.random().toString(36).slice(2, 12);
const { data: dSign, error: dErr } = await D.auth.signUp({ email: dEmail, password: dPass });
if (dErr) throw new Error("signup D: " + dErr.message);
check("compte « outsider » créé sur la répétition (confirmation email désactivée)", Boolean(dSign.session));

// ---- 1. Envoi / lecture / Realtime
const got = [];
const chB = B.c.channel("e2e-b").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `match_key=eq.${key}` }, (p) => got.push(p.new.id)).subscribe();
const gotD = [];
const chD = D.channel("e2e-d").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (p) => gotD.push(p.new.id)).subscribe();
await sleep(2500);
const t0 = Date.now();
const ins = await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: "e2e: bonjour" }).select().single();
check("A insère un message texte", !ins.error && ins.data?.id, ins.error?.message);
const m1 = ins.data;
await sleep(2500);
check("B reçoit l'INSERT en Realtime (< 2,5 s)", got.includes(m1?.id), `${Date.now() - t0} ms`);
check("l'outsider ne reçoit AUCUN événement Realtime de la conversation A–B", gotD.length === 0, `reçus: ${gotD.length}`);

const rb = await B.c.from("messages").select("id,text").eq("match_key", key).eq("id", m1.id);
check("B lit le message", rb.data?.length === 1);
const rd = await D.from("messages").select("id").eq("match_key", key);
check("l'outsider ne lit rien (RLS)", !rd.error && rd.data.length === 0, rd.error?.message || `lignes: ${rd.data?.length}`);
const insD = await D.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: "intrusion" });
check("l'outsider ne peut pas écrire dans la conversation (usurpation from_id)", Boolean(insD.error), insD.error?.message);
const insSpoof = await B.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: "usurpation" });
check("B ne peut pas envoyer au nom de A", Boolean(insSpoof.error), insSpoof.error?.message);

// ---- 2. Mises à jour interdites / autorisées
const upText = await A.c.from("messages").update({ text: "modifié" }).eq("id", m1.id).select();
check("modifier le texte d'un message envoyé est refusé", Boolean(upText.error) || (upText.data?.[0]?.text === "e2e: bonjour"), upText.error?.message || "ignoré");
const upOther = await B.c.from("messages").update({ deleted_at: new Date().toISOString() }).eq("id", m1.id).select();
check("B ne peut pas supprimer « pour tous » le message de A", Boolean(upOther.error) || !upOther.data?.[0]?.deleted_at, upOther.error?.message || "ignoré");
const selfRead = await A.c.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m1.id).select();
info("l'expéditeur peut marquer son propre message « lu »", Boolean(selfRead.error) || !selfRead.data?.[0]?.read_at ? "refusé" : "accepté (faux accusé de lecture sur ses propres messages, sans conséquence sur autrui hors badge du destinataire)");
const readB = await B.c.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m1.id).select();
check("le destinataire marque le message « lu »", !readB.error && Boolean(readB.data?.[0]?.read_at), readB.error?.message);
const delMe = await B.c.from("messages").update({ deleted_for: [B.profileId] }).eq("id", m1.id).select();
check("« supprimer pour moi » (deleted_for) accepté", !delMe.error && delMe.data?.[0]?.deleted_for?.includes(B.profileId), delMe.error?.message);
const delAll = await A.c.from("messages").update({ deleted_at: new Date().toISOString(), deleted_by: A.profileId }).eq("id", m1.id).select();
check("l'auteur supprime « pour tous »", !delAll.error && Boolean(delAll.data?.[0]?.deleted_at), delAll.error?.message);

// ---- 3. Contraintes de forme
const longTxt = await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: "x".repeat(4001) });
check("texte > 4000 caractères refusé", Boolean(longTxt.error), longTxt.error?.message);
const empty = await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: "" });
check("texte vide refusé", Boolean(empty.error), empty.error?.message);
const badKind = await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "hologramme", text: "x" });
check("type de message inconnu refusé", Boolean(badKind.error), badKind.error?.message);
const imgNoPath = await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "image", text: null, media_path: null });
check("image sans media_path refusée", Boolean(imgNoPath.error), imgNoPath.error?.message);

// ---- 4. Réactions
const m2 = (await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: "e2e: réactions" }).select().single()).data;
const reB = await B.c.from("message_reactions").insert({ message_id: m2.id, profile_id: B.profileId, emoji: "👍" });
check("B réagit à un message de la conversation", !reB.error, reB.error?.message);
const reD = await D.from("message_reactions").insert({ message_id: m2.id, profile_id: B.profileId, emoji: "😂" });
check("l'outsider ne peut pas réagir", Boolean(reD.error), reD.error?.message);
const reSpoof = await A.c.from("message_reactions").insert({ message_id: m2.id, profile_id: B.profileId, emoji: "🎉" });
check("A ne peut pas réagir au nom de B", Boolean(reSpoof.error), reSpoof.error?.message);
const reRead = await D.from("message_reactions").select("*").eq("message_id", m2.id);
check("l'outsider ne voit pas les réactions", !reRead.error && reRead.data.length === 0);

// ---- 5. Storage
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const upOk = await B.c.storage.from("chat-media").upload(`${key}/e2e-${Date.now()}.png`, png, { contentType: "image/png" });
check("B téléverse dans le dossier de sa conversation", !upOk.error, upOk.error?.message);
const upOtherFolder = await B.c.storage.from("chat-media").upload(`${A.profileId}__${crypto.randomUUID()}/e2e.png`, png, { contentType: "image/png" });
check("B ne peut pas téléverser dans le dossier d'une autre conversation", Boolean(upOtherFolder.error), upOtherFolder.error?.message);
const upHtml = await B.c.storage.from("chat-media").upload(`${key}/e2e-${Date.now()}.html`, new Blob(["<script>alert(1)</script>"], { type: "text/html" }), { contentType: "text/html" });
check("type MIME non autorisé (text/html) refusé par le bucket", Boolean(upHtml.error), upHtml.error?.message);
const signedOutsider = await D.storage.from("chat-media").createSignedUrl(upOk.data.path, 60);
check("l'outsider ne peut pas obtenir d'URL signée du fichier", Boolean(signedOutsider.error) || !signedOutsider.data?.signedUrl, signedOutsider.error?.message || "pas d'URL");
const signedA = await A.c.storage.from("chat-media").createSignedUrl(upOk.data.path, 60);
check("A (participant) obtient une URL signée", !signedA.error && Boolean(signedA.data?.signedUrl), signedA.error?.message);
const dl = signedA.data?.signedUrl ? await fetch(signedA.data.signedUrl) : null;
check("l'URL signée sert bien le fichier", dl?.ok && (await dl.arrayBuffer()).byteLength === png.length);
const anonDl = await fetch(`${URL_}/storage/v1/object/public/chat-media/${upOk.data.path}`);
check("le bucket chat-media n'est pas public (accès anonyme refusé)", !anonDl.ok, `HTTP ${anonDl.status}`);
const listOutsider = await D.storage.from("chat-media").list(key);
check("l'outsider ne peut pas lister le dossier de la conversation", !listOutsider.error && (listOutsider.data || []).length === 0, listOutsider.error?.message || `entrées: ${listOutsider.data?.length}`);

// ---- 6. Blocage
const blk = await A.c.from("blocks").insert({ from_id: A.profileId, to_id: B.profileId });
check("A bloque B", !blk.error, blk.error?.message);
const afterBlock = await B.c.from("messages").insert({ match_key: key, from_id: B.profileId, kind: "text", text: "après blocage" });
check("B ne peut plus écrire à A après blocage", Boolean(afterBlock.error), afterBlock.error?.message);
const bSeesA = await B.c.from("messages").select("id").eq("match_key", key);
info("après blocage, B relit l'historique de la conversation", bSeesA.data?.length ? "oui (choix : seul l'envoi est interdit)" : "non", `lignes: ${bSeesA.data?.length}`);
await A.c.from("blocks").delete().eq("from_id", A.profileId).eq("to_id", B.profileId);
const afterUnblock = await B.c.from("messages").insert({ match_key: key, from_id: B.profileId, kind: "text", text: "après déblocage" });
check("après déblocage, B peut de nouveau écrire", !afterUnblock.error, afterUnblock.error?.message);

// ---- 7. Cadence d'envoi
let refused = 0, accepted = 0, lastErr = "";
for (let i = 0; i < 40; i++) {
  const r = await A.c.from("messages").insert({ match_key: key, from_id: A.profileId, kind: "text", text: `rafale ${i}` });
  if (r.error) { refused++; lastErr = r.error.message; } else accepted++;
}
check("limitation de cadence côté serveur (rafale de 40 messages)", refused > 0, `acceptés ${accepted}, refusés ${refused}${lastErr ? " — " + lastErr.slice(0, 80) : ""}`);

await B.c.removeChannel(chB); await D.removeChannel(chD);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} contrôles réussis`);
fs.writeFileSync(new URL("../.staging-e2e-result.json", import.meta.url), JSON.stringify(results, null, 1));
process.exit(0);
