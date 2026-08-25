import React, { useEffect, useState } from "react";
import { Sparkles, Users } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { primary, coral, muted, navy } from "../social/theme";

export default function HomeHeader({ currentUser }) {
  const firstName = currentUser?.name?.trim()?.split(" ")[0];
  const greeting = firstName ? `Bonjour ${firstName} 👋` : "Bienvenue sur Baobab 👋";

  // Même RPC publique que la page d'accueil visiteurs (LandingPage.jsx) —
  // aucune donnée personnelle, juste un compte agrégé (public_user_count,
  // supabase-public-user-count.sql). Échoue silencieusement si la RPC
  // n'existe pas encore côté base.
  const [userCount, setUserCount] = useState(null);
  useEffect(() => {
    let alive = true;
    supabase.rpc("public_user_count").then(({ data, error }) => {
      if (!alive || error) return;
      setUserCount(data);
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="bb-stagger mb-7">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider" style={{ background: "#FFF1EC", color: coral }}>
          <Sparkles size={13} aria-hidden="true" /> Communauté Baobab au Canada
        </div>
        {Boolean(userCount) && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black" style={{ background: "#F1F1F9", color: navy }}>
            <Users size={13} aria-hidden="true" /> {userCount.toLocaleString("fr-CA")} membre{userCount > 1 ? "s" : ""} sur Baobab
          </div>
        )}
      </div>
      <h1 className="text-3xl md:text-4xl font-black tracking-tight mt-3" style={{ color: primary }}>{greeting}</h1>
      <p className="mt-1 text-sm md:text-base" style={{ color: muted }}>
        Ton cercle canadien commence ici.{currentUser?.city ? ` · ${currentUser.city} • Canada` : ""}
      </p>
    </div>
  );
}
