import React from "react";
import { MessageCircle, Heart } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import EmptyState from "../home/EmptyState";
import ConversationPane from "./ConversationPane";
import { matchKey, formatMessageTime, messagePreviewLabel } from "../../utils/format";
import { primary, green, coral, bg, muted, card, buttonBase, online, offline, body, primaryRgb } from "./theme";

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
  onUnmatch,
  replyingTo,
  setReplyingTo,
  reactionsByMessageId,
  toggleReaction,
  deleteMessageForMe,
  deleteMessageForEveryone,
}) {
  const sorted = [...matches].sort((a, b) => {
    const ka = matchKey(currentUser.id, a.id);
    const kb = matchKey(currentUser.id, b.id);
    const ta = lastByKey[ka]?.created_at ? new Date(lastByKey[ka].created_at).getTime() : 0;
    const tb = lastByKey[kb]?.created_at ? new Date(lastByKey[kb].created_at).getTime() : 0;
    return tb - ta;
  });

  if (matches.length === 0) {
    return (
      <section className="max-w-3xl mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "#EEF8F4", color: green }}><MessageCircle size={13} /> Connexions réciproques</div>
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
      <div className="p-4 shrink-0" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)` }}>
        <h1 className="text-lg font-black" style={{ color: primary }}>💬 Messages</h1>
      </div>
      <div className="overflow-y-auto flex-1">
        {sorted.map((m) => {
          const key = matchKey(currentUser.id, m.id);
          const last = lastByKey[key];
          const unread = unreadByKey[key] || 0;
          const preview = last ? (last.from_id === currentUser.id ? `Toi : ${messagePreviewLabel(last)}` : messagePreviewLabel(last)) : "Dites bonjour 👋";
          return (
            <button
              key={m.id}
              onClick={() => onSelectMatch(m)}
              aria-label={`Ouvrir la conversation avec ${m.name}${unread > 0 ? `, ${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}` : ""}`}
              className={`${buttonBase} w-full p-3.5 flex items-center gap-3 text-left focus-visible:outline focus-visible:outline-2`}
              style={{ background: activeMatch?.id === m.id ? bg : "transparent", borderBottom: `1px solid rgba(${primaryRgb},.05)` }}
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
