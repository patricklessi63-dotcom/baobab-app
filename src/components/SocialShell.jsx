import React, { useState, useEffect, useRef } from "react";
import { Home, Heart, X, MessageCircle, LogOut, Settings, UserRound, Search, Bell, Camera, Users2, PartyPopper } from "lucide-react";
import Avatar from "./Avatar";
import { supabase } from "../supabaseClient";
import { matchKey, messagePreviewLabel } from "../utils/format";
import { useClickOutside } from "../hooks/useClickOutside";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { primary, green, coral, gold, bg, muted, buttonBase } from "./social/theme";
import FeedTab from "./social/FeedTab";
import DiscoverTab from "./social/DiscoverTab";
import MessagesTab from "./social/MessagesTab";
import StoriesTab from "./social/StoriesTab";
import ProfileTab from "./social/ProfileTab";
import CommunitiesTab from "./social/CommunitiesTab";
import PostComposerModal from "./social/PostComposerModal";
import StoryViewerModal from "./social/StoryViewerModal";
import StoryComposerModal from "./social/StoryComposerModal";
import EventsTab from "./social/EventsTab";
import PublicProfileModal from "./social/PublicProfileModal";
import FavoritesModal from "./social/FavoritesModal";
import MatchPreferencesModal from "./social/MatchPreferencesModal";

const STORY_COLORS = ["#E56B5D", "#2F8F6B", "#5667A9", "#F2B84B", "#C1613D", "#1E2A4F"];
function colorForProfile(id) {
  let hash = 0;
  for (let i = 0; i < String(id).length; i++) hash = (hash * 31 + String(id).charCodeAt(i)) >>> 0;
  return STORY_COLORS[hash % STORY_COLORS.length];
}

export default function SocialShell({
  currentUser,
  setView,
  handleSignOut,
  onError = () => {},
  candidates = [],
  getMatches = () => [],
  openChat = () => {},
  closeChat = () => {},
  handleLike = () => {},
  handlePass = () => {},
  profilePhotos = {},
  openEditProfile = () => setView("editProfile"),
  setReportTarget = () => {},
  handleBlock = () => {},
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
  sendStickerMessage = () => {},
  sendMediaMessage = () => {},
  retrySend = () => {},
  otherTyping = false,
}) {
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [tab, setTab] = useState("feed");
  const [profileTab, setProfileTab] = useState("posts");
  const [composer, setComposer] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerMedia, setComposerMedia] = useState(null);
  const [composerMediaKind, setComposerMediaKind] = useState("");
  const [posts, setPosts] = useState([]);
  const [menu, setMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [stories, setStories] = useState([
    { name: "Votre statut", initial: "+", own: true, color: "#151B3D" },
  ]);
  const [storyComposer, setStoryComposer] = useState(false);
  const [storyText, setStoryText] = useState("");
  const [storyMedia, setStoryMedia] = useState(null);
  const [storyMediaKind, setStoryMediaKind] = useState("");
  const [storyMediaError, setStoryMediaError] = useState("");
  const [storyUploading, setStoryUploading] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(null);
  const [viewedStories, setViewedStories] = useState({});
  const [storyReply, setStoryReply] = useState("");
  const [viewedProfileId, setViewedProfileId] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const storyPhotoInputRef = useRef(null);
  const storyVideoInputRef = useRef(null);
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const menuRef = useRef(null);

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
      .select("id, profile_id, text, media_url, media_kind, created_at, profile:profile_id(name, avatar_url)")
      .order("created_at", { ascending: false })
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

  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [swipeExit, setSwipeExit] = useState(null); // "like" | "pass" | null
  const [discoverPhotoIndex, setDiscoverPhotoIndex] = useState(0);
  const swipeStartRef = useRef(0);

  const matches = getMatches();
  const matchIdsKey = matches.map((m) => m.id).sort().join(",");

  const [lastByKey, setLastByKey] = useState({});
  const [unreadByKey, setUnreadByKey] = useState({});
  const [recentEvents, setRecentEvents] = useState([]);

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
          setRecentEvents((prev) => [{ type: "message", matchKey: m.match_key, preview: messagePreviewLabel(m), at: m.created_at }, ...prev].slice(0, 10));
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
      .select("from_id")
      .eq("to_id", currentUser.id)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error.message, error.code, error.details, error.hint); return; }
        setIncomingFavoritesCount((data || []).length);
      });
    return () => { alive = false; };
  }, [currentUser]);

  // Notifications de communauté — table réelle et persistée (voir
  // supabase-communities.sql), contrairement à recentEvents (session-local).
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
      .select("id, type, community_id, target_type, target_id, read_at, created_at")
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

  // Les deux badges partagent le même compteur brut/mécanisme de remise à
  // zéro (markCommunityNotificationsRead) — seule la répartition par
  // target_type diffère pour savoir quel onglet allumer.
  const unreadEventNotifications = communityNotifications.filter((n) => n.target_type === "event");
  const unreadCommunityNotifications = communityNotifications.filter((n) => n.target_type !== "event");
  const eventsBadgeCount = unreadCommunityCount > 0 ? unreadEventNotifications.length : 0;
  const communitiesBadgeCount = unreadCommunityCount > 0 ? unreadCommunityNotifications.length : 0;
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

  const markCommunityNotificationsRead = () => {
    if (unreadCommunityCount === 0 || !currentUser) return;
    const ids = communityNotifications.filter((n) => !n.read_at).map((n) => n.id);
    setUnreadCommunityCount(0);
    if (ids.length === 0) return;
    supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids).then(({ error }) => {
      if (error) console.error(error.message, error.code, error.details, error.hint);
    });
  };

  const NOTIFICATION_LABELS = {
    join_request_received: "Nouvelle demande d'adhésion",
    join_request_accepted: "Ta demande d'adhésion a été acceptée",
    invite_received: "Tu as reçu une invitation",
    report_received: "Nouveau signalement dans ta communauté",
    event_invite: "Tu as été invité(e) à un événement",
    event_participation_confirmed: "Ta participation est confirmée",
    event_updated: "Un événement auquel tu participes a changé",
    event_cancelled: "Un événement auquel tu participes a été annulé",
    event_reminder_24h: "Un événement commence dans 24h",
    event_reminder_1h: "Un événement commence dans 1h",
    event_report_received: "Nouveau signalement sur ton événement",
    event_waitlist_promoted: "Tu es passé(e) de la liste d'attente à participant(e)",
  };

  const totalUnreadMessages = Object.values(unreadByKey).reduce((sum, n) => sum + n, 0);

  const viewedProfile = viewedProfileId
    ? profiles.find((p) => p.id === viewedProfileId)
      || [...candidates, ...matches].find((p) => p.id === viewedProfileId)
      || null
    : null;
  const viewedProfileIsMatch = viewedProfile ? matches.some((m) => m.id === viewedProfile.id) : false;
  const favoriteProfiles = profiles.filter((p) => favoriteIds.has(p.id));

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

  const filteredPeople = candidates.filter((p) =>
    !search.trim() ||
    `${p.name} ${p.city || ""} ${p.country || ""} ${p.occupation || ""}`.toLowerCase().includes(search.trim().toLowerCase())
  );

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

  const publish = () => {
    if (!draft.trim() && !composerMedia) return;
    const next = {
      id: Date.now(),
      name: currentUser?.name || "Toi",
      initial: (currentUser?.name || "T")[0].toUpperCase(),
      place: currentUser?.city || "Canada",
      time: "à l'instant",
      text: draft.trim() || "Nouveau partage sur Baobab ✨",
      likes: 0,
      color: green,
      media: Boolean(composerMedia),
      mediaUrl: composerMedia ? URL.createObjectURL(composerMedia) : null,
      mediaKind: composerMediaKind,
    };
    setPosts((prev) => [next, ...prev]);
    setDraft("");
    setComposerMedia(null);
    setComposerMediaKind("");
    setComposer(false);
  };

  const pickMedia = (kind) => {
    if (kind === "photo") photoInputRef.current?.click();
    else videoInputRef.current?.click();
  };

  const onMediaSelected = (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setComposerMedia(file);
    setComposerMediaKind(kind);
    e.target.value = "";
  };

  const pickStoryMedia = (kind) => {
    if (kind === "photo") storyPhotoInputRef.current?.click();
    else storyVideoInputRef.current?.click();
  };

  const onStoryMediaSelected = (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (kind === "video" && file.size > 25 * 1024 * 1024) {
      setStoryMediaError("Vidéo trop volumineuse (25 Mo max).");
      e.target.value = "";
      return;
    }
    setStoryMediaError("");
    setStoryMedia(file);
    setStoryMediaKind(kind);
    e.target.value = "";
  };

  const uploadStoryMedia = async (profileId, file) => {
    const ext = file.name.split(".").pop();
    const path = `${profileId}/story-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  };

  const addStory = async () => {
    const text = storyText.trim();
    if (!text && !storyMedia) return;
    if (!currentUser) return;
    setStoryUploading(true);
    try {
      let mediaUrl = null;
      const mediaKind = storyMedia ? storyMediaKind : null;
      if (storyMedia) mediaUrl = await uploadStoryMedia(currentUser.user_id, storyMedia);
      const { data, error } = await supabase
        .from("stories")
        .insert({ profile_id: currentUser.id, text: text || null, media_url: mediaUrl, media_kind: mediaKind })
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
        },
        ...prev.filter((s) => !s.own),
      ]);
      setStoryText("");
      setStoryMedia(null);
      setStoryMediaKind("");
      setStoryMediaError("");
      setStoryComposer(false);
    } catch (e) {
      console.error(e);
      setStoryMediaError("Impossible de publier le statut. Réessaie.");
    } finally {
      setStoryUploading(false);
    }
  };

  const openStory = (index) => {
    const s = stories[index];
    if (s?.own && !s.text && !s.media_url) { setStoryComposer(true); return; }
    setStoryViewerIndex(index);
    setViewedStories((prev) => ({ ...prev, [index]: true }));
    setStoryReply("");
  };

  const closeStoryViewer = () => setStoryViewerIndex(null);

  const nextStory = () => {
    setStoryViewerIndex((i) => {
      if (i === null) return i;
      let next = i + 1;
      while (next < stories.length && stories[next].own) next++;
      if (next >= stories.length) { return null; }
      setViewedStories((prev) => ({ ...prev, [next]: true }));
      setStoryReply("");
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
      return prev;
    });
  };

  const sendStoryReply = () => {
    if (!storyReply.trim()) return;
    setStoryReply("");
    nextStory();
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

  // Auto-avance chaque story après 5 secondes, comme sur Instagram
  useEffect(() => {
    if (storyViewerIndex === null) return;
    const t = setTimeout(() => nextStory(), 5000);
    return () => clearTimeout(t);
  }, [storyViewerIndex]);

  const nav = [
    ["feed", Home, "Accueil", null],
    ["discover", Heart, "Rencontres", null],
    ["matches", MessageCircle, "Messages", () => totalUnreadMessages],
    ["communities", Users2, "Communautés", () => communitiesBadgeCount],
    ["events", PartyPopper, "Événements", () => eventsBadgeCount],
    ["stories", Camera, "Statuts", null],
    ["profile", UserRound, "Profil", null],
  ];

  const goTab = (next) => {
    setTab(next);
    setSearch("");
    setMenu(false);
    setNotificationsOpen(false);
  };

  return (
    <div className="bb-app min-h-screen relative overflow-x-hidden" style={{ color: "#20243A", fontFamily: "'Manrope',system-ui,sans-serif" }}>
      <style>{`
        @keyframes bbAppDrift { from { transform: scale(1.02) translate3d(0,0,0); } to { transform: scale(1.07) translate3d(-1.2%, -1%, 0); } }
        @keyframes bbContentIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .bb-app-bg { animation: bbAppDrift 24s ease-in-out alternate infinite; }
        .bb-content-in { animation: bbContentIn .55s cubic-bezier(.22,1,.36,1) both; }
        .bb-glass { background: rgba(255,255,255,.78) !important; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        @media (prefers-reduced-motion: reduce) { .bb-app * { animation: none !important; transition: none !important; } }
      `}</style>
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none" style={{ background: "#F7F8FA" }} />
      <header className="sticky top-0 z-40 border-b bb-glass" style={{ borderColor: "rgba(21,27,61,.08)" }}>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 h-[74px] flex items-center gap-4">
          <button onClick={() => goTab("feed")} className="flex items-center gap-3 shrink-0">
            <div className="h-11 w-11 rounded-[15px] flex items-center justify-center text-white font-black text-xl shadow-lg" style={{ background: `linear-gradient(135deg,${coral},${gold})` }}>B</div>
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
              <div className="absolute top-14 left-0 right-0 bg-white rounded-2xl border shadow-2xl p-2 z-50">
                <div className="px-3 py-2 text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Personnes</div>
                {filteredPeople.slice(0, 4).map((p) => (
                  <button key={p.id} onClick={() => { goTab("discover"); }} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 text-left">
                    <Avatar name={p.name} url={p.avatar_url} size={38} />
                    <div className="min-w-0"><div className="text-sm font-bold truncate">{p.name}, {p.age}</div><div className="text-xs" style={{ color: muted }}>{p.city || "Canada"} · {p.country || "Afrique"}</div></div>
                  </button>
                ))}
                {filteredPeople.length === 0 && <div className="px-3 py-3 text-sm" style={{ color: muted }}>Aucun profil trouvé.</div>}
                <div className="border-t mt-1 pt-1">
                  <button onClick={() => goTab("feed")} className="w-full text-left px-3 py-2 text-xs font-bold" style={{ color: primary }}>Voir les résultats dans le fil →</button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <div ref={notifRef} className="relative">
            <button onClick={() => { setNotificationsOpen((v) => !v); setMenu(false); if (!notificationsOpen) markCommunityNotificationsRead(); }} aria-label={`Notifications${totalUnreadMessages > 0 ? ` (${totalUnreadMessages} non lus)` : ""}`} className={`${buttonBase} h-11 w-11 rounded-2xl hidden sm:flex items-center justify-center relative focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1`} style={{ background: bg }}>
              <Bell size={19} color={primary} />
              {(totalUnreadMessages > 0 || incomingFavoritesCount > 0 || communitiesBadgeCount > 0 || eventsBadgeCount > 0) && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full" style={{ background: coral }} />
              )}
            </button>
            {notificationsOpen && (
              <div className="absolute right-12 top-14 w-80 bg-white rounded-2xl border shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between px-2 pb-2"><b>Notifications</b></div>
                {recentEvents.length === 0 && incomingFavoritesCount === 0 && communityNotifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell size={22} className="mx-auto mb-2" color={muted} />
                    <p className="text-xs" style={{ color: muted }}>Aucune notification pour l'instant.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
                    {incomingFavoritesCount > 0 && (
                      <div className="px-2 py-2.5 rounded-xl text-sm" style={{ background: "#FFF3D6" }}>
                        ⭐ {incomingFavoritesCount} personne{incomingFavoritesCount > 1 ? "s" : ""} t'a{incomingFavoritesCount > 1 ? "" : ""} ajouté en favori.
                      </div>
                    )}
                    {recentEvents.map((ev, i) => (
                      <button key={i} onClick={() => { setNotificationsOpen(false); goTab("matches"); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-slate-50">
                        💬 {ev.preview}
                      </button>
                    ))}
                    {communityNotifications.map((n) => (
                      <button key={n.id} onClick={() => { setNotificationsOpen(false); goTab(n.target_type === "event" ? "events" : "communities"); }} className="text-left px-2 py-2.5 rounded-xl text-sm hover:bg-slate-50">
                        {n.target_type === "event" ? "🎉" : "🌍"} {NOTIFICATION_LABELS[n.type] || "Nouvelle activité"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
            <div ref={menuRef} className="relative">
            <button onClick={() => { setMenu((v) => !v); setNotificationsOpen(false); }} aria-label="Menu du profil" className={`${buttonBase} h-11 w-11 rounded-2xl flex items-center justify-center text-white font-black`} style={{ background: primary }}>
              {(currentUser?.name || "T")[0].toUpperCase()}
            </button>
            {menu && (
              <div className="absolute right-0 top-14 w-64 bg-white rounded-2xl border shadow-2xl p-2 z-50">
                <div className="rounded-xl p-3 mb-1" style={{ background: `linear-gradient(135deg,${primary},#2B3766)` }}>
                  <div className="text-white font-bold">{currentUser?.name || "Ton profil"}</div>
                  <div className="text-white/60 text-xs mt-0.5">{currentUser?.city || "Canada"} · 🟢 En ligne</div>
                </div>
                <button onClick={() => { goTab("profile"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-slate-50"><UserRound size={16} className="inline mr-3" />Mon profil</button>
                <button onClick={() => { goTab("discover"); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-slate-50"><Heart size={16} className="inline mr-3" />Découvrir</button>
                <button onClick={() => { setMenu(false); openEditProfile(); }} className="w-full text-left rounded-xl px-3 py-3 text-sm hover:bg-slate-50"><Settings size={16} className="inline mr-3" />Modifier mon profil</button>
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
            openChat={openChat}
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
          />
        )}

        {tab === "stories" && (
          <StoriesTab stories={stories} viewedStories={viewedStories} openStory={openStory} setStoryComposer={setStoryComposer} />
        )}

        {tab === "profile" && (
          <ProfileTab
            currentUser={currentUser}
            posts={posts}
            openEditProfile={openEditProfile}
            matches={matches}
            candidates={candidates}
            profileTab={profileTab}
            setProfileTab={setProfileTab}
            setComposer={setComposer}
            goTab={goTab}
            profilePhotos={profilePhotos}
            favoritesCount={favoriteProfiles.length}
            onOpenFavorites={() => setFavoritesOpen(true)}
            onOpenPreferences={() => setPreferencesOpen(true)}
            myCommunities={myCommunities}
            myCommunitiesLoading={myCommunitiesLoading}
            onOpenCommunities={(id) => { setOpenCommunityId(id || null); goTab("communities"); }}
            myUpcomingEvents={myUpcomingEvents}
            myUpcomingEventsLoading={myUpcomingEventsLoading}
            onOpenEvents={(id) => { setOpenEventId(id || null); goTab("events"); }}
          />
        )}

        {tab === "communities" && (
          <CommunitiesTab
            currentUser={currentUser}
            onError={onError}
            initialCommunityId={openCommunityId}
            onConsumedInitial={() => setOpenCommunityId(null)}
          />
        )}

        {tab === "events" && (
          <EventsTab
            currentUser={currentUser}
            onError={onError}
            initialEventId={openEventId}
            onConsumedInitial={() => setOpenEventId(null)}
          />
        )}
      </main>


      <nav className="fixed bottom-0 left-0 right-0 z-40 bb-glass border-t" style={{ borderColor: "rgba(21,27,61,.08)", paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-xl mx-auto grid grid-cols-7 px-2">
          {nav.map(([key, Icon, label, getBadge]) => {
            const badgeCount = getBadge ? getBadge() : 0;
            return (
              <button key={key} onClick={() => goTab(key)} aria-label={badgeCount > 0 ? `${label} (${badgeCount} non lus)` : label} className="py-3 flex flex-col items-center gap-1.5 rounded-2xl" style={{ minHeight: 48 }}>
                <div className="h-7 w-9 flex items-center justify-center rounded-xl relative" style={{ background: tab === key ? "rgba(225,107,93,.11)" : "transparent" }}>
                  <Icon size={19} color={tab === key ? coral : muted} fill={tab === key && key === "discover" ? coral : "none"} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full text-[9px] font-black text-white flex items-center justify-center" style={{ background: coral }}>
                      {badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-black text-center leading-tight w-full" style={{ color: tab === key ? primary : muted, wordBreak: "break-word" }}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <PostComposerModal
        composer={composer}
        setComposer={setComposer}
        currentUser={currentUser}
        draft={draft}
        setDraft={setDraft}
        composerMedia={composerMedia}
        composerMediaKind={composerMediaKind}
        pickMedia={pickMedia}
        onMediaSelected={onMediaSelected}
        photoInputRef={photoInputRef}
        videoInputRef={videoInputRef}
        publish={publish}
      />

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
          onLike={viewedProfileIsMatch ? null : (p) => { handleLike(p); setViewedProfileId(null); }}
          onMessage={(p) => { setViewedProfileId(null); openChat(p); }}
          onToggleFavorite={toggleFavorite}
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

      <MatchPreferencesModal
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        currentUser={currentUser}
        onSave={handleSavePreferences}
      />
    </div>
  );
}
