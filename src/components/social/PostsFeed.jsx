import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "../../supabaseClient";
import PostCard from "./PostCard";
import PostComposerModal from "./PostComposerModal";
import PostMediaGrid from "./PostMediaGrid";
import ReportModal from "./ReportModal";
import { POST_REPORT_CATEGORIES } from "../../lib/reportCategories";
import ConfirmModal from "./ConfirmModal";
import EmptyState from "../home/EmptyState";
import { validateMediaFile } from "../../lib/mediaValidation";
import { truncateUnicodeSafe } from "../../utils/format";
import { compressImageIfNeeded } from "../../lib/imageCompression";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { POST_MEDIA_BUCKET, extFromMime, looksLikeImage } from "../../lib/mediaConstants";
import { friendlyDbError } from "../../lib/friendlyDbError";
import { selectAllPages } from "../../lib/inChunks";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { useResumeTick } from "../../hooks/useResumeTick";
import { useReconnectTick } from "../../hooks/useReconnectTick";
import { usePullToRefresh } from "../../hooks/usePullToRefresh";
import PullToRefreshIndicator from "../PullToRefreshIndicator";
import LoadErrorNotice from "../LoadErrorNotice";
import { insertWithRecovery } from "../../lib/writeRecovery";
import { isAmbiguousWriteError, isNetworkFailure, networkFailureMessage } from "../../lib/networkError";
import { primary, navy, coral, muted, bg, card } from "./theme";

const PAGE_SIZE = 20;
const PLACEHOLDER_BODY = "Nouveau partage sur Baobab ✨";
const MAX_MEDIA_ITEMS = 10;

// Fil de publications réellement persisté (corrige le bug identifié à
// l'audit : le composeur n'écrivait auparavant jamais dans Supabase).
// authorId + layout="grid" réutilisé tel quel par ProfileTab.jsx ("Mes
// publications") plutôt que de dupliquer la logique de fetch/CRUD.
//
// Galerie multi-médias (refonte composer) : chaque publication peut avoir
// plusieurs photos/vidéos, stockées dans post_media (table séparée, voir
// supabase-post-media.sql — À EXÉCUTER MANUELLEMENT PAR L'UTILISATEUR dans
// Supabase avant que l'ajout de médias ne fonctionne en production). Les
// anciennes publications à média unique (posts.media_url/media_kind)
// restent lisibles : PostCard retombe dessus quand post_media est vide.
// onViewProfile(id) : ouvre la fiche (Signaler / Bloquer) de l'auteur ; onBlockProfile(profil) :
// demande le blocage de l'auteur d'un contenu signalé (Apple 1.2 / Google Play UGC). Tous deux
// facultatifs (la grille « Mes publications » du profil ne les fournit pas).
export default function PostsFeed({ currentUser, blockedIds = new Set(), authorId, layout = "list", onError = () => {}, onPostCountChange = () => {}, onViewProfile, onBlockProfile }) {
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  // Échec du premier chargement : affiché comme une erreur (avec « Réessayer »)
  // et rejoué au retour du réseau, au lieu d'un faux « Aucune publication ».
  const [loadError, setLoadError] = useState(false);
  // Curseur (created_at, id) du dernier post chargé, pour la pagination —
  // voir le commentaire dans loadPosts() pour pourquoi ce n'est plus un
  // simple numéro de page passé à .range().
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState(new Set());
  const [postLikeCounts, setPostLikeCounts] = useState({});
  const [postCommentCounts, setPostCommentCounts] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  // Suppression (vue grille) en attente de confirmation — remplace l'ancien
  // window.confirm(), voir ConfirmModal.jsx. La vue liste passe déjà par
  // PostCard.jsx, qui a sa propre confirmation.
  const [pendingDelete, setPendingDelete] = useState(null);

  const [composer, setComposer] = useState(false);
  const [draft, setDraft] = useState("");
  // Items sélectionnés mais pas encore envoyés — aperçu local uniquement
  // (URL.createObjectURL), jamais uploadés tant que l'utilisateur n'a pas
  // cliqué "Publier" (item 20 du cahier des charges : l'upload démarre au
  // clic, pas à la sélection).
  const [mediaItems, setMediaItems] = useState([]); // [{id, file, kind, previewUrl}]
  // Une fois "Publier" cliqué : progression par item pendant l'upload
  // réel, conservée même après un premier passage pour permettre de
  // réessayer uniquement les éléments en échec sans dupliquer la
  // publication texte déjà créée.
  const [uploadStates, setUploadStates] = useState({}); // { [itemId]: {status, progress, error} }
  const [publishing, setPublishing] = useState(false);
  const [publishedPostId, setPublishedPostId] = useState(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState(false);
  const [resumedDraft, setResumedDraft] = useState(false);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const publishingRef = useRef(false);
  const likeInFlightRef = useRef(new Set());
  // Bug identifié à l'audit édition/suppression de commentaires : un
  // double-clic rapide (ou un Enter répété) sur "Envoyer" dans PostCard.jsx
  // insérait deux fois le même commentaire — commentDraft n'était vidé
  // qu'en local par PostCard, sans jamais bloquer un second appel réseau
  // pendant que le premier était encore en vol. EventsTab.jsx avait déjà ce
  // garde (commentSubmittingRef) pour ses commentaires d'événement ; il
  // manquait ici comme dans CommunitiesTab.jsx (même correctif appliqué
  // là-bas). Même pattern (Set par postId) que likeInFlightRef ci-dessus.
  const commentSubmittingRef = useRef(new Set());
  // Même garde, même motif, pour l'édition d'une publication (voir editPost
  // ci-dessous) : confirmEdit() (PostCard.jsx) appelle onEdit() puis ferme
  // aussitôt le formulaire d'édition (setEditing(false)) sans attendre la
  // réponse réseau ni désactiver le bouton pendant l'envoi — un double-clic
  // (ou un Enter répété avant le prochain rendu React) déclenchait deux
  // UPDATE identiques en vol. Anodin tant que le texte n'a pas changé entre
  // les deux appels, mais devient un vrai problème combiné au contrôle de
  // concurrence optimiste ajouté plus bas : le second appel, parti avec le
  // même `post.updated_at` (obsolète) que le premier déjà résolu, ne
  // retrouverait plus aucune ligne à mettre à jour et afficherait à tort un
  // message de conflit ("modifié ailleurs") pour ce qui n'était qu'un
  // double-clic sur le même onglet.
  const editSubmittingRef = useRef(new Set());
  // Incrémenté à chaque fermeture du composeur — capturé par addFiles() au
  // moment de l'appel puis revérifié après chaque await (validation,
  // compression) avant de toucher à mediaItems. Sans ça : sélectionner une
  // photo/vidéo puis fermer le composeur (croix, fond, Échap) AVANT que la
  // validation/compression asynchrone se termine laissait cet appel arriver
  // après coup et réinjecter l'item dans mediaItems déjà remis à [] par
  // closeComposerFully() — un média "fantôme" (jamais choisi pour de vrai
  // du point de vue de l'utilisateur, blob jamais révoqué) apparaissait
  // silencieusement à la prochaine ouverture du composeur.
  const composerSessionRef = useRef(0);

  // Scroll infini + bandeau "nouvelles publications" (item audit — jusqu'ici
  // seul un bouton "Charger plus" manuel existait, aucun moyen de savoir
  // qu'il y avait du nouveau contenu sans recharger toute la page).
  const [newPostsCount, setNewPostsCount] = useState(0);
  const sentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);
  const { isOnline } = useOnlineStatus();
  // Reprise après une longue veille (sans évènement `online`) : même rattrapage
  // du bandeau « nouvelles publications » que le retour en ligne, voir plus bas.
  const resumeTick = useResumeTick();
  const lastResumeTickRef = useRef(0);
  // Lus par l'effet de reconnexion plus bas, qui recalcule newPostsCount
  // depuis la base plutôt que de dépendre uniquement des événements Realtime
  // reçus pendant que l'app était hors ligne.
  const postsRef = useRef(posts);
  postsRef.current = posts;
  // Écritures dont une coupure a laissé l'issue incertaine (la ligne existe
  // peut-être déjà) : le prochain essai identique vérifie d'abord, pour ne pas
  // publier/commenter deux fois (voir lib/writeRecovery.js).
  const ambiguousPublishBodyRef = useRef(null);
  const ambiguousCommentsRef = useRef(new Set());
  const blockedIdsRef = useRef(blockedIds);
  blockedIdsRef.current = blockedIds;

  const [reportTarget, setReportTarget] = useState(null);
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  // Garde synchrone (même motif que publishingRef/commentSubmittingRef
  // ci-dessus) : submitReport() ci-dessous ne se protégeait que via l'état
  // React reportSending, dont la mise à jour n'est pas synchrone — un
  // double-clic rapide sur "Envoyer" (ReportModal.jsx) avant que le bouton
  // ne se désactive visuellement pouvait donc insérer deux fois le même
  // signalement dans post_reports.
  const reportSendingRef = useRef(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const loadCounts = async (ids, replace) => {
    if (ids.length === 0) {
      if (replace) { setPostLikeCounts({}); setLikedPostIds(new Set()); setPostCommentCounts({}); }
      return;
    }
    // Plafond PostgREST (max_rows = 1000, troncature SILENCIEUSE) : 20 posts
    // dont un viral dépassent 1000 likes/commentaires ; compteurs faux et, pire,
    // "j'ai déjà liké" perdu (on retentait un like -> doublon 23505). Pagination
    // .order("id").range() (id unique : pages stables).
    const [likesRes, commentsRes] = await Promise.all([
      selectAllPages((from, to) => supabase.from("post_likes").select("post_id, profile_id").in("post_id", ids).order("id").range(from, to)),
      selectAllPages((from, to) => supabase.from("post_comments").select("post_id").in("post_id", ids).order("id").range(from, to)),
    ]);
    const likeCounts = {}; const liked = new Set();
    (likesRes.data || []).forEach((l) => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      if (l.profile_id === currentUser.id) liked.add(l.post_id);
    });
    const commentCounts = {};
    (commentsRes.data || []).forEach((c) => { commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1; });
    setPostLikeCounts((prev) => (replace ? likeCounts : { ...prev, ...likeCounts }));
    setLikedPostIds((prev) => (replace ? liked : new Set([...prev, ...liked])));
    setPostCommentCounts((prev) => (replace ? commentCounts : { ...prev, ...commentCounts }));
  };

  // post_media(*) embarqué à chaque chargement — normalise l'ordre (position)
  // côté client : PostgREST ne garantit pas l'ordre d'une ressource imbriquée
  // sans .order() dédié, plus simple à trier ici qu'à complexifier la requête.
  const normalizePost = (p) => ({
    ...p,
    post_media: (p.post_media || []).slice().sort((a, b) => a.position - b.position),
  });

  // Requête posts + post_media séparée en deux appels (plutôt qu'un embed
  // PostgREST "post_media(*)" imbriqué dans le select) : tant que
  // supabase-post-media.sql n'a pas été exécuté en prod, la table
  // post_media n'existe pas et PostgREST renvoie une erreur 400 sur TOUT
  // le select s'il contient l'embed — ce qui cassait le chargement du fil
  // entier, pas seulement la galerie multi-médias. Ici, un post_media
  // manquant ne fait que retomber sur des galeries vides (PostCard sait
  // déjà retomber sur l'ancien media_url/media_kind), jamais casser le fil.
  // pageCursor = null pour la première page, sinon {created_at, id} du
  // dernier post déjà chargé.
  //
  // Pagination par curseur plutôt que par offset (.range()) : avec un
  // .range() basé sur un simple numéro de page, l'insertion d'une nouvelle
  // publication en tête pendant que l'utilisateur scrolle décale toutes les
  // lignes d'un cran — la page suivante se retrouve alors à re-fetcher le
  // dernier post déjà affiché (doublon dans le fil) ou à sauter un post
  // jamais vu. Filtrer par "strictement plus ancien que le dernier post
  // chargé" (created_at, puis id en cas d'égalité exacte de created_at)
  // reste correct quel que soit le nombre d'insertions/suppressions
  // survenues entre deux pages, et donne un ordre total déterministe même
  // si deux posts partagent le même created_at.
  // `silent` (tirer pour rafraîchir) : recharge la première page SANS passer par
  // l'état « Chargement… » qui remplacerait la liste affichée le temps de la
  // requête, et sans marquer d'échec bloquant si elle échoue (la liste déjà
  // affichée reste utilisable ; le message d'erreur habituel est quand même émis).
  const loadPosts = async (pageCursor, { silent = false } = {}) => {
    const isFirstPage = !pageCursor;
    if (isFirstPage && !silent) setPostsLoading(true);
    try {
      // is_founder/is_premium/email_verified/phone_verified ajoutés à toutes
      // les jointures "profiles" de ce fichier (bug corrigé à l'audit, même
      // famille que PublicProfileModal/AdmirersModal) : PostCard ne pouvait
      // jamais afficher le badge de statut de l'auteur d'une publication,
      // ces champs étant absents de la jointure.
      let query = supabase.from("posts").select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (authorId) query = query.eq("author_id", authorId);
      if (pageCursor) {
        query = query.or(`created_at.lt.${pageCursor.created_at},and(created_at.eq.${pageCursor.created_at},id.lt.${pageCursor.id})`);
      }
      const { data, error } = await query;
      if (error) throw error;
      let mediaByPost = {};
      const ids = (data || []).map((p) => p.id);
      // Audit performance (6 oct. 2026) : les compteurs likes/commentaires
      // (loadCounts) ne dépendent que des ids de posts, pas des médias — ils
      // étaient pourtant lancés APRÈS la requête post_media, soit 3 allers-
      // retours en série (posts -> post_media -> likes+commentaires) pour
      // l'écran d'accueil. On les démarre maintenant en parallèle de post_media
      // (2 allers-retours) ; le .catch() neutre évite un rejet non géré si
      // l'étape média lève avant qu'on n'attende le résultat plus bas.
      const countsPromise = loadCounts(ids, isFirstPage);
      countsPromise.catch(() => {});
      if (ids.length > 0) {
        try {
          const { data: mediaRows, error: mediaError } = await supabase.from("post_media").select("*").in("post_id", ids);
          if (mediaError) throw mediaError;
          (mediaRows || []).forEach((m) => {
            (mediaByPost[m.post_id] ||= []).push(m);
          });
        } catch (mediaErr) {
          console.error(mediaErr);
          // post_media pas encore migrée en prod — le fil continue de
          // fonctionner avec la galerie vide plutôt que planter.
        }
      }
      // Pas de filtrage blockedIds ici : si on le fait au moment du
      // chargement, un blocage effectué ensuite (depuis un profil ouvert,
      // une story...) pendant que ce fil reste monté ne fait rien
      // disparaître tant qu'il n'est pas rechargé. Comme pour
      // EventsTab/CommunitiesTab, on garde les données brutes en état et on
      // filtre avec la prop blockedIds (réactive) au moment du rendu, plus
      // bas (visiblePosts).
      const rows = (data || [])
        .map((p) => normalizePost({ ...p, post_media: mediaByPost[p.id] || [] }));
      setPosts((prev) => (isFirstPage ? rows : [...prev, ...rows]));
      if (isFirstPage) setLoadError(false);
      setHasMore((data || []).length === PAGE_SIZE);
      const last = (data || [])[(data || []).length - 1];
      setCursor(last ? { created_at: last.created_at, id: last.id } : null);
      await countsPromise;
    } catch (e) {
      console.error(e);
      if (isFirstPage && !silent) setLoadError(true);
      onError("Impossible de charger les publications.");
    } finally {
      if (isFirstPage && !silent) setPostsLoading(false);
    }
  };

  // Rejoue le premier chargement s'il avait échoué, dès le retour du réseau ou
  // la reprise après une veille (voir hooks/useReconnectTick.js).
  const reconnectTick = useReconnectTick();
  useEffect(() => {
    if (reconnectTick === 0 || !loadError || !currentUser) return;
    loadPosts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectTick]);

  useEffect(() => {
    if (!currentUser) return;
    loadPosts(null);
    setNewPostsCount(0);
  }, [currentUser?.id, authorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Détecte les nouvelles publications en direct (Realtime) — n'insère
  // jamais automatiquement dans la liste affichée (éviterait un décalage
  // pendant que l'utilisateur lit), se contente d'incrémenter un compteur
  // affiché en bandeau ; charger le nouveau contenu reste un choix explicite.
  useEffect(() => {
    if (!currentUser) return;
    const filter = authorId ? `author_id=eq.${authorId}` : undefined;
    const channel = supabase
      .channel(`posts-feed:${authorId || "all"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter }, (payload) => {
        if (payload.new.author_id === currentUser.id) return; // ses propres publications s'affichent déjà tout de suite
        if (blockedIdsRef.current.has(payload.new.author_id)) return;
        setNewPostsCount((n) => n + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // blockedIds lu via blockedIdsRef (audit performance, 6 oct. 2026) : le
    // mettre en dépendance désabonnait/réabonnait le canal à chaque blocage/
    // déblocage (et à CHAQUE rendu dès qu'un parent passe un Set non mémoïsé),
    // pour une valeur que le handler peut lire en direct.
  }, [currentUser?.id, authorId]);

  // Bug corrigé (même famille que la resynchronisation messages/badges et
  // cloche de notifications) : le canal Realtime ci-dessus ne rejoue jamais
  // les INSERT manqués pendant une coupure websocket — une publication créée
  // par quelqu'un d'autre pendant que l'utilisateur était hors ligne ne
  // faisait donc jamais apparaître le bandeau "nouvelles publications" tant
  // que l'app n'était pas rechargée. On recalcule newPostsCount depuis la
  // base (requête bornée, valeur absolue plutôt qu'incrémentée) dès un
  // véritable retour en ligne.
  //
  // Régression corrigée (audit du correctif ci-dessus) : contrairement aux
  // resynchronisations équivalentes de App.jsx/SocialShell.jsx (commits
  // 65980a9/cdb5702), cet effet ne protégeait pas son `.then()` avec un
  // indicateur "composant démonté" — si l'utilisateur quittait cet écran
  // (ou se déconnectait, ce qui démonte SocialShell/PostsFeed) juste après
  // être revenu en ligne mais avant la résolution de la requête, le
  // setNewPostsCount() tardif s'exécutait quand même sur un composant déjà
  // démonté (avertissement React + fuite). `alive` reproduit la même garde
  // que les fetchs bornés de SocialShell.jsx.
  const wasOfflineRef = useRef(false);
  useEffect(() => {
    const resumed = resumeTick !== lastResumeTickRef.current;
    lastResumeTickRef.current = resumeTick;
    if (!isOnline) {
      wasOfflineRef.current = true;
      return;
    }
    // Ni vraie reconnexion (ex. montage initial) ni reprise après veille : rien à faire.
    if (!wasOfflineRef.current && !resumed) return;
    wasOfflineRef.current = false;
    if (!currentUser) return;
    const cutoff = postsRef.current[0]?.created_at;
    if (!cutoff) return; // rien encore chargé, le prochain loadPosts() suffit
    let alive = true;
    let query = supabase
      .from("posts")
      .select("id, author_id, created_at")
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(50);
    if (authorId) query = query.eq("author_id", authorId);
    query.then(({ data, error }) => {
      if (!alive) return;
      if (error) { console.error(error); return; }
      const count = (data || []).filter((p) => p.author_id !== currentUser.id && !blockedIdsRef.current.has(p.author_id)).length;
      setNewPostsCount(count);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, resumeTick, currentUser?.id, authorId]);

  const loadNewPosts = () => {
    loadPosts(null);
    setNewPostsCount(0);
    // Le nouveau contenu remplace le début du fil (voir loadPosts) : sans
    // remonter la page, l'utilisateur scrollé plus bas ne voit aucun
    // changement visible en cliquant sur la bannière.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Tirer pour rafraîchir (fil principal uniquement : ni la grille du profil, ni
  // le fil d'un auteur). Réutilise loadPosts(null) — le même rechargement de la
  // première page que la bannière « nouvelles publications » — et remet le
  // compteur à zéro. Désactivé pendant le chargement initial, la rédaction, la
  // publication, une suppression ou un signalement en cours.
  const pullToRefresh = usePullToRefresh({
    enabled: layout !== "grid" && !authorId && !postsLoading && !composer && !publishing && !pendingDelete && !reportTarget,
    onRefresh: async () => {
      await loadPosts(null, { silent: true });
      setNewPostsCount(0);
    },
  });

  // Charge la page suivante — point d'entrée commun à la sentinelle
  // (scroll infini) ET au bouton "Charger plus" manuel. loadingMoreRef
  // protège les deux : sans cette garde partagée, un clic sur le bouton
  // pendant que la sentinelle a déjà déclenché un chargement (ou un
  // double-clic/tap rapide sur le bouton lui-même) relançait loadPosts(cursor)
  // en parallèle avec le MÊME curseur (pas encore avancé par le premier
  // appel) — même page récupérée et ajoutée deux fois à la liste affichée
  // (publications en double + clé React dupliquée). Même famille de bug déjà
  // corrigée pour "Charger plus" dans EventsTab.jsx/CommunitiesTab.jsx ;
  // le bouton ici s'appuyait auparavant sur loadPosts(cursor) directement,
  // sans passer par loadingMoreRef contrairement à ce qu'affirmait le
  // commentaire de EventsTab.jsx.
  const loadMore = () => {
    if (loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    loadPosts(cursor).finally(() => { loadingMoreRef.current = false; });
  };

  // Sentinelle en fin de liste : charge la page suivante automatiquement
  // dès qu'elle approche du viewport, le bouton "Charger plus" reste en
  // repli (utile si l'observer n'est pas supporté ou pour un clic explicite).
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: "400px" });
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brouillon texte uniquement (localStorage) — un média sélectionné (File)
  // ne survit pas à un rechargement de page, donc ne prétend jamais l'être :
  // "Enregistrer en brouillon" abandonne les médias s'il y en a, ne garde
  // que le texte. Une seule clé par utilisateur (pas de liste de brouillons
  // multiples) : cohérent avec le composeur actuel, à un seul post en cours.
  const draftKey = () => (currentUser?.id ? `baobab_post_draft_${currentUser.id}` : null);

  const openComposer = () => {
    const key = draftKey();
    // Stockage potentiellement indisponible (navigation privée stricte,
    // politique navigateur) : une exception ici ne doit pas empêcher
    // l'ouverture du composeur, juste priver l'utilisateur de la reprise
    // de brouillon.
    let saved = null;
    try { saved = key ? localStorage.getItem(key) : null; } catch (_) {}
    if (saved) {
      // Tronqué à 4000 comme tous les autres chemins qui modifient `draft`
      // (saisie clavier, emoji, suggestion IA dans PostComposerModal) :
      // un brouillon enregistré par une version antérieure de l'app (avant
      // l'ajout de ces limites) ou modifié manuellement dans le stockage du
      // navigateur pouvait dépasser 4000 caractères sans que rien ne le
      // bloque à la reprise — posts.body a "check (char_length(body)
      // between 1 and 4000)" côté base (supabase-feed-posts.sql), donc la
      // publication du brouillon repris échouait silencieusement à
      // l'insertion avec "Impossible de publier. Réessaie.", sans indice.
      setDraft(truncateUnicodeSafe(saved, 4000));
      setResumedDraft(true);
    }
    setComposer(true);
  };

  const hasUnsavedContent = () => draft.trim().length > 0 || mediaItems.length > 0;

  const requestCloseComposer = () => {
    // La création du post (premier appel à publish(), avant que
    // publishedPostId ne soit connu) est déjà partie côté serveur : si on
    // laisse fermer ici, l'utilisateur peut choisir "Abandonner" dans la
    // confirmation de sortie pendant que l'insertion est en vol, puis voir
    // la publication apparaître quand même dans le fil juste après (le
    // insert réussit et closeComposerFully() n'annule rien côté async). On
    // ignore toute demande de fermeture (X, clic sur le fond, Échap) tant
    // que ce premier appel n'a pas abouti.
    if (publishing && !publishedPostId) return;
    // Une publication déjà créée (même avec des médias en échec) ne doit
    // jamais être "perdue" derrière une confirmation de sortie — elle est
    // déjà en base. On ferme directement dans ce cas.
    if (publishedPostId) { closeComposerFully(); return; }
    if (hasUnsavedContent()) {
      setExitConfirmOpen(true);
    } else {
      closeComposerFully();
    }
  };

  const revokePreviews = (items) => {
    items.forEach((it) => { try { URL.revokeObjectURL(it.previewUrl); } catch (_) {} });
  };

  // Filet de sécurité au démontage du composant (ex : changement d'onglet
  // pendant que le composer photo est ouvert) : closeComposerFully() ne
  // s'exécute que sur une fermeture explicite du composer, jamais appelée
  // dans ce cas — sans ce filet, les aperçus blob restants fuyaient en
  // mémoire pour toute la durée de vie de l'onglet.
  const mediaItemsRef = useRef(mediaItems);
  mediaItemsRef.current = mediaItems;
  useEffect(() => () => revokePreviews(mediaItemsRef.current), []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeComposerFully = () => {
    composerSessionRef.current += 1;
    setExitConfirmOpen(false);
    setComposer(false);
    setDraft("");
    revokePreviews(mediaItems);
    setMediaItems([]);
    setUploadStates({});
    setPublishedPostId(null);
    setResumedDraft(false);
  };

  const saveDraftAndClose = () => {
    const key = draftKey();
    if (key) {
      try {
        if (draft.trim()) localStorage.setItem(key, draft.trim());
        else localStorage.removeItem(key);
      } catch (_) {}
    }
    setExitConfirmOpen(false);
    setDraftSavedNotice(true);
    setTimeout(() => { setDraftSavedNotice(false); closeComposerFully(); }, 1100);
  };

  const discardComposer = () => {
    const key = draftKey();
    if (key) { try { localStorage.removeItem(key); } catch (_) {} }
    closeComposerFully();
  };

  const discardResumedDraft = () => {
    const key = draftKey();
    if (key) { try { localStorage.removeItem(key); } catch (_) {} }
    setDraft("");
    setResumedDraft(false);
  };

  const pickMedia = (kind) => {
    if (kind === "photo") photoInputRef.current?.click();
    else videoInputRef.current?.click();
  };

  // Point d'entrée commun pour la sélection via input ET le glisser-déposer
  // (item 25) — trie les fichiers par type déclaré plutôt que d'exiger un
  // "kind" unique par lot, pour que déposer un mélange photo+vidéo marche.
  const addFiles = async (files) => {
    // Voir composerSessionRef : capturé ici, revérifié après chaque await
    // pour ignorer un résultat qui arriverait après la fermeture du
    // composeur (croix/fond/Échap cliqué pendant la validation/compression).
    const session = composerSessionRef.current;
    const room = MAX_MEDIA_ITEMS - mediaItems.length;
    if (room <= 0) {
      onError(`Maximum ${MAX_MEDIA_ITEMS} fichiers par publication.`);
      return;
    }
    const toProcess = files.slice(0, room);
    if (files.length > toProcess.length) onError(`Seuls les ${room} premiers fichiers ont été ajoutés (max ${MAX_MEDIA_ITEMS}).`);

    for (const file of toProcess) {
      const kind = file.type.startsWith("video/") ? "video" : "photo";
      const { ok, error } = await validateMediaFile(file, kind === "video" ? "video" : "image");
      if (session !== composerSessionRef.current) return; // composeur fermé entre-temps
      if (!ok) { onError(error); continue; }
      // 1920 px conservé volontairement : une photo de fil s'ouvre en plein
      // écran (visionneuse), c'est le contenu qu'on regarde le plus en grand
      // de l'app — voir le paramètre maxDimension de imageCompression.js.
      const finalFile = kind === "photo" ? await compressImageIfNeeded(file, 1920) : file;
      if (session !== composerSessionRef.current) return; // composeur fermé entre-temps
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: finalFile, kind, previewUrl: URL.createObjectURL(finalFile) };
      setMediaItems((prev) => [...prev, item]);
    }
  };

  const onMediaSelected = async (e, kind) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    // looksLikeImage (et non f.type.startsWith("image/")) : sur Android/Windows
    // un JPEG/HEIC peut arriver avec un file.type VIDE — il était écarté ici
    // sans le moindre message, comme si la sélection n'avait rien donné.
    const accepted = files.filter((f) => (kind === "video" ? f.type.startsWith("video/") : looksLikeImage(f)));
    if (accepted.length < files.length) {
      onError(kind === "video" ? "Seules les vidéos peuvent être ajoutées ici." : "Seules les photos peuvent être ajoutées ici.");
    }
    if (accepted.length === 0) return;
    await addFiles(accepted);
  };

  const removeMediaItem = (id) => {
    setMediaItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item) { try { URL.revokeObjectURL(item.previewUrl); } catch (_) {} }
      return prev.filter((it) => it.id !== id);
    });
    setUploadStates((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const moveMediaItem = (id, direction) => {
    setMediaItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  // Upload d'un seul item + insertion post_media — factorisé pour être
  // rejouable tel quel par "Réessayer" sur un item en échec, sans toucher
  // aux autres ni à la publication texte déjà créée.
  const uploadOneMedia = async (postId, item, position) => {
    setUploadStates((prev) => ({ ...prev, [item.id]: { status: "uploading", progress: 0 } }));
    try {
      const path = `${currentUser.user_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extFromMime(item.file.type)}`;
      await uploadWithProgress({
        bucket: POST_MEDIA_BUCKET,
        path,
        file: item.file,
        onProgress: (pct) => setUploadStates((prev) => ({ ...prev, [item.id]: { status: "uploading", progress: pct } })),
      });
      const { data: publicUrlData } = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path);
      const { data: mediaRow, error: mediaError } = await supabase
        .from("post_media")
        .insert({ post_id: postId, url: publicUrlData.publicUrl, kind: item.kind === "video" ? "video" : "photo", position })
        .select()
        .single();
      if (mediaError) {
        // Issue incertaine (coupure PENDANT l'insertion : la ligne existe peut-être
        // déjà) : on la cherche par son url, unique pour ce fichier. Trouvée = la
        // photo est bien attachée, rien à nettoyer ni à réessayer (sinon "Réessayer"
        // l'attachait une seconde fois) ; vérification impossible = on garde le
        // fichier (supprimer casserait une ligne qui existe).
        if (isAmbiguousWriteError(mediaError)) {
          const { data: existing, error: lookupError } = await supabase
            .from("post_media").select("*").eq("post_id", postId).eq("url", publicUrlData.publicUrl).maybeSingle();
          if (!lookupError && existing) {
            setUploadStates((prev) => ({ ...prev, [item.id]: { status: "done", progress: 100 } }));
            return existing;
          }
          if (lookupError) throw mediaError;
        }
        // Upload Storage réussi mais insertion post_media définitivement refusée :
        // sans ce nettoyage le fichier restait orphelin dans le bucket pour
        // toujours (rien en base ne le référence, "Réessayer" uploade un nouveau
        // chemin sans jamais toucher à celui-ci).
        supabase.storage.from(POST_MEDIA_BUCKET).remove([path]).catch(() => {});
        throw mediaError;
      }
      setUploadStates((prev) => ({ ...prev, [item.id]: { status: "done", progress: 100 } }));
      return mediaRow;
    } catch (err) {
      console.error(err);
      setUploadStates((prev) => ({ ...prev, [item.id]: { status: "error", progress: 0, error: "Impossible d'envoyer le fichier." } }));
      return null;
    }
  };

  const retryMediaItem = async (id) => {
    if (!publishedPostId) return;
    const idx = mediaItems.findIndex((it) => it.id === id);
    const item = mediaItems[idx];
    if (!item) return;
    const row = await uploadOneMedia(publishedPostId, item, idx);
    if (row) {
      setPosts((prev) => prev.map((p) => (p.id === publishedPostId ? { ...p, post_media: [...p.post_media, row].sort((a, b) => a.position - b.position) } : p)));
    }
  };

  // Retenté depuis "Terminé" si des items restent en attente (jamais lancés
  // parce qu'une publication précédente a échoué avant d'atteindre cet
  // item) — mêmes garanties que le premier passage.
  const publish = async () => {
    if (publishing || publishingRef.current) return;
    if (publishedPostId) {
      // Une publication est déjà créée (retour après échec partiel) : ne
      // relance que les médias qui n'ont jamais réussi.
      const pending = mediaItems.filter((it) => uploadStates[it.id]?.status !== "done");
      if (pending.length === 0) { closeComposerFully(); return; }
      publishingRef.current = true;
      setPublishing(true);
      try {
        for (let i = 0; i < mediaItems.length; i++) {
          if (uploadStates[mediaItems[i].id]?.status === "done") continue;
          const row = await uploadOneMedia(publishedPostId, mediaItems[i], i);
          if (row) setPosts((prev) => prev.map((p) => (p.id === publishedPostId ? { ...p, post_media: [...p.post_media, row].sort((a, b) => a.position - b.position) } : p)));
        }
      } finally {
        publishingRef.current = false;
        setPublishing(false);
      }
      return;
    }

    if ((!draft.trim() && mediaItems.length === 0) || !currentUser) return;
    publishingRef.current = true;
    setPublishing(true);
    try {
      const body = draft.trim() || PLACEHOLDER_BODY;
      const postSelect = "*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)";
      const outcome = await insertWithRecovery({
        client: supabase,
        table: "posts",
        attempt: () => supabase.from("posts").insert({ author_id: currentUser.id, body }).select(postSelect).single(),
        filters: { author_id: currentUser.id, body },
        select: postSelect,
        knownIds: new Set(postsRef.current.map((p) => p.id)),
        retry: ambiguousPublishBodyRef.current === body,
      });
      ambiguousPublishBodyRef.current = outcome.error && outcome.ambiguous ? body : null;
      if (outcome.error) throw outcome.error;
      const inserted = outcome.data;
      setPublishedPostId(inserted.id);
      // Répercute la création sur un compteur affiché ailleurs (ex. tuile
      // "Publications" du profil, qui ne remonte jamais dans cet arbre de
      // composants) — même principe que adjustMemberCount côté communautés :
      // un delta local plutôt qu'un recomptage complet à chaque publication.
      onPostCountChange(1);

      // Optimiste : la publication apparaît dans le fil dès que le texte est
      // en base, sans attendre la fin des uploads (item 21 du cahier des
      // charges) — les médias se complètent en direct dans la même carte.
      setPosts((p) => [{ ...inserted, post_media: [] }, ...p]);

      const mediaRows = [];
      for (let i = 0; i < mediaItems.length; i++) {
        const row = await uploadOneMedia(inserted.id, mediaItems[i], i);
        if (row) {
          mediaRows.push(row);
          setPosts((prev) => prev.map((p) => (p.id === inserted.id ? { ...p, post_media: [...p.post_media, row].sort((a, b) => a.position - b.position) } : p)));
        }
      }

      const failedCount = mediaItems.length - mediaRows.length;
      if (failedCount > 0) {
        onError(`Publication créée, mais ${failedCount} média${failedCount > 1 ? "s" : ""} n'${failedCount > 1 ? "ont" : "a"} pas pu être envoyé${failedCount > 1 ? "s" : ""}.`);
        // Reste ouvert : l'utilisateur voit quels items ont échoué et peut
        // réessayer individuellement, ou fermer directement via "Terminé".
      } else {
        // La publication est déjà en base à ce stade (insert + médias
        // réussis) — un échec de localStorage.removeItem (stockage
        // désactivé/plein) ne doit jamais remonter jusqu'au catch ci-dessous
        // et faire croire à l'utilisateur que "Impossible de publier" alors
        // que sa publication a bel et bien réussi.
        const key = draftKey();
        if (key) { try { localStorage.removeItem(key); } catch (_) {} }
        closeComposerFully();
      }
    } catch (e) {
      console.error(e);
      // check_post_creation_rate_limit() (supabase-content-creation-limits-fix.sql)
      // lève un message déjà propre en français ("Trop de publications creees
      // recemment, reessaie plus tard") quand la limite de 50 publications/24h
      // est atteinte — ce catch affichait avant un "Impossible de publier.
      // Réessaie." générique qui masquait cette vraie raison et poussait à
      // réessayer en boucle, même motif que addStory() (SocialShell.jsx).
      onError(friendlyDbError(e) || (isNetworkFailure(e) ? `${networkFailureMessage()} Ta publication n'a pas pu être vérifiée : réessaie.` : "Impossible de publier. Réessaie."));
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  const deletePost = async (post) => {
    try {
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (error) throw error;
      setPosts((p) => p.filter((x) => x.id !== post.id));
      onPostCountChange(-1);
      const marker = `/${POST_MEDIA_BUCKET}/`;
      const cleanupUrl = (url) => {
        if (!url) return;
        const idx = url.indexOf(marker);
        if (idx !== -1) {
          const storagePath = decodeURIComponent(url.slice(idx + marker.length));
          supabase.storage.from(POST_MEDIA_BUCKET).remove([storagePath]).catch(() => {});
        }
      };
      cleanupUrl(post.media_url);
      (post.post_media || []).forEach((m) => cleanupUrl(m.url));
    } catch (e) {
      console.error(e);
      onError("Impossible de supprimer cette publication.");
    }
  };

  const editPost = async (post, newBody) => {
    // Garde anti-double-soumission — voir editSubmittingRef ci-dessus.
    if (editSubmittingRef.current.has(post.id)) return;
    editSubmittingRef.current.add(post.id);
    try {
      // Contrôle de concurrence optimiste : deux onglets peuvent avoir chargé
      // la même publication, l'un l'édite et enregistre pendant que l'autre
      // affiche encore l'ancien texte en mémoire. Sans condition sur l'état
      // connu par CE post au moment de l'ouverture de l'édition, le second
      // onglet qui clique "Enregistrer" (même sans rien changer) écraserait
      // silencieusement la modification du premier avec son propre texte
      // obsolète — l'auteur croirait avoir sauvegardé sa dernière version
      // alors que l'ancienne aurait gagné. On conditionne donc l'UPDATE sur
      // `updated_at` tel que connu localement (jamais modifié -> IS NULL) :
      // si la ligne a changé entre-temps, la condition ne correspond plus,
      // aucune ligne n'est mise à jour, et on prévient l'utilisateur au lieu
      // d'écraser en silence.
      let query = supabase.from("posts").update({ body: newBody, updated_at: new Date().toISOString() }).eq("id", post.id);
      query = post.updated_at ? query.eq("updated_at", post.updated_at) : query.is("updated_at", null);
      const { data, error } = await query
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        onError("Cette publication a été modifiée entre-temps (autre onglet ?). Recharge le fil avant de réessayer pour ne pas écraser la dernière version.");
        return;
      }
      setPosts((p) => p.map((x) => (x.id === post.id ? { ...x, ...data } : x)));
    } catch (e) {
      console.error(e);
      onError("Impossible de modifier cette publication.");
    } finally {
      editSubmittingRef.current.delete(post.id);
    }
  };

  const toggleLike = async (post) => {
    if (!currentUser || likeInFlightRef.current.has(post.id)) return;
    likeInFlightRef.current.add(post.id);
    const wasLiked = likedPostIds.has(post.id);
    setLikedPostIds((s) => { const n = new Set(s); wasLiked ? n.delete(post.id) : n.add(post.id); return n; });
    setPostLikeCounts((c) => ({ ...c, [post.id]: Math.max(0, (c[post.id] || 0) + (wasLiked ? -1 : 1)) }));
    try {
      if (wasLiked) {
        const { error } = await supabase.from("post_likes").delete().eq("post_id", post.id).eq("profile_id", currentUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("post_likes").insert({ post_id: post.id, profile_id: currentUser.id });
        // Même motif que toggleFavorite/toggleFollow (SocialShell.jsx) et
        // handlePass/handleLike (App.jsx) : contrainte unique(post_id,
        // profile_id) sur "post_likes". Un conflit (23505) — déjà liké depuis
        // un autre onglet/appareil, ou double-tap — ne doit pas annuler la
        // mise à jour optimiste ci-dessus : ce like est déjà réel en base.
        if (error && error.code !== "23505") throw error;
      }
    } catch (e) {
      console.error(e);
      setLikedPostIds((s) => { const n = new Set(s); wasLiked ? n.add(post.id) : n.delete(post.id); return n; });
      setPostLikeCounts((c) => ({ ...c, [post.id]: Math.max(0, (c[post.id] || 0) + (wasLiked ? 1 : -1)) }));
      onError("Impossible de mettre à jour ce like.");
    } finally {
      likeInFlightRef.current.delete(post.id);
    }
  };

  const loadComments = async (postId) => {
    try {
      const { data, error } = await supabase
        .from("post_comments").select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      // Idem : pas de filtrage blockedIds ici, il est appliqué au rendu.
      setCommentsByPost((c) => ({ ...c, [postId]: { items: data || [] } }));
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les commentaires.");
    }
  };

  const submitComment = async (postId, text) => {
    if (!currentUser) return false;
    if (commentSubmittingRef.current.has(postId)) return false;
    commentSubmittingRef.current.add(postId);
    try {
      const commentSelect = "*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)";
      const attemptKey = `${postId}:${text}`;
      const outcome = await insertWithRecovery({
        client: supabase,
        table: "post_comments",
        attempt: () => supabase.from("post_comments").insert({ post_id: postId, author_id: currentUser.id, body: text }).select(commentSelect).single(),
        filters: { post_id: postId, author_id: currentUser.id, body: text },
        select: commentSelect,
        knownIds: new Set((commentsByPost[postId]?.items || []).map((c) => c.id)),
        retry: ambiguousCommentsRef.current.has(attemptKey),
      });
      if (outcome.error && outcome.ambiguous) ambiguousCommentsRef.current.add(attemptKey);
      else ambiguousCommentsRef.current.delete(attemptKey);
      if (outcome.error) throw outcome.error;
      const data = outcome.data;
      setCommentsByPost((c) => ({ ...c, [postId]: { items: [...(c[postId]?.items || []).filter((x) => x.id !== data.id), data] } }));
      setPostCommentCounts((c) => ({ ...c, [postId]: (c[postId] || 0) + 1 }));
      return true;
    } catch (e) {
      console.error(e);
      onError(isNetworkFailure(e) ? `${networkFailureMessage()} Impossible d'envoyer ce commentaire.` : "Impossible d'envoyer ce commentaire.");
      return false;
    } finally {
      commentSubmittingRef.current.delete(postId);
    }
  };

  const openReport = (post) => {
    setReportTarget({ type: "post", id: post.id, name: "cette publication", author: { id: post.author_id, name: post.profiles?.name || "cet auteur" } });
    setReportCategory("");
    setReportReason("");
    setReportSubmitted(false);
  };

  // Bug corrigé : post_reports.target_type autorise ('post','comment') côté
  // base et submitReport() ci-dessous est déjà générique, mais aucun appelant
  // ne passait jamais "comment" — un commentaire abusif isolé ne pouvait pas
  // être signalé (voir bouton ajouté dans PostCard.jsx).
  const openReportComment = (comment) => {
    setReportTarget({ type: "comment", id: comment.id, name: "ce commentaire", author: { id: comment.author_id, name: comment.profiles?.name || "cet auteur" } });
    setReportCategory("");
    setReportReason("");
    setReportSubmitted(false);
  };

  const submitReport = async () => {
    if (!currentUser || !reportTarget || !reportCategory) return;
    if (reportCategory === "autre" && !reportReason.trim()) return;
    if (reportSendingRef.current) return;
    reportSendingRef.current = true;
    setReportSending(true);
    try {
      const { error } = await supabase.from("post_reports").insert({
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
      onError("Impossible d'envoyer ce signalement.");
    } finally {
      reportSendingRef.current = false;
      setReportSending(false);
    }
  };

  const composerProps = {
    composer,
    onRequestClose: requestCloseComposer,
    currentUser,
    draft,
    setDraft,
    mediaItems,
    uploadStates,
    publishing,
    publishedPostId,
    pickMedia,
    onMediaSelected,
    onFilesSelected: addFiles,
    onRemoveMediaItem: removeMediaItem,
    onMoveMediaItem: moveMediaItem,
    onRetryMediaItem: retryMediaItem,
    photoInputRef,
    videoInputRef,
    publish,
    exitConfirmOpen,
    onCancelExit: () => setExitConfirmOpen(false),
    onSaveDraft: saveDraftAndClose,
    onDiscard: discardComposer,
    draftSavedNotice,
    resumedDraft,
    onDiscardResumed: discardResumedDraft,
  };

  // Filtré ici (au rendu) plutôt qu'au chargement — voir le commentaire
  // dans loadPosts() : un blocage effectué pendant que ce fil reste monté
  // doit faire disparaître ses publications immédiatement, sans recharger.
  const visiblePosts = posts.filter((p) => !blockedIds.has(p.author_id));

  if (layout === "grid") {
    return (
      <div className="p-3">
        {postsLoading ? (
          <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
        ) : visiblePosts.length === 0 && loadError ? (
          <LoadErrorNotice what="les publications" onRetry={() => loadPosts(null)} />
        ) : visiblePosts.length === 0 ? (
          <div className="p-10 text-center">
            <ImageIcon size={26} className="mx-auto mb-2" color={muted} />
            <p className="text-sm mb-3" style={{ color: muted }}>Pas encore de publication.</p>
            <button onClick={openComposer} className="bb-btn-gold px-4 py-2.5 rounded-xl font-bold text-sm">Créer ma première publication</button>
          </div>
        ) : (
          <>
            <button onClick={openComposer} className="w-full mb-3 py-2.5 rounded-xl font-bold text-sm" style={{ background: bg, color: primary }}>+ Nouvelle publication</button>
            <div className="grid grid-cols-3 gap-0.5">
              {visiblePosts.map((p) => {
                const first = p.post_media?.[0];
                const mediaUrl = first?.url || p.media_url;
                const mediaKind = first?.kind || p.media_kind;
                const extraCount = (p.post_media?.length || 0) > 1 ? p.post_media.length - 1 : 0;
                return (
                  <div key={p.id} className="aspect-square relative overflow-hidden group">
                    {mediaUrl ? (
                      mediaKind === "video" ? (
                        <video src={mediaUrl} playsInline preload="metadata" className="w-full h-full object-cover" />
                      ) : (
                        <img src={mediaUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center p-3 text-center" style={{ background: `linear-gradient(150deg,${navy},${coral})` }}>
                        <span className="text-white text-[11px] font-semibold leading-4 line-clamp-4">{p.body}</span>
                      </div>
                    )}
                    {extraCount > 0 && (
                      <span className="absolute top-1 left-1 rounded-full bg-black/55 text-white text-[10px] font-bold px-1.5 py-0.5">+{extraCount}</span>
                    )}
                    <button
                      // Grille compacte (72px de côté) où ce bouton × est
                      // superposé directement sur la vignette — un mistap au
                      // doigt supprimait la publication (+ ses médias) sans
                      // aucun moyen d'annuler. Même confirmation que le fil
                      // en liste (PostCard.jsx) et le reste de l'app.
                      onClick={() => setPendingDelete(p)}
                      aria-label="Supprimer la publication"
                      className="bb-hit absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white items-center justify-center hidden group-hover:flex [@media(hover:none)]:flex focus-visible:flex focus-visible:outline focus-visible:outline-2"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            {hasMore && (
              <>
                <div ref={sentinelRef} aria-hidden="true" />
                <button onClick={loadMore} className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold" style={{ background: bg, color: primary }}>Charger plus</button>
              </>
            )}
          </>
        )}

        <PostComposerModal {...composerProps} />

        <ConfirmModal
          open={Boolean(pendingDelete)}
          title="Supprimer cette publication ?"
          message="Cette action est irréversible."
          confirmLabel="Supprimer"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => { deletePost(pendingDelete); setPendingDelete(null); }}
        />
      </div>
    );
  }

  return (
    <div className={`${card} p-5`}>
      <PullToRefreshIndicator pull={pullToRefresh.pull} refreshing={pullToRefresh.refreshing} threshold={pullToRefresh.threshold} />
      <button onClick={openComposer} className="w-full text-left px-4 py-3 rounded-full text-sm mb-3" style={{ background: bg, color: muted }}>
        Partage quelque chose avec la communauté...
      </button>

      {postsLoading ? (
        <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
      ) : visiblePosts.length === 0 && loadError ? (
        <LoadErrorNotice what="les publications" onRetry={() => loadPosts(null)} />
      ) : visiblePosts.length === 0 ? (
        <EmptyState icon={ImageIcon} title="Aucune publication pour l'instant." subtitle="Sois le/la premier·ère à partager quelque chose." />
      ) : (
        <>
          {newPostsCount > 0 && (
            <button onClick={loadNewPosts} className="bb-btn-gold w-full mb-3 py-2.5 rounded-xl text-sm font-bold">
              {newPostsCount} nouvelle{newPostsCount > 1 ? "s" : ""} publication{newPostsCount > 1 ? "s" : ""} — voir
            </button>
          )}
          <div className="flex flex-col">
            {visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUser?.id}
                liked={likedPostIds.has(post.id)}
                likeCount={postLikeCounts[post.id] || 0}
                commentCount={postCommentCounts[post.id] || 0}
                comments={(commentsByPost[post.id]?.items || []).filter((c) => !blockedIds.has(c.author_id))}
                commentsLoaded={Boolean(commentsByPost[post.id])}
                onToggleLike={toggleLike}
                onLoadComments={loadComments}
                onSubmitComment={submitComment}
                onReport={openReport}
                onReportComment={openReportComment}
                onDelete={deletePost}
                onEdit={editPost}
                onViewProfile={onViewProfile}
                onBlockAuthor={onBlockProfile}
              />
            ))}
          </div>
          {hasMore && (
            <>
              <div ref={sentinelRef} aria-hidden="true" />
              <button onClick={loadMore} className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold" style={{ background: bg, color: primary }}>Charger plus</button>
            </>
          )}
        </>
      )}

      <PostComposerModal {...composerProps} />

      <ReportModal
        target={reportTarget}
        category={reportCategory}
        setCategory={setReportCategory}
        reason={reportReason}
        setReason={setReportReason}
        sending={reportSending}
        submitted={reportSubmitted}
        onCancel={() => setReportTarget(null)}
        onSubmit={submitReport}
        onDismissAfterSubmit={() => setReportTarget(null)}
        // Après un signalement de contenu : proposition de bloquer son auteur (même
        // confirmation de blocage que partout ailleurs, jamais de blocage direct).
        onBlockAlso={reportTarget?.author && reportTarget.author.id !== currentUser?.id && onBlockProfile
          ? (t) => { const author = t.author; setReportTarget(null); onBlockProfile(author); }
          : undefined}
        categories={POST_REPORT_CATEGORIES}
        targetLabel={reportTarget?.name}
      />
    </div>
  );
}
