import React, { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, FileText, Download } from "lucide-react";
import { useSignedMediaUrl } from "../../hooks/useSignedMediaUrl";
import { getSignedUrl } from "../../lib/signedUrlCache";
import { formatFileSize } from "../../lib/mediaConstants";
import { STICKER_GRADIENTS } from "../../lib/stickerData";
import { formatEventWhen } from "../../utils/format";
import MediaViewerModal from "./MediaViewerModal";
import { primary, bg, body, primaryRgb } from "./theme";

function useLocalOrSignedUrl(m) {
  const localUrl = useMemo(() => (m._file ? URL.createObjectURL(m._file) : null), [m._file]);
  useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);
  const { url: signedUrl } = useSignedMediaUrl(m.media_path, { skip: Boolean(m._file) });
  return localUrl || signedUrl;
}

function UploadProgress({ progress }) {
  if (progress == null) return null;
  return (
    <div className="absolute inset-x-2 bottom-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,.35)", height: 5 }}>
      <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "#fff", transition: "width .2s ease" }} />
    </div>
  );
}

function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  };

  const seek = (e) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Number(e.target.value);
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2.5 min-w-[200px]">
      <audio
        ref={audioRef}
        src={src || undefined}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime || 0)}
        className="hidden"
      />
      <button type="button" onClick={toggle} disabled={!src} aria-label={playing ? "Pause" : "Écouter"} className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50" style={{ background: "rgba(255,255,255,.18)" }}>
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <input
        type="range"
        min={0}
        max={duration || 0}
        value={current}
        onChange={seek}
        aria-label="Progression audio"
        className="flex-1"
        style={{ accentColor: "#fff" }}
      />
      <span className="text-[10px] flex-shrink-0" style={{ opacity: 0.8 }}>{fmt(duration ? duration - current : 0)}</span>
    </div>
  );
}

export default function MessageBubbleMedia({ m, isMine }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);
  const [resolvingFile, setResolvingFile] = useState(false);
  const url = useLocalOrSignedUrl(m);
  const uploading = m._status === "uploading";
  const progress = uploading ? m._progress ?? 0 : null;

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
        <div className="h-20 relative" style={{ background: meta.cover_url ? `url(${meta.cover_url}) center/cover` : "linear-gradient(150deg,#F2B84B,#E56B5D)" }} />
        <div className="p-3">
          <div className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ opacity: 0.75 }}>🎉 Événement Baobab</div>
          <div className="text-sm font-bold truncate">{meta.title || "Événement"}</div>
          <div className="text-[11px] mt-0.5" style={{ opacity: 0.75 }}>
            {meta.event_date ? formatEventWhen(meta.event_date) : ""}{meta.city ? ` · ${meta.city}` : ""}
          </div>
        </div>
      </div>
    );
  }

  if (m.kind === "image") {
    return (
      <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: 240 }}>
        {url ? (
          <img
            src={url}
            alt={m.media_meta?.original_name || "Photo"}
            onClick={() => !uploading && setViewerOpen(true)}
            className="block w-full object-cover cursor-pointer"
            style={{ maxHeight: 260 }}
            loading="lazy"
          />
        ) : (
          <div className="flex items-center justify-center" style={{ width: 200, height: 150, background: bg }} />
        )}
        <UploadProgress progress={progress} />
        {viewerOpen && <MediaViewerModal url={url} alt={m.media_meta?.original_name} onClose={() => setViewerOpen(false)} />}
      </div>
    );
  }

  if (m.kind === "video") {
    return (
      <div className="relative rounded-xl overflow-hidden" style={{ maxWidth: 260 }}>
        {url && <video src={url} controls preload="metadata" className="block w-full rounded-xl" style={{ maxHeight: 280 }} />}
        <UploadProgress progress={progress} />
      </div>
    );
  }

  if (m.kind === "audio") {
    return (
      <div className="relative" style={{ color: isMine ? bg : body }}>
        <AudioPlayer src={url} />
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
        <button type="button" onClick={openFile} disabled={resolvingFile} aria-label="Ouvrir le fichier" className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50" style={{ background: isMine ? "rgba(255,255,255,.18)" : `rgba(${primaryRgb},.08)` }}>
          <Download size={14} color={isMine ? "#fff" : primary} />
        </button>
      )}
      <UploadProgress progress={progress} />
    </div>
  );
}
