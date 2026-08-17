import React, { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "../supabaseClient";
import { C } from "../components/auth/authTheme";
import PasswordField from "../components/auth/PasswordField";
import PasswordStrengthMeter from "../components/auth/PasswordStrengthMeter";
import { scorePassword, passwordMeetsMinimum } from "../lib/passwordStrength";

// Réaligné sur la palette sombre d'Auth.jsx (Phase 7.5) — utilisait
// auparavant la palette claire de constants.js, ce qui créait une rupture
// visuelle en plein milieu du parcours d'authentification. La logique
// supabase.auth.updateUser() est inchangée.
export default function UpdatePasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const confirmMatches = confirm.length > 0 && password === confirm;
  const confirmMismatch = confirm.length > 0 && password !== confirm;
  const ready = passwordMeetsMinimum(scorePassword(password).checks) && password === confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!passwordMeetsMinimum(scorePassword(password).checks)) {
      setError("Ton mot de passe ne respecte pas encore toutes les règles minimales.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setDone(true);
      setTimeout(() => onDone?.(), 1800);
    } catch (e) {
      setError(e?.message || "Impossible de mettre à jour le mot de passe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bb-auth min-h-screen flex items-center justify-center px-4" style={{ background: C.dusk, color: C.sand, fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`@media (prefers-reduced-motion: reduce) { .bb-auth * { animation: none !important; transition: none !important; } }`}</style>
      <div className="w-full max-w-sm rounded-[30px] p-6 sm:p-7"
        style={{ background: "rgba(15,21,38,0.80)", border: "1px solid rgba(242,233,220,0.16)",
          boxShadow: "0 30px 90px rgba(0,0,0,0.52)", backdropFilter: "blur(22px)" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 24 }} className="mb-1">
          Nouveau mot de passe
        </div>
        <p className="text-sm mb-5" style={{ color: C.sandDim }}>
          Choisis un nouveau mot de passe pour ton compte Baobab.
        </p>

        {done ? (
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5" style={{ background: "rgba(143,174,134,0.15)", border: "1px solid rgba(143,174,134,0.25)" }}>
            <CheckCircle2 size={20} color={C.acacia} />
            <p className="text-sm" style={{ color: "#B9D5B2" }}>Mot de passe mis à jour ! Redirection...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div role="alert" className="text-sm rounded-2xl px-4 py-3" style={{ background: "rgba(193,97,61,0.15)", color: "#F4A48C", border: "1px solid rgba(193,97,61,0.28)" }}>
                {error}
              </div>
            )}
            <div>
              <PasswordField
                id="new-password"
                label="Nouveau mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
              <PasswordStrengthMeter password={password} />
            </div>
            <div>
              <PasswordField
                id="confirm-password"
                label="Confirmer le mot de passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                invalid={confirmMismatch}
              />
              {(confirmMatches || confirmMismatch) && (
                <p className="mt-2 text-xs font-semibold" style={{ color: confirmMatches ? C.acacia : "#F4A48C" }}>
                  {confirmMatches ? "✓ Les mots de passe correspondent" : "⚠ Les mots de passe ne correspondent pas"}
                </p>
              )}
            </div>
            <button type="submit" disabled={loading || !ready}
              className="mt-1 py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)`, color: "#FFF8EF" }}>
              {loading && <Loader2 size={16} className="animate-spin" />}
              Mettre à jour le mot de passe
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
