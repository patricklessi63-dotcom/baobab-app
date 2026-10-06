import React, { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { C } from "./authTheme";

// Champ mot de passe + bascule œil, factorisé (auparavant dupliqué presque
// à l'identique entre Auth.jsx et UpdatePasswordScreen.jsx).
export default function PasswordField({
  id,
  name,
  label,
  labelRight,
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  minLength = 1,
  invalid = false,
  describedBy,
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      {(label || labelRight) && (
        <div className="mb-2 flex items-center justify-between">
          {label && <label htmlFor={id} className="text-xs font-semibold" style={{ color: C.sandDim }}>{label}</label>}
          {labelRight}
        </div>
      )}
      <div
        className="bb-field flex items-center gap-3 rounded-2xl px-4"
        style={{ background: "rgba(26,54,38,0.78)", border: `1px solid ${invalid ? "rgba(229,107,93,0.55)" : "rgba(242,233,220,0.11)"}` }}
      >
        <Lock size={17} color={C.sandDim} />
        <input
          id={id}
          type={show ? "text" : "password"}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          name={name || id}
          // Quand le mot de passe est affiché (type="text"), le clavier mobile
          // le traiterait comme du texte libre : majuscule automatique sur la
          // première lettre, autocorrection, suggestions. On les coupe pour
          // les deux états.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={invalid ? "true" : undefined}
          aria-describedby={describedBy || undefined}
          className="min-w-0 flex-1 bg-transparent py-4 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-leaf)]"
          style={{ color: C.sand, fontSize: 16 }}
        />
        <button
          type="button"
          // Libellé fixe + aria-pressed (bouton à bascule) : changer le libellé
          // ET l'état faisait annoncer « Masquer le mot de passe, activé » aux
          // lecteurs d'écran, ce qui se lit comme une contradiction.
          aria-label="Afficher le mot de passe"
          aria-pressed={show}
          // Le bouton ne vole plus le focus au champ au toucher/clic : sur
          // mobile le clavier ne se referme plus et le curseur reste en place.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShow((v) => !v)}
          className="bb-tap flex items-center justify-center flex-shrink-0"
          style={{ color: C.sandDim, width: 44, marginRight: -8 }}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
