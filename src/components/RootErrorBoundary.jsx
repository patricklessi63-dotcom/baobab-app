import React from "react";
import { RefreshCw } from "lucide-react";
import { C } from "../constants";

// Filet de sécurité de dernier recours — TOUT l'arbre applicatif (App.jsx et
// donc SocialShell, Auth, l'onboarding, les écrans banni/suspendu, etc.) n'a
// jamais été enveloppé par un ErrorBoundary : seules certaines sections
// internes de SocialShell (onglets chargés à la demande — communautés,
// événements, premium, admin, actualités) le sont via ChunkErrorBoundary.jsx.
// Une erreur de rendu survenant AILLEURS (l'écran de connexion, l'en-tête/nav
// de la coquille sociale, le fil, découvrir, matches, profil, ou n'importe
// quelle modale) n'était donc rattrapée par aucune limite : React démonte
// silencieusement tout l'arbre, laissant un écran entièrement blanc, sans le
// moindre message ni bouton pour se rétablir.
// Volontairement SANS le rechargement automatique de ChunkErrorBoundary
// (utile pour une erreur de chunk précise après déploiement) : ici, l'erreur
// peut venir de n'importe où, y compris d'un état applicatif durablement
// invalide — un rechargement automatique en boucle serait pire qu'un message
// avec bouton manuel.
export default class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Erreur non rattrapée au niveau racine :", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6 text-center"
        style={{ background: "var(--bb-bg)", color: "var(--bb-text)" }}
      >
        <div className="max-w-sm">
          <p className="text-base font-bold mb-2">Une erreur inattendue est survenue.</p>
          <p className="text-sm mb-6" style={{ color: "var(--bb-muted)" }}>
            Désolé pour le désagrément. Recharge la page pour continuer — si le problème persiste, réessaie un peu plus tard.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white"
            style={{ background: C.navy, minHeight: 44 }}
          >
            <RefreshCw size={15} /> Recharger l'application
          </button>
        </div>
      </div>
    );
  }
}
