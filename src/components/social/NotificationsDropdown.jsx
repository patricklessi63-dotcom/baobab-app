import React from "react";
import { Bell } from "lucide-react";
import { navy, coralText, gold, leaf, bg, muted } from "./theme";
import { NOTIFICATION_LABELS, NOTIF_CATEGORIES, groupNotificationRows } from "../../lib/notificationLabels";

// Dropdown de la cloche du header de SocialShell.jsx (liste des notifications
// récentes groupées par catégorie). À ne pas confondre avec
// `NotificationsPanel` de FeedTab.jsx, qui est un widget différent affiché
// dans le fil d'accueil.
//
// Extrait tel quel de SocialShell.jsx (aucun changement de comportement) :
// toutes les valeurs ci-dessous étaient déjà calculées dans SocialShell
// (état, listes filtrées, callbacks) — ce composant se contente de les
// recevoir en props et de rendre exactement le même JSX qu'avant.
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
  setNotifLimit,
  setNotificationsOpen,
}) {
  return (
    <div className="absolute right-12 top-14 w-96 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-3 z-50">
      <div className="flex items-center justify-between px-2 pb-2">
        <b>Notifications</b>
        {unreadCommunityCount > 0 && (
          <button onClick={markCommunityNotificationsRead} className="text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ color: coralText }}>
            Tout marquer comme lu
          </button>
        )}
      </div>
      <div className="flex gap-1 overflow-x-auto pb-2 px-2 -mx-2" style={{ scrollbarWidth: "none" }}>
        {NOTIF_CATEGORIES.map(([key, label]) => (
          <button key={key} ref={(el) => { notifPillRefs.current[key] = el; }} onClick={() => setNotifCategory(key)} aria-pressed={notifCategory === key} className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ background: notifCategory === key ? navy : bg, color: notifCategory === key ? "#fff" : muted }}>
            {label}
          </button>
        ))}
      </div>
      {incomingFavoritesCount === 0 && visibleCommunityNotifications.length === 0 ? (
        <div className="p-6 text-center" onTouchStart={onNotifTouchStart} onTouchEnd={onNotifTouchEnd}>
          <Bell size={22} className="mx-auto mb-2" color={muted} />
          <p className="text-xs" style={{ color: muted }}>Aucune notification pour l'instant.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto" onTouchStart={onNotifTouchStart} onTouchEnd={onNotifTouchEnd}>
          {incomingFavoritesCount > 0 && (notifCategory === "all" || notifCategory === "dating") && (
            <div className="px-2 py-2.5 rounded-xl text-sm" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: gold }}>
              ⭐ {incomingFavoritesCount} personne{incomingFavoritesCount > 1 ? "s" : ""} t'a{incomingFavoritesCount > 1 ? "" : ""} ajouté en favori.
            </div>
          )}
          {groupNotificationRows([
            ...unreadDatingNotifications.map((n) => ({
              n, category: "dating", icon: n.type === "new_match" ? "💞" : "❤️",
              label: n.actor?.name ? `${n.actor.name} — ${n.type === "new_match" ? NOTIFICATION_LABELS.new_match : NOTIFICATION_LABELS.new_like}` : (NOTIFICATION_LABELS[n.type] || "Nouvelle activité"),
              onClick: () => { markOneNotificationRead(n.id); setViewedProfileId(n.target_id); },
            })),
            ...unreadMessageNotifications.map((n) => ({
              n, category: "messages", icon: "💬",
              label: n.actor?.name ? `Nouveau message de ${n.actor.name}` : NOTIFICATION_LABELS.new_message,
              onClick: () => { markOneNotificationRead(n.id); openChatWithProfileId(n.target_id); },
            })),
            ...unreadFollowNotifications.map((n) => ({
              n, category: "follows", icon: "👤",
              label: n.actor?.name ? `${n.actor.name} a commencé à te suivre` : NOTIFICATION_LABELS.new_follower,
              onClick: () => { markOneNotificationRead(n.id); setViewedProfileId(n.target_id); },
            })),
            // Bug corrigé à l'audit : community_id est bien sélectionné dans
            // la requête "notifications" de SocialShell (utile pour "demande
            // d'adhésion", "invitation", "signalement"...) mais n'était
            // jamais réutilisé ici — le clic renvoyait toujours vers la
            // liste générale des communautés, jamais vers la communauté
            // concernée. Un admin qui recevait "Nouvelle demande
            // d'adhésion" devait donc retrouver lui-même la bonne
            // communauté dans la liste avant de pouvoir agir. Réutilise
            // exactement le même mécanisme (openCommunityId/
            // initialCommunityId) que "Mes communautés" sur le profil.
            ...unreadCommunityNotifications.map((n) => ({
              n, category: "communities", icon: n.type?.startsWith("premium_") ? "💎" : "🌍",
              label: NOTIFICATION_LABELS[n.type] || "Nouvelle activité",
              onClick: () => {
                markOneNotificationRead(n.id);
                if (n.type?.startsWith("premium_")) { goTab("premium"); return; }
                if (n.community_id) setOpenCommunityId(n.community_id);
                goTab("communities");
              },
            })),
            // Même bug, même correctif : target_id porte l'id de
            // l'événement (target_type === "event", voir le filtre de
            // unreadEventNotifications dans SocialShell) mais n'était jamais
            // transmis à EventsTab, qui rouvrait systématiquement sur la
            // liste au lieu de l'événement concerné.
            ...unreadEventNotifications.map((n) => ({
              n, category: "events", icon: "🎉",
              label: NOTIFICATION_LABELS[n.type] || "Nouvelle activité",
              onClick: () => {
                markOneNotificationRead(n.id);
                if (n.target_id) setOpenEventId(n.target_id);
                goTab("events");
              },
            })),
            // "post_liked"/"post_commented" — voir isolation de
            // unreadPostNotifications dans SocialShell. Pas de community_id
            // sur ces publications du fil général, donc simple retour
            // au Fil (aucune vue "publication unique" à cibler ici,
            // contrairement aux communautés/événements ci-dessus).
            ...unreadPostNotifications.map((n) => ({
              n, category: "posts", icon: n.type === "post_commented" ? "💬" : "❤️",
              label: n.actor?.name ? `${n.actor.name} ${n.type === "post_commented" ? "a commenté ta publication" : "a aimé ta publication"}` : (NOTIFICATION_LABELS[n.type] || "Nouvelle activité"),
              onClick: () => { markOneNotificationRead(n.id); goTab("feed"); },
            })),
          ])
            .filter((row) => notifCategory === "all" || row.category === notifCategory)
            .map((row) => (
              <button
                key={row.n.id}
                onClick={() => { setNotificationsOpen(false); if (row.groupIds) row.groupIds.forEach(markOneNotificationRead); row.onClick(); }}
                className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2"
              >
                {row.icon} {row.label}
              </button>
            ))}
          {notifHasMore && (
            <button
              onClick={() => setNotifLimit((l) => l + 20)}
              className="text-center py-2 text-xs font-bold rounded-xl hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2"
              style={{ color: leaf }}
            >
              Charger plus
            </button>
          )}
        </div>
      )}
    </div>
  );
}
