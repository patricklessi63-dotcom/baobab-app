import React, { useEffect, useState } from "react";
import { CalendarDays, Compass, MessageCircle, Users } from "lucide-react";
import HorizonTree from "../../components/horizon/HorizonTree";
import { loadHorizonFonts } from "../../components/horizon/loadHorizonFonts";
import { useReduceMotion } from "../../components/horizon/useReduceMotion";
import { isNative } from "../../lib/platform";
import { supabase } from "../../supabaseClient";
import "../../styles/horizon-landing.css";

// Page d'accueil publique, direction « Baobab Horizon » : un baobab dessiné par
// un réseau de points lumineux sur un horizon de savane. Le contenu texte est
// rendu tout de suite (l'arbre est décoratif, chargé à part, avec un repli SVG) ;
// les actions et liens sont ceux de la page précédente.

const ZONES = [
  {
    label: "Racines",
    caption: "Racines : d'où tu viens. Ton pays d'origine et tes langues, que tu choisis de montrer.",
  },
  {
    label: "Tronc",
    caption: "Tronc : ce qui nous relie. Communautés, événements et conversations.",
  },
  {
    label: "Branches",
    caption: "Branches : où tu vas. Rencontres, amitiés et nouvelles communautés.",
  },
];
const DEFAULT_CAPTION = "Touche l'arbre : chaque point est un lien, chaque impulsion une conversation.";

// Uniquement des fonctions qui existent dans l'application.
const FEATURES = [
  {
    Icon: Compass,
    title: "Découvrir",
    text: "Des profils proposés selon ton parcours, tes langues et tes centres d'intérêt.",
  },
  {
    Icon: MessageCircle,
    title: "Messages",
    text: "Des conversations avec les personnes que tu rencontres, avec indicateurs de lecture selon tes réglages.",
  },
  {
    Icon: Users,
    title: "Communautés",
    text: "Rejoins des groupes autour d'une culture, d'une ville ou d'un intérêt, et échange avec leurs membres.",
  },
  {
    Icon: CalendarDays,
    title: "Événements",
    text: "Retrouve-toi en vrai : inscris-toi aux événements, avec une liste d'attente quand c'est complet.",
  },
];

function canHover() {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover)").matches;
  } catch {
    return false;
  }
}

export default function LandingPage({ onLogin, onSignup, navigate }) {
  const [userCount, setUserCount] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const { reduce, system, toggle } = useReduceMotion();
  const native = isNative();

  useEffect(() => {
    document.title = "Baobab — Rencontres et communauté pour immigrants au Canada";
  }, []);

  useEffect(() => {
    loadHorizonFonts();
  }, []);

  // Fond du <body> assorti à la page le temps de son affichage : sans cela, le
  // rebond de défilement (iOS) ou un écran plus haut que la page laisse voir le
  // fond crème du thème clair derrière la scène sombre. Restauré au démontage.
  useEffect(() => {
    const previous = document.body.style.backgroundColor;
    document.body.style.backgroundColor = "#060B09";
    return () => {
      document.body.style.backgroundColor = previous;
    };
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

  const activeZone = hovered ?? selected;
  const caption = activeZone === null ? DEFAULT_CAPTION : ZONES[activeZone].caption;

  return (
    <div className="hz-root" data-motion={reduce ? "reduce" : "full"}>
      <a className="hz-skip" href="#hz-contenu">Aller au contenu</a>

      <header className="hz-wrap hz-top">
        <div className="hz-brand">
          <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <path d="M13 29c1.4-5.4 1-9.6-1.2-12.6h8.4C18 19.4 17.6 23.6 19 29z" fill="#F3EEE4" opacity=".92" />
            <g stroke="#62F0BA" strokeWidth="1.2" fill="#62F0BA">
              <path d="M16 16 6 9M16 16 11 5M16 16l5-11M16 16l10-7" fill="none" />
              <circle cx="6" cy="9" r="1.9" />
              <circle cx="11" cy="5" r="1.9" />
              <circle cx="21" cy="5" r="1.9" />
              <circle cx="26" cy="9" r="1.9" />
            </g>
            <path d="M10 29h12" stroke="#F2A33A" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>BAOBAB</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={reduce}
          aria-disabled={system ? true : undefined}
          title={system ? "Défini par les réglages de ton appareil" : undefined}
          className="hz-switch"
          onClick={system ? undefined : toggle}
        >
          <i aria-hidden="true" />
          Réduire les animations
        </button>
      </header>

      <main id="hz-contenu" tabIndex={-1} style={{ outline: "none" }}>
        <section className="hz-wrap hz-hero" aria-labelledby="hz-titre">
          <div className="hz-hero-copy hz-rise">
            <p className="hz-eyebrow">Rencontres · Communautés · Canada</p>
            <h1 id="hz-titre" className="hz-h1">
              Tes racines. Ta communauté. Ton prochain <span className="hz-grad">lien</span>.
            </h1>
            <p className="hz-lead">
              Baobab rapproche les personnes immigrantes au Canada pour l'amour, l'amitié, les rencontres et les nouvelles communautés.
            </p>

            <div className="hz-cta">
              <button type="button" onClick={onSignup} className="hz-btn hz-btn-primary">Créer mon compte</button>
              <button type="button" onClick={onLogin} className="hz-btn hz-btn-ghost">Se connecter</button>
            </div>

            {Boolean(userCount) && (
              <p className="hz-count">
                <Users size={14} aria-hidden="true" /> {userCount.toLocaleString("fr-CA")} membre{userCount > 1 ? "s" : ""} déjà sur Baobab
              </p>
            )}

            <div className="hz-zones" role="group" aria-label="Explorer les trois parties de l'arbre">
              {ZONES.map((z, i) => (
                <button
                  key={z.label}
                  type="button"
                  className="hz-zone"
                  data-zone={i}
                  aria-pressed={selected === i}
                  onClick={() => {
                    setHovered(null);
                    setSelected((cur) => (cur === i ? null : i));
                  }}
                  onMouseEnter={() => {
                    if (canHover()) setHovered(i);
                  }}
                  onMouseLeave={() => setHovered(null)}
                >
                  <i aria-hidden="true" />
                  {z.label}
                </button>
              ))}
            </div>
            <p className="hz-caption" aria-live="polite">{caption}</p>
          </div>

          <div className="hz-stage hz-rise" data-testid="hz-stage">
            <HorizonTree zone={activeZone} reduceMotion={reduce} lite={native} />
            <i className="hz-corner c1" aria-hidden="true" />
            <i className="hz-corner c2" aria-hidden="true" />
            <i className="hz-corner c3" aria-hidden="true" />
            <i className="hz-corner c4" aria-hidden="true" />
            <div className="hz-scan" aria-hidden="true" />
            <p className="hz-hud hz-mono tl" aria-hidden="true">SCÈNE · BAOBAB</p>
            <p className="hz-hud hz-mono bl" aria-hidden="true">Touche l'arbre : une onde le traverse</p>
          </div>
        </section>

        <section className="hz-wrap hz-block" id="fonctions" aria-labelledby="hz-fonctions-titre">
          <p className="hz-eyebrow">Dans l'application</p>
          <h2 id="hz-fonctions-titre" className="hz-h2">Quatre façons de créer du lien.</h2>
          <p className="hz-intro">Découvrir, écrire, rejoindre, se retrouver : tout se passe dans la même application.</p>
          <ul className="hz-features">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title} className="hz-feature">
                <span className="hz-feature-ico" aria-hidden="true"><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="hz-wrap hz-foot">
        <nav className="hz-foot-nav" aria-label="Informations légales">
          <button type="button" onClick={() => navigate("/a-propos")} className="hz-link">À propos</button>
          <button type="button" onClick={() => navigate("/confidentialite")} className="hz-link">Confidentialité</button>
          <button type="button" onClick={() => navigate("/conditions")} className="hz-link">Conditions</button>
          <button type="button" onClick={() => navigate("/suppression-compte")} className="hz-link">Suppression de compte</button>
        </nav>
        <span className="hz-mono" aria-hidden="true">BAOBAB</span>
      </footer>
    </div>
  );
}
