import React, { useEffect, useState } from "react";
import { ArrowLeft, Shield, Users2, Flag, Search, Ban, PauseCircle, PlayCircle, ShieldCheck } from "lucide-react";
import Avatar from "../Avatar";
import EmptyState from "../home/EmptyState";
import Skeleton, { SkeletonCard } from "../Skeleton";
import * as adminApi from "../../lib/adminApi";
import { primary, coral, green, gold, muted, bg, card, primaryRgb, navy } from "../social/theme";

const SUB_TABS = [["dashboard", "Tableau de bord"], ["users", "Utilisateurs"], ["reports", "Signalements"]];
const SUSPEND_DURATIONS = [
  { label: "24 heures", ms: 24 * 60 * 60 * 1000 },
  { label: "7 jours", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "30 jours", ms: 30 * 24 * 60 * 60 * 1000 },
];
const REPORT_SOURCE_LABEL = { community: "Communauté", event: "Événement", post: "Fil général", info: "Baobab Info", profile: "Profil (rencontre/messagerie)" };

export default function AdminDashboard({ onBack, onError, myPlatformRole }) {
  const [subTab, setSubTab] = useState("dashboard");
  const isAdmin = myPlatformRole === "admin" || myPlatformRole === "super_admin";

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState(null); // { user, mode: 'suspend' | 'ban' }
  const [actionReason, setActionReason] = useState("");
  const [actionDuration, setActionDuration] = useState(SUSPEND_DURATIONS[1].ms);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      setStats(await adminApi.fetchDashboardStats());
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les statistiques.");
    } finally {
      setStatsLoading(false);
    }
  };

  const loadUsers = async (q = query) => {
    setUsersLoading(true);
    try {
      setUsers(await adminApi.searchUsers(q));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les utilisateurs.");
    } finally {
      setUsersLoading(false);
    }
  };

  const loadReports = async () => {
    setReportsLoading(true);
    try {
      setReports(await adminApi.listReports("open"));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les signalements.");
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === "dashboard") loadStats();
    if (subTab === "users") loadUsers();
    if (subTab === "reports") loadReports();
  }, [subTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSearch = (e) => {
    e.preventDefault();
    loadUsers(query);
  };

  const openAction = (user, mode) => {
    setActionTarget({ user, mode });
    setActionReason("");
    setActionDuration(SUSPEND_DURATIONS[1].ms);
  };

  const confirmAction = async () => {
    if (!actionTarget) return;
    try {
      if (actionTarget.mode === "suspend") {
        await adminApi.suspendUser(actionTarget.user.id, new Date(Date.now() + actionDuration).toISOString(), actionReason.trim() || null);
      } else {
        await adminApi.banUser(actionTarget.user.id, actionReason.trim() || null);
      }
      setActionTarget(null);
      loadUsers();
    } catch (e) {
      console.error(e);
      onError(e.message?.includes("agir sur ce compte") ? "Impossible d'agir sur ce compte (rôle égal ou supérieur au tien)." : "Action impossible.");
    }
  };

  const handleUnsuspend = async (user) => {
    try {
      await adminApi.unsuspendUser(user.id);
      loadUsers();
    } catch (e) {
      console.error(e);
      onError("Impossible de lever la suspension.");
    }
  };

  const handleUnban = async (user) => {
    try {
      await adminApi.unbanUser(user.id);
      loadUsers();
    } catch (e) {
      console.error(e);
      onError("Impossible de lever le bannissement.");
    }
  };

  const handleResolve = async (r, dismiss) => {
    try {
      await adminApi.resolveReport(r.source, r.id, dismiss);
      setReports((rs) => rs.filter((x) => !(x.source === r.source && x.id === r.id)));
    } catch (e) {
      console.error(e);
      onError("Impossible de traiter ce signalement.");
    }
  };

  return (
    <section className="max-w-4xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-bold mb-4" style={{ color: primary }}>
        <ArrowLeft size={16} /> Retour
      </button>

      <div className="mb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "#EEF0FF", color: navy }}>
          <Shield size={13} /> Baobab Admin
        </div>
        <h1 className="text-2xl font-black mt-2" style={{ color: primary }}>Administration</h1>
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto">
        {SUB_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setSubTab(key)} className="px-4 py-2 rounded-full text-xs font-bold flex-shrink-0"
            style={{ background: subTab === key ? navy : bg, color: subTab === key ? "#fff" : muted }}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "dashboard" && (
        statsLoading ? <SkeletonCard /> : stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              ["Utilisateurs", stats.total_users, Users2, primary],
              ["Suspendus", stats.suspended_users, PauseCircle, gold],
              ["Bannis", stats.banned_users, Ban, coral],
              ["Signalements ouverts", stats.open_reports, Flag, coral],
              ["Info à valider", stats.pending_info_review, ShieldCheck, green],
            ].map(([label, value, Icon, color]) => (
              <div key={label} className={`${card} p-4`}>
                <Icon size={16} color={color} />
                <div className="text-2xl font-black mt-2" style={{ color: primary }}>{value ?? 0}</div>
                <div className="text-xs mt-0.5" style={{ color: muted }}>{label}</div>
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "users" && (
        <div>
          <form onSubmit={submitSearch} className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-4" style={{ background: bg }}>
            <Search size={16} color={muted} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un nom..." aria-label="Rechercher un utilisateur" className="flex-1 bg-transparent text-sm outline-none" />
          </form>

          {usersLoading ? <Skeleton rows={5} height={56} /> : users.length === 0 ? (
            <EmptyState icon={Users2} title="Aucun utilisateur trouvé." />
          ) : (
            <div className="flex flex-col gap-2">
              {users.map((u) => {
                const isBanned = Boolean(u.banned_at);
                const isSuspended = u.suspended_until && new Date(u.suspended_until) > new Date();
                return (
                  <div key={u.id} className={`${card} p-3.5 flex flex-col sm:flex-row sm:items-center gap-3`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={u.name} url={u.avatar_url} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate flex items-center gap-1.5">
                          {u.name}
                          {u.role && <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full" style={{ background: "#EEF0FF", color: navy }}>{u.role}</span>}
                        </div>
                        <div className="text-xs" style={{ color: muted }}>
                          {isBanned ? "Banni" : isSuspended ? `Suspendu jusqu'au ${new Date(u.suspended_until).toLocaleDateString("fr-CA")}` : "Actif"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 sm:ml-auto">
                      {isBanned ? (
                        isAdmin && <button onClick={() => handleUnban(u)} className="text-xs font-bold px-3 py-2 rounded-full" style={{ background: bg, color: primary }}>Débannir</button>
                      ) : isSuspended ? (
                        <button onClick={() => handleUnsuspend(u)} className="text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" style={{ background: bg, color: primary }}><PlayCircle size={12} /> Réactiver</button>
                      ) : (
                        <>
                          <button onClick={() => openAction(u, "suspend")} className="text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" style={{ background: bg, color: gold }}><PauseCircle size={12} /> Suspendre</button>
                          {isAdmin && <button onClick={() => openAction(u, "ban")} className="text-xs font-bold px-3 py-2 rounded-full flex items-center gap-1" style={{ background: "#FDEAE7", color: coral }}><Ban size={12} /> Bannir</button>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === "reports" && (
        reportsLoading ? <Skeleton rows={4} height={80} /> : reports.length === 0 ? (
          <EmptyState icon={Flag} title="Aucun signalement ouvert." />
        ) : (
          <div className="flex flex-col gap-2">
            {reports.map((r) => (
              <div key={`${r.source}-${r.id}`} className={`${card} p-4`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: bg, color: primary }}>{REPORT_SOURCE_LABEL[r.source] || r.source}</span>
                  <span className="text-[11px]" style={{ color: muted }}>{new Date(r.created_at).toLocaleDateString("fr-CA")}</span>
                </div>
                <div className="text-sm font-bold" style={{ color: primary }}>{r.category}</div>
                {r.reason && <p className="text-xs mt-1" style={{ color: muted }}>{r.reason}</p>}
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => handleResolve(r, false)} className="text-xs font-bold px-3 py-2 rounded-full text-white" style={{ background: green }}>Résolu</button>
                  <button onClick={() => handleResolve(r, true)} className="text-xs font-bold px-3 py-2 rounded-full" style={{ background: bg, color: muted }}>Ignorer</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {actionTarget && (
        <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[80] p-0 md:p-5" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }} onClick={() => setActionTarget(null)} role="dialog" aria-modal="true">
          <div className={`${card} w-full max-w-sm p-6 rounded-t-[28px] md:rounded-[28px]`} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-black" style={{ color: primary }}>
              {actionTarget.mode === "suspend" ? "Suspendre" : "Bannir"} {actionTarget.user.name}
            </h2>
            {actionTarget.mode === "suspend" && (
              <div className="flex gap-2 mt-4">
                {SUSPEND_DURATIONS.map((d) => (
                  <button key={d.label} onClick={() => setActionDuration(d.ms)} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: actionDuration === d.ms ? navy : bg, color: actionDuration === d.ms ? "#fff" : primary }}>
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            <textarea value={actionReason} onChange={(e) => setActionReason(e.target.value)} placeholder="Motif (visible par la personne concernée)" rows={3} className="w-full mt-4 rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none" style={{ background: bg }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setActionTarget(null)} className="flex-1 py-3 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>Annuler</button>
              <button onClick={confirmAction} className="flex-1 py-3 rounded-full text-sm font-bold text-white" style={{ background: coral }}>Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
