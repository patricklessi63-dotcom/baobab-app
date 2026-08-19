import React, { useMemo, useState } from "react";
import { Heart, X, Info } from "lucide-react";
import VerifiedBadge from "../VerifiedBadge";
import FounderBadge from "../FounderBadge";
import { visibleAge } from "../../utils/format";
import ChipSelect from "../ChipSelect";
import MatchCard from "./MatchCard";
import MatchInfoModal from "./MatchInfoModal";
import EmptyState from "../home/EmptyState";
import Paywall from "../premium/Paywall";
import { computeMatch, rankCandidates } from "../../lib/matching/matchingService";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { useHiddenRecommendations } from "../../lib/useHiddenRecommendations";
import { LOOKING_FOR_OPTIONS, INTERESTS_OPTIONS, LANGUAGES_OPTIONS } from "../../constants";
import { primary, green, coral, gold, bg, muted, card, buttonBase, online, body, primaryRgb } from "./theme";

const ACTIVE_RECENTLY_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isActiveRecently(p) {
  if (p.is_online) return true;
  if (!p.last_seen) return false;
  return Date.now() - new Date(p.last_seen).getTime() < ACTIVE_RECENTLY_WINDOW_MS;
}

const SORT_OPTIONS = ["✨ Pertinence", "📍 Proximité", "❤️ Intentions", "🆕 Nouveaux"];
const GRID_PAGE_SIZE = 12;

export default function DiscoverTab({
  filteredPeople,
  topPerson,
  topPhotos,
  discoverPhotoIndex,
  setDiscoverPhotoIndex,
  swipeX,
  swipeExit,
  swiping,
  onSwipeStart,
  onSwipeMove,
  onSwipeEnd,
  decideSwipe,
  currentUser,
  onViewProfile = () => {},
  handleLike = () => {},
  handlePass = () => {},
  matches = [],
  favoriteIds = new Set(),
  toggleFavorite = () => {},
  setReportTarget = () => {},
  handleBlock = () => {},
  openChat = () => {},
  goTab = () => {},
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [mode, setMode] = useState("pile");
  const [sort, setSort] = useState(SORT_OPTIONS[0]);
  const [cityFilter, setCityFilter] = useState("");
  const [intentionFilter, setIntentionFilter] = useState([]);
  const [interestFilter, setInterestFilter] = useState([]);
  const [languageFilter, setLanguageFilter] = useState([]);
  const [activeRecentlyFilter, setActiveRecentlyFilter] = useState(false);
  const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);
  const { isPremium } = usePremiumStatus(currentUser);
  const { hiddenIds, hide: hideProfile } = useHiddenRecommendations(currentUser, "profile");

  const cityOptions = useMemo(
    () => Array.from(new Set(filteredPeople.map((p) => (p.city || "").trim()).filter(Boolean))).sort(),
    [filteredPeople]
  );

  const filteredForGrid = useMemo(() => {
    return filteredPeople.filter((p) => {
      if (hiddenIds.has(p.id)) return false;
      if (cityFilter && (p.city || "").trim() !== cityFilter) return false;
      if (intentionFilter.length > 0) {
        const theirs = (p.looking_for || "").split(",").map((s) => s.trim());
        if (!intentionFilter.some((f) => theirs.includes(f))) return false;
      }
      // Filtres avancés (Premium) — les contrôles restent masqués derrière
      // le paywall pour un compte gratuit, donc ces états restent à leur
      // valeur par défaut (vide/faux) et ce filtrage reste un no-op pour eux.
      if (interestFilter.length > 0) {
        const theirs = (p.interests || "").split(",").map((s) => s.trim());
        if (!interestFilter.some((f) => theirs.includes(f))) return false;
      }
      if (languageFilter.length > 0) {
        const theirs = (p.languages || "").split(",").map((s) => s.trim());
        if (!languageFilter.some((f) => theirs.includes(f))) return false;
      }
      if (activeRecentlyFilter && !isActiveRecently(p)) return false;
      return true;
    });
  }, [filteredPeople, hiddenIds, cityFilter, intentionFilter, interestFilter, languageFilter, activeRecentlyFilter]);

  const ranked = useMemo(() => rankCandidates(currentUser, filteredForGrid), [currentUser, filteredForGrid]);

  const sorted = useMemo(() => {
    const list = [...ranked];
    if (sort === "📍 Proximité") {
      list.sort((a, b) => {
        const rank = (l) => (l.match.breakdown.location >= 10 ? 0 : l.match.breakdown.location > 0 ? 1 : 2);
        return rank(a) - rank(b) || b.match.score - a.match.score;
      });
    } else if (sort === "❤️ Intentions") {
      list.sort((a, b) => Number(b.match.compatibleIntentions) - Number(a.match.compatibleIntentions) || b.match.score - a.match.score);
    } else if (sort === "🆕 Nouveaux") {
      list.sort((a, b) => new Date(b.profile.created_at || 0) - new Date(a.profile.created_at || 0));
    }
    // "✨ Pertinence" (défaut) : déjà trié par score dans rankCandidates.
    return list;
  }, [ranked, sort]);

  const visible = sorted.slice(0, visibleCount);

  return (
    <>
          <section className="max-w-2xl mx-auto">
            <div className="text-center mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "#FFF1EC", color: coral }}><Heart size={13} fill={coral} /> Connexions qui ont du sens</div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-3" style={{ color: primary }}>Découvrir</h1>
              <p className="text-sm mt-1" style={{ color: muted }}>{mode === "pile" ? "Glisse à droite pour aimer, à gauche pour passer." : "Des profils classés selon ta compatibilité estimée."}</p>
            </div>

            <div className="flex justify-center gap-2 mb-6">
              <button onClick={() => setMode("pile")} className="px-4 py-2 rounded-full text-xs font-bold" style={{ background: mode === "pile" ? primary : bg, color: mode === "pile" ? "#fff" : muted }}>🔥 Pile</button>
              <button onClick={() => setMode("grid")} className="px-4 py-2 rounded-full text-xs font-bold" style={{ background: mode === "grid" ? primary : bg, color: mode === "grid" ? "#fff" : muted }}>🌱 Pour toi</button>
            </div>

            {mode === "pile" ? (
            filteredPeople.length === 0 ? (
              <div className={`${card} p-10 text-center`}>
                <div className="text-5xl mb-4">🌍</div>
                <h2 className="text-xl font-black" style={{ color: primary }}>Pas encore de nouveaux profils</h2>
                <p className="text-sm mt-2" style={{ color: muted }}>Invite des amis africains installés au Canada à rejoindre Baobab.</p>
                <button onClick={() => navigator.clipboard?.writeText(window.location.href)} className="mt-5 px-5 py-3 rounded-xl text-white font-bold" style={{ background: primary }}>Inviter ma communauté</button>
              </div>
            ) : (
              <div className="relative h-[620px] select-none" style={{ touchAction: "pan-y" }}>
                <style>{`
                  @keyframes bbCardIn { from { opacity: 0; transform: scale(.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
                  .bb-swipe-card { animation: bbCardIn .35s cubic-bezier(.22,1,.36,1) both; }
                `}</style>

                {/* Pile de cartes derrière, purement visuelle */}
                {filteredPeople[2] && (
                  <div className="absolute inset-0 bg-white rounded-[34px] border" style={{ transform: "scale(0.92) translateY(22px)", opacity: 0.5 }} />
                )}
                {filteredPeople[1] && (
                  <div className="absolute inset-0 bg-white rounded-[34px] border overflow-hidden" style={{ transform: "scale(0.96) translateY(11px)", opacity: 0.8 }}>
                    <div className="h-full" style={{ background: `linear-gradient(145deg,${primary},${green},${gold})`, opacity: 0.5 }} />
                  </div>
                )}

                {(() => {
                  const p = topPerson;
                  const photos = topPhotos;
                  const photo = photos[discoverPhotoIndex]?.url || photos[0]?.url;
                  const rotate = swipeX / 18;
                  const isExiting = Boolean(swipeExit);
                  const exitX = swipeExit === "like" ? 640 : swipeExit === "pass" ? -640 : 0;
                  const transform = `translateX(${isExiting ? exitX : swipeX}px) rotate(${isExiting ? rotate * 2.5 : rotate}deg)`;
                  const likeOpacity = Math.min(Math.max(swipeX, 0) / 100, 1);
                  const passOpacity = Math.min(Math.max(-swipeX, 0) / 100, 1);

                  return (
                    <div
                      className="bb-swipe-card absolute inset-0 bg-white rounded-[34px] overflow-hidden border shadow-[0_24px_80px_rgba(21,27,61,.18)] cursor-grab active:cursor-grabbing"
                      style={{ transform, opacity: isExiting ? 0.4 : 1, transition: swiping ? "none" : "transform .35s cubic-bezier(.22,1,.36,1), opacity .35s", touchAction: "pan-y" }}
                      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); onSwipeStart(e.clientX); }}
                      onPointerMove={(e) => onSwipeMove(e.clientX)}
                      onPointerUp={onSwipeEnd}
                      onPointerCancel={onSwipeEnd}
                      onPointerLeave={() => swiping && onSwipeEnd()}
                    >
                      <div className="h-[500px] relative overflow-hidden" style={{ background: photo ? `linear-gradient(180deg,rgba(${primaryRgb},.05) 35%,rgba(${primaryRgb},.88)),url(${photo}) center/cover` : `linear-gradient(145deg,${primary},${green},${gold})` }}>
                        {!photo && <div className="absolute inset-0 flex items-center justify-center text-8xl">🌍</div>}

                        {photos.length > 1 && (
                          <div className="absolute top-3 left-3 right-3 flex gap-1.5 z-10">
                            {photos.map((_, i) => (
                              <div key={i} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
                                <div className="h-full bg-white" style={{ width: i === discoverPhotoIndex ? "100%" : i < discoverPhotoIndex ? "100%" : "0%" }} />
                              </div>
                            ))}
                          </div>
                        )}
                        {photos.length > 1 && (
                          <>
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setDiscoverPhotoIndex((i) => Math.max(0, i - 1))} className="absolute left-0 top-0 bottom-24 w-1/3 z-[5]" aria-label="Photo précédente" />
                            <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setDiscoverPhotoIndex((i) => Math.min(photos.length - 1, i + 1))} className="absolute right-0 top-0 bottom-24 w-1/3 z-[5]" aria-label="Photo suivante" />
                          </>
                        )}

                        <div className="absolute top-4 left-4 flex gap-2 z-10">
                          <span className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-[11px] font-bold">{p.city || "Canada"}</span>
                          {p.country && <span className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-white text-[11px] font-bold">🌍 {p.country}</span>}
                        </div>

                        <div className="absolute top-16 left-6 border-4 rounded-2xl px-3 py-1 z-10" style={{ borderColor: online, transform: `rotate(-14deg)`, opacity: likeOpacity }}>
                          <span className="text-lg font-black tracking-widest" style={{ color: online }}>OUI</span>
                        </div>
                        <div className="absolute top-16 right-6 border-4 rounded-2xl px-3 py-1 z-10" style={{ borderColor: coral, transform: `rotate(14deg)`, opacity: passOpacity }}>
                          <span className="text-lg font-black tracking-widest" style={{ color: coral }}>PASSER</span>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => onViewProfile(p)}
                            className="text-3xl font-black flex items-center gap-2 text-left"
                          >
                            {p.name}{visibleAge(p) ? `, ${visibleAge(p)}` : ""}
                            <VerifiedBadge emailVerified={p.email_verified} phoneVerified={p.phone_verified} size={20} color="#fff" />
                            <FounderBadge isFounder={p.is_founder} size={20} />
                          </button>
                          <p className="text-xs text-white/60 mt-0.5">Toucher le nom pour voir le profil complet</p>
                          <div className="text-sm text-white/75 mt-1">📍 {p.city || "Canada"} · {p.occupation || "Nouveau membre"}</div>
                          {p.bio && <p className="text-sm text-white/80 mt-3 leading-6 max-w-lg">{p.bio}</p>}
                          <div className="flex flex-wrap gap-2 mt-4">
                            {p.languages && <span className="px-2.5 py-1 rounded-full bg-white/12 text-xs">🗣 {p.languages}</span>}
                            {p.arrived_since && <span className="px-2.5 py-1 rounded-full bg-white/12 text-xs">✈️ Au Canada depuis {p.arrived_since}</span>}
                            {p.looking_for && <span className="px-2.5 py-1 rounded-full bg-white/12 text-xs">♡ {p.looking_for}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="p-5 md:p-6">
                        {p.interests && <div className="mb-4"><div className="text-[11px] font-black uppercase tracking-wider" style={{ color: muted }}>Centres d'intérêt</div><div className="text-sm mt-1">{p.interests}</div></div>}

                        {(() => {
                          const compat = computeMatch(currentUser, p);
                          const compatColor = compat.level === "high" ? green : compat.level === "medium" ? gold : muted;
                          return (
                            <div className="mb-4 rounded-2xl p-4" style={{ background: bg }}>
                              <div className="flex items-center justify-between mb-2">
                                <button onClick={() => setInfoOpen(true)} className="text-[11px] font-black uppercase tracking-wider focus-visible:outline focus-visible:outline-2 flex items-center gap-1" style={{ color: primary }}>🌱 Baobab Match <Info size={12} /></button>
                                <span className="text-lg font-black" style={{ color: compatColor }}>~{compat.score}%</span>
                              </div>
                              <div className="text-[10px] font-bold uppercase tracking-wide -mt-1.5 mb-2" style={{ color: muted }}>Compatibilité estimée</div>
                              <div className="h-2 rounded-full bg-white overflow-hidden mb-3">
                                <div className="h-full rounded-full" style={{ width: `${compat.score}%`, background: `linear-gradient(90deg,${gold},${green})` }} />
                              </div>
                              <ul className="space-y-1">
                                {compat.reasons.map((r, i) => (
                                  <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: body }}>
                                    <span style={{ color: green }}>✓</span>{r}
                                  </li>
                                ))}
                              </ul>
                              {compat.commonInterests.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                  {compat.commonInterests.map((t) => (
                                    <span key={t} className="px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize" style={{ background: "#FFF3F1", color: coral }}>{t}</span>
                                  ))}
                                </div>
                              )}
                              <p className="text-[10px] mt-3 leading-4" style={{ color: muted }}>{compat.disclaimer}</p>
                            </div>
                          );
                        })()}

                        <div className="flex items-center justify-center gap-5">
                          <button aria-label="Passer ce profil" onPointerDown={(e) => e.stopPropagation()} onClick={() => decideSwipe("pass")} className={`${buttonBase} h-16 w-16 rounded-full border-2 flex items-center justify-center bg-white`} style={{ borderColor: "#E5E7EF" }}><X size={28} color={muted} /></button>
                          <button aria-label="Aimer ce profil" onPointerDown={(e) => e.stopPropagation()} onClick={() => decideSwipe("like")} className={`${buttonBase} h-[72px] w-[72px] rounded-full text-white flex items-center justify-center shadow-xl`} style={{ background: `linear-gradient(135deg,${coral},#D94F70)` }}><Heart size={30} fill="white" /></button>
                        </div>
                        <div className="text-center text-[11px] mt-3" style={{ color: muted }}>♥ Oui si tu veux faire connaissance · × Passer</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )
            ) : (
              <div>
                {filteredPeople.length === 0 ? (
                  <div className={`${card} p-10`}>
                    <EmptyState
                      title="Ton réseau Baobab est encore en train de grandir 🌱"
                      subtitle="De nouveaux membres arrivent régulièrement — reviens bientôt, ou complète ton profil pour de meilleures suggestions."
                    />
                  </div>
                ) : (
                  <>
                    <div className={`${card} p-4 mb-4`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-black uppercase tracking-wider" style={{ color: muted }}>Trier par</span>
                        <button onClick={() => setInfoOpen(true)} className="text-xs font-bold flex items-center gap-1 focus-visible:outline focus-visible:outline-2" style={{ color: primary }}><Info size={13} /> Comment ça marche ?</button>
                      </div>
                      <ChipSelect options={SORT_OPTIONS} value={sort} onChange={setSort} />
                      {cityOptions.length > 0 && (
                        <>
                          <div className="text-xs font-black uppercase tracking-wider mt-3 mb-1.5" style={{ color: muted }}>Ville</div>
                          <ChipSelect options={cityOptions} value={cityFilter} onChange={setCityFilter} />
                        </>
                      )}
                      <div className="text-xs font-black uppercase tracking-wider mt-3 mb-1.5" style={{ color: muted }}>Intentions</div>
                      <ChipSelect options={LOOKING_FOR_OPTIONS} value={intentionFilter} onChange={setIntentionFilter} multi />
                    </div>

                    {isPremium ? (
                      <div className={`${card} p-4 mb-4`}>
                        <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: muted }}>💎 Filtres avancés</span>
                        <div className="text-xs font-black uppercase tracking-wider mt-3 mb-1.5" style={{ color: muted }}>Centres d'intérêt</div>
                        <ChipSelect options={INTERESTS_OPTIONS} value={interestFilter} onChange={setInterestFilter} multi />
                        <div className="text-xs font-black uppercase tracking-wider mt-3 mb-1.5" style={{ color: muted }}>Langues parlées</div>
                        <ChipSelect options={LANGUAGES_OPTIONS} value={languageFilter} onChange={setLanguageFilter} multi />
                        <label className="flex items-center gap-2 mt-3.5 text-sm font-semibold" style={{ color: primary }}>
                          <input type="checkbox" checked={activeRecentlyFilter} onChange={(e) => setActiveRecentlyFilter(e.target.checked)} />
                          Actif·ve récemment uniquement
                        </label>
                      </div>
                    ) : (
                      <div className="mb-4">
                        <Paywall
                          title="Filtres de recherche avancés"
                          description="Affine Découverte par centres d'intérêt, langues parlées et activité récente."
                          onDiscover={() => goTab("premium")}
                        />
                      </div>
                    )}

                    {sorted.length === 0 ? (
                      <div className={`${card} p-10`}>
                        <EmptyState
                          title="Aucun profil ne correspond à ces critères pour l'instant."
                          subtitle="Élargis tes préférences pour voir plus de monde."
                          actionLabel="Réinitialiser les filtres"
                          onAction={() => { setCityFilter(""); setIntentionFilter([]); setInterestFilter([]); setLanguageFilter([]); setActiveRecentlyFilter(false); }}
                        />
                      </div>
                    ) : (
                      <>
                        <p className="text-sm mb-3" style={{ color: muted }}>
                          {sorted.length} profil{sorted.length > 1 ? "s" : ""} correspond{sorted.length > 1 ? "ent" : ""} à tes critères.
                        </p>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {visible.map(({ profile: p, match }) => (
                            <MatchCard
                              key={p.id}
                              profile={p}
                              match={match}
                              isMatch={matches.some((m) => m.id === p.id)}
                              isFavorite={favoriteIds.has(p.id)}
                              onLike={handleLike}
                              onPass={handlePass}
                              onMessage={openChat}
                              onToggleFavorite={toggleFavorite}
                              onReport={(target) => setReportTarget(target)}
                              onBlock={handleBlock}
                              onHide={(p) => hideProfile(p.id)}
                              onViewProfile={onViewProfile}
                            />
                          ))}
                        </div>
                        {visibleCount < sorted.length && (
                          <button onClick={() => setVisibleCount((c) => c + GRID_PAGE_SIZE)} className="w-full mt-5 py-3 rounded-xl font-bold text-sm" style={{ background: bg, color: primary }}>
                            Afficher plus
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          <MatchInfoModal open={infoOpen} onClose={() => setInfoOpen(false)} />
    </>
  );
}
