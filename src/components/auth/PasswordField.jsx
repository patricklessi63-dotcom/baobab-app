import React, { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { C } from "./authTheme";

// Champ mot de passe + bascule œil, factorisé (auparavant dupliqué presque
// à l'identique entre Auth.jsx et UpdatePasswordScreen.jsx).
export default function PasswordField({
  id,
  label,
  labelRight,
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "current-password",
  minLength = 1,
  invalid = false,
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
        style={{ background: "rgba(26,54,38,0.78)", border: `1px solid ${invalid ? "rgba(193,97,61,0.55)" : "rgba(242,233,220,0.11)"}` }}
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
          className="min-w-0 flex-1 bg-transparent py-4 text-sm outline-none"
          style={{ color: C.sand, fontSize: 16 }}
        />
        <button
          type="button"
          aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
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
