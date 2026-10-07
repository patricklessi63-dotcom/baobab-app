import React, { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { isNative } from "../lib/platform";
import { checkCameraPermission, takePhoto, CAMERA_MESSAGES } from "../lib/nativeCamera";

// Bouton « Prendre une photo » — visible UNIQUEMENT dans l'app native (Capacitor).
// Sur le web il ne rend rien (le sélecteur <input type="file"> existant, qui propose
// déjà l'appareil photo sur mobile, reste le seul chemin : comportement inchangé).
//
// Le fichier obtenu est remis à `onFile(file)` : l'appelant le branche sur son
// gestionnaire EXISTANT (validation + compression + retrait de l'EXIF/GPS, voir
// nativeCamera.js), il ne contourne jamais ce pipeline.
//
// Texte d'explication AU BON MOMENT : si la permission de l'appareil photo n'a pas encore
// été demandée (iOS : état « prompt »), un court paragraphe explique pourquoi AVANT la fenêtre
// système ; refus définitif : message honnête + chemin des réglages (aucune API fiable pour
// ouvrir les réglages directement). Annulation = retour silencieux, pas d'erreur.
// Rend un fragment [bouton, panneau pleine largeur] : à placer dans un conteneur flex-wrap.
export default function NativeCameraButton({ onFile, disabled = false, size = 84, label = "Prendre une photo", variant = "tile" }) {
  const [phase, setPhase] = useState("idle"); // idle | explain | busy | denied | error
  const [message, setMessage] = useState("");
  const busyRef = useRef(false);

  if (!isNative()) return null;

  async function capture() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPhase("busy");
    setMessage("");
    try {
      const result = await takePhoto();
      if (result.ok) {
        setPhase("idle");
        onFile(result.file);
      } else if (result.code === "CANCELLED") {
        setPhase("idle");
      } else if (result.code === "PERMISSION_DENIED") {
        setMessage(result.message || CAMERA_MESSAGES.DENIED());
        setPhase("denied");
      } else {
        setMessage(result.message || CAMERA_MESSAGES.ERROR);
        setPhase("error");
      }
    } finally {
      busyRef.current = false;
    }
  }

  async function start() {
    if (disabled || busyRef.current || phase === "busy") return;
    const permission = await checkCameraPermission();
    if (permission === "denied") {
      setMessage(CAMERA_MESSAGES.DENIED());
      setPhase("denied");
      return;
    }
    if (permission === "prompt") {
      setPhase("explain");
      return;
    }
    await capture();
  }

  const busy = phase === "busy";
  return (
    <>
      {variant === "wide" ? (
        // Même apparence que les boutons « Photo » / « Vidéo » du composeur de statut.
        <button
          type="button"
          onClick={start}
          disabled={disabled || busy}
          className="w-full rounded-xl py-3 font-bold disabled:opacity-50"
          style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)", minHeight: 44 }}
        >
          <Camera size={17} className="inline mr-1" aria-hidden="true" />{busy ? "Ouverture…" : label}
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={disabled || busy}
          aria-label={label}
          className="cursor-pointer flex flex-col items-center justify-center gap-1 transition-colors hover:bg-black/[0.02] disabled:cursor-not-allowed"
          style={{ width: size, height: size, borderRadius: "var(--bb-radius-sm)", border: "1.5px dashed rgba(var(--bb-ink-rgb-static),0.28)", opacity: disabled || busy ? 0.5 : 1, background: "transparent" }}
        >
          <Camera size={18} aria-hidden="true" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }} />
          <span className="text-[11px] text-center px-1 leading-tight" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>{busy ? "Ouverture…" : "Photo"}</span>
        </button>
      )}
      {phase === "explain" && (
        <div role="group" aria-label="Autorisation de l'appareil photo" className="w-full rounded-xl p-3 text-xs" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}>
          <p>{CAMERA_MESSAGES.EXPLAIN}</p>
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={capture} className="bb-btn bb-btn-primary rounded-full px-4 text-xs font-semibold" style={{ minHeight: 44 }}>Continuer</button>
            <button type="button" onClick={() => setPhase("idle")} className="rounded-full px-4 text-xs font-semibold" style={{ minHeight: 44, color: "var(--bb-text)" }}>Pas maintenant</button>
          </div>
        </div>
      )}
      {(phase === "denied" || phase === "error") && (
        <div role="alert" className="w-full rounded-xl p-3 text-xs" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: "var(--bb-text)" }}>
          <p>{message}</p>
          <button type="button" onClick={() => setPhase("idle")} className="mt-2 rounded-full px-4 text-xs font-semibold" style={{ minHeight: 44, color: "var(--bb-text)" }}>Compris</button>
        </div>
      )}
    </>
  );
}
