import React, { useEffect, useState } from "react";
import { ArrowLeft, MessageCircle, Sparkles, Heart, UserPlus, Users2, PartyPopper, Megaphone, Bell } from "lucide-react";
import { C } from "../constants";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { isPushSupported, getPushSubscriptionStatus, enablePushNotifications, disablePushNotifications } from "../lib/pushNotifications";

// Catégories du cahier des charges (Messages/Match/Likes/Abonnements/
// Communautés/Événements/Marketing). "Marketing" est préparé dès
// maintenant (interrupteur présent) mais aucune notification de ce type
// n'existe encore dans l'app — noté honnêtement dans le rapport final.
const CATEGORIES = [
  { key: "messages", label: "Messages", icon: MessageCircle },
  { key: "match", label: "Match", icon: Sparkles },
  { key: "likes", label: "Likes", icon: Heart },
  { key: "follows", label: "Abonnements", icon: UserPlus },
  { key: "communities", label: "Communautés", icon: Users2 },
  { key: "events", label: "Événements", icon: PartyPopper },
  { key: "marketing", label: "Marketing", icon: Megaphone },
];

// Filtrage appliqué côté client à l'affichage du panneau de notifications
// (SocialShell.jsx) — pas de suppression à la source dans les triggers
// déjà existants, voir rapport final pour la décision de périmètre.
export default function NotificationPreferencesModal({ open, onClose, onBack, currentUser, onUpdatePreference }) {
  useEscapeKey(open, onClose);
  const [pushStep, setPushStep] = useState("idle"); // idle | consent | requesting | error
  const [pushStatus, setPushStatus] = useState(null);
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (!open || !isPushSupported()) return;
    getPushSubscriptionStatus().then(setPushStatus);
  }, [open]);

  if (!open) return null;
  const prefs = currentUser?.notification_preferences || {};

  async function handleAllowPush() {
    setPushStep("requesting");
    try {
      await enablePushNotifications();
      setPushStatus(await getPushSubscriptionStatus());
      setPushStep("idle");
    } catch (e) {
      setPushError(e.message || "Impossible d'activer les notifications push.");
      setPushStep("error");
    }
  }

  async function handleDisablePush() {
    await disablePushNotifications();
    setPushStatus(await getPushSubscriptionStatus());
  }

  return (
    <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-30 p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Préférences de notifications">
      <div className="bb-card p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {onBack && (
            <button onClick={onBack} aria-label="Retour" style={{ color: C.indigo }}><ArrowLeft size={16} /></button>
          )}
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: C.indigo }}>
            Préférences de notifications
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
          Choisis les catégories de notifications que tu veux recevoir.
        </p>

        {pushStatus?.supported && (
          <div className="mb-4 pb-4" style={{ borderBottom: "1px solid rgba(var(--bb-ink-rgb),0.08)" }}>
            {pushStep === "consent" && (
              <div className="py-1">
                <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>
                  Baobab peut t'envoyer une notification sur cet appareil pour les nouveaux
                  messages et autres activités, même quand l'application est fermée. Tu peux
                  désactiver cela à tout moment.
                </p>
                <div className="flex flex-col gap-2 mt-3">
                  <button onClick={handleAllowPush} className="w-full rounded-xl py-3 font-bold text-white" style={{ background: C.indigo }}>Autoriser</button>
                  <button onClick={() => setPushStep("idle")} className="w-full rounded-xl py-3 font-semibold" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>Pas maintenant</button>
                </div>
              </div>
            )}

            {pushStep === "requesting" && (
              <div className="py-3 text-center">
                <p className="text-sm font-bold" style={{ color: C.indigo }}>Activation…</p>
              </div>
            )}

            {pushStep === "error" && (
              <div className="py-1 text-center">
                <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>{pushError}</p>
                <button onClick={() => setPushStep("idle")} className="mt-2 text-sm font-semibold" style={{ color: C.indigo }}>Compris</button>
              </div>
            )}

            {pushStep === "idle" && (
              <div className="flex items-center justify-between" style={{ minHeight: 44 }}>
                <div className="flex items-center gap-2 text-sm"><Bell size={14} color={C.indigo} /> Notifications push sur cet appareil</div>
                {pushStatus.subscribed ? (
                  <button onClick={handleDisablePush} className="text-xs font-semibold" style={{ color: C.clay }}>Désactiver</button>
                ) : pushStatus.permission === "denied" ? (
                  <span className="text-xs text-right" style={{ color: "rgba(var(--bb-ink-rgb),0.5)", maxWidth: 140 }}>Bloquées (réglages du navigateur)</span>
                ) : (
                  <button onClick={() => setPushStep("consent")} className="text-xs font-semibold" style={{ color: C.indigo }}>Activer</button>
                )}
              </div>
            )}
          </div>
        )}

        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
            <div className="flex items-center gap-2 text-sm"><Icon size={14} color={C.indigo} /> {label}</div>
            <input
              type="checkbox"
              checked={prefs[key] !== false}
              onChange={(e) => onUpdatePreference?.(key, e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>
        ))}
        <button onClick={onClose} className="w-full mt-4 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: C.ink, minHeight: 44 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
