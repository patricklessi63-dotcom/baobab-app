import React, { useRef, useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { C } from "../../constants";
import { isPushSupported, isIosNotInstalled, enablePushNotifications } from "../../lib/pushNotifications";

// Dernier écran de l'inscription (pas un "step" du wizard 1-10 — n'affecte
// pas OnboardingProgress ni onboarding_step) : demande le consentement push
// une seule fois, juste après la création du profil, plutôt qu'au hasard
// d'une session ultérieure. Ajustable en tout temps ensuite dans Réglages
// > Notifications (NotificationPreferencesModal.jsx, même helper).
//
// Cet écran est sur le chemin obligatoire de tout nouvel inscrit :
// l'onboarding est déjà terminé en base (onboarding_completed_at posé avant
// l'affichage), donc quel que soit le résultat (accordé, refusé, fenêtre
// fermée, API absente, échec réseau) « Plus tard »/« Continuer » restent
// toujours disponibles et mènent au fil.
export default function NotificationsOptIn({ onDone }) {
  const [status, setStatus] = useState("idle"); // idle | requesting | error
  const [error, setError] = useState("");
  const supported = isPushSupported();
  const blocked = supported && Notification.permission === "denied";
  const iosHint = !supported && isIosNotInstalled();
  // Gardes synchrones (un state React n'est pas encore à jour au 2e clic d'un
  // double-tap) : une seule demande de permission/upsert à la fois, et
  // onDone() n'est appelé qu'une fois. Sans `doneRef`, taper « Plus tard »
  // pendant que la fenêtre de permission du navigateur est encore ouverte
  // laissait handleAllow() rappeler onDone() (setView("feed")) APRÈS la
  // réponse tardive — renvoyant la personne au fil depuis l'écran où elle se
  // trouvait entre-temps.
  const inFlightRef = useRef(false);
  const doneRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  async function handleAllow() {
    if (inFlightRef.current || doneRef.current) return;
    inFlightRef.current = true;
    setStatus("requesting");
    setError("");
    try {
      await enablePushNotifications();
      finish();
    } catch (e) {
      if (mountedRef.current && !doneRef.current) {
        setError(e?.message || "Impossible d'activer les notifications.");
        setStatus("error");
      }
    } finally {
      inFlightRef.current = false;
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
      {error && !blocked && (
        <p role="alert" className="text-sm mt-3 font-semibold" style={{ color: C.coralTextStatic }}>{error}</p>
      )}
      {blocked && (
        <p className="text-sm mt-3 font-semibold" style={{ color: C.coralTextStatic }}>
          Les notifications sont bloquées dans les réglages de ton navigateur. Tu pourras les autoriser là-bas, puis les activer dans les réglages de Baobab.
        </p>
      )}
      {!supported && (
        <p className="text-sm mt-3 font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.7)" }}>
          {iosHint
            ? "Sur iPhone/iPad, les notifications ne marchent qu'une fois Baobab ajoutée à l'écran d'accueil (Partager, puis « Sur l'écran d'accueil »)."
            : "Ce navigateur ne prend pas en charge les notifications push. Tu retrouveras tes matchs et messages directement dans l'app."}
        </p>
      )}
      {supported && !blocked ? (
        <>
          <button onClick={handleAllow} disabled={status === "requesting"} className="bb-btn bb-btn-primary w-full mt-6 py-3 rounded-full font-semibold text-sm disabled:opacity-60">
            {status === "requesting" ? "Activation..." : "Activer les notifications"}
          </button>
          <button onClick={finish} className="w-full mt-2 py-2.5 text-sm font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>
            Plus tard
          </button>
        </>
      ) : (
        <button onClick={finish} className="bb-btn bb-btn-primary w-full mt-6 py-3 rounded-full font-semibold text-sm">
          Continuer
        </button>
      )}
    </div>
  );
}
