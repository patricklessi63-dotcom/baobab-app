import React from "react";
import { Luggage } from "lucide-react";
import Avatar from "../Avatar";
import HomeHeader from "../home/HomeHeader";
import BaobabHero from "../home/BaobabHero";
import ProfileCard from "../home/ProfileCard";
import ConversationCard from "../home/ConversationCard";
import CommunityCard from "../home/CommunityCard";
import BaobabProgress from "../home/BaobabProgress";
import EmptyState from "../home/EmptyState";
import { rankCandidates } from "../../lib/matching/matchingService";
import { primary, green, coral, gold, bg, muted, card } from "./theme";

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
}) {
  const rankedForYou = rankCandidates(currentUser, candidates);
  const rankedNearby = rankCandidates(currentUser, nearbyMembers);
  const rankedNewArrivals = rankCandidates(currentUser, newArrivals);
  return (
    <div className="max-w-6xl mx-auto">
      <HomeHeader currentUser={currentUser} />

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
                    <button onClick={() => openStory(i)} className="h-full w-full rounded-full p-[2px] bg-white flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1">
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
                  <button onClick={() => openStory(i)} aria-label={`Voir le statut de ${s.name}`} className="h-full w-full rounded-full p-[2px] bg-white flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1">
                    <div className="h-full w-full rounded-full flex items-center justify-center text-white font-black text-lg" style={{ background: `linear-gradient(160deg,${s.color},${primary})` }} aria-hidden="true">
                      {s.initial}
                    </div>
                  </button>
                )}
              </div>
              <span className="text-[11px] font-semibold truncate w-full text-center" style={{ color: seen ? muted : "#20243A" }}>{s.own ? "Ton statut" : s.name}</span>
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

      <div className="grid xl:grid-cols-[minmax(0,1fr)_330px] gap-7">
        <section className="min-w-0">
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
          </div>

          {/* ---------- Autour de toi ---------- */}
          <div className="mb-5 mt-8">
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
