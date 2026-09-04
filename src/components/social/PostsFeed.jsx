import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "../../supabaseClient";
import PostCard from "./PostCard";
import PostComposerModal from "./PostComposerModal";
import PostMediaGrid from "./PostMediaGrid";
import ReportModal from "./ReportModal";
import ConfirmModal from "./ConfirmModal";
import EmptyState from "../home/EmptyState";
import { validateMediaFile } from "../../lib/mediaValidation";
import { truncateUnicodeSafe } from "../../utils/format";
import { compressImageIfNeeded } from "../../lib/imageCompression";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { POST_MEDIA_BUCKET, extFromMime } from "../../lib/mediaConstants";
import { beginCriticalOperation, endCriticalOperation } from "../../lib/criticalOperationGuard";
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
export default function PostsFeed({ currentUser, blockedIds = new Set(), authorId, layout = "list", onError = () => {}, onPostCountChange = () => {} }) {
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
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

  // Scroll infini + bandeau "nouvelles publications" (item audit — jusqu'ici
  // seul un bouton "Charger plus" manuel existait, aucun moyen de savoir
  // qu'il y avait du nouveau contenu sans recharger toute la page).
  const [newPostsCount, setNewPostsCount] = useState(0);
  const sentinelRef = useRef(null);
  const loadingMoreRef = useRef(false);

  const [reportTarget, setReportTarget] = useState(null);
  const [reportCategory, setReportCategory] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const loadCounts = async (ids, replace) => {
    if (ids.length === 0) {
      if (replace) { setPostLikeCounts({}); setLikedPostIds(new Set()); setPostCommentCounts({}); }
      return;
    }
    const [likesRes, commentsRes] = await Promise.all([
      supabase.from("post_likes").select("post_id, profile_id").in("post_id", ids),
      supabase.from("post_comments").select("post_id").in("post_id", ids),
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
  const loadPosts = async (pageCursor) => {
    const isFirstPage = !pageCursor;
    if (isFirstPage) setPostsLoading(true);
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
      setHasMore((data || []).length === PAGE_SIZE);
      const last = (data || [])[(data || []).length - 1];
      setCursor(last ? { created_at: last.created_at, id: last.id } : null);
      await loadCounts(rows.map((p) => p.id), isFirstPage);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les publications.");
    } finally {
      if (isFirstPage) setPostsLoading(false);
    }
  };

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
        if (blockedIds.has(payload.new.author_id)) return;
        setNewPostsCount((n) => n + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id, authorId, blockedIds]);

  const loadNewPosts = () => {
    loadPosts(null);
    setNewPostsCount(0);
    // Le nouveau contenu remplace le début du fil (voir loadPosts) : sans
    // remonter la page, l'utilisateur scrollé plus bas ne voit aucun
    // changement visible en cliquant sur la bannière.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

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
      if (!ok) { onError(error); continue; }
      const finalFile = kind === "photo" ? await compressImageIfNeeded(file) : file;
      const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: finalFile, kind, previewUrl: URL.createObjectURL(finalFile) };
      setMediaItems((prev) => [...prev, item]);
    }
  };

  const onMediaSelected = async (e, kind) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    await addFiles(files.filter((f) => (kind === "video" ? f.type.startsWith("video/") : f.type.startsWith("image/"))));
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
        // Upload Storage réussi mais insertion post_media échouée : sans ce
        // nettoyage le fichier restait orphelin dans le bucket pour toujours
        // (rien en base ne le référence, "Réessayer" uploade un nouveau
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
    beginCriticalOperation();
    try {
      const body = draft.trim() || PLACEHOLDER_BODY;
      const { data: inserted, error } = await supabase
        .from("posts")
        .insert({ author_id: currentUser.id, body })
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .single();
      if (error) throw error;
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
      onError("Impossible de publier. Réessaie.");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
      endCriticalOperation();
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
    try {
      const { data, error } = await supabase
        .from("posts")
        .update({ body: newBody, updated_at: new Date().toISOString() })
        .eq("id", post.id)
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)")
        .single();
      if (error) throw error;
      setPosts((p) => p.map((x) => (x.id === post.id ? { ...x, ...data } : x)));
    } catch (e) {
      console.error(e);
      onError("Impossible de modifier cette publication.");
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
        if (error) throw error;
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
    if (!currentUser) return;
    try {
      const { data, error } = await supabase
        .from("post_comments").insert({ post_id: postId, author_id: currentUser.id, body: text })
        .select("*, profiles(name, avatar_url, is_founder, is_premium, email_verified, phone_verified)").single();
      if (error) throw error;
      setCommentsByPost((c) => ({ ...c, [postId]: { items: [...(c[postId]?.items || []), data] } }));
      setPostCommentCounts((c) => ({ ...c, [postId]: (c[postId] || 0) + 1 }));
    } catch (e) {
      console.error(e);
      onError("Impossible d'envoyer ce commentaire.");
    }
  };

  const openReport = (post) => {
    setReportTarget({ type: "post", id: post.id, name: "cette publication" });
    setReportCategory("");
    setReportReason("");
    setReportSubmitted(false);
  };

  // Bug corrigé : post_reports.target_type autorise ('post','comment') côté
  // base et submitReport() ci-dessous est déjà générique, mais aucun appelant
  // ne passait jamais "comment" — un commentaire abusif isolé ne pouvait pas
  // être signalé (voir bouton ajouté dans PostCard.jsx).
  const openReportComment = (comment) => {
    setReportTarget({ type: "comment", id: comment.id, name: "ce commentaire" });
    setReportCategory("");
    setReportReason("");
    setReportSubmitted(false);
  };

  const submitReport = async () => {
    if (!currentUser || !reportTarget || !reportCategory) return;
    if (reportCategory === "autre" && !reportReason.trim()) return;
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
                        <video src={mediaUrl} preload="metadata" className="w-full h-full object-cover" />
                      ) : (
                        <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
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
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white items-center justify-center hidden group-hover:flex focus-visible:flex focus-visible:outline focus-visible:outline-2"
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
      <button onClick={openComposer} className="w-full text-left px-4 py-3 rounded-full text-sm mb-3" style={{ background: bg, color: muted }}>
        Partage quelque chose avec la communauté...
      </button>

      {postsLoading ? (
        <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
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
        targetLabel={reportTarget?.name}
      />
    </div>
  );
}
