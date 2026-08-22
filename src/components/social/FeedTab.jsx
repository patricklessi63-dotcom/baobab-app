import React, { useEffect, useMemo, useState } from "react";
import { Luggage, ThumbsUp, ThumbsDown, Users, X, Landmark, Bell } from "lucide-react";
import Avatar from "../Avatar";
import HomeHeader from "../home/HomeHeader";
import BaobabHero from "../home/BaobabHero";
import ProfileCard from "../home/ProfileCard";
import ConversationCard from "../home/ConversationCard";
import CommunityCard from "../home/CommunityCard";
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
import { NOTIFICATION_LABELS, NOTIF_CATEGORIES } from "../../lib/notificationLabels";
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
  unreadCommunityCount = 0,
  markOneNotificationRead = () => {},
  markCommunityNotificationsRead = () => {},
  onOpenProfile = () => {},
  onOpenChatWithProfile = () => {},
  goTab = () => {},
}) {
  const [category, setCategory] = useState("all");

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
    ];
    return rows.sort((a, b) => new Date(b.n.created_at) - new Date(a.n.created_at));
  }, [unreadDatingNotifications, unreadMessageNotifications, unreadFollowNotifications, unreadCommunityNotifications, unreadEventNotifications, markOneNotificationRead, onOpenProfile, onOpenChatWithProfile, goTab]);

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

      {/* Balayage horizontal des catégories — même liste que le menu déroulant
          du header (NOTIF_CATEGORIES partagé), tactile nativement sur mobile
          (overflow-x-auto, comme la rangée de statuts juste au-dessus). */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {NOTIF_CATEGORIES.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            aria-pressed={category === key}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-bold focus-visible:outline focus-visible:outline-2"
            style={{ background: category === key ? navy : bg, color: category === key ? "#fff" : muted }}
          >
            {label}
          </button>
        ))}
      </div>

      {empty ? (
        <EmptyState icon={Bell} title="Aucune notification pour l'instant." />
      ) : (
        <div className="flex flex-col gap-1">
          {showFavorites && (
            <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: "#FFF3D6", color: gold }}>
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
  nearbyMembers,
  newArrivals,
  communities,
  matches,
  openChat,
  goTab,
  setSearch,
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
  const neutralRank = (list) => list.map((profile) => ({ profile, match: { score: 0, level: "neutral", reasons: [], commonInterests: [] } }));
  const rankedForYou = personalized ? rankCandidates(currentUser, candidates) : neutralRank(candidates);
  const rankedNearby = personalized ? rankCandidates(currentUser, nearbyMembers) : neutralRank(nearbyMembers);
  const rankedNewArrivals = personalized ? rankCandidates(currentUser, newArrivals) : neutralRank(newArrivals);
  const { recommendedCommunities, recommendedEvents } = useFeedRecommendations(personalized ? currentUser : null);

  // Nudge de complétion de profil (Phase 12a) — réutilise le système A
  // (src/lib/profileCompletion.js), déjà affiché dans ProfileTab.jsx, pas
  // le "stade de croissance" de BaobabHero ci-dessus qui sert un autre but
  // (gamification). Fermeture mémorisée par profil pour ne pas la
  // remontrer une fois écartée.
  const completion = getProfileCompletion(currentUser, profilePhotos[currentUser?.id] || []);
  const nudgeDismissKey = currentUser?.id ? `bb_completion_nudge_dismissed_${currentUser.id}` : null;
  const [nudgeDismissed, setNudgeDismissed] = useState(() => nudgeDismissKey ? localStorage.getItem(nudgeDismissKey) === "1" : true);
  const dismissNudge = () => {
    if (nudgeDismissKey) localStorage.setItem(nudgeDismissKey, "1");
    setNudgeDismissed(true);
  };
  const showCompletionNudge = !nudgeDismissed && completion.percent < 80 && completion.tips.length > 0;

  const [feedbackSent, setFeedbackSent] = useState(false);
  const sendFeedback = async (helpful) => {
    if (!currentUser || feedbackSent) return;
    setFeedbackSent(true);
    const { error } = await supabase.from("recommendation_feedback").insert({ profile_id: currentUser.id, target_type: "profile", target_id: null, helpful });
    if (error) console.error(error.message, error.code, error.details, error.hint);
  };
  return (
    <div className="max-w-6xl mx-auto">
      <HomeHeader currentUser={currentUser} />

      {showCompletionNudge && (
        <div className={`${card} p-4 mb-6 flex items-center gap-3`}>
          <div className="flex-1 min-w-0">
            <b className="text-sm" style={{ color: primary }}>Profil à {completion.percent}%</b>
            <p className="text-xs mt-0.5 truncate" style={{ color: muted }}>{completion.tips[0]}</p>
          </div>
          <button onClick={openEditProfile} className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full text-white focus-visible:outline focus-visible:outline-2" style={{ background: coral }}>
            Compléter
          </button>
          <button onClick={dismissNudge} aria-label="Fermer" className="shrink-0 p-1 rounded-full focus-visible:outline focus-visible:outline-2" style={{ color: muted }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ---------- Statuts ---------- */}
      <div className="flex gap-4 overflow-x-auto pb-1 mb-7 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {stories.map((s, i) => {
          const seen = viewedStories[i];
          const ringBg = s.own
            ? "transparent"
            : seen
            ? "#D9DCE4"
            : `linear-gradient(135deg,${coral},${gold},${green})`;
          return (
            <div key={`${s.name}-${i}`} className="shrink-0 flex flex-col items-center gap-1.5 w-[68px]">
              <div className="h-[64px] w-[64px] rounded-full flex items-center justify-center p-[3px] relative" style={{ background: ringBg }}>
                {s.own ? (
                  <>
                    <button onClick={() => openStory(i)} className="h-full w-full rounded-full p-[2px] bg-[var(--bb-bg)] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1">
                      <div className="h-full w-full rounded-full flex items-center justify-center relative" style={{ background: bg }}>
                        <Avatar name={currentUser?.name || "+"} url={currentUser?.avatar_url} size={56} />
                      </div>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setStoryComposer(true); }}
                      aria-label="Ajouter un statut"
                      className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center text-white text-sm font-black border-2 border-white focus-visible:outline focus-visible:outline-2"
                      style={{ background: coral }}
                    >
                      +
                    </button>
                  </>
                ) : (
                  <button onClick={() => openStory(i)} aria-label={`Voir le statut de ${s.name}`} className="h-full w-full rounded-full p-[2px] bg-[var(--bb-bg)] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1">
                    <div className="h-full w-full rounded-full flex items-center justify-center text-white font-black text-lg" style={{ background: `linear-gradient(160deg,${s.color},${navy})` }} aria-hidden="true">
                      {s.initial}
                    </div>
                  </button>
                )}
              </div>
              <span className="text-[11px] font-semibold truncate w-full text-center" style={{ color: seen ? muted : body }}>{s.own ? "Ton statut" : s.name}</span>
            </div>
          );
        })}
      </div>

      <BaobabHero
        recommendationsCount={candidates.length}
        profileCompletePct={growthPct}
        onDiscover={() => goTab("discover")}
        onCompleteProfile={openEditProfile}
      />

      <button onClick={() => goTab("news")} className={`${card} w-full text-left p-4 mb-6 flex items-center gap-3 hover:-translate-y-0.5 transition-transform duration-200`}>
        <div className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `rgba(${primaryRgb},.08)` }}>
          <Landmark size={20} style={{ color: navy }} />
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
            {candidates.length === 0 ? (
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
            {candidates.length > 0 && (
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
                {followedProfiles.map((p) => (
                  <ProfileCard key={p.id} profile={p} highlight="looking_for" onLike={handleLike} />
                ))}
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
            ) : nearbyMembers.length === 0 ? (
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
            {newArrivals.length === 0 ? (
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
            <button onClick={() => goTab("events")} className="text-sm font-bold px-4 py-2.5 rounded-full text-white flex-shrink-0" style={{ background: coral }}>
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

          {/* ---------- Communautés ---------- */}
          <div id="bb-communities-section" className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-4"><b className="text-sm">🤝 Communautés</b></div>
            {communities.length === 0 ? (
              <EmptyState title="Les communautés apparaîtront ici à mesure que Baobab grandit." />
            ) : (
              <div className="space-y-3">
                {communities.map(([city, count]) => (
                  <CommunityCard key={city} city={city} memberCount={count} onView={(c) => { setSearch(c); goTab("discover"); }} />
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
