import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Home, Heart, X, MessageCircle, LogOut, Settings, Cog, UserRound, Search, Bell, Users2, PartyPopper, Megaphone, Shield, Globe2, Compass } from "lucide-react";
import Avatar from "./Avatar";
import logoIcon from "../assets/logo-baobab-icon.png";
import { supabase } from "../supabaseClient";
import { matchKey, visibleAge } from "../utils/format";
import { useClickOutside } from "../hooks/useClickOutside";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { primary, navy, coral, gold, bg, muted, buttonBase, body, primaryRgb } from "./social/theme";
import { NOTIFICATION_LABELS, NOTIF_CATEGORIES, groupNotificationRows } from "../lib/notificationLabels";
import Skeleton from "./Skeleton";
import FeedTab from "./social/FeedTab";
import DiscoverTab from "./social/DiscoverTab";
import MessagesTab from "./social/MessagesTab";
import ProfileTab from "./social/ProfileTab";
import StoryViewerModal from "./social/StoryViewerModal";
import StoryComposerModal from "./social/StoryComposerModal";
import PublicProfileModal from "./social/PublicProfileModal";
import FavoritesModal from "./social/FavoritesModal";
import AdmirersModal from "./social/AdmirersModal";
import MatchPreferencesModal from "./social/MatchPreferencesModal";
import { validateMediaFile } from "../lib/mediaValidation";
import { extFromMime } from "../lib/mediaConstants";
import { uploadWithProgress } from "../lib/uploadWithProgress";
import { beginCriticalOperation, endCriticalOperation } from "../lib/criticalOperationGuard";
import { trackBetaEvent } from "../lib/trackBetaEvent";
import { friendlyDbError } from "../lib/friendlyDbError";
import BetaFeedbackModal from "./social/BetaFeedbackModal";
import ChunkErrorBoundary from "./ChunkErrorBoundary";
import { useHiddenRecommendations } from "../lib/useHiddenRecommendations";
import { escapeOrFilterValue } from "../lib/searchQuery";

// Chargées à la demande (item 27 de l'audit Phase 10) : ces 3 onglets sont
// visités moins souvent que Fil/Découverte/Messages/Profil au démarrage de
// session, et Premium notamment n'a aucune raison d'alourdir le chunk
// principal pour les utilisateurs qui ne l'ouvrent jamais.
const CommunitiesTab = lazy(() => import("./social/CommunitiesTab"));
const EventsTab = lazy(() => import("./social/EventsTab"));
const AdminDashboard = lazy(() => import("./admin/AdminDashboard"));
const PremiumPage = lazy(() => import("./premium/PremiumPage"));
const ImmigrationNewsView = lazy(() => import("./social/ImmigrationNewsView"));

function TabLoadingFallback() {
  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <Skeleton rows={4} height={80} gap={16} />
    </div>
  );
}

const STORY_COLORS = ["#E56B5D", "#2F8F6B", "#5667A9", "#F2B84B", "#C1613D", "#1E2A4F"];
function colorForProfile(id) {
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) hash = (hash * 31 + String(id).charCodeAt(i)) >>> 0;
  return STORY_COLORS[hash % STORY_COLORS.length];
}

// Recherche insensible aux accents/casse, support multi-mots (chaque mot
// doit apparaître quelque part, dans n'importe quel ordre) — corrige un
// bug identifié à l'audit (l'ancienne comparaison .includes() ratait
// "patrick" pour "Patrick" accentué ailleurs, et ne trouvait jamais deux
// mots dans le désordre).
const DIACRITICS_RE = /\p{Diacritic}/gu;
function normalizeForSearch(text) {
  return (text || "").normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}
function matchesSearch(profile, query) {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  // Bug corrigé à l'audit : un champ masqué (show_city/show_country/
  // show_occupation à false) était quand même comparé au texte tapé, donc
  // un profil qui avait choisi de cacher sa ville apparaissait quand même
  // dans les résultats en tapant cette ville — confirmant la donnée privée
  // par un simple test de correspondance, même si l'affichage lui-même
  // (plus bas dans ce fichier) respecte déjà show_city/show_country.
  const showCity = profile.show_city !== false;
  const showCountry = profile.show_country !== false;
  const showOccupation = profile.show_occupation !== false;
  const haystack = normalizeForSearch(
    `${profile.name} ${showCity ? profile.city || "" : ""} ${showCountry ? profile.country || "" : ""} ${showOccupation ? profile.occupation || "" : ""}`
  );
  return words.every((w) => haystack.includes(w));
}

// Onglet du fil ouvert par défaut selon l'objectif d'usage choisi à
// l'onboarding (Phase 12a) — "Rencontre" garde le comportement historique
// (Pour toi), sinon on ouvre directement sur l'onglet le plus pertinent
// pour un premier "time to value".
function defaultFeedTab(usageGoals) {
  const goals = usageGoals || "";
  const wantsRencontre = goals.includes("Rencontre");
  if (wantsRencontre) return "pourtoi";
  if (goals.includes("Communauté")) return "communautes";
  if (goals.includes("Événements")) return "local";
  return "pourtoi";
}

export default function SocialShell({
  currentUser,
  setView,
  handleSignOut,
  onError = () => {},
  myLocation = null,
  discoverGateBlocked = false,
  myPlatformRole = null,
  candidates = [],
  getMatches = () => [],
  getAdmirers = () => [],
  openChat = () => {},
  closeChat = () => {},
  handleLike = () => {},
  handleUnlike = () => {},
  hasLiked = () => false,
  handlePass = () => {},
  profilePhotos = {},
  openEditProfile = () => setView("editProfile"),
  setReportTarget = () => {},
  handleBlock = () => {},
  handleUnmatch = () => {},
  blockedIds = new Set(),
  profiles = [],
  handleSavePreferences = () => {},
  activeMatch = null,
  messages = [],
  hasMoreHistory = false,
  loadingOlder = false,
  onLoadOlder = () => {},
  messageDraft = "",
  setMessageDraft = () => {},
  broadcastTyping = () => {},
  sendMessage = () => {},
  sendMessageTo = () => {},
  sendStickerMessage = () => {},
  sendMediaMessage = () => {},
  retrySend = () => {},
  otherTyping = false,
  setSettingsOpen = () => {},
  updateAvailable = false,
  replyingTo = null,
  setReplyingTo = () => {},
  reactionsByMessageId = {},
  toggleReaction = () => {},
  deleteMessageForMe = () => {},
  deleteMessageForEveryone = () => {},
  initialTab = null,
  justSubscribed = false,
  onJustSubscribedHandled = () => {},
}) {
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [admirersOpen, setAdmirersOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  // initialTab (retour de paiement Stripe) prime sur "feed" au tout premier
  // montage seulement — un lazy initializer, pas un effet, pour ne jamais
  // faire sauter l'utilisateur vers "premium" au milieu d'une session s'il
  // change de valeur plus tard (ex. App.jsx qui la reset à null ensuite).
  const [tab, setTab] = useState(() => initialTab || "feed");
  // Suivi d'écran minimal (Phase 2 — beta privée) : un événement répété par
  // changement d'onglet, jamais bloquant (voir trackBetaEvent).
  useEffect(() => {
    if (currentUser?.id) trackBetaEvent(currentUser.id, "screen_view", { screen: tab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, currentUser?.id]);
  const [profileTab, setProfileTab] = useState("posts");
  const [feedTab, setFeedTab] = useState(() => defaultFeedTab(currentUser?.usage_goals));
  const [menu, setMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifCategory, setNotifCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [stories, setStories] = useState([
    { name: "Votre statut", initial: "+", own: true, color: primary },
  ]);
  const [storyComposer, setStoryComposer] = useState(false);
  const [storyText, setStoryText] = useState("");
  const [storyMedia, setStoryMedia] = useState(null);
  const [storyMediaKind, setStoryMediaKind] = useState("");
  const [storyMediaError, setStoryMediaError] = useState("");
  const [storyMediaWarning, setStoryMediaWarning] = useState("");
  const [storyUploading, setStoryUploading] = useState(false);
  const [storyUploadProgress, setStoryUploadProgress] = useState(0);
  const [storyBgColor, setStoryBgColor] = useState("");
  const [storyStep, setStoryStep] = useState("compose"); // compose | preview
  const [storyViewerIndex, setStoryViewerIndex] = useState(null);
  const [viewedStories, setViewedStories] = useState({});
  const [storyReply, setStoryReply] = useState("");
  const [storyDurationMs, setStoryDurationMs] = useState(5000);
  const [storyViewers, setStoryViewers] = useState([]);
  const [storyViewersLoading, setStoryViewersLoading] = useState(false);
  const [storyViewersOpen, setStoryViewersOpen] = useState(false);
  const [storyViewCount, setStoryViewCount] = useState(0);
  const [myStoryReaction, setMyStoryReaction] = useState(null);
  // Id de la story actuellement affichée, tenu à jour de façon synchrone
  // (contrairement à storyViewerIndex, dont la mise à jour via un swipe
  // rapide peut arriver après la résolution d'une requête réseau lancée pour
  // la story précédente) — sert à ignorer les réponses tardives ci-dessous.
  const activeStoryIdRef = useRef(null);
  // Jeton anti-course pour openChatWithProfileId (voir plus bas) : cliquer
  // vite sur deux notifications "nouveau message" différentes dont les deux
  // cibles nécessitent le repli réseau (absentes de profiles/candidates/
  // matches) pouvait laisser la réponse la plus lente écraser openChat()
  // avec le mauvais profil après celle de la cible réellement cliquée en
  // dernier — même famille de bug que goDetail() (CommunitiesTab/EventsTab).
  const openChatRequestRef = useRef(0);
  const [viewedProfileId, setViewedProfileId] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  // Profils complets récupérés via jointure directe sur "favorites" (même
  // correctif que followedProfilesRaw plus bas) — un profil mis en favori
  // hors du cache local "profiles" (plafonné à 500 lignes, triées par
  // ancienneté) ne doit jamais disparaître silencieusement de la modale
  // "Mes favoris".
  const [favoriteProfilesRaw, setFavoriteProfilesRaw] = useState([]);
  const storyPhotoInputRef = useRef(null);
  const storyVideoInputRef = useRef(null);
  // Garde anti double-soumission pour addStory() — même pattern que
  // publishingRef dans PostsFeed.jsx. Le bouton "Publier" ne se désactive
  // qu'après le re-rendu déclenché par setStoryUploading(true), donc un
  // double-tap rapide (fréquent au doigt sur mobile) pouvait déclencher
  // addStory() une seconde fois avant que le state React n'ait eu le temps
  // de se propager, créant deux statuts identiques (et deux uploads média).
  const storyPublishingRef = useRef(false);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const menuRef = useRef(null);
  const notifPillRefs = useRef({});
  const notifTouchStartRef = useRef(null);

  // Repart toujours de l'étape "compose" à l'ouverture (que ce soit via
  // openStory ci-dessous ou le bouton "+" de FeedTab.jsx, qui appelle le
  // même setStoryComposer) — sinon un statut publié puis rouvert pourrait
  // rester coince sur l'etape "preview" precedente.
  useEffect(() => {
    if (storyComposer) setStoryStep("compose");
  }, [storyComposer]);

  const notifCatKeys = NOTIF_CATEGORIES.map(([k]) => k);
  useEffect(() => {
    notifPillRefs.current[notifCategory]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [notifCategory]);
  const onNotifTouchStart = (e) => {
    const t = e.touches[0];
    notifTouchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onNotifTouchEnd = (e) => {
    if (!notifTouchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - notifTouchStartRef.current.x;
    const dy = t.clientY - notifTouchStartRef.current.y;
    notifTouchStartRef.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    const idx = notifCatKeys.indexOf(notifCategory);
    if (dx < 0 && idx < notifCatKeys.length - 1) setNotifCategory(notifCatKeys[idx + 1]);
    else if (dx > 0 && idx > 0) setNotifCategory(notifCatKeys[idx - 1]);
  };

  useClickOutside(searchRef, Boolean(search), () => setSearch(""));
  useClickOutside(notifRef, notificationsOpen, () => setNotificationsOpen(false));
  useClickOutside(menuRef, menu, () => setMenu(false));
  useEscapeKey(notificationsOpen, () => setNotificationsOpen(false));
  useEscapeKey(menu, () => setMenu(false));
  useEscapeKey(Boolean(search), () => setSearch(""));

  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    supabase
      .from("stories")
      .select("id, profile_id, text, media_url, media_kind, bg_color, created_at, profile:profile_id(name, avatar_url)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error); return; }
        const seen = new Set();
        const latestPerProfile = [];
        for (const row of data || []) {
          if (seen.has(row.profile_id)) continue;
          seen.add(row.profile_id);
          latestPerProfile.push(row);
        }
        const ownIdx = latestPerProfile.findIndex((s) => s.profile_id === currentUser.id);
        const ownRow = ownIdx >= 0 ? latestPerProfile.splice(ownIdx, 1)[0] : null;
        const toEntry = (row, isOwn) => {
          const name = isOwn ? (currentUser.name || "Toi") : (row.profile?.name || "?");
          const profileId = isOwn ? currentUser.id : row.profile_id;
          return {
            id: row?.id,
            profile_id: profileId,
            own: isOwn,
            name,
            initial: (isOwn ? (currentUser.name || "?") : name).trim().charAt(0).toUpperCase(),
            color: colorForProfile(profileId),
            text: row?.text || "",
            media_url: row?.media_url || null,
            media_kind: row?.media_kind || null,
            bg_color: row?.bg_color || null,
            created_at: row?.created_at || null,
          };
        };
        setStories([toEntry(ownRow, true), ...latestPerProfile.map((r) => toEntry(r, false))]);
      });
    return () => { alive = false; };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    supabase
      .from("favorites")
      // show_city ajouté (bug corrigé à l'audit) : FavoritesModal affichait la
      // ville d'un favori sans jamais pouvoir consulter ce réglage, absent de
      // cette jointure — voir le garde ajouté côté FavoritesModal.jsx.
      .select("to_id, profile:to_id(id,name,avatar_url,city,show_city,age,show_birth_year,looking_for,email_verified,phone_verified)")
      .eq("from_id", currentUser.id)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        setFavoriteIds(new Set((data || []).map((r) => r.to_id)));
        setFavoriteProfilesRaw((data || []).map((r) => r.profile).filter(Boolean));
      });
    return () => { alive = false; };
  }, [currentUser]);

  const favoriteInFlightRef = useRef(new Set()); // profile.id en cours de bascule — évite un double clic = double insert/delete

  const toggleFavorite = async (profile) => {
    if (!currentUser || favoriteInFlightRef.current.has(profile.id)) return;
    favoriteInFlightRef.current.add(profile.id);
    const isFav = favoriteIds.has(profile.id);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      isFav ? next.delete(profile.id) : next.add(profile.id);
      return next;
    });
    // favoriteProfilesRaw alimente la modale "Mes favoris" (voir déclaration
    // plus haut) ; sans cette mise à jour ici, un ajout aux favoris d'un
    // profil absent du cache local "profiles" resterait invisible dans la
    // modale jusqu'au prochain rechargement complet de la page.
    setFavoriteProfilesRaw((prev) =>
      isFav
        ? prev.filter((p) => p.id !== profile.id)
        : (prev.some((p) => p.id === profile.id) ? prev : [profile, ...prev])
    );
    try {
      if (isFav) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("from_id", currentUser.id)
          .eq("to_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ from_id: currentUser.id, to_id: profile.id });
        if (error) throw error;
      }
    } catch (e) {
      console.error(e.message, e.code, e.details, e.hint);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        isFav ? next.add(profile.id) : next.delete(profile.id);
        return next;
      });
      setFavoriteProfilesRaw((prev) =>
        isFav
          ? (prev.some((p) => p.id === profile.id) ? prev : [profile, ...prev])
          : prev.filter((p) => p.id !== profile.id)
      );
      onError("Impossible de mettre à jour tes favoris.");
    } finally {
      favoriteInFlightRef.current.delete(profile.id);
    }
  };

  const [followingIds, setFollowingIds] = useState(new Set()); // qui JE suis
  const [followerIds, setFollowerIds] = useState(new Set()); // qui ME suit
  // Profils complets récupérés via jointure directe sur "follows" (pas un
  // filtrage du cache local "profiles", plafonné à 500 lignes — un profil
  // suivi/suiveur hors de ce cache ne doit jamais disparaître silencieusement
  // des listes "Suivis"/"Mon réseau").
  const [followedProfilesRaw, setFollowedProfilesRaw] = useState([]);
  const [followerProfilesRaw, setFollowerProfilesRaw] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    // show_city ajouté (bug corrigé à l'audit) : ProfileTab affichait la ville
    // des abonnements/abonnés sans jamais pouvoir consulter ce réglage, absent
    // de cette jointure — voir le garde ajouté côté ProfileTab.jsx. (Le champ
    // show_birth_year manque toujours ici — fuite mineure déjà identifiée et
    // suivie séparément, hors périmètre de cette correction.)
    Promise.all([
      supabase.from("follows").select("to_id, profile:to_id(id,name,avatar_url,city,show_city,age,looking_for,email_verified,phone_verified)").eq("from_id", currentUser.id).limit(2000),
      supabase.from("follows").select("from_id, profile:from_id(id,name,avatar_url,city,show_city,age,looking_for,email_verified,phone_verified)").eq("to_id", currentUser.id).limit(2000),
    ]).then(([followingRes, followersRes]) => {
      if (!alive) return;
      if (followingRes.error) console.error(followingRes.error.message, followingRes.error.code, followingRes.error.details, followingRes.error.hint);
      else {
        setFollowingIds(new Set((followingRes.data || []).map((r) => r.to_id)));
        setFollowedProfilesRaw((followingRes.data || []).map((r) => r.profile).filter(Boolean));
      }
      if (followersRes.error) console.error(followersRes.error.message, followersRes.error.code, followersRes.error.details, followersRes.error.hint);
      else {
        setFollowerIds(new Set((followersRes.data || []).map((r) => r.from_id)));
        setFollowerProfilesRaw((followersRes.data || []).map((r) => r.profile).filter(Boolean));
      }
    });
    return () => { alive = false; };
  }, [currentUser]);

  const followInFlightRef = useRef(new Set());

  const toggleFollow = async (profile) => {
    if (!currentUser || followInFlightRef.current.has(profile.id)) return;
    followInFlightRef.current.add(profile.id);
    const isFollowing = followingIds.has(profile.id);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      isFollowing ? next.delete(profile.id) : next.add(profile.id);
      return next;
    });
    // followedProfilesRaw alimente la liste "Abonnements" de l'onglet Profil ;
    // sans cette mise à jour ici, elle ne provenait que du fetch initial et
    // restait figée après un suivre/ne plus suivre tant que l'onglet n'était
    // pas remonté (le bouton changeait d'état mais la personne restait/
    // n'apparaissait pas dans la liste, et le compteur ne bougeait pas).
    setFollowedProfilesRaw((prev) =>
      isFollowing
        ? prev.filter((p) => p.id !== profile.id)
        : (prev.some((p) => p.id === profile.id) ? prev : [profile, ...prev])
    );
    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("from_id", currentUser.id)
          .eq("to_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ from_id: currentUser.id, to_id: profile.id });
        if (error) throw error;
      }
    } catch (e) {
      console.error(e.message, e.code, e.details, e.hint);
      setFollowingIds((prev) => {
        const next = new Set(prev);
        isFollowing ? next.add(profile.id) : next.delete(profile.id);
        return next;
      });
      setFollowedProfilesRaw((prev) =>
        isFollowing
          ? (prev.some((p) => p.id === profile.id) ? prev : [profile, ...prev])
          : prev.filter((p) => p.id !== profile.id)
      );
      onError(friendlyDbError(e) || "Impossible de mettre à jour ton abonnement.");
    } finally {
      followInFlightRef.current.delete(profile.id);
    }
  };

  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [swipeExit, setSwipeExit] = useState(null); // "like" | "pass" | null
  const [discoverPhotoIndex, setDiscoverPhotoIndex] = useState(0);
  const swipeStartRef = useRef(0);

  const matches = getMatches();
  const matchIdsKey = matches.map((m) => m.id).sort().join(",");
  const admirers = getAdmirers();

  const [lastByKey, setLastByKey] = useState({});
  const [unreadByKey, setUnreadByKey] = useState({});

  // Aperçu du dernier message + compte de non-lus par conversation — une
  // seule requête bornée, sans nouvelle table (voir plan Phase 5).
  useEffect(() => {
    if (!currentUser || !matchIdsKey) { setLastByKey({}); setUnreadByKey({}); return; }
    let alive = true;
    const keys = matchIdsKey.split(",").map((id) => matchKey(currentUser.id, id));
    supabase
      .from("messages")
      .select("id, match_key, from_id, kind, text, media_path, media_meta, created_at, read_at, deleted_at, deleted_for")
      .in("match_key", keys)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        const lastMap = {}, unreadMap = {};
        for (const m of data || []) {
          // Un message supprimé "pour moi" (deleted_for) ne doit ni servir
          // d'aperçu dans la liste des conversations, ni compter comme non
          // lu pour moi — avant ce correctif, deleted_for/deleted_at
          // n'étaient même pas sélectionnées ici, donc un message que je
          // venais de masquer de mon côté restait affiché tel quel comme
          // "dernier message" (voir aussi messagePreviewLabel, format.js,
          // pour le cas "supprimé pour tout le monde").
          const hiddenForMe = (m.deleted_for || []).includes(currentUser.id);
          if (hiddenForMe) continue;
          if (!lastMap[m.match_key]) lastMap[m.match_key] = m;
          if (m.from_id !== currentUser.id && !m.read_at) unreadMap[m.match_key] = (unreadMap[m.match_key] || 0) + 1;
        }
        setLastByKey(lastMap);
        setUnreadByKey(unreadMap);
      });
    return () => { alive = false; };
  }, [currentUser, matchIdsKey]);

  // Corrige un bug d'incohérence signalé par l'utilisateur : l'effet
  // ci-dessus ne se déclenche qu'au montage/changement de matchIdsKey (ex.
  // nouveau match) — un message envoyé/reçu dans N'IMPORTE QUELLE
  // conversation entre deux déclenchements ne rafraîchissait jamais
  // l'aperçu affiché dans la liste, qui pouvait alors ne plus correspondre
  // du tout au contenu réel de la conversation ouverte à droite. Écoute
  // désormais les messages en direct pour tenir lastByKey/unreadByKey à
  // jour sans dépendre d'un remount.
  useEffect(() => {
    if (!currentUser || !matchIdsKey) return;
    const keys = new Set(matchIdsKey.split(",").map((id) => matchKey(currentUser.id, id)));
    const channel = supabase
      .channel(`conversations-preview:${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_key=in.(${[...keys].join(",")})` },
        (payload) => {
          const mk = payload.new.match_key;
          if (!keys.has(mk)) return;
          // L'incrément de unreadByKey pour un INSERT est géré exclusivement
          // par le canal global "global-messages" plus bas : les deux canaux
          // reçoivent le même événement (la RLS de "messages" borne déjà ce
          // canal-ci aux mêmes conversations que "keys"), et incrémenter ICI
          // EN PLUS doublait le badge de non-lus à chaque message reçu (bug
          // confirmé à l'audit). Seul lastByKey reste mis à jour ici.
          setLastByKey((prev) => ({ ...prev, [mk]: payload.new }));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `match_key=in.(${[...keys].join(",")})` },
        (payload) => {
          const mk = payload.new.match_key;
          if (!keys.has(mk)) return;
          if (payload.new.read_at && !payload.old?.read_at) {
            setUnreadByKey((prev) => ({ ...prev, [mk]: Math.max(0, (prev[mk] || 0) - 1) }));
          }
          setLastByKey((prev) => (prev[mk]?.id === payload.new.id ? { ...prev, [mk]: payload.new } : prev));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser, matchIdsKey]);

  // Canal temps réel global — reçoit tout nouveau message dont l'utilisateur
  // est participant (la RLS de "messages" borne déjà la diffusion), pour que
  // la liste et les badges non lus restent à jour même hors d'une
  // conversation ouverte. Distinct du canal par-conversation dans App.jsx.
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`global-messages:${currentUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new;
        setLastByKey((prev) => {
          const existing = prev[m.match_key];
          if (existing && new Date(existing.created_at) >= new Date(m.created_at)) return prev;
          return { ...prev, [m.match_key]: m };
        });
        if (m.from_id !== currentUser.id) {
          setUnreadByKey((prev) => ({ ...prev, [m.match_key]: (prev[m.match_key] || 0) + 1 }));
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [currentUser]);

  // La conversation ouverte est marquée lue côté serveur par App.jsx —
  // on reflète ça immédiatement ici pour que le badge ne reste pas bloqué.
  useEffect(() => {
    if (!activeMatch || !currentUser) return;
    const key = matchKey(currentUser.id, activeMatch.id);
    setUnreadByKey((prev) => (prev[key] ? { ...prev, [key]: 0 } : prev));
  }, [activeMatch, currentUser, messages.length]);

  // Aperçu de liste (lastByKey) mis à jour en local dès qu'un message est
  // envoyé/reçu dans la conversation ouverte — ne dépend plus uniquement du
  // canal Realtime global ci-dessus (constaté en test manuel : l'aperçu ne
  // se mettait pas à jour pour ses propres messages envoyés tant qu'on ne
  // rechargeait pas la page).
  useEffect(() => {
    if (!activeMatch || !currentUser || messages.length === 0) return;
    const key = matchKey(currentUser.id, activeMatch.id);
    const lastRaw = messages[messages.length - 1];
    if (!lastRaw || lastRaw.id?.toString().startsWith("temp-")) return;
    // Un message que je viens de supprimer "pour moi" (deleted_for) reste
    // dans ce tableau brut — seul l'affichage le filtre (voir
    // ConversationPane.jsx, visibleMessages). Le prendre tel quel ici le
    // faisait réapparaître avec son contenu original dans l'aperçu de la
    // liste de conversations juste après l'avoir masqué de mon côté ; on
    // retombe donc sur le message le plus récent qui reste visible pour moi.
    const latest = [...messages].reverse().find((m) => !(m.deleted_for || []).includes(currentUser.id));
    if (!latest) return;
    setLastByKey((prev) => {
      const existing = prev[key];
      if (existing && new Date(existing.created_at) >= new Date(latest.created_at)) return prev;
      return { ...prev, [key]: latest };
    });
  }, [activeMatch, currentUser, messages]);

  // Ouvrir un chat depuis n'importe où (célébration de match, carte, etc.)
  // doit toujours amener sur l'onglet Messages.
  useEffect(() => {
    if (activeMatch) setTab("matches");
  }, [activeMatch]);

  const [incomingFavoritesCount, setIncomingFavoritesCount] = useState(0);
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    supabase
      .from("favorites")
      .select("from_id", { count: "exact", head: true })
      .eq("to_id", currentUser.id)
      .then(({ count, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        setIncomingFavoritesCount(count || 0);
      });
    return () => { alive = false; };
  }, [currentUser]);

  // Notifications — table réelle et persistée (voir supabase-communities.sql,
  // supabase-notifications-persistence.sql), couvre désormais aussi
  // like/match/message (auparavant "recentEvents", un state React local
  // perdu au rechargement — retiré, remplacé par ce même mécanisme).
  // "communityNotifications" alimente la LISTE affichée dans le menu (elle
  // reste visible tant que le menu est ouvert, même une fois marquée lue) ;
  // "unreadCommunityCount" pilote uniquement le badge, remis à zéro dès
  // l'ouverture du menu sans faire disparaître la liste sous les yeux.
  const [communityNotifications, setCommunityNotifications] = useState([]);
  const [unreadCommunityCount, setUnreadCommunityCount] = useState(0);
  useEffect(() => {
    if (!currentUser) { setCommunityNotifications([]); setUnreadCommunityCount(0); return; }
    let alive = true;
    supabase
      .from("notifications")
      .select("id, type, community_id, target_type, target_id, actor_id, read_at, created_at, actor:actor_id(name, avatar_url)")
      .eq("recipient_id", currentUser.id)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        setCommunityNotifications(data || []);
        setUnreadCommunityCount((data || []).length);
      });
    const channel = supabase
      .channel(`notifications:${currentUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${currentUser.id}` }, (payload) => {
        setCommunityNotifications((prev) => [payload.new, ...prev].slice(0, 20));
        setUnreadCommunityCount((n) => n + 1);
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [currentUser]);

  // Les badges partagent le même compteur brut/mécanisme de remise à zéro
  // (markCommunityNotificationsRead) — répartition par "type" explicite
  // (pas par target_type) : new_follower/new_like/new_match partagent
  // tous target_type="profile", donc seul le type permet de les distinguer.
  // Filtrage par préférences de notifications — appliqué à l'affichage
  // seulement (les lignes restent écrites en base, voir décision de
  // périmètre du rapport final). Une clé absente = catégorie activée.
  const notifPrefs = currentUser?.notification_preferences || {};
  const prefEnabled = (key) => notifPrefs[key] !== false;
  // Un blocage (dans un sens ou l'autre) doit masquer toute notification dont
  // l'auteur est la personne bloquée — sinon un "X t'a aimé"/"X te suit"/"X
  // t'a envoyé un message" antérieur au blocage reste affiché avec nom/avatar
  // cliquables (setViewedProfileId/openChatWithProfileId plus bas), ce qui
  // recontourne exactement le filtrage blockedIds appliqué partout ailleurs
  // (DiscoverTab, PostsFeed, CommunitiesTab, recherche, abonnés...).
  const visibleCommunityNotifications = communityNotifications.filter((n) => !n.actor_id || !blockedIds.has(n.actor_id));
  const unreadEventNotifications = prefEnabled("events") ? visibleCommunityNotifications.filter((n) => n.target_type === "event") : [];
  const unreadFollowNotifications = prefEnabled("follows") ? visibleCommunityNotifications.filter((n) => n.type === "new_follower") : [];
  const unreadDatingNotifications = visibleCommunityNotifications.filter((n) =>
    (n.type === "new_like" && prefEnabled("likes")) || (n.type === "new_match" && prefEnabled("match"))
  );
  const unreadMessageNotifications = prefEnabled("messages") ? visibleCommunityNotifications.filter((n) => n.type === "new_message") : [];
  const unreadCommunityNotifications = prefEnabled("communities") ? visibleCommunityNotifications.filter((n) =>
    n.target_type !== "event" && n.type !== "new_follower" && n.type !== "new_like" && n.type !== "new_match" && n.type !== "new_message"
  ) : [];
  // Bug corrigé à l'audit : ces badges se basaient sur
  // `unreadCommunityCount > 0 ? X.length : 0`, c'est-à-dire la taille TOTALE
  // de la liste par catégorie dès que le compteur agrégé repassait au-dessus
  // de zéro — pas le nombre d'éléments réellement non lus de cette
  // catégorie. Or "Tout marquer comme lu" (markCommunityNotificationsRead)
  // remet le compteur agrégé à zéro sans jamais modifier read_at localement
  // sur les entrées de communityNotifications (volontaire : la liste doit
  // rester visible pendant que le menu reste ouvert, voir plus haut). Donc
  // dès qu'UNE SEULE notification d'un autre type arrivait ensuite (ex. un
  // "like" après avoir tout marqué lu), le compteur agrégé redevenait > 0 et
  // rouvrait la porte : les anciennes notifications Abonnés/Communautés/
  // Événements, pourtant déjà lues côté serveur, réapparaissaient comme
  // pastilles rouges sur ces onglets. On filtre désormais directement sur
  // read_at (mis à jour localement par markCommunityNotificationsRead
  // ci-dessous), la vraie source de vérité par élément.
  const eventsBadgeCount = unreadEventNotifications.filter((n) => !n.read_at).length;
  const communitiesBadgeCount = unreadCommunityNotifications.filter((n) => !n.read_at).length;
  const followsBadgeCount = unreadFollowNotifications.filter((n) => !n.read_at).length;
  // Même logique pour les notifications "Rencontres" (like/match) — utilisée
  // uniquement pour la pastille de la cloche ci-dessous (voir bug #2 : ce
  // type n'était compté nulle part dans la pastille du header).
  const datingBadgeCount = unreadDatingNotifications.filter((n) => !n.read_at).length;
  const [openCommunityId, setOpenCommunityId] = useState(null);

  // "Mes communautés" pour l'onglet Profil — communautés réellement
  // rejointes (jamais inventées), rechargé à chaque retour sur l'onglet.
  const [myCommunities, setMyCommunities] = useState([]);
  const [myCommunitiesLoading, setMyCommunitiesLoading] = useState(false);
  useEffect(() => {
    if (!currentUser || tab !== "profile") return;
    let alive = true;
    setMyCommunitiesLoading(true);
    supabase
      .from("community_members")
      .select("role, communities(id, name, category, city, cover_url, visibility)")
      .eq("profile_id", currentUser.id)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); setMyCommunitiesLoading(false); return; }
        setMyCommunities((data || []).filter((r) => r.communities).map((r) => ({ ...r.communities, role: r.role })));
        setMyCommunitiesLoading(false);
      });
    return () => { alive = false; };
  }, [currentUser, tab]);

  // "Mes événements" pour l'onglet Profil — événements à venir réellement
  // rejoints/organisés (jamais inventés), respecte profiles.show_upcoming_events.
  const [myUpcomingEvents, setMyUpcomingEvents] = useState([]);
  const [myUpcomingEventsLoading, setMyUpcomingEventsLoading] = useState(false);
  const [openEventId, setOpenEventId] = useState(null);
  // Bug identifié à l'audit : le bouton "Créer un événement" de l'onglet
  // "Événements" d'une communauté (CommunityDetailView) appelait onOpenEvents()
  // SANS l'id de la communauté — il atterrissait sur l'accueil générique de
  // l'onglet Événements, la communauté d'origine perdue en route (il fallait
  // recliquer "Créer" puis choisir soi-même la bonne communauté dans le menu
  // déroulant du formulaire, en pensant en plus à changer la visibilité sur
  // "Communauté"). createEventCommunityId porte cet id jusqu'à EventsTab pour
  // ouvrir directement le formulaire, communauté déjà présélectionnée.
  const [createEventCommunityId, setCreateEventCommunityId] = useState(null);
  useEffect(() => {
    if (!currentUser || tab !== "profile" || currentUser.show_upcoming_events === false) { setMyUpcomingEvents([]); return; }
    let alive = true;
    setMyUpcomingEventsLoading(true);
    supabase
      .from("event_attendees")
      .select("status, events(id, title, category, city, cover_url, event_date, canceled_at, timezone)")
      .eq("profile_id", currentUser.id)
      .in("status", ["going", "interested", "waitlisted"])
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); setMyUpcomingEventsLoading(false); return; }
        const upcoming = (data || [])
          .filter((r) => r.events && !r.events.canceled_at && new Date(r.events.event_date) >= new Date())
          .map((r) => r.events)
          .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
        setMyUpcomingEvents(upcoming);
        setMyUpcomingEventsLoading(false);
      });
    return () => { alive = false; };
  }, [currentUser, tab]);

  // Marque UNE notification comme lue — appelé quand l'utilisateur clique
  // dessus pour ouvrir son contenu (chat/profil/communauté/événement), pas
  // seulement via "Tout marquer comme lu". La liste étant déjà filtrée sur
  // read_at is null côté requête, la retirer localement suffit à la faire
  // disparaître du badge/dropdown sans recharger.
  const markOneNotificationRead = (id) => {
    const removed = communityNotifications.find((n) => n.id === id);
    setCommunityNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCommunityCount((n) => Math.max(0, n - 1));
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).then(({ error }) => {
      if (error) {
        console.error(error.message, error.code, error.details, error.hint);
        // Échec côté serveur : la notification est en fait toujours non lue,
        // on la remet dans la liste et on ré-incrémente le badge pour ne pas
        // désynchroniser l'affichage de l'état réel en base.
        if (removed) setCommunityNotifications((prev) => (prev.some((n) => n.id === id) ? prev : [removed, ...prev]));
        setUnreadCommunityCount((n) => n + 1);
      }
    });
  };

  const markCommunityNotificationsRead = () => {
    if (unreadCommunityCount === 0 || !currentUser) return;
    const ids = communityNotifications.filter((n) => !n.read_at).map((n) => n.id);
    const previousCount = unreadCommunityCount;
    const nowIso = new Date().toISOString();
    setUnreadCommunityCount(0);
    // Marque aussi read_at localement (sans retirer les entrées du tableau,
    // qui doit rester affiché tel quel pendant que le menu reste ouvert) —
    // faute de quoi eventsBadgeCount/communitiesBadgeCount/followsBadgeCount
    // ci-dessus recomptaient ces entrées comme non lues dès qu'une nouvelle
    // notification d'un autre type rouvrait le compteur agrégé (bug corrigé
    // à l'audit, voir commentaire au-dessus de ces trois constantes).
    setCommunityNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: nowIso } : n)));
    if (ids.length === 0) return;
    supabase.from("notifications").update({ read_at: nowIso }).in("id", ids).then(({ error }) => {
      if (error) {
        console.error(error.message, error.code, error.details, error.hint);
        // Échec côté serveur : les notifications sont toujours non lues,
        // on restaure le badge et le read_at local pour refléter l'état réel
        // en base (sinon les badges resteraient éteints à tort).
        setUnreadCommunityCount(previousCount);
        setCommunityNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read_at: null } : n)));
      }
    });
  };

  const totalUnreadMessages = Object.values(unreadByKey).reduce((sum, n) => sum + n, 0);

  const [fetchedViewedProfile, setFetchedViewedProfile] = useState(null);

  useEffect(() => {
    const localHit = viewedProfileId
      ? profiles.find((p) => p.id === viewedProfileId) || [...candidates, ...matches].find((p) => p.id === viewedProfileId)
      : null;
    if (!viewedProfileId || localHit) { setFetchedViewedProfile(null); return; }
    let alive = true;
    supabase.from("profiles").select("*").eq("id", viewedProfileId).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
      setFetchedViewedProfile(data);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedProfileId]);

  const viewedProfile = viewedProfileId
    ? profiles.find((p) => p.id === viewedProfileId)
      || [...candidates, ...matches].find((p) => p.id === viewedProfileId)
      || fetchedViewedProfile
      || null
    : null;
  const viewedProfileIsMatch = viewedProfile ? matches.some((m) => m.id === viewedProfile.id) : false;
  const viewedProfileIsLiked = viewedProfile && currentUser ? hasLiked(currentUser.id, viewedProfile.id) : false;

  // Ferme la fiche profil quand un like effectué depuis cette même fiche
  // vient de produire un match — sinon MatchCelebrationModal (App.jsx)
  // s'affiche empilée par-dessus PublicProfileModal au lieu de la remplacer.
  // Ne se déclenche que sur la transition non-match -> match du profil
  // actuellement ouvert (pas à l'ouverture d'une fiche déjà matchée).
  const prevViewedMatchStateRef = useRef({ id: null, isMatch: false });
  useEffect(() => {
    const prev = prevViewedMatchStateRef.current;
    if (viewedProfileId && prev.id === viewedProfileId && viewedProfileIsMatch && !prev.isMatch) {
      setViewedProfileId(null);
    }
    prevViewedMatchStateRef.current = { id: viewedProfileId, isMatch: viewedProfileIsMatch };
  }, [viewedProfileId, viewedProfileIsMatch]);

  // Ouvre directement la conversation depuis une notification "new_message"
  // — même résolution locale-puis-réseau que viewedProfile ci-dessus, mais
  // enchaîne sur openChat au lieu d'ouvrir la modale de profil.
  async function openChatWithProfileId(id) {
    const local = profiles.find((p) => p.id === id) || candidates.find((p) => p.id === id) || matches.find((p) => p.id === id);
    if (local) { openChatRequestRef.current++; openChat(local); return; }
    // Repli réseau (cible absente du cache local) : jeton incrémenté avant le
    // fetch et revérifié après. Sans lui, cliquer sur une notification A puis,
    // avant sa résolution, sur une notification B (toutes deux hors cache)
    // pouvait ouvrir la conversation B puis voir la réponse tardive de A
    // rappeler openChat(A) et la remplacer par la mauvaise conversation.
    const requestId = ++openChatRequestRef.current;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (openChatRequestRef.current !== requestId) return;
    if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
    if (data) openChat(data);
  }
  // Un blocage (dans un sens ou l'autre) retire immédiatement le profil de
  // ces listes, même si la relation "follows"/"favorites" existe toujours en
  // base. favoriteProfiles part maintenant de favoriteProfilesRaw (jointure
  // directe sur "favorites", comme followedProfilesRaw/followerProfilesRaw
  // juste en dessous) et non plus d'un filtrage du cache local "profiles" —
  // ce cache est plafonné à 500 lignes triées par ancienneté, donc un profil
  // mis en favori mais absent de ces 500 premières lignes (n'importe quel
  // profil créé après ce plafond) disparaissait silencieusement de la
  // modale "Mes favoris" bien que le favori existait toujours en base.
  const favoriteProfiles = favoriteProfilesRaw.filter((p) => !blockedIds.has(p.id));
  const followedProfiles = followedProfilesRaw.filter((p) => !blockedIds.has(p.id));
  const followerProfiles = followerProfilesRaw.filter((p) => !blockedIds.has(p.id));
  // "stories" est chargé une seule fois (montage / changement de currentUser)
  // et n'est jamais réinterrogé quand blockPairs change en cours de session
  // — un statut déjà en cache reste donc affiché juste après avoir bloqué
  // son auteur, même si la policy RLS l'exclurait d'un prochain fetch.
  const visibleStories = stories.filter((s) => s.own || !s.profile_id || !blockedIds.has(s.profile_id));

  // ---------- Page d'accueil : données dérivées du profil réel, sans appel Supabase additionnel ----------
  const growthStages = ["Graine", "Pousse", "Jeune baobab", "Baobab en croissance", "Baobab épanoui"];
  const growthStageEmojis = ["🌱", "🌿", "🌳", "🌴", "🦒"];
  const ownPhotoCount = profilePhotos[currentUser?.id]?.length || 0;
  const profileCompletionChecks = [
    Boolean(currentUser?.avatar_url || ownPhotoCount > 0),
    Boolean(currentUser?.bio?.trim()),
    Boolean(currentUser?.occupation?.trim()),
    Boolean(currentUser?.interests?.trim()),
    ownPhotoCount >= 3,
    matches.length > 0,
  ];
  const completedSteps = profileCompletionChecks.filter(Boolean).length;
  const totalSteps = profileCompletionChecks.length;
  const growthPct = Math.round((completedSteps / totalSteps) * 100);
  const growthStageIndex = Math.min(growthStages.length - 1, Math.floor((completedSteps / totalSteps) * growthStages.length));

  const nearbyMembers = currentUser?.city
    ? candidates.filter((p) => p.city && p.city.trim().toLowerCase() === currentUser.city.trim().toLowerCase())
    : [];

  const communities = Object.entries(
    candidates.reduce((acc, p) => {
      const city = (p.city || "").trim();
      if (!city) return acc;
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // show_canada_journey vérifié (bug corrigé à l'audit) : la section "Nouveaux
  // au Canada" (FeedTab) affiche arrived_since via ProfileCard — un profil
  // ayant masqué son parcours Canada ne doit donc pas y apparaître du tout.
  const newArrivals = candidates.filter((p) => p.show_canada_journey !== false && p.arrived_since && p.arrived_since.trim());

  // Bug corrigé : "Masquer" un profil (bouton Masquer/EyeOff de MatchCard,
  // mode Grille "Pour toi") écrivait bien en base via useHiddenRecommendations,
  // mais ce hook n'était instancié que dans DiscoverTab.jsx et son filtrage
  // (hiddenIds.has(p.id)) n'était appliqué qu'à filteredForGrid, local à ce
  // mode. La pile de swipe (topPerson/filteredPeople, calculée ici) ignorait
  // totalement hiddenIds : un profil masqué depuis la grille continuait donc
  // d'apparaître dans la pile "Pile" juste après, contredisant la promesse
  // "Masquer" faite à l'utilisateur. Le hook est maintenant instancié ici et
  // ses hiddenIds excluent aussi la pile ; hiddenIds/hide redescendent en
  // props à DiscoverTab (qui n'instancie plus son propre hook).
  const { hiddenIds: hiddenProfileIds, hide: hideProfile } = useHiddenRecommendations(currentUser, "profile", onError);

  // Filtre la pile de découverte par la recherche (comportement existant,
  // inchangé de portée — reste borné à candidates) — voir searchResults
  // plus bas pour la recherche globale du menu déroulant de l'en-tête.
  const filteredPeople = candidates.filter((p) => matchesSearch(p, search) && !hiddenProfileIds.has(p.id));

  // Recherche globale (en-tête) — corrige le bug identifié à l'audit :
  // l'ancienne recherche ne portait que sur le pool de matching restant
  // (candidates), donc un profil déjà liké/matché/hors préférences était
  // introuvable même en tapant son nom exact. Ici : tous les profils
  // connus (cache déjà chargé), moins soi-même et les bloqués.
  const localSearchResults = search.trim()
    ? profiles.filter((p) => p.id !== currentUser?.id && !blockedIds.has(p.id) && matchesSearch(p, search))
    : [];

  // Le commentaire ci-dessus promet "tous les profils connus", mais
  // `profiles` (App.jsx) est plafonné à 500 lignes triées par ancienneté —
  // même bug de "disparition silencieuse" que celui déjà corrigé pour
  // favoriteProfiles/followedProfiles (voir leur commentaire dans ce même
  // fichier), appliqué ici à la recherche globale : impossible de retrouver
  // par son nom une personne inscrite après ce plafond. Complète donc les
  // résultats locaux par une requête réseau dédiée (debouncée pour ne pas
  // marteler Supabase à chaque frappe), qui ne remplace pas matchesSearch
  // (accent-insensible, multi-mots) mais rattrape au moins les profils
  // absents du cache local pour une recherche non accentuée.
  const [remoteSearchResults, setRemoteSearchResults] = useState([]);
  useEffect(() => {
    const term = search.trim();
    if (!term) { setRemoteSearchResults([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      const escaped = escapeOrFilterValue(term);
      supabase
        .from("profiles")
        .select("*")
        .or(`name.ilike."%${escaped}%",city.ilike."%${escaped}%",country.ilike."%${escaped}%",occupation.ilike."%${escaped}%"`)
        .limit(30)
        .then(({ data, error }) => {
          if (!alive) return;
          if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
          setRemoteSearchResults(data || []);
        });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [search]);

  const searchResults = search.trim()
    ? [
        ...localSearchResults,
        // matchesSearch réappliqué ici (bug corrigé à l'audit) : la requête
        // Supabase ci-dessus filtre côté serveur sur city/country/occupation
        // bruts (colonnes, pas de notion de show_X en SQL), donc un profil
        // ne matchant QUE sur un champ qu'il a masqué remontait quand même
        // dans "searchResults" sans jamais repasser par le filtre respectant
        // la confidentialité (contrairement à filteredPeople/localSearchResults
        // plus haut, qui utilisent déjà matchesSearch).
        ...remoteSearchResults.filter(
          (p) => p.id !== currentUser?.id && !blockedIds.has(p.id) && matchesSearch(p, search) && !localSearchResults.some((lp) => lp.id === p.id)
        ),
      ]
    : [];

  // Recherche "une discussion" du placeholder — jusqu'ici seule promesse non
  // tenue de la recherche globale (personne/ville étaient déjà correctement
  // couvertes par matchesSearch ci-dessus, vérifié en direct à l'audit).
  // Aucune nouvelle requête : matches/lastByKey sont déjà chargés pour la
  // prévisualisation "Tes conversations" du fil.
  const conversationResults = search.trim()
    ? matches.filter((m) => {
        const last = lastByKey[matchKey(currentUser?.id, m.id)];
        const words = normalizeForSearch(search).split(/\s+/).filter(Boolean);
        const haystack = normalizeForSearch(`${m.name} ${last?.text || ""}`);
        return words.every((w) => haystack.includes(w));
      })
    : [];

  const topPerson = filteredPeople[0] || null;
  const topPhotos = topPerson
    ? (profilePhotos[topPerson.id]?.length ? profilePhotos[topPerson.id] : (topPerson.avatar_url ? [{ url: topPerson.avatar_url }] : []))
    : [];

  useEffect(() => {
    setDiscoverPhotoIndex(0);
    setSwipeX(0);
    setSwipeExit(null);
    setSwiping(false);
  }, [topPerson?.id]);

  const decideSwipe = (dir) => {
    if (!topPerson || swipeExit) return;
    const person = topPerson;
    setSwipeExit(dir);
    setTimeout(async () => {
      const ok = dir === "like" ? await handleLike(person) : await handlePass(person);
      // Si l'appel échoue (réseau, RLS...), candidates/filteredPeople ne
      // change pas donc topPerson reste le même — l'effet qui réinitialise
      // swipeExit ne se déclenche alors jamais (il dépend de topPerson?.id)
      // et la carte restait bloquée hors écran, sans plus aucune
      // interaction possible en mode Pile. On la ramène ici pour permettre
      // un nouveau geste.
      if (!ok) {
        setSwipeExit(null);
        setSwipeX(0);
      }
    }, 240);
  };

  const onSwipeStart = (clientX) => {
    if (swipeExit) return;
    swipeStartRef.current = clientX;
    setSwiping(true);
  };
  const onSwipeMove = (clientX) => {
    if (!swiping || swipeExit) return;
    setSwipeX(clientX - swipeStartRef.current);
  };
  const onSwipeEnd = () => {
    if (!swiping || swipeExit) return;
    setSwiping(false);
    if (swipeX > 110) decideSwipe("like");
    else if (swipeX < -110) decideSwipe("pass");
    else setSwipeX(0);
  };

  const pickStoryMedia = (kind) => {
    if (kind === "photo") storyPhotoInputRef.current?.click();
    else storyVideoInputRef.current?.click();
  };

  const onStoryMediaSelected = async (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // Même validation réelle (MIME déclaré + signature binaire) que la
    // messagerie riche — les statuts n'avaient auparavant aucun contrôle
    // pour les photos, et seulement une taille pour les vidéos.
    const { ok, error } = await validateMediaFile(file, kind === "photo" ? "image" : "video");
    if (!ok) {
      setStoryMediaError(error);
      return;
    }
    setStoryMediaError("");
    // Avertissement non bloquant (item audit) — les .mov iPhone en HEVC ne se
    // lisent que sur Safari/iOS ; on prévient avant publication plutôt que de
    // laisser l'utilisateur le découvrir après coup en consultant les vues.
    setStoryMediaWarning(kind === "video" && file.type === "video/quicktime"
      ? "Cette vidéo pourrait ne pas se lire sur tous les appareils (format .mov). Si possible, publie-la en MP4."
      : "");
    setStoryMedia(file);
    setStoryMediaKind(kind);
  };

  const uploadStoryMedia = async (profileId, file) => {
    const ext = extFromMime(file.type) || file.name.split(".").pop() || "bin";
    const path = `${profileId}/story-${Date.now()}.${ext}`;
    // uploadWithProgress (déjà utilisé par la messagerie riche/les
    // publications) plutôt que supabase.storage.upload() : un statut vidéo
    // peut peser jusqu'à 50 Mo, et le SDK n'expose aucune progression — sur
    // une connexion lente, l'upload semblait figé/cassé sans le moindre
    // retour visuel ("on n'arrive pas à mettre les vidéos en statut").
    await uploadWithProgress({
      bucket: "avatars",
      path,
      file,
      onProgress: setStoryUploadProgress,
    });
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return { url: data.publicUrl, path };
  };

  const addStory = async () => {
    if (storyPublishingRef.current) return;
    const text = storyText.trim();
    if (!text && !storyMedia) return;
    if (!currentUser) return;
    storyPublishingRef.current = true;
    setStoryUploading(true);
    setStoryUploadProgress(0);
    beginCriticalOperation();
    // Chemin Storage de l'upload en cours, pour nettoyage si l'insertion en
    // base échoue après un upload réussi (même motif que EventCreateForm/
    // CommunityCreateForm/PostsFeed : sans ce suivi, un statut qui échoue à
    // l'insertion — coupure réseau, session expirée — laissait un fichier
    // orphelin dans le bucket "avatars" pour toujours).
    let uploadedPath = null;
    try {
      let mediaUrl = null;
      const mediaKind = storyMedia ? storyMediaKind : null;
      if (storyMedia) {
        const uploaded = await uploadStoryMedia(currentUser.user_id, storyMedia);
        mediaUrl = uploaded.url;
        uploadedPath = uploaded.path;
      }
      const bgColor = !storyMedia && text ? (storyBgColor || null) : null;
      const { data, error } = await supabase
        .from("stories")
        .insert({ profile_id: currentUser.id, text: text || null, media_url: mediaUrl, media_kind: mediaKind, bg_color: bgColor })
        .select()
        .single();
      if (error) throw error;
      setStories((prev) => [
        {
          id: data.id,
          profile_id: currentUser.id,
          own: true,
          name: currentUser.name || "Toi",
          initial: (currentUser.name || "?").trim().charAt(0).toUpperCase(),
          color: colorForProfile(currentUser.id),
          text,
          media_url: mediaUrl,
          media_kind: mediaKind,
          bg_color: bgColor,
          created_at: data.created_at,
        },
        ...prev.filter((s) => !s.own),
      ]);
      setStoryText("");
      setStoryMedia(null);
      setStoryMediaKind("");
      setStoryMediaError("");
      setStoryMediaWarning("");
      setStoryBgColor("");
      setStoryStep("compose");
      setStoryComposer(false);
    } catch (e) {
      console.error(e);
      // Upload Storage déjà réussi mais l'insertion en base a échoué ensuite
      // (ex : session expirée entre les deux) : nettoie le fichier orphelin
      // plutôt que de le laisser dans "avatars" pour toujours.
      if (uploadedPath) supabase.storage.from("avatars").remove([uploadedPath]).catch(() => {});
      setStoryMediaError("Impossible de publier le statut. Réessaie.");
    } finally {
      storyPublishingRef.current = false;
      setStoryUploading(false);
      setStoryUploadProgress(0);
      endCriticalOperation();
    }
  };

  // Enregistre une vue (idempotent grace a la contrainte unique(story_id,
  // viewer_id) + la policy INSERT de story_views) — jamais bloquant, un
  // doublon ou un statut expire entre-temps echoue silencieusement.
  const recordStoryView = async (storyId) => {
    if (!storyId || !currentUser) return;
    try {
      await supabase.from("story_views").insert({ story_id: storyId, viewer_id: currentUser.id });
    } catch (_) { /* volontairement silencieux */ }
  };

  const loadMyStoryReaction = async (storyId) => {
    if (!storyId || !currentUser) { setMyStoryReaction(null); return; }
    const { data } = await supabase.from("story_reactions").select("emoji").eq("story_id", storyId).eq("profile_id", currentUser.id).maybeSingle();
    // Idem loadStoryViewCount : si l'utilisateur a déjà tourné plusieurs
    // stories pendant l'aller-retour réseau (plusieurs requêtes en vol,
    // résolues dans le désordre), une réponse tardive affichait le cœur/emoji
    // réagi sur la MAUVAISE story — celle affichée au moment de la réponse,
    // pas celle pour laquelle la réaction a réellement été chargée.
    if (activeStoryIdRef.current !== storyId) return;
    setMyStoryReaction(data?.emoji || null);
  };

  const loadStoryViewCount = async (storyId) => {
    if (!storyId) { setStoryViewCount(0); return; }
    const { count } = await supabase.from("story_views").select("id", { count: "exact", head: true }).eq("story_id", storyId);
    // Ignore une réponse arrivée après que l'utilisateur a déjà navigué vers
    // une autre story (swipe rapide) — sinon le compteur de vues affiché
    // pouvait appartenir à la story précédente.
    if (activeStoryIdRef.current !== storyId) return;
    setStoryViewCount(count || 0);
  };

  // Effet de bord partage par openStory/nextStory/prevStory : vue + reaction
  // pour un statut d'autrui, compteur de vues pour son propre statut.
  const onStoryShown = (s) => {
    setStoryViewersOpen(false);
    activeStoryIdRef.current = s?.id ?? null;
    if (!s) return;
    if (s.own) {
      setMyStoryReaction(null);
      if (s.id) loadStoryViewCount(s.id);
    } else {
      setStoryViewCount(0);
      if (s.id) { recordStoryView(s.id); loadMyStoryReaction(s.id); }
    }
  };

  const loadStoryViewers = async (storyId) => {
    if (!storyId) { setStoryViewers([]); return; }
    setStoryViewersLoading(true);
    const [{ data: views }, { data: reactions }] = await Promise.all([
      supabase.from("story_views").select("viewer_id, viewed_at, profile:viewer_id(name, avatar_url)").eq("story_id", storyId).order("viewed_at", { ascending: false }),
      supabase.from("story_reactions").select("profile_id, emoji").eq("story_id", storyId),
    ]);
    // Même jeton de course que loadStoryViewCount/loadMyStoryReaction
    // juste au-dessus, jusqu'ici oublié ici : sans cette vérification, ouvrir
    // la liste des vues d'une story A puis, avant la fin de ce Promise.all,
    // en ouvrir une autre pour une story B laissait la réponse tardive de A
    // écraser la liste affichée pour B avec les mauvais viewers/réactions.
    if (activeStoryIdRef.current !== storyId) return;
    const reactionByProfile = {};
    for (const r of reactions || []) reactionByProfile[r.profile_id] = r.emoji;
    setStoryViewers((views || []).map((v) => ({
      profile_id: v.viewer_id,
      name: v.profile?.name || "?",
      avatar_url: v.profile?.avatar_url || null,
      viewed_at: v.viewed_at,
      reaction: reactionByProfile[v.viewer_id] || null,
    })));
    setStoryViewersLoading(false);
  };

  const openStoryViewers = () => {
    const s = visibleStories[storyViewerIndex];
    if (!s?.own || !s?.id) return;
    setStoryViewersOpen(true);
    loadStoryViewers(s.id);
  };

  const sendStoryReaction = async (emoji) => {
    const s = visibleStories[storyViewerIndex];
    if (!s || s.own || !s.id || !currentUser) return;
    const previous = myStoryReaction;
    const next = previous === emoji ? null : emoji;
    setMyStoryReaction(next);
    try {
      // Bug identifié à l'audit : ni l'upsert ni le delete ne vérifiaient
      // `error` (le client Supabase ne rejette PAS la promesse sur une
      // erreur base/RLS, seulement sur une panne réseau) — une réaction
      // refusée en base restait donc affichée localement comme envoyée,
      // sans rollback ni message, jusqu'à la prochaine ouverture de ce
      // statut (loadMyStoryReaction) qui la corrigeait silencieusement.
      if (next) {
        const { error } = await supabase.from("story_reactions").upsert({ story_id: s.id, profile_id: currentUser.id, emoji: next }, { onConflict: "story_id,profile_id" });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("story_reactions").delete().eq("story_id", s.id).eq("profile_id", currentUser.id);
        if (error) throw error;
      }
    } catch (e) {
      console.error(e);
      setMyStoryReaction(previous);
      onError("Impossible d'envoyer ta réaction.");
    }
  };

  const openStory = (index) => {
    const s = visibleStories[index];
    if (s?.own && !s.text && !s.media_url) { setStoryComposer(true); return; }
    setStoryViewerIndex(index);
    // Clé = profil, pas l'index dans visibleStories : cet index se décale
    // dès qu'un blocage (fait ici ou ailleurs, ex. PublicProfileModal)
    // retire une personne du tableau pendant la session — avec l'index brut
    // comme clé, l'anneau "déjà vu"/"pas vu" du bandeau de statuts finissait
    // affiché sur la mauvaise personne après un blocage.
    if (s?.profile_id) setViewedStories((prev) => ({ ...prev, [s.profile_id]: true }));
    setStoryReply("");
    setStoryDurationMs(5000);
    onStoryShown(s);
  };

  const closeStoryViewer = () => {
    setStoryViewerIndex(null);
    setStoryViewersOpen(false);
    setStoryViewers([]);
    activeStoryIdRef.current = null;
  };

  const nextStory = () => {
    setStoryViewerIndex((i) => {
      if (i === null) return i;
      let next = i + 1;
      while (next < visibleStories.length && visibleStories[next].own) next++;
      if (next >= visibleStories.length) { return null; }
      const nextProfileId = visibleStories[next].profile_id;
      if (nextProfileId) setViewedStories((prev) => ({ ...prev, [nextProfileId]: true }));
      setStoryReply("");
      setStoryDurationMs(5000);
      onStoryShown(visibleStories[next]);
      return next;
    });
  };

  const prevStory = () => {
    setStoryViewerIndex((i) => {
      if (i === null) return i;
      let prev = i - 1;
      while (prev >= 0 && visibleStories[prev].own) prev--;
      if (prev < 0) return i;
      setStoryReply("");
      setStoryDurationMs(5000);
      onStoryShown(visibleStories[prev]);
      return prev;
    });
  };

  // Envoie une vraie réponse en message privé à l'auteur de la story affichée
  // (auparavant : effacait le texte sans jamais rien envoyer — voir audit
  // pré-lancement). Résout le profil complet comme openChatWithProfileId,
  // puis ferme le visualiseur et bascule vers la conversation ouverte.
  const sendStoryReply = async () => {
    const text = storyReply.trim();
    const s = visibleStories[storyViewerIndex];
    if (!text || !s || s.own) return;
    setStoryReply("");
    const target = profiles.find((p) => p.id === s.profile_id)
      || candidates.find((p) => p.id === s.profile_id)
      || matches.find((p) => p.id === s.profile_id);
    const profile = target || (await supabase.from("profiles").select("*").eq("id", s.profile_id).maybeSingle()).data;
    if (!profile) return;
    closeStoryViewer();
    await sendMessageTo(profile, text);
  };

  const deleteOwnStory = async () => {
    const s = visibleStories[storyViewerIndex];
    if (!s?.own || !s?.id) { closeStoryViewer(); return; }
    try {
      const { error } = await supabase.from("stories").delete().eq("id", s.id);
      if (error) throw error;
      // Nettoyage du fichier Storage associé — même geste que pour les photos
      // de profil (removeExistingPhoto, App.jsx) et les médias de
      // publications/événements : sans ça, chaque statut supprimé laissait un
      // fichier orphelin permanent dans le bucket "avatars" (uploadStoryMedia
      // ci-dessus y publie les médias de statut), et l'expiration à 24h
      // (supabase-stories-expiration.sql) ne fait que masquer la ligne, elle
      // ne supprime ni la ligne ni le fichier.
      const marker = "/avatars/";
      const idx = s.media_url?.indexOf(marker);
      if (idx !== -1 && idx !== undefined) {
        const storagePath = decodeURIComponent(s.media_url.slice(idx + marker.length));
        supabase.storage.from("avatars").remove([storagePath]).catch(() => {});
      }
      setStories((prev) => prev.map((st) =>
        st.own ? { ...st, id: undefined, text: "", media_url: null, media_kind: null } : st
      ));
    } catch (e) {
      // Bug identifié à l'audit : la modale se fermait dans tous les cas
      // (closeStoryViewer ci-dessous, hors du try/catch) sans jamais
      // avertir l'utilisateur en cas d'échec (coupure réseau, RLS...) — le
      // statut restait bien présent en base, mais rien à l'écran ne le
      // laissait deviner : l'utilisateur croyait sa suppression effectuée.
      console.error(e);
      onError("Impossible de supprimer ce statut. Réessaie.");
    }
    closeStoryViewer();
  };

  // Auto-avance chaque story après storyDurationMs (5s par défaut, ou la
  // durée réelle d'une vidéo une fois ses métadonnées chargées — voir
  // StoryViewerModal.jsx, onVideoDuration). En pause pendant que la personne
  // tape une réponse ou consulte "qui a vu ce statut" — sinon le minuteur
  // continuait de tourner en arrière-plan et faisait avancer la story en
  // plein milieu de la frappe : nextStory()/prevStory() vident storyReply,
  // donc la réponse en cours disparaissait sans jamais être envoyée, et le
  // panneau des vues se refermait brusquement sous les yeux de l'utilisateur.
  useEffect(() => {
    if (storyViewerIndex === null) return;
    if (storyReply.trim() || storyViewersOpen) return;
    const t = setTimeout(() => nextStory(), storyDurationMs);
    return () => clearTimeout(t);
  }, [storyViewerIndex, storyDurationMs, storyReply, storyViewersOpen]);

  // Navigation à 5 onglets (refonte visuelle août 2026, maquettes fournies) —
  // remplace l'ancienne barre à 6 onglets. Communautés et Événements ne sont
  // plus des onglets dédiés (cohérent avec le fil qui les mélange désormais
  // au reste du contenu) mais restent pleinement accessibles depuis le menu
  // du profil (voir plus bas) — la fonctionnalité n'est pas retirée, juste
  // déplacée d'un niveau.
  const nav = [
    ["feed", Home, "Découverte", null],
    ["discover", Heart, "Rencontres", null],
    ["matches", MessageCircle, "Messages", () => totalUnreadMessages],
    ["news", Compass, "Intégration", null],
    ["profile", UserRound, "Profil", null],
  ];

  const goTab = (next) => {
    setTab(next);
    setSearch("");
    setMenu(false);
    setNotificationsOpen(false);
  };

  return (
    <div className="bb-app min-h-screen relative" style={{ color: body, fontFamily: "'Manrope',system-ui,sans-serif" }}>
      <style>{`
        @keyframes bbAppDrift { from { transform: scale(1.02) translate3d(0,0,0); } to { transform: scale(1.07) translate3d(-1.2%, -1%, 0); } }
        @keyframes bbContentIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .bb-app-bg { animation: bbAppDrift 24s ease-in-out alternate infinite; }
        .bb-content-in { animation: bbContentIn .55s cubic-bezier(.22,1,.36,1); }
        .bb-glass { background: rgba(var(--bb-surface-rgb),.78) !important; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        @media (prefers-reduced-motion: reduce) { .bb-app * { animation: none !important; transition: none !important; } }
      `}</style>
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none" style={{ background: bg }} />
      <header className="sticky top-0 z-40 border-b bb-glass" style={{ borderColor: `rgba(${primaryRgb},.08)`, paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-[74px] flex items-center gap-4">
          <button onClick={() => goTab("feed")} className="flex items-center gap-3 shrink-0">
            <div className="h-11 w-11 rounded-[15px] overflow-hidden flex items-center justify-center shadow-lg" style={{ background: "#000" }}>
              <img src={logoIcon} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xl font-black tracking-tight" style={{ color: primary }}>baobab</div>
              <div className="text-[9px] uppercase tracking-[.24em] font-bold" style={{ color: muted }}>connecter · s'intégrer · aimer</div>
            </div>
          </button>

          <div ref={searchRef} className="flex-1 max-w-xl mx-auto relative">
            <div className="h-11 rounded-2xl flex items-center gap-2 px-4" style={{ background: bg, border: search ? `1px solid ${primary}22` : "1px solid transparent" }}>
              <Search size={18} color={muted} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => {}}
                className="bg-transparent outline-none text-sm w-full"
                placeholder="Rechercher une personne, une ville, une discussion…"
              />
              {search && <button onClick={() => setSearch("")} aria-label="Effacer la recherche"><X size={16} color={muted} /></button>}
            </div>
            {search && (
              <div className="absolute top-14 left-0 right-0 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-2 z-50 max-h-[70vh] overflow-y-auto">
                {conversationResults.length > 0 && (
                  <>
                    <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Discussions</div>
                    {conversationResults.slice(0, 5).map((m) => {
                      const last = lastByKey[matchKey(currentUser?.id, m.id)];
                      return (
                        <button key={m.id} onClick={() => { setSearch(""); openChat(m); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bb-bg)] text-left">
                          <Avatar name={m.name} url={m.avatar_url} size={38} />
                          <div className="min-w-0"><div className="text-sm font-bold truncate">{m.name}</div><div className="text-xs truncate" style={{ color: muted }}>{last?.text || "Discussion"}</div></div>
                        </button>
                      );
                    })}
                  </>
                )}
                <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Personnes</div>
                {searchResults.slice(0, 8).map((p) => (
                  <button key={p.id} onClick={() => { setSearch(""); setViewedProfileId(p.id); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bb-bg)] text-left">
                    <Avatar name={p.name} url={p.avatar_url} size={38} />
                    {/* Confidentialité par champ (voir PrivacyFieldsModal.jsx) — la
                        recherche globale affichait ville/pays sans consulter
                        show_city/show_country, alors que MatchCard/PublicProfileModal
                        les respectent déjà : un profil les ayant masqués restait quand
                        même visible ici, résultat par résultat. */}
                    <div className="min-w-0"><div className="text-sm font-bold truncate">{p.name}{visibleAge(p) ? `, ${visibleAge(p)}` : ""}</div><div className="text-xs" style={{ color: muted }}>{[p.show_city !== false && p.city, p.show_country !== false && p.country].filter(Boolean).join(" · ") || "Canada"}</div></div>
                  </button>
                ))}
                {searchResults.length === 0 && conversationResults.length === 0 && <div className="px-3 py-3 text-sm" style={{ color: muted }}>Aucun résultat.</div>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <div ref={notifRef} className="relative">
            <button onClick={() => { setNotificationsOpen((v) => !v); setMenu(false); }} aria-label={`Notifications${totalUnreadMessages > 0 ? ` (${totalUnreadMessages} non lus)` : ""}`} className={`${buttonBase} h-11 w-11 rounded-2xl hidden sm:flex items-center justify-center relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1`} style={{ background: bg }}>
              <Bell size={19} color={primary} />
              {(totalUnreadMessages > 0 || incomingFavoritesCount > 0 || communitiesBadgeCount > 0 || eventsBadgeCount > 0 || followsBadgeCount > 0 || datingBadgeCount > 0) && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full" style={{ background: coral }} />
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-12 top-14 w-96 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between px-2 pb-2">
                  <b>Notifications</b>
                  {unreadCommunityCount > 0 && (
                    <button onClick={markCommunityNotificationsRead} className="text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ color: coral }}>
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
                      // la requête "notifications" ci-dessus (utile pour "demande
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
                      // unreadEventNotifications plus haut) mais n'était jamais
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
                  </div>
                )}
              </div>
            )}
            </div>
            <div ref={menuRef} className="relative">
            <button onClick={() => { setMenu((v) => !v); setNotificationsOpen(false); }} aria-label="Menu du profil" className={`${buttonBase} h-11 w-11 rounded-2xl flex items-center justify-center text-white font-black`} style={{ background: navy }}>
              {(currentUser?.name || "T")[0].toUpperCase()}
            </button>
            {menu && (
              <div className="absolute right-0 top-14 w-64 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-2 z-50">
                <div className="rounded-xl p-3 mb-1" style={{ background: `linear-gradient(135deg,${navy},#1E4632)` }}>
                  <div className="text-white font-bold">{currentUser?.name || "Ton profil"}</div>
                  <div className="text-white/60 text-xs mt-0.5">{currentUser?.city || "Canada"} · 🟢 En ligne</div>
                </div>
                <button onClick={() => { goTab("profile"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><UserRound size={16} className="inline mr-3" />Mon profil</button>
                <button onClick={() => { goTab("discover"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Heart size={16} className="inline mr-3" />Découvrir</button>
                <button onClick={() => { goTab("communities"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)] relative"><Users2 size={16} className="inline mr-3" />Communautés
                  {communitiesBadgeCount > 0 && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full" style={{ background: coral }} />}
                </button>
                <button onClick={() => { goTab("events"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)] relative"><PartyPopper size={16} className="inline mr-3" />Événements
                  {eventsBadgeCount > 0 && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full" style={{ background: coral }} />}
                </button>
                <button onClick={() => { setMenu(false); openEditProfile(); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Settings size={16} className="inline mr-3" />Modifier mon profil</button>
                <button onClick={() => { setMenu(false); setSettingsOpen(true); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)] relative">
                  <Cog size={16} className="inline mr-3" />Réglages
                  {updateAvailable && <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full" style={{ background: coral }} aria-label="Mise à jour disponible" />}
                </button>
                {myPlatformRole && (
                  <button onClick={() => { setMenu(false); goTab("admin"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Shield size={16} className="inline mr-3" />Baobab Admin</button>
                )}
                <button onClick={() => { setMenu(false); setFeedbackOpen(true); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-[var(--bb-bg)]"><Megaphone size={16} className="inline mr-3" />Un souci, une idée ?</button>
                <button onClick={() => { setMenu(false); handleSignOut(); }} className="w-full text-left rounded-xl px-3 py-3 text-sm" style={{ color: coral }}><LogOut size={16} className="inline mr-3" />Déconnexion</button>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>

      <main className="bb-content-in relative z-10 max-w-7xl mx-auto px-4 lg:px-8 pb-28 pt-6">
        {tab === "feed" && (
          <FeedTab
            currentUser={currentUser}
            stories={visibleStories}
            viewedStories={viewedStories}
            openStory={openStory}
            setStoryComposer={setStoryComposer}
            growthStages={growthStages}
            growthStageEmojis={growthStageEmojis}
            growthStageIndex={growthStageIndex}
            growthPct={growthPct}
            completedSteps={completedSteps}
            totalSteps={totalSteps}
            openEditProfile={openEditProfile}
            candidates={candidates}
            handleLike={handleLike}
            handlePass={handlePass}
            hasLiked={hasLiked}
            nearbyMembers={nearbyMembers}
            newArrivals={newArrivals}
            communities={communities}
            matches={matches}
            openChat={openChat}
            goTab={goTab}
            setSearch={setSearch}
            feedTab={feedTab}
            setFeedTab={setFeedTab}
            followedProfiles={followedProfiles}
            profilePhotos={profilePhotos}
            blockedIds={blockedIds}
            onError={onError}
            incomingFavoritesCount={incomingFavoritesCount}
            unreadDatingNotifications={unreadDatingNotifications}
            unreadMessageNotifications={unreadMessageNotifications}
            unreadFollowNotifications={unreadFollowNotifications}
            unreadCommunityNotifications={unreadCommunityNotifications}
            unreadEventNotifications={unreadEventNotifications}
            unreadCommunityCount={unreadCommunityCount}
            markOneNotificationRead={markOneNotificationRead}
            markCommunityNotificationsRead={markCommunityNotificationsRead}
            onOpenProfile={(id) => setViewedProfileId(id)}
            onOpenChatWithProfile={openChatWithProfileId}
          />
        )}

        {tab === "discover" && discoverGateBlocked && (
          // Baobab 3.0, Partie A (prompt-geolocalisation-et-ouverture-baobab.md) :
          // Rencontres s'adresse aux personnes physiquement au Canada. Message
          // respectueux avec un chemin d'action clair, jamais une impasse — le
          // reste de l'app (dont le Guide du nouvel arrivant) reste accessible.
          <div className="max-w-md mx-auto text-center py-16 px-6">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full flex items-center justify-center" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}>
              <Globe2 size={28} color={navy} />
            </div>
            <h2 className="text-lg font-black" style={{ color: primary }}>Rencontres t'attend au Canada</h2>
            <p className="text-sm mt-2" style={{ color: muted }}>
              Le module Rencontres de Baobab s'adresse aux personnes déjà au Canada. En attendant ton arrivée, tu peux dès maintenant consulter le guide d'installation pour préparer ton départ.
            </p>
            <button onClick={() => goTab("news")} className="bb-btn-gold mt-5 px-5 py-3 rounded-full text-sm font-bold">
              Voir le guide du nouvel arrivant
            </button>
          </div>
        )}
        {tab === "discover" && !discoverGateBlocked && (
          <DiscoverTab
            filteredPeople={filteredPeople}
            topPerson={topPerson}
            topPhotos={topPhotos}
            discoverPhotoIndex={discoverPhotoIndex}
            setDiscoverPhotoIndex={setDiscoverPhotoIndex}
            swipeX={swipeX}
            swipeExit={swipeExit}
            swiping={swiping}
            onSwipeStart={onSwipeStart}
            onSwipeMove={onSwipeMove}
            onSwipeEnd={onSwipeEnd}
            decideSwipe={decideSwipe}
            currentUser={currentUser}
            onViewProfile={(p) => setViewedProfileId(p.id)}
            handleLike={handleLike}
            handlePass={handlePass}
            matches={matches}
            favoriteIds={favoriteIds}
            hasLiked={hasLiked}
            toggleFavorite={toggleFavorite}
            hiddenIds={hiddenProfileIds}
            hideProfile={hideProfile}
            setReportTarget={setReportTarget}
            handleBlock={handleBlock}
            onUnmatch={handleUnmatch}
            openChat={openChat}
            goTab={goTab}
            myLocation={myLocation}
          />
        )}

        {tab === "matches" && (
          <MessagesTab
            matches={matches}
            currentUser={currentUser}
            activeMatch={activeMatch}
            onSelectMatch={openChat}
            onBack={closeChat}
            goTab={goTab}
            lastByKey={lastByKey}
            unreadByKey={unreadByKey}
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
            otherTyping={otherTyping}
            onOpenReport={setReportTarget}
            onOpenBlockConfirm={handleBlock}
            onUnmatch={handleUnmatch}
            replyingTo={replyingTo}
            setReplyingTo={setReplyingTo}
            reactionsByMessageId={reactionsByMessageId}
            toggleReaction={toggleReaction}
            deleteMessageForMe={deleteMessageForMe}
            deleteMessageForEveryone={deleteMessageForEveryone}
          />
        )}

        {tab === "profile" && (
          <ProfileTab
            currentUser={currentUser}
            openEditProfile={openEditProfile}
            matches={matches}
            candidates={candidates}
            profileTab={profileTab}
            setProfileTab={setProfileTab}
            goTab={goTab}
            profilePhotos={profilePhotos}
            favoritesCount={favoriteProfiles.length}
            onOpenFavorites={() => setFavoritesOpen(true)}
            admirersCount={admirers.length}
            onOpenAdmirers={() => setAdmirersOpen(true)}
            onOpenPreferences={() => setPreferencesOpen(true)}
            myCommunities={myCommunities}
            myCommunitiesLoading={myCommunitiesLoading}
            onOpenCommunities={(id) => { setOpenCommunityId(id || null); goTab("communities"); }}
            myUpcomingEvents={myUpcomingEvents}
            myUpcomingEventsLoading={myUpcomingEventsLoading}
            onOpenEvents={(id) => { setOpenEventId(id || null); goTab("events"); }}
            followingProfiles={followedProfiles}
            followerProfiles={followerProfiles}
            followingIds={followingIds}
            onToggleFollow={toggleFollow}
            onViewProfile={(p) => setViewedProfileId(p.id)}
            onError={onError}
            blockedIds={blockedIds}
          />
        )}

        {tab === "communities" && (
          <ChunkErrorBoundary>
            <Suspense fallback={<TabLoadingFallback />}>
              <CommunitiesTab
                currentUser={currentUser}
                onError={onError}
                initialCommunityId={openCommunityId}
                onConsumedInitial={() => setOpenCommunityId(null)}
                blockedIds={blockedIds}
                onOpenEvents={(id) => { setOpenEventId(id || null); goTab("events"); }}
                onCreateEventInCommunity={(id) => { setCreateEventCommunityId(id); goTab("events"); }}
                myPlatformRole={myPlatformRole}
                onReportProfile={setReportTarget}
                onBlockProfile={handleBlock}
                matches={matches}
                favoriteIds={favoriteIds}
                followingIds={followingIds}
                hasLiked={hasLiked}
                onLikeProfile={handleLike}
                onUnlikeProfile={handleUnlike}
                onToggleFavoriteProfile={toggleFavorite}
                onToggleFollowProfile={toggleFollow}
                onMessageProfile={openChat}
                profilePhotos={profilePhotos}
              />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {tab === "events" && (
          <ChunkErrorBoundary>
            <Suspense fallback={<TabLoadingFallback />}>
              <EventsTab
                currentUser={currentUser}
                onError={onError}
                initialEventId={openEventId}
                onConsumedInitial={() => setOpenEventId(null)}
                initialCreateCommunityId={createEventCommunityId}
                onConsumedInitialCreate={() => setCreateEventCommunityId(null)}
                blockedIds={blockedIds}
                myPlatformRole={myPlatformRole}
                onReportProfile={setReportTarget}
                onBlockProfile={handleBlock}
                onOpenCommunities={(id) => { setOpenCommunityId(id || null); goTab("communities"); }}
                matches={matches}
                favoriteIds={favoriteIds}
                followingIds={followingIds}
                hasLiked={hasLiked}
                onLikeProfile={handleLike}
                onUnlikeProfile={handleUnlike}
                onToggleFavoriteProfile={toggleFavorite}
                onToggleFollowProfile={toggleFollow}
                onMessageProfile={openChat}
                profilePhotos={profilePhotos}
              />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {tab === "premium" && (
          <ChunkErrorBoundary>
            <Suspense fallback={<TabLoadingFallback />}>
              <PremiumPage currentUser={currentUser} onBack={() => goTab("feed")} onError={onError} justSubscribed={justSubscribed} onJustSubscribedHandled={onJustSubscribedHandled} />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {tab === "admin" && myPlatformRole && (
          <ChunkErrorBoundary>
            <Suspense fallback={<TabLoadingFallback />}>
              <AdminDashboard onBack={() => goTab("feed")} onError={onError} myPlatformRole={myPlatformRole} />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {tab === "news" && (
          <ChunkErrorBoundary>
            <Suspense fallback={<TabLoadingFallback />}>
              <ImmigrationNewsView onBack={() => goTab("feed")} onError={onError} currentUser={currentUser} />
            </Suspense>
          </ChunkErrorBoundary>
        )}
      </main>


      <nav className="fixed bottom-0 left-0 right-0 z-40 bb-glass border-t" style={{ borderColor: `rgba(${primaryRgb},.08)`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-xl mx-auto grid grid-cols-5 px-2">
          {nav.map(([key, Icon, label, getBadge]) => {
            const badgeCount = getBadge ? getBadge() : 0;
            const active = tab === key;
            return (
              <button key={key} onClick={() => goTab(key)} aria-label={badgeCount > 0 ? `${label} (${badgeCount} non lus)` : label} className="py-3 flex flex-col items-center gap-1.5 rounded-2xl" style={{ minHeight: 48 }}>
                <div className="h-7 w-9 flex items-center justify-center rounded-xl relative motion-safe:transition-colors motion-safe:duration-200">
                  <Icon size={19} color={active ? "var(--bb-gold-1)" : muted} fill={active && key === "discover" ? "var(--bb-gold-1)" : "none"} className="motion-safe:transition-colors motion-safe:duration-200" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: coral }}>
                      {badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[8px] font-black text-center leading-tight w-full whitespace-nowrap overflow-hidden text-ellipsis px-0.5" style={{ color: active ? "var(--bb-gold-1)" : muted }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <StoryViewerModal
        storyViewerIndex={storyViewerIndex}
        stories={visibleStories}
        closeStoryViewer={closeStoryViewer}
        prevStory={prevStory}
        nextStory={nextStory}
        deleteOwnStory={deleteOwnStory}
        storyReply={storyReply}
        setStoryReply={setStoryReply}
        sendStoryReply={sendStoryReply}
        onVideoDuration={setStoryDurationMs}
        durationMs={storyDurationMs}
        storyViewCount={storyViewCount}
        storyViewers={storyViewers}
        storyViewersLoading={storyViewersLoading}
        storyViewersOpen={storyViewersOpen}
        openStoryViewers={openStoryViewers}
        closeStoryViewers={() => setStoryViewersOpen(false)}
        myStoryReaction={myStoryReaction}
        sendStoryReaction={sendStoryReaction}
        onOpenProfile={(id) => setViewedProfileId(id)}
        onReport={setReportTarget}
        onBlock={handleBlock}
      />

      <StoryComposerModal
        storyComposer={storyComposer}
        setStoryComposer={setStoryComposer}
        storyText={storyText}
        setStoryText={setStoryText}
        storyMedia={storyMedia}
        setStoryMedia={setStoryMedia}
        storyMediaKind={storyMediaKind}
        setStoryMediaKind={setStoryMediaKind}
        storyMediaError={storyMediaError}
        storyMediaWarning={storyMediaWarning}
        storyUploading={storyUploading}
        storyUploadProgress={storyUploadProgress}
        storyBgColor={storyBgColor}
        setStoryBgColor={setStoryBgColor}
        storyStep={storyStep}
        setStoryStep={setStoryStep}
        pickStoryMedia={pickStoryMedia}
        onStoryMediaSelected={onStoryMediaSelected}
        storyPhotoInputRef={storyPhotoInputRef}
        storyVideoInputRef={storyVideoInputRef}
        addStory={addStory}
      />

      {viewedProfile && (
        <PublicProfileModal
          profile={viewedProfile}
          photos={profilePhotos[viewedProfile.id] || []}
          onClose={() => setViewedProfileId(null)}
          isMatch={viewedProfileIsMatch}
          isFavorite={favoriteIds.has(viewedProfile.id)}
          isFollowing={followingIds.has(viewedProfile.id)}
          isLiked={viewedProfileIsLiked}
          onLike={viewedProfileIsMatch ? null : (p) => handleLike(p)}
          onUnlike={viewedProfileIsMatch ? null : (p) => handleUnlike(p)}
          onMessage={(p) => { setViewedProfileId(null); openChat(p); }}
          onToggleFavorite={toggleFavorite}
          onToggleFollow={toggleFollow}
          onReport={(p) => { setViewedProfileId(null); setReportTarget(p); }}
          onBlock={(p) => { setViewedProfileId(null); handleBlock(p); }}
        />
      )}

      <FavoritesModal
        open={favoritesOpen}
        onClose={() => setFavoritesOpen(false)}
        favoriteProfiles={favoriteProfiles}
        onViewProfile={(p) => { setFavoritesOpen(false); setViewedProfileId(p.id); }}
        onToggleFavorite={toggleFavorite}
        onDiscover={() => { setFavoritesOpen(false); goTab("discover"); }}
      />

      <AdmirersModal
        open={admirersOpen}
        onClose={() => setAdmirersOpen(false)}
        admirerProfiles={admirers}
        currentUser={currentUser}
        /* Bug : la modale "Qui m'a aimé" se fermait entièrement après avoir
           aimé une seule personne en retour, alors qu'elle peut contenir
           plusieurs admirateur·ices. `admirers` (= getAdmirers()) est déjà
           recalculé automatiquement dès que le like part (la personne
           bascule dans les matchs et sort naturellement de la liste, comme
           le documente le commentaire au-dessus de getAdmirers() dans
           App.jsx) — inutile de fermer la modale, elle doit rester ouverte
           pour laisser liker les admirateur·ices restant·es, exactement
           comme FavoritesModal ci-dessus ne se ferme pas après un
           toggleFavorite. La modale de célébration de match (z-[90]) passe
           de toute façon au-dessus (z-[70] ici) sans avoir besoin qu'on la
           ferme. */
        onLikeBack={(p) => handleLike(p)}
        onViewProfile={(p) => { setAdmirersOpen(false); setViewedProfileId(p.id); }}
        onUpgrade={() => { setAdmirersOpen(false); goTab("premium"); }}
      />

      <BetaFeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        currentUser={currentUser}
        screen={tab}
      />

      <MatchPreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        currentUser={currentUser}
        onSave={handleSavePreferences}
      />
    </div>
  );
}
