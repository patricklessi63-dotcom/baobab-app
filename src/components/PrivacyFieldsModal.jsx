import React from "react";
import { ArrowLeft, MapPin, Flag, Briefcase, GraduationCap, Plane, Sparkles, Heart, Wand2, Cake } from "lucide-react";
import { C } from "../constants";
import { useEscapeKey } from "../hooks/useEscapeKey";

const FIELDS = [
  { key: "show_city", label: "Afficher ma ville", icon: MapPin },
  { key: "show_country", label: "Afficher mon pays d'origine", icon: Flag },
  { key: "show_occupation", label: "Afficher ma profession", icon: Briefcase },
  { key: "show_studies", label: "Afficher mes études", icon: GraduationCap },
  { key: "show_canada_journey", label: "Afficher mon parcours Canada", icon: Plane },
  { key: "show_life_project", label: "Afficher mon projet de vie", icon: Heart },
  { key: "show_interests", label: "Afficher mes centres d'intérêt", icon: Sparkles },
];

// Réglage exclusif fondateur — non proposé aux autres utilisateurs, dont
// profile.show_birth_year reste toujours true/undefined (voir visibleAge()
// dans utils/format.js, lu partout où l'âge s'affiche).
const FOUNDER_FIELDS = [
  { key: "show_birth_year", label: "Afficher mon année de naissance", icon: Cake },
];

// Personnalisation (Phase 9) — utilise handleToggleField, déjà générique
// pour n'importe quelle colonne "profiles" (aucune nouvelle plomberie).
const PERSONALIZATION_FIELDS = [
  { key: "personalization_enabled", label: "Recommandations personnalisées", icon: Sparkles },
  { key: "ai_suggestions_enabled", label: "Suggestions IA (bio, publications, conversations…)", icon: Wand2 },
];

export default function PrivacyFieldsModal({ open, onClose, onBack, currentUser, onToggleField }) {
  useEscapeKey(open, onClose);
  if (!open) return null;
  return (
    <div className="bb-fade-in fixed inset-0 flex items-end md:items-center justify-center z-30 p-0 md:p-5" style={{ background: "rgba(8,20,14,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose} role="dialog" aria-modal="true" aria-label="Confidentialité des champs">
      <div className="bb-card p-6 w-full max-w-md rounded-t-[20px] md:rounded-[20px]" style={{ maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {onBack && (
            <button onClick={onBack} aria-label="Retour" style={{ color: "var(--bb-text)" }}><ArrowLeft size={16} /></button>
          )}
          <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 20, color: "var(--bb-text)" }}>
            Confidentialité des champs
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
          Ceci contrôle uniquement ce que l'app affiche dans ton profil public — ce
          n'est pas un accès à ta base de données Supabase, qui reste soumise à ses
          propres règles de sécurité.
        </p>
        {FIELDS.map(({ key, label, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
            <div className="flex items-center gap-2 text-sm"><Icon size={14} color="var(--bb-text)" /> {label}</div>
            <input
              type="checkbox"
              checked={currentUser?.[key] !== false}
              onChange={(e) => onToggleField?.(key, e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>
        ))}

        {currentUser?.is_founder && FOUNDER_FIELDS.map(({ key, label, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
            <div className="flex items-center gap-2 text-sm"><Icon size={14} color="var(--bb-text)" /> {label}</div>
            <input
              type="checkbox"
              checked={currentUser?.[key] !== false}
              onChange={(e) => onToggleField?.(key, e.target.checked)}
              style={{ width: 18, height: 18 }}
            />
          </label>
        ))}

        <div className="mt-4 mb-1 text-xs font-black uppercase tracking-wider" style={{ color: "rgba(var(--bb-ink-rgb),0.5)" }}>Personnalisation</div>
        {PERSONALIZATION_FIELDS.map(({ key, label, icon: Icon }) => (
          <label key={key} className="flex items-center justify-between py-2.5" style={{ borderTop: "1px solid rgba(var(--bb-ink-rgb),0.08)", minHeight: 44 }}>
            <div className="flex items-center gap-2 text-sm"><Icon size={14} color="var(--bb-text)" /> {label}</div>
            <input
              type="checkbox"
              checked={currentUser?.[key] !== false}
              onChange={(e) => onToggleField?.(key, e.target.checked)}
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
