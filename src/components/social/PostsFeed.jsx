import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { supabase } from "../../supabaseClient";
import PostCard from "./PostCard";
import PostComposerModal from "./PostComposerModal";
import ReportModal from "./ReportModal";
import EmptyState from "../home/EmptyState";
import { validateMediaFile } from "../../lib/mediaValidation";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { POST_MEDIA_BUCKET, extFromMime } from "../../lib/mediaConstants";
import { beginCriticalOperation, endCriticalOperation } from "../../lib/criticalOperationGuard";
import { primary, navy, coral, muted, bg, card } from "./theme";

const PAGE_SIZE = 20;
const PLACEHOLDER_BODY = "Nouveau partage sur Baobab ✨";

// Fil de publications réellement persisté (corrige le bug identifié à
// l'audit : le composeur n'écrivait auparavant jamais dans Supabase).
// authorId + layout="grid" réutilisé tel quel par ProfileTab.jsx ("Mes
// publications") plutôt que de dupliquer la logique de fetch/CRUD.
export default function PostsFeed({ currentUser, blockedIds = new Set(), authorId, layout = "list", onError = () => {} }) {
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState(new Set());
  const [postLikeCounts, setPostLikeCounts] = useState({});
  const [postCommentCounts, setPostCommentCounts] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});

  const [composer, setComposer] = useState(false);
  const [draft, setDraft] = useState("");
  const [composerMedia, setComposerMedia] = useState(null);
  const [composerMediaKind, setComposerMediaKind] = useState("");
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState(false);
  const [resumedDraft, setResumedDraft] = useState(false);
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const publishingRef = useRef(false);
  const likeInFlightRef = useRef(new Set());

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

  const loadPosts = async (pageNum) => {
    if (pageNum === 0) setPostsLoading(true);
    try {
      let query = supabase.from("posts").select("*, profiles(name, avatar_url)").order("created_at", { ascending: false });
      if (authorId) query = query.eq("author_id", authorId);
      const { data, error } = await query.range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      const rows = (data || []).filter((p) => !blockedIds.has(p.author_id));
      setPosts((prev) => (pageNum === 0 ? rows : [...prev, ...rows]));
      setHasMore((data || []).length === PAGE_SIZE);
      setPage(pageNum);
      await loadCounts(rows.map((p) => p.id), pageNum === 0);
    } catch (e) {
      console.error(e);
      onError("Impossible de charger les publications.");
    } finally {
      if (pageNum === 0) setPostsLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    loadPosts(0);
  }, [currentUser?.id, authorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brouillon texte uniquement (localStorage) — un média sélectionné (File)
  // ne survit pas à un rechargement de page, donc ne prétend jamais l'être :
  // "Enregistrer en brouillon" abandonne le média s'il y en a un, ne garde
  // que le texte. Une seule clé par utilisateur (pas de liste de brouillons
  // multiples) : cohérent avec le composeur actuel, à un seul post en cours.
  const draftKey = () => (currentUser?.id ? `baobab_post_draft_${currentUser.id}` : null);

  const openComposer = () => {
    const key = draftKey();
    const saved = key ? localStorage.getItem(key) : null;
    if (saved) {
      setDraft(saved);
      setResumedDraft(true);
    }
    setComposer(true);
  };

  const hasUnsavedContent = () => draft.trim().length > 0 || Boolean(composerMedia);

  const requestCloseComposer = () => {
    if (hasUnsavedContent()) {
      setExitConfirmOpen(true);
    } else {
      closeComposerFully();
    }
  };

  const closeComposerFully = () => {
    setExitConfirmOpen(false);
    setComposer(false);
    setDraft("");
    setComposerMedia(null);
    setComposerMediaKind("");
    setResumedDraft(false);
  };

  const saveDraftAndClose = () => {
    const key = draftKey();
    if (key) {
      if (draft.trim()) localStorage.setItem(key, draft.trim());
      else localStorage.removeItem(key);
    }
    setExitConfirmOpen(false);
    setDraftSavedNotice(true);
    setTimeout(() => { setDraftSavedNotice(false); closeComposerFully(); }, 1100);
  };

  const discardComposer = () => {
    const key = draftKey();
    if (key) localStorage.removeItem(key);
    closeComposerFully();
  };

  const discardResumedDraft = () => {
    const key = draftKey();
    if (key) localStorage.removeItem(key);
    setDraft("");
    setResumedDraft(false);
  };

  const pickMedia = (kind) => {
    if (kind === "photo") photoInputRef.current?.click();
    else videoInputRef.current?.click();
  };

  const onMediaSelected = async (e, kind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { ok, error } = await validateMediaFile(file, kind === "photo" ? "image" : "video");
    if (!ok) { onError(error); return; }
    setComposerMedia(file);
    setComposerMediaKind(kind);
  };

  const publish = async () => {
    if ((!draft.trim() && !composerMedia) || !currentUser || publishingRef.current) return;
    publishingRef.current = true;
    beginCriticalOperation();
    try {
      const body = draft.trim() || PLACEHOLDER_BODY;
      const { data: inserted, error } = await supabase
        .from("posts")
        .insert({ author_id: currentUser.id, body })
        .select("*, profiles(name, avatar_url)")
        .single();
      if (error) throw error;
      let finalPost = inserted;
      if (composerMedia) {
        try {
          const path = `${currentUser.user_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extFromMime(composerMedia.type)}`;
          await uploadWithProgress({ bucket: POST_MEDIA_BUCKET, path, file: composerMedia });
          const { data: publicUrlData } = supabase.storage.from(POST_MEDIA_BUCKET).getPublicUrl(path);
          const { data: updated, error: updateError } = await supabase
            .from("posts")
            .update({ media_url: publicUrlData.publicUrl, media_kind: composerMediaKind })
            .eq("id", inserted.id)
            .select("*, profiles(name, avatar_url)")
            .single();
          if (updateError) throw updateError;
          finalPost = updated;
        } catch (mediaErr) {
          console.error(mediaErr);
          onError("Publication créée, mais l'ajout du média a échoué.");
        }
      }
      setPosts((p) => [finalPost, ...p]);
      const key = draftKey();
      if (key) localStorage.removeItem(key);
      setDraft("");
      setComposerMedia(null);
      setComposerMediaKind("");
      setComposer(false);
      setResumedDraft(false);
    } catch (e) {
      console.error(e);
      onError("Impossible de publier. Réessaie.");
    } finally {
      publishingRef.current = false;
      endCriticalOperation();
    }
  };

  const deletePost = async (post) => {
    try {
      const { error } = await supabase.from("posts").delete().eq("id", post.id);
      if (error) throw error;
      setPosts((p) => p.filter((x) => x.id !== post.id));
      if (post.media_url) {
        const marker = `/${POST_MEDIA_BUCKET}/`;
        const idx = post.media_url.indexOf(marker);
        if (idx !== -1) {
          const storagePath = decodeURIComponent(post.media_url.slice(idx + marker.length));
          supabase.storage.from(POST_MEDIA_BUCKET).remove([storagePath]).catch(() => {});
        }
      }
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
        .select("*, profiles(name, avatar_url)")
        .single();
      if (error) throw error;
      setPosts((p) => p.map((x) => (x.id === post.id ? data : x)));
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
        .from("post_comments").select("*, profiles(name, avatar_url)")
        .eq("post_id", postId).order("created_at", { ascending: true });
      if (error) throw error;
      setCommentsByPost((c) => ({ ...c, [postId]: { items: (data || []).filter((cm) => !blockedIds.has(cm.author_id)) } }));
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
        .select("*, profiles(name, avatar_url)").single();
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

  if (layout === "grid") {
    return (
      <div className="p-3">
        {postsLoading ? (
          <p className="text-sm text-center py-6" style={{ color: muted }}>Chargement...</p>
        ) : posts.length === 0 ? (
          <div className="p-10 text-center">
            <ImageIcon size={26} className="mx-auto mb-2" color={muted} />
            <p className="text-sm mb-3" style={{ color: muted }}>Pas encore de publication.</p>
            <button onClick={openComposer} className="px-4 py-2.5 rounded-xl font-bold text-sm" style={{ background: navy, color: "#fff" }}>Créer ma première publication</button>
          </div>
        ) : (
          <>
            <button onClick={openComposer} className="w-full mb-3 py-2.5 rounded-xl font-bold text-sm" style={{ background: bg, color: primary }}>+ Nouvelle publication</button>
            <div className="grid grid-cols-3 gap-0.5">
              {posts.map((p) => (
                <div key={p.id} className="aspect-square relative overflow-hidden group">
                  {p.media_url ? (
                    p.media_kind === "video" ? (
                      <video src={p.media_url} className="w-full h-full object-cover" />
                    ) : (
                      <img src={p.media_url} alt="" className="w-full h-full object-cover" />
                    )
                  ) : (
                    <div className="w-full h-full flex items-center justify-center p-3 text-center" style={{ background: `linear-gradient(150deg,${navy},${coral})` }}>
                      <span className="text-white text-[11px] font-semibold leading-4 line-clamp-4">{p.body}</span>
                    </div>
                  )}
                  <button
                    onClick={() => deletePost(p)}
                    aria-label="Supprimer la publication"
                    className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 text-white items-center justify-center hidden group-hover:flex focus-visible:flex focus-visible:outline focus-visible:outline-2"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {hasMore && (
              <button onClick={() => loadPosts(page + 1)} className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold" style={{ background: bg, color: primary }}>Charger plus</button>
            )}
          </>
        )}

        <PostComposerModal
          composer={composer}
          onRequestClose={requestCloseComposer}
          currentUser={currentUser}
          draft={draft}
          setDraft={setDraft}
          composerMedia={composerMedia}
          composerMediaKind={composerMediaKind}
          pickMedia={pickMedia}
          onMediaSelected={onMediaSelected}
          photoInputRef={photoInputRef}
          videoInputRef={videoInputRef}
          publish={publish}
          exitConfirmOpen={exitConfirmOpen}
          onCancelExit={() => setExitConfirmOpen(false)}
          onSaveDraft={saveDraftAndClose}
          onDiscard={discardComposer}
          draftSavedNotice={draftSavedNotice}
          resumedDraft={resumedDraft}
          onDiscardResumed={discardResumedDraft}
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
      ) : posts.length === 0 ? (
        <EmptyState icon={ImageIcon} title="Aucune publication pour l'instant." subtitle="Sois le/la premier·ère à partager quelque chose." />
      ) : (
        <>
          <div className="flex flex-col">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUser?.id}
                liked={likedPostIds.has(post.id)}
                likeCount={postLikeCounts[post.id] || 0}
                commentCount={postCommentCounts[post.id] || 0}
                comments={commentsByPost[post.id]?.items || []}
                commentsLoaded={Boolean(commentsByPost[post.id])}
                onToggleLike={toggleLike}
                onLoadComments={loadComments}
                onSubmitComment={submitComment}
                onReport={openReport}
                onDelete={deletePost}
                onEdit={editPost}
              />
            ))}
          </div>
          {hasMore && (
            <button onClick={() => loadPosts(page + 1)} className="w-full mt-3 py-2.5 rounded-xl text-sm font-bold" style={{ background: bg, color: primary }}>Charger plus</button>
          )}
        </>
      )}

      <PostComposerModal
        composer={composer}
        onRequestClose={requestCloseComposer}
        currentUser={currentUser}
        draft={draft}
        setDraft={setDraft}
        composerMedia={composerMedia}
        composerMediaKind={composerMediaKind}
        pickMedia={pickMedia}
        onMediaSelected={onMediaSelected}
        photoInputRef={photoInputRef}
        videoInputRef={videoInputRef}
        publish={publish}
        exitConfirmOpen={exitConfirmOpen}
        onCancelExit={() => setExitConfirmOpen(false)}
        onSaveDraft={saveDraftAndClose}
        onDiscard={discardComposer}
        draftSavedNotice={draftSavedNotice}
        resumedDraft={resumedDraft}
        onDiscardResumed={discardResumedDraft}
      />

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
