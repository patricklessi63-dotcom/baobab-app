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

  // index.html déclare un <link rel="canonical"> statique vers "/" : comme
  // vercel.json réécrit TOUTES les routes vers ce même index.html, les pages
  // /a-propos, /confidentialite et /conditions annonçaient donc aux moteurs de
  // recherche qu'elles sont un doublon de la page d'accueil (alors que
  // public/sitemap.xml les liste comme des URL distinctes) — elles ne
  // seraient jamais indexées sous leur propre adresse. On pointe le canonical
  // vers la page courante le temps de son affichage, puis on restaure la
  // valeur d'origine au démontage. L'origine (domaine officiel) est reprise du
  // canonical existant, pour qu'un changement de domaine ne se fasse qu'à un
  // seul endroit (index.html).
  useEffect(() => {
    const link = document.querySelector('link[rel="canonical"]');
    if (!link) return undefined;
    const previous = link.getAttribute("href");
    try {
      link.setAttribute("href", new URL(window.location.pathname, previous || window.location.origin).href);
    } catch {
      return undefined;
    }
    return () => {
      if (previous !== null) link.setAttribute("href", previous);
    };
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 sm:px-6"
      style={{ background: C.dusk, color: C.sand, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div className="w-full max-w-2xl">
        <button type="button" onClick={() => navigate("/")} className="min-h-11 inline-flex items-center gap-1 text-xs font-semibold mb-6" style={{ color: C.sandDim }}>
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
