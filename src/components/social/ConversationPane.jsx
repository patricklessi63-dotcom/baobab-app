import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowDown, MoreVertical, MoreHorizontal, Reply, X, Flag, Ban, Check, CheckCheck, Circle, ShieldAlert, ShieldCheck, RotateCcw, HeartCrack, Search, MapPin, Languages, Loader2, UserRound, Copy, Forward, Trash2 } from "lucide-react";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";
import ConversationStarters from "./ConversationStarters";
import { formatLastSeen, formatMessageTime, formatDayLabel, dayKey, messagePreviewLabel, truncateUnicodeSafe } from "../../utils/format";
import { getSignedUrl } from "../../lib/signedUrlCache";
import { useOptionalImageLightbox } from "../../lib/ImageLightboxContext";
import { linkify } from "../../utils/linkify";
import { detectMoneyRequest } from "../../lib/moneyGuard";
import { detectPersonalCoordinates } from "../../lib/coordinatesGuard";
import { checkRateLimit } from "../../lib/messageRateLimit";
import { detectKindFromFile } from "../../lib/mediaValidation";
import { normalizeForSearch, findMatchRanges } from "../../lib/searchQuery";
import { isUserOnline } from "../../lib/presence";
import { getMessageCheckState } from "../../lib/messageDeliveryState";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusReturn } from "../../hooks/useFocusReturn";
import EmojiPicker from "./EmojiPicker";
import MessageMediaPicker from "./MessageMediaPicker";
import AiConversationSuggestions from "../ai/AiConversationSuggestions";
import AiSuggestButton from "../ai/AiSuggestButton";
import { invokeAI } from "../../lib/ai/aiClient";
import AudioRecorder from "./AudioRecorder";
import MessageBubbleMedia from "./MessageBubbleMedia";
import ChatDropZone from "./ChatDropZone";
import MessageActionsMenu from "./MessageActionsMenu";
import ConfirmModal from "./ConfirmModal";
import ForwardModal from "./ForwardModal";
import { primary, coral, coralText, bg, muted, offline, leafLight, body, primaryRgb } from "./theme";
import { isImeComposing } from "../../utils/keyboard";
import { isPremiumEnabled, isAiEnabled } from "../../lib/featureFlags";

// Découpe `str` (qui commence à l'index `offset` du texte complet) selon les plages
// surlignées par la recherche : [{text, hit}].
function splitByRanges(str, ranges, offset) {
  const parts = [];
  let cursor = 0;
  for (const r of ranges) {
    const a = Math.max(0, r.start - offset);
    const b = Math.min(str.length, r.end - offset);
    if (b <= a || a >= str.length) continue;
    if (a > cursor) parts.push({ text: str.slice(cursor, a), hit: false });
    parts.push({ text: str.slice(a, b), hit: true });
    cursor = b;
  }
  if (cursor < str.length) parts.push({ text: str.slice(cursor), hit: false });
  return parts.length ? parts : [{ text: str, hit: false }];
}

function MessageText({ text, highlight = "" }) {
  const ranges = highlight ? findMatchRanges(text, highlight) : [];
  let offset = 0;
  return (
    <>
      {linkify(text).map((seg, i) => {
        const start = offset;
        offset += seg.text.length;
        const parts = ranges.length ? splitByRanges(seg.text, ranges, start) : [{ text: seg.text, hit: false }];
        const inner = parts.map((part, j) => (part.hit ? <mark key={j} style={{ background: "var(--bb-gold, #E5B93C)", color: "#1C1608", borderRadius: 3, padding: "0 1px" }}>{part.text}</mark> : <React.Fragment key={j}>{part.text}</React.Fragment>));
        return seg.type === "link" ? (
          <a key={i} href={seg.href} target="_blank" rel="noopener noreferrer" className="underline break-all">
            {inner}
          </a>
        ) : (
          <span key={i}>{inner}</span>
        );
      })}
    </>
  );
}

// Indicateur « en train d'écrire… » — le libellé suivi de trois points qui
// respirent en décalé. Points en vert clair décoratif (--bb-leaf-light) ;
// le libellé garde la couleur héritée du conteneur parent.
// La règle globale prefers-reduced-motion (index.html) fige l'animation.
function TypingIndicator({ label = "en train d'écrire" }) {
  const dot = {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: leafLight,
    display: "inline-block",
  };
  return (
    <span className="inline-flex items-center">
      <style>{`@keyframes bbTypingDot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }`}</style>
      {label}
      <span className="inline-flex items-center gap-[3px] ml-1">
        <span style={{ ...dot, animation: "bbTypingDot 1.2s ease-in-out 0s infinite" }} />
        <span style={{ ...dot, animation: "bbTypingDot 1.2s ease-in-out .2s infinite" }} />
        <span style={{ ...dot, animation: "bbTypingDot 1.2s ease-in-out .4s infinite" }} />
      </span>
    </span>
  );
}

export default function ConversationPane({
  activeMatch,
  currentUser,
  goTab,
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
  onViewProfile,
  onUnmatch = () => {},
  replyingTo,
  setReplyingTo,
  reactionsByMessageId = {},
  toggleReaction = () => {},
  deleteMessageForMe = () => {},
  deleteMessageForEveryone = () => {},
  forwardTargets = [],
  forwardMessages = async () => ({ sent: 0, failed: 0 }),
  showSuccessNotice = () => {},
}) {
  const openLightbox = useOptionalImageLightbox()?.openLightbox || (() => {});
  const [menuOpen, setMenuOpen] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [recorderActive, setRecorderActive] = useState(false);
  // « enregistre un message vocal… » côté destinataire : on ré-émet toutes les
  // 2 s tant que l'enregistrement dure (l'indicateur expire au bout de 3 s),
  // puis un « idle » explicite à l'arrêt.
  const [recordingNow, setRecordingNow] = useState(false);
  useEffect(() => {
    if (!recordingNow) return undefined;
    broadcastTyping("recording");
    const id = setInterval(() => broadcastTyping("recording"), 2000);
    return () => { clearInterval(id); broadcastTyping("idle"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingNow]);
  const [openActionsFor, setOpenActionsFor] = useState(null);
  // Mode sélection multiple : null = désactivé, sinon Set d'ids de messages.
  const [selectedIds, setSelectedIds] = useState(null);
  const selecting = selectedIds !== null;
  // Messages en attente de transfert (modale de choix de la conversation).
  const [forwardPending, setForwardPending] = useState(null);
  const [pendingDeleteSelection, setPendingDeleteSelection] = useState(false);
  // Message mis en évidence après un saut vers le message cité.
  const [flashId, setFlashId] = useState(null);
  const flashTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);
  const longPressTimerRef = useRef(null);
  // Bouton flottant « ↓ nouveaux messages » : affiché quand un message
  // arrive alors que l'utilisateur a fait défiler vers le haut pour relire
  // l'historique — on ne force alors jamais le défilement.
  const [showJumpButton, setShowJumpButton] = useState(false);
  const sendTimestampsRef = useRef([]);
  const listRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const menuRef = useRef(null);
  const actionsMenuRef = useRef(null);
  // Défilement du fil : instantané au premier rendu de la conversation,
  // fluide ensuite (nouveau message reçu/envoyé) tant que l'utilisateur est
  // déjà en bas. nearBottomRef est tenu à jour par onScroll ; forceScrollRef
  // force un suivi fluide quand c'est l'utilisateur lui-même qui envoie.
  const isInitialScrollRef = useRef(true);
  const nearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);

  const isNearBottom = () => {
    const el = listRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  const scrollListToBottom = (behavior) => {
    const el = listRef.current;
    if (!el) return;
    // La règle globale prefers-reduced-motion d'index.html ne fige QUE les
    // animations/transitions CSS : un scrollTo({behavior:"smooth"}) en JS
    // continue de défiler en fondu. On repasse donc explicitement en "auto"
    // quand l'utilisateur a demandé moins de mouvement.
    let b = behavior;
    if (
      b === "smooth" &&
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      b = "auto";
    }
    if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: b });
    else el.scrollTop = el.scrollHeight;
  };
  const handleListScroll = () => {
    nearBottomRef.current = isNearBottom();
    if (nearBottomRef.current) setShowJumpButton(false);
    // Historique chargé automatiquement en remontant (comme WhatsApp) : plus
    // besoin de viser le bouton « Charger les messages précédents ». La
    // position de lecture est conservée par le useLayoutEffect de prepend.
    const el = listRef.current;
    if (el && hasMoreHistory && !loadingOlder && el.scrollTop < 120 && el.scrollHeight > el.clientHeight) onLoadOlder();
  };

  // Fondu d'apparition (bb-fade-in) réservé au DERNIER message quand la liste
  // grandit par le bas — jamais au montage (sinon tout l'historique « pop »),
  // jamais lors d'un « charger les messages précédents » (prepend en haut).
  // Approche volontairement minimale : on ne suit que l'id du dernier message.
  // Le composant est remonté à chaque changement de conversation
  // (key={activeMatch.id} dans MessagesTab), donc la ref repart de zéro.
  const lastMsgIdRef = useRef(null);
  const lastMsg = messages[messages.length - 1];
  const animateLast =
    lastMsgIdRef.current !== null &&
    Boolean(lastMsg) &&
    lastMsg.id !== lastMsgIdRef.current &&
    !loadingOlder;
  useEffect(() => {
    lastMsgIdRef.current = messages.length ? messages[messages.length - 1].id : null;
  }, [messages]);

  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));
  useEscapeKey(menuOpen, () => setMenuOpen(false));
  useClickOutside(actionsMenuRef, Boolean(openActionsFor), () => setOpenActionsFor(null));
  useEscapeKey(Boolean(openActionsFor), () => setOpenActionsFor(null));
  // Même bug de perte de focus qu'EmojiPicker/MessageMediaPicker (voir
  // useFocusReturn) : ces deux menus (« Options de la conversation »,
  // MessageActionsMenu par message) démontent tout leur contenu à la
  // fermeture. Tabuler jusqu'à un item (ex. « Copier », une réaction rapide)
  // puis Échap perdait le focus sur <body> au lieu de revenir sur le bouton
  // ⋮ qui a ouvert le menu.
  useFocusReturn(menuOpen);
  // openActionsFor est l'id du message (pas un booléen) : passer l'id BRUT,
  // pas Boolean(openActionsFor), sinon useFocusReturn ne redéclenche jamais
  // son effet quand on bascule directement du menu du message A vers celui
  // du message B (deux valeurs "truthy" successives, le hook dépend de
  // [active] et ne voit aucun changement) — le bouton ⋮ de A resterait capturé
  // comme cible, et fermer le menu de B renverrait alors le focus sur le ⋮
  // de A au lieu de B. Vérifié par un test isolé du hook avant correctif :
  // reproductible dès qu'on change de message sans repasser par un clic
  // souris (qui, lui, referme d'abord via useClickOutside/pointerdown).
  useFocusReturn(openActionsFor);

  // Recherche dans l'historique (item audit — jusqu'ici aucun moyen de
  // retrouver un message sans faire défiler toute la conversation à la
  // main). Filtre côté client sur les messages déjà chargés uniquement,
  // pas de nouvelle requête serveur pour cette première itération.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);
  useEffect(() => { setSearchOpen(false); setSearchQuery(""); }, [activeMatch?.id]);
  useEscapeKey(searchOpen, () => { setSearchOpen(false); setSearchQuery(""); });
  // Bug corrigé à l'audit clavier/focus trap : contrairement à la recherche
  // équivalente de SocialShell.jsx (dont le <input> reste monté en
  // permanence, seul son dropdown de résultats se démonte), cette barre de
  // recherche EN CONVERSATION démonte tout son bloc — le <input> compris —
  // quand `searchOpen` repasse à false (voir plus bas :
  // `{searchOpen && (<div>...<input/>...)}`). Un utilisateur qui tabule
  // jusqu'au champ (ou au bouton "Fermer la recherche" juste à côté) puis
  // ferme via Échap (useEscapeKey ci-dessus) perdait donc son focus sur
  // <body> — exactement le même bug déjà identifié et corrigé pour
  // "Options de la conversation" (menuOpen) et MessageActionsMenu
  // (openActionsFor) juste au-dessus dans ce même fichier, mais oublié ici.
  useFocusReturn(searchOpen);
  // L'ouverture du champ se faisait via l'attribut natif `autoFocus` — or
  // React l'applique pendant la phase de commit, AVANT que l'effet passif
  // de useFocusReturn ci-dessus n'ait pu capturer `document.activeElement`
  // (le bouton loupe). Résultat : useFocusReturn capturait déjà le <input>
  // lui-même comme "élément à restaurer" au lieu du bouton loupe, rendant le
  // correctif ci-dessus inopérant. En déplaçant l'autofocus dans un effet
  // séparé, déclaré APRÈS useFocusReturn(searchOpen) (les effets d'un même
  // rendu s'exécutent dans leur ordre de déclaration), la capture a
  // désormais lieu AVANT ce déplacement de focus — même ordre que
  // useFocusTrap (capture, puis déplacement du focus dans la modale).
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Rappel avant un premier partage de coordonnées personnelles (item audit
  // sécurité) — jamais répété une fois écarté pour cette conversation, pas
  // de blocage de l'envoi.
  const [coordsNudgeDismissed, setCoordsNudgeDismissed] = useState(false);
  useEffect(() => { setCoordsNudgeDismissed(false); }, [activeMatch?.id]);
  const showCoordsNudge = !coordsNudgeDismissed && detectPersonalCoordinates(messageDraft);

  // Bug corrigé : banned_at/suspended_until ne sont vérifiés que pour SON
  // PROPRE compte (App.jsx, vue "banned"/"suspended") — jamais pour l'autre
  // personne d'une conversation, alors que ces colonnes sont déjà présentes
  // sur activeMatch (jointure `profile:from_id(*)` dans App.jsx, aucune
  // requête supplémentaire nécessaire). Résultat : si B est banni ou
  // suspendu par un·e admin pendant qu'il/elle discute avec A, A continuait
  // de voir "En ligne"/"Vu il y a X" comme si de rien n'était, sans jamais
  // comprendre pourquoi B ne répond plus.
  const otherUnavailable =
    Boolean(activeMatch.banned_at) ||
    Boolean(activeMatch.suspended_until && new Date(activeMatch.suspended_until) > new Date());

  // isUserOnline (pas activeMatch.is_online brut) : demande explicite du 15
  // sept. — is_online peut rester bloqué à true en base après une session
  // terminée brutalement (crash, coupure réseau), voir lib/presence.js.
  // Réutilisé pour le point vert de l'en-tête ET pour la 2e coche "distribué"
  // ci-dessous (mission messagerie temps réel, même 15 sept.).
  const otherOnline = isUserOnline(activeMatch);

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

  // « Pop » d'apparition d'une réaction (Messages 4.0) : animé uniquement
  // pour les réactions APPARUES depuis le montage — jamais tout le lot au
  // chargement de la conversation. Set de clés "messageId|emoji" déjà vues ;
  // null au premier rendu = on n'anime rien.
  const seenReactionKeysRef = useRef(null);
  useEffect(() => {
    const keys = new Set();
    for (const [mid, list] of Object.entries(reactionsByMessageId)) {
      for (const r of list) keys.add(`${mid}|${r.emoji}`);
    }
    seenReactionKeysRef.current = keys;
  }, [reactionsByMessageId]);
  const handleTranslate = async (m) => {
    setTranslations((prev) => ({ ...prev, [m.id]: { loading: true } }));
    const { data, error } = await invokeAI("translate_message", { text: m.text, targetLanguage: "français" });
    if (!mountedRef.current) return; // conversation changée pendant l'appel IA
    setTranslations((prev) => ({ ...prev, [m.id]: error ? { error } : { text: data?.text || "" } }));
  };

  // Suppression pour tout le monde en attente de confirmation — remplace
  // l'ancien window.confirm(), voir ConfirmModal.jsx.
  const [pendingDeleteForEveryone, setPendingDeleteForEveryone] = useState(null);
  function handleDeleteForEveryone(message) {
    setPendingDeleteForEveryone(message);
  }

  useLayoutEffect(() => {
    if (loadingOlder) {
      prevScrollHeightRef.current = listRef.current?.scrollHeight || 0;
    }
  }, [loadingOlder]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;

    // 1. Prepend d'historique : on conserve la position de lecture exacte,
    //    jamais de saut vers le bas.
    if (prevScrollHeightRef.current) {
      el.scrollTop += el.scrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
      return;
    }

    // 2. Premier rendu de la conversation : positionnement instantané en bas.
    if (isInitialScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      if (messages.length) isInitialScrollRef.current = false;
      return;
    }

    // 3. Nouveau message : suivi fluide si c'est moi qui envoie ou si je suis
    //    déjà en bas ; sinon on ne bouge pas et on propose le bouton flottant.
    if (forceScrollRef.current || nearBottomRef.current) {
      forceScrollRef.current = false;
      nearBottomRef.current = true;
      setShowJumpButton(false);
      scrollListToBottom("smooth");
    } else {
      setShowJumpButton(true);
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

  // Partagé par TOUS les chemins d'envoi (texte, média, sticker, audio) —
  // bug corrigé à l'audit : ce garde-fou anti-spam (checkRateLimit) ne
  // protégeait jusqu'ici que l'envoi de texte via handleSend. Les stickers
  // (onPickSticker), les pièces jointes (onPickFile, glisser-déposer via
  // ChatDropZone) et les messages vocaux (AudioRecorder) appelaient
  // directement sendMediaMessage/sendStickerMessage en contournant
  // entièrement ce délai — un clic répété sur un sticker ou un
  // glisser-déposer en boucle pouvait donc spammer la conversation bien
  // au-delà des 8 messages/15s prévus. Même fenêtre glissante partagée
  // (sendTimestampsRef) que le texte : un sticker envoyé compte aussi dans
  // le quota du prochain message texte, et inversement.
  const guardedSend = (fn) => (...args) => {
    const { allowed, remainingTimestamps } = checkRateLimit(sendTimestampsRef.current);
    if (!allowed) {
      setRateLimited(true);
      setTimeout(() => setRateLimited(false), 3000);
      return;
    }
    sendTimestampsRef.current = [...remainingTimestamps, Date.now()];
    forceScrollRef.current = true; // c'est moi qui envoie → suivi fluide jusqu'en bas
    fn(...args);
  };

  const handleSend = () => {
    if (!messageDraft.trim()) return;
    guardedSend(sendMessage)();
  };

  // Bug corrigé à l'audit : seule la casse était normalisée ici — chercher
  // "cafe" (sans accent) dans l'historique d'une conversation ne retrouvait
  // jamais un message contenant "café". Même correctif que matchesSearch
  // dans SocialShell.jsx, via lib/searchQuery.js.
  const q = normalizeForSearch(searchQuery.trim());
  const visibleMessages = messages
    .filter((m) => !(m.deleted_for || []).includes(currentUser.id))
    .filter((m) => !q || normalizeForSearch(m.text).includes(q));

  // Galerie : toutes les photos de la conversation affichée, navigables dans la
  // visionneuse plein écran (flèches, balayage). On résout les URL signées de
  // celles qui entourent la photo touchée (par lots, 20 de chaque côté) : le
  // cache d'URL signées (signedUrlCache) évite tout aller-retour pour celles
  // déjà affichées dans le fil.
  const openImageGallery = async (msg, ownUrl) => {
    const photos = visibleMessages.filter((x) => x.kind === "image" && !x.deleted_at && x.media_path);
    const at = photos.findIndex((x) => x.id === msg.id);
    if (at === -1) { openLightbox([{ url: ownUrl, alt: msg.media_meta?.original_name }]); return; }
    const from = Math.max(0, at - 20);
    const slice = photos.slice(from, at + 21);
    const urls = await Promise.all(slice.map((x) => (x.id === msg.id && ownUrl ? Promise.resolve(ownUrl) : getSignedUrl(x.media_path))));
    const items = slice.map((x, i) => ({ url: urls[i], alt: x.media_meta?.original_name })).filter((it) => it.url);
    if (!mountedRef.current) return;
    const index = items.findIndex((it) => it.url === ownUrl);
    openLightbox(items.length ? items : [{ url: ownUrl, alt: msg.media_meta?.original_name }], Math.max(0, index));
  };

  // Saut vers le message cité (clic sur l'aperçu de réponse).
  const jumpToMessage = (id) => {
    const el = Array.from(listRef.current?.querySelectorAll("[data-message-id]") || []).find((node) => node.getAttribute("data-message-id") === String(id));
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    clearTimeout(flashTimerRef.current);
    setFlashId(id);
    flashTimerRef.current = setTimeout(() => setFlashId(null), 1600);
  };

  const startSelection = (m) => { setOpenActionsFor(null); setSelectedIds(new Set(m ? [m.id] : [])); };
  const toggleSelected = (id) => setSelectedIds((prev) => {
    const next = new Set(prev || []);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next.size === 0 ? null : next;
  });
  const selectedMessages = selecting ? visibleMessages.filter((x) => selectedIds.has(x.id)) : [];
  const exitSelection = () => setSelectedIds(null);
  useEscapeKey(selecting && !forwardPending && !pendingDeleteSelection, exitSelection);

  const copyText = (text) => { try { navigator.clipboard?.writeText(text); } catch { /* presse-papiers indisponible */ } };
  const copySelection = () => {
    const texts = selectedMessages.filter((x) => x.kind === "text" && !x.deleted_at).map((x) => x.text);
    if (texts.length) copyText(texts.join("\n"));
    exitSelection();
  };

  // Appui long (tactile) = ouvre le menu du message, comme WhatsApp. Annulé dès
  // que le doigt bouge (défilement) ou se relève avant le délai.
  const longPress = (m) => ({
    onTouchStart: () => {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => setOpenActionsFor(m.id), 450);
    },
    onTouchMove: () => clearTimeout(longPressTimerRef.current),
    onTouchEnd: () => clearTimeout(longPressTimerRef.current),
    onTouchCancel: () => clearTimeout(longPressTimerRef.current),
  });
  useEffect(() => () => clearTimeout(longPressTimerRef.current), []);

  // Le menu d'un message ouvert tout en bas du fil dépassait de la zone
  // visible : on le fait défiler dans la vue. Bug corrigé : on faisait défiler
  // l'enveloppe (<div ref={actionsMenuRef}>), qui n'a AUCUNE hauteur puisque le
  // menu qu'elle contient est en position absolue (sous le message, top: 100%) ;
  // « nearest » la jugeait déjà visible et ne bougeait pas. Pour une photo ou une
  // vidéo en bas de la conversation, les trois points semblaient donc sans effet :
  // le menu s'ouvrait bel et bien, mais hors de l'écran. On vise le menu lui-même.
  useEffect(() => {
    if (!openActionsFor) return;
    const id = requestAnimationFrame(() => {
      const wrapper = actionsMenuRef.current;
      const menu = wrapper?.querySelector?.('[role="menu"]') || wrapper;
      menu?.scrollIntoView?.({ block: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [openActionsFor]);

  const runForward = async (target) => {
    const list = forwardPending || [];
    const { sent, failed } = await forwardMessages(target, list);
    if (sent > 0) {
      showSuccessNotice(
        failed > 0
          ? `${sent} message${sent > 1 ? "s" : ""} transféré${sent > 1 ? "s" : ""} à ${target.name}, ${failed} en échec.`
          : sent > 1 ? `${sent} messages transférés à ${target.name}.` : `Message transféré à ${target.name}.`,
        4000
      );
      setForwardPending(null);
      exitSelection();
    }
  };

  return (
    <div className="flex flex-col h-full w-full min-w-0">
      <div className="flex items-center gap-3 p-4 shrink-0" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)`, position: "relative" }}>
        <button onClick={onBack} aria-label="Retour à la liste des conversations" className="bb-hit flex items-center justify-center flex-shrink-0 md:hidden" style={{ width: 40, height: 44 }}>
          <ArrowLeft size={18} color={primary} />
        </button>
        <button
          type="button"
          onClick={() => onViewProfile?.(activeMatch)}
          aria-label={`Voir le profil de ${activeMatch.name}`}
          className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl -m-1 p-1 motion-safe:transition-colors hover:bg-[var(--bb-surface-2)] focus-visible:outline focus-visible:outline-2"
        >
          <div style={{ position: "relative" }}>
            <Avatar name={activeMatch.name} url={activeMatch.avatar_url} size={38} />
            {!otherUnavailable && (
              <Circle size={10} fill={otherOnline ? leafLight : offline} color="transparent" className={otherOnline ? "bb-online-pulse" : undefined} style={{ position: "absolute", bottom: -1, right: -1, background: "#fff", borderRadius: "50%" }} />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold flex items-center gap-1.5 truncate">
              {activeMatch.name}
              <StatusBadge emailVerified={activeMatch.email_verified} phoneVerified={activeMatch.phone_verified} isFounder={activeMatch.is_founder} isPremium={activeMatch.is_premium} size={13} />
            </div>
            <div className="text-xs truncate" style={{ color: otherUnavailable ? coralText : otherTyping && currentUser.show_read_receipts !== false ? coralText : muted }}>
              {/* show_online_status vérifié (bug corrigé à l'audit) : is_online est
                  déjà forcé à false côté écriture (App.jsx) quand ce réglage est
                  désactivé, mais last_seen, lui, reste figé à l'instant de la
                  désactivation et continuait d'être affiché ici via formatLastSeen
                  — donc "Vu il y a X" fuyait quand même une donnée réelle malgré
                  le réglage "Statut en ligne visible" éteint. */}
              {otherUnavailable
                ? "Ce compte n'est plus disponible"
                : otherTyping && currentUser.show_read_receipts !== false
                ? <TypingIndicator label={otherTyping === "recording" ? "enregistre un message vocal" : "en train d'écrire"} />
                : otherOnline
                ? "En ligne"
                : activeMatch.show_online_status === false
                ? "Statut non disponible"
                : formatLastSeen(activeMatch.last_seen)}
            </div>
          </div>
        </button>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          aria-label={searchOpen ? "Fermer la recherche" : "Rechercher dans la conversation"}
          aria-pressed={searchOpen}
          className="bb-hit ml-auto flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2"
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
          className="bb-hit flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2"
          style={{ width: 40, height: 44 }}
        >
          <MoreVertical size={18} color={primary} />
        </button>
        {menuOpen && (
          <div role="menu" className="rounded-xl overflow-hidden bg-[var(--bb-surface)] shadow-xl" style={{ border: `1px solid rgba(${primaryRgb},.08)`, position: "absolute", top: 48, right: 12, minWidth: 190, zIndex: 5 }}>
            <button role="menuitem" onClick={() => { onViewProfile?.(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2">
              <UserRound size={14} /> Voir le profil
            </button>
            <button role="menuitem" onClick={() => { onOpenReport(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2" style={{ borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <Flag size={14} /> Signaler
            </button>
            <button role="menuitem" onClick={() => { onUnmatch(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2" style={{ color: coralText, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <HeartCrack size={14} /> Supprimer le match
            </button>
            <button role="menuitem" onClick={() => { onOpenBlockConfirm(activeMatch); setMenuOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2" style={{ color: coralText, borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <Ban size={14} /> Bloquer
            </button>
          </div>
        )}
        </div>
      </div>

      {selecting && (
        <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)`, background: bg }}>
          <button onClick={exitSelection} aria-label="Annuler la sélection" className="bb-hit h-9 w-9 flex items-center justify-center rounded-full"><X size={18} color={primary} /></button>
          <span className="text-sm font-bold flex-1" style={{ color: primary }} aria-live="polite">
            {selectedMessages.length} sélectionné{selectedMessages.length > 1 ? "s" : ""}
          </span>
          <button onClick={copySelection} disabled={!selectedMessages.some((x) => x.kind === "text")} aria-label="Copier les messages sélectionnés" className="bb-hit h-9 w-9 flex items-center justify-center rounded-full disabled:opacity-30"><Copy size={17} color={primary} /></button>
          <button onClick={() => setForwardPending(selectedMessages.slice(0, 10))} disabled={selectedMessages.length === 0} aria-label="Transférer les messages sélectionnés" className="bb-hit h-9 w-9 flex items-center justify-center rounded-full disabled:opacity-30"><Forward size={17} color={primary} /></button>
          <button onClick={() => setPendingDeleteSelection(true)} disabled={selectedMessages.length === 0} aria-label="Supprimer pour moi les messages sélectionnés" className="bb-hit h-9 w-9 flex items-center justify-center rounded-full disabled:opacity-30"><Trash2 size={17} color={coralText} /></button>
        </div>
      )}

      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2.5 shrink-0" style={{ borderBottom: `1px solid rgba(${primaryRgb},.08)`, background: bg }}>
          <Search size={15} color={muted} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher dans cette conversation..."
            aria-label="Rechercher dans cette conversation"
            className="flex-1 bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-leaf)] text-sm"
            style={{ color: primary }}
          />
          {searchQuery && <span className="text-xs shrink-0" style={{ color: muted }}>{visibleMessages.length} résultat{visibleMessages.length > 1 ? "s" : ""}</span>}
          <button className="bb-hit" onClick={() => { setSearchOpen(false); setSearchQuery(""); }} aria-label="Fermer la recherche"><X size={15} color={muted} /></button>
        </div>
      )}

      <ChatDropZone onDropFile={(file) => guardedSend(sendMediaMessage)(file, detectKindFromFile(file))}>
      <div ref={listRef} onScroll={handleListScroll} role="log" aria-live="polite" aria-atomic="false" className="flex-1 p-4 flex flex-col gap-1 overflow-y-auto">
        {hasMoreHistory && (
          <button onClick={onLoadOlder} disabled={loadingOlder} className="bb-hit self-center text-xs font-bold px-3 py-2 rounded-full mb-2 disabled:opacity-50" style={{ background: bg, color: primary }}>
            {loadingOlder ? "Chargement…" : "Charger les messages précédents"}
          </button>
        )}

        {messages.length === 0 && !otherUnavailable && (
          // truncateUnicodeSafe(…, 4000) : même contrainte que TOUS les autres chemins qui
          // écrivent dans messageDraft (frappe clavier via maxLength, emoji,
          // reformulation IA, suggestions de réponse IA — voir plus bas) —
          // ce chemin-ci l'oubliait. Les questions brise-glace intègrent le
          // nom/la ville/le pays du match (texte libre, sans plafond strict)
          // : sans troncature, un texte anormalement long aurait pu porter
          // messageDraft au-delà de la limite avant même la première frappe.
          //
          // !otherUnavailable (bug corrigé à l'audit de ConversationStarters.jsx) :
          // ce composant ne consultait pas banned_at/suspended_until (même
          // garde que le statut "En ligne"/"Vu il y a X" ci-dessus et que
          // MessagesTab.jsx). Pour une conversation tout juste créée (match
          // mutuel sans message échangé) dont l'autre personne est bannie ou
          // suspendue entre-temps, l'en-tête affichait déjà "Ce compte n'est
          // plus disponible" pendant que cette zone proposait quand même des
          // questions brise-glace ("Vous êtes tous les deux à...") pour
          // engager une conversation avec un compte qui ne répondra jamais —
          // incohérent et trompeur pour l'utilisateur restant.
          <ConversationStarters currentUser={currentUser} match={activeMatch} onPick={(text) => setMessageDraft(truncateUnicodeSafe(text, 4000))} />
        )}
        {q && visibleMessages.length === 0 && (
          <p className="text-sm text-center py-6" style={{ color: muted }}>Aucun message ne contient « {searchQuery.trim()} ».</p>
        )}

        {visibleMessages.map((m, i) => {
          const prev = visibleMessages[i - 1];
          const showDaySeparator = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
          const isMine = m.from_id === currentUser.id;
          const groupedWithPrev = prev && !showDaySeparator && prev.from_id === m.from_id;
          const isDeleted = Boolean(m.deleted_at);
          const moneyCheck = !isMine && !isDeleted && m.kind === "text" ? detectMoneyRequest(m.text) : null;
          const isMediaKind = m.kind !== "text";
          const isSticker = m.kind === "sticker";
          const isCompactMedia = m.kind === "image" || m.kind === "video";
          const repliedMessage = m.reply_to_id ? messages.find((x) => x.id === m.reply_to_id) : null;
          // Bug corrigé à l'audit réponses : le message cité était cherché dans
          // `messages` (jamais filtré) et seul `deleted_at` (suppression pour
          // tout le monde) faisait basculer l'aperçu sur "Message supprimé".
          // Or `deleteMessageForMe` ne touche jamais deleted_at, seulement
          // `deleted_for` (masquage propre à MOI, voir App.jsx) — le message
          // original disparaît bien de la liste principale (filtre
          // visibleMessages) mais son contenu d'origine (texte/média)
          // continuait de fuiter dans l'aperçu "↳ ..." de toute réponse qui le
          // cite, y compris pour l'utilisateur qui vient de le supprimer pour
          // lui-même — contournant sa propre suppression sur son propre écran.
          const repliedMessageDeleted =
            Boolean(repliedMessage) &&
            (Boolean(repliedMessage.deleted_at) || (repliedMessage.deleted_for || []).includes(currentUser.id));
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
              <div
                data-message-id={m.id}
                className={`relative ${m.kind === "audio" ? "max-w-[88%]" : "max-w-[75%]"}${animateLast && i === visibleMessages.length - 1 ? " bb-fade-in" : ""}${selecting ? " cursor-pointer" : ""}`}
                style={{
                  alignSelf: isMine ? "flex-end" : "flex-start",
                  marginTop: groupedWithPrev ? 2 : 10,
                  borderRadius: 18,
                  outline: selecting && selectedIds.has(m.id) ? `2px solid var(--bb-leaf)` : flashId === m.id ? `2px solid ${coral}` : "none",
                  outlineOffset: 2,
                  transition: "outline-color .3s",
                }}
                onClick={selecting && typeof m.id !== "string" && !isDeleted ? () => toggleSelected(m.id) : undefined}
                {...(!selecting && !isDeleted && typeof m.id !== "string" ? longPress(m) : {})}
              >
                {repliedMessage && !isDeleted && (
                  <div
                    role={repliedMessageDeleted ? undefined : "button"}
                    tabIndex={repliedMessageDeleted ? undefined : 0}
                    aria-label={repliedMessageDeleted ? undefined : "Aller au message cité"}
                    onClick={repliedMessageDeleted || selecting ? undefined : () => jumpToMessage(repliedMessage.id)}
                    onKeyDown={repliedMessageDeleted ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jumpToMessage(repliedMessage.id); } }}
                    className={`text-xs px-3 py-1.5 rounded-xl mb-1 truncate${repliedMessageDeleted ? "" : " cursor-pointer focus-visible:outline focus-visible:outline-2"}`}
                    style={{ background: `rgba(${primaryRgb},.05)`, color: muted, maxWidth: "100%", borderLeft: `3px solid ${isMine ? "var(--bb-leaf)" : coral}` }}
                  >
                    {/* Le message cité peut avoir été supprimé (pour tout le
                        monde, deleted_at) OU pour moi seul (deleted_for) après
                        coup : ne jamais réafficher son contenu d'origine dans
                        les deux cas, sinon l'une ou l'autre suppression est
                        contournée via l'aperçu de réponse. */}
                    ↳ {repliedMessageDeleted ? "Message supprimé" : messagePreviewLabel(repliedMessage)}
                  </div>
                )}
                <div
                  className={`motion-safe:transition-opacity text-sm${isCompactMedia ? " relative" : " flex items-end gap-1.5"}`}
                  style={{
                    pointerEvents: selecting ? "none" : undefined,
                    ...(isSticker || isDeleted
                      ? {}
                      : {
                          // Bulle envoyée en vert feuille plein (retrait de
                          // l'orange terracotta de l'interface — l'ancien
                          // dégradé or virait à l'orange via --bb-gold-2).
                          // Texte blanc : #fff sur #1F7A5A = 5.3:1 (AA OK).
                          background: isMine ? "var(--bb-leaf)" : bg,
                          color: isMine ? "#fff" : body,
                          fontWeight: isMine ? 500 : undefined,
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
                    <div className="min-w-0">
                      {m.media_meta?.forwarded === true && (
                        <div className="text-[10px] italic flex items-center gap-1 mb-0.5" style={{ opacity: 0.75 }}><Forward size={10} aria-hidden="true" /> Transféré</div>
                      )}
                      <MessageBubbleMedia m={m} isMine={isMine} onOpenImage={openImageGallery} />
                    </div>
                  ) : (
                    <span dir="auto" className="whitespace-pre-wrap break-words min-w-0">
                      {m.media_meta?.forwarded === true && (
                        <span className="text-[10px] italic flex items-center gap-1 mb-0.5" style={{ opacity: 0.75 }}><Forward size={10} aria-hidden="true" /> Transféré</span>
                      )}
                      <MessageText text={m.text} highlight={searchOpen ? searchQuery : ""} />
                    </span>
                  )}
                  {!isSticker && !isDeleted && (
                    <span
                      className="text-[10px] flex-shrink-0 flex items-center gap-0.5"
                      // Photo/vidéo : l'heure se superpose à l'image (pastille sombre,
                      // comme WhatsApp) au lieu de partager la ligne avec elle — sur un
                      // écran de 375 px elle faisait rétrécir la photo à ~170 px.
                      style={isCompactMedia
                        ? { position: "absolute", right: 10, bottom: 10, background: "rgba(0,0,0,.5)", color: "#fff", padding: "1px 6px", borderRadius: 999, whiteSpace: "nowrap", pointerEvents: "none" }
                        : { opacity: 0.7, whiteSpace: "nowrap" }}
                    >
                      {formatMessageTime(m.created_at)}
                      {isMine && m._status !== "failed" && (() => {
                        // Couleur de « lu » : bleu #7FC7FF conservé (convention
                        // universelle des accusés de lecture — la garder évite
                        // toute ambiguïté avec le vert d'identité des bulles).
                        // Passage « envoyé » → « lu » : fondu croisé + léger
                        // glissement de la 2e coche, plutôt qu'un remplacement
                        // sec. prefers-reduced-motion couvert par la règle
                        // globale d'index.html.
                        // Logique extraite dans lib/messageDeliveryState.js (pure,
                        // testée en isolation) — voir son en-tête pour le détail
                        // des 3 états et de la réciprocité de confidentialité.
                        const checkState = getMessageCheckState({ readAt: m.read_at, showReadReceipts: currentUser.show_read_receipts, otherOnline });
                        const read = checkState === "read";
                        const delivered = checkState === "delivered";
                        const showDouble = read || delivered;
                        return (
                          <span className="relative inline-flex flex-shrink-0" style={{ width: 12, height: 12 }}>
                            <Check
                              size={12}
                              aria-label={showDouble ? undefined : "Envoyé"}
                              aria-hidden={showDouble ? "true" : undefined}
                              style={{ position: "absolute", inset: 0, opacity: showDouble ? 0 : 1, transition: "opacity .22s var(--bb-ease)" }}
                            />
                            <CheckCheck
                              size={12}
                              color={read ? "#7FC7FF" : undefined}
                              aria-label={read ? "Lu" : delivered ? "Distribué" : undefined}
                              aria-hidden={showDouble ? undefined : "true"}
                              style={{ position: "absolute", inset: 0, opacity: showDouble ? 1 : 0, transform: showDouble ? "translateX(0)" : "translateX(-2px)", transition: "opacity .22s var(--bb-ease), transform .22s var(--bb-ease), color .22s var(--bb-ease)" }}
                            />
                          </span>
                        );
                      })()}
                    </span>
                  )}
                  {!isDeleted && !selecting && typeof m.id !== "string" && (
                    <button
                      onClick={() => setOpenActionsFor(openActionsFor === m.id ? null : m.id)}
                      aria-label="Options du message"
                      aria-haspopup="menu"
                      className="bb-hit flex-shrink-0 self-start rounded-full focus-visible:outline focus-visible:outline-2"
                      style={isCompactMedia
                        ? { position: "absolute", top: 8, right: 8, opacity: 1, background: "rgba(0,0,0,.45)", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }
                        : { opacity: 0.6, marginLeft: 2 }}
                    >
                      <MoreHorizontal size={14} color={isCompactMedia ? "#fff" : isMine ? bg : muted} />
                    </button>
                  )}
                </div>
                {groupedReactions.length > 0 && (
                  <div className="flex flex-wrap gap-1" style={{ justifyContent: isMine ? "flex-end" : "flex-start", marginTop: -6, marginBottom: 2, paddingInline: 8, position: "relative", zIndex: 1 }}>
                    {groupedReactions.map((r) => {
                      const isNewReaction =
                        seenReactionKeysRef.current &&
                        !seenReactionKeysRef.current.has(`${m.id}|${r.emoji}`);
                      return (
                        <button
                          key={r.emoji}
                          onClick={() => toggleReaction(m, r.emoji)}
                          aria-label={`Réaction ${r.emoji}${r.count > 1 ? ` ×${r.count}` : ""}${r.mine ? ", la tienne : toucher pour la retirer" : ""}`}
                          aria-pressed={r.mine}
                          disabled={selecting}
                          className={`bb-hit text-[13px] px-2 py-0.5 rounded-full flex items-center gap-1${isNewReaction ? " bb-reaction-pop" : ""}`}
                          style={{ background: r.mine ? "var(--bb-surface)" : bg, border: `1px solid ${r.mine ? primary : "var(--bb-border)"}`, boxShadow: "0 1px 3px rgba(0,0,0,.12)", minHeight: 24 }}
                        >
                          {r.emoji} {r.count > 1 && <span className="text-[11px] font-bold" style={{ color: muted }}>{r.count}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {!isMine && !isDeleted && m.kind === "text" && isAiEnabled() && (
                  translations[m.id] ? (
                    translations[m.id].loading ? (
                      <p className="text-xs mt-1 flex items-center gap-1" style={{ color: muted }}>
                        <Loader2 size={11} className="animate-spin" /> Traduction…
                      </p>
                    ) : translations[m.id].error ? (
                      <p className="text-xs mt-1 flex items-center gap-1.5 flex-wrap" style={{ color: coralText }}>
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
                    <button onClick={() => handleTranslate(m)} className="bb-hit text-[11px] font-bold flex items-center gap-1 mt-1" style={{ color: muted }}>
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
                      // otherUnavailable : onReply omis volontairement (pas onReact, voir
                      // plus bas) — "Répondre" mène vers une barre de saisie elle-même
                      // masquée dans ce cas, alors que réagir à un message reste possible
                      // (message_reactions_insert_own, supabase-content-account-state-
                      // block-guards-remaining-fix.sql, ne vérifie que l'état du compte de
                      // l'acteur et un blocage mutuel — jamais l'état banni/suspendu de
                      // l'autre participant — donc une réaction aboutit réellement).
                      onReply={otherUnavailable ? undefined : () => setReplyingTo(m)}
                      onCopy={() => navigator.clipboard?.writeText(m.text || "")}
                      onForward={() => setForwardPending([m])}
                      onSelect={() => startSelection(m)}
                      onReport={onOpenReport ? () => onOpenReport(activeMatch) : undefined}
                      onDeleteForMe={() => deleteMessageForMe(m)}
                      onDeleteForEveryone={() => handleDeleteForEveryone(m)}
                      onClose={() => setOpenActionsFor(null)}
                    />
                  </div>
                )}
              </div>
              {isMine && m._status === "failed" && m._premiumBlocked && (
                // Bug corrigé (audit paywall messagerie) : FREE_MESSAGE_LIMIT_REACHED/
                // PREMIUM_MEDIA_REQUIRED ne sont pas des échecs transitoires — un
                // simple "Réessayer" échouerait à l'identique (et re-uploaderait un
                // média en pure perte) tant que l'utilisateur n'est pas passé
                // Premium. On explique la vraie raison et on pointe directement
                // vers la page Premium plutôt que de laisser deviner.
                <div className="self-end text-xs flex flex-col items-end gap-1 mt-0.5 text-right" style={{ color: coralText }}>
                  <span>{m._error || "Action réservée aux membres Premium."}</span>
                  <span className="flex items-center gap-2">
                    {goTab && isPremiumEnabled() && (
                      <button onClick={() => goTab("premium")} className="font-bold underline" style={{ color: primary }}>
                        Passer à Premium
                      </button>
                    )}
                    {/* Reste disponible pour le cas où l'abonnement vient d'être
                        activé (webhook Stripe déjà traité) : la vérification
                        is_premium() est refaite côté serveur à chaque tentative,
                        donc réessayer après avoir souscrit fonctionne sans recharger
                        la page — voir enforce_premium_message_limits() (SQL). */}
                    <button onClick={() => retrySend(m)} className="bb-hit font-bold underline flex items-center gap-1" style={{ color: coralText }}>
                      <RotateCcw size={11} className="flex-shrink-0" /> Réessayer
                    </button>
                  </span>
                </div>
              )}
              {isMine && m._status === "failed" && !m._premiumBlocked && (
                <button onClick={() => retrySend(m)} className="bb-hit self-end text-xs font-bold flex items-center gap-1 mt-0.5 text-right" style={{ color: coralText }}>
                  <RotateCcw size={12} className="flex-shrink-0" /> {m._error || "Impossible d'envoyer le message."} Réessayer
                </button>
              )}
              {moneyCheck?.flagged && (
                // Fond fixe #FFF3F1 (pensé pour le mode clair) devenait un
                // pavé rose clair illisible sur fond sombre — remplacé par
                // les jetons réactifs au thème (comme .system-note de la
                // maquette screen-messages.html), la couleur d'alerte reste
                // sur l'icône et le texte pour rester visible dans les deux.
                <div className="max-w-[85%] text-xs px-3.5 py-2.5 rounded-2xl flex items-start gap-2" style={{ alignSelf: "flex-start", background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: coralText, marginTop: 4 }}>
                  <ShieldAlert size={15} className="flex-shrink-0 mt-0.5" />
                  <span>{moneyCheck.message}</span>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      {showJumpButton && (
        <button
          type="button"
          onClick={() => { scrollListToBottom("smooth"); nearBottomRef.current = true; setShowJumpButton(false); }}
          className="bb-fade-in absolute left-1/2 -translate-x-1/2 bottom-3 z-10 flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full text-white focus-visible:outline focus-visible:outline-2"
          style={{ background: "var(--bb-leaf)", boxShadow: "0 6px 20px rgba(31,122,90,0.4)" }}
        >
          <ArrowDown size={13} /> Nouveaux messages
        </button>
      )}
      </ChatDropZone>

      {messages.length === 0 && (
        <div className="px-4 pb-1 flex items-center gap-1.5 text-[11px] shrink-0" style={{ color: muted }}>
          <ShieldCheck size={12} /> Baobab ne te demandera jamais d'argent. Ne partage jamais tes informations bancaires.
        </div>
      )}

      {rateLimited && (
        <p className="px-4 pb-1 text-xs shrink-0" style={{ color: coralText }}>
          Tu envoies des messages très rapidement, patiente quelques secondes.
        </p>
      )}

      {/* otherUnavailable : toute la barre de composition (emoji, sticker/
      photo/vidéo, suggestions IA, champ de texte, micro/envoi) est remplacée
      par un simple message — même principe que ConversationStarters.jsx
      (commit "Masque les questions brise-glace...") et que l'omission
      d'onReply ci-dessus. Un message texte/sticker/média envoyé ici
      échouerait de toute façon : la policy RLS INSERT de "messages"
      (supabase-target-account-state-guards-CONSOLIDATED-fix.sql) vérifie déjà
      banned_at/suspended_until des DEUX participants, pas seulement de
      l'expéditeur. Mais laisser la barre pleinement active jusqu'à cet échec
      est doublement trompeur : (1) l'en-tête affiche déjà "Ce compte n'est
      plus disponible" juste au-dessus, et (2) l'échec retomberait sur le
      message générique "Impossible d'envoyer le message." (friendlyDbError
      ne reconnaît que le code Postgres P0001 des exceptions applicatives
      [limites Premium...] — un rejet RLS est un code 42501 tout différent,
      donc jamais traduit) avec un "Réessayer" qui échouera indéfiniment à
      l'identique, au lieu d'expliquer la vraie raison comme pour
      FREE_MESSAGE_LIMIT_REACHED/PREMIUM_MEDIA_REQUIRED un peu plus haut.
      Mieux vaut ne jamais tenter l'envoi puisque banned_at/suspended_until
      sont déjà connus côté client (activeMatch). Le champ de recherche, le
      menu "Options de la conversation", la traduction et les réactions
      restent fonctionnels (lecture d'historique / réaction déjà couverte par
      sa propre policy RLS, voir onReply juste au-dessus). */}
      {otherUnavailable ? (
        <div
          className="px-4 py-3 flex items-center gap-2 text-xs shrink-0 sticky bottom-0 bg-[var(--bb-surface)]"
          style={{ borderTop: `1px solid rgba(${primaryRgb},.08)`, color: coralText, paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Ban size={14} className="flex-shrink-0" />
          Ce compte n'est plus disponible : tu ne peux plus lui écrire.
        </div>
      ) : (
        <>
          {showCoordsNudge && (
            <div className="px-4 pt-2 flex items-start gap-2 shrink-0 bg-[var(--bb-surface)]" style={{ borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <MapPin size={13} className="flex-shrink-0 mt-0.5" color={coral} />
              <span className="text-xs flex-1" style={{ color: coralText }}>Sur le point de partager tes coordonnées ? Pour une première rencontre, privilégie un lieu public.</span>
              <button onClick={() => setCoordsNudgeDismissed(true)} aria-label="Ignorer ce rappel" className="bb-hit flex-shrink-0"><X size={13} color={muted} /></button>
            </div>
          )}

          {replyingTo && (
            <div className="px-4 pt-2 flex items-center justify-between gap-2 shrink-0 bg-[var(--bb-surface)]" style={{ borderTop: `1px solid rgba(${primaryRgb},.08)` }}>
              <div className="min-w-0 flex items-center gap-1.5 text-xs" style={{ color: muted }}>
                <Reply size={12} className="flex-shrink-0" />
                <span className="truncate">Réponse à : {messagePreviewLabel(replyingTo)}</span>
              </div>
              <button onClick={() => setReplyingTo(null)} aria-label="Annuler la réponse" className="bb-hit flex-shrink-0">
                <X size={14} color={muted} />
              </button>
            </div>
          )}

          {/* ai_suggestions_enabled vérifié (bug corrigé à l'audit, même famille que
          EditProfileForm/CommunityCreateForm/EventCreateForm/PostComposerModal) :
          PrivacyFieldsModal promet explicitement de couvrir "bio, publications,
          conversations…" et l'Edge Function ai-assist refuse déjà la requête
          côté serveur (profile.ai_suggestions_enabled === false), mais ce bouton
          de reformulation restait affiché ici — un utilisateur ayant désactivé
          le réglage cliquait dans le vide et recevait une erreur au lieu de ne
          pas voir le bouton du tout. */}
          {!recorderActive && messageDraft.trim() && currentUser?.ai_suggestions_enabled !== false && (
            <div className="px-4 pt-2 shrink-0 bg-[var(--bb-surface)]">
              <AiSuggestButton
                action="reformulate_message"
                buildPayload={() => ({ text: messageDraft })}
                onApply={(text) => setMessageDraft(truncateUnicodeSafe(text, 4000))}
                label="Reformuler avec l'IA"
              />
            </div>
          )}
          <div className="bb-composer-bar p-4 flex gap-2 items-end shrink-0 sticky bottom-0 bg-[var(--bb-surface)]" style={{ borderTop: replyingTo ? "none" : `1px solid rgba(${primaryRgb},.08)`, paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
            {/* truncateUnicodeSafe(…, 4000) : comme pour la reformulation IA et les suggestions IA
                ci-dessus, l'ajout d'un emoji passe par setMessageDraft() en dehors de l'événement
                onChange du textarea, donc l'attribut maxLength du textarea (saisie clavier) ne
                s'applique pas ici — sans troncature explicite, un emoji ajouté à un brouillon déjà
                proche de 4000 caractères pouvait dépasser la limite envoyée au serveur. La version
                "safe" évite en plus de couper l'emoji tout juste ajouté en deux s'il chevauche la
                limite (paire surrogate coupée en son milieu). */}
            {!recorderActive && <EmojiPicker onPick={(emoji) => setMessageDraft((d) => truncateUnicodeSafe(d + emoji, 4000))} currentUserId={currentUser.id} />}
            {!recorderActive && (
              <MessageMediaPicker
                onPickFile={(file, kind) => guardedSend(sendMediaMessage)(file, kind)}
                onPickSticker={(sticker) => guardedSend(sendStickerMessage)(sticker)}
              />
            )}
            {/* ai_suggestions_enabled vérifié (bug corrigé à l'audit, même famille que
            EditProfileForm/CommunityCreateForm/EventCreateForm/PostComposerModal) :
            même défaut que la reformulation ci-dessus, sur le bouton "Suggestions IA". */}
            {!recorderActive && currentUser?.ai_suggestions_enabled !== false && (
              <AiConversationSuggestions currentUser={currentUser} match={activeMatch} onPick={(text) => setMessageDraft(truncateUnicodeSafe(text, 4000))} />
            )}
            {!recorderActive && (
              <textarea
                dir="auto"
                value={messageDraft}
                onChange={(e) => { setMessageDraft(e.target.value); broadcastTyping(); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); handleSend(); }
                }}
                placeholder="Écris un message..."
                aria-label="Écrire un message"
                rows={1}
                maxLength={4000}
                // min-w-0 : sans lui, le <textarea> (flex-1) garde son
                // min-width:auto par défaut — dérivé de son attribut "cols"
                // implicite (~20 caractères) — et refuse de rétrécir sous cette
                // largeur. Avec emoji + pièce jointe + IA + micro/envoi à côté
                // (~216px de boutons fixes + paddings/gaps), ça dépassait déjà la
                // largeur d'un écran de 320-375px avant même que le texte soit
                // pris en compte, débordant la barre de saisie hors de l'écran.
                className="bb-composer-input flex-1 min-w-0 text-sm rounded-2xl px-4 py-3 outline-none resize-none"
                style={{ background: bg, fontSize: 16, maxHeight: 120 }}
              />
            )}
            <AudioRecorder
              hasDraft={Boolean(messageDraft.trim())}
              onSendText={handleSend}
              onSendAudio={(file, meta) => guardedSend(sendMediaMessage)(file, "audio", undefined, meta)}
              onActiveChange={setRecorderActive}
              onRecordingChange={setRecordingNow}
            />
          </div>
        </>
      )}

      <ForwardModal
        open={Boolean(forwardPending)}
        matches={forwardTargets}
        excludeId={activeMatch.id}
        count={forwardPending?.length || 1}
        onClose={() => setForwardPending(null)}
        onPick={runForward}
      />
      <ConfirmModal
        open={pendingDeleteSelection}
        title={`Supprimer ${selectedMessages.length} message${selectedMessages.length > 1 ? "s" : ""} pour toi ?`}
        message="Ils disparaîtront de ta conversation uniquement. L'autre personne les verra toujours."
        confirmLabel="Supprimer"
        onCancel={() => setPendingDeleteSelection(false)}
        onConfirm={() => {
          selectedMessages.forEach((x) => deleteMessageForMe(x));
          setPendingDeleteSelection(false);
          exitSelection();
        }}
      />
      <ConfirmModal
        open={Boolean(pendingDeleteForEveryone)}
        title="Supprimer ce message pour tout le monde ?"
        message="Cette action est irréversible pour les deux personnes."
        confirmLabel="Supprimer"
        onCancel={() => setPendingDeleteForEveryone(null)}
        onConfirm={() => {
          deleteMessageForEveryone(pendingDeleteForEveryone);
          setPendingDeleteForEveryone(null);
        }}
      />
    </div>
  );
}
