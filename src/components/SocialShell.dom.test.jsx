import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Test d'intégration réelle (12 sept.) de la navigation par historique ajoutée
// dans SocialShell.jsx (goTab/goBack, commit 690fd90) — distinct de
// useEscapeKey.dom.test.jsx, qui ne teste que la primitive partagée
// pushBackEntry en isolation. Ici on monte le VRAI SocialShell (pas une
// réimplémentation de goTab) et on vérifie que le bouton/geste "retour"
// mobile (popstate simulé) restaure bien l'onglet précédent.
//
// currentUser=null pour tout ce fichier : chaque effet réseau de
// SocialShell.jsx (stories, favoris, abonnements, notifications, aperçu de
// conversations...) est gardé par `if (!currentUser) return`, donc ce choix
// évite d'avoir à simuler des dizaines de requêtes/canaux Supabase différents
// pour un test qui ne porte que sur goTab/goBack. Un seul mock Supabase
// générique reste nécessaire : CommunitiesTab.jsx charge sa liste de
// communautés (buildListQuery) sans condition sur currentUser (visible par
// tout le monde), donc le montage réel de l'onglet Communautés déclenche
// quand même une requête.
function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  // Rend le builder "thenable" — `await buildListQuery(...).limit(...)`
  // (CommunitiesTab.jsx/EventsTab.jsx) appelle .then() dessus directement,
  // sans jamais construire de vraie Promise ailleurs.
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder()),
    channel: vi.fn(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import SocialShell from "./SocialShell";

function setup() {
  const props = {
    currentUser: null,
    setView: vi.fn(),
    handleSignOut: vi.fn(),
  };
  const utils = render(<SocialShell {...props} />);
  return { props, ...utils };
}

// Le sous-onglet "Communautés" du Fil (FEED_TABS dans FeedTab.jsx —
// feedTab/setFeedTab, un state totalement distinct de tab/goTab) porte le
// même intitulé exact que le lien "Communautés" du menu profil : sans ce
// scope, getByRole("button", { name: "Communautés" }) trouve les deux et
// échoue. Le conteneur ciblé ici est le même <div ref={menuRef}> qui
// enveloppe à la fois le bouton déclencheur "Menu du profil" et le menu
// déroulant (ProfileMenu) dans SocialShell.jsx — chercher DANS ce conteneur
// garantit de cliquer sur le vrai lien de navigation (goTab), jamais sur le
// sous-onglet du Fil.
async function openProfileMenuAndClick(user, label) {
  const trigger = screen.getByRole("button", { name: "Menu du profil" });
  await user.click(trigger);
  await user.click(within(trigger.parentElement).getByRole("button", { name: label }));
}

// Même précaution pour la barre de navigation du bas (<nav>, role
// "navigation" implicite) : "Rencontres" est AUSSI le libellé d'une pastille
// de filtre dans le panneau de notifications intégré au Fil (FeedTab.jsx,
// NOTIF_CATEGORIES) — un bouton "Rencontres" existe donc à la fois dans la
// nav du bas et dans le corps du Fil pendant qu'il est affiché. Scoper à
// <nav> garantit de cliquer sur le vrai onglet (goTab), jamais le filtre.
function bottomNavButton(label) {
  return within(screen.getByRole("navigation")).getByRole("button", { name: label });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Repart d'un historique propre à chaque test — pushBackEntry (module-scope,
  // voir useEscapeKey.js) pousse de vraies entrées d'historique ; sans ce
  // nettoyage, les entrées poussées par un test précédent resteraient dans
  // l'historique jsdom réel et pourraient décaler les popstate simulés
  // suivants.
  window.history.replaceState(null, "");
});

describe("SocialShell — navigation par historique (goTab/goBack réels)", () => {
  it("un popstate simulé après un changement d'onglet (menu → Communautés) restaure l'onglet précédent (Fil)", async () => {
    const user = userEvent.setup();
    setup();

    // Écran de départ : Fil (tab initial par défaut).
    expect(bottomNavButton("Découverte")).toBeInTheDocument();

    // Ouvre le menu profil puis clique "Communautés" — exactement le chemin
    // réel (ProfileMenu reçoit le VRAI goTab de SocialShell, pas un mock, voir
    // ProfileMenu.dom.test.jsx pour la couverture du composant seul).
    await openProfileMenuAndClick(user, "Communautés");

    // L'onglet Communautés (chargé à la demande) doit maintenant être affiché.
    await waitFor(() => {
      expect(screen.getByText("🌍 Communautés Baobab")).toBeInTheDocument();
    });

    // Bouton/geste "retour" mobile : popstate simulé.
    window.dispatchEvent(new PopStateEvent("popstate"));

    // Doit revenir au Fil (écran précédent), pas rester sur Communautés ni
    // sauter ailleurs.
    await waitFor(() => {
      expect(screen.queryByText("🌍 Communautés Baobab")).not.toBeInTheDocument();
    });
    expect(bottomNavButton("Découverte")).toBeInTheDocument();
  });

  it("3 changements d'onglet rapides (Fil → Rencontres → Communautés) puis un seul retour ramène à Rencontres, pas au Fil", async () => {
    // Reproduit le scénario tracé par lecture de code dans le rapport de
    // l'audit : chaque appel à goTab() capture sa PROPRE variable `prevTab`
    // (une déclaration `const` locale à cet appel, donc un nouveau binding à
    // chaque clic — pas de partage de closure entre les deux pushes). Un seul
    // retour matériel doit donc remonter d'UN SEUL niveau (vers l'onglet
    // intermédiaire), jamais directement à l'écran de départ.
    const user = userEvent.setup();
    setup();

    await user.click(bottomNavButton("Rencontres"));
    await waitFor(() => expect(screen.getByText("Découvrir")).toBeInTheDocument());

    await openProfileMenuAndClick(user, "Communautés");
    await waitFor(() => expect(screen.getByText("🌍 Communautés Baobab")).toBeInTheDocument());

    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => {
      expect(screen.queryByText("🌍 Communautés Baobab")).not.toBeInTheDocument();
    });
    // Retombe sur Rencontres (l'onglet intermédiaire), pas sur le Fil.
    expect(screen.getByText("Découvrir")).toBeInTheDocument();
  });

  it("le bouton \"Retour\" visible dans Communautés (onBack=goBack) consomme la même entrée d'historique que le popstate", async () => {
    const user = userEvent.setup();
    setup();

    await openProfileMenuAndClick(user, "Communautés");
    await waitFor(() => expect(screen.getByText("🌍 Communautés Baobab")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Retour" }));

    await waitFor(() => {
      expect(screen.queryByText("🌍 Communautés Baobab")).not.toBeInTheDocument();
    });
    expect(bottomNavButton("Découverte")).toBeInTheDocument();

    // Un popstate qui suit une fermeture déjà programmatique (clic sur le
    // bouton visible) ne doit rien refermer d'autre — l'entrée d'historique a
    // déjà été consommée par goBack()/release() (voir pushBackEntry). Si ce
    // n'était pas le cas, ce popstate retomberait sur une entrée fantôme
    // d'une autre modale/onglet et changerait l'écran de façon inattendue.
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(bottomNavButton("Découverte")).toBeInTheDocument();
  });
});
