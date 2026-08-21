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
import { extFromMime } from "../../lib/mediaConstants";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
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
  if (search.trim()) query = query.or(`name.ilike.%${search.trim()}%,description.ilike.%${search.trim()}%`);
  if (filterCity.trim()) query = query.ilike("city", `%${filterCity.trim()}%`);
  if (filterCategory) query = query.eq("category", filterCategory);
  if (filterVisibility) query = query.eq("visibility", filterVisibility);
  return query.order("created_at", { ascending: false });
}

function withMemberCount(rows) {
  return (rows || []).map((c) => ({ ...c, memberCount: c.community_members?.[0]?.count || 0 }));
}

export default function CommunitiesTab({ currentUser, onError, onCommunitiesChanged, initialCommunityId, onConsumedInitial, blockedIds = new Set(), onOpenEvents = () => {} }) {
  const [view, setView] = useState("list"); // list | detail | create
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [communities, setCommunities] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [myMemberships, setMyMemberships] = useState({}); // communityId -> role
  const [myPending, setMyPending] = useState(new Set());

  const [community, setCommunity] = useState(null);
  const [creatorName, setCreatorName] = useState("");
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [postSubmitting, setPostSubmitting] = useState(false);
  const [myReactions, setMyReactions] = useState({}); // postId -> emoji|null
  const [reactionCounts, setReactionCounts] = useState({}); // postId -> { emoji: count }
  const [postCommentCounts, setPostCommentCounts] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [members, setMembers] = useState([]);
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
  const likeInFlightRef = useRef(new Set());

  const isNeutralHome = !search.trim() && !filterCity.trim() && !filterCategory && !filterVisibility;

  // ---------- Adhésions/demandes de l'utilisateur — une fois au montage ----------
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    supabase.from("community_members").select("community_id, role").eq("profile_id", currentUser.id).then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.error(error); return; }
      const map = {};
      (data || []).forEach((r) => { map[r.community_id] = r.role; });
      setMyMemberships(map);
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
          .range(0, PAGE_SIZE - 1);
        if (!alive) return;
        if (error) throw error;
        setCommunities(withMemberCount(data));
        setHasMore((count || 0) > PAGE_SIZE);
        setPage(0);
      } catch (e) {
        console.error(e);
        onError("Impossible de charger les communautés.");
      } finally {
        if (alive) setListLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [view, search, filterCity, filterCategory, filterVisibility]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    const nextPage = page + 1;
    try {
      const { data, error } = await buildListQuery({ search, filterCity, filterCategory, filterVisibility })
        .range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = withMemberCount(data);
      setCommunities((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      setPage(nextPage);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger plus de communautés.");
    }
  };

  const adjustMemberCount = (communityId, delta) => {
    setCommunities((cs) => cs.map((c) => (c.id === communityId ? { ...c, memberCount: Math.max(0, c.memberCount + delta) } : c)));
  };

  // ---------- Détail ----------
  const loadPosts = async (id) => {
    setPostsLoading(true);
    try {
      const { data, error } = await supabase
        .from("community_posts")
        .select("*, profiles(name, avatar_url)")
        .eq("community_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const visiblePosts = (data || []).filter((p) => !blockedIds.has(p.author_id));
      setPosts(visiblePosts);
      const ids = visiblePosts.map((p) => p.id);
      if (ids.length > 0) {
        const [likesRes, commentsRes] = await Promise.all([
          supabase.from("community_post_likes").select("post_id, profile_id, emoji").in("post_id", ids),
          supabase.from("community_comments").select("post_id").in("post_id", ids),
        ]);
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
      setPostsLoading(false);
    }
  };

  const loadMembers = async (id) => {
    setMembersLoading(true);
    try {
      const { data, error } = await supabase
        .from("community_members")
        .select("*, profiles(name, avatar_url, city, show_city)")
        .eq("community_id", id)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      setMembers((data || []).filter((m) => !blockedIds.has(m.profile_id)));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les membres.");
    } finally {
      setMembersLoading(false);
    }
  };

  const loadJoinRequests = async (id) => {
    const { data, error } = await supabase
      .from("community_join_requests")
      .select("*, profiles(name, avatar_url)")
      .eq("community_id", id).eq("status", "pending")
      .order("created_at", { ascending: true });
    if (!error) setJoinRequests(data || []);
  };

  const loadReports = async (id) => {
    const { data, error } = await supabase
      .from("community_reports")
      .select("*")
      .eq("community_id", id).eq("status", "open")
      .order("created_at", { ascending: false });
    if (!error) setReports(data || []);
  };

  const loadEvents = async (id) => {
    setEventsLoading(true);
    try {
      const { data, error } = await supabase
        .from("events")
        .select("*, event_participant_count")
        .eq("community_id", id)
        .is("canceled_at", null)
        .order("event_date", { ascending: true });
      if (error) throw error;
      setEvents((data || []).map((e) => ({ ...e, participantCount: e.event_participant_count || 0 })));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les événements.");
    } finally {
      setEventsLoading(false);
    }
  };

  const goDetail = async (comm) => {
    setSelectedId(comm.id);
    setView("detail");
    setCommunity(null);
    setPosts([]); setMembers([]); setJoinRequests([]); setReports([]); setEvents([]);
    setPostDraft("");
    try {
      const { data, error } = await supabase.from("communities").select("*").eq("id", comm.id).single();
      if (error) throw error;
      setCommunity(data);
      if (data.created_by) {
        const { data: creator } = await supabase.from("profiles").select("name").eq("id", data.created_by).single();
        setCreatorName(creator?.name || "");
      } else {
        setCreatorName("");
      }
      const role = myMemberships[comm.id];
      await Promise.all([
        loadPosts(comm.id),
        loadMembers(comm.id),
        loadEvents(comm.id),
        (role === "owner" || role === "admin") ? loadJoinRequests(comm.id) : Promise.resolve(),
        (role === "owner" || role === "admin" || role === "moderator") ? loadReports(comm.id) : Promise.resolve(),
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
    if (!currentUser) return;
    try {
      const { error } = await supabase.from("community_members").delete().eq("community_id", comm.id).eq("profile_id", currentUser.id);
      if (error) throw error;
      setMyMemberships((m) => { const n = { ...m }; delete n[comm.id]; return n; });
      adjustMemberCount(comm.id, -1);
      onCommunitiesChanged?.();
    } catch (e) {
      console.error(e);
      onError("Impossible de quitter cette communauté.");
    }
  };

  // ---------- Admin : demandes d'adhésion ----------
  const handleAcceptRequest = async (req) => {
    try {
      const { error } = await supabase.rpc("accept_join_request", { p_request_id: req.id });
      if (error) throw error;
      setJoinRequests((r) => r.filter((x) => x.id !== req.id));
      adjustMemberCount(req.community_id, 1);
      loadMembers(req.community_id);
    } catch (e) {
      console.error(e);
      onError("Impossible d'accepter cette demande.");
    }
  };

  const handleRejectRequest = async (req) => {
    try {
      const { error } = await supabase.rpc("reject_join_request", { p_request_id: req.id });
      if (error) throw error;
      setJoinRequests((r) => r.filter((x) => x.id !== req.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de refuser cette demande.");
    }
  };

  // ---------- Publications / réactions / commentaires ----------
  const handleSubmitPost = async (mediaFile, mediaKind) => {
    if ((!postDraft.trim() && !mediaFile) || !currentUser || !community) return;
    setPostSubmitting(true);
    try {
      let mediaUrl = null;
      if (mediaFile) {
        const { ok, error: validationError } = await validateMediaFile(mediaFile, mediaKind);
        if (!ok) { onError(validationError); setPostSubmitting(false); return; }
        const path = `${community.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extFromMime(mediaFile.type)}`;
        await uploadWithProgress({ bucket: COMMUNITY_MEDIA_BUCKET, path, file: mediaFile });
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
        .select("*, profiles(name, avatar_url)").single();
      if (error) throw error;
      setPosts((p) => [data, ...p]);
      setPostDraft("");
    } catch (e) {
      console.error(e);
      onError("Impossible de publier. Réessaie.");
    } finally {
      setPostSubmitting(false);
    }
  };

  const handleDeletePost = async (post) => {
    try {
      const { error } = await supabase.from("community_posts").delete().eq("id", post.id);
      if (error) throw error;
      setPosts((p) => p.filter((x) => x.id !== post.id));
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
      if (previous) {
        const { error } = await supabase.from("community_post_likes").delete().eq("post_id", post.id).eq("profile_id", currentUser.id);
        if (error) throw error;
      }
      if (!removing) {
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
        .from("community_comments").select("*, profiles(name, avatar_url)")
        .eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      setCommentsByPost((c) => ({ ...c, [postId]: { items: (data || []).filter((cm) => !blockedIds.has(cm.author_id)) } }));
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
        .select("*, profiles(name, avatar_url)").single();
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
        .select("*, profiles(name, avatar_url)").single();
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
    }
  };

  const handleDeclineInvite = async (invite) => {
    try {
      const { error } = await supabase.rpc("decline_invite", { p_invite_id: invite.id });
      if (error) throw error;
      setMyInvites((inv) => inv.filter((x) => x.id !== invite.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de refuser cette invitation.");
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
    try {
      const { error } = await supabase.from("community_members").delete().eq("id", member.id);
      if (error) throw error;
      setMembers((m) => m.filter((x) => x.id !== member.id));
      adjustMemberCount(community.id, -1);
      if (member.profile_id === currentUser.id) {
        setMyMemberships((m) => { const n = { ...m }; delete n[community.id]; return n; });
      }
    } catch (e) {
      console.error(e);
      onError("Impossible de retirer ce membre.");
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
          memberCount={members.length}
          viewerRole={role}
          viewerPending={myPending.has(community.id)}
          currentUser={currentUser}
          onBack={goList}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onShare={handleShare}
          onReportCommunity={(c) => openReport("community", c.id, REPORT_TARGET_LABEL.community)}
          posts={posts}
          postsLoading={postsLoading}
          postDraft={postDraft}
          setPostDraft={setPostDraft}
          onSubmitPost={handleSubmitPost}
          postSubmitting={postSubmitting}
          reactionCounts={reactionCounts}
          myReactions={myReactions}
          onReact={handleReact}
          commentsByPost={commentsByPost}
          onLoadComments={handleLoadComments}
          onSubmitComment={handleSubmitComment}
          onEditComment={handleEditComment}
          onReportPost={(p) => openReport("post", p.id, REPORT_TARGET_LABEL.post)}
          onDeletePost={handleDeletePost}
          onDeleteComment={handleDeleteComment}
          events={events}
          eventsLoading={eventsLoading}
          onOpenEvent={(id) => onOpenEvents(id)}
          onCreateEvent={() => onOpenEvents()}
          onOpenInvite={(c) => setInviteTarget(c)}
          members={members}
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

        <PublicProfileModal profile={viewedMemberProfile} onClose={() => setViewedMemberProfile(null)} />

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
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "#EEF8F4", color: navy }}>
          <Users2 size={13} /> Communautés Baobab
        </div>
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-black" style={{ color: primary }}>🌍 Communautés Baobab</h1>
            <p className="text-sm mt-1" style={{ color: muted }}>Trouve ton cercle.</p>
          </div>
          <button onClick={() => setView("create")} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold text-white flex-shrink-0" style={{ background: coral }}>
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
            className="flex-1 bg-transparent text-sm outline-none min-w-0"
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
                      <button onClick={() => handleAcceptInvite(inv)} className="text-xs font-bold px-3 py-2 rounded-full text-white" style={{ background: coral }}>Accepter</button>
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
        <button onClick={loadMore} className="w-full mt-5 py-3 rounded-full text-sm font-bold" style={{ background: bg, color: primary }}>
          Charger plus
        </button>
      )}
    </section>
  );
}
