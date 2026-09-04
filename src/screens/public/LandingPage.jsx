import React, { useEffect, useState } from "react";
import { MapPin, Users } from "lucide-react";
import loginBackground from "../../assets/baobab-canada-bg.svg";
import { C } from "../../components/auth/authTheme";
import { supabase } from "../../supabaseClient";

// Page d'accueil publique (Phase 12b) — reprend l'accroche déjà écrite
// dans Auth.jsx (bb-hero, visible desktop uniquement) en pleine page,
// avec deux CTA distincts au lieu du formulaire directement affiché.
export default function LandingPage({ onLogin, onSignup, navigate }) {
  const [userCount, setUserCount] = useState(null);

  useEffect(() => {
    document.title = "Baobab — Rencontres et communauté pour immigrants au Canada";
  }, []);

  useEffect(() => {
    // "profiles" est restreint aux utilisateurs connectés (RLS) — un
    // visiteur non connecté ne peut pas le lire, ni même en compter les
    // lignes. RPC dédiée (public_user_count, supabase-public-user-count.sql)
    // qui ne renvoie qu'un nombre, jamais de données de profil.
    supabase.rpc("public_user_count").then(({ data, error }) => {
      if (!error && typeof data === "number") setUserCount(data);
    });
  }, []);

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-6"
      style={{ fontFamily: "Inter, system-ui, sans-serif", color: C.sand, background: C.dusk,
        paddingTop: "max(1.5rem, env(safe-area-inset-top))", paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
      <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${loginBackground})` }} />
      <div aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(7,20,13,0.35), rgba(7,20,13,0.72) 55%, rgba(7,20,13,0.96) 100%)" }} />

      <div className="bb-fade-in relative z-10 w-full max-w-2xl flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold mb-6"
          style={{ background: "rgba(13,32,22,0.52)", border: "1px solid rgba(242,233,220,0.16)", backdropFilter: "blur(12px)" }}>
          <MapPin size={14} color={C.ochre} /> Une communauté partout au Canada
        </div>

        <div className="mb-2" style={{ fontFamily: "Fraunces, serif", fontStyle: "italic", fontWeight: 600, fontSize: 22, color: C.ochre }}>
          Baobab
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05]" style={{ fontFamily: "Fraunces, serif" }}>
          Nouvelle vie.<br />Nouvelles connexions.
        </h1>

        <p className="mt-5 max-w-md text-base sm:text-lg leading-7" style={{ color: C.sandDim }}>
          Baobab rapproche les immigrants au Canada pour l'amour, l'amitié, les rencontres et les nouvelles communautés.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <button onClick={onSignup} className="w-full sm:w-auto px-7 py-4 rounded-2xl text-sm font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            style={{ background: `linear-gradient(135deg, ${C.clay}, #A94F30)`, color: "#FFF8EF", boxShadow: "0 14px 32px -10px rgba(193,97,61,.65)" }}>
            Créer mon compte
          </button>
          <button onClick={onLogin} className="w-full sm:w-auto px-7 py-4 rounded-2xl text-sm font-bold outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
            style={{ background: "rgba(242,233,220,0.1)", border: "1px solid rgba(242,233,220,0.2)", color: C.sand }}>
            Se connecter
          </button>
        </div>

        {Boolean(userCount) && (
          <div className="mt-7 inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold"
            style={{ background: "rgba(13,32,22,0.42)", border: "1px solid rgba(242,233,220,0.14)", backdropFilter: "blur(10px)", color: C.sandDim }}>
            <Users size={13} color={C.ochre} /> {userCount.toLocaleString("fr-CA")} membre{userCount > 1 ? "s" : ""} déjà sur Baobab
          </div>
        )}

        <div className="mt-10 flex justify-center flex-wrap gap-x-4 gap-y-2 text-[11px]" style={{ color: "rgba(242,233,220,0.5)" }}>
          <button type="button" onClick={() => navigate("/a-propos")} className="underline decoration-dotted underline-offset-2">À propos</button>
          <span>•</span>
          <button type="button" onClick={() => navigate("/confidentialite")} className="underline decoration-dotted underline-offset-2">Confidentialité</button>
          <span>•</span>
          <button type="button" onClick={() => navigate("/conditions")} className="underline decoration-dotted underline-offset-2">Conditions</button>
        </div>
      </div>
    </main>
  );
}
