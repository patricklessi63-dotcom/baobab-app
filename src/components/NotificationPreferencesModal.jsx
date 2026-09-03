import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Sparkles, Heart, UserPlus, Users2, PartyPopper, Megaphone, Bell } from "lucide-react";
import { C } from "../constants";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useFocusTrap } from "../hooks/useFocusTrap";
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
  { key: "marketing", label: "Marketing (bientôt)", icon: Megaphone },
];

// Filtrage appliqué côté client à l'affichage du panneau de notifications
// (SocialShell.jsx) — pas de suppression à la source dans les triggers
// déjà existants, voir rapport final pour la décision de périmètre.
export default function NotificationPreferencesModal({ open, onClose, onBack, currentUser, onUpdatePreference }) {
  const panelRef = useRef(null);
  useEscapeKey(open, onClose);
  useFocusTrap(open, panelRef);
  const [pushStep, setPushStep] = useState("idle"); // idle | consent | requesting | error
  const [pushStatus, setPushStatus] = useState(null);
  const [pushError, setPushError] = useState("");

  // Cette modale reste montée en permanence (AppModals ne la démonte jamais,
  // elle rend juste `null` en interne) — sans ce reset, rouvrir la modale
  // après une fermeture en plein écran de consentement push ou d'erreur
  // réaffichait à tort cet écran périmé au lieu de la liste normale des
  // préférences (même classe de bug que DeleteAccountModal/StoryViewerModal).
  useEffect(() => {
    if (!open) return;
    setPushStep("idle");
    setPushError("");
    if (!isPushSupported()) return;
    // getPushSubscriptionStatus() peut rejeter (navigator.serviceWorker.
    // getRegistration()/pushManager.getSubscription() peuvent lever selon le
    // navigateur/l'état du service worker) — sans ce .catch, pushStatus
    // restait à null et la section "Notifications push" ci-dessous
    // (conditionnée à pushStatus?.supported) disparaissait silencieusement
    // de la modale, sans aucune erreur visible.
    getPushSubscriptionStatus().then(setPushStatus).catch((e) => console.error(e));
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
    setPushStep("requesting");
    try {
      await disablePushNotifications();
      setPushStatus(await getPushSubscriptionStatus());
      setPushStep("idle");
    } catch (e) {
      setPushError(e.message || "Impossible de désactiver les notifications push.");
      setPushStep("error");
    }
  }

  return (
    <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Préférences de notifications">
      <div ref={panelRef} tabIndex={-1} className="bb-card p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {onBack && (
            <button onClick={onBack} aria-label="Retour" style={{ color: "var(--bb-text)" }}><ArrowLeft size={16} /></button>
          )}
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: "var(--bb-text)" }}>
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
                <p className="text-sm font-bold" style={{ color: "var(--bb-text)" }}>Un instant…</p>
              </div>
            )}

            {pushStep === "error" && (
              <div className="py-1 text-center">
                <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>{pushError}</p>
                <button onClick={() => setPushStep("idle")} className="mt-2 text-sm font-semibold" style={{ color: "var(--bb-text)" }}>Compris</button>
              </div>
            )}

            {pushStep === "idle" && (
              <div className="flex items-center justify-between" style={{ minHeight: 44 }}>
                <div className="flex items-center gap-2 text-sm"><Bell size={14} color="var(--bb-text)" /> Notifications push sur cet appareil</div>
                {pushStatus.subscribed ? (
                  <button onClick={handleDisablePush} className="text-xs font-semibold" style={{ color: C.clay }}>Désactiver</button>
                ) : pushStatus.permission === "denied" ? (
                  <span className="text-xs text-right" style={{ color: "rgba(var(--bb-ink-rgb),0.5)", maxWidth: 140 }}>Bloquées (réglages du navigateur)</span>
                ) : (
                  <button onClick={() => setPushStep("consent")} className="text-xs font-semibold" style={{ color: "var(--bb-text)" }}>Activer</button>
                )}
              </div>
            )}
          </div>
        )}

        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
            <div className="flex items-center gap-2 text-sm"><Icon size={14} color="var(--bb-text)" /> {label}</div>
            <input
              type="checkbox"
              checked={prefs[key] !== false}
              onChange={(e) => onUpdatePreference?.(key, e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>
        ))}

        {/* Confidentialité des aperçus (item 6 du cahier des charges
            messagerie privée) — le texte du message n'apparaît sur l'écran
            verrouillé que si cette case est décochée. */}
        <label className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2 text-sm"><Bell size={14} color="var(--bb-text)" /> Aperçu des messages</div>
            <p className="text-xs mt-0.5" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>Si désactivé, la notification n'affiche que "Nouveau message" — pas le texte.</p>
          </div>
          <input
            type="checkbox"
            checked={prefs.hide_message_preview !== true}
            onChange={(e) => onUpdatePreference?.("hide_message_preview", !e.target.checked)}
            style={{ width: 18, height: 18, flexShrink: 0 }}
          />
        </label>
        {/* Bug corrigé (même défaut que C.navy, passage 166) : C.ink est un
        jeton FIXE (fond crème fixe de l'onboarding), mais cette modale est
        en .bb-card à fond RÉACTIF — en thème sombre, texte quasi noir sur
        fond quasi noir. "var(--bb-text)" est l'équivalent réactif. */}
        <button onClick={onClose} className="w-full mt-4 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}
