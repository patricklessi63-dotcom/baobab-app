import React, { useEffect, useState } from "react";
import { Send, CheckCheck, Star, Target, ChevronRight, Users2, MapPin, PartyPopper, Heart } from "lucide-react";
import Avatar from "../Avatar";
import VerifiedBadge from "../VerifiedBadge";
import FounderBadge from "../FounderBadge";
import PremiumBadge from "../PremiumBadge";
import EmptyState from "../home/EmptyState";
import PostsFeed from "./PostsFeed";
import MediaViewerModal from "./MediaViewerModal";
import { supabase } from "../../supabaseClient";
import { getProfileCompletion } from "../../lib/profileCompletion";
import { categoryIcon, categoryLabel } from "../../lib/communities/communityConfig";
import { categoryIcon as eventCategoryIcon, categoryLabel as eventCategoryLabel } from "../../lib/events/eventConfig";
import { formatEventWhen, visibleAge } from "../../utils/format";
import { usePremiumStatus } from "../../lib/premium/usePremiumStatus";
import { openBillingPortal } from "../../lib/premium/checkout";
import { primary, green, coral, gold, bg, muted, online, verified, goldTint, goldTintDeep, primaryRgb } from "./theme";

export default function ProfileTab({
  currentUser,
  openEditProfile,
  matches,
  candidates,
  profileTab,
  setProfileTab,
  goTab,
  profilePhotos = {},
  favoritesCount = 0,
  onOpenFavorites = () => {},
  admirersCount = 0,
  onOpenAdmirers = () => {},
  onOpenPreferences = () => {},
  myCommunities = [],
  myCommunitiesLoading = false,
  onOpenCommunities = () => {},
  myUpcomingEvents = [],
  myUpcomingEventsLoading = false,
  onOpenEvents = () => {},
  followingProfiles = [],
  followerProfiles = [],
  followingIds = new Set(),
  onToggleFollow = () => {},
  onViewProfile = () => {},
  onError = () => {},
}) {
          const { isPremium, subscription } = usePremiumStatus(currentUser);
          const [managingSubscription, setManagingSubscription] = useState(false);
          const [viewerMedia, setViewerMedia] = useState(null); // { url, alt } | null
          const [networkView, setNetworkView] = useState("following");
          const handleManageSubscription = async () => {
            setManagingSubscription(true);
            try {
              await openBillingPortal();
            } catch (e) {
              console.error(e);
              onError(e.message);
              setManagingSubscription(false);
            }
          };
          const [myPostsCount, setMyPostsCount] = useState(0);
          useEffect(() => {
            if (!currentUser?.id) return;
            let alive = true;
            supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", currentUser.id)
              .then(({ count }) => { if (alive) setMyPostsCount(count || 0); });
            return () => { alive = false; };
          }, [currentUser?.id]);
          const completion = getProfileCompletion(currentUser, profilePhotos[currentUser?.id] || []);
          const isComplete = completion.percent >= 100;
          const aboutRows = [
            ["Profession", currentUser?.occupation, "💼"],
            ["Niveau d'études", currentUser?.education_level, "🎓"],
            ["Langues parlées", currentUser?.languages, "🗣"],
            ["Pays d'origine", currentUser?.country, "🌍"],
            ["Province", currentUser?.province, "🗺️"],
            ["Ville au Canada", currentUser?.city, "📍"],
            ["Au Canada depuis", currentUser?.arrived_since, "✈️"],
            ["Statut", currentUser?.immigration_status, "🇨🇦"],
            ["Recherche", currentUser?.looking_for, "♡"],
            ["Intentions", currentUser?.relationship_values, "❤️"],
            ["A des enfants", currentUser?.has_children, "👨‍👩‍👧"],
            ["Centres d'intérêt", currentUser?.interests, "✨"],
          ].filter(([, value]) => value);

  return (
          <section className="max-w-3xl mx-auto">
            <div
              className="bg-white rounded-[32px] overflow-hidden border shadow-[0_18px_60px_rgba(21,27,61,.08)]"
              style={currentUser?.is_founder ? { borderColor: gold, borderWidth: 2, boxShadow: "0 18px 60px rgba(21,27,61,.08), 0 0 0 1px " + gold } : undefined}
            >
              <div
                className="h-40 md:h-52 relative"
                style={
                  currentUser?.cover_url
                    ? { background: `url(${currentUser.cover_url}) center/cover`, cursor: "zoom-in" }
                    : { background: `linear-gradient(135deg,${primary},#2B3766 50%,${green})` }
                }
                onClick={() => currentUser?.cover_url && setViewerMedia({ url: currentUser.cover_url, alt: "Photo de couverture" })}
                role={currentUser?.cover_url ? "button" : undefined}
                aria-label={currentUser?.cover_url ? "Agrandir la photo de couverture" : undefined}
              >
                {!currentUser?.cover_url && (
                  <div className="absolute inset-0 opacity-20 text-[150px] leading-none flex items-center justify-center">🌍</div>
                )}
                <div className="absolute right-4 top-4 flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); navigator.share ? navigator.share({ title: "Baobab", text: `Découvre le profil de ${currentUser?.name} sur Baobab` }) : navigator.clipboard?.writeText(window.location.href); }} className="h-9 w-9 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center border border-white/15">
                    <Send size={15} color="#fff" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openEditProfile(); }} className="rounded-xl bg-white/15 backdrop-blur text-white px-4 py-2.5 text-xs font-bold border border-white/15">Modifier le profil</button>
                </div>
                <div className="absolute -bottom-12 left-6">
                  <div
                    className="rounded-full p-1.5 bg-white"
                    style={{ ...(currentUser?.is_founder ? { boxShadow: `0 0 0 3px ${gold}` } : null), cursor: currentUser?.avatar_url ? "zoom-in" : undefined }}
                    onClick={(e) => { if (currentUser?.avatar_url) { e.stopPropagation(); setViewerMedia({ url: currentUser.avatar_url, alt: "Photo de profil" }); } }}
                    role={currentUser?.avatar_url ? "button" : undefined}
                    aria-label={currentUser?.avatar_url ? "Agrandir la photo de profil" : undefined}
                  >
                    <Avatar name={currentUser?.name || "Toi"} url={currentUser?.avatar_url} size={92} />
                  </div>
                </div>
              </div>
              <div className="pt-16 p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-2xl font-black" style={{ color: primary }}>{currentUser?.name || "Ton profil"}</h1>
                      <span className="h-3 w-3 rounded-full" style={{ background: online }} />
                      <VerifiedBadge emailVerified={currentUser?.email_verified} phoneVerified={currentUser?.phone_verified} size={16} />
                      <FounderBadge isFounder={currentUser?.is_founder} size={16} />
                      <PremiumBadge isPremium={currentUser?.is_premium} size={16} />
                      {isComplete && (
                        <span className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: verified }} title="Profil complet">
                          <CheckCheck size={12} color="#fff" />
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1" style={{ color: muted }}>🟢 En ligne · {currentUser?.city || "Canada"} · {currentUser?.country || "Afrique"}</p>
                  </div>
                  <button onClick={() => goTab("discover")} className="px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background: "#FFF3F1", color: coral }}>Trouver des personnes</button>
                </div>
                {currentUser?.bio && <p className="text-sm leading-6 mt-5 max-w-2xl">{currentUser.bio}</p>}

                {!isComplete && (
                  <div className="mt-5 rounded-2xl p-4" style={{ background: bg }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase tracking-wider" style={{ color: primary }}>Ton profil est complété à {completion.percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white overflow-hidden mb-2">
                      <div className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${completion.percent}%`, background: `linear-gradient(90deg,${gold},${green})` }} />
                    </div>
                    {completion.tips[0] && (
                      <p className="text-xs" style={{ color: muted }}>💡 {completion.tips[0]}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3 mt-6">
                  {[[matches.length, "Matchs"], [myPostsCount, "Publications"], [candidates.length, "Profils à découvrir"]].map(([value, label]) => <div key={label} className="rounded-2xl p-4 text-center" style={{ background: bg }}><b className="text-xl" style={{ color: primary }}>{value}</b><div className="text-[11px] mt-1" style={{ color: muted }}>{label}</div></div>)}
                </div>

                <div className="flex gap-3 mt-4">
                  <button onClick={onOpenFavorites} className="flex-1 flex items-center justify-between rounded-2xl p-4" style={{ background: bg }}>
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: primary }}><Star size={16} color={gold} /> Mes favoris {favoritesCount > 0 && `(${favoritesCount})`}</span>
                    <ChevronRight size={16} color={muted} />
                  </button>
                  <button onClick={onOpenPreferences} className="flex-1 flex items-center justify-between rounded-2xl p-4" style={{ background: bg }}>
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: primary }}><Target size={16} color={coral} /> Préférences</span>
                    <ChevronRight size={16} color={muted} />
                  </button>
                </div>

                <button onClick={onOpenAdmirers} className="w-full flex items-center justify-between rounded-2xl p-4 mt-3" style={{ background: bg }}>
                  <span className="flex items-center gap-2 text-sm font-bold" style={{ color: primary }}><Heart size={16} color={coral} /> Qui m'a aimé {admirersCount > 0 && `(${admirersCount})`}</span>
                  <ChevronRight size={16} color={muted} />
                </button>
              </div>

              <div className="bb-scroll-x flex border-t" style={{ borderColor: `rgba(${primaryRgb},.08)` }}>
                {[["posts", "Publications"], ["about", "À propos"], ["network", "Mon réseau"], ["communities", "Mes communautés"], ["events", "Événements"], ["premium", "Abonnement"]].map(([key, label]) => (
                  <button key={key} onClick={() => setProfileTab(key)} className="shrink-0 px-5 py-3.5 text-sm font-bold whitespace-nowrap relative" style={{ color: profileTab === key ? primary : muted }}>
                    {label}
                    {profileTab === key && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-10 rounded-full" style={{ background: coral }} />}
                  </button>
                ))}
              </div>

              {profileTab === "network" ? (
                <div className="p-4">
                  <div className="flex gap-2 mb-4">
                    {[["following", `Abonnements (${followingProfiles.length})`], ["followers", `Abonnés (${followerProfiles.length})`]].map(([key, label]) => (
                      <button key={key} onClick={() => setNetworkView(key)} aria-pressed={networkView === key} className="flex-1 py-2.5 rounded-xl text-sm font-bold focus-visible:outline focus-visible:outline-2" style={{ background: networkView === key ? primary : bg, color: networkView === key ? "#fff" : muted }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {(networkView === "following" ? followingProfiles : followerProfiles).length === 0 ? (
                    <EmptyState
                      icon={Users2}
                      title={networkView === "following" ? "Tu ne suis personne pour l'instant." : "Personne ne te suit encore."}
                      actionLabel={networkView === "following" ? "Découvrir des profils" : undefined}
                      onAction={networkView === "following" ? () => goTab("discover") : undefined}
                    />
                  ) : (
                    <div className="flex flex-col gap-2">
                      {(networkView === "following" ? followingProfiles : followerProfiles).map((p) => (
                        <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: bg }}>
                          <button onClick={() => onViewProfile(p)} className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline focus-visible:outline-2">
                            <Avatar name={p.name} url={p.avatar_url} size={44} />
                            <div className="min-w-0">
                              <div className="text-sm font-bold truncate">{p.name}{visibleAge(p) ? `, ${visibleAge(p)}` : ""}</div>
                              {p.city && <div className="text-xs truncate" style={{ color: muted }}>{p.city}</div>}
                            </div>
                          </button>
                          <button onClick={() => onToggleFollow(p)} aria-pressed={followingIds.has(p.id)} className="px-3 py-2 rounded-full text-xs font-bold shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: followingIds.has(p.id) ? "#fff" : primary, color: followingIds.has(p.id) ? primary : "#fff" }}>
                            {followingIds.has(p.id) ? "Abonné(e)" : "Suivre"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : profileTab === "communities" ? (
                <div className="p-4">
                  {myCommunitiesLoading ? (
                    <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
                  ) : myCommunities.length === 0 ? (
                    <div className="text-center py-6">
                      <Users2 size={24} className="mx-auto mb-2" color={muted} />
                      <p className="text-sm" style={{ color: muted }}>Tu n'as pas encore rejoint de communauté.</p>
                      <button onClick={() => onOpenCommunities()} className="mt-3 px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background: primary, color: "#fff" }}>Découvrir les communautés</button>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {myCommunities.map((c) => (
                        <button key={c.id} onClick={() => onOpenCommunities(c.id)} className="text-left rounded-2xl p-4 flex items-center gap-3" style={{ background: bg }}>
                          <div className="h-11 w-11 rounded-xl flex-shrink-0 flex items-center justify-center text-lg" style={{ background: c.cover_url ? `url(${c.cover_url}) center/cover` : `linear-gradient(150deg,${gold},${coral})` }}>
                            {!c.cover_url && categoryIcon(c.category)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate" style={{ color: primary }}>{c.name}</div>
                            <div className="text-[11px] truncate flex items-center gap-1" style={{ color: muted }}>
                              {categoryLabel(c.category)}{c.city && <><MapPin size={9} /> {c.city}</>}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : profileTab === "events" ? (
                <div className="p-4">
                  {myUpcomingEventsLoading ? (
                    <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
                  ) : myUpcomingEvents.length === 0 ? (
                    <div className="text-center py-6">
                      <PartyPopper size={24} className="mx-auto mb-2" color={muted} />
                      <p className="text-sm" style={{ color: muted }}>Aucun événement à venir pour l'instant.</p>
                      <button onClick={() => onOpenEvents()} className="mt-3 px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background: primary, color: "#fff" }}>Découvrir les événements</button>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                      {myUpcomingEvents.map((ev) => (
                        <button key={ev.id} onClick={() => onOpenEvents(ev.id)} className="text-left rounded-2xl p-4 flex items-center gap-3" style={{ background: bg }}>
                          <div className="h-11 w-11 rounded-xl flex-shrink-0 flex items-center justify-center text-lg" style={{ background: ev.cover_url ? `url(${ev.cover_url}) center/cover` : `linear-gradient(150deg,${gold},${coral})` }}>
                            {!ev.cover_url && eventCategoryIcon(ev.category)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold truncate" style={{ color: primary }}>{ev.title}</div>
                            <div className="text-[11px] truncate flex items-center gap-1" style={{ color: muted }}>
                              {eventCategoryLabel(ev.category)} · {formatEventWhen(ev.event_date)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : profileTab === "premium" ? (
                <div className="p-5">
                  {isPremium ? (
                    <div className="rounded-2xl p-4" style={{ background: `linear-gradient(180deg, ${goldTint}, ${goldTintDeep})` }}>
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 20 }}>💎</span>
                        <span className="text-sm font-black" style={{ color: primary }}>Baobab Premium actif</span>
                      </div>
                      <p className="text-sm mt-2" style={{ color: muted }}>
                        Plan {subscription?.plan === "yearly" ? "annuel" : "mensuel"}
                        {subscription?.current_period_end && ` — renouvellement le ${new Date(subscription.current_period_end).toLocaleDateString("fr-CA")}`}
                        {subscription?.cancel_at_period_end && " (annulation programmée à cette date)"}
                      </p>
                      <button onClick={handleManageSubscription} disabled={managingSubscription} className="mt-3 px-4 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60" style={{ background: primary, color: "#fff" }}>
                        {managingSubscription ? "Ouverture..." : "Gérer mon abonnement"}
                      </button>
                      <p className="text-[11px] mt-2" style={{ color: muted }}>Annulation, moyen de paiement et factures — géré directement par Stripe, en dehors de Baobab.</p>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <span style={{ fontSize: 28 }}>💎</span>
                      <p className="text-sm mt-2" style={{ color: muted }}>Tu es sur le plan gratuit.</p>
                      <button onClick={() => goTab("premium")} className="mt-3 px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background: primary, color: "#fff" }}>Découvrir Premium</button>
                    </div>
                  )}
                </div>
              ) : profileTab === "posts" ? (
                <PostsFeed currentUser={currentUser} authorId={currentUser?.id} layout="grid" onError={onError} />
              ) : (
                <div className="p-6">
                  {aboutRows.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-sm" style={{ color: muted }}>Complète ton profil pour donner plus de contexte aux autres membres.</p>
                      <button onClick={openEditProfile} className="mt-3 px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background: primary, color: "#fff" }}>Compléter mon profil</button>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {aboutRows.map(([label, value, icon]) => (
                        <div key={label} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: bg }}>
                          <span className="text-lg leading-none">{icon}</span>
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wider font-black" style={{ color: muted }}>{label}</div>
                            <div className="text-sm font-bold mt-1 break-words">{value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <MediaViewerModal url={viewerMedia?.url} alt={viewerMedia?.alt} onClose={() => setViewerMedia(null)} />
          </section>
  );
}
