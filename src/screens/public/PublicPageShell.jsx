import React, { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { C } from "../../components/auth/authTheme";

// Mise en page partagée par les pages publiques (À propos, Confidentialité,
// Conditions) — même palette sombre que Auth.jsx/UpdatePasswordScreen.jsx,
// dont PrivacyPolicyContent/TermsOfServiceContent (src/legalContent.jsx)
// supposent déjà le fond (titres de section en couleur claire).
export default function PublicPageShell({ title, navigate, children }) {
  useEffect(() => {
    document.title = title ? `Baobab — ${title}` : "Baobab";
  }, [title]);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:px-6"
      style={{ background: C.dusk, color: C.sand, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="w-full max-w-2xl">
        <button type="button" onClick={() => navigate("/")} className="inline-flex items-center gap-1 text-xs font-semibold mb-6" style={{ color: C.sandDim }}>
          <ArrowLeft size={14} /> Retour à l'accueil
        </button>

        <div className="rounded-[24px] p-6 sm:p-8" style={{ background: C.dusk3, border: "1px solid rgba(242,233,220,0.12)" }}>
          {title && (
            <h1 className="mb-5" style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 600, fontSize: 26, color: C.sand }}>
              {title}
            </h1>
          )}
          <div className="text-sm leading-6" style={{ color: C.sandDim }}>
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
