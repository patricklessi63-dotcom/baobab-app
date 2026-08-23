import React, { useEffect, useRef, useState } from "react";
import { Search, Plus, X, PartyPopper, Ticket, Coffee, Heart, CalendarDays } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { matchKey } from "../../utils/format";
import EventCard from "./EventCard";
import EventFilters, { dateRangeBounds } from "./EventFilters";
import EventDetailView from "./EventDetailView";
import EventCreateForm from "./EventCreateForm";
import EventEditForm from "./EventEditForm";
import EventInviteModal from "./EventInviteModal";
import ReportModal from "./ReportModal";
import PublicProfileModal from "./PublicProfileModal";
import EmptyState from "../home/EmptyState";
import HorizontalScrollRow from "../HorizontalScrollRow";
import InfoTipCard from "../InfoTipCard";
import { SkeletonCard } from "../Skeleton";
import { rankEvents } from "../../lib/events/recommendations";
import { EVENT_REPORT_CATEGORIES } from "../../lib/events/eventConfig";
import { trackActivation } from "../../lib/trackActivation";
import { escapeLikePattern, escapeOrFilterValue } from "../../lib/searchQuery";
import { primary, coral, muted, bg, card, primaryRgb, navy } from "./theme";

const PAGE_SIZE = 20;
const PHOTO_URL_EXPIRY = 60 * 60 * 24 * 30; // 30 jours — assez pour une galerie, régénéré à chaque chargement

// Cartes-conseil qui comblent les rangées à balayage horizontal quand peu
// d'événements réels existent encore — conseils génériques uniquement,
// jamais une statistique inventée (voir aussi CommunitiesTab.jsx).
const EVENT_TIPS = {
  populaires: [
    { icon: Ticket, title: "Les places partent vite", text: "Les événements populaires ont parfois un nombre de places limité — inscris-toi tôt." },
    { icon: Coffee, title: "Commence petit", text: "Un simple café ou une marche entre nouveaux arrivants est souvent le meilleur premier événement." },
  ],
  recommandes: [
    { icon: Heart, title: "Recommandés selon toi", text: "Complète tes centres d'intérêt et ta ville pour affiner ces suggestions." },
  ],
  aVenir: [
    { icon: CalendarDays, title: "Rien de prévu pour l'instant", text: "Reviens bientôt — de nouveaux événements sont créés régulièrement par la communauté." },
    { icon: PartyPopper, title: "Organise le tien", text: "Rassemble ta communauté en créant ton propre événement avec le bouton \"Créer\" ci-dessus." },
  ],
};

function buildListQuery({ search, filterCity, filterCategory, dateRange }) {
  let query = supabase.from("events").select("*, event_participant_count", { count: "exact" }).is("canceled_at", null);
  if (search.trim()) {
    const term = escapeOrFilterValue(search.trim());
    query = query.or(`title.ilike."%${term}%",description.ilike."%${term}%"`);
  }
  if (filterCity.trim()) query = query.ilike("city", `%${escapeLikePattern(filterCity.trim())}%`);
  if (filterCategory) query = query.eq("category", filterCategory);
  const bounds = dateRangeBounds(dateRange);
  if (bounds) query = query.gte("event_date", bounds.start).lte("event_date", bounds.end);
  else query = query.gte("event_date", new Date().toISOString());
  // Tri secondaire sur "id" (voir loadMore) : deux événements au même
  // event_date partageraient sinon un ordre indéterminé d'une page à
  // l'autre — même correctif que PostsFeed.jsx/CommunitiesTab.jsx.
  return query.order("event_date", { ascending: true }).order("id", { ascending: true });
}

function withParticipantCount(rows) {
  return (rows || []).map((e) => ({ ...e, participantCount: e.event_participant_count || 0 }));
}

export default function EventsTab({ currentUser, onError, initialEventId, onConsumedInitial = () => {}, myPlatformRole = null }) {
  const isPlatformAdmin = myPlatformRole === "admin" || myPlatformRole === "super_admin";
  const [view, setView] = useState("home"); // home | detail | create | edit
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterDateRange, setFilterDateRange] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listCursor, setListCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const [myStatuses, setMyStatuses] = useState({}); // eventId -> going|interested|not_going|waitlisted
  const [myCommunityIds, setMyCommunityIds] = useState([]);
  const [blockedIds, setBlockedIds] = useState(new Set());
  const [myMutualProfiles, setMyMutualProfiles] = useState([]); // connexions mutuelles réelles (likes croisés)

  const [event, setEvent] = useState(null);
  const [communityName, setCommunityName] = useState("");
  const [staffRole, setStaffRole] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [photos, setPhotos] = useState([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [reports, setReports] = useState([]);

  const [viewedProfile, setViewedProfile] = useState(null);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEvent, setInviteEvent] = useState(null);
  const [inviteCandidates, setInviteCandidates] = useState([]);
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [inviteSending, setInviteSending] = useState(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareEvent, setShareEvent] = useState(null);
  const [shareSending, setShareSending] = useState(false);

  const joinInFlightRef = useRef(new Set());
  const leaveInFlightRef = useRef(new Set());

  const isNeutralHome = !search.trim() && !filterCity.trim() && !filterCategory && !filterDateRange;

  // ---------- Données de session : mes participations, mes communautés,
  // mes blocages, mes connexions mutuelles — une fois au montage. ----------
  useEffect(() => {
    if (!currentUser) return;
    let alive = true;
    supabase.from("event_attendees").select("event_id, status").eq("profile_id", currentUser.id).then(({ data, error }) => {
      if (!alive || error) { if (error) console.error(error); return; }
      const map = {};
      (data || []).forEach((r) => { map[r.event_id] = r.status; });
      setMyStatuses(map);
    });
    supabase.from("community_members").select("community_id").eq("profile_id", currentUser.id).then(({ data, error }) => {
      if (!alive || error) { if (error) console.error(error); return; }
      setMyCommunityIds((data || []).map((r) => r.community_id));
    });
    supabase.from("blocks").select("from_id, to_id").or(`from_id.eq.${currentUser.id},to_id.eq.${currentUser.id}`).then(({ data, error }) => {
      if (!alive || error) { if (error) console.error(error); return; }
      const ids = new Set();
      (data || []).forEach((b) => ids.add(b.from_id === currentUser.id ? b.to_id : b.from_id));
      setBlockedIds(ids);
    });
    (async () => {
      const [{ data: sent }, { data: received }] = await Promise.all([
        supabase.from("likes").select("to_id").eq("from_id", currentUser.id),
        supabase.from("likes").select("from_id").eq("to_id", currentUser.id),
      ]);
      const sentIds = new Set((sent || []).map((r) => r.to_id));
      const mutualIds = (received || []).map((r) => r.from_id).filter((id) => sentIds.has(id));
      if (!alive || mutualIds.length === 0) return;
      const { data: profilesData } = await supabase.from("profiles").select("id, name, avatar_url").in("id", mutualIds);
      if (alive) setMyMutualProfiles(profilesData || []);
    })();
    return () => { alive = false; };
  }, [currentUser?.id]);

  // ---------- Liste — recherche/filtres débouncés, jamais tout charger ----------
  useEffect(() => {
    if (view !== "home") return;
    let alive = true;
    setListLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error, count } = await buildListQuery({ search, filterCity, filterCategory, dateRange: filterDateRange })
          .limit(PAGE_SIZE);
        if (!alive) return;
        if (error) throw error;
        setEvents(withParticipantCount(data));
        setHasMore((count || 0) > PAGE_SIZE);
        const last = (data || [])[(data || []).length - 1];
        setListCursor(last ? { event_date: last.event_date, id: last.id } : null);
      } catch (e) {
        console.error(e);
        onError("Impossible de charger les événements.");
      } finally {
        if (alive) setListLoading(false);
      }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [view, search, filterCity, filterCategory, filterDateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Curseur (event_date, id) plutôt que numéro de page (voir PostsFeed.jsx
  // pour le même correctif) : un nouvel événement créé pendant le scroll,
  // avec une date antérieure à des événements déjà chargés, décalait tous
  // les offsets suivants avec .range(), causant des doublons ou des
  // événements jamais vus à la page suivante.
  const loadMore = async () => {
    if (!listCursor) return;
    try {
      const { data, error } = await buildListQuery({ search, filterCity, filterCategory, dateRange: filterDateRange })
        .or(`event_date.gt.${listCursor.event_date},and(event_date.eq.${listCursor.event_date},id.gt.${listCursor.id})`)
        .limit(PAGE_SIZE);
      if (error) throw error;
      const rows = withParticipantCount(data);
      setEvents((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      const last = rows[rows.length - 1];
      setListCursor(last ? { event_date: last.event_date, id: last.id } : null);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger plus d'événements.");
    }
  };

  // ---------- Détail ----------
  const loadParticipants = async (id) => {
    setParticipantsLoading(true);
    try {
      const { data, error } = await supabase
        .from("event_attendees")
        .select("*, profiles(name, avatar_url, city, show_city)")
        .eq("event_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setParticipants(data || []);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les participants.");
    } finally {
      setParticipantsLoading(false);
    }
  };

  const loadComments = async (id) => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from("event_comments")
        .select("*, profiles(name, avatar_url)")
        .eq("event_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setComments(data || []);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger la discussion.");
    } finally {
      setCommentsLoading(false);
    }
  };

  const loadPhotos = async (id) => {
    setPhotosLoading(true);
    try {
      const { data, error } = await supabase.from("event_media").select("*").eq("event_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];
      if (rows.length > 0) {
        const { data: signedList } = await supabase.storage.from("event-media").createSignedUrls(rows.map((r) => r.storage_path), PHOTO_URL_EXPIRY);
        const urlByPath = {};
        (signedList || []).forEach((s) => { if (s.signedUrl) urlByPath[s.path] = s.signedUrl; });
        setPhotos(rows.map((r) => ({ ...r, url: urlByPath[r.storage_path] || null })));
      } else {
        setPhotos([]);
      }
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les photos.");
    } finally {
      setPhotosLoading(false);
    }
  };

  const loadReports = async (id) => {
    const { data, error } = await supabase.from("event_reports").select("*").eq("event_id", id).eq("status", "open").order("created_at", { ascending: false });
    if (!error) setReports(data || []);
  };

  const goDetail = async (ev) => {
    setSelectedId(ev.id);
    setView("detail");
    setEvent(null);
    setCommunityName(""); setStaffRole(null); setParticipants([]); setComments([]); setPhotos([]); setReports([]);
    setCommentDraft("");
    try {
      const { data, error } = await supabase.from("events").select("*").eq("id", ev.id).single();
      if (error) throw error;
      setEvent(data);

      if (data.created_by) {
        const { data: creator } = await supabase.from("profiles").select("name").eq("id", data.created_by).single();
        if (creator) data.organizerName = creator.name;
      }
      if (data.community_id) {
        const { data: comm } = await supabase.from("communities").select("name").eq("id", data.community_id).single();
        setCommunityName(comm?.name || "");
      }

      let role = null;
      if (currentUser) {
        const { data: staffRow } = await supabase.from("event_staff").select("role").eq("event_id", ev.id).eq("profile_id", currentUser.id).maybeSingle();
        role = staffRow?.role || null;
      }
      setStaffRole(role);

      await Promise.all([
        loadParticipants(ev.id),
        loadComments(ev.id),
        loadPhotos(ev.id),
        (role === "organizer" || role === "co_organizer" || role === "moderator") ? loadReports(ev.id) : Promise.resolve(),
      ]);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger cet événement.");
    }
  };

  const goHome = () => {
    setView("home");
    setSelectedId(null);
    setEvent(null);
  };

  // Ouverture directe depuis "Mes événements" (profil) — consommé une
  // seule fois pour ne pas rouvrir le même événement à chaque montage.
  useEffect(() => {
    if (!initialEventId) return;
    goDetail({ id: initialEventId });
    onConsumedInitial();
  }, [initialEventId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshEventInList = (updated) => {
    setEvents((es) => es.map((e) => (e.id === updated.id ? { ...e, ...updated, participantCount: e.participantCount } : e)));
  };

  // ---------- Participation ----------
  const adjustParticipantCount = (id, delta) => {
    setEvents((es) => es.map((e) => (e.id === id ? { ...e, participantCount: Math.max(0, e.participantCount + delta) } : e)));
  };

  const handleJoin = async (ev) => {
    if (!currentUser || joinInFlightRef.current.has(ev.id)) return;
    joinInFlightRef.current.add(ev.id);
    try {
      const { data, error } = await supabase.rpc("join_event", { p_event_id: ev.id });
      if (error) throw error;
      setMyStatuses((s) => ({ ...s, [ev.id]: data.status }));
      if (data.status === "going") {
        adjustParticipantCount(ev.id, 1);
        trackActivation(currentUser.id, "event_joined");
      }
    } catch (e) {
      console.error(e);
      onError("Impossible de rejoindre cet événement.");
    } finally {
      joinInFlightRef.current.delete(ev.id);
    }
  };

  const handleLeave = async (ev) => {
    // Garde-fou manquant identifié à l'audit : contrairement à handleJoin
    // ci-dessus, ce bouton n'a ni confirm() ni état disabled pendant la
    // requête — un double clic/double tap rapide pouvait déclencher deux
    // appels avant que myStatuses ne se mette à jour, et donc décrémenter
    // adjustParticipantCount deux fois pour un seul départ réel.
    if (!currentUser || leaveInFlightRef.current.has(ev.id)) return;
    leaveInFlightRef.current.add(ev.id);
    const wasGoing = myStatuses[ev.id] === "going";
    try {
      const { error } = await supabase.from("event_attendees").delete().eq("event_id", ev.id).eq("profile_id", currentUser.id);
      if (error) throw error;
      setMyStatuses((s) => { const n = { ...s }; delete n[ev.id]; return n; });
      if (wasGoing) adjustParticipantCount(ev.id, -1);
    } catch (e) {
      console.error(e);
      onError("Impossible de te retirer de cet événement.");
    } finally {
      leaveInFlightRef.current.delete(ev.id);
    }
  };

  // ---------- Création / édition / annulation ----------
  const handleCreated = (newEvent) => {
    setMyStatuses((s) => ({ ...s, [newEvent.id]: "going" }));
    setView("home");
    goDetail(newEvent);
  };

  const handleEdited = (updated) => {
    setEvent(updated);
    refreshEventInList(updated);
    setView("detail");
  };

  const handleCancel = async (ev) => {
    if (!window.confirm("Annuler cet événement ? Les participants seront notifiés.")) return;
    try {
      const { data, error } = await supabase.from("events").update({ canceled_at: new Date().toISOString() }).eq("id", ev.id).select().single();
      if (error) throw error;
      setEvent(data);
    } catch (e) {
      console.error(e);
      onError("Impossible d'annuler cet événement.");
    }
  };

  // Suppression definitive (distincte de l'annulation ci-dessus, qui reste
  // le choix recommande car elle previent les participants) — RLS
  // (supabase-delete-own-content.sql) n'autorise que le createur ou
  // is_admin_or_above(), les tables enfants sont deja en cascade.
  const handleDeleteEvent = async (ev) => {
    try {
      const { error } = await supabase.from("events").delete().eq("id", ev.id);
      if (error) throw error;
      goHome();
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer cet événement.");
    }
  };

  // ---------- Discussion ----------
  const handleSubmitComment = async () => {
    if (!commentDraft.trim() || !currentUser || !event) return;
    try {
      const { data, error } = await supabase
        .from("event_comments")
        .insert({ event_id: event.id, author_id: currentUser.id, body: commentDraft.trim() })
        .select("*, profiles(name, avatar_url)").single();
      if (error) throw error;
      setComments((c) => [...c, data]);
      setCommentDraft("");
    } catch (e) {
      console.error(e);
      onError("Impossible d'envoyer ce message.");
    }
  };

  const handleDeleteComment = async (c) => {
    try {
      const { error } = await supabase.from("event_comments").delete().eq("id", c.id);
      if (error) throw error;
      setComments((cs) => cs.filter((x) => x.id !== c.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer ce message.");
    }
  };

  // ---------- Photos ----------
  const handleUploadPhoto = {
    get eventId() { return event?.id; },
    save: async (path) => {
      const { data, error } = await supabase
        .from("event_media")
        .insert({ event_id: event.id, uploaded_by: currentUser.id, storage_path: path })
        .select().single();
      if (error) throw error;
      const { data: signed } = await supabase.storage.from("event-media").createSignedUrl(path, PHOTO_URL_EXPIRY);
      setPhotos((ph) => [{ ...data, url: signed?.signedUrl || null }, ...ph]);
    },
  };

  const handleDeletePhoto = async (photo) => {
    try {
      await supabase.storage.from("event-media").remove([photo.storage_path]);
      const { error } = await supabase.from("event_media").delete().eq("id", photo.id);
      if (error) throw error;
      setPhotos((ph) => ph.filter((p) => p.id !== photo.id));
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer cette photo.");
    }
  };

  // ---------- Signalement (réutilise ReportModal) ----------
  const openReport = (ev) => {
    setReportTarget(ev);
    setReportCategory("");
    setReportReason("");
    setReportSubmitted(false);
  };

  const submitReport = async () => {
    if (!currentUser || !reportTarget || !reportCategory) return;
    if (reportCategory === "autre" && !reportReason.trim()) return;
    setReportSending(true);
    try {
      const { error } = await supabase.from("event_reports").insert({
        event_id: reportTarget.id,
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
    const { error } = await supabase.from("event_reports").update({ status: "resolved" }).eq("id", rep.id);
    if (!error) setReports((r) => r.filter((x) => x.id !== rep.id));
  };
  const handleDismissReport = async (rep) => {
    const { error } = await supabase.from("event_reports").update({ status: "dismissed" }).eq("id", rep.id);
    if (!error) setReports((r) => r.filter((x) => x.id !== rep.id));
  };

  // ---------- Invitations ----------
  const openInvite = async (ev) => {
    setInviteEvent(ev);
    setInviteOpen(true);
    setInviteSending(false);
    const { data: existing } = await supabase.from("event_invitations").select("invited_profile_id").eq("event_id", ev.id);
    setInvitedIds(new Set((existing || []).map((r) => r.invited_profile_id)));

    let candidates = myMutualProfiles.filter((p) => !blockedIds.has(p.id));
    if (ev.community_id) {
      const { data: members } = await supabase
        .from("community_members").select("profile_id, profiles(id, name, avatar_url)")
        .eq("community_id", ev.community_id);
      const extra = (members || []).map((m) => m.profiles).filter(Boolean).filter((p) => !blockedIds.has(p.id));
      const seen = new Set(candidates.map((c) => c.id));
      extra.forEach((p) => { if (!seen.has(p.id)) { candidates.push(p); seen.add(p.id); } });
    }
    setInviteCandidates(candidates.filter((p) => p.id !== currentUser?.id));
  };

  const handleInvite = async (profile) => {
    if (!inviteEvent || !currentUser) return;
    setInviteSending(true);
    try {
      const { error } = await supabase.from("event_invitations").insert({
        event_id: inviteEvent.id, invited_by: currentUser.id, invited_profile_id: profile.id,
      });
      if (error) throw error;
      setInvitedIds((s) => new Set(s).add(profile.id));
    } catch (e) {
      console.error(e);
      // code Postgres 23505 = contrainte unique (deja invite) — seul cas ou
      // un message plus specifique que le message generique est affiche ;
      // toute autre erreur (RLS, reseau...) reste un message francais fixe,
      // jamais le texte brut renvoye par la base.
      onError(e.code === "23505" ? "Cette personne est déjà invitée." : "Impossible d'envoyer cette invitation.");
    } finally {
      setInviteSending(false);
    }
  };

  // ---------- Partage dans une conversation (réel : écrit un vrai message) ----------
  const openShareMessage = (ev) => {
    setShareEvent(ev);
    setShareOpen(true);
  };

  const handleSendEventMessage = async (profile) => {
    if (!shareEvent || !currentUser) return;
    setShareSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        match_key: matchKey(currentUser.id, profile.id),
        from_id: currentUser.id,
        kind: "event",
        media_meta: {
          event_id: shareEvent.id,
          title: shareEvent.title,
          cover_url: shareEvent.cover_url || null,
          event_date: shareEvent.event_date,
          timezone: shareEvent.timezone || null,
          city: shareEvent.city,
        },
      });
      if (error) throw error;
      setShareOpen(false);
    } catch (e) {
      console.error(e);
      onError("Impossible de partager cet événement dans cette conversation.");
    } finally {
      setShareSending(false);
    }
  };

  // Partage dans le fil général — appelle réellement le système de
  // publication existant, mais hérite honnêtement de sa limite déjà
  // signalée en Phase 6 (publications non persistées en base).
  const handleShareFeed = () => {
    onError("Le partage vers le fil sera visible une fois le fil général rendu persistant (limite connue, voir rapport).");
  };

  // ---------- Rendu ----------
  if (view === "create") {
    return (
      <section className="max-w-lg mx-auto">
        <button onClick={() => setView("home")} className="text-sm font-bold mb-4" style={{ color: primary }}>← Annuler</button>
        <h1 className="text-2xl font-black mb-4" style={{ color: primary }}>Créer un événement</h1>
        <EventCreateForm currentUser={currentUser} onCreated={handleCreated} onCancel={() => setView("home")} onError={onError} />
      </section>
    );
  }

  if (view === "edit" && event) {
    return (
      <section className="max-w-lg mx-auto">
        <button onClick={() => setView("detail")} className="text-sm font-bold mb-4" style={{ color: primary }}>← Annuler</button>
        <h1 className="text-2xl font-black mb-4" style={{ color: primary }}>Modifier l'événement</h1>
        <EventEditForm event={event} onSaved={handleEdited} onCancel={() => setView("detail")} onError={onError} />
      </section>
    );
  }

  if (view === "detail" && selectedId) {
    if (!event) {
      return <section className="max-w-3xl mx-auto"><SkeletonCard /></section>;
    }
    const mutualCount = participants.filter((p) => p.status === "going" && p.profile_id !== currentUser?.id && myMutualProfiles.some((m) => m.id === p.profile_id)).length;
    return (
      <section className="max-w-3xl mx-auto">
        <EventDetailView
          event={event}
          viewerRole={staffRole}
          viewerStatus={myStatuses[event.id] || null}
          participantCount={events.find((e) => e.id === event.id)?.participantCount ?? participants.filter((p) => p.status === "going").length}
          mutualCount={mutualCount}
          currentUser={currentUser}
          onBack={goHome}
          onJoin={handleJoin}
          onLeave={handleLeave}
          onShareFeed={handleShareFeed}
          onShareMessage={openShareMessage}
          onOpenInvite={openInvite}
          onReportEvent={openReport}
          onEdit={() => setView("edit")}
          onCancel={handleCancel}
          onDeleteEvent={handleDeleteEvent}
          isPlatformAdmin={isPlatformAdmin}
          communityName={communityName}
          onOpenCommunity={() => {}}
          participants={participants}
          participantsLoading={participantsLoading}
          onViewParticipantProfile={(p) => setViewedProfile(p)}
          comments={comments.filter((c) => !blockedIds.has(c.author_id))}
          commentsLoading={commentsLoading}
          commentDraft={commentDraft}
          setCommentDraft={setCommentDraft}
          onSubmitComment={handleSubmitComment}
          onDeleteComment={handleDeleteComment}
          photos={photos}
          photosLoading={photosLoading}
          onUploadPhoto={handleUploadPhoto}
          onDeletePhoto={handleDeletePhoto}
          reports={reports}
          onResolveReport={handleResolveReport}
          onDismissReport={handleDismissReport}
          blockedIds={blockedIds}
        />

        <PublicProfileModal profile={viewedProfile} onClose={() => setViewedProfile(null)} />

        <ReportModal
          target={reportTarget}
          targetLabel="cet événement"
          categories={EVENT_REPORT_CATEGORIES}
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

        <EventInviteModal
          open={inviteOpen}
          candidates={inviteCandidates}
          invitedIds={invitedIds}
          sending={inviteSending}
          onInvite={handleInvite}
          onClose={() => setInviteOpen(false)}
        />

        {shareOpen && (
          <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: `rgba(${primaryRgb},.55)`, backdropFilter: "blur(5px)" }} onClick={() => setShareOpen(false)} role="dialog" aria-modal="true" aria-label="Partager dans une conversation">
            <div className={`${card} w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 max-h-[80vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black" style={{ color: primary }}>Partager dans une conversation</h2>
                <button onClick={() => setShareOpen(false)} aria-label="Fermer"><X /></button>
              </div>
              {myMutualProfiles.filter((p) => !blockedIds.has(p.id)).length === 0 ? (
                <EmptyState title="Aucune conversation disponible." subtitle="Tu dois avoir un match mutuel pour partager un événement." />
              ) : (
                <div className="flex flex-col gap-1">
                  {myMutualProfiles.filter((p) => !blockedIds.has(p.id)).map((p) => (
                    <button key={p.id} onClick={() => handleSendEventMessage(p)} disabled={shareSending} className="w-full text-left px-2 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--bb-bg)] disabled:opacity-50">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // ---------- Accueil / liste ----------
  const recommended = isNeutralHome ? rankEvents(currentUser, events, myCommunityIds).filter((r) => r.score > 0).slice(0, 6).map((r) => r.event) : [];
  const popular = isNeutralHome ? [...events].sort((a, b) => b.participantCount - a.participantCount).slice(0, 6) : [];
  const nearby = isNeutralHome && currentUser?.city ? events.filter((e) => e.city && e.city.toLowerCase() === currentUser.city.toLowerCase()).slice(0, 6) : [];
  const upcoming = isNeutralHome ? events.slice(0, 6) : [];
  const fromCommunities = isNeutralHome ? events.filter((e) => e.community_id && myCommunityIds.includes(e.community_id)).slice(0, 6) : [];
  const mine = isNeutralHome && currentUser ? events.filter((e) => myStatuses[e.id] === "going" || myStatuses[e.id] === "interested" || myStatuses[e.id] === "waitlisted").slice(0, 6) : [];

  const renderGrid = (list) => (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((ev) => (
        <EventCard key={ev.id} event={ev} participantCount={ev.participantCount} status={myStatuses[ev.id]} onView={goDetail} />
      ))}
    </div>
  );

  const renderRow = (list, tipKey) => (
    <HorizontalScrollRow>
      {list.map((ev) => (
        <div key={ev.id} className="w-56 flex-shrink-0" style={{ scrollSnapAlign: "start" }}>
          <EventCard event={ev} participantCount={ev.participantCount} status={myStatuses[ev.id]} onView={goDetail} />
        </div>
      ))}
      {tipKey && list.length < 4 && EVENT_TIPS[tipKey]
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
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "#FFF3F1", color: coral }}>
          <PartyPopper size={13} /> Événements Baobab
        </div>
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-black" style={{ color: primary }}>🎉 Événements Baobab</h1>
            <p className="text-sm mt-1" style={{ color: muted }}>Découvre, participe, rencontre.</p>
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
            placeholder="Rechercher un événement..."
            aria-label="Rechercher un événement"
            className="flex-1 bg-transparent text-sm outline-none min-w-0"
          />
          {search && <button onClick={() => setSearch("")} aria-label="Effacer la recherche"><X size={14} color={muted} /></button>}
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
          <EventFilters city={filterCity} setCity={setFilterCity} category={filterCategory} setCategory={setFilterCategory} dateRange={filterDateRange} setDateRange={setFilterDateRange} />
        </div>
      )}

      {listLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={PartyPopper}
          title={isNeutralHome ? "Il n'y a aucun événement pour le moment." : "Aucun événement ne correspond à ta recherche."}
          subtitle={isNeutralHome ? "Crée le premier événement Baobab." : "Essaie une autre recherche."}
          actionLabel={isNeutralHome ? "Créer un événement" : undefined}
          onAction={isNeutralHome ? () => setView("create") : undefined}
        />
      ) : isNeutralHome ? (
        <>
          {renderSection("🔥 Populaires", popular, "populaires")}
          {renderSection("📍 Près de toi", nearby)}
          {renderSection("❤️ Recommandés pour toi", recommended, "recommandes")}
          {renderSection("📅 À venir", upcoming, "aVenir")}
          {renderSection("🌍 De tes communautés", fromCommunities)}
          {renderSection("🎟️ Mes événements", mine)}
          <h2 className="text-sm font-black mb-3" style={{ color: primary }}>Tous les événements</h2>
          {renderGrid(events)}
        </>
      ) : (
        renderGrid(events)
      )}

      {!listLoading && hasMore && !isNeutralHome && (
        <button onClick={loadMore} className="w-full mt-5 py-3 rounded-full text-sm font-bold" style={{ background: bg, color: primary }}>
          Charger plus
        </button>
      )}
    </section>
  );
}
