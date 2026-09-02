import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, MoreVertical, MoreHorizontal, Reply, X, Flag, Ban, Check, CheckCheck, Circle, ShieldAlert, ShieldCheck, RotateCcw, HeartCrack, Search, MapPin, Languages, Loader2 } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import ConversationStarters from "./ConversationStarters";
import { formatLastSeen, formatMessageTime, formatDayLabel } from "../../utils/format";
import { linkify } from "../../utils/linkify";
import { detectMoneyRequest } from "../../lib/moneyGuard";
import { detectPersonalCoordinates } from "../../lib/coordinatesGuard";
import { checkRateLimit } from "../../lib/messageRateLimit";
import { detectKindFromMime } from "../../lib/mediaValidation";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import EmojiPicker from "./EmojiPicker";
import MessageMediaPicker from "./MessageMediaPicker";
import AiConversationSuggestions from "../ai/AiConversationSuggestions";
import AiSuggestButton from "../ai/AiSuggestButton";
import { invokeAI } from "../../lib/ai/aiClient";
import AudioRecorder from "./AudioRecorder";
import MessageBubbleMedia from "./MessageBubbleMedia";
import ChatDropZone from "./ChatDropZone";
import MessageActionsMenu from "./MessageActionsMenu";
import { primary, coral, bg, muted, online, offline, body, primaryRgb } from "./theme";

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
  onUnmatch = () => {},
  replyingTo,
  setReplyingTo,
  reactionsByMessageId = {},
  toggleReaction = () => {},
  deleteMessageForMe = () => {},
  deleteMessageForEveryone = () => {},
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [recorderActive, setRecorderActive] = useState(false);
  const [openActionsFor, setOpenActionsFor] = useState(null);
  const sendTimestampsRef = useRef([]);
  const listRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const menuRef = useRef(null);
  const actionsMenuRef = useRef(null);

  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));
  useEscapeKey(menuOpen, () => setMenuOpen(false));
  useClickOutside(actionsMenuRef, Boolean(openActionsFor), () => setOpenActionsFor(null));
  useEscapeKey(Boolean(openActionsFor), () => setOpenActionsFor(null));

  // Recherche dans l'historique (item audit — jusqu'ici aucun moyen de
  // retrouver un message sans faire défiler toute la conversation à la
  // main). Filtre côté client sur les messages déjà chargés uniquement,
  // pas de nouvelle requête serveur pour cette première itération.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => { setSearchOpen(false); setSearchQuery(""); }, [activeMatch?.id]);
  useEscapeKey(searchOpen, () => { setSearchOpen(false); setSearchQuery(""); });

  // Rappel avant un premier partage de coordonnées personnelles (item audit
  // sécurité) — jamais répété une fois écarté pour cette conversation, pas
  // de blocage de l'envoi.
  const [coordsNudgeDismissed, setCoordsNudgeDismissed] = useState(false);
  useEffect(() => { setCoordsNudgeDismissed(false); }, [activeMatch?.id]);
  const showCoordsNudge = !coordsNudgeDismissed && detectPersonalCoordinates(messageDraft);

  // Traduction à la demande, message par message — jamais automatique,
  // toujours étiquetée comme générée pour ne jamais faire croire que
  // l'autre personne a écrit dans cette langue.
  const [translations, setTranslations] = useState({}); // { [messageId]: {loading, text, error} }
  useEffect(() => { setTranslations({}); }, [activeMatch?.id]);
  // Ce composant est remonté à chaque changement de conversation
  // (key={activeMatch.id} dans MessagesTab) : si on clique "Traduire" puis
  // qu'on change de conversation avant la réponse IA, le composant est déjà
  // démonté quand invokeAI résout. Sans cette garde, setTranslations()
  // s'exécutait quand même (avertissement React, état perdu dans le vide).
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const handleTranslate = async (m) => {
    setTranslations((prev) => ({ ...prev, [m.id]: { loading: true } }));
    const { data, error } = await invokeAI("translate_message", { text: m.text, targetLanguage: "français" });
    if (!mountedRef.current) return; // conversation changée pendant l'appel IA
    setTranslations((prev) => ({ ...prev, [m.id]: error ? { error } : { text: data?.text || "" } }));
  };

  function handleDeleteForEveryone(message) {
    if (window.confirm("Supprimer ce message pour tout le monde ? Cette action est irréversible pour les deux personnes.")) {
      deleteMessageForEveryone(message);
    }
  }

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

  // Filet de sécurité pour le "load older" ci-dessus : si le chargement se
  // termine SANS que messages.length change (erreur réseau, ou le tout
  // début de l'historique atteint — 0 message renvoyé), l'effet ci-dessus
  // (déclenché sur messages.length) ne s'exécute jamais et
  // prevScrollHeightRef reste "sale". Le prochain message envoyé/reçu
  // déclenchait alors un saut de défilement erroné (ancienne hauteur
  // capturée bien plus tôt) au lieu du défilement normal jusqu'en bas.
  // useEffect (pas useLayoutEffect) pour s'exécuter après l'effet
  // ci-dessus dans le même commit et ne jamais lui voler la valeur qu'il
  // doit consommer quand messages.length a réellement changé.
  useEffect(() => {
    if (!loadingOlder) {
      prevScrollHeightRef.current = 0;
    }
  }, [loadingOlder]);

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

  const q = searchQuery.trim().toLowerCase();
  const visibleMessages = messages
    .filter((m) => !(m.deleted_for || []).includes(currentUser.id))
    .filter((m) => !q || (m.text || "").toLowerCase().includes(q));

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      <div className="flex items-center gap-3 p-4 shrink-0" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)`, position: "relative" }}>
        <button onClick={onBack} aria-label="Retour à la liste des conversations" className="flex items-center justify-center flex-shrink-0 md:hidden" style={{ width: 40, height: 44 }}>
          <ArrowLeft size={18} color={primary} />
        </button>
        <div style={{ position: "relative" }}>
          <Avatar name={activeMatch.name} url={activeMatch.avatar_url} size={38} />
          <Circle size={10} fill={activeMatch.is_online ? online : offline} color="transparent" style={{ position: "absolute", bottom: -1, right: -1, background: "#fff", borderRadius: "50%" }} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold flex items-center gap-1.5 truncate">
            {activeMatch.name}
            <StatusBadge emailVerified={activeMatch.email_verified} phoneVerified={activeMatch.phone_verified} isFounder={activeMatch.is_founder} isPremium={activeMatch.is_premium} size={13} />
          </div>
          <div className="text-xs truncate" style={{ color: otherTyping && currentUser.show_read_receipts !== false ? coral : muted }}>
            {otherTyping && currentUser.show_read_receipts !== false ? "en train d'écrire…" : activeMatch.is_online ? "En ligne" : formatLastSeen(activeMatch.last_seen)}
          </div>
        </div>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          aria-label={searchOpen ? "Fermer la recherche" : "Rechercher dans la conversation"}
          aria-pressed={searchOpen}
          className="ml-auto flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2"
          style={{ width: 40, height: 44 }}
        >
          <Search size={17} color={searchOpen ? coral : primary} />
        </button>
        <div ref={menuRef} className="relative">
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
          <div role="menu" className="rounded-xl overflow-hidden bg-[var(--bb-surface)] shadow-xl" style={{ border: `1px solid rgba(${primaryRgb},.08)`, position: "absolute", top: 48, right: 12, minWidth: 170, zIndex: 5 }}>
            <button role="menuitem" onClick={() => { onOpenReport(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2">
              <Flag size={14} /> Signaler
            </button>
            <button role="menuitem" onClick={() => { onUnmatch(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2" style={{ color: coral, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <HeartCrack size={14} /> Supprimer le match
            </button>
            <button role="menuitem" onClick={() => { onOpenBlockConfirm(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2" style={{ color: coral, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <Ban size={14} /> Bloquer
            </button>
          </div>
        )}
        </div>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)`, background: bg }}>
          <Search size={15} color={muted} />
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans cette conversation..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: primary }}
          />
          {searchQuery && <span className="text-xs shrink-0" style={{ color: muted }}>{visibleMessages.length} résultat{visibleMessages.length > 1 ? "s" : ""}</span>}
          <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} aria-label="Fermer la recherche"><X size={15} color={muted} /></button>
        </div>
      )}

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
        {q && visibleMessages.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: muted }}>Aucun message ne contient « {searchQuery.trim()} ».</p>
        )}

        {visibleMessages.map((m, i) => {
          const prev = visibleMessages[i - 1];
          const showDaySeparator = !prev || formatDayLabel(prev.created_at) !== formatDayLabel(m.created_at);
          const isMine = m.from_id === currentUser.id;
          const groupedWithPrev = prev && !showDaySeparator && prev.from_id === m.from_id;
          const isDeleted = Boolean(m.deleted_at);
          const moneyCheck = !isMine && !isDeleted && m.kind === "text" ? detectMoneyRequest(m.text) : null;
          const isMediaKind = m.kind !== "text";
          const isSticker = m.kind === "sticker";
          const isCompactMedia = m.kind === "image" || m.kind === "video";
          const repliedMessage = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          const reactions = reactionsByMessageId[m.id] || [];
          const groupedReactions = Object.values(
            reactions.reduce((acc, r) => {
              acc[r.emoji] = acc[r.emoji] || { emoji: r.emoji, count: 0, mine: false };
              acc[r.emoji].count += 1;
              if (r.profile_id === currentUser.id) acc[r.emoji].mine = true;
              return acc;
            }, {})
          );
          return (
            <React.Fragment key={m.id}>
              {showDaySeparator && (
                <div className="flex justify-center my-3">
                  <span className="text-[11px] font-semibold px-3 py-1 rounded-full" style={{ background: `rgba(${primaryRgb},.06)`, color: muted }}>
                    {formatDayLabel(m.created_at)}
                  </span>
                </div>
              )}
              <div className="relative max-w-[75%]" style={{ alignSelf: isMine ? "flex-end" : "flex-start", marginTop: groupedWithPrev ? 2 : 10 }}>
                {repliedMessage && !isDeleted && (
                  <div className="text-xs px-3 py-1.5 rounded-xl mb-1 truncate" style={{ background: `rgba(${primaryRgb},.05)`, color: muted, maxWidth: "100%" }}>
                    {/* Le message cité peut avoir été supprimé (pour tout le
                        monde) après coup : ne jamais réafficher son contenu
                        d'origine, sinon la suppression est contournée via
                        l'aperçu de réponse. */}
                    ↳ {repliedMessage.deleted_at ? "Message supprimé" : repliedMessage.kind === "text" ? repliedMessage.text : "Média"}
                  </div>
                )}
                <div
                  className="motion-safe:transition-opacity text-sm flex items-end gap-1.5"
                  style={{
                    ...(isSticker || isDeleted
                      ? {}
                      : {
                          // Bulle envoyée en dégradé or (refonte visuelle,
                          // maquette screen-messages.html) au lieu d'un aplat
                          // uni — "primary" (couleur de texte réactive au
                          // thème) servait auparavant de fond ici.
                          background: isMine ? "linear-gradient(155deg,var(--bb-gold-1),var(--bb-gold-2))" : bg,
                          color: isMine ? "#1C1608" : body,
                          fontWeight: isMine ? 600 : undefined,
                          borderRadius: 16,
                          ...(isMine ? { borderBottomRightRadius: 4 } : { borderBottomLeftRadius: 4 }),
                          padding: isCompactMedia ? 4 : "10px 14px",
                        }),
                    opacity: m._status === "sending" ? 0.6 : 1,
                  }}
                >
                  {isDeleted ? (
                    <span className="italic text-xs" style={{ color: muted }}>Message supprimé</span>
                  ) : isMediaKind ? (
                    <MessageBubbleMedia m={m} isMine={isMine} />
                  ) : (
                    <span className="whitespace-pre-wrap break-words"><MessageText text={m.text} /></span>
                  )}
                  {!isSticker && !isDeleted && (
                    <span className="text-[10px] flex-shrink-0 flex items-center gap-0.5" style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
                      {formatMessageTime(m.created_at)}
                      {isMine && m._status !== "failed" && (m.read_at && currentUser.show_read_receipts !== false ? <CheckCheck size={12} color="#7FC7FF" aria-label="Lu" /> : <Check size={12} aria-label="Envoyé" />)}
                    </span>
                  )}
                  {!isDeleted && typeof m.id !== "string" && (
                    <button
                      onClick={() => setOpenActionsFor(openActionsFor === m.id ? null : m.id)}
                      aria-label="Options du message"
                      aria-haspopup="menu"
                      className="flex-shrink-0 self-start rounded-full focus-visible:outline focus-visible:outline-2"
                      style={{ opacity: 0.6, marginLeft: 2 }}
                    >
                      <MoreHorizontal size={14} color={isMine ? bg : muted} />
                    </button>
                  )}
                </div>
                {groupedReactions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1" style={{ justifyContent: isMine ? "flex-end" : "flex-start" }}>
                    {groupedReactions.map((r) => (
                      <button
                        key={r.emoji}
                        onClick={() => toggleReaction(m, r.emoji)}
                        className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1"
                        style={{ background: r.mine ? `rgba(${primaryRgb},.12)` : bg, border: r.mine ? `1px solid ${primary}` : "none" }}
                      >
                        {r.emoji} {r.count > 1 && <span style={{ color: muted }}>{r.count}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {!isMine && !isDeleted && m.kind === "text" && (
                  translations[m.id] ? (
                    translations[m.id].loading ? (
                      <p className="text-xs mt-1 flex items-center gap-1" style={{ color: muted }}>
                        <Loader2 size={11} className="animate-spin" /> Traduction…
                      </p>
                    ) : translations[m.id].error ? (
                      <p className="text-xs mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: coral }}>
                        {translations[m.id].error}
                        <button onClick={() => handleTranslate(m)} className="font-bold underline">
                          Réessayer
                        </button>
                      </p>
                    ) : (
                      <div className="text-xs mt-1 px-3 py-1.5 rounded-xl" style={{ background: `rgba(${primaryRgb},.05)`, color: body, maxWidth: "100%" }}>
                        <div className="text-[10px] font-black uppercase tracking-wider mb-0.5" style={{ color: muted }}>🌐 Traduit automatiquement</div>
                        {translations[m.id].text}
                      </div>
                    )
                  ) : (
                    <button onClick={() => handleTranslate(m)} className="text-[11px] font-bold flex items-center gap-1 mt-1" style={{ color: muted }}>
                      <Languages size={11} /> Traduire
                    </button>
                  )
                )}
                {openActionsFor === m.id && !isDeleted && (
                  <div ref={actionsMenuRef}>
                    <MessageActionsMenu
                      message={m}
                      isMine={isMine}
                      align={isMine ? "right" : "left"}
                      onReact={(emoji) => toggleReaction(m, emoji)}
                      onReply={() => setReplyingTo(m)}
                      onCopy={() => navigator.clipboard?.writeText(m.text || "")}
                      onDeleteForMe={() => deleteMessageForMe(m)}
                      onDeleteForEveryone={() => handleDeleteForEveryone(m)}
                      onClose={() => setOpenActionsFor(null)}
                    />
                  </div>
                )}
              </div>
              {isMine && m._status === "failed" && (
                <button onClick={() => retrySend(m)} className="self-end text-xs font-bold flex items-center gap-1 mt-0.5 text-right" style={{ color: coral }}>
                  <RotateCcw size={12} className="flex-shrink-0" /> {m._error || "Impossible d'envoyer le message."} Réessayer
                </button>
              )}
              {moneyCheck?.flagged && (
                // Fond fixe #FFF3F1 (pensé pour le mode clair) devenait un
                // pavé rose clair illisible sur fond sombre — remplacé par
                // les jetons réactifs au thème (comme .system-note de la
                // maquette screen-messages.html), la couleur d'alerte reste
                // sur l'icône et le texte pour rester visible dans les deux.
                <div className="max-w-[85%] text-xs px-3.5 py-2.5 rounded-2xl flex items-start gap-2" style={{ alignSelf: "flex-start", background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: coral, marginTop: 4 }}>
                  <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{moneyCheck.message}</span>
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

      {showCoordsNudge && (
        <div className="px-4 pt-2 flex items-start gap-2 shrink-0 bg-[var(--bb-surface)]" style={{ borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <MapPin size={13} className="flex-shrink-0 mt-0.5" color={coral} />
          <span className="text-xs flex-1" style={{ color: coral }}>Sur le point de partager tes coordonnées ? Pour une première rencontre, privilégie un lieu public.</span>
          <button onClick={() => setCoordsNudgeDismissed(true)} aria-label="Ignorer ce rappel" className="flex-shrink-0"><X size={13} color={muted} /></button>
        </div>
      )}

      {replyingTo && (
        <div className="px-4 pt-2 flex items-center justify-between gap-2 shrink-0 bg-[var(--bb-surface)]" style={{ borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
          <div className="min-w-0 flex items-center gap-1.5 text-xs" style={{ color: muted }}>
            <Reply size={12} className="flex-shrink-0" />
            <span className="truncate">Réponse à : {replyingTo.kind === "text" ? replyingTo.text : "Média"}</span>
          </div>
          <button onClick={() => setReplyingTo(null)} aria-label="Annuler la réponse" className="flex-shrink-0">
            <X size={14} color={muted} />
          </button>
        </div>
      )}

      {!recorderActive && messageDraft.trim() && (
        <div className="px-4 pt-2 shrink-0 bg-[var(--bb-surface)]">
          <AiSuggestButton
            action="reformulate_message"
            buildPayload={() => ({ text: messageDraft })}
            onApply={(text) => setMessageDraft(text.slice(0, 4000))}
            label="Reformuler avec l'IA"
          />
        </div>
      )}
      <div className="p-4 flex gap-2 items-end shrink-0 sticky bottom-0 bg-[var(--bb-surface)]" style={{ borderTop: replyingTo ? "none" : `1px solid rgba(${primaryRgb},.08)`, paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {/* .slice(0, 4000) : comme pour la reformulation IA et les suggestions IA ci-dessus,
            l'ajout d'un emoji passe par setMessageDraft() en dehors de l'événement onChange du
            textarea, donc l'attribut maxLength du textarea (saisie clavier) ne s'applique pas
            ici — sans troncature explicite, un emoji ajouté à un brouillon déjà proche de 4000
            caractères pouvait dépasser la limite envoyée au serveur. */}
        {!recorderActive && <EmojiPicker onPick={(emoji) => setMessageDraft((d) => (d + emoji).slice(0, 4000))} currentUserId={currentUser.id} />}
        {!recorderActive && (
          <MessageMediaPicker
            onPickFile={(file, kind) => sendMediaMessage(file, kind)}
            onPickSticker={(sticker) => sendStickerMessage(sticker)}
          />
        )}
        {!recorderActive && (
          <AiConversationSuggestions currentUser={currentUser} match={activeMatch} onPick={(text) => setMessageDraft(text.slice(0, 4000))} />
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
            maxLength={4000}
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
