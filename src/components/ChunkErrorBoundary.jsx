import React from "react";
import { RefreshCw } from "lucide-react";
import { C } from "../constants";

// Filet de sécurité pour les onglets chargés à la demande (lazy(), voir
// SocialShell.jsx) — après un déploiement, un onglet gardé ouvert longtemps
// dans un onglet navigateur référence encore les anciens fichiers JS
// hashés, qui n'existent plus sur le domaine de production une fois le
// nouveau déploiement en place ("Failed to fetch dynamically imported
// module"). Sans filet, ceci fait planter tout l'arbre React (écran vide) —
// symptôme rapporté comme un bug "parfois" sur l'onglet Immigration, plus
// visible car peu ouvert en tout début de session.
// Un rechargement complet une seule fois (sessionStorage) suffit à
// récupérer le nouveau shell ; pour toute autre erreur de rendu, un
// message générique avec bouton "Réessayer" évite l'écran vide silencieux.
export default class ChunkErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const isChunkError = /dynamically imported module|Failed to fetch|Loading chunk|ChunkLoadError/i.test(
      String(error?.message || error)
    );
    if (isChunkError && !sessionStorage.getItem("bb-chunk-reload")) {
      sessionStorage.setItem("bb-chunk-reload", "1");
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        <p className="text-sm mb-4" style={{ color: "rgba(var(--bb-ink-rgb),0.6)" }}>
          Impossible de charger cette section. Vérifie ta connexion et réessaie.
        </p>
        <button
          onClick={() => { sessionStorage.removeItem("bb-chunk-reload"); window.location.reload(); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white"
          style={{ background: C.navy, minHeight: 44 }}
        >
          <RefreshCw size={15} /> Réessayer
        </button>
      </div>
    );
  }
}
