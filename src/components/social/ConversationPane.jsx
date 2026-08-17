import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MoreVertical, Flag, Ban, Check, CheckCheck, Circle, ShieldAlert, ShieldCheck, RotateCcw } from "lucide-react";
import Avatar from "../Avatar";
import VerifiedBadge from "../VerifiedBadge";
import ConversationStarters from "./ConversationStarters";
import { formatLastSeen, formatMessageTime, formatDayLabel } from "../../utils/format";
import { linkify } from "../../utils/linkify";
import { detectMoneyRequest } from "../../lib/moneyGuard";
import { checkRateLimit } from "../../lib/messageRateLimit";
import { detectKindFromMime } from "../../lib/mediaValidation";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import EmojiPicker from "./EmojiPicker";
import MessageMediaPicker from "./MessageMediaPicker";
import AudioRecorder from "./AudioRecorder";
import MessageBubbleMedia from "./MessageBubbleMedia";
import ChatDropZone from "./ChatDropZone";
import { primary, coral, bg, muted } from "./theme";

function MessageText({ text }) {
  return (
    <>
      {linkify(text).map((seg, i) =>
        seg.type === "link" ? (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="underline break-all">
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

export default function ConversationPane({
  activeMatch,
  currentUser,
  otherTyping,
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
  onBack,
  onOpenReport,
  onOpenBlockConfirm,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [recorderActive, setRecorderActive] = useState(false);
  const sendTimestampsRef = useRef([]);
  const listRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const menuRef = useRef(null);

  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));
  useEscapeKey(menuOpen, () => setMenuOpen(false));

  useLayoutEffect(() => {
    if (loadingOlder) {
      prevScrollHeightRef.current = listRef.current?.scrollHeight || 0;
    }
  }, [loadingOlder]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevScrollHeightRef.current) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    if (!messageDraft.trim()) return;
    const { allowed, remainingTimestamps } = checkRateLimit(sendTimestampsRef.current);
    if (!allowed) {
      setRateLimited(true);
      setTimeout(() => setRateLimited(false), 3000);
      return;
    }
    sendTimestampsRef.current = [...remainingTimestamps, Date.now()];
    sendMessage();
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      <div className="flex items-center gap-3 p-4 shrink-0" style={{ borderBottom: "1px solid rgba(21,27,61,.08)", position: "relative" }}>
        <button onClick={onBack} aria-label="Retour à la liste des conversations" className="flex items-center justify-center flex-shrink-0 md:hidden" style={{ width: 40, height: 44 }}>
          <ArrowLeft size={18} color={primary} />
        </button>
        <div style={{ position: "relative" }}>
          <Avatar name={activeMatch.name} url={activeMatch.avatar_url} size={38} />
          <Circle size={10} fill={activeMatch.is_online ? "#27C56D" : "#B9BEC9"} color="transparent" style={{ position: "absolute", bottom: -1, right: -1, background: "#fff", borderRadius: "50%" }} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold flex items-center gap-1.5 truncate">
            {activeMatch.name}
            <VerifiedBadge emailVerified={activeMatch.email_verified} phoneVerified={activeMatch.phone_verified} size={13} />
          </div>
          <div className="text-xs truncate" style={{ color: otherTyping ? coral : muted }}>
            {otherTyping ? "en train d'écrire…" : activeMatch.is_online ? "En ligne" : formatLastSeen(activeMatch.last_seen)}
          </div>
        </div>
        <div ref={menuRef} className="ml-auto relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Options de la conversation"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2"
          style={{ width: 40, height: 44 }}
        >
          <MoreVertical size={18} color={primary} />
        </button>
        {menuOpen && (
          <div role="menu" className="rounded-xl overflow-hidden bg-white shadow-xl" style={{ border: "1px solid rgba(21,27,61,.08)", position: "absolute", top: 48, right: 12, minWidth: 170, zIndex: 5 }}>
            <button role="menuitem" onClick={() => { onOpenReport(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2">
              <Flag size={14} /> Signaler
            </button>
            <button role="menuitem" onClick={() => { onOpenBlockConfirm(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2" style={{ color: coral, borderTop: "1px solid rgba(21,27,61,.08)" }}>
              <Ban size={14} /> Bloquer
            </button>
          </div>
        )}
        </div>
      </div>

      <ChatDropZone onDropFile={(file) => sendMediaMessage(file, detectKindFromMime(file.type))}>
      <div ref={listRef} role="log" aria-live="polite" aria-atomic="false" className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
        {hasMoreHistory && (
          <button onClick={onLoadOlder} disabled={loadingOlder} className="self-center text-xs font-bold px-3 py-2 rounded-full mb-2 disabled:opacity-50" style={{ background: bg, color: primary }}>
            {loadingOlder ? "Chargement…" : "Charger les messages précédents"}
          </button>
        )}

        {messages.length === 0 && (
          <ConversationStarters currentUser={currentUser} match={activeMatch} onPick={(text) => setMessageDraft(text)} />
        )}

        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const showDaySeparator = !prev || formatDayLabel(prev.created_at) !== formatDayLabel(m.created_at);
          const isMine = m.from_id === currentUser.id;
          const groupedWithPrev = prev && !showDaySeparator && prev.from_id === m.from_id;
          const moneyCheck = !isMine && m.kind === "text" ? detectMoneyRequest(m.text) : null;
          const isMediaKind = m.kind !== "text";
          const isSticker = m.kind === "sticker";
          const isCompactMedia = m.kind === "image" || m.kind === "video";
          return (
            <React.Fragment key={m.id}>
              {showDaySeparator && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] font-semibold px-3 py-1 rounded-full" style={{ background: "rgba(21,27,61,.06)", color: muted }}>
                    {formatDayLabel(m.created_at)}
                  </span>
                </div>
              )}
              <div
                className="motion-safe:transition-opacity max-w-[75%] text-sm flex items-end gap-1.5"
                style={{
                  ...(isMine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }),
                  ...(isSticker
                    ? {}
                    : {
                        background: isMine ? primary : bg,
                        color: isMine ? "#F7F8FA" : "#20243A",
                        borderRadius: 16,
                        ...(isMine ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
                        padding: isCompactMedia ? 4 : "10px 14px",
                      }),
                  marginTop: groupedWithPrev ? 2 : 10,
                  opacity: m._status === "sending" ? 0.6 : 1,
                }}
              >
                {isMediaKind ? (
                  <MessageBubbleMedia m={m} isMine={isMine} />
                ) : (
                  <span className="whitespace-pre-wrap break-words"><MessageText text={m.text} /></span>
                )}
                {!isSticker && (
                  <span className="text-[10px] flex-shrink-0 flex items-center gap-0.5" style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
                    {formatMessageTime(m.created_at)}
                    {isMine && m._status !== "failed" && (m.read_at ? <CheckCheck size={12} color="#7FC7FF" aria-label="Lu" /> : <Check size={12} aria-label="Envoyé" />)}
                  </span>
                )}
              </div>
              {isMine && m._status === "failed" && (
                <button onClick={() => retrySend(m)} className="self-end text-xs font-bold flex items-center gap-1 mt-0.5" style={{ color: coral }}>
                  <RotateCcw size={12} /> Impossible d'envoyer le message. Réessayer
                </button>
              )}
              {moneyCheck?.flagged && (
                <div className="max-w-[85%] text-xs px-3.5 py-2.5 rounded-2xl flex items-start gap-2" style={{ alignSelf: "flex-start", background: "#FFF3F1", color: coral, marginTop: 4 }}>
                  <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
                  <span>Ce message pourrait être une demande d'argent. Ne partage jamais tes informations bancaires et ne fais jamais de virement à quelqu'un rencontré sur Baobab.</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      </ChatDropZone>

      {messages.length === 0 && (
        <div className="px-4 pb-1 flex items-center gap-1.5 text-[11px] shrink-0" style={{ color: muted }}>
          <ShieldCheck size={12} /> Baobab ne te demandera jamais d'argent. Ne partage jamais tes informations bancaires.
        </div>
      )}

      {rateLimited && (
        <p className="px-4 pb-1 text-xs shrink-0" style={{ color: coral }}>
          Tu envoies des messages très rapidement, patiente quelques secondes.
        </p>
      )}

      <div className="p-4 flex gap-2 items-end shrink-0 sticky bottom-0 bg-white" style={{ borderTop: "1px solid rgba(21,27,61,.08)", paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {!recorderActive && <EmojiPicker onPick={(emoji) => setMessageDraft((d) => d + emoji)} currentUserId={currentUser.id} />}
        {!recorderActive && (
          <MessageMediaPicker
            onPickFile={(file, kind) => sendMediaMessage(file, kind)}
            onPickSticker={(sticker) => sendStickerMessage(sticker)}
          />
        )}
        {!recorderActive && (
          <textarea
            value={messageDraft}
            onChange={(e) => { setMessageDraft(e.target.value); broadcastTyping(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Écris un message..."
            aria-label="Écrire un message"
            rows={1}
            className="flex-1 text-sm rounded-2xl px-4 py-3 outline-none resize-none"
            style={{ background: bg, fontSize: 16, maxHeight: 120 }}
          />
        )}
        <AudioRecorder
          hasDraft={Boolean(messageDraft.trim())}
          onSendText={handleSend}
          onSendAudio={(file) => sendMediaMessage(file, "audio")}
          onActiveChange={setRecorderActive}
        />
      </div>
    </div>
  );
}
