import React, { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Calendar, Heart, Compass } from "lucide-react";
import { C } from "../constants";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { getCurrentPositionSafe } from "../lib/geolocation";

const PREF_FIELDS = [
  { key: "show_general_area", label: "Afficher ma zone générale", icon: MapPin },
  { key: "use_for_recommendations", label: "Utiliser pour les recommandations", icon: Compass },
  { key: "use_for_events", label: "Utiliser pour les événements", icon: Calendar },
  { key: "use_for_dating", label: "Utiliser pour les rencontres", icon: Heart },
];

export default function LocationSettingsModal({ open, onClose, onBack, location, onEnable, onDisable, onUpdatePref }) {
  const [view, setView] = useState("idle"); // idle | consent | requesting | error
  const [errorMessage, setErrorMessage] = useState("");
  useEscapeKey(open, onClose);
  // Cette modale reste montée en permanence (AppModals ne la démonte jamais,
  // elle rend juste `null` en interne) — sans ce reset, rouvrir la modale
  // après une fermeture en plein écran de consentement ou d'erreur de
  // géolocalisation réaffichait à tort cet écran périmé au lieu de la vue
  // normale (même classe de bug que DeleteAccountModal/StoryViewerModal).
  useEffect(() => {
    if (open) { setView("idle"); setErrorMessage(""); }
  }, [open]);
  if (!open) return null;

  const enabled = Boolean(location?.location_enabled);

  async function handleAllow() {
    setView("requesting");
    const result = await getCurrentPositionSafe();
    if (!result.ok) {
      setErrorMessage(result.message);
      setView("error");
      return;
    }
    await onEnable?.(result.latitude, result.longitude);
    setView("idle");
  }

  return (
    <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-[70] p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Localisation">
      <div className="bb-card p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ maxHeight: "85vh", overflowY: "auto", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {onBack && (
            <button onClick={onBack} aria-label="Retour" style={{ color: "var(--bb-text)" }}><ArrowLeft size={16} /></button>
          )}
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: "var(--bb-text)" }}>
            📍 Localisation
          </div>
        </div>

        {view === "consent" && (
          <div className="py-2">
            <p className="text-sm mt-2" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>
              Baobab utilise ta localisation pour te proposer des personnes, événements,
              communautés et informations à proximité. Ta position exacte n'est jamais
              montrée aux autres utilisateurs.
            </p>
            <div className="flex flex-col gap-2 mt-5">
              <button onClick={handleAllow} className="w-full rounded-xl py-3 font-bold text-white" style={{ background: C.indigo }}>Autoriser</button>
              <button onClick={() => setView("idle")} className="w-full rounded-xl py-3 font-semibold" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>Pas maintenant</button>
            </div>
          </div>
        )}

        {view === "requesting" && (
          <div className="py-10 text-center">
            <div className="text-3xl mb-2">📍</div>
            <p className="text-sm font-bold" style={{ color: "var(--bb-text)" }}>Recherche de ta position…</p>
          </div>
        )}

        {view === "error" && (
          <div className="py-6 text-center">
            <div className="text-3xl mb-2">📍</div>
            <p className="text-sm" style={{ color: "rgba(var(--bb-ink-rgb),0.7)" }}>{errorMessage}</p>
            <button onClick={() => setView("idle")} className="w-full mt-5 rounded-xl py-3 font-bold text-white" style={{ background: C.indigo }}>Compris</button>
          </div>
        )}

        {view === "idle" && (
          <>
            <p className="text-sm mb-3" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
              Ta localisation reste privée par défaut. Elle n'est utilisée que pour les
              fonctionnalités que tu actives ci-dessous, et jamais partagée sous forme de
              coordonnées exactes avec les autres membres.
            </p>

            {!enabled ? (
              <button onClick={() => setView("consent")} className="w-full rounded-xl py-3 font-bold text-white" style={{ background: C.indigo }}>
                Activer ma localisation
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
                  <div className="flex items-center gap-2 text-sm"><MapPin size={14} color={C.verified || "var(--bb-text)"} /> Localisation activée</div>
                </div>
                {PREF_FIELDS.map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
                    <div className="flex items-center gap-2 text-sm"><Icon size={14} color="var(--bb-text)" /> {label}</div>
                    <input
                      type="checkbox"
                      checked={location?.[key] !== false}
                      onChange={(e) => onUpdatePref?.(key, e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>
                ))}
                <button onClick={() => onDisable?.()} className="w-full mt-4 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(193,97,61,0.4)", color: C.clay, minHeight: 44 }}>
                  Désactiver ma localisation
                </button>
              </>
            )}
          </>
        )}

        {/* Bug corrigé (même défaut que C.navy, passage 166) : C.ink est un
        jeton FIXE (fond crème fixe de l'onboarding), mais cette modale est
        en .bb-card à fond RÉACTIF — en thème sombre, texte quasi noir sur
        fond quasi noir. "var(--bb-text)" est l'équivalent réactif. */}
        {view === "idle" && (
          <button onClick={onClose} className="w-full mt-4 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(var(--bb-ink-rgb),0.15)", color: "var(--bb-text)", minHeight: 44 }}>
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}
