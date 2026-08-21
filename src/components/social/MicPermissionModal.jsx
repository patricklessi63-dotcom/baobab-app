import React, { useState } from "react";
import { Mic, MicOff, Copy, Check } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, muted, bg, card, body, primaryRgb, navy } from "./theme";

// Détecte le navigateur pour adapter les 4 lignes d'aide "Comment
// autoriser" — jamais de faux bouton qui prétendrait ouvrir les réglages
// internes du navigateur automatiquement (impossible depuis une page web).
function detectPermissionGuide() {
  if (typeof navigator === "undefined") return "generic";
  const ua = navigator.userAgent || "";
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome\//i.test(ua) && !/Edg\/|OPR\/|SamsungBrowser/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|Chrome/i.test(ua);
  if (isAndroid && isChrome) return "android-chrome";
  if (isIOS && isSafari) return "ios-safari";
  return "generic";
}

const GUIDE = detectPermissionGuide();
// chrome://settings n'est pas navigable depuis une page web (bloqué par
// Chrome) — on ne peut que le proposer en copier-coller, pas l'ouvrir.
const CHROME_SETTINGS_URL =
  typeof window !== "undefined"
    ? `chrome://settings/content/siteDetails?site=${encodeURIComponent(window.location.origin)}`
    : "";

const GENERIC_STEPS = [
  "Touche l'icône à côté de l'adresse du site, en haut de l'écran",
  "Ouvre \"Autorisations\" (ou \"Permissions du site\")",
  "Choisis \"Autoriser\" pour Microphone",
  "Reviens ici et touche \"Réessayer\"",
];

const IOS_STEPS = [
  "Touche \"aA\" à gauche de la barre d'adresse",
  "Touche \"Réglages du site web\"",
  "Choisis \"Autoriser\" pour Microphone",
  "Reviens ici et touche \"Réessayer\"",
];

function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

// Popup légère d'accès micro, en deux phases très courtes :
// - "ask"     : proposée avant le premier appel réel à getUserMedia()
// - "blocked" : le navigateur a déjà refusé — aide repliée par défaut
//               ("Comment autoriser"), jamais affichée d'emblée.
export default function MicPermissionModal({ open, phase, requesting, onAllow, onDismiss }) {
  useEscapeKey(open, onDismiss);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;
  const blocked = phase === "blocked";

  const handleCopy = async () => {
    try {
      await copyToClipboard(CHROME_SETTINGS_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // le presse-papiers a refusé — l'utilisateur peut suivre les étapes générales à la place
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-5"
      style={{ background: `rgba(${primaryRgb},.5)`, backdropFilter: "blur(4px)" }}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-label="Accès au microphone"
    >
      <div className={`${card} p-5 max-w-[300px] w-full text-center`} onClick={(e) => e.stopPropagation()}>
        <div className="h-12 w-12 rounded-full mx-auto flex items-center justify-center" style={{ background: "#FFF3F1" }}>
          {blocked ? <MicOff size={20} color={coral} /> : <Mic size={20} color={coral} />}
        </div>

        {!blocked ? (
          <>
            <h2 className="text-base font-black mt-3" style={{ color: primary }}>Autoriser les messages vocaux ?</h2>
            <p className="text-xs mt-1.5" style={{ color: muted }}>
              Baobab a besoin de ton microphone pour enregistrer et envoyer des messages vocaux.
            </p>
            <button
              onClick={onAllow}
              disabled={requesting}
              className="w-full mt-4 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-60"
              style={{ background: coral }}
            >
              {requesting ? "Demande en cours..." : "Autoriser le microphone"}
            </button>
            <button onClick={onDismiss} className="w-full mt-1.5 py-2.5 rounded-full text-sm font-semibold" style={{ color: muted }}>
              Plus tard
            </button>
          </>
        ) : (
          <>
            <h2 className="text-base font-black mt-3" style={{ color: primary }}>Microphone bloqué</h2>
            <p className="text-xs mt-1.5" style={{ color: muted }}>
              Le microphone est actuellement bloqué pour Baobab.
            </p>
            <button
              onClick={onAllow}
              disabled={requesting}
              className="w-full mt-4 py-2.5 rounded-full text-sm font-bold text-white disabled:opacity-60"
              style={{ background: coral }}
            >
              {requesting ? "Vérification..." : "Réessayer"}
            </button>

            {!showHelp ? (
              <button onClick={() => setShowHelp(true)} className="w-full mt-1.5 py-2 rounded-full text-xs font-bold" style={{ color: coral }}>
                Comment autoriser ?
              </button>
            ) : (
              <div className="text-left mt-3 rounded-2xl p-3.5 flex flex-col gap-2" style={{ background: bg, color: body }}>
                {GUIDE === "android-chrome" && (
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="w-full mb-1 py-2 rounded-full text-xs font-bold flex items-center justify-center gap-1.5"
                    style={{ background: "#fff", color: navy, border: "1px solid #E4E6EF" }}
                  >
                    {copied ? <Check size={13} color={coral} /> : <Copy size={13} />}
                    {copied ? "Lien copié !" : "Copier le lien des réglages"}
                  </button>
                )}
                {(GUIDE === "android-chrome"
                  ? [
                      "Colle ce lien dans un nouvel onglet Chrome et appuie sur Entrée",
                      "Choisis \"Autoriser\" pour Microphone",
                      "Reviens ici et touche \"Réessayer\"",
                    ]
                  : GUIDE === "ios-safari"
                  ? IOS_STEPS
                  : GENERIC_STEPS
                ).map((step, i) => (
                  <div key={i} className="flex gap-1.5 text-xs">
                    <span className="font-black flex-shrink-0" style={{ color: coral }}>{i + 1}.</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={onDismiss} className="w-full mt-1.5 py-2 rounded-full text-xs font-semibold" style={{ color: muted }}>
              Fermer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
