import React, { useEffect, useRef, useState } from "react";
import { Search, Plus, X, Users2, Sparkles, Sprout, Flame, MessageCircle, Rocket, Target } from "lucide-react";
import { supabase } from "../../supabaseClient";
import CommunityGroupCard from "./CommunityGroupCard";
import CommunityFilters from "./CommunityFilters";
import CommunityDetailView from "./CommunityDetailView";
import CommunityCreateForm from "./CommunityCreateForm";
import CommunityInviteModal from "./CommunityInviteModal";
import ReportModal from "./ReportModal";
import PublicProfileModal from "./PublicProfileModal";
import EmptyState from "../home/EmptyState";
import HorizontalScrollRow from "../HorizontalScrollRow";
import InfoTipCard from "../InfoTipCard";
import { SkeletonCard } from "../Skeleton";
import { rankCommunities } from "../../lib/communities/recommendations";
import { COMMUNITY_REPORT_CATEGORIES } from "../../lib/communities/communityConfig";
import { trackActivation } from "../../lib/trackActivation";
import { validateMediaFile } from "../../lib/mediaValidation";
import { compressImageIfNeeded } from "../../lib/imageCompression";
import { extFromMime } from "../../lib/mediaConstants";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { escapeLikePattern, escapeOrFilterValue } from "../../lib/searchQuery";
import { primary, coral, muted, bg, card, navy } from "./theme";

const COMMUNITY_MEDIA_BUCKET = "community-media";

// Cartes-conseil qui comblent les rangées à balayage horizontal quand peu
// de communautés réelles existent encore (Baobab en début de croissance) —
// conseils génériques uniquement, jamais une statistique inventée.
const COMMUNITY_TIPS = {
  pourToi: [
    { icon: Sparkles, title: "Complète ton profil", text: "Plus tes centres d'intérêt et ta ville sont précis, meilleures sont tes recommandations." },
    { icon: Sprout, title: "Sois parmi les premiers", text: "Rejoindre tôt une communauté, c'est en devenir un membre fondateur — pas juste un numéro de plus." },
  ],
  populaires: [
    { icon: Flame, title: "Qu'est-ce qui rend une communauté active ?", text: "Des publications régulières, des présentations et des événements organisés par ses membres." },
    { icon: MessageCircle, title: "Présente-toi", text: "Un simple message de bienvenue suffit souvent à lancer la conversation." },
  ],
  nouvelles: [
    { icon: Rocket, title: "Sois le/la premier·ère", text: "Une communauté toute neuve n'attend qu'un premier message pour démarrer." },
    { icon: Target, title: "Aucune communauté ne te correspond ?", text: "Crée la tienne en quelques secondes avec le bouton \"Créer\" ci-dessus." },
  ],
};

const PAGE_SIZE = 20;
const REPORT_TARGET_LABEL = { post: "cette publication", comment: "ce commentaire", member: "ce membre", community: "cette communauté" };

function buildListQuery({ search, filterCity, filterCategory, filterVisibility }) {
  let query = supabase.from("communities").select("*, community_members(count)", { count: "exact" });
  if (search.trim()) {
    // Bug corrigé : seul escapeOrFilterValue (virgule/guillemet) était
    // appliqué ici — escapeLikePattern (%/_) manquait, alors que
    // searchQuery.js a été créé précisément pour les deux à la fois (voir
    // son en-tête). Une recherche contenant "%" ou "_" était donc traitée
    // comme un joker ILIKE au lieu du texte littéral saisi (ex. "50%" ou
    // un nom de communauté avec "_" matchait n'importe quoi autour).
    const term = escapeOrFilterValue(escapeLikePattern(search.trim()));
    query = query.or(`name.ilike."%${term}%",description.ilike."%${term}%"`);
  }
  if (filterCity.trim()) query = query.ilike("city", `%${escapeLikePattern(filterCity.trim())}%`);
  if (filterCategory) query = query.eq("category", filterCategory);
  if (filterVisibility) query = query.eq("visibility", filterVisibility);
  // Tri secondaire sur "id" (voir loadMore) : deux communautés créées à la
  // même seconde partageraient sinon un ordre indéterminé d'une page à
  // l'autre — même correctif que PostsFeed.jsx.
  return query.order("created_at", { ascending: false }).order("id", { ascending: false });
}

function withMemberCount(rows) {
  return (rows || []).map((c) => ({ ...c, memberCount: c.community_members?.[0]?.count || 0 }));
}

export default function CommunitiesTab({ currentUser, onError, onCommunitiesChanged, initialCommunityId, onConsumedInitial, blockedIds = new Set(), onOpenEvents = () => {}, onCreateEventInCommunity = () => {}, myPlatformRole = null, onReportProfile = () => {}, onBlockProfile = () => {},
  // Bug identifié à l'audit (passe 94) : PublicProfileModal ouvert depuis la
  // liste des membres d'une communauté n'avait ni onMessage, ni onLike/
  // onUnlike, ni onToggleFollow, ni onToggleFavorite — contrairement à la
  // même modale ouverte depuis Découverte/Favoris/Fil (SocialShell.jsx).
  // Seuls Signaler/Bloquer avaient été ajoutés (voir 8207416) ; un membre de
  // communauté restait donc impossible à suivre, ajouter en favori, liker ou
  // contacter sans quitter l'écran pour aller le retrouver ailleurs. Mêmes
  // props déjà branchées ailleurs dans SocialShell, aucune nouvelle logique.
  matches = [], favoriteIds = new Set(), followingIds = new Set(), hasLiked = () => false,
  onLikeProfile = () => {}, onUnlikeProfile = () => {}, onToggleFavoriteProfile = () => {}, onToggleFollowProfile = () => {}, onMessageProfile = () => {},
  // Bug corrigé au même audit que ci-dessus (passe 158) : profilePhotos
  // n'était pas transmis du tout, alors que SocialShell.jsx (Découverte/
  // Favoris/Fil) le passe déjà à sa propre PublicProfileModal. Résultat :
  // consulter le profil d'un membre depuis une communauté n'affichait
  // jamais que son avatar (galerie tronquée à 1 photo, jamais les autres
  // photos réellement ajoutées à son profil), sans aucune flèche de
  // navigation entre elles.
  profilePhotos = {},
}) {
  const isPlatformAdmin = myPlatformRole === "admin" || myPlatformRole === "super_admin";
  const [view, setView] = useState("list"); // list | detail | create
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [communities, setCommunities] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listCursor, setListCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  // Garde anti-double-appel pour "Charger plus" (même bug déjà corrigé sur
  // EventsTab.jsx/PostsFeed.jsx) : le bouton n'était jamais désactivé
  // pendant la requête, donc un double clic/tap rapide lançait deux
  // loadMore() en parallèle, tous deux lisant le même listCursor (pas encore
  // avancé), récupérant et ajoutant deux fois la même page de communautés à
  // la liste affichée (doublons visibles + clé React dupliquée).
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);

  const [myMemberships, setMyMemberships] = useState({}); // communityId -> role
  const [myPending, setMyPending] = useState(new Set());

  const [community, setCommunity] = useState(null);
  const [creatorName, setCreatorName] = useState("");
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [postSubmitting, setPostSubmitting] = useState(false);
  const postSubmittingRef = useRef(false); // garde synchrone : setPostSubmitting (état React, async) laisse une fenêtre où un double-clic rapide déclenche handleSubmitPost deux fois avant que le bouton ne se désactive visuellement — même pattern que publishingRef dans PostsFeed.jsx.
  const [myReactions, setMyReactions] = useState({}); // postId -> emoji|null
  const [reactionCounts, setReactionCounts] = useState({}); // postId -> { emoji: count }
  const [postCommentCounts, setPostCommentCounts] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [members, setMembers] = useState([]);
  const [memberCount, setMemberCount] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [reports, setReports] = useState([]);
  const [events, setEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [inviteTarget, setInviteTarget] = useState(null);
  const [myInvites, setMyInvites] = useState([]);

  const [viewedMemberProfile, setViewedMemberProfile] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const joinInFlightRef = useRef(new Set());
  const leaveInFlightRef = useRef(new Set());
  const removeMemberInFlightRef = useRef(new Set());
  const likeInFlightRef = useRef(new Set());
  // Garde anti-double-appel pour Accepter/Refuser une demande d'adhésion
  // (CommunityAdminPanel) : les boutons ne se désactivent pas pendant
  // l'appel, donc un double-clic/tap rapide envoyait deux fois le même RPC.
  // accept_join_request/reject_join_request ne trouvent la ligne "pending"
  // que pour le premier appel (voir supabase-communities.sql) ; le second
  // lève "Demande introuvable ou deja traitee", que le catch ci-dessous
  // affichait à tort comme un échec alors que la demande venait d'être
  // traitée avec succès par le premier appel.
  const joinRequestInFlightRef = useRef(new Set());
  // Même garde pour Accepter/Refuser une invitation à une communauté : ces
  // deux boutons appelaient accept_invite/decline_invite sans aucune
  // protection anti-double-clic (contrairement à Accepter/Refuser une
  // demande d'adhésion ci-dessus, corrigé plus tôt) — un double-tap rapide
  // déclenchait deux appels RPC concurrents, et si le second réussissait
  // aussi (invite déjà traitée mais pas d'erreur renvoyée), adjustMemberCount
  // incrémentait le compteur de membres deux fois pour une seule adhésion.
  const inviteInFlightRef = useRef(new Set());
  // Devient true une fois myMemberships réellement chargé depuis le
  // serveur (voir l'effet ci-dessous) — utilisé par goDetail pour savoir si
  // myMemberships[id] === undefined signifie "non-membre confirmé" ou
  // simplement "pas encore su" (voir commentaire dans goDetail).
  const membershipsLoadedRef = useRef(false);
  // Bug identifié à l'audit (même famille que la course réseau corrigée
  // dans CommunityInviteModal) : goDetail() enchaîne plusieurs allers-retours
  // réseau séquentiels avant de lancer Promise.all(loadPosts/loadMembers/...).
  // Sans garde de séquence, ouvrir la communauté A puis revenir en arrière et
  // ouvrir B avant que la requête de A ne soit terminée pouvait laisser la
  // réponse de A (arrivée en dernier) écraser community/posts/members/events
  // affichés pour B — l'utilisateur voit alors le contenu d'une communauté
  // qui n'est plus celle sélectionnée. detailRequestRef sert de jeton :
  // seule la dernière requête lancée est autorisée à appliquer son résultat.
  const detailRequestRef = useRef(0);

  const isNeutralHome = !search.trim() && !filterCity.trim() && !filterCategory && !filterVisibility;

  // ---------- Adhésions/demandes de l'utilisateur — une fois au montage ----------
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    membershipsLoadedRef.current = false;
    supabase.from("community_members").select("community_id, role").eq("profile_id", currentUser.id).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.error(error); return; }
      const map = {};
      (data || []).forEach((r) => { map[r.community_id] = r.role; });
      setMyMemberships(map);
      membershipsLoadedRef.current = true;
    });
    supabase.from("community_join_requests").select("community_id").eq("profile_id", currentUser.id).eq("status", "pending").then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.error(error); return; }
      setMyPending(new Set((data || []).map((r) => r.community_id)));
    });
    supabase
      .from("community_invites")
      .select("id, community_id, invited_by, communities(name, cover_url), inviter:invited_by(name)")
      .eq("invited_profile_id", currentUser.id)
      .eq("status", "pending")
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error(error); return; }
        setMyInvites(data || []);
      });
    return () => { alive = false; };
  }, [currentUser?.id]);

  // ---------- Liste — recherche/filtres débouncés, jamais tout charger ----------
  useEffect(() => {
    if (view !== "list") return;
    let alive = true;
    setListLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error, count } = await buildListQuery({ search, filterCity, filterCategory, filterVisibility })
          .limit(PAGE_SIZE);
        if (!alive) return;
        if (error) throw error;
        setCommunities(withMemberCount(data));
        setHasMore((count || 0) > PAGE_SIZE);
        const last = (data || [])[(data || []).length - 1];
        setListCursor(last ? { created_at: last.created_at, id: last.id } : null);
      } catch (e) {
        console.error(e);
        onError("Impossible de charger les communautés.");
      } finally {
        if (alive) setListLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [view, search, filterCity, filterCategory, filterVisibility]); // eslint-disable-line react-hooks/exhaustive-deps

  // Curseur (created_at, id) plutôt que numéro de page (voir PostsFeed.jsx
  // pour le même correctif) : une nouvelle communauté créée pendant le
  // scroll décalait tous les offsets suivants avec .range(), causant des
  // doublons ou des communautés jamais vues à la page suivante.
  const loadMore = async () => {
    if (!listCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const { data, error } = await buildListQuery({ search, filterCity, filterCategory, filterVisibility })
        .or(`created_at.lt.${listCursor.created_at},and(created_at.eq.${listCursor.created_at},id.lt.${listCursor.id})`)
        .limit(PAGE_SIZE);
      if (error) throw error;
      const rows = withMemberCount(data);
      setCommunities((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      const last = rows[rows.length - 1];
      setListCursor(last ? { created_at: last.created_at, id: last.id } : null);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger plus de communautés.");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const adjustMemberCount = (communityId, delta) => {
    setCommunities((cs) => cs.map((c) => (c.id === communityId ? { ...c, memberCount: Math.max(0, c.memberCount + delta) } : c)));
  };

  // ---------- Détail ----------
  // Le filtrage blockedIds n'est plus appliqué ici avant setPosts : si on le
  // fait au moment du chargement, un blocage effectué ensuite (depuis cette
  // même communauté ou un autre onglet pendant qu'elle reste montée) ne fait
  // rien disparaître tant que la communauté n'est pas rechargée. Comme pour
  // EventsTab, on garde les données brutes en état et on filtre avec la prop
  // blockedIds (réactive) au moment du rendu, plus bas.
  // Chaque fonction ci-dessous accepte désormais un requestId optionnel (le
  // jeton detailRequestRef au moment de l'appel) : quand il est fourni, le
  // résultat n'est appliqué que si aucune navigation vers une autre
  // communauté n'a eu lieu entre-temps (voir commentaire sur
  // detailRequestRef plus haut). Bug identifié à l'audit (même famille que
  // celui déjà corrigé dans EventsTab.jsx, passe 106) : ce jeton n'était en
  // fait vérifié qu'avant setCommunity, jamais avant les 5 appels du
  // Promise.all lui-même (loadPosts/loadMembers/loadEvents/
  // loadJoinRequests/loadReports) — chacun posait donc quand même son
  // résultat en retard sans aucune vérification.
  const loadPosts = async (id, requestId) => {
    setPostsLoading(true);
    try {
      // is_founder/is_premium/email_verified/phone_verified ajoutés à toutes
      // les jointures "profiles" de ce fichier (même correctif que
      // PostsFeed.jsx) pour que CommunityPostCard puisse afficher le badge
      // de statut de l'auteur d'une publication.
      const { data, error } = await supabase
        .from("community_posts")
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .eq("community_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (requestId !== undefined && detailRequestRef.current !== requestId) return;
      setPosts(data || []);
      const ids = (data || []).map((p) => p.id);
      if (ids.length > 0) {
        const [likesRes, commentsRes] = await Promise.all([
          supabase.from("community_post_likes").select("post_id, profile_id, emoji").in("post_id", ids),
          supabase.from("community_comments").select("post_id").in("post_id", ids),
        ]);
        if (requestId !== undefined && detailRequestRef.current !== requestId) return;
        const counts = {}; const mine = {};
        (likesRes.data || []).forEach((l) => {
          counts[l.post_id] = counts[l.post_id] || {};
          counts[l.post_id][l.emoji] = (counts[l.post_id][l.emoji] || 0) + 1;
          if (l.profile_id === currentUser.id) mine[l.post_id] = l.emoji;
        });
        const commentCounts = {};
        (commentsRes.data || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });
        setReactionCounts(counts);
        setMyReactions(mine);
        setPostCommentCounts(commentCounts);
      } else {
        setReactionCounts({}); setMyReactions({}); setPostCommentCounts({});
      }
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les publications.");
    } finally {
      // Même jeton que ci-dessus : sans cette vérification, la réponse
      // tardive de la communauté A (déjà quittée) coupait le "Chargement…"
      // de la communauté B au milieu de SON propre chargement — la liste
      // de B semblait chargée (ou vide) une fraction de seconde avant que
      // ses vraies données n'arrivent.
      if (requestId === undefined || detailRequestRef.current === requestId) setPostsLoading(false);
    }
  };

  const loadMembers = async (id, requestId) => {
    setMembersLoading(true);
    try {
      // "id" est indispensable dans la sélection imbriquée ci-dessous, pas
      // seulement les champs affichés : CommunityMemberRow transmet ce
      // profil tel quel à onViewProfile -> PublicProfileModal, dont les
      // boutons Signaler/Bloquer envoient profile.id comme to_id (App.jsx).
      // Même bug que celui déjà corrigé pour l'onglet "Participants" d'un
      // événement (EventsTab.jsx) : sans "id" ici, Signaler et Bloquer
      // échouaient silencieusement (to_id undefined) pour tout profil
      // ouvert depuis l'onglet "Membres" d'une communauté.
      const { data, error } = await supabase
        .from("community_members")
        // is_founder/is_premium/email_verified/phone_verified ajoutés (bug
        // corrigé à l'audit, même famille que le "id" manquant ci-dessus) :
        // CommunityMemberRow ne peut afficher les badges de statut (parité
        // avec MatchCard/DiscoverTab pour ce même profil) que si ces champs
        // sont chargés ici.
        .select("*, profiles(id, name, avatar_url, city, show_city, is_founder, is_premium, email_verified, phone_verified)")
        .eq("community_id", id)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      if (requestId !== undefined && detailRequestRef.current !== requestId) return;
      // Le total affiché doit compter tous les membres réels (cohérent avec
      // la carte de liste, qui utilise community_members(count) côté
      // serveur) — seule la liste affichée exclut les profils bloqués, pour
      // ne pas les montrer à l'écran sans fausser le compteur. Le filtrage
      // se fait désormais au rendu (comme les publications ci-dessus) pour
      // qu'un blocage effectué en cours de session masque immédiatement le
      // membre sans recharger la communauté.
      setMemberCount((data || []).length);
      setMembers(data || []);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les membres.");
    } finally {
      // Même jeton que ci-dessus : sinon la réponse tardive de la
      // communauté A coupait le "Chargement…" de la communauté B pendant
      // que celle-ci chargeait encore ses propres membres.
      if (requestId === undefined || detailRequestRef.current === requestId) setMembersLoading(false);
    }
  };

  const loadJoinRequests = async (id, requestId) => {
    const { data, error } = await supabase
      .from("community_join_requests")
      .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
      .eq("community_id", id).eq("status", "pending")
      .order("created_at", { ascending: true });
    if (!error && !(requestId !== undefined && detailRequestRef.current !== requestId)) setJoinRequests(data || []);
  };

  const loadReports = async (id, requestId) => {
    const { data, error } = await supabase
      .from("community_reports")
      .select("*")
      .eq("community_id", id).eq("status", "open")
      .order("created_at", { ascending: false });
    if (!error && !(requestId !== undefined && detailRequestRef.current !== requestId)) setReports(data || []);
  };

  const loadEvents = async (id, requestId) => {
    setEventsLoading(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_participant_count")
        .eq("community_id", id)
        .is("canceled_at", null)
        .order("event_date", { ascending: true });
      if (error) throw error;
      const rows = data || [];
      // Statut de participation de l'utilisateur courant pour ces événements
      // — sans ça, EventCard ne reçoit jamais de prop "status" ici (contrairement
      // à EventsTab qui la fournit toujours) et n'affiche donc jamais le badge
      // "Tu participes ✓" / "Sur liste d'attente" pour un événement de
      // communauté auquel on est déjà inscrit·e.
      let statusByEventId = {};
      if (currentUser && rows.length > 0) {
        const { data: attendeeRows, error: attendeeError } = await supabase
          .from("event_attendees")
          .select("event_id, status")
          .eq("profile_id", currentUser.id)
          .in("event_id", rows.map((e) => e.id));
        if (attendeeError) console.error(attendeeError);
        else statusByEventId = Object.fromEntries((attendeeRows || []).map((r) => [r.event_id, r.status]));
      }
      if (requestId !== undefined && detailRequestRef.current !== requestId) return;
      setEvents(rows.map((e) => ({ ...e, participantCount: e.event_participant_count || 0, status: statusByEventId[e.id] || null })));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les événements.");
    } finally {
      // Même jeton que ci-dessus : sinon la réponse tardive de la
      // communauté A coupait le "Chargement…" de la communauté B pendant
      // que celle-ci chargeait encore ses propres événements.
      if (requestId === undefined || detailRequestRef.current === requestId) setEventsLoading(false);
    }
  };

  const goDetail = async (comm) => {
    const requestId = ++detailRequestRef.current;
    setSelectedId(comm.id);
    setView("detail");
    setCommunity(null);
    setPosts([]); setMembers([]); setMemberCount(0); setJoinRequests([]); setReports([]); setEvents([]);
    setPostDraft("");
    try {
      const { data, error } = await supabase.from("communities").select("*").eq("id", comm.id).single();
      if (error) throw error;
      // Une navigation plus récente a démarré entre-temps (voir commentaire
      // sur detailRequestRef) : on abandonne avant d'écraser l'état affiché.
      if (detailRequestRef.current !== requestId) return;
      setCommunity(data);
      if (data.created_by) {
        const { data: creator } = await supabase.from("profiles").select("name").eq("id", data.created_by).single();
        setCreatorName(creator?.name || "");
      } else {
        setCreatorName("");
      }
      // Rôle lu depuis myMemberships (état alimenté par un effet séparé et
      // asynchrone au montage) — mais goDetail peut être appelé en lien
      // direct (notification, "Mes communautés" sur le profil) sur un
      // composant qui vient de monter, avant que cet effet n'ait fini de
      // charger myMemberships. Dans ce cas myMemberships[comm.id] vaut
      // undefined même pour un owner/admin/modérateur, ce qui faisait
      // sauter silencieusement loadJoinRequests/loadReports ci-dessous :
      // l'onglet "Gestion" apparaissait bien (recalculé plus tard une fois
      // myMemberships chargé) mais restait vide tant qu'on ne quittait pas
      // la communauté pour y revenir. On retombe donc sur une lecture
      // directe du rôle si myMemberships n'est pas encore garanti à jour.
      let role = myMemberships[comm.id];
      if (role === undefined && !membershipsLoadedRef.current && currentUser) {
        const { data: myRow } = await supabase
          .from("community_members")
          .select("role")
          .eq("community_id", comm.id)
          .eq("profile_id", currentUser.id)
          .maybeSingle();
        role = myRow?.role || null;
        if (role) setMyMemberships((m) => ({ ...m, [comm.id]: role }));
      }
      if (detailRequestRef.current !== requestId) return;
      await Promise.all([
        loadPosts(comm.id, requestId),
        loadMembers(comm.id, requestId),
        loadEvents(comm.id, requestId),
        (role === "owner" || role === "admin") ? loadJoinRequests(comm.id, requestId) : Promise.resolve(),
        (role === "owner" || role === "admin" || role === "moderator") ? loadReports(comm.id, requestId) : Promise.resolve(),
      ]);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger cette communauté.");
    }
  };

  const goList = () => {
    setView("list");
    setSelectedId(null);
    setCommunity(null);
  };

  // Ouverture directe depuis "Mes communautés" (profil) — consommé une
  // seule fois pour ne pas rouvrir la même communauté à chaque montage.
  useEffect(() => {
    if (!initialCommunityId) return;
    goDetail({ id: initialCommunityId });
    onConsumedInitial?.();
  }, [initialCommunityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Rejoindre / quitter ----------
  const handleJoin = async (comm) => {
    if (!currentUser || joinInFlightRef.current.has(comm.id)) return;
    joinInFlightRef.current.add(comm.id);
    try {
      if (comm.visibility === "public") {
        const { error } = await supabase.from("community_members").insert({ community_id: comm.id, profile_id: currentUser.id, role: "member" });
        if (error) throw error;
        setMyMemberships((m) => ({ ...m, [comm.id]: "member" }));
        adjustMemberCount(comm.id, 1);
        if (selectedId === comm.id) setMemberCount((n) => n + 1);
        onCommunitiesChanged?.();
        trackActivation(currentUser.id, "community_joined");
      } else if (comm.visibility === "private") {
        const { error } = await supabase.from("community_join_requests").insert({ community_id: comm.id, profile_id: currentUser.id });
        if (error) throw error;
        setMyPending((s) => new Set(s).add(comm.id));
      }
    } catch (e) {
      console.error(e);
      onError("Impossible de rejoindre cette communauté.");
    } finally {
      joinInFlightRef.current.delete(comm.id);
    }
  };

  const handleLeave = async (comm) => {
    // Garde-fou manquant identifié à l'audit (même bug déjà corrigé sur
    // handleLeave d'EventsTab) : le bouton "Quitter" reste affiché et
    // cliquable pendant toute la requête (viewerRole ne change qu'après
    // succès), et n'est protégé que par un window.confirm — deux clics
    // "confirmés" successifs avant la fin du premier appel décrémentaient
    // le compteur de membres deux fois pour un seul départ réel.
    if (!currentUser || leaveInFlightRef.current.has(comm.id)) return;
    leaveInFlightRef.current.add(comm.id);
    try {
      const { error } = await supabase.from("community_members").delete().eq("community_id", comm.id).eq("profile_id", currentUser.id);
      if (error) throw error;
      setMyMemberships((m) => { const n = { ...m }; delete n[comm.id]; return n; });
      adjustMemberCount(comm.id, -1);
      if (selectedId === comm.id) {
        setMemberCount((n) => Math.max(0, n - 1));
        setMembers((m) => m.filter((x) => x.profile_id !== currentUser.id));
      }
      onCommunitiesChanged?.();
    } catch (e) {
      console.error(e);
      onError("Impossible de quitter cette communauté.");
    } finally {
      leaveInFlightRef.current.delete(comm.id);
    }
  };

  // Suppression definitive (item : le proprietaire ou un admin peut
  // supprimer une communaute) — RLS (supabase-delete-own-content.sql)
  // n'autorise que le proprietaire ou is_admin_or_above(), donc cette
  // requete echoue proprement pour tout le monde d'autre.
  const handleDeleteCommunity = async (comm) => {
    try {
      const { error } = await supabase.from("communities").delete().eq("id", comm.id);
      if (error) throw error;
      onCommunitiesChanged?.();
      goList();
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer cette communauté.");
    }
  };

  // ---------- Admin : demandes d'adhésion ----------
  const handleAcceptRequest = async (req) => {
    if (joinRequestInFlightRef.current.has(req.id)) return;
    joinRequestInFlightRef.current.add(req.id);
    try {
      const { error } = await supabase.rpc("accept_join_request", { p_request_id: req.id });
      if (error) throw error;
      setJoinRequests((r) => r.filter((x) => x.id !== req.id));
      adjustMemberCount(req.community_id, 1);
      loadMembers(req.community_id);
    } catch (e) {
      console.error(e);
      onError("Impossible d'accepter cette demande.");
    } finally {
      joinRequestInFlightRef.current.delete(req.id);
    }
  };

  const handleRejectRequest = async (req) => {
    if (joinRequestInFlightRef.current.has(req.id)) return;
    joinRequestInFlightRef.current.add(req.id);
    try {
      const { error } = await supabase.rpc("reject_join_request", { p_request_id: req.id });
      if (error) throw error;
      setJoinRequests((r) => r.filter((x) => x.id !== req.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de refuser cette demande.");
    } finally {
      joinRequestInFlightRef.current.delete(req.id);
    }
  };

  // ---------- Publications / réactions / commentaires ----------
  // Retourne true si la publication a bien été créée, false sinon — le
  // composeur (CommunityPostComposer) s'en sert pour décider s'il doit
  // vider le média sélectionné : sans ce retour, il le videtait
  // inconditionnellement dès le clic, faisant perdre la photo/vidéo
  // choisie en cas d'échec (validation, upload ou insertion).
  const handleSubmitPost = async (mediaFile, mediaKind) => {
    if ((!postDraft.trim() && !mediaFile) || !currentUser || !community) return false;
    if (postSubmittingRef.current) return false;
    postSubmittingRef.current = true;
    setPostSubmitting(true);
    try {
      let mediaUrl = null;
      let uploadedPath = null;
      if (mediaFile) {
        const { ok, error: validationError } = await validateMediaFile(mediaFile, mediaKind);
        if (!ok) { onError(validationError); setPostSubmitting(false); return false; }
        // Bug corrigé à l'audit (croisement exhaustif avec
        // compressImageIfNeeded, déjà utilisé par PostsFeed.jsx) : une photo
        // de publication de communauté partait toujours en taille originale,
        // jamais compressée — les vidéos ne sont volontairement jamais
        // touchées (voir imageCompression.js).
        if (mediaKind === "image") mediaFile = await compressImageIfNeeded(mediaFile);
        const path = `${community.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extFromMime(mediaFile.type)}`;
        await uploadWithProgress({ bucket: COMMUNITY_MEDIA_BUCKET, path, file: mediaFile });
        uploadedPath = path;
        const { data: signed } = await supabase.storage.from(COMMUNITY_MEDIA_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        mediaUrl = signed?.signedUrl || null;
      }
      const { data, error } = await supabase
        .from("community_posts")
        .insert({
          community_id: community.id,
          author_id: currentUser.id,
          body: postDraft.trim(),
          media_url: mediaUrl,
          media_kind: mediaUrl ? mediaKind : null,
        })
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)").single();
      if (error) {
        // Upload Storage réussi mais insertion community_posts échouée :
        // sans ce nettoyage le fichier restait orphelin dans le bucket, plus
        // jamais référencé par rien.
        if (uploadedPath) supabase.storage.from(COMMUNITY_MEDIA_BUCKET).remove([uploadedPath]).catch(() => {});
        throw error;
      }
      setPosts((p) => [data, ...p]);
      setPostDraft("");
      return true;
    } catch (e) {
      console.error(e);
      onError("Impossible de publier. Réessaie.");
      return false;
    } finally {
      postSubmittingRef.current = false;
      setPostSubmitting(false);
    }
  };

  // Bug identifié à l'audit (passe 132) : contrairement à deletePost
  // (PostsFeed.jsx) et handleDeletePhoto (EventsTab.jsx), qui nettoient
  // toutes deux le fichier Storage après confirmation de la suppression en
  // base, cette fonction ne supprimait jamais le fichier de
  // community-media — une publication avec photo/vidéo laissait son
  // fichier orphelin dans le bucket pour toujours (fuite de stockage). La
  // colonne media_url stocke une URL SIGNÉE (bucket privé, voir
  // supabase-communities-3.sql), pas le chemin brut : on l'extrait de
  // l'URL, comme cleanupUrl dans PostsFeed.jsx, en retirant en plus le
  // ?token=... de signature avant de retrouver le chemin réel. La policy
  // storage "community-media: supprime ses propres fichiers" n'autorise
  // que le propriétaire du fichier à le supprimer (owner = auth.uid()) :
  // un modérateur qui supprime la publication de quelqu'un d'autre voit
  // donc cet appel échouer silencieusement (.catch) — la ligne en base est
  // tout de même bien supprimée, seul le nettoyage Storage est un best-effort.
  const cleanupCommunityMediaUrl = (url) => {
    if (!url) return;
    const marker = `/${COMMUNITY_MEDIA_BUCKET}/`;
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const storagePath = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    if (!storagePath) return;
    supabase.storage.from(COMMUNITY_MEDIA_BUCKET).remove([storagePath]).catch(() => {});
  };

  const handleDeletePost = async (post) => {
    try {
      const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
      if (error) throw error;
      setPosts((p) => p.filter((x) => x.id !== post.id));
      cleanupCommunityMediaUrl(post.media_url);
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer cette publication.");
    }
  };

  const applyReactionDelta = (postId, emoji, delta) => {
    setReactionCounts((rc) => {
      const forPost = { ...(rc[postId] || {}) };
      forPost[emoji] = Math.max(0, (forPost[emoji] || 0) + delta);
      if (forPost[emoji] === 0) delete forPost[emoji];
      return { ...rc, [postId]: forPost };
    });
  };

  const handleReact = async (post, emoji) => {
    if (!currentUser || likeInFlightRef.current.has(post.id)) return;
    likeInFlightRef.current.add(post.id);
    const previous = myReactions[post.id] || null;
    const removing = previous === emoji;
    setMyReactions((m) => ({ ...m, [post.id]: removing ? null : emoji }));
    if (previous) applyReactionDelta(post.id, previous, -1);
    if (!removing) applyReactionDelta(post.id, emoji, 1);
    try {
      if (removing) {
        const { error } = await supabase.from("community_post_likes").delete().eq("post_id", post.id).eq("profile_id", currentUser.id);
        if (error) throw error;
      } else if (previous) {
        // Changer d'émoji sur une réaction déjà posée : une seule requête
        // UPDATE de la ligne existante (contrainte unique post_id+profile_id),
        // au lieu d'un DELETE puis un INSERT séparés comme avant. Avec deux
        // requêtes, une coupure réseau entre les deux pouvait laisser le
        // DELETE réussir puis l'INSERT échouer : le catch ci-dessous
        // restaurait alors l'ancienne réaction seulement en local, alors que
        // la base n'avait plus aucune ligne — l'utilisateur voyait sa
        // réaction affichée jusqu'au prochain rechargement, qui la faisait
        // disparaître sans action de sa part.
        // Nécessite la policy RLS UPDATE ajoutée par supabase-communities-4.sql
        // (absente jusque-là : community_post_likes n'autorisait que
        // SELECT/INSERT/DELETE, d'où le choix initial du delete+insert).
        const { error } = await supabase.from("community_post_likes").update({ emoji }).eq("post_id", post.id).eq("profile_id", currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("community_post_likes").insert({ post_id: post.id, profile_id: currentUser.id, emoji });
        if (error) throw error;
      }
    } catch (e) {
      console.error(e);
      setMyReactions((m) => ({ ...m, [post.id]: previous }));
      if (previous) applyReactionDelta(post.id, previous, 1);
      if (!removing) applyReactionDelta(post.id, emoji, -1);
      onError("Impossible de mettre à jour cette réaction.");
    } finally {
      likeInFlightRef.current.delete(post.id);
    }
  };

  const handleLoadComments = async (postId) => {
    try {
      const { data, error } = await supabase
        .from("community_comments").select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      // Idem : pas de filtrage blockedIds ici, il est appliqué au rendu.
      setCommentsByPost((c) => ({ ...c, [postId]: { items: data || [] } }));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les commentaires.");
    }
  };

  const handleSubmitComment = async (postId, text, replyToId = null) => {
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from("community_comments").insert({ post_id: postId, author_id: currentUser.id, body: text, reply_to_id: replyToId })
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)").single();
      if (error) throw error;
      setCommentsByPost((c) => ({ ...c, [postId]: { items: [...(c[postId]?.items || []), data] } }));
      setPostCommentCounts((c) => ({ ...c, [postId]: (c[postId] || 0) + 1 }));
    } catch (e) {
      console.error(e);
      onError("Impossible d'envoyer ce commentaire.");
    }
  };

  const handleEditComment = async (postId, commentId, newBody) => {
    try {
      const { data, error } = await supabase
        .from("community_comments")
        .update({ body: newBody, updated_at: new Date().toISOString() })
        .eq("id", commentId)
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)").single();
      if (error) throw error;
      setCommentsByPost((c) => ({
        ...c,
        [postId]: { items: (c[postId]?.items || []).map((x) => (x.id === commentId ? data : x)) },
      }));
    } catch (e) {
      console.error(e);
      onError("Impossible de modifier ce commentaire.");
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    try {
      const { error } = await supabase.from("community_comments").delete().eq("id", commentId);
      if (error) throw error;
      setCommentsByPost((c) => ({ ...c, [postId]: { items: (c[postId]?.items || []).filter((x) => x.id !== commentId) } }));
      setPostCommentCounts((c) => ({ ...c, [postId]: Math.max(0, (c[postId] || 0) - 1) }));
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer ce commentaire.");
    }
  };

  // ---------- Invitations ----------
  const handleAcceptInvite = async (invite) => {
    if (inviteInFlightRef.current.has(invite.id)) return;
    inviteInFlightRef.current.add(invite.id);
    try {
      const { error } = await supabase.rpc("accept_invite", { p_invite_id: invite.id });
      if (error) throw error;
      setMyInvites((inv) => inv.filter((x) => x.id !== invite.id));
      setMyMemberships((m) => ({ ...m, [invite.community_id]: "member" }));
      adjustMemberCount(invite.community_id, 1);
      onCommunitiesChanged?.();
    } catch (e) {
      console.error(e);
      onError("Impossible d'accepter cette invitation.");
    } finally {
      inviteInFlightRef.current.delete(invite.id);
    }
  };

  const handleDeclineInvite = async (invite) => {
    if (inviteInFlightRef.current.has(invite.id)) return;
    inviteInFlightRef.current.add(invite.id);
    try {
      const { error } = await supabase.rpc("decline_invite", { p_invite_id: invite.id });
      if (error) throw error;
      setMyInvites((inv) => inv.filter((x) => x.id !== invite.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de refuser cette invitation.");
    } finally {
      inviteInFlightRef.current.delete(invite.id);
    }
  };

  // ---------- Membres ----------
  const handleSetMemberRole = async (member, newRole) => {
    try {
      const { error } = await supabase.from("community_members").update({ role: newRole }).eq("id", member.id);
      if (error) throw error;
      setMembers((m) => m.map((x) => (x.id === member.id ? { ...x, role: newRole } : x)));
    } catch (e) {
      console.error(e);
      onError("Impossible de modifier ce rôle.");
    }
  };

  const handleRemoveMember = async (member) => {
    // Même garde-fou que handleLeave ci-dessus : la ligne du membre ne
    // disparaît de la liste qu'après succès et le bouton n'est protégé que
    // par un window.confirm, donc deux clics "confirmés" successifs avant
    // la fin du premier appel double-décrémentaient le compteur de membres
    // (la suppression d'une ligne déjà supprimée ne renvoie pas d'erreur
    // Postgrest, donc le second appel se déroulait comme un succès).
    if (removeMemberInFlightRef.current.has(member.id)) return;
    removeMemberInFlightRef.current.add(member.id);
    try {
      const { error } = await supabase.from("community_members").delete().eq("id", member.id);
      if (error) throw error;
      setMembers((m) => m.filter((x) => x.id !== member.id));
      adjustMemberCount(community.id, -1);
      setMemberCount((n) => Math.max(0, n - 1));
      if (member.profile_id === currentUser.id) {
        setMyMemberships((m) => { const n = { ...m }; delete n[community.id]; return n; });
      }
    } catch (e) {
      console.error(e);
      onError("Impossible de retirer ce membre.");
    } finally {
      removeMemberInFlightRef.current.delete(member.id);
    }
  };

  // ---------- Signalement (réutilise ReportModal) ----------
  const openReport = (type, id, label) => {
    setReportTarget({ type, id, name: label });
    setReportCategory("");
    setReportReason("");
    setReportSubmitted(false);
  };

  const submitReport = async () => {
    if (!currentUser || !reportTarget || !reportCategory || !community) return;
    if (reportCategory === "autre" && !reportReason.trim()) return;
    setReportSending(true);
    try {
      const { error } = await supabase.from("community_reports").insert({
        community_id: community.id,
        target_type: reportTarget.type,
        target_id: reportTarget.id,
        from_id: currentUser.id,
        category: reportCategory,
        reason: reportReason.trim() || null,
      });
      if (error) throw error;
      setReportSubmitted(true);
    } catch (e) {
      console.error(e);
      onError("Impossible d'envoyer le signalement.");
    } finally {
      setReportSending(false);
    }
  };

  const handleResolveReport = async (rep) => {
    try {
      const { error } = await supabase.from("community_reports").update({ status: "resolved" }).eq("id", rep.id);
      if (error) throw error;
      setReports((r) => r.filter((x) => x.id !== rep.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de traiter ce signalement.");
    }
  };

  const handleDismissReport = async (rep) => {
    try {
      const { error } = await supabase.from("community_reports").update({ status: "dismissed" }).eq("id", rep.id);
      if (error) throw error;
      setReports((r) => r.filter((x) => x.id !== rep.id));
    } catch (e) {
      console.error(e);
      onError("Impossible d'ignorer ce signalement.");
    }
  };

  // ---------- Partage ----------
  const handleShare = async (comm) => {
    const shareText = `Découvre ${comm.name} sur Baobab !`;
    try {
      if (navigator.share) await navigator.share({ title: "Baobab", text: shareText });
      else await navigator.clipboard?.writeText(shareText);
    } catch (_) {}
  };

  const handleCreated = (newCommunity) => {
    setMyMemberships((m) => ({ ...m, [newCommunity.id]: "owner" }));
    onCommunitiesChanged?.();
    setView("list");
    goDetail(newCommunity);
  };

  // Commentaires filtrés au rendu (voir loadPosts/loadMembers ci-dessus) :
  // recalculé à chaque rendu à partir de commentsByPost (brut) et de la prop
  // blockedIds, pour rester à jour dès qu'un blocage/déblocage survient.
  const visibleCommentsByPost = {};
  Object.keys(commentsByPost).forEach((postId) => {
    visibleCommentsByPost[postId] = { items: (commentsByPost[postId]?.items || []).filter((c) => !blockedIds.has(c.author_id)) };
  });

  // Match/like du membre dont le profil est ouvert — même calcul que
  // viewedProfileIsMatch/viewedProfileIsLiked dans SocialShell.jsx, pour que
  // "Message"/"J'aime" se comportent à l'identique depuis cette modale.
  const viewedMemberIsMatch = viewedMemberProfile ? matches.some((m) => m.id === viewedMemberProfile.id) : false;
  const viewedMemberIsLiked = viewedMemberProfile && currentUser ? hasLiked(currentUser.id, viewedMemberProfile.id) : false;

  // ---------- Rendu ----------
  if (view === "create") {
    return (
      <section className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => setView("list")} aria-label="Annuler" className="text-sm font-bold" style={{ color: primary }}>← Annuler</button>
        </div>
        <h1 className="text-2xl font-black mb-4" style={{ color: primary }}>Créer une communauté</h1>
        <CommunityCreateForm currentUser={currentUser} onCreated={handleCreated} onCancel={() => setView("list")} onError={onError} />
      </section>
    );
  }

  if (view === "detail" && selectedId) {
    if (!community) {
      return (
        <section className="max-w-3xl mx-auto">
          <SkeletonCard />
        </section>
      );
    }
    const role = myMemberships[community.id] || null;
    return (
      <section className="max-w-3xl mx-auto">
        <CommunityDetailView
          community={community}
          creatorName={creatorName}
          memberCount={memberCount}
          viewerRole={role}
          viewerPending={myPending.has(community.id)}
          currentUser={currentUser}
          onBack={goList}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onDeleteCommunity={handleDeleteCommunity}
          isPlatformAdmin={isPlatformAdmin}
          onShare={handleShare}
          onReportCommunity={(c) => openReport("community", c.id, REPORT_TARGET_LABEL.community)}
          posts={posts.filter((p) => !blockedIds.has(p.author_id))}
          postsLoading={postsLoading}
          postDraft={postDraft}
          setPostDraft={setPostDraft}
          onSubmitPost={handleSubmitPost}
          postSubmitting={postSubmitting}
          onError={onError}
          reactionCounts={reactionCounts}
          myReactions={myReactions}
          onReact={handleReact}
          commentsByPost={visibleCommentsByPost}
          postCommentCounts={postCommentCounts}
          onLoadComments={handleLoadComments}
          onSubmitComment={handleSubmitComment}
          onEditComment={handleEditComment}
          onReportPost={(p) => openReport("post", p.id, REPORT_TARGET_LABEL.post)}
          onDeletePost={handleDeletePost}
          onDeleteComment={handleDeleteComment}
          events={events}
          eventsLoading={eventsLoading}
          onOpenEvent={(id) => onOpenEvents(id)}
          // Bug identifié à l'audit : ce bouton renvoyait vers l'accueil
          // générique de l'onglet Événements sans jamais transmettre l'id de
          // "community" ci-dessus — la communauté d'origine était perdue,
          // l'utilisateur devait recliquer "Créer" et re-sélectionner
          // lui-même la bonne communauté dans le formulaire.
          onCreateEvent={() => onCreateEventInCommunity(community.id)}
          onOpenInvite={(c) => setInviteTarget(c)}
          members={members.filter((m) => !blockedIds.has(m.profile_id))}
          membersLoading={membersLoading}
          onViewMemberProfile={(p) => setViewedMemberProfile(p)}
          onSetMemberRole={handleSetMemberRole}
          onRemoveMember={handleRemoveMember}
          joinRequests={joinRequests}
          reports={reports}
          onAcceptRequest={handleAcceptRequest}
          onRejectRequest={handleRejectRequest}
          onResolveReport={handleResolveReport}
          onDismissReport={handleDismissReport}
        />

        <PublicProfileModal
          profile={viewedMemberProfile}
          photos={profilePhotos[viewedMemberProfile?.id] || []}
          onClose={() => setViewedMemberProfile(null)}
          isMatch={viewedMemberIsMatch}
          isFavorite={favoriteIds.has(viewedMemberProfile?.id)}
          isFollowing={followingIds.has(viewedMemberProfile?.id)}
          isLiked={viewedMemberIsLiked}
          onLike={viewedMemberIsMatch ? null : (p) => onLikeProfile(p)}
          onUnlike={viewedMemberIsMatch ? null : (p) => onUnlikeProfile(p)}
          onMessage={(p) => { setViewedMemberProfile(null); onMessageProfile(p); }}
          onToggleFavorite={onToggleFavoriteProfile}
          onToggleFollow={onToggleFollowProfile}
          onReport={(p) => { setViewedMemberProfile(null); onReportProfile(p); }}
          onBlock={(p) => { setViewedMemberProfile(null); onBlockProfile(p); }}
        />

        <ReportModal
          target={reportTarget}
          targetLabel={reportTarget?.name}
          categories={COMMUNITY_REPORT_CATEGORIES}
          category={reportCategory}
          setCategory={setReportCategory}
          reason={reportReason}
          setReason={setReportReason}
          sending={reportSending}
          submitted={reportSubmitted}
          onCancel={() => setReportTarget(null)}
          onSubmit={submitReport}
          onDismissAfterSubmit={() => setReportTarget(null)}
        />

        <CommunityInviteModal
          community={inviteTarget}
          currentUser={currentUser}
          memberIds={new Set(members.map((m) => m.profile_id))}
          onClose={() => setInviteTarget(null)}
          onError={onError}
        />
      </section>
    );
  }

  // ---------- Liste ----------
  const recommended = isNeutralHome ? rankCommunities(currentUser, communities).filter((r) => r.score > 0).slice(0, 6).map((r) => r.community) : [];
  const popular = isNeutralHome ? [...communities].sort((a, b) => b.memberCount - a.memberCount).slice(0, 6) : [];
  const nearby = isNeutralHome && currentUser?.city ? communities.filter((c) => c.city && c.city.toLowerCase() === currentUser.city.toLowerCase()).slice(0, 6) : [];
  const newest = isNeutralHome ? [...communities].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6) : [];

  const renderGrid = (list) => (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((c) => (
        <CommunityGroupCard
          key={c.id}
          community={c}
          memberCount={c.memberCount}
          joined={Boolean(myMemberships[c.id])}
          pending={myPending.has(c.id)}
          onView={goDetail}
          onJoin={handleJoin}
        />
      ))}
    </div>
  );

  // Rangées à balayage horizontal complétées par des cartes-conseil quand
  // peu de communautés réelles existent encore — jamais de statistique
  // inventée, uniquement des conseils génériques (voir InfoTipCard).
  const renderRow = (list, tipKey) => (
    <HorizontalScrollRow>
      {list.map((c) => (
        <div key={c.id} className="w-56 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
          <CommunityGroupCard
            community={c}
            memberCount={c.memberCount}
            joined={Boolean(myMemberships[c.id])}
            pending={myPending.has(c.id)}
            onView={goDetail}
            onJoin={handleJoin}
          />
        </div>
      ))}
      {tipKey && list.length < 4 && COMMUNITY_TIPS[tipKey]
        .slice(0, 4 - list.length)
        .map((tip, i) => <InfoTipCard key={`tip-${tipKey}-${i}`} {...tip} />)}
    </HorizontalScrollRow>
  );

  const renderSection = (title, list, tipKey) =>
    (list.length > 0 || tipKey) && (
      <div className="mb-8">
        <h2 className="text-sm font-black mb-3" style={{ color: primary }}>{title}</h2>
        {renderRow(list, tipKey)}
      </div>
    );

  return (
    <section className="max-w-6xl mx-auto">
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: primary }}>
          <Users2 size={13} /> Communautés Baobab
        </div>
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-black" style={{ color: primary }}>🌍 Communautés Baobab</h1>
            <p className="text-sm mt-1" style={{ color: muted }}>Trouve ton cercle.</p>
          </div>
          <button onClick={() => setView("create")} className="bb-btn-gold flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold flex-shrink-0">
            <Plus size={16} /> Créer
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 rounded-2xl px-4 py-3" style={{ background: bg }}>
          <Search size={16} color={muted} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Que recherches-tu ?"
            aria-label="Rechercher une communauté"
            className="flex-1 bg-transparent text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)] min-w-0"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Effacer la recherche">
              <X size={14} color={muted} />
            </button>
          )}
        </div>
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="text-sm font-bold px-4 py-3 rounded-2xl flex-shrink-0"
          style={{ background: filtersOpen ? navy : bg, color: filtersOpen ? "#fff" : primary }}
        >
          Filtres
        </button>
      </div>

      {filtersOpen && (
        <div className={`${card} p-4 mb-5`}>
          <CommunityFilters city={filterCity} setCity={setFilterCity} category={filterCategory} setCategory={setFilterCategory} visibility={filterVisibility} setVisibility={setFilterVisibility} />
        </div>
      )}

      {listLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : communities.length === 0 ? (
        <EmptyState
          icon={Users2}
          title={isNeutralHome ? "Il n'y a pas encore de communauté." : "Il n'y a pas encore de communauté correspondant à ta recherche."}
          subtitle={isNeutralHome ? "Sois le/la premier·ère à en créer une !" : "Essaie une autre recherche."}
        />
      ) : isNeutralHome ? (
        <>
          {myInvites.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-black mb-3" style={{ color: primary }}>💌 Tes invitations</h2>
              <div className="flex flex-col gap-2">
                {myInvites.map((inv) => (
                  <div key={inv.id} className={`${card} p-3.5 flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{inv.communities?.name}</div>
                      <div className="text-xs truncate" style={{ color: muted }}>Invité·e par {inv.inviter?.name || "un membre"}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => handleDeclineInvite(inv)} className="text-xs font-bold px-3 py-2 rounded-full" style={{ background: bg, color: muted }}>Refuser</button>
                      <button onClick={() => handleAcceptInvite(inv)} className="bb-btn-gold text-xs font-bold px-3 py-2 rounded-full">Accepter</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {renderSection("✨ Pour toi", recommended, "pourToi")}
          {renderSection("📍 Près de toi", nearby)}
          {renderSection("🔥 Populaires sur Baobab", popular, "populaires")}
          {renderSection("🆕 Nouvelles communautés", newest, "nouvelles")}
          <h2 className="text-sm font-black mb-3" style={{ color: primary }}>Toutes les communautés</h2>
          {renderGrid(communities)}
        </>
      ) : (
        renderGrid(communities)
      )}

      {!listLoading && hasMore && !isNeutralHome && (
        <button onClick={loadMore} disabled={loadingMore} className="w-full mt-5 py-3 rounded-full text-sm font-bold disabled:opacity-50" style={{ background: bg, color: primary }}>
          {loadingMore ? "Chargement…" : "Charger plus"}
        </button>
      )}
    </section>
  );
}
