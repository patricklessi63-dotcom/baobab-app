import React, { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Trash2, Play, Pause } from "lucide-react";
import { AUDIO_MAX_DURATION_MS } from "../../lib/mediaConstants";
import MicPermissionModal from "./MicPermissionModal";
import { primary, coral, muted, bg } from "./theme";

function pickMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(type)) return type;
  }
  return undefined; // laisse le navigateur choisir son défaut
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Occupe le même emplacement que le bouton "Envoyer" dans la barre de
// saisie : bouton micro si le brouillon texte est vide, bouton envoyer
// sinon. Une fois l'enregistrement démarré, prend toute la largeur de la
// barre (le parent masque textarea/emoji/pièce jointe via onActiveChange).
export default function AudioRecorder({ hasDraft, onSendText, onSendAudio, onActiveChange }) {
  const [state, setState] = useState("idle"); // idle | recording | preview | error
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [playing, setPlaying] = useState(false);

  // Popup d'accès micro — voir MicPermissionModal.jsx.
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [permissionRequesting, setPermissionRequesting] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startRef = useRef(0);
  const timerRef = useRef(null);
  const blobRef = useRef(null);
  const audioElRef = useRef(null);
  const audioUrlRef = useRef(null);

  useEffect(() => {
    onActiveChange?.(state === "recording" || state === "preview" || permissionOpen);
  }, [state, permissionOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => {
    streamRef.current?.getTracks()?.forEach((t) => t.stop());
    streamRef.current = null;
  };

  const cleanup = () => {
    clearInterval(timerRef.current);
    stopTracks();
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    blobRef.current = null;
    chunksRef.current = [];
    setPlaying(false);
    setElapsed(0);
  };

  useEffect(() => () => cleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Démarre réellement l'enregistrement une fois le flux micro obtenu.
  const beginRecording = (stream) => {
    streamRef.current = stream;
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      // recorder.mimeType inclut souvent le codec (ex: "audio/webm;codecs=opus"),
      // qui ne correspond exactement à aucune entrée de MEDIA_LIMITS.audio.mimes
      // ni de l'allowlist du bucket Storage — on ne garde que le type de base.
      const baseMime = (recorder.mimeType || "audio/webm").split(";")[0].trim();
      blobRef.current = new Blob(chunksRef.current, { type: baseMime });
      audioUrlRef.current = URL.createObjectURL(blobRef.current);
      stopTracks();
      setState("preview");
    };
    recorderRef.current = recorder;
    recorder.start();
    startRef.current = Date.now();
    setElapsed(0);
    setState("recording");
    timerRef.current = setInterval(() => {
      const ms = Date.now() - startRef.current;
      setElapsed(ms);
      if (ms >= AUDIO_MAX_DURATION_MS) recorder.stop();
    }, 200);
  };

  // Ouvre la popup d'accès au micro (bouton micro de la barre de saisie).
  const openMicPrompt = () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setState("error");
      setErrorMsg("Ton navigateur ne prend pas en charge l'enregistrement audio.");
      setTimeout(() => setState("idle"), 6000);
      return;
    }
    setPermissionBlocked(false);
    setPermissionOpen(true);
  };

  // Bouton "Autoriser l'accès" / "Réessayer" de la popup — c'est CET appel,
  // dans un gestionnaire de clic, qui déclenche la vraie demande native du
  // navigateur ("Autoriser l'accès au micro ?") si elle n'a jamais été
  // posée. Si le micro a déjà été refusé, aucun bouton d'un site web ne
  // peut forcer cette popup native à réapparaître (règle de sécurité du
  // navigateur) — on bascule alors la popup vers les instructions.
  const handleAllow = async () => {
    setPermissionRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionOpen(false);
      beginRecording(stream);
    } catch (e) {
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      if (denied) {
        setPermissionBlocked(true);
      } else {
        setPermissionOpen(false);
        setErrorMsg("Impossible de démarrer l'enregistrement.");
        setState("error");
        setTimeout(() => setState("idle"), 6000);
      }
    } finally {
      setPermissionRequesting(false);
    }
  };

  const closeMicPrompt = () => setPermissionOpen(false);

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const cancelRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    stopTracks();
    cleanup();
    setState("idle");
  };

  const discardPreview = () => {
    cleanup();
    setState("idle");
  };

  const togglePlayback = () => {
    if (!audioElRef.current) return;
    if (playing) audioElRef.current.pause();
    else audioElRef.current.play();
  };

  const confirmSend = () => {
    if (!blobRef.current) return;
    const file = new File([blobRef.current], `voice-${Date.now()}.webm`, { type: blobRef.current.type });
    onSendAudio(file);
    cleanup();
    setState("idle");
  };

  const permissionModal = (
    <MicPermissionModal
      open={permissionOpen}
      blocked={permissionBlocked}
      requesting={permissionRequesting}
      onAllow={handleAllow}
      onClose={closeMicPrompt}
    />
  );

  if (state === "recording") {
    return (
      <>
        <div className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-2" style={{ background: bg }}>
          <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: coral, animation: "bbPulse 1s ease-in-out infinite" }} />
          <style>{`@keyframes bbPulse { 0%,100% { opacity: 1; } 50% { opacity: .3; } }`}</style>
          <span className="text-sm font-bold flex-1" style={{ color: primary }}>{formatDuration(elapsed)}</span>
          <button type="button" onClick={cancelRecording} aria-label="Annuler l'enregistrement" className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: muted }}>
            <Trash2 size={16} />
          </button>
          <button type="button" onClick={stopRecording} aria-label="Arrêter l'enregistrement" className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: coral }}>
            <Square size={14} />
          </button>
        </div>
        {permissionModal}
      </>
    );
  }

  if (state === "preview") {
    return (
      <>
        <div className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-2" style={{ background: bg }}>
          <audio
            ref={audioElRef}
            src={audioUrlRef.current}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
          <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Écouter"} className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: primary }}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="text-sm font-bold flex-1" style={{ color: primary }}>{formatDuration(elapsed)}</span>
          <button type="button" onClick={discardPreview} aria-label="Supprimer l'enregistrement" className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: muted }}>
            <Trash2 size={16} />
          </button>
          <button type="button" onClick={confirmSend} aria-label="Envoyer le message vocal" className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: coral }}>
            <Send size={14} />
          </button>
        </div>
        {permissionModal}
      </>
    );
  }

  if (state === "error") {
    return <p className="text-xs px-2" style={{ color: coral }}>{errorMsg}</p>;
  }

  // idle — occupe le même emplacement que le bouton "Envoyer"
  return hasDraft ? (
    <button
      type="button"
      onClick={onSendText}
      disabled={!hasDraft}
      aria-label="Envoyer le message"
      className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
      style={{ background: coral }}
    >
      <Send size={16} />
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={openMicPrompt}
        aria-label="Message vocal"
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-60 focus-visible:outline focus-visible:outline-2"
        style={{ background: bg, color: primary }}
      >
        <Mic size={18} />
      </button>
      {permissionModal}
    </>
  );
}
