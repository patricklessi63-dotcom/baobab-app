import React, { useEffect, useMemo, useRef, useState } from "react";
import { Luggage, ThumbsUp, ThumbsDown, Users, X, Landmark, Bell, Play, Plus, CheckCircle2, ChevronRight } from "lucide-react";
import Avatar from "../Avatar";
import HomeHeader from "../home/HomeHeader";
import BaobabHero from "../home/BaobabHero";
import ProfileCard from "../home/ProfileCard";
import ConversationCard from "../home/ConversationCard";
import CommunityGroupCard from "./CommunityGroupCard";
import EventCard from "./EventCard";
import PostsFeed from "./PostsFeed";
import BaobabProgress from "../home/BaobabProgress";
import EmptyState from "../home/EmptyState";
import { supabase } from "../../supabaseClient";
import { rankCandidates } from "../../lib/matching/matchingService";
import { rankCommunities } from "../../lib/communities/recommendations";
import { rankEvents } from "../../lib/events/recommendations";
import { getProfileCompletion } from "../../lib/profileCompletion";
import { PRIORITY_STEPS } from "../../lib/newcomerGuideData";
import { NOTIFICATION_LABELS, NOTIF_CATEGORIES, groupNotificationRows } from "../../lib/notificationLabels";
import { primary, navy, green, coral, gold, bg, muted, card, body, primaryRgb } from "./theme";

// Panneau vertical (item demandé : notifications visibles directement dans
// l'accueil, pas seulement via la cloche du header — masquée sur mobile
// car `hidden sm:flex` dans SocialShell.jsx). Reprend exactement les mêmes
// catégories/libellés/actions que ce menu déroulant, sans nouvelle requête
// (les données sont déjà chargées une fois dans SocialShell et passées en
// props ici) — une seule liste triée par plus récent, pas de sous-onglets.
function NotificationsPanel({
  incomingFavoritesCount = 0,
  unreadDatingNotifications = [],
  unreadMessageNotifications = [],
  unreadFollowNotifications = [],
  unreadCommunityNotifications = [],
  unreadEventNotifications = [],
  unreadPostNotifications = [],
  unreadCommunityCount = 0,
  markOneNotificationRead = () => {},
  markCommunityNotificationsRead = () => {},
  onOpenProfile = () => {},
  onOpenChatWithProfile = () => {},
  goTab = () => {},
}) {
  const [category, setCategory] = useState("all");
  const catKeys = useMemo(() => NOTIF_CATEGORIES.map(([k]) => k), []);
  const pillRefs = useRef({});
  const touchStartRef = useRef(null);

  useEffect(() => {
    pillRefs.current[category]?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [category]);

  // Balayage horizontal directement sur le contenu (pas seulement sur la
  // rangée de pastilles) — swipe gauche/droite pour passer à la catégorie
  // suivante/précédente, plus naturel sur mobile qu'un simple scroll de
  // pastilles qu'il faut d'abord faire défiler avant de pouvoir taper.
  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    const idx = catKeys.indexOf(category);
    if (dx < 0 && idx < catKeys.length - 1) setCategory(catKeys[idx + 1]);
    else if (dx > 0 && idx > 0) setCategory(catKeys[idx - 1]);
  };

  const items = useMemo(() => {
    const rows = [
      ...unreadDatingNotifications.map((n) => ({
        n,
        category: "dating",
        icon: n.type === "new_match" ? "💞" : "❤️",
        label: n.actor?.name ? `${n.actor.name} — ${n.type === "new_match" ? NOTIFICATION_LABELS.new_match : NOTIFICATION_LABELS.new_like}` : (NOTIFICATION_LABELS[n.type] || "Nouvelle activité"),
        onClick: () => { markOneNotificationRead(n.id); onOpenProfile(n.target_id); },
      })),
      ...unreadMessageNotifications.map((n) => ({
        n,
        category: "messages",
        icon: "💬",
        label: n.actor?.name ? `Nouveau message de ${n.actor.name}` : NOTIFICATION_LABELS.new_message,
        onClick: () => { markOneNotificationRead(n.id); onOpenChatWithProfile(n.target_id); },
      })),
      ...unreadFollowNotifications.map((n) => ({
        n,
        category: "follows",
        icon: "👤",
        label: n.actor?.name ? `${n.actor.name} a commencé à te suivre` : NOTIFICATION_LABELS.new_follower,
        onClick: () => { markOneNotificationRead(n.id); onOpenProfile(n.target_id); },
      })),
      ...unreadCommunityNotifications.map((n) => ({
        n,
        category: "communities",
        icon: n.type?.startsWith("premium_") ? "💎" : "🌍",
        label: NOTIFICATION_LABELS[n.type] || "Nouvelle activité",
        onClick: () => { markOneNotificationRead(n.id); goTab(n.type?.startsWith("premium_") ? "premium" : "communities"); },
      })),
      ...unreadEventNotifications.map((n) => ({
        n,
        category: "events",
        icon: "🎉",
        label: NOTIFICATION_LABELS[n.type] || "Nouvelle activité",
        onClick: () => { markOneNotificationRead(n.id); goTab("events"); },
      })),
      // Bug corrigé à l'audit (même correctif que le menu déroulant de
      // SocialShell.jsx) : "post_liked"/"post_commented" tombaient avant
      // dans unreadCommunityNotifications et renvoyaient vers "communities"
      // — aucun rapport avec les publications du fil général, qui n'ont pas
      // de community_id. Isolés ici, direction "feed".
      ...unreadPostNotifications.map((n) => ({
        n,
        category: "posts",
        icon: n.type === "post_commented" ? "💬" : "❤️",
        label: n.actor?.name ? `${n.actor.name} ${n.type === "post_commented" ? "a commenté ta publication" : "a aimé ta publication"}` : (NOTIFICATION_LABELS[n.type] || "Nouvelle activité"),
        onClick: () => { markOneNotificationRead(n.id); goTab("feed"); },
      })),
    ];
    return groupNotificationRows(rows).map((row) => (
      row.groupIds
        ? { ...row, onClick: () => { row.groupIds.forEach(markOneNotificationRead); row.onClick(); } }
        : row
    ));
  }, [unreadDatingNotifications, unreadMessageNotifications, unreadFollowNotifications, unreadCommunityNotifications, unreadEventNotifications, unreadPostNotifications, markOneNotificationRead, onOpenProfile, onOpenChatWithProfile, goTab]);

  const showFavorites = incomingFavoritesCount > 0 && (category === "all" || category === "dating");
  const filteredItems = (category === "all" ? items : items.filter((row) => row.category === category)).slice(0, 8);
  const empty = !showFavorites && filteredItems.length === 0;

  return (
    <div className={`${card} p-5 mb-6`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell size={16} style={{ color: primary }} />
          <b className="text-sm">Notifications</b>
        </div>
        {unreadCommunityCount > 0 && (
          <button onClick={markCommunityNotificationsRead} className="text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ color: coral }}>
            Tout marquer comme lu
          </button>
        )}
      </div>

      {/* Rangée de pastilles (scroll + tap direct) + balayage tactile
          gauche/droite sur le contenu ci-dessous pour passer d'une
          catégorie à l'autre — même liste que le menu déroulant du header
          (NOTIF_CATEGORIES partagé). */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {NOTIF_CATEGORIES.map(([key, label]) => (
          <button
            key={key}
            ref={(el) => { pillRefs.current[key] = el; }}
            onClick={() => setCategory(key)}
            aria-pressed={category === key}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold focus-visible:outline focus-visible:outline-2"
            style={{ background: category === key ? navy : bg, color: category === key ? "#fff" : muted }}
          >
            {label}
          </button>
        ))}
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {empty ? (
          <EmptyState icon={Bell} title="Aucune notification pour l'instant." />
        ) : (
          <div className="flex flex-col gap-1">
            {showFavorites && (
              <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: gold }}>
                ⭐ {incomingFavoritesCount} personne{incomingFavoritesCount > 1 ? "s" : ""} t'a{incomingFavoritesCount > 1 ? "" : ""} ajouté en favori.
              </div>
            )}
            {filteredItems.map(({ n, icon, label, onClick }) => (
              <button key={n.id} onClick={onClick} className="text-left px-3 py-2.5 rounded-xl text-sm hover:bg-[var(--bb-bg)] focus-visible:outline focus-visible:outline-2">
                {icon} {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// "Pour toi" communautés/événements (item 7/13/14) — lecture seule ici :
// réutilise les vraies fonctions de classement déjà écrites en Phases 6-7
// (rankCommunities/rankEvents), aucun nouveau moteur de score. Cliquer une
// carte amène vers l'onglet complet, où vivent déjà rejoindre/participer —
// pas dupliqué ici pour ne pas répéter cette logique à un 3e endroit.
function useFeedRecommendations(currentUser) {
  const [communities, setCommunities] = useState([]);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    let alive = true;

    (async () => {
      const [{ data: comm }, { data: myComm }, { data: hiddenComm }] = await Promise.all([
        supabase.from("communities").select("*, community_members(count)").order("created_at", { ascending: false }).limit(20),
        supabase.from("community_members").select("community_id").eq("profile_id", currentUser.id),
        supabase.from("hidden_recommendations").select("target_id").eq("profile_id", currentUser.id).eq("target_type", "community"),
      ]);
      if (!alive) return;
      const joinedIds = new Set((myComm || []).map((r) => r.community_id));
      const hiddenIds = new Set((hiddenComm || []).map((r) => r.target_id));
      const candidates = (comm || [])
        .filter((c) => !joinedIds.has(c.id) && !hiddenIds.has(c.id))
        .map((c) => ({ ...c, memberCount: c.community_members?.[0]?.count || 0 }));
      setCommunities(rankCommunities(currentUser, candidates).filter((r) => r.score > 0).slice(0, 6).map((r) => r.community));
    })();

    (async () => {
      const [{ data: ev }, { data: myAttend }, { data: hiddenEv }] = await Promise.all([
        supabase.from("events").select("*, event_participant_count").is("canceled_at", null).eq("visibility", "public").gte("event_date", new Date().toISOString()).order("event_date", { ascending: true }).limit(20),
        supabase.from("event_attendees").select("event_id").eq("profile_id", currentUser.id),
        supabase.from("hidden_recommendations").select("target_id").eq("profile_id", currentUser.id).eq("target_type", "event"),
      ]);
      if (!alive) return;
      const attendingIds = new Set((myAttend || []).map((r) => r.event_id));
      const hiddenIds = new Set((hiddenEv || []).map((r) => r.target_id));
      const candidates = (ev || [])
        .filter((e) => !attendingIds.has(e.id) && !hiddenIds.has(e.id))
        .map((e) => ({ ...e, participantCount: e.event_participant_count || 0 }));
      setEvents(rankEvents(currentUser, candidates).filter((r) => r.score > 0).slice(0, 6).map((r) => r.event));
    })();

    return () => { alive = false; };
  }, [currentUser?.id]);

  return { recommendedCommunities: communities, recommendedEvents: events };
}

const FEED_TABS = [["pourtoi", "Pour toi"], ["suivis", "Suivis"], ["communautes", "Communautés"], ["local", "Local"]];

export default function FeedTab({
  currentUser,
  stories,
  viewedStories,
  openStory,
  setStoryComposer,
  growthStages,
  growthStageEmojis,
  growthStageIndex,
  growthPct,
  completedSteps,
  totalSteps,
  openEditProfile,
  candidates,
  handleLike,
  handlePass,
  hasLiked = () => false,
  nearbyMembers,
  newArrivals,
  matches,
  openChat,
  goTab,
  feedTab = "pourtoi",
  setFeedTab = () => {},
  followedProfiles = [],
  profilePhotos = {},
  blockedIds = new Set(),
  onError = () => {},
  incomingFavoritesCount = 0,
  unreadDatingNotifications = [],
  unreadMessageNotifications = [],
  unreadFollowNotifications = [],
  unreadCommunityNotifications = [],
  unreadEventNotifications = [],
  unreadPostNotifications = [],
  unreadCommunityCount = 0,
  markOneNotificationRead = () => {},
  markCommunityNotificationsRead = () => {},
  onOpenProfile = () => {},
  onOpenChatWithProfile = () => {},
}) {
  // Réglage "Recommandations personnalisées" (item 5/33) — si désactivé,
  // les listes restent affichées mais sans classement par score : effet
  // réel, pas cosmétique (rankCandidates n'est simplement pas appelée).
  const personalized = currentUser?.personalization_enabled !== false;
  // Bug de performance corrigé à l'audit : rankCandidates() (filtrage par
  // préférences + calcul de score de compatibilité + tri, pour chacune des
  // 3 listes ci-dessous) était réexécuté à CHAQUE rendu de FeedTab — y
  // compris ceux déclenchés par un simple changement de compteur de
  // notifications non lues, sans rapport avec candidates/nearbyMembers/
  // newArrivals — faute d'être mémoïsé.
  const neutralRank = (list) => list.map((profile) => ({ profile, match: { score: 0, level: "neutral", reasons: [], commonInterests: [] } }));
  const rankedForYou = useMemo(
    () => (personalized ? rankCandidates(currentUser, candidates) : neutralRank(candidates)),
    [personalized, currentUser, candidates]
  );
  const rankedNearby = useMemo(
    () => (personalized ? rankCandidates(currentUser, nearbyMembers) : neutralRank(nearbyMembers)),
    [personalized, currentUser, nearbyMembers]
  );
  const rankedNewArrivals = useMemo(
    () => (personalized ? rankCandidates(currentUser, newArrivals) : neutralRank(newArrivals)),
    [personalized, currentUser, newArrivals]
  );
  // Bug corrigé à l'audit : rankCandidates() applique un filtre DUR par
  // préférences (âge, distance, type de relation recherché — voir
  // filterCandidatesByPreferences dans matchingService.js), donc
  // rankedForYou/rankedNearby/rankedNewArrivals peuvent être strictement plus
  // courts que candidates/nearbyMembers/newArrivals (ex. préférence "Ma ville
  // uniquement" avec peu de monde sur place). Les 4 usages plus bas
  // (compteur BaobabHero + les 3 conditions "liste vide ?") comparaient à
  // tort .length sur la liste brute non filtrée : le bandeau d'accueil
  // pouvait annoncer "12 personnes pourraient t'intéresser" alors que la
  // section "Recommandations" en dessous, elle, n'affichait rien (aucune
  // carte ET aucun message "Pas encore de recommandations", puisque ce
  // message ne se déclenchait que si la liste brute était vide, jamais si
  // seul le résultat filtré l'était). neutralRank() ne retire aucun profil,
  // donc se rabattre sur rankedForYou/rankedNearby/rankedNewArrivals reste
  // correct même quand la personnalisation est désactivée.
  const { recommendedCommunities, recommendedEvents } = useFeedRecommendations(personalized ? currentUser : null);

  // Nudge de complétion de profil (Phase 12a) — réutilise le système A
  // (src/lib/profileCompletion.js), déjà affiché dans ProfileTab.jsx, pas
  // le "stade de croissance" de BaobabHero ci-dessus qui sert un autre but
  // (gamification). Fermeture mémorisée par profil pour ne pas la
  // remontrer une fois écartée.
  const completion = getProfileCompletion(currentUser, profilePhotos[currentUser?.id] || []);
  const nudgeDismissKey = currentUser?.id ? `bb_completion_nudge_dismissed_${currentUser.id}` : null;
  // localStorage peut jeter (navigation privée stricte, stockage désactivé
  // par politique navigateur) : sans try/catch, l'initialiseur useState
  // jetterait pendant le rendu et ferait planter tout l'onglet Découvrir,
  // pour une simple préférence d'affichage cosmétique.
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    if (!nudgeDismissKey) return true;
    try { return localStorage.getItem(nudgeDismissKey) === "1"; } catch (_) { return false; }
  });
  const dismissNudge = () => {
    if (nudgeDismissKey) { try { localStorage.setItem(nudgeDismissKey, "1"); } catch (_) {} }
    setNudgeDismissed(true);
  };
  const showCompletionNudge = !nudgeDismissed && completion.percent < 80 && completion.tips.length > 0;

  const [feedbackSent, setFeedbackSent] = useState(false);
  const sendFeedback = async (helpful) => {
    if (!currentUser || feedbackSent) return;
    setFeedbackSent(true);
    const { error } = await supabase.from("recommendation_feedback").insert({ profile_id: currentUser.id, target_type: "profile", target_id: null, helpful });
    if (error) {
      console.error(error.message, error.code, error.details, error.hint);
      // L'enregistrement a échoué (réseau, RLS...) : sans ça, "feedbackSent"
      // restait à true et l'UI affichait "Merci pour ton retour !" comme si
      // l'avis avait bien été pris en compte, sans jamais l'avoir été et
      // sans aucun moyen de réessayer.
      setFeedbackSent(false);
      onError("Impossible d'enregistrer ton retour. Réessaie.");
    }
  };
  return (
    <div className="max-w-6xl mx-auto">
      <HomeHeader currentUser={currentUser} />

      {/* Rappel Intégration (refonte visuelle, maquette screen-fil-accueil.html)
          — pas de suivi par utilisateur des démarches déjà faites (aucune
          table pour ça aujourd'hui), donc affiche simplement la première
          démarche prioritaire du guide plutôt que d'inventer une
          personnalisation qui n'existe pas encore réellement. */}
      {PRIORITY_STEPS[0] && (
        <button
          onClick={() => goTab("news")}
          className="w-full flex items-center gap-3 rounded-2xl p-3.5 mb-3 text-left"
          style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)" }}
        >
          <CheckCircle2 size={20} color="var(--bb-gold-1)" className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold truncate" style={{ color: primary }}>Prochaine étape : {PRIORITY_STEPS[0].title.toLowerCase()}</div>
            <div className="text-[11.5px] mt-0.5 truncate" style={{ color: muted }}>Consulte le Guide du nouvel arrivant</div>
          </div>
          <ChevronRight size={16} color={muted} className="flex-shrink-0" />
        </button>
      )}

      {showCompletionNudge && (
        <div className={`${card} p-4 mb-6 flex items-center gap-3`}>
          <div className="flex-1 min-w-0">
            <b className="text-sm" style={{ color: primary }}>Profil à {completion.percent}%</b>
            <p className="text-xs mt-0.5 truncate" style={{ color: muted }}>{completion.tips[0]}</p>
          </div>
          <button onClick={openEditProfile} className="bb-btn-gold shrink-0 text-xs font-bold px-3 py-1.5 rounded-full focus-visible:outline focus-visible:outline-2">
            Compléter
          </button>
          <button onClick={dismissNudge} aria-label="Fermer" className="shrink-0 p-1 rounded-full focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ---------- Statuts ---------- */}
      <div className="flex gap-3 overflow-x-auto pb-1 mb-7 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {stories.map((s, i) => {
          const seen = viewedStories[s.profile_id];
          const hasContent = s.own ? Boolean(s.id) : true;
          const ringStyle = s.own
            ? { boxShadow: "inset 0 0 0 2px rgba(255,255,255,.25)" }
            : seen
            ? { boxShadow: "inset 0 0 0 2px #D9DCE4" }
            : { boxShadow: `inset 0 0 0 2.5px ${coral}` };
          return (
            <button
              key={`${s.name}-${i}`}
              onClick={() => openStory(i)}
              aria-label={s.own ? "Ton statut" : `Voir le statut de ${s.name}`}
              className="shrink-0 relative rounded-2xl overflow-hidden text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ width: 104, height: 160, ...ringStyle }}
            >
              {hasContent && s.media_kind === "photo" && s.media_url ? (
                <img src={s.media_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(160deg,${s.bg_color || s.color},${navy})` }} />
              )}
              {hasContent && s.media_kind === "video" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,.25)", backdropFilter: "blur(2px)" }}>
                    <Play size={16} color="#fff" fill="#fff" />
                  </div>
                </div>
              )}
              {hasContent && !s.media_url && s.text && (
                <div className="absolute inset-0 flex items-center justify-center p-2.5">
                  <p className="text-white text-[11px] font-bold text-center leading-tight line-clamp-4">{s.text}</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 h-14" style={{ background: "linear-gradient(180deg,transparent,rgba(0,0,0,.55))" }} />
              <div className="absolute top-2 left-2 h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-black overflow-hidden" style={{ background: s.own ? "rgba(255,255,255,.2)" : `linear-gradient(160deg,${s.color},${navy})`, border: "1.5px solid rgba(255,255,255,.7)" }}>
                {s.own ? <Avatar name={currentUser?.name || "+"} url={currentUser?.avatar_url} size={28} /> : s.initial}
              </div>
              <span className="absolute bottom-2 left-2 right-2 text-[11px] font-bold text-white truncate">{s.own ? "Ton statut" : s.name}</span>
              {s.own && (
                <span
                  onClick={(e) => { e.stopPropagation(); setStoryComposer(true); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setStoryComposer(true); } }}
                  aria-label="Ajouter un statut"
                  className="bb-btn-gold absolute top-2 right-2 h-6 w-6 rounded-full flex items-center justify-center border-2 border-white"
                >
                  <Plus size={14} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <BaobabHero
        recommendationsCount={rankedForYou.length}
        profileCompletePct={growthPct}
        onDiscover={() => goTab("discover")}
        onCompleteProfile={openEditProfile}
      />

      <button onClick={() => goTab("news")} className={`${card} w-full text-left p-4 mb-6 flex items-center gap-3 hover:-translate-y-0.5 transition-transform duration-200`}>
        <div className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `rgba(${primaryRgb},.08)` }}>
          <Landmark size={20} style={{ color: primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-black" style={{ color: primary }}>Immigration & Intégration</div>
          <p className="text-xs mt-0.5" style={{ color: muted }}>Actualités officielles IRCC et ASFC — sources gouvernementales uniquement.</p>
        </div>
        <span className="text-xs font-bold flex-shrink-0" style={{ color: coral }}>Consulter →</span>
      </button>

      <NotificationsPanel
        incomingFavoritesCount={incomingFavoritesCount}
        unreadDatingNotifications={unreadDatingNotifications}
        unreadMessageNotifications={unreadMessageNotifications}
        unreadFollowNotifications={unreadFollowNotifications}
        unreadCommunityNotifications={unreadCommunityNotifications}
        unreadEventNotifications={unreadEventNotifications}
        unreadPostNotifications={unreadPostNotifications}
        unreadCommunityCount={unreadCommunityCount}
        markOneNotificationRead={markOneNotificationRead}
        markCommunityNotificationsRead={markCommunityNotificationsRead}
        onOpenProfile={onOpenProfile}
        onOpenChatWithProfile={onOpenChatWithProfile}
        goTab={goTab}
      />

      <div className="flex border-b mb-6" style={{ borderColor: `rgba(${primaryRgb},.08)` }}>
        {FEED_TABS.map(([key, label]) => (
          <button key={key} onClick={() => setFeedTab(key)} role="tab" aria-selected={feedTab === key} className="flex-1 py-3 text-sm font-bold relative focus-visible:outline focus-visible:outline-2" style={{ color: feedTab === key ? primary : muted }}>
            {label}
            {feedTab === key && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-10 rounded-full" style={{ background: coral }} />}
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_330px] gap-7">
        <section className="min-w-0">
          {feedTab === "pourtoi" && (
          <>
          {/* ---------- Pour toi ---------- */}
          <div className="mb-5">
            <h2 className="text-xl font-black" style={{ color: primary }}>✨ Pour toi</h2>
            <p className="text-sm mt-1" style={{ color: muted }}>Des personnes qui pourraient réellement te correspondre.</p>
          </div>
          <div className={`${card} p-5 mb-5`}>
            <div className="flex items-center justify-between mb-4">
              <div><b className="text-sm">Recommandations</b><div className="text-xs mt-0.5" style={{ color: muted }}>De nouveaux membres de la communauté</div></div>
              <button onClick={() => goTab("discover")} className="text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ color: coral }}>Tout voir</button>
            </div>
            {rankedForYou.length === 0 ? (
              <EmptyState
                title="Pas encore de recommandations."
                subtitle="Complète ton profil pour recevoir de meilleures suggestions."
                actionLabel="Compléter mon profil"
                onAction={openEditProfile}
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {rankedForYou.slice(0, 8).map(({ profile: p, match }) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    highlight="looking_for"
                    commonInterestsCount={match.commonInterests.length}
                    compatibilityScore={match.score}
                    matchReasons={match.reasons}
                    onLike={handleLike}
                    onPass={handlePass}
                  />
                ))}
              </div>
            )}
            {rankedForYou.length > 0 && (
              <div className="flex items-center justify-end gap-2 mt-4 pt-3" style={{ borderTop: `1px solid rgba(${primaryRgb},.06)` }}>
                <span className="text-xs" style={{ color: muted }}>{feedbackSent ? "Merci pour ton retour !" : "Ces suggestions te conviennent-elles ?"}</span>
                {!feedbackSent && (
                  <>
                    <button onClick={() => sendFeedback(true)} aria-label="Oui, ces suggestions me conviennent" className="h-7 w-7 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2" style={{ background: bg }}><ThumbsUp size={13} color={muted} /></button>
                    <button onClick={() => sendFeedback(false)} aria-label="Non, ces suggestions ne me conviennent pas" className="h-7 w-7 rounded-full flex items-center justify-center focus-visible:outline focus-visible:outline-2" style={{ background: bg }}><ThumbsDown size={13} color={muted} /></button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ---------- Fil d'actualité ---------- */}
          <div className="mb-5">
            <h2 className="text-xl font-black" style={{ color: primary }}>📰 Fil d'actualité</h2>
            <p className="text-sm mt-1" style={{ color: muted }}>Ce que la communauté partage.</p>
          </div>
          <PostsFeed currentUser={currentUser} blockedIds={blockedIds} onError={onError} />
          </>
          )}

          {feedTab === "suivis" && (
          <>
          {/* ---------- Suivis ---------- */}
          <div className="mb-5">
            <h2 className="text-xl font-black" style={{ color: primary }}>👥 Suivis</h2>
            <p className="text-sm mt-1" style={{ color: muted }}>Les profils que tu suis.</p>
          </div>
          <div className={`${card} p-5`}>
            {followedProfiles.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Tu ne suis personne pour l'instant."
                subtitle="Suis des profils pour les retrouver ici facilement."
                actionLabel="Découvrir des profils"
                onAction={() => goTab("discover")}
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {/* Bug corrigé à l'audit (même famille que MatchCard, voir son
                    commentaire "isLiked") : contrairement à candidates
                    (rankedForYou/rankedNearby/rankedNewArrivals, qui exclut déjà
                    les profils aimés — voir useFeedRecommendations plus haut),
                    followedProfiles vient directement de la table "follows" et
                    n'a jamais été filtré par like/match. Un profil qu'on suit
                    peut très bien être déjà aimé, voire déjà un match — le
                    bouton "J'aime" restait alors affiché et cliquable sans rien
                    faire (handleLike renvoie silencieusement via sa garde
                    hasLiked() côté App.jsx). isLiked masque désormais ce
                    bouton, et un match affiche "Message" à la place. */}
                {followedProfiles.map((p) => {
                  const isMatchedProfile = matches.some((m) => m.id === p.id);
                  const isLikedProfile = currentUser ? hasLiked(currentUser.id, p.id) : false;
                  return (
                    <ProfileCard
                      key={p.id}
                      profile={p}
                      highlight="looking_for"
                      isLiked={isLikedProfile}
                      onLike={handleLike}
                      onMessage={isMatchedProfile ? openChat : undefined}
                    />
                  );
                })}
              </div>
            )}
          </div>
          </>
          )}

          {feedTab === "local" && (
          <>
          {/* ---------- Autour de toi ---------- */}
          <div className="mb-5">
            <h2 className="text-xl font-black" style={{ color: primary }}>📍 Autour de toi</h2>
            <p className="text-sm mt-1" style={{ color: muted }}>Découvre les personnes et activités proches de toi.</p>
          </div>
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <b className="text-sm">{currentUser?.city ? `À ${currentUser.city}` : "Autour de toi"}</b>
                <div className="text-xs mt-0.5" style={{ color: muted }}>{currentUser?.city ? "Membres de ta ville" : "Renseigne ta ville pour voir qui est près de toi"}</div>
              </div>
            </div>
            {!currentUser?.city ? (
              <EmptyState
                title="Ta ville n'est pas encore renseignée."
                subtitle="Ajoute ta ville pour découvrir les personnes de Baobab près de chez toi."
                actionLabel="Ajouter ma ville"
                onAction={openEditProfile}
              />
            ) : rankedNearby.length === 0 ? (
              <EmptyState
                title={`Personne d'autre à ${currentUser.city} pour l'instant.`}
                subtitle="Invite ta communauté à rejoindre Baobab, ou découvre les membres des autres villes."
                actionLabel="Découvrir les personnes de ta ville"
                onAction={() => goTab("discover")}
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {rankedNearby.slice(0, 8).map(({ profile: p, match }) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    highlight="looking_for"
                    commonInterestsCount={match.commonInterests.length}
                    compatibilityScore={match.score}
                    matchReasons={match.reasons}
                    onLike={handleLike}
                  />
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {feedTab === "pourtoi" && (
          <>
          {/* ---------- Nouveaux au Canada ---------- */}
          <div className="mb-5 mt-8">
            <h2 className="text-xl font-black" style={{ color: primary }}>🧳 Nouveaux au Canada</h2>
            <p className="text-sm mt-1" style={{ color: muted }}>Rencontre des personnes qui vivent un parcours similaire au tien.</p>
          </div>
          <div className={`${card} p-5`}>
            {rankedNewArrivals.length === 0 ? (
              <EmptyState
                icon={Luggage}
                title="Pas encore de nouveaux arrivants identifiés."
                subtitle="Dès que des membres indiqueront depuis quand ils sont au Canada, ils apparaîtront ici."
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {rankedNewArrivals.slice(0, 8).map(({ profile: p, match }) => (
                  <ProfileCard
                    key={p.id}
                    profile={p}
                    highlight="arrived_since"
                    commonInterestsCount={match.commonInterests.length}
                    compatibilityScore={match.score}
                    matchReasons={match.reasons}
                    onLike={handleLike}
                  />
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {feedTab === "communautes" && recommendedCommunities.length > 0 && (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-black" style={{ color: primary }}>🌍 Communautés pour toi</h2>
                <p className="text-sm mt-1" style={{ color: muted }}>Selon tes centres d'intérêt et ta ville.</p>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {recommendedCommunities.map((c) => (
                  <div key={c.id} className="w-56 flex-shrink-0">
                    <CommunityGroupCard community={c} memberCount={c.memberCount} joined={false} pending={false} onView={() => goTab("communities")} onJoin={() => goTab("communities")} />
                  </div>
                ))}
              </div>
            </>
          )}
          {feedTab === "communautes" && recommendedCommunities.length === 0 && (
            <div className={`${card} p-5`}>
              <EmptyState title="Aucune communauté recommandée pour l'instant." subtitle="Complète tes centres d'intérêt et ta ville pour de meilleures suggestions." />
            </div>
          )}

          {feedTab === "local" && (
          <>
          {recommendedEvents.length > 0 && (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-black" style={{ color: primary }}>🎉 Événements pour toi</h2>
                <p className="text-sm mt-1" style={{ color: muted }}>Plusieurs de tes centres d'intérêt correspondent.</p>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
                {recommendedEvents.map((ev) => (
                  <div key={ev.id} className="w-56 flex-shrink-0">
                    <EventCard event={ev} participantCount={ev.participantCount} onView={() => goTab("events")} />
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ---------- Événements — l'onglet dédié possède désormais tout
              l'état/logique réel (recherche, filtres, création) ; ce bandeau
              n'affiche aucune donnée dupliquée, juste un lien direct. ---------- */}
          <div className={`${card} p-5 mt-8 flex items-center justify-between gap-3 flex-wrap`}>
            <div>
              <h2 className="text-lg font-black" style={{ color: primary }}>🎉 Événements Baobab</h2>
              <p className="text-sm mt-1" style={{ color: muted }}>Découvre, participe, rencontre.</p>
            </div>
            <button onClick={() => goTab("events")} className="bb-btn-gold text-sm font-bold px-4 py-2.5 rounded-full flex-shrink-0">
              Voir les événements →
            </button>
          </div>
          </>
          )}
        </section>

        <aside className="space-y-5">
          {/* ---------- Conversations ---------- */}
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4"><b className="text-sm">💬 Tes conversations</b><button onClick={() => goTab("matches")} className="text-xs font-bold focus-visible:outline focus-visible:outline-2" style={{ color: coral }}>Tout voir</button></div>
            {matches.length === 0 ? (
              <EmptyState
                title="Tes conversations apparaîtront ici."
                actionLabel="Découvrir des personnes"
                onAction={() => goTab("discover")}
              />
            ) : (
              <div className="space-y-3">
                {matches.slice(0, 5).map((m) => (
                  <ConversationCard key={m.id} match={m} onOpen={openChat} />
                ))}
              </div>
            )}
          </div>

          {/* ---------- Ton Baobab grandit ---------- */}
          <div className={`${card} p-5`}>
            <div className="text-[11px] font-black uppercase tracking-wider mb-1" style={{ color: muted }}>🌱 Ton Baobab grandit</div>
            <BaobabProgress
              stageLabel={growthStages[growthStageIndex]}
              stageEmoji={growthStageEmojis[growthStageIndex]}
              percent={growthPct}
              completedSteps={completedSteps}
              totalSteps={totalSteps}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
