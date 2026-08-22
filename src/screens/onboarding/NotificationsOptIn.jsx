import React, { useState } from "react";
import { Bell } from "lucide-react";
import { C } from "../../constants";
import { isPushSupported, enablePushNotifications } from "../../lib/pushNotifications";

// Dernier écran de l'inscription (pas un "step" du wizard 1-10 — n'affecte
// pas OnboardingProgress ni onboarding_step) : demande le consentement push
// une seule fois, juste après la création du profil, plutôt qu'au hasard
// d'une session ultérieure. Ajustable en tout temps ensuite dans Réglages
// > Notifications (NotificationPreferencesModal.jsx, même helper).
export default function NotificationsOptIn({ onDone }) {
  const [status, setStatus] = useState("idle"); // idle | requesting | error
  const [error, setError] = useState("");
  const supported = isPushSupported();

  async function handleAllow() {
    setStatus("requesting");
    setError("");
    try {
      await enablePushNotifications();
      onDone();
    } catch (e) {
      setError(e.message || "Impossible d'activer les notifications.");
      setStatus("error");
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto w-full text-center bb-fade-in">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(217,164,65,0.14)" }}>
        <Bell size={28} color={C.ochre} />
      </div>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 22, color: C.indigo }}>
        Reste au courant
      </h2>
      <p className="text-sm mt-3" style={{ color: "rgba(var(--bb-ink-rgb-static),0.7)" }}>
        Active les notifications pour être prévenu(e) dès un nouveau match, un message ou une invitation. Jamais de spam — ajustable à tout moment dans les réglages.
      </p>
      {error && (
        <p className="text-sm mt-3 font-semibold" style={{ color: C.clay }}>{error}</p>
      )}
      {supported ? (
        <>
          <button onClick={handleAllow} disabled={status === "requesting"} className="bb-btn bb-btn-primary w-full mt-6 py-3 rounded-full font-semibold text-sm disabled:opacity-60">
            {status === "requesting" ? "Activation..." : "Activer les notifications"}
          </button>
          <button onClick={onDone} className="w-full mt-2 py-2.5 text-sm font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>
            Plus tard
          </button>
        </>
      ) : (
        <button onClick={onDone} className="bb-btn bb-btn-primary w-full mt-6 py-3 rounded-full font-semibold text-sm">
          Continuer
        </button>
      )}
    </div>
  );
}
