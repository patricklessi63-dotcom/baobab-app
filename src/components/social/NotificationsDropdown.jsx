import React from "react";
import { Bell } from "lucide-react";
import { navy, coralText, goldText, leaf, bg, muted } from "./theme";
import Avatar from "../Avatar";
import RelativeTime from "../RelativeTime";
import { NOTIFICATION_LABELS, NOTIF_CATEGORIES, groupNotificationRows, formatNotifAge, notificationCategory, postNotificationRow } from "../../lib/notificationLabels";

// Dropdown de la cloche du header de SocialShell.jsx (liste des notifications
// récentes groupées par catégorie). À ne pas confondre avec
// `NotificationsPanel` de FeedTab.jsx, qui est un widget différent affiché
// dans le fil d'accueil.
//
// Extrait de SocialShell.jsx : toutes les valeurs ci-dessous sont calculées dans
// SocialShell (état, listes filtrées, callbacks) et reçues en props.
//
// Présentation (cahier des charges notifications) : chaque ligne montre la photo
// de profil de la personne à l'origine de la notification (repli sur une pastille
// à émoji quand il n'y a pas d'auteur : Premium, rappels...), un libellé, l'âge,
// et un repère visuel lu / non lu (point d'accent + texte renforcé pour une non lue,
// texte atténué pour une lue). Les notifications DÉJÀ LUES récentes (prop
// `readHistory`, chargée par SocialShell à l'ouverture du menu) sont listées en
// dessous, sous « Déjà lues », pour qu'une notification ne disparaisse plus dès
// qu'on l'a ouverte ; les cliquer ouvre la même destination.
export default function NotificationsDropdown({
  unreadCommunityCount,
  markCommunityNotificationsRead,
  notifCategory,
  setNotifCategory,
  notifPillRefs,
  incomingFavoritesCount,
  visibleCommunityNotifications,
  onNotifTouchStart,
  onNotifTouchEnd,
  unreadDatingNotifications,
  unreadMessageNotifications,
  unreadFollowNotifications,
  unreadCommunityNotifications,
  unreadEventNotifications,
  unreadPostNotifications,
  markOneNotificationRead,
  setViewedProfileId,
  openChatWithProfileId,
  setOpenCommunityId,
  setOpenEventId,
  goTab,
  notifHasMore,
  // Malgré son nom, appelle désormais handleLoadMoreNotifications côté
  // SocialShell (garde anti-double-clic + jeton de requête), pas
  // directement le setState — voir le commentaire sur notifLoadingMoreRef
  // dans SocialShell.jsx pour le bug corrigé (double-clic sur "Charger
  // plus" pouvait faire disparaître des notifications déjà affichées).
  setNotifLimit,
  notifLoadingMore = false,
  setNotificationsOpen,
  readHistory = [],
}) {
  // Une seule fabrique de ligne pour les non lues et les déjà lues (même libellé, même
  // destination au clic). Pour une déjà lue, on ne remarque rien en base (`mark` sans effet).
  const buildRow = (n, category, { read = false } = {}) => {
    const mark = read ? () => {} : markOneNotificationRead;
    const base = { n, category, isRead: read || Boolean(n.read_at) };
    switch (category) {
      case "dating":
        return {
          ...base, icon: n.type === "new_match" ? "💞" : "❤️",
          label: n.actor?.name ? `${n.actor.name} — ${n.type === "new_match" ? NOTIFICATION_LABELS.new_match : NOTIFICATION_LABELS.new_like}` : (NOTIFICATION_LABELS[n.type] || "Nouvelle activité"),
          onClick: () => { mark(n.id); setViewedProfileId(n.target_id); },
        };
      case "messages":
        return {
          ...base, icon: "💬",
          label: n.actor?.name ? `Nouveau message de ${n.actor.name}` : NOTIFICATION_LABELS.new_message,
          onClick: () => { mark(n.id); openChatWithProfileId(n.target_id); },
        };
      case "follows":
        return {
          ...base, icon: "👤",
          label: n.actor?.name ? `${n.actor.name} a commencé à te suivre` : NOTIFICATION_LABELS.new_follower,
          onClick: () => { mark(n.id); setViewedProfileId(n.target_id); },
        };
      case "events":
        // target_id porte l'id de l'événement : on rouvre l'événement concerné, pas la liste.
        return {
          ...base, icon: "🎉",
          label: NOTIFICATION_LABELS[n.type] || "Nouvelle activité",
          onClick: () => { mark(n.id); if (n.target_id) setOpenEventId(n.target_id); goTab("events"); },
        };
      case "posts":
        // Publications du fil général : pas de vue « publication unique », retour au Fil.
        return {
          ...base, ...postNotificationRow(n),
          onClick: () => { mark(n.id); goTab("feed"); },
        };
      default:
        // Communautés et abonnement Premium. community_id sert à rouvrir la bonne communauté.
        return {
          ...base, category: "communities", icon: n.type?.startsWith("premium_") ? "💎" : "🌍",
          label: NOTIFICATION_LABELS[n.type] || "Nouvelle activité",
          onClick: () => {
            mark(n.id);
            if (n.type?.startsWith("premium_")) { goTab("premium"); return; }
            if (n.community_id) setOpenCommunityId(n.community_id);
            goTab("communities");
          },
        };
    }
  };

  // Bug corrigé à l'audit : l'état vide n'était calculé qu'à partir de la liste GLOBALE ;
  // une catégorie sans notification laissait un espace blanc sans message. On calcule donc
  // aussi l'état vide par catégorie.
  const showFavorites = incomingFavoritesCount > 0 && (notifCategory === "all" || notifCategory === "dating");
  const filteredRows = groupNotificationRows([
    ...unreadDatingNotifications.map((n) => buildRow(n, "dating")),
    ...unreadMessageNotifications.map((n) => buildRow(n, "messages")),
    ...unreadFollowNotifications.map((n) => buildRow(n, "follows")),
    ...unreadCommunityNotifications.map((n) => buildRow(n, "communities")),
    ...unreadEventNotifications.map((n) => buildRow(n, "events")),
    ...unreadPostNotifications.map((n) => buildRow(n, "posts")),
  ]).filter((row) => notifCategory === "all" || row.category === notifCategory);
  const categoryEmpty = !showFavorites && filteredRows.length === 0;

  // Historique : déjà lues, ordre chronologique inverse, filtrées par la catégorie choisie.
  const unreadIds = new Set(filteredRows.flatMap((r) => r.groupIds || [r.n.id]));
  const readRows = readHistory
    .filter((n) => !unreadIds.has(n.id))
    .map((n) => buildRow(n, notificationCategory(n), { read: true }))
    .filter((row) => notifCategory === "all" || row.category === notifCategory);
  const nothingAtAll = incomingFavoritesCount === 0 && visibleCommunityNotifications.length === 0 && readRows.length === 0;

  const renderRow = (row, { dim = false } = {}) => {
    const unread = !row.isRead;
    const actor = row.n.actor;
    return (
      <button
        key={row.n.id}
        onClick={() => { setNotificationsOpen(false); if (row.groupIds) row.groupIds.forEach(markOneNotificationRead); row.onClick(); }}
        className="flex items-center gap-3 text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2"
        style={{ opacity: dim ? 0.72 : 1, background: unread ? "rgba(var(--bb-accent-rgb), .07)" : undefined }}
      >
        <span className="relative flex-shrink-0" style={{ width: 36, height: 36 }}>
          {actor ? (
            <Avatar name={actor.name} url={actor.avatar_url} size={36} />
          ) : (
            <span aria-hidden="true" className="flex items-center justify-center rounded-full" style={{ width: 36, height: 36, background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", fontSize: 18 }}>{row.icon}</span>
          )}
          {actor && (
            <span aria-hidden="true" className="absolute flex items-center justify-center rounded-full" style={{ right: -3, bottom: -3, width: 17, height: 17, fontSize: 10, background: "var(--bb-surface)", border: "1px solid var(--bb-border)" }}>{row.icon}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${unread ? "font-semibold" : ""}`} style={{ color: unread ? "var(--bb-text)" : "var(--bb-muted)" }}>{row.label}</span>
          {row.n.created_at && <span className="block text-[11px]" style={{ color: "var(--bb-text-faint)" }}><RelativeTime value={row.n.created_at} format={formatNotifAge} /></span>}
        </span>
        {unread && (
          <>
            <span aria-hidden="true" className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: "var(--bb-accent)", boxShadow: "0 0 8px rgba(var(--bb-accent-rgb), .6)" }} />
            <span className="sr-only">non lue</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="absolute right-12 top-14 w-96 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-3 z-50">
      <div className="flex items-center justify-between px-2 pb-2">
        <b>Notifications</b>
        {unreadCommunityCount > 0 && (
          <button onClick={markCommunityNotificationsRead} className="bb-hit text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ color: coralText }}>
            Tout marquer comme lu
          </button>
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden pb-2 px-2 -mx-2" style={{ scrollbarWidth: "none" }}>
        {NOTIF_CATEGORIES.map(([key, label]) => (
          <button key={key} ref={(el) => { notifPillRefs.current[key] = el; }} onClick={() => setNotifCategory(key)} aria-pressed={notifCategory === key} className="bb-hit shrink-0 px-3 py-1.5 rounded-full text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ background: notifCategory === key ? navy : bg, color: notifCategory === key ? "#fff" : muted }}>
            {label}
          </button>
        ))}
      </div>
      {nothingAtAll ? (
        <div className="p-6 text-center" onTouchStart={onNotifTouchStart} onTouchEnd={onNotifTouchEnd}>
          <Bell size={22} className="mx-auto mb-2" color={muted} />
          <p className="text-xs" style={{ color: muted }}>Aucune notification pour l'instant.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto" onTouchStart={onNotifTouchStart} onTouchEnd={onNotifTouchEnd}>
          {showFavorites && (
            <div className="px-2 py-2.5 rounded-xl text-sm" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: goldText }}>
              ⭐ {incomingFavoritesCount} personne{incomingFavoritesCount > 1 ? "s" : ""} t'a ajouté en favori.
            </div>
          )}
          {categoryEmpty && (
            <div className="p-4 text-center">
              <Bell size={22} className="mx-auto mb-2" color={muted} />
              <p className="text-xs" style={{ color: muted }}>
                {incomingFavoritesCount === 0 && visibleCommunityNotifications.length === 0 ? "Tu es à jour." : "Aucune notification dans cette catégorie."}
              </p>
            </div>
          )}
          {filteredRows.map((row) => renderRow(row))}
          {notifHasMore && (
            <button
              onClick={() => setNotifLimit()}
              disabled={notifLoadingMore}
              className="bb-hit text-center py-2 text-xs font-bold rounded-xl hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
              style={{ color: leaf }}
            >
              {notifLoadingMore ? "Chargement..." : "Charger plus"}
            </button>
          )}
          {readRows.length > 0 && (
            <>
              <p className="bb-eyebrow px-2 pt-2" style={{ fontSize: "0.65rem" }}>Déjà lues</p>
              {readRows.map((row) => renderRow(row, { dim: true }))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
