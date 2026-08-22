import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import { Home, Heart, X, MessageCircle, LogOut, Settings, Cog, UserRound, Search, Bell, Users2, PartyPopper, Megaphone, Shield } from "lucide-react";
import Avatar from "./Avatar";
import logoIcon from "../assets/logo-baobab-icon.png";
import { supabase } from "../supabaseClient";
import { matchKey, visibleAge } from "../utils/format";
import { useClickOutside } from "../hooks/useClickOutside";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { primary, navy, coral, gold, bg, muted, buttonBase, body, primaryRgb } from "./social/theme";
import { NOTIFICATION_LABELS, NOTIF_CATEGORIES } from "../lib/notificationLabels";
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
import BetaFeedbackModal from "./social/BetaFeedbackModal";
import ChunkErrorBoundary from "./ChunkErrorBoundary";

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
  const haystack = normalizeForSearch(`${profile.name} ${profile.city || ""} ${profile.country || ""} ${profile.occupation || ""}`);
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
}) {
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [admirersOpen, setAdmirersOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [tab, setTab] = useState("feed");
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
  const [viewedProfileId, setViewedProfileId] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const storyPhotoInputRef = useRef(null);
  const storyVideoInputRef = useRef(null);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const menuRef = useRef(null);

  // Repart toujours de l'étape "compose" à l'ouverture (que ce soit via
  // openStory ci-dessous ou le bouton "+" de FeedTab.jsx, qui appelle le
  // même setStoryComposer) — sinon un statut publié puis rouvert pourrait
  // rester coince sur l'etape "preview" precedente.
  useEffect(() => {
    if (storyComposer) setStoryStep("compose");
  }, [storyComposer]);

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
      .select("to_id")
      .eq("from_id", currentUser.id)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        setFavoriteIds(new Set((data || []).map((r) => r.to_id)));
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
    Promise.all([
      supabase.from("follows").select("to_id, profile:to_id(id,name,avatar_url,city,age,looking_for,email_verified,phone_verified)").eq("from_id", currentUser.id).limit(2000),
      supabase.from("follows").select("from_id, profile:from_id(id,name,avatar_url,city,age,looking_for,email_verified,phone_verified)").eq("to_id", currentUser.id).limit(2000),
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
      onError("Impossible de mettre à jour ton abonnement.");
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
      .select("id, match_key, from_id, kind, text, media_path, media_meta, created_at, read_at")
      .in("match_key", keys)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        const lastMap = {}, unreadMap = {};
        for (const m of data || []) {
          if (!lastMap[m.match_key]) lastMap[m.match_key] = m;
          if (m.from_id !== currentUser.id && !m.read_at) unreadMap[m.match_key] = (unreadMap[m.match_key] || 0) + 1;
        }
        setLastByKey(lastMap);
        setUnreadByKey(unreadMap);
      });
    return () => { alive = false; };
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
    const latest = messages[messages.length - 1];
    if (!latest || latest.id?.toString().startsWith("temp-")) return;
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
      .select("id, type, community_id, target_type, target_id, read_at, created_at, actor:actor_id(name, avatar_url)")
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
  const unreadEventNotifications = prefEnabled("events") ? communityNotifications.filter((n) => n.target_type === "event") : [];
  const unreadFollowNotifications = prefEnabled("follows") ? communityNotifications.filter((n) => n.type === "new_follower") : [];
  const unreadDatingNotifications = communityNotifications.filter((n) =>
    (n.type === "new_like" && prefEnabled("likes")) || (n.type === "new_match" && prefEnabled("match"))
  );
  const unreadMessageNotifications = prefEnabled("messages") ? communityNotifications.filter((n) => n.type === "new_message") : [];
  const unreadCommunityNotifications = prefEnabled("communities") ? communityNotifications.filter((n) =>
    n.target_type !== "event" && n.type !== "new_follower" && n.type !== "new_like" && n.type !== "new_match" && n.type !== "new_message"
  ) : [];
  const eventsBadgeCount = unreadCommunityCount > 0 ? unreadEventNotifications.length : 0;
  const communitiesBadgeCount = unreadCommunityCount > 0 ? unreadCommunityNotifications.length : 0;
  const followsBadgeCount = unreadCommunityCount > 0 ? unreadFollowNotifications.length : 0;
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
  useEffect(() => {
    if (!currentUser || tab !== "profile" || currentUser.show_upcoming_events === false) { setMyUpcomingEvents([]); return; }
    let alive = true;
    setMyUpcomingEventsLoading(true);
    supabase
      .from("event_attendees")
      .select("status, events(id, title, category, city, cover_url, event_date, canceled_at)")
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
    setCommunityNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCommunityCount((n) => Math.max(0, n - 1));
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).then(({ error }) => {
      if (error) console.error(error.message, error.code, error.details, error.hint);
    });
  };

  const markCommunityNotificationsRead = () => {
    if (unreadCommunityCount === 0 || !currentUser) return;
    const ids = communityNotifications.filter((n) => !n.read_at).map((n) => n.id);
    setUnreadCommunityCount(0);
    if (ids.length === 0) return;
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).then(({ error }) => {
      if (error) console.error(error.message, error.code, error.details, error.hint);
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
    if (local) { openChat(local); return; }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
    if (data) openChat(data);
  }
  const favoriteProfiles = profiles.filter((p) => favoriteIds.has(p.id));
  // Un blocage (dans un sens ou l'autre) retire immédiatement le profil de
  // ces listes, même si la relation "follows" existe toujours en base.
  const followedProfiles = followedProfilesRaw.filter((p) => !blockedIds.has(p.id));
  const followerProfiles = followerProfilesRaw.filter((p) => !blockedIds.has(p.id));

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

  const newArrivals = candidates.filter((p) => p.arrived_since && p.arrived_since.trim());

  // Filtre la pile de découverte par la recherche (comportement existant,
  // inchangé de portée — reste borné à candidates) — voir searchResults
  // plus bas pour la recherche globale du menu déroulant de l'en-tête.
  const filteredPeople = candidates.filter((p) => matchesSearch(p, search));

  // Recherche globale (en-tête) — corrige le bug identifié à l'audit :
  // l'ancienne recherche ne portait que sur le pool de matching restant
  // (candidates), donc un profil déjà liké/matché/hors préférences était
  // introuvable même en tapant son nom exact. Ici : tous les profils
  // connus (cache déjà chargé), moins soi-même et les bloqués.
  const searchResults = search.trim()
    ? profiles.filter((p) => p.id !== currentUser?.id && !blockedIds.has(p.id) && matchesSearch(p, search))
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
    setSwipeExit(dir);
    setTimeout(() => {
      dir === "like" ? handleLike(topPerson) : handlePass(topPerson);
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
    return data.publicUrl;
  };

  const addStory = async () => {
    const text = storyText.trim();
    if (!text && !storyMedia) return;
    if (!currentUser) return;
    setStoryUploading(true);
    setStoryUploadProgress(0);
    beginCriticalOperation();
    try {
      let mediaUrl = null;
      const mediaKind = storyMedia ? storyMediaKind : null;
      if (storyMedia) mediaUrl = await uploadStoryMedia(currentUser.user_id, storyMedia);
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
      setStoryBgColor("");
      setStoryStep("compose");
      setStoryComposer(false);
    } catch (e) {
      console.error(e);
      setStoryMediaError("Impossible de publier le statut. Réessaie.");
    } finally {
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
    setMyStoryReaction(data?.emoji || null);
  };

  const loadStoryViewCount = async (storyId) => {
    if (!storyId) { setStoryViewCount(0); return; }
    const { count } = await supabase.from("story_views").select("id", { count: "exact", head: true }).eq("story_id", storyId);
    setStoryViewCount(count || 0);
  };

  // Effet de bord partage par openStory/nextStory/prevStory : vue + reaction
  // pour un statut d'autrui, compteur de vues pour son propre statut.
  const onStoryShown = (s) => {
    setStoryViewersOpen(false);
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
    const s = stories[storyViewerIndex];
    if (!s?.own || !s?.id) return;
    setStoryViewersOpen(true);
    loadStoryViewers(s.id);
  };

  const sendStoryReaction = async (emoji) => {
    const s = stories[storyViewerIndex];
    if (!s || s.own || !s.id || !currentUser) return;
    const next = myStoryReaction === emoji ? null : emoji;
    setMyStoryReaction(next);
    try {
      if (next) {
        await supabase.from("story_reactions").upsert({ story_id: s.id, profile_id: currentUser.id, emoji: next }, { onConflict: "story_id,profile_id" });
      } else {
        await supabase.from("story_reactions").delete().eq("story_id", s.id).eq("profile_id", currentUser.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const openStory = (index) => {
    const s = stories[index];
    if (s?.own && !s.text && !s.media_url) { setStoryComposer(true); return; }
    setStoryViewerIndex(index);
    setViewedStories((prev) => ({ ...prev, [index]: true }));
    setStoryReply("");
    setStoryDurationMs(5000);
    onStoryShown(s);
  };

  const closeStoryViewer = () => {
    setStoryViewerIndex(null);
    setStoryViewersOpen(false);
    setStoryViewers([]);
  };

  const nextStory = () => {
    setStoryViewerIndex((i) => {
      if (i === null) return i;
      let next = i + 1;
      while (next < stories.length && stories[next].own) next++;
      if (next >= stories.length) { return null; }
      setViewedStories((prev) => ({ ...prev, [next]: true }));
      setStoryReply("");
      setStoryDurationMs(5000);
      onStoryShown(stories[next]);
      return next;
    });
  };

  const prevStory = () => {
    setStoryViewerIndex((i) => {
      if (i === null) return i;
      let prev = i - 1;
      while (prev >= 0 && stories[prev].own) prev--;
      if (prev < 0) return i;
      setStoryReply("");
      setStoryDurationMs(5000);
      onStoryShown(stories[prev]);
      return prev;
    });
  };

  // Envoie une vraie réponse en message privé à l'auteur de la story affichée
  // (auparavant : effacait le texte sans jamais rien envoyer — voir audit
  // pré-lancement). Résout le profil complet comme openChatWithProfileId,
  // puis ferme le visualiseur et bascule vers la conversation ouverte.
  const sendStoryReply = async () => {
    const text = storyReply.trim();
    const s = stories[storyViewerIndex];
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
    const s = stories[storyViewerIndex];
    if (!s?.own || !s?.id) { closeStoryViewer(); return; }
    try {
      const { error } = await supabase.from("stories").delete().eq("id", s.id);
      if (error) throw error;
      setStories((prev) => prev.map((st) =>
        st.own ? { ...st, id: undefined, text: "", media_url: null, media_kind: null } : st
      ));
    } catch (e) {
      console.error(e);
    }
    closeStoryViewer();
  };

  // Auto-avance chaque story après storyDurationMs (5s par défaut, ou la
  // durée réelle d'une vidéo une fois ses métadonnées chargées — voir
  // StoryViewerModal.jsx, onVideoDuration).
  useEffect(() => {
    if (storyViewerIndex === null) return;
    const t = setTimeout(() => nextStory(), storyDurationMs);
    return () => clearTimeout(t);
  }, [storyViewerIndex, storyDurationMs]);

  const nav = [
    ["feed", Home, "Accueil", null],
    ["discover", Heart, "Rencontres", null],
    ["matches", MessageCircle, "Messages", () => totalUnreadMessages],
    ["communities", Users2, "Communautés", () => communitiesBadgeCount],
    ["events", PartyPopper, "Événements", () => eventsBadgeCount],
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
              <div className="absolute top-14 left-0 right-0 bg-[var(--bb-surface)] rounded-2xl border border-[var(--bb-border)] shadow-2xl p-2 z-50">
                <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Personnes</div>
                {searchResults.slice(0, 8).map((p) => (
                  <button key={p.id} onClick={() => { setSearch(""); setViewedProfileId(p.id); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-[var(--bb-bg)] text-left">
                    <Avatar name={p.name} url={p.avatar_url} size={38} />
                    <div className="min-w-0"><div className="text-sm font-bold truncate">{p.name}{visibleAge(p) ? `, ${visibleAge(p)}` : ""}</div><div className="text-xs" style={{ color: muted }}>{p.city || "Canada"} · {p.country || "Afrique"}</div></div>
                  </button>
                ))}
                {searchResults.length === 0 && <div className="px-3 py-3 text-sm" style={{ color: muted }}>Aucun profil trouvé.</div>}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <div ref={notifRef} className="relative">
            <button onClick={() => { setNotificationsOpen((v) => !v); setMenu(false); }} aria-label={`Notifications${totalUnreadMessages > 0 ? ` (${totalUnreadMessages} non lus)` : ""}`} className={`${buttonBase} h-11 w-11 rounded-2xl hidden sm:flex items-center justify-center relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1`} style={{ background: bg }}>
              <Bell size={19} color={primary} />
              {(totalUnreadMessages > 0 || incomingFavoritesCount > 0 || communitiesBadgeCount > 0 || eventsBadgeCount > 0 || followsBadgeCount > 0) && (
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
                    <button key={key} onClick={() => setNotifCategory(key)} aria-pressed={notifCategory === key} className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ background: notifCategory === key ? navy : bg, color: notifCategory === key ? "#fff" : muted }}>
                      {label}
                    </button>
                  ))}
                </div>
                {incomingFavoritesCount === 0 && communityNotifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell size={22} className="mx-auto mb-2" color={muted} />
                    <p className="text-xs" style={{ color: muted }}>Aucune notification pour l'instant.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                    {incomingFavoritesCount > 0 && (notifCategory === "all" || notifCategory === "dating") && (
                      <div className="px-2 py-2.5 rounded-xl text-sm" style={{ background: "#FFF3D6", color: gold }}>
                        ⭐ {incomingFavoritesCount} personne{incomingFavoritesCount > 1 ? "s" : ""} t'a{incomingFavoritesCount > 1 ? "" : ""} ajouté en favori.
                      </div>
                    )}
                    {(notifCategory === "all" || notifCategory === "dating") && unreadDatingNotifications.map((n) => (
                      <button key={n.id} onClick={() => { setNotificationsOpen(false); markOneNotificationRead(n.id); setViewedProfileId(n.target_id); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2">
                        {n.type === "new_match" ? "💞" : "❤️"} {n.actor?.name ? `${n.actor.name} — ${n.type === "new_match" ? NOTIFICATION_LABELS.new_match : NOTIFICATION_LABELS.new_like}` : (NOTIFICATION_LABELS[n.type] || "Nouvelle activité")}
                      </button>
                    ))}
                    {(notifCategory === "all" || notifCategory === "messages") && unreadMessageNotifications.map((n) => (
                      <button key={n.id} onClick={() => { setNotificationsOpen(false); markOneNotificationRead(n.id); openChatWithProfileId(n.target_id); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2">
                        💬 {n.actor?.name ? `Nouveau message de ${n.actor.name}` : NOTIFICATION_LABELS.new_message}
                      </button>
                    ))}
                    {(notifCategory === "all" || notifCategory === "follows") && unreadFollowNotifications.map((n) => (
                      <button key={n.id} onClick={() => { setNotificationsOpen(false); markOneNotificationRead(n.id); setViewedProfileId(n.target_id); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2">
                        👤 {n.actor?.name ? `${n.actor.name} a commencé à te suivre` : NOTIFICATION_LABELS.new_follower}
                      </button>
                    ))}
                    {(notifCategory === "all" || notifCategory === "communities") && unreadCommunityNotifications.map((n) => (
                      <button key={n.id} onClick={() => { setNotificationsOpen(false); markOneNotificationRead(n.id); goTab(n.type?.startsWith("premium_") ? "premium" : "communities"); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2">
                        {n.type?.startsWith("premium_") ? "💎" : "🌍"} {NOTIFICATION_LABELS[n.type] || "Nouvelle activité"}
                      </button>
                    ))}
                    {(notifCategory === "all" || notifCategory === "events") && unreadEventNotifications.map((n) => (
                      <button key={n.id} onClick={() => { setNotificationsOpen(false); markOneNotificationRead(n.id); goTab("events"); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2">
                        🎉 {NOTIFICATION_LABELS[n.type] || "Nouvelle activité"}
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
            stories={stories}
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

        {tab === "discover" && (
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
            toggleFavorite={toggleFavorite}
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
              />
            </Suspense>
          </ChunkErrorBoundary>
        )}

        {tab === "premium" && (
          <ChunkErrorBoundary>
            <Suspense fallback={<TabLoadingFallback />}>
              <PremiumPage currentUser={currentUser} onBack={() => goTab("feed")} onError={onError} />
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
              <ImmigrationNewsView onBack={() => goTab("feed")} onError={onError} />
            </Suspense>
          </ChunkErrorBoundary>
        )}
      </main>


      <nav className="fixed bottom-0 left-0 right-0 z-40 bb-glass border-t" style={{ borderColor: `rgba(${primaryRgb},.08)`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-xl mx-auto grid grid-cols-6 px-2">
          {nav.map(([key, Icon, label, getBadge]) => {
            const badgeCount = getBadge ? getBadge() : 0;
            return (
              <button key={key} onClick={() => goTab(key)} aria-label={badgeCount > 0 ? `${label} (${badgeCount} non lus)` : label} className="py-3 flex flex-col items-center gap-1.5 rounded-2xl" style={{ minHeight: 48 }}>
                <div className={`h-7 w-9 flex items-center justify-center rounded-xl relative motion-safe:transition-colors motion-safe:duration-200 ${tab === key ? "bb-tab-active" : ""}`} style={{ background: tab === key ? "rgba(225,107,93,.11)" : "transparent" }}>
                  <Icon size={19} color={tab === key ? coral : muted} fill={tab === key && key === "discover" ? coral : "none"} className="motion-safe:transition-colors motion-safe:duration-200" />
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: coral }}>
                      {badgeCount}
                    </span>
                  )}
                </div>
                <span className={`${key === "communities" ? "text-[7.5px]" : "text-[8px]"} font-black text-center leading-tight w-full whitespace-nowrap overflow-hidden text-ellipsis px-0.5`} style={{ color: tab === key ? primary : muted }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <StoryViewerModal
        storyViewerIndex={storyViewerIndex}
        stories={stories}
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
        onLikeBack={(p) => { handleLike(p); setAdmirersOpen(false); }}
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
