import React, { useEffect, useRef, useState } from "react";
import { Mic, Send, Square, Trash2, Play, Pause } from "lucide-react";
import { AUDIO_MAX_DURATION_MS } from "../../lib/mediaConstants";
import MicPermissionModal from "./MicPermissionModal";
import { primary, navy, coral, muted, bg } from "./theme";

function pickMimeType() {
  // "audio/mp4" (AAC) en premier : c'est le seul format que Safari (macOS
  // ET iOS) sait LIRE — un message vocal enregistré en webm/opus (format
  // que Safari ne sait pas décoder du tout, à l'enregistrement comme à la
  // lecture) arrivait chez un destinataire iPhone sans aucun son, sans
  // aucune erreur visible ("le message arrive mais ne se lit pas"). Chrome/
  // Android/Firefox savent tous lire l'AAC/mp4, donc ce choix maximise la
  // compatibilité de lecture pour tout le monde, pas seulement l'expéditeur.
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"];
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
// Vérifie l'état de permission via l'API Permissions (best-effort — non
// supportée sur Safari/iOS, jamais la source de vérité : getUserMedia()
// reste le seul appel qui compte réellement).
async function queryMicPermission() {
  if (!navigator.permissions?.query) return "prompt";
  try {
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state; // "granted" | "denied" | "prompt"
  } catch {
    return "prompt";
  }
}

export default function AudioRecorder({ hasDraft, onSendText, onSendAudio, onActiveChange }) {
  const [state, setState] = useState("idle"); // idle | recording | preview | error
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [playing, setPlaying] = useState(false);

  // Popup d'accès micro — voir MicPermissionModal.jsx. "ask" = petite
  // confirmation avant le premier essai, "blocked" = le navigateur a déjà
  // refusé (aide repliée par défaut).
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [permissionPhase, setPermissionPhase] = useState("ask");
  const [permissionRequesting, setPermissionRequesting] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startRef = useRef(0);
  const timerRef = useRef(null);
  const errorTimerRef = useRef(null);
  const blobRef = useRef(null);
  const audioElRef = useRef(null);
  const audioUrlRef = useRef(null);
  // Verrou synchrone (pas un state React, dispo immédiatement sans attendre
  // un re-rendu) contre un double appel concurrent à requestMic() — un
  // double-tap rapide sur le bouton micro alors que la permission est déjà
  // accordée déclenchait deux getUserMedia()/beginRecording() en parallèle.
  // streamRef/recorderRef/timerRef/chunksRef n'étant PAS ré-initialisés par
  // enregistrement (une seule instance de ref partagée), le second appel
  // écrasait les références du premier : le flux micro du premier
  // enregistrement restait ouvert indéfiniment (jamais stoppé), et comme le
  // handler ondataavailable du premier MediaRecorder capture chunksRef (pas
  // le tableau qu'il contenait), ses données continuaient d'être poussées
  // dans le tableau du SECOND enregistrement — audio corrompu (mélange des
  // deux flux), puis le onstop tardif du premier finissait par couper le
  // flux du second en cours d'enregistrement.
  const micBusyRef = useRef(false);

  useEffect(() => {
    onActiveChange?.(state === "recording" || state === "preview" || permissionOpen);
  }, [state, permissionOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => {
    streamRef.current?.getTracks()?.forEach((t) => t.stop());
    streamRef.current = null;
  };

  const cleanup = () => {
    clearInterval(timerRef.current);
    if (errorTimerRef.current) { clearTimeout(errorTimerRef.current); errorTimerRef.current = null; }
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

  const showInlineError = (msg) => {
    setPermissionOpen(false);
    setErrorMsg(msg);
    setState("error");
    // Annule tout minuteur d'un message d'erreur précédent : sans ça, chaque
    // appel posait son propre setTimeout indépendant (même défaut que
    // successNotice dans App.jsx). Deux erreurs rapprochées coupaient la
    // seconde en avance ; pire, si l'utilisateur relançait avec succès un
    // enregistrement entre-temps, le minuteur obsolète forçait l'état à
    // repasser à "idle" alors qu'un enregistrement était en cours. La mise à
    // jour fonctionnelle ci-dessous ignore le reset si l'état a déjà changé.
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => {
      setState((s) => (s === "error" ? "idle" : s));
      errorTimerRef.current = null;
    }, 6000);
  };

  // C'est CET appel, dans un gestionnaire de clic (jamais au chargement de
  // la page), qui déclenche la vraie demande native du navigateur si elle
  // n'a jamais été posée. Si le micro a déjà été refusé, aucun bouton d'un
  // site web ne peut forcer cette popup native à réapparaître (règle de
  // sécurité du navigateur) — on bascule alors vers la vue "bloqué".
  const requestMic = async () => {
    if (micBusyRef.current) return;
    micBusyRef.current = true;
    setPermissionRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setPermissionOpen(false);
      beginRecording(stream);
    } catch (e) {
      switch (e?.name) {
        case "NotAllowedError":
        case "SecurityError":
          setPermissionPhase("blocked");
          setPermissionOpen(true);
          break;
        case "NotFoundError":
          showInlineError("Aucun microphone n'a été détecté.");
          break;
        case "NotReadableError":
          showInlineError("Le microphone est utilisé ou inaccessible.");
          break;
        default:
          showInlineError("Impossible de démarrer l'enregistrement.");
      }
    } finally {
      setPermissionRequesting(false);
      micBusyRef.current = false;
    }
  };

  // Bouton micro de la barre de saisie. Si la permission est déjà accordée
  // (API Permissions, best-effort), on enregistre directement sans aucune
  // popup. Si elle est déjà refusée, on saute la petite confirmation et on
  // va droit à la vue "bloqué". Sinon, petite confirmation avant le premier
  // vrai appel à getUserMedia().
  const openMicPrompt = async () => {
    // Même verrou que requestMic() : couvre aussi le court instant de
    // queryMicPermission() ci-dessous, avant que micBusyRef ne soit posé
    // par requestMic() lui-même.
    if (micBusyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      showInlineError("Ton navigateur ne prend pas en charge l'enregistrement audio.");
      return;
    }
    const permState = await queryMicPermission();
    if (permState === "granted") {
      requestMic();
      return;
    }
    setPermissionPhase(permState === "denied" ? "blocked" : "ask");
    setPermissionOpen(true);
  };

  const dismissMicPrompt = () => setPermissionOpen(false);

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
      phase={permissionPhase}
      requesting={permissionRequesting}
      onAllow={requestMic}
      onDismiss={dismissMicPrompt}
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
          <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Écouter"} className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: navy }}>
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="text-sm font-bold flex-1" style={{ color: primary }}>{formatDuration(elapsed)}</span>
          <button type="button" onClick={discardPreview} aria-label="Supprimer l'enregistrement" className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ color: muted }}>
            <Trash2 size={16} />
          </button>
          <button type="button" onClick={confirmSend} aria-label="Envoyer le message vocal" className="bb-btn-gold h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0">
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
      className="bb-btn-gold w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
    >
      <Send size={16} />
    </button>
  ) : (
    <>
      <button
        type="button"
        onClick={openMicPrompt}
        disabled={permissionRequesting}
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
