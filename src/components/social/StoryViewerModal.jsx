import React from "react";
import { X, Send } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { navy } from "./theme";

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
}) {
  useEscapeKey(storyViewerIndex !== null, closeStoryViewer);
  if (storyViewerIndex === null || !stories[storyViewerIndex]) return null;
  return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center" role="dialog" aria-modal="true" aria-label={`Statut de ${stories[storyViewerIndex].name}`} style={{ background: "#000" }}>
          <style>{`
            @keyframes bbStoryBar { from { width: 0%; } to { width: 100%; } }
            .bb-story-bar-fill { animation: bbStoryBar 5s linear forwards; }
          `}</style>
          <div className="relative w-full h-full max-w-md mx-auto" style={{ background: `linear-gradient(160deg,${stories[storyViewerIndex].color},${navy})` }}>
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
              <div className="h-9 w-9 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white font-black border border-white/30">
                {stories[storyViewerIndex].initial}
              </div>
              <div className="text-white text-sm font-bold flex-1">{stories[storyViewerIndex].name}</div>
              <button onClick={closeStoryViewer} aria-label="Fermer" className="h-9 w-9 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
                <X size={18} color="#fff" />
              </button>
            </div>

            {/* Zones tactiles gauche/droite pour naviguer */}
            <button onClick={prevStory} className="absolute left-0 top-0 bottom-0 w-1/3 z-[5]" aria-label="Précédent" />
            <button onClick={nextStory} className="absolute right-0 top-0 bottom-0 w-1/3 z-[5]" aria-label="Suivant" />

            {stories[storyViewerIndex].media_url && (
              stories[storyViewerIndex].media_kind === "video" ? (
                <video src={stories[storyViewerIndex].media_url} autoPlay muted loop playsInline className="absolute inset-0 w-full h-full object-cover z-[1]" />
              ) : (
                <img src={stories[storyViewerIndex].media_url} alt="" className="absolute inset-0 w-full h-full object-cover z-[1]" />
              )
            )}

            <div
              className={`absolute inset-0 flex px-10 text-center z-[2] ${stories[storyViewerIndex].media_url ? "items-end pb-24" : "items-center"}`}
              style={stories[storyViewerIndex].media_url ? { background: "linear-gradient(180deg,transparent 45%,rgba(0,0,0,.6))" } : undefined}
            >
              {stories[storyViewerIndex].text ? (
                <p className="text-white text-xl font-bold leading-snug">{stories[storyViewerIndex].text}</p>
              ) : !stories[storyViewerIndex].media_url ? (
                <div className="text-white/70 text-sm">Moment partagé par {stories[storyViewerIndex].name}</div>
              ) : null}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 flex gap-2 z-10" style={{ background: "linear-gradient(180deg,transparent,rgba(0,0,0,.35))" }}>
              {stories[storyViewerIndex].own ? (
                <button onClick={deleteOwnStory} className="flex-1 rounded-full px-4 py-2.5 text-sm font-bold text-white" style={{ background: "rgba(229,107,93,.85)" }}>
                  Supprimer le statut
                </button>
              ) : (
                <>
                  <input
                    value={storyReply}
                    onChange={(e) => setStoryReply(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendStoryReply()}
                    placeholder={`Répondre à ${stories[storyViewerIndex].name}...`}
                    className="flex-1 rounded-full px-4 py-2.5 text-sm text-white bg-white/15 backdrop-blur border border-white/25 outline-none placeholder-white/60"
                  />
                  <button onClick={sendStoryReply} aria-label="Envoyer la réponse" className="h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#fff" }}>
                    <Send size={16} color={primary} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
  );
}
