import React, { useRef, useState } from "react";
import { MessageCircle, Heart, Search, X, MoreVertical, UserRound, Flag, Ban } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import EmptyState from "../home/EmptyState";
import ConversationPane from "./ConversationPane";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { matchKey, formatMessageTime, messagePreviewLabel } from "../../utils/format";
import { primary, navy, green, coral, bg, muted, card, buttonBase, online, offline, body, primaryRgb } from "./theme";

export default function MessagesTab({
  matches,
  currentUser,
  activeMatch,
  onSelectMatch,
  onBack,
  goTab,
  lastByKey = {},
  unreadByKey = {},
  messages,
  hasMoreHistory,
  loadingOlder,
  onLoadOlder,
  messageDraft,
  setMessageDraft,
  broadcastTyping,
  sendMessage,
  sendStickerMessage,
  sendMediaMessage,
  retrySend,
  otherTyping,
  onOpenReport,
  onOpenBlockConfirm,
  onViewProfile,
  onUnmatch,
  replyingTo,
  setReplyingTo,
  reactionsByMessageId,
  toggleReaction,
  deleteMessageForMe,
  deleteMessageForEveryone,
}) {
  // Recherche/filtre de la liste de conversations + menu "⋮" par ligne
  // (voir profil / signaler / bloquer sans devoir ouvrir la conversation).
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "unread"
  const [openRowMenu, setOpenRowMenu] = useState(null);
  const rowMenuRef = useRef(null);
  useClickOutside(rowMenuRef, Boolean(openRowMenu), () => setOpenRowMenu(null));
  useEscapeKey(Boolean(openRowMenu), () => setOpenRowMenu(null));

  const sorted = [...matches].sort((a, b) => {
    const ka = matchKey(currentUser.id, a.id);
    const kb = matchKey(currentUser.id, b.id);
    const ta = lastByKey[ka]?.created_at ? new Date(lastByKey[ka].created_at).getTime() : 0;
    const tb = lastByKey[kb]?.created_at ? new Date(lastByKey[kb].created_at).getTime() : 0;
    return tb - ta;
  });

  const totalUnread = Object.values(unreadByKey).reduce((sum, n) => sum + n, 0);
  const normalizedQuery = query.trim().toLowerCase();
  const visible = sorted.filter((m) => {
    if (filter === "unread" && !((unreadByKey[matchKey(currentUser.id, m.id)] || 0) > 0)) return false;
    if (normalizedQuery && !m.name?.toLowerCase().includes(normalizedQuery)) return false;
    return true;
  });

  if (matches.length === 0) {
    return (
      <section className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: green }}><MessageCircle size={13} /> Connexions réciproques</div>
          <h1 className="text-3xl font-black mt-3" style={{ color: primary }}>Messages</h1>
        </div>
        <div className={`${card} p-10`}>
          <EmptyState
            icon={Heart}
            title="Tes conversations apparaîtront ici."
            subtitle="Découvre de nouvelles personnes sur Baobab."
            actionLabel="Découvrir"
            onAction={() => goTab("discover")}
          />
        </div>
      </section>
    );
  }

  const ConversationList = (
    <div className={`${card} overflow-hidden flex flex-col ${activeMatch ? "hidden md:flex" : "flex"}`} style={{ maxHeight: "calc(100vh - 180px)" }}>
      <div className="p-4 shrink-0 flex flex-col gap-3" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)` }}>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-black" style={{ color: primary }}>💬 Messages</h1>
          {totalUnread > 0 && (
            <span className="text-[11px] font-black text-white rounded-full px-2.5 py-0.5 flex-shrink-0" style={{ background: coral }}>
              {totalUnread} non lu{totalUnread > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-2xl px-4 py-2.5" style={{ background: bg }}>
          <Search size={15} color={muted} className="flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une conversation..."
            aria-label="Rechercher une conversation"
            className="flex-1 bg-transparent text-sm outline-none min-w-0"
          />
          {query && <button onClick={() => setQuery("")} aria-label="Effacer la recherche"><X size={14} color={muted} /></button>}
        </div>
        <div className="flex gap-2">
          {[
            { key: "all", label: "Tous" },
            { key: "unread", label: totalUnread > 0 ? `Non lus (${totalUnread})` : "Non lus" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`${buttonBase} text-xs font-bold px-3.5 py-1.5 rounded-full`}
              style={filter === f.key ? { background: navy, color: "#fff" } : { background: bg, color: muted }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        {visible.length === 0 && (
          <div className="p-8 text-center text-sm" style={{ color: muted }}>
            {normalizedQuery || filter === "unread" ? "Aucune conversation ne correspond." : "Aucune conversation."}
          </div>
        )}
        {visible.map((m) => {
          const key = matchKey(currentUser.id, m.id);
          const last = lastByKey[key];
          const unread = unreadByKey[key] || 0;
          const preview = last ? (last.from_id === currentUser.id ? `Toi : ${messagePreviewLabel(last)}` : messagePreviewLabel(last)) : "Dites bonjour 👋";
          const isMenuOpen = openRowMenu === m.id;
          return (
            <div key={m.id} className="relative group" style={{ borderBottom: `1px solid rgba(${primaryRgb},.05)` }}>
              <button
                onClick={() => onSelectMatch(m)}
                aria-label={`Ouvrir la conversation avec ${m.name}${unread > 0 ? `, ${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : ""}`}
                className={`${buttonBase} w-full p-3.5 pr-11 flex items-center gap-3 text-left focus-visible:outline focus-visible:outline-2`}
                style={{ background: activeMatch?.id === m.id ? bg : "transparent" }}
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={m.name} url={m.avatar_url} size={50} />
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white" style={{ background: m.is_online ? online : offline }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold truncate flex items-center gap-1.5">{m.name}<StatusBadge emailVerified={m.email_verified} phoneVerified={m.phone_verified} isFounder={m.is_founder} isPremium={m.is_premium} size={12} /></span>
                    {last && <span className="text-[10px] shrink-0" style={{ color: muted }}>{formatMessageTime(last.created_at)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs truncate" style={{ color: unread > 0 ? body : muted, fontWeight: unread > 0 ? 700 : 400 }}>{preview}</span>
                    {unread > 0 && (
                      <span className="text-[10px] font-black text-white rounded-full h-5 min-w-5 px-1.5 flex items-center justify-center shrink-0" style={{ background: coral }}>
                        {unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <div ref={isMenuOpen ? rowMenuRef : null} className="relative" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenRowMenu(isMenuOpen ? null : m.id); }}
                  aria-label={`Plus d'options pour ${m.name}`}
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  className={`flex items-center justify-center rounded-full motion-safe:transition-opacity focus-visible:opacity-100 ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  style={{ width: 32, height: 32 }}
                >
                  <MoreVertical size={16} color={muted} />
                </button>
                {isMenuOpen && (
                  <div role="menu" className={`${card} overflow-hidden`} style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, minWidth: 180, zIndex: 6 }}>
                    <button role="menuitem" onClick={() => { onViewProfile?.(m); setOpenRowMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary }}>
                      <UserRound size={14} /> Voir le profil
                    </button>
                    <button role="menuitem" onClick={() => { onOpenReport?.(m); setOpenRowMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: primary, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
                      <Flag size={14} /> Signaler
                    </button>
                    <button role="menuitem" onClick={() => { onOpenBlockConfirm?.(m); setOpenRowMenu(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left" style={{ color: coral, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
                      <Ban size={14} /> Bloquer
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const Pane = activeMatch ? (
    <div className={`${card} overflow-hidden ${activeMatch ? "flex" : "hidden md:flex"}`} style={{ height: "calc(100vh - 180px)" }}>
      <ConversationPane
        key={activeMatch.id}
        activeMatch={activeMatch}
        currentUser={currentUser}
        otherTyping={otherTyping}
        messages={messages}
        hasMoreHistory={hasMoreHistory}
        loadingOlder={loadingOlder}
        onLoadOlder={onLoadOlder}
        messageDraft={messageDraft}
        setMessageDraft={setMessageDraft}
        broadcastTyping={broadcastTyping}
        sendMessage={sendMessage}
        sendStickerMessage={sendStickerMessage}
        sendMediaMessage={sendMediaMessage}
        retrySend={retrySend}
        onBack={onBack}
        onOpenReport={onOpenReport}
        onOpenBlockConfirm={onOpenBlockConfirm}
        onViewProfile={onViewProfile}
        onUnmatch={onUnmatch}
        replyingTo={replyingTo}
        setReplyingTo={setReplyingTo}
        reactionsByMessageId={reactionsByMessageId}
        toggleReaction={toggleReaction}
        deleteMessageForMe={deleteMessageForMe}
        deleteMessageForEveryone={deleteMessageForEveryone}
      />
    </div>
  ) : (
    <div className={`${card} hidden md:flex items-center justify-center`} style={{ height: "calc(100vh - 180px)" }}>
      <p className="text-sm" style={{ color: muted }}>Sélectionne une conversation.</p>
    </div>
  );

  return (
    <section className="max-w-6xl mx-auto grid md:grid-cols-[340px_1fr] gap-4">
      {ConversationList}
      {Pane}
    </section>
  );
}
