import React, { useEffect, useRef, useState } from "react";
import { X, Send, Volume2, VolumeX, Eye, Trash2, MoreVertical, Flag, Ban } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { navy, coral } from "./theme";
import Avatar from "../Avatar";
import StatusBadge from "../StatusBadge";

const REACTIONS = ["❤️", "😂", "😍", "😮", "👏", "🔥"];
const SWIPE_THRESHOLD = 60;

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

export default function StoryViewerModal({
  storyViewerIndex,
  stories,
  closeStoryViewer,
  prevStory,
  nextStory,
  deleteOwnStory,
  storyReply,
  setStoryReply,
  sendStoryReply,
  onVideoDuration,
  durationMs = 5000,
  storyViewCount,
  storyViewers,
  storyViewersLoading,
  storyViewersOpen,
  openStoryViewers,
  closeStoryViewers,
  myStoryReaction,
  sendStoryReaction,
  onOpenProfile,
  onReport,
  onBlock,
}) {
  const [muted, setMuted] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const touchStart = useRef(null);
  // Toujours à jour à chaque rendu (mêmes garanties que onCloseRef dans
  // useEscapeKey.js) — nextStory/prevStory sont redéfinies à chaque rendu de
  // SocialShell et ferment sur visibleStories ; les lire via une ref évite
  // qu'un raccourci clavier déclenché entre deux changements d'index
  // n'appelle une version obsolète (liste de statuts périmée).
  const nextStoryRef = useRef(nextStory);
  nextStoryRef.current = nextStory;
  const prevStoryRef = useRef(prevStory);
  prevStoryRef.current = prevStory;

  useEscapeKey(storyViewerIndex !== null, closeStoryViewer);
  // Piège à focus clavier oublié, comme MediaViewerModal.jsx (visualiseur
  // photo) avant lui : ce visualiseur de statuts plein écran a role="dialog"
  // mais Tab depuis son dernier bouton sortait vers la page cachée derrière
  // l'overlay. dialogRef est posé plus bas sur le conteneur qui enveloppe
  // tous les contrôles (barre du haut, réactions, réponse, panneau des vues).
  const dialogRef = useRef(null);
  useFocusTrap(storyViewerIndex !== null, dialogRef);

  const active = storyViewerIndex !== null && stories[storyViewerIndex];
  // confirmDelete doit aussi être remis à zéro ici : ce composant reste monté
  // en permanence (SocialShell ne le démonte jamais, il rend juste `null` en
  // interne), donc sans ce reset, fermer le visualiseur juste après avoir
  // appuyé sur "Supprimer" (sans confirmer ni annuler) laissait l'écran de
  // confirmation affiché à la prochaine ouverture d'un statut personnel —
  // même un statut différent republié plus tard — au risque d'une
  // suppression accidentelle jamais demandée cette fois-ci.
  useEffect(() => { setVideoError(false); setMenuOpen(false); setConfirmDelete(false); }, [storyViewerIndex]);

  // Navigation clavier (flèches) — jusqu'ici seuls le swipe tactile et les
  // zones cliquables gauche/droite permettaient de changer de statut :
  // MediaViewerModal.jsx (visualiseur photo) supporte les flèches depuis
  // longtemps, mais ce visualiseur de statuts en était resté dépourvu, sans
  // aucune alternative clavier pour l'utilisateur desktop. On ignore la
  // frappe quand le focus est dans le champ de réponse (ou tout autre champ
  // texte) pour ne pas voler le déplacement du curseur pendant la saisie.
  useEffect(() => {
    if (storyViewerIndex === null) return;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") nextStoryRef.current();
      else if (e.key === "ArrowLeft") prevStoryRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyViewerIndex]);
  if (!active) return null;
  const story = stories[storyViewerIndex];

  const applyVideoDuration = (d) => {
    if (Number.isFinite(d) && d > 0) {
      onVideoDuration?.(Math.min(Math.max(Math.round(d * 1000), 3000), 60000));
    }
  };

  // Même bug Chromium que le lecteur de messages vocaux (MessageBubbleMedia.jsx,
  // AudioPlayer) : une vidéo de statut envoyée en webm sans durée écrite dans
  // le conteneur (ex. capture caméra Android en PWA) a `duration === Infinity`
  // au chargement des métadonnées. Sans ce contournement, la condition
  // `Number.isFinite(d)` échouait silencieusement et onVideoDuration n'était
  // jamais appelé : la story restait bloquée sur les 5 s par défaut (barre de
  // progression + auto-avance) au lieu de suivre la durée réelle de la vidéo,
  // la coupant en plein milieu si elle dure plus longtemps. On force le
  // recalcul via un seek loin (déclenche "durationchange"), puis on revient à
  // la position de lecture initiale pour ne pas perturber l'autoplay/loop.
  const handleVideoMeta = (e) => {
    const el = e.currentTarget;
    if (Number.isFinite(el.duration)) {
      applyVideoDuration(el.duration);
      return;
    }
    const onDurationChange = () => {
      el.removeEventListener("durationchange", onDurationChange);
      applyVideoDuration(el.duration);
      el.currentTime = 0;
    };
    el.addEventListener("durationchange", onDurationChange);
    el.currentTime = 1e101;
  };

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dy) > Math.abs(dx) && dy > SWIPE_THRESHOLD) { closeStoryViewer(); return; }
    if (Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) nextStory(); else prevStory();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Statut de ${story.name}`}
      style={{ background: "#000" }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{`
        @keyframes bbStoryBar { from { width: 0%; } to { width: 100%; } }
        .bb-story-bar-fill { animation: bbStoryBar ${durationMs}ms linear forwards; }
      `}</style>
      <div ref={dialogRef} tabIndex={-1} className="relative w-full h-full max-w-md mx-auto" style={{ background: story.media_url ? "#000" : `linear-gradient(160deg,${story.bg_color || story.color},${navy})` }}>
        <div className="absolute inset-0 flex items-center justify-center text-8xl opacity-15">🌍</div>

        {/* Barres de progression, une par story non-personnelle */}
        <div className="absolute top-3 left-3 right-3 flex gap-1.5 z-10">
          {stories.map((s, i) => (
            !s.own && (
              <div key={i} className="h-[3px] flex-1 rounded-full bg-white/25 overflow-hidden">
                {i < storyViewerIndex && <div className="h-full w-full bg-white" />}
                {i === storyViewerIndex && <div className="h-full bg-white bb-story-bar-fill" />}
              </div>
            )
          ))}
        </div>

        <div className="absolute top-8 left-4 right-4 flex items-center gap-2.5 z-10">
          <button
            onClick={() => { if (!story.own) { closeStoryViewer(); onOpenProfile?.(story.profile_id); } }}
            className="h-9 w-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-black border border-white/30 shrink-0 focus-visible:outline focus-visible:outline-2"
            aria-label={story.own ? undefined : `Voir le profil de ${story.name}`}
          >
            {story.initial}
          </button>
          <button
            onClick={() => { if (!story.own) { closeStoryViewer(); onOpenProfile?.(story.profile_id); } }}
            className="text-left min-w-0 flex-1 focus-visible:outline focus-visible:outline-2"
          >
            <div className="text-white text-sm font-bold truncate">{story.name}</div>
            {story.created_at && <div className="text-white/60 text-[11px]">{timeAgo(story.created_at)}</div>}
          </button>
          {story.media_kind === "video" && (
            <button onClick={() => setMuted((m) => !m)} aria-label={muted ? "Activer le son" : "Couper le son"} className="h-9 w-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2">
              {muted ? <VolumeX size={16} color="#fff" /> : <Volume2 size={16} color="#fff" />}
            </button>
          )}
          {!story.own && (
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Signaler ou bloquer"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="h-9 w-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center focus-visible:outline focus-visible:outline-2"
              >
                <MoreVertical size={16} color="#fff" />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute top-11 right-0 rounded-xl overflow-hidden shadow-xl bg-white" style={{ minWidth: 160, zIndex: 20 }}>
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); closeStoryViewer(); onReport?.({ id: story.profile_id, name: story.name }); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left focus-visible:outline focus-visible:outline-2"
                    style={{ color: "#1a1a1a" }}
                  >
                    <Flag size={14} /> Signaler
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); closeStoryViewer(); onBlock?.({ id: story.profile_id, name: story.name }); }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left border-t border-black/10 focus-visible:outline focus-visible:outline-2"
                    style={{ color: coral }}
                  >
                    <Ban size={14} /> Bloquer
                  </button>
                </div>
              )}
            </div>
          )}
          <button onClick={closeStoryViewer} aria-label="Fermer" className="h-9 w-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center shrink-0 focus-visible:outline focus-visible:outline-2">
            <X size={18} color="#fff" />
          </button>
        </div>

        {/* Zones tactiles gauche/droite pour naviguer (desktop/souris — le
            swipe tactile ci-dessus couvre mobile) */}
        <button onClick={prevStory} className="absolute left-0 top-0 bottom-0 w-1/3 z-[5] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2" aria-label="Précédent" />
        <button onClick={nextStory} className="absolute right-0 top-0 bottom-0 w-1/3 z-[5] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2" aria-label="Suivant" />

        {story.media_url && (
          story.media_kind === "video" ? (
            videoError ? (
              <div className="absolute inset-0 flex items-center justify-center px-10 text-center z-[1]">
                <p className="text-white/80 text-sm leading-relaxed">
                  Cette vidéo ne peut pas être lue sur cet appareil ou ce navigateur.
                  {story.own && " Republie-la si possible en format MP4."}
                </p>
              </div>
            ) : (
              <video
                src={story.media_url}
                autoPlay
                muted={muted}
                loop
                playsInline
                onLoadedMetadata={handleVideoMeta}
                onError={() => setVideoError(true)}
                className="absolute inset-0 w-full h-full object-cover z-[1]"
              />
            )
          ) : (
            <img src={story.media_url} alt="" className="absolute inset-0 w-full h-full object-cover z-[1]" />
          )
        )}

        <div
          className={`absolute inset-0 flex px-10 text-center z-[2] ${story.media_url ? "items-end pb-24" : "items-center"}`}
          style={story.media_url ? { background: "linear-gradient(180deg,transparent 45%,rgba(0,0,0,.6))" } : undefined}
        >
          {story.text ? (
            <p className="text-white text-xl font-bold leading-snug">{story.text}</p>
          ) : !story.media_url ? (
            <div className="text-white/70 text-sm">Moment partagé par {story.name}</div>
          ) : null}
        </div>

        {!story.own && !storyViewersOpen && (
          <div className="absolute bottom-[76px] left-0 right-0 flex items-center justify-center gap-2 z-10">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => sendStoryReaction(emoji)}
                aria-pressed={myStoryReaction === emoji}
                className="h-10 w-10 rounded-full flex items-center justify-center text-lg transition-transform focus-visible:outline focus-visible:outline-2"
                style={{ background: myStoryReaction === emoji ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.12)", transform: myStoryReaction === emoji ? "scale(1.15)" : "scale(1)" }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-2 z-10" style={{ background: "linear-gradient(180deg,transparent,rgba(0,0,0,.35))" }}>
          {story.own ? (
            confirmDelete ? (
              <div className="flex-1 flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2" style={{ background: "rgba(255,255,255,.15)" }}>
                  Annuler
                </button>
                <button onClick={deleteOwnStory} className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2" style={{ background: "rgba(229,107,93,.95)" }}>
                  Confirmer la suppression
                </button>
              </div>
            ) : (
              <>
                <button onClick={openStoryViewers} className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white flex items-center justify-center gap-1.5 focus-visible:outline focus-visible:outline-2" style={{ background: "rgba(255,255,255,.15)" }}>
                  <Eye size={15} /> {storyViewCount || 0} vue{storyViewCount > 1 ? "s" : ""}
                </button>
                <button onClick={() => setConfirmDelete(true)} aria-label="Supprimer le statut" className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: "rgba(229,107,93,.85)" }}>
                  <Trash2 size={16} color="#fff" />
                </button>
              </>
            )
          ) : (
            <>
              <input
                value={storyReply}
                onChange={(e) => setStoryReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendStoryReply()}
                placeholder={`Répondre à ${story.name}...`}
                // maxLength=4000 : contrairement au brouillon de conversation
                // (ConversationPane) ou au composeur de publication, ce champ
                // n'avait AUCUNE limite — une réponse à un statut passe pourtant
                // par sendMessageTo() -> insertMessageRow() -> table "messages",
                // qui impose char_length(text) <= 4000 (supabase-scale-security-2.sql).
                // Résultat : un texte trop long échouait à l'envoi (bulle "failed")
                // après la fermeture du visualiseur de statut, sans qu'aucune limite
                // n'ait prévenu l'utilisateur pendant la saisie.
                maxLength={4000}
                className="flex-1 rounded-full px-4 py-2.5 text-sm text-white bg-white/15 backdrop-blur border border-white/25 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)] placeholder-white/60"
              />
              <button onClick={sendStoryReply} aria-label="Envoyer la réponse" className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 focus-visible:outline focus-visible:outline-2" style={{ background: "#fff" }}>
                <Send size={16} color={navy} />
              </button>
            </>
          )}
        </div>

        {/* Panneau "Personnes ayant vu ton statut" */}
        {storyViewersOpen && (
          <div className="absolute inset-x-0 bottom-0 z-20 rounded-t-[24px] max-h-[70%] flex flex-col" style={{ background: "var(--bb-surface)" }}>
            <div className="flex items-center justify-between p-4 pb-2 shrink-0">
              <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--bb-text)" }}>
                <Eye size={15} /> {storyViewCount || 0} vue{storyViewCount > 1 ? "s" : ""}
              </div>
              <button onClick={closeStoryViewers} aria-label="Fermer" className="focus-visible:outline focus-visible:outline-2" style={{ color: "var(--bb-text)" }}><X size={18} /></button>
            </div>
            <div className="overflow-y-auto px-4 pb-4">
              {storyViewersLoading ? (
                <p className="text-sm text-center py-6" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>Chargement...</p>
              ) : storyViewers.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>Personne n'a encore vu ce statut.</p>
              ) : (
                storyViewers.map((v) => (
                  <button key={v.profile_id} onClick={() => { closeStoryViewers(); closeStoryViewer(); onOpenProfile?.(v.profile_id); }} className="w-full flex items-center gap-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2">
                    <Avatar name={v.name} url={v.avatar_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate flex items-center gap-1.5" style={{ color: "var(--bb-text)" }}>
                        <span className="truncate">{v.name}</span>
                        {/* Parité de badges (bug corrigé à l'audit, même famille
                            que PublicProfileModal/AdmirersModal) : champs
                            désormais chargés dans loadStoryViewers() (SocialShell.jsx). */}
                        <StatusBadge isFounder={v.is_founder} isPremium={v.is_premium} emailVerified={v.email_verified} phoneVerified={v.phone_verified} size={12} />
                      </div>
                      <div className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>{timeAgo(v.viewed_at)}</div>
                    </div>
                    {v.reaction && <span className="text-lg shrink-0">{v.reaction}</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
