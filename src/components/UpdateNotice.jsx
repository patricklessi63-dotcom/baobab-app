import React from "react";
import { Sparkles, AlertTriangle } from "lucide-react";
import { C } from "../constants";
import { CURRENT_VERSION } from "../lib/version";

// Deux variantes distinctes (item 10 vs 11 du cahier des charges "mise à
// jour") : obligatoire = plein écran, pas d'échappatoire ("Plus tard"
// volontairement absent) ; recommandée = carte discrète en bas d'écran,
// fermable, jamais bloquante.
export default function UpdateNotice({ mandatory, recommended, info, onReload, onDismiss }) {
  if (!mandatory && !recommended) return null;

  if (mandatory) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-5" style={{ background: "rgba(13,25,20,0.82)", backdropFilter: "blur(4px)" }} role="alertdialog" aria-modal="true" aria-label="Mise à jour nécessaire">
        <div className="w-full max-w-sm rounded-[24px] p-6 text-center" style={{ background: C.sand }}>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "rgba(193,97,61,0.14)" }}>
            <AlertTriangle size={26} color={C.clay} />
          </div>
          {/* Cette carte a un fond FIXE (C.sand, jamais réactif — voir ligne
          ci-dessus), contrairement à .bb-card. Un commit antérieur avait
          remplacé C.indigo par var(--bb-text) ici en pensant qu'il s'agissait
          d'un texte sur fond réactif (comme les autres titres de modales
          corrigés dans le même commit) : en thème sombre, --bb-text devient
          #F2EDE0 (crème clair), quasi identique à C.sand (#F2E9DC) →
          titre invisible. Le paragraphe juste en dessous utilise déjà à
          raison la variante FIXE --bb-ink-rgb-static ; on revient ici à
          C.indigo (fixe), cohérent avec l'onboarding/EditProfileForm qui
          suivent la même convention sur fond clair fixe. */}
          <h2 className="text-lg font-black" style={{ color: C.indigo }}>Mise à jour nécessaire</h2>
          <p className="text-sm mt-3" style={{ color: "rgba(var(--bb-ink-rgb-static),0.7)" }}>
            Cette version de Baobab n'est plus compatible avec les services actuels. Installe la dernière version pour continuer.
          </p>
          <button onClick={onReload} className="w-full mt-6 py-3 rounded-full text-sm font-bold text-white" style={{ background: C.indigo }}>
            Mettre à jour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed z-[90] left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-6 sm:w-full sm:max-w-sm" role="status">
      <div className="rounded-[20px] p-4 shadow-2xl" style={{ background: C.dusk3, color: C.sand, border: "1px solid rgba(217,164,65,0.25)" }}>
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center" style={{ background: "rgba(217,164,65,0.16)" }}>
            <Sparkles size={17} color={C.ochre} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Nouvelle version de Baobab</p>
            <p className="text-xs mt-0.5" style={{ color: C.sandDim }}>
              {CURRENT_VERSION} → {info?.latestVersion}
            </p>
            {info?.releaseNotes?.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {info.releaseNotes.slice(0, 4).map((note, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: C.sandDim }}>
                    <span style={{ color: C.acacia }}>✓</span> {note}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center gap-2 mt-3">
              <button onClick={onReload} className="flex-1 py-2 rounded-full text-xs font-bold text-white" style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)` }}>
                Mettre à jour
              </button>
              <button onClick={onDismiss} className="px-3 py-2 rounded-full text-xs font-semibold" style={{ color: C.sandDim }}>
                Plus tard
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
