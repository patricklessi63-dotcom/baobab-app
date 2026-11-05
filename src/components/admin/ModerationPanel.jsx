import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldAlert, Gavel, MessageSquareWarning, Image as ImageIcon, SlidersHorizontal, Search } from "lucide-react";
import EmptyState from "../home/EmptyState";
import Skeleton from "../Skeleton";
import * as modApi from "../../lib/moderationApi";
import { primary, coralText, green, muted, bg, card, navy } from "../social/theme";

// Écran des modérateurs (SQL-31, supabase-moderation-text.sql) : textes à relire, sanctions, appels,
// images signalées, et — pour les administrateurs — liste de termes et réglages. Toute la protection
// est côté base : chaque action y vérifie le rôle de l'appelant. Ici, rien n'est décidé seul.

const SECTIONS = [
  ["flags", "À relire", MessageSquareWarning],
  ["sanctions", "Sanctions", Gavel],
  ["appeals", "Appels", ShieldAlert],
  ["media", "Images", ImageIcon],
  ["settings", "Réglages", SlidersHorizontal],
];
const SOURCE_LABEL = { message: "Message privé", post: "Publication", comment: "Commentaire", community_post: "Publication de communauté", bio: "Biographie", status: "Statut" };
const KIND_LABEL = { warning: "Avertissement", suspension: "Suspension", ban: "Bannissement" };
const MEDIA_LABEL = { story: "Statut", post_media: "Publication", community_post: "Communauté", profile_photo: "Photo de profil", avatar: "Avatar", event_media: "Événement", message_media: "Message" };
const CATEGORIES = [["insulte", "Insulte"], ["racisme", "Racisme"], ["homophobie", "Homophobie"], ["menace", "Menace"], ["harcelement", "Harcèlement"]];

const fmt = (d) => (d ? new Date(d).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "short" }) : "");
const btn = "text-xs font-bold px-3 py-2 rounded-full";

export default function ModerationPanel({ onError, isAdmin = false }) {
  const [section, setSection] = useState("flags");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [missing, setMissing] = useState(false);
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [terms, setTerms] = useState([]);
  const [newTerm, setNewTerm] = useState({ term: "", category: "insulte", severity: "block" });
  const [previews, setPreviews] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setMissing(false);
    try {
      if (section === "flags") setRows(await modApi.listViolations("flagged"));
      else if (section === "sanctions") setRows(await modApi.listSanctions(false));
      else if (section === "appeals") setRows(await modApi.listSanctions(true));
      else if (section === "media") setRows(await modApi.listMediaQueue());
      else if (section === "settings") { setSettings(await modApi.fetchSettings()); setTerms(isAdmin ? await modApi.fetchTerms() : []); }
    } catch (e) {
      if (modApi.isModerationMissing(e)) setMissing(true);
      else onError?.("Impossible de charger la modération.");
    } finally {
      setLoading(false);
    }
  }, [section, isAdmin, onError]);
  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, okAfter = true) => {
    if (busyId) return;
    setBusyId(id);
    try { await fn(); setReason(""); if (okAfter) await load(); } // le motif ne sert qu'à UNE décision
    catch (e) { onError?.(modApi.isModerationMissing(e) ? "Modération non installée sur le serveur." : "Action impossible. Réessaie."); }
    finally { setBusyId(null); }
  };

  const showPreview = async (r) => {
    const key = `${r.target_kind}:${r.target_id}`;
    let info = { url: null };
    try { info = (await modApi.mediaInfo(r.target_kind, r.target_id)) || info; } catch { /* aperçu indisponible */ }
    setPreviews((p) => ({ ...p, [key]: info }));
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }, [rows, query]);

  const saveSetting = (patch) => act("settings", () => modApi.updateSettings(patch));
  const addTerm = () => {
    if (newTerm.term.trim().length < 2) return;
    act("term", async () => { await modApi.upsertTerm(newTerm.term.trim(), newTerm.category, newTerm.severity); setNewTerm({ ...newTerm, term: "" }); });
  };

  return (
    <div>
      <div className="flex gap-1.5 mb-3 overflow-x-auto" role="tablist" aria-label="Sections de la modération">
        {SECTIONS.map(([key, label, Icon]) => (
          <button key={key} role="tab" aria-selected={section === key} onClick={() => { setSection(key); setQuery(""); }}
            className="px-3 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 flex-shrink-0"
            style={{ background: section === key ? navy : bg, color: section === key ? "#fff" : muted }}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {missing && (
        <EmptyState icon={ShieldAlert} title="La modération n'est pas encore installée sur le serveur." subtitle="Exécutez supabase-moderation-text.sql (SQL-31) : voir MODERATION.md." />
      )}

      {!missing && section !== "settings" && (
        <div className="flex flex-col gap-2 mb-3">
          <label className="relative block">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" color={muted} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher (nom, terme, motif…)" aria-label="Rechercher dans la liste"
              className="bb-input w-full" style={{ paddingLeft: 32 }} />
          </label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Motif de la décision (facultatif, conservé dans le journal)" aria-label="Motif de la décision" className="bb-input w-full" />
        </div>
      )}

      {!missing && loading && <Skeleton rows={3} height={80} />}

      {!missing && !loading && section === "flags" && (
        filtered.length === 0 ? <EmptyState icon={MessageSquareWarning} title="Aucun texte à relire." /> : (
          <div className="flex flex-col gap-2">
            {filtered.map((r) => (
              <div key={r.id} className={`${card} p-4`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: bg, color: primary }}>{SOURCE_LABEL[r.source] || r.source}</span>
                  <span className="text-[11px]" style={{ color: muted }}>{fmt(r.created_at)}</span>
                </div>
                <div className="text-sm font-bold" style={{ color: primary }}>{r.profile_name} — « {r.term} » ({r.category})</div>
                <p className="text-xs mt-1 break-words" style={{ color: muted }}>{r.excerpt}</p>
                <div className="flex items-center gap-2 mt-3">
                  <button disabled={busyId === r.id} onClick={() => act(r.id, () => modApi.resolveFlag(r.id, false, reason || null))} className={btn} style={{ background: green, color: "#fff" }}>Approuver le texte</button>
                  <button disabled={busyId === r.id} onClick={() => act(r.id, () => modApi.resolveFlag(r.id, true, reason || null))} className={btn} style={{ background: bg, color: coralText }}>Confirmer l'infraction</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!missing && !loading && (section === "sanctions" || section === "appeals") && (
        filtered.length === 0 ? <EmptyState icon={Gavel} title={section === "appeals" ? "Aucun appel en attente." : "Aucune sanction."} /> : (
          <div className="flex flex-col gap-2">
            {filtered.map((s) => (
              <div key={s.id} className={`${card} p-4`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: bg, color: s.revoked_at ? muted : coralText }}>
                    {KIND_LABEL[s.kind] || s.kind}{s.revoked_at ? " — annulée" : ""}
                  </span>
                  <span className="text-[11px]" style={{ color: muted }}>{fmt(s.created_at)}</span>
                </div>
                <div className="text-sm font-bold" style={{ color: primary }}>{s.profile_name}{s.until_at ? ` — jusqu'au ${fmt(s.until_at)}` : ""}</div>
                <p className="text-xs mt-1" style={{ color: muted }}>{s.reason}{s.automatic ? " (automatique)" : ""}</p>
                {s.appeal_text && <p className="text-xs mt-2 p-2 rounded-xl break-words" style={{ background: bg, color: primary }}>Contestation : {s.appeal_text}</p>}
                <div className="flex items-center gap-2 mt-3">
                  {s.appeal_status === "pending" && (
                    <>
                      <button disabled={busyId === s.id} onClick={() => act(s.id, () => modApi.decideAppeal(s.id, true, reason || null))} className={btn} style={{ background: green, color: "#fff" }}>Accepter l'appel</button>
                      <button disabled={busyId === s.id} onClick={() => act(s.id, () => modApi.decideAppeal(s.id, false, reason || null))} className={btn} style={{ background: bg, color: muted }}>Refuser</button>
                    </>
                  )}
                  {!s.revoked_at && s.appeal_status !== "pending" && (
                    <button disabled={busyId === s.id} onClick={() => act(s.id, () => modApi.revokeSanction(s.id, reason || null))} className={btn} style={{ background: bg, color: primary }}>Annuler la sanction</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!missing && !loading && section === "media" && (
        filtered.length === 0 ? <EmptyState icon={ImageIcon} title="Aucune image masquée ni suspecte." /> : (
          <div className="flex flex-col gap-2">
            {filtered.map((m) => {
              const key = `${m.target_kind}:${m.target_id}`;
              const info = previews[key];
              return (
                <div key={key} className={`${card} p-4`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: bg, color: primary }}>{MEDIA_LABEL[m.target_kind] || m.target_kind}</span>
                    <span className="text-[11px]" style={{ color: muted }}>{m.report_count} signalement{m.report_count > 1 ? "s" : ""}</span>
                  </div>
                  <div className="text-sm font-bold" style={{ color: primary }}>
                    {m.status === "hidden" ? "Masquée en attendant" : m.status === "removed" ? "Retirée" : "Visible"}
                    {m.suspicious ? " — signalements suspects (comptes très récents)" : ""}
                  </div>
                  <p className="text-xs mt-1" style={{ color: muted }}>Motifs : {m.reasons || "—"}</p>
                  {info === undefined ? (
                    <button onClick={() => showPreview(m)} className={`${btn} mt-2`} style={{ background: bg, color: primary }}>Voir l'image</button>
                  ) : info.url ? (
                    <div className="mt-2">
                      <img src={info.url} alt="Image signalée" className="rounded-xl max-h-64 object-contain" />
                      <p className="text-[11px] mt-1" style={{ color: muted }}>Auteur : {info.owner_name} — {fmt(info.created_at)}</p>
                    </div>
                  ) : (
                    <p className="text-[11px] mt-2" style={{ color: muted }}>Aperçu indisponible (contenu privé ou supprimé).</p>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button disabled={busyId === key} onClick={() => act(key, () => modApi.moderateMedia(m.target_kind, m.target_id, "restore", reason || null))} className={btn} style={{ background: green, color: "#fff" }}>Rétablir</button>
                    <button disabled={busyId === key} onClick={() => act(key, () => modApi.moderateMedia(m.target_kind, m.target_id, "hide", reason || null))} className={btn} style={{ background: bg, color: primary }}>Masquer</button>
                    <button disabled={busyId === key} onClick={() => act(key, () => modApi.moderateMedia(m.target_kind, m.target_id, "remove", reason || null))} className={btn} style={{ background: bg, color: coralText }}>Retirer</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {!missing && !loading && section === "settings" && settings && (
        <div className="flex flex-col gap-3">
          <div className={`${card} p-4`}>
            <div className="text-sm font-bold mb-2" style={{ color: primary }}>Réglages</div>
            {!isAdmin && <p className="text-xs mb-2" style={{ color: muted }}>Lecture seule : seuls les administrateurs modifient les réglages.</p>}
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={settings.text_filter_enabled} disabled={!isAdmin} onChange={(e) => saveSetting({ text_filter_enabled: e.target.checked })} />
              Filtre de texte actif (interrupteur général)
            </label>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input type="checkbox" checked={settings.auto_ban_enabled} disabled={!isAdmin} onChange={(e) => saveSetting({ auto_ban_enabled: e.target.checked })} />
              Bannissement automatique à la {settings.suspensions_before_ban ?? 3}e suspension (sinon suspension de 30 jours à confirmer)
            </label>
            <p className="text-xs" style={{ color: muted }}>
              Échelle : {settings.warnings_before_suspension ?? 4} avertissements, puis suspension de {settings.suspension_hours ?? 24} h, et on continue de compter · Fenêtre de décompte : {settings.window_days} jours · Masquage d'une image à {settings.media_report_threshold} signalements · {settings.media_reports_per_hour} signalements par heure et par personne.
            </p>
          </div>
          {isAdmin && (
            <div className={`${card} p-4`}>
              <div className="text-sm font-bold mb-2" style={{ color: primary }}>Termes interdits ({terms.length})</div>
              <div className="flex flex-wrap gap-2 mb-3">
                <input value={newTerm.term} onChange={(e) => setNewTerm({ ...newTerm, term: e.target.value })} placeholder="Nouveau terme" aria-label="Nouveau terme" className="bb-input flex-1 min-w-[140px]" />
                <select value={newTerm.category} onChange={(e) => setNewTerm({ ...newTerm, category: e.target.value })} aria-label="Catégorie" className="bb-input">
                  {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select value={newTerm.severity} onChange={(e) => setNewTerm({ ...newTerm, severity: e.target.value })} aria-label="Gravité" className="bb-input">
                  <option value="block">Refuser</option>
                  <option value="review">Relire</option>
                </select>
                <button onClick={addTerm} disabled={busyId === "term"} className={btn} style={{ background: navy, color: "#fff" }}>Ajouter</button>
              </div>
              <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                {terms.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs py-1" style={{ opacity: t.active ? 1 : 0.5 }}>
                    <span style={{ color: primary }}>{t.term} <span style={{ color: muted }}>— {t.category}, {t.severity === "block" ? "refus" : "relecture"}</span></span>
                    <span className="flex gap-2 flex-shrink-0">
                      <button onClick={() => act(`t${t.id}`, () => modApi.upsertTerm(t.term, t.category, t.severity, !t.active))} className="font-bold" style={{ color: muted }}>{t.active ? "Désactiver" : "Activer"}</button>
                      <button onClick={() => act(`t${t.id}`, () => modApi.deleteTerm(t.id))} className="font-bold" style={{ color: coralText }}>Retirer</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
