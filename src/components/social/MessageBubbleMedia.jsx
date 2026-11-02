import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, FileText, Download, ImageOff } from "lucide-react";
import { useSignedMediaUrl } from "../../hooks/useSignedMediaUrl";
import { getSignedUrl } from "../../lib/signedUrlCache";
import { notifyAudioPlaying, notifyAudioStopped } from "../../lib/audioPlaybackRegistry";
import { formatFileSize } from "../../lib/mediaConstants";
import { STICKER_GRADIENTS } from "../../lib/stickerData";
import { formatEventWhen } from "../../utils/format";
import { useImageLightbox } from "../../lib/ImageLightboxContext";
import { photoDisplaySize } from "../../lib/photoLayout";
import { normalizeWaveform, pseudoWaveform, normalizeDuration } from "../../lib/voiceWaveform";
import { primary, bg, body, gold, primaryRgb } from "./theme";

function useLocalOrSignedUrl(m) {
  const localUrl = useMemo(() => (m._file ? URL.createObjectURL(m._file) : null), [m._file]);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  const { url: signedUrl, refresh } = useSignedMediaUrl(m.media_path, { skip: Boolean(m._file) });
  // refresh() : redemande une URL signée neuve si le média échoue à charger
  // (URL expirée) ; false = déjà tenté / aperçu local → l'appelant affiche son repli.
  return { url: localUrl || signedUrl, refresh: refresh || (() => false) };
}

function UploadProgress({ progress }) {
  if (progress == null) return null;
  return (
    <div className="absolute inset-x-2 bottom-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,.35)", height: 5 }}>
      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#fff", transition: "width .2s ease" }} />
    </div>
  );
}

const PLAYBACK_RATES = [1, 1.5, 2];

// Lecteur de message vocal : bouton lecture/pause, forme d'onde cliquable (la
// progression colore les barres déjà écoutées), durée, vitesse 1×/1,5×/2×.
// - La forme d'onde vient de media_meta.waveform (calculée à l'enregistrement,
//   voir lib/voiceWaveform.js) ; sans elle (anciens vocaux) on dessine une forme
//   neutre stable : on ne décode jamais l'audio pour la dessiner.
// - media_meta.duration affiche la durée AVANT le chargement des métadonnées
//   (et même quand le navigateur n'en trouve pas : webm/opus de Chrome).
function AudioPlayer({ src, meta, seed, onSourceError }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const metaDuration = normalizeDuration(meta?.duration) || 0;
  const [duration, setDuration] = useState(metaDuration);
  const [rate, setRate] = useState(1);
  // Un message vocal enregistré en webm/opus (avant le correctif de format
  // côté enregistrement) reste illisible sur Safari, qui ne décode pas ce
  // format — sans ceci, cliquer "Écouter" ne faisait simplement rien, sans
  // aucune indication de ce qui se passe.
  const [playbackError, setPlaybackError] = useState(false);
  const bars = useMemo(() => normalizeWaveform(meta?.waveform) || pseudoWaveform(seed), [meta?.waveform, seed]);

  // Un seul message vocal doit jouer à la fois dans toute l'app (comme
  // WhatsApp) — bug corrigé à l'audit : sans ce nettoyage, un message vocal
  // qui se démonte (la liste défile, la conversation se ferme) PENDANT sa
  // lecture laissait le registre pointer sur un élément <audio> fantôme,
  // qu'un futur play() mettrait en pause pour rien (inoffensif mais sale).
  useEffect(() => () => notifyAudioStopped(audioRef.current), []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else {
      audioRef.current.playbackRate = rate;
      audioRef.current.play().catch(() => setPlaybackError(true));
    }
  };

  const cycleRate = () => {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekTo = (seconds) => {
    if (!audioRef.current || !duration) return;
    const t = Math.min(duration, Math.max(0, seconds));
    audioRef.current.currentTime = t;
    setCurrent(t);
  };

  const seekFromPointer = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seekTo(ratio * duration);
  };

  const onSliderKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); seekTo(current + 5); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); seekTo(current - 5); }
    else if (e.key === "Home") { e.preventDefault(); seekTo(0); }
    else if (e.key === "End") { e.preventDefault(); seekTo(duration); }
  };

  // Garde-fou : un blob webm produit par MediaRecorder (voir AudioRecorder.jsx,
  // format de repli quand "audio/mp4" n'est pas supporté par le navigateur qui
  // a enregistré) ne contient aucune durée dans son conteneur — sans le
  // contournement ci-dessous, duration valait Infinity et ce calcul affichait
  // littéralement "Infinity:NaN" au lieu du minuteur.
  const fmt = (s) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  // Bug Chromium connu : la durée d'un blob webm/opus issu de MediaRecorder
  // reste Infinity au chargement des métadonnées (aucune durée écrite dans le
  // conteneur pendant l'enregistrement). Contournement standard : se
  // positionner très loin force le navigateur à recalculer la vraie durée
  // (déclenche "durationchange"), puis on revient au début. Si
  // media_meta.duration est connue on s'épargne ce saut.
  const handleLoadedMetadata = (e) => {
    const el = e.currentTarget;
    if (!Number.isFinite(el.duration)) {
      if (metaDuration) return;
      const onDurationChange = () => {
        el.removeEventListener("durationchange", onDurationChange);
        setDuration(Number.isFinite(el.duration) ? el.duration : 0);
        el.currentTime = 0;
      };
      el.addEventListener("durationchange", onDurationChange);
      el.currentTime = 1e101;
    } else {
      setDuration(el.duration || metaDuration || 0);
    }
  };

  const progress = duration ? Math.min(1, current / duration) : 0;
  const playedBars = Math.round(progress * bars.length);

  return (
    <div className="flex items-center gap-2.5" style={{ minWidth: 0, width: 230, maxWidth: "100%" }}>
      <audio
        ref={audioRef}
        src={src || undefined}
        preload="metadata"
        onPlay={() => { setPlaying(true); notifyAudioPlaying(audioRef.current); }}
        onPause={() => { setPlaying(false); notifyAudioStopped(audioRef.current); }}
        onEnded={() => { setPlaying(false); setCurrent(0); notifyAudioStopped(audioRef.current); }}
        onError={() => {
          // Une URL signée expirée se manifeste aussi par une erreur de
          // chargement : on en redemande une avant de conclure que ce
          // message vocal est illisible sur l'appareil.
          if (onSourceError?.(() => setPlaybackError(true))) return;
          setPlaybackError(true);
        }}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        className="hidden"
      />
      {playbackError ? (
        <span className="text-xs flex-1" style={{ opacity: 0.85 }}>Ce message vocal ne peut pas être lu sur cet appareil.</span>
      ) : (
        <>
          <button type="button" onClick={toggle} disabled={!src} aria-label={playing ? "Pause" : "Écouter"} className="bb-hit h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50" style={{ background: "rgba(255,255,255,.18)" }}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <div className="flex-1 min-w-0">
            <div
              role="slider"
              tabIndex={0}
              aria-label="Progression audio"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(current)}
              aria-valuetext={`${fmt(current)} sur ${fmt(duration)}`}
              onClick={seekFromPointer}
              onKeyDown={onSliderKey}
              className="flex items-center cursor-pointer focus-visible:outline focus-visible:outline-2 rounded"
              style={{ gap: 1, height: 28, touchAction: "pan-y" }}
              dir="ltr"
            >
              {bars.map((h, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="flex-1 rounded-full"
                  style={{ height: `${Math.max(12, h)}%`, minWidth: 1, background: "currentColor", opacity: i < playedBars ? 1 : 0.38, transition: "opacity .12s linear" }}
                />
              ))}
            </div>
            <div className="text-[10px] leading-none mt-0.5 flex items-center justify-between gap-2" style={{ opacity: 0.85 }}>
              <span>
                {playing || current > 0 ? fmt(current) : fmt(duration)}
                {duration > 0 && (playing || current > 0) ? ` / ${fmt(duration)}` : ""}
              </span>
              <button
                type="button"
                onClick={cycleRate}
                aria-label={`Vitesse de lecture ${rate} fois, changer`}
                className="bb-hit font-bold rounded-full px-1.5"
                style={{ background: "rgba(127,127,127,.28)", lineHeight: "16px" }}
              >
                {rate === 1 ? "1×" : rate === 1.5 ? "1,5×" : "2×"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function MessageBubbleMedia({ m, isMine, onOpenImage }) {
  const { openLightbox } = useImageLightbox();
  const [fileUrl, setFileUrl] = useState(null);
  const [resolvingFile, setResolvingFile] = useState(false);
  const { url, refresh } = useLocalOrSignedUrl(m);
  const [mediaBroken, setMediaBroken] = useState(false);
  // Nouveau chemin/URL -> on retente l'affichage.
  useEffect(() => { setMediaBroken(false); }, [m.media_path]);
  const handleMediaError = () => { if (!refresh(() => setMediaBroken(true))) setMediaBroken(true); };
  const uploading = m._status === "uploading";
  const progress = uploading ? m._progress ?? 0 : null;

  // Révocation différée au démontage seulement (pas juste après l'ouverture) :
  // window.open() charge le blob de façon synchrone depuis la mémoire, donc
  // l'onglet a toujours fini de le charger bien avant un démontage React.
  // Sans ceci, le blob créé pour un fichier local (m._file) n'était jamais
  // libéré, fuite mémoire pour la durée de vie de l'onglet. revokeObjectURL
  // sur une URL signée https:// (cas getSignedUrl) ne fait rien, sans risque.
  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const openFile = async () => {
    if (fileUrl) { window.open(fileUrl, "_blank", "noopener"); return; }
    setResolvingFile(true);
    const signed = m._file ? URL.createObjectURL(m._file) : await getSignedUrl(m.media_path);
    setResolvingFile(false);
    if (signed) { setFileUrl(signed); window.open(signed, "_blank", "noopener"); }
  };

  if (m.kind === "sticker") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-1 p-4 rounded-2xl"
        style={{ background: STICKER_GRADIENTS[m.media_meta?.gradient] || STICKER_GRADIENTS.coral, minWidth: 110 }}
      >
        <span style={{ fontSize: 40, lineHeight: 1 }}>{m.media_meta?.emoji}</span>
        {m.media_meta?.caption && <span className="text-xs font-bold text-white text-center">{m.media_meta.caption}</span>}
      </div>
    );
  }

  if (m.kind === "event") {
    const meta = m.media_meta || {};
    return (
      <div className="rounded-2xl overflow-hidden" style={{ maxWidth: 230, background: isMine ? "rgba(255,255,255,.14)" : "#fff", border: isMine ? "none" : `1px solid rgba(${primaryRgb},.08)` }}>
        {/* Dégradé de repli décoratif or→vert feuille, identique aux autres
            couvertures d'événement/communauté (EventCard, CommunityGroupCard,
            CommunityDetailView…) — garder synchronisé si l'un change. */}
        <div className="h-20 relative" style={{ background: meta.cover_url ? `url(${meta.cover_url}) center/cover` : `linear-gradient(150deg,${gold},var(--bb-leaf))` }} />
        <div className="p-3">
          <div className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ opacity: 0.75 }}>🎉 Événement Baobab</div>
          <div className="text-sm font-bold truncate">{meta.title || "Événement"}</div>
          <div className="text-[11px] mt-0.5" style={{ opacity: 0.75 }}>
            {meta.event_date ? formatEventWhen(meta.event_date, meta.timezone) : ""}{meta.city ? ` · ${meta.city}` : ""}
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "image") {
    // Boîte au rapport largeur/hauteur réel (portrait, paysage, carré) : la
    // photo n'est plus rognée et le fil ne « saute » pas au chargement. Sans
    // dimensions connues (anciens messages), repli sur la taille naturelle.
    const box = photoDisplaySize(m.media_meta?.width, m.media_meta?.height);
    const open = () => {
      if (uploading) return;
      if (onOpenImage) onOpenImage(m, url);
      else openLightbox([{ url, alt: m.media_meta?.original_name }]);
    };
    return (
      <div
        className="relative rounded-xl overflow-hidden"
        style={box ? { width: box.width, maxWidth: "100%", aspectRatio: `${box.width} / ${box.height}` } : { maxWidth: 240 }}
      >
        {mediaBroken ? (
          <div role="img" aria-label="Photo indisponible" className="flex flex-col items-center justify-center gap-1 text-[11px]" style={{ width: box ? "100%" : 200, height: box ? "100%" : 120, background: bg, color: body }}>
            <ImageOff size={20} aria-hidden="true" />
            <span>Photo indisponible</span>
          </div>
        ) : url ? (
          <img
            src={url}
            alt={m.media_meta?.original_name || "Photo"}
            onClick={open}
            onKeyDown={(e) => { if (!uploading && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
            tabIndex={uploading ? undefined : 0}
            role={uploading ? undefined : "button"}
            aria-label="Agrandir la photo"
            className={`block w-full cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2${box ? " h-full object-cover" : ""}`}
            style={box ? undefined : { maxHeight: 320, objectFit: "contain" }}
            loading="lazy"
            decoding="async"
            onError={handleMediaError}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ width: box ? "100%" : 200, height: box ? "100%" : 150, background: bg }} />
        )}
        <UploadProgress progress={progress} />
      </div>
    );
  }

  if (m.kind === "video") {
    return (
      <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: 260 }}>
        {mediaBroken ? (
          <div role="img" aria-label="Vidéo indisponible" className="flex flex-col items-center justify-center gap-1 text-[11px]" style={{ width: 220, height: 120, background: bg, color: body }}>
            <ImageOff size={20} aria-hidden="true" />
            <span>Vidéo indisponible</span>
          </div>
        ) : url && <video src={url} controls playsInline preload="metadata" onError={handleMediaError} className="block w-full rounded-xl" style={{ maxHeight: 280 }} />}
        <UploadProgress progress={progress} />
      </div>
    );
  }

  if (m.kind === "audio") {
    return (
      <div className="relative" style={{ color: isMine ? bg : body }}>
        <AudioPlayer src={url} meta={m.media_meta} seed={m.id} onSourceError={(giveUp) => refresh(giveUp)} />
        <UploadProgress progress={progress} />
      </div>
    );
  }

  // file
  return (
    <div className="relative flex items-center gap-2.5 min-w-[200px]">
      <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: isMine ? "rgba(255,255,255,.15)" : `rgba(${primaryRgb},.08)` }}>
        <FileText size={18} color={isMine ? "#fff" : primary} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{m.media_meta?.original_name || "Fichier"}</div>
        <div className="text-[11px]" style={{ opacity: 0.75 }}>{formatFileSize(m.media_meta?.size)}</div>
      </div>
      {!uploading && (
        <button type="button" onClick={openFile} disabled={resolvingFile} aria-label="Ouvrir le fichier" className="bb-hit h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50" style={{ background: isMine ? "rgba(255,255,255,.18)" : `rgba(${primaryRgb},.08)` }}>
          <Download size={14} color={isMine ? "#fff" : primary} />
        </button>
      )}
      <UploadProgress progress={progress} />
    </div>
  );
}
