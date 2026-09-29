import React, { useState } from "react";
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppModals from "./AppModals";

// Bug corrigé à l'audit clavier/focus trap : les modales "Comptes bloqués",
// "Politique de confidentialité", "Conditions d'utilisation" et "À propos"
// de ce fichier portent déjà role="dialog"/aria-modal="true" et se ferment
// sur Échap (useEscapeKey), mais n'avaient jamais reçu useFocusTrap —
// contrairement à la modale "Paramètres" juste au-dessus dans le même
// fichier. Le commit d'origine (6ed69d6, "Ajoute le piège de focus clavier
// aux modales principales") n'avait branché useFocusTrap que sur les 5
// modales les plus utilisées de l'app et laissait explicitement les
// "~23 autres" au même correctif pour un passage ultérieur — ces 4-ci ont
// été oubliées de ce rattrapage. Sans le correctif : Tab depuis le dernier
// élément focusable (bouton "Fermer") sortait de la modale vers la page
// cachée derrière l'overlay, et fermer via Échap ne rendait jamais le focus
// à l'élément déclencheur.
//
// Un seul test représentatif ("À propos", qui a deux boutons focusables et
// peut s'ouvrir/se fermer par prop sans dépendre de la navigation interne
// Paramètres → sous-modale) : les 3 autres suivent exactement le même motif
// JSX (ref + tabIndex={-1} + useFocusTrap), déjà exercé par
// AppModals.about.dom.test.jsx pour le rendu de cette même modale.

vi.mock("../lib/version", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, checkForUpdate: vi.fn() };
});

function noop() {}

// Bouton externe qui reste monté pendant toute la vie du test — simule un
// déclencheur réaliste (dans l'app réelle, "À propos" s'ouvre depuis un
// bouton de la modale Paramètres, mais l'essentiel ici est de vérifier que
// useFocusTrap restaure bien le focus sur l'élément qui l'avait avant
// l'ouverture, pas de reproduire toute la navigation interne Paramètres).
function Harness() {
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <>
      <button onClick={() => setAboutOpen(true)}>Ouvrir À propos</button>
      <AppModals
        reportTarget={null}
        setReportTarget={noop}
        reportReason=""
        setReportReason={noop}
        reportCategory=""
        setReportCategory={noop}
        reportSending={false}
        reportSubmitted={false}
        submitReport={noop}
        cancelReport={noop}
        dismissReportAfterSubmit={noop}
        blockTarget={null}
        setBlockTarget={noop}
        confirmBlock={noop}
        unmatchTarget={null}
        setUnmatchTarget={noop}
        confirmUnmatch={noop}
        settingsOpen={false}
        setSettingsOpen={noop}
        currentUser={null}
        onToggleOnlineStatus={noop}
        onToggleDating={noop}
        onToggleField={noop}
        onUpdateNotificationPreference={noop}
        privacyOpen={false}
        setPrivacyOpen={noop}
        termsOpen={false}
        setTermsOpen={noop}
        aboutOpen={aboutOpen}
        setAboutOpen={setAboutOpen}
        myLocation={null}
        onEnableLocation={noop}
        onDisableLocation={noop}
        onUpdateLocationPref={noop}
      />
    </>
  );
}

describe("AppModals — piège à focus clavier de la modale À propos (et modales sœurs identiques)", () => {
  // jsdom ne calcule aucune mise en page : `offsetParent` vaut toujours
  // `null`, y compris pour un élément visible et monté. Le filtre
  // anti-éléments-masqués de useFocusTrap.js (`el.offsetParent !== null`)
  // exclurait donc TOUS les focusables ici — pas seulement les cachés —
  // rendant le bouclage Tab/Maj+Tab invérifiable sans ce correctif de test.
  // On restaure la relation parent/enfant réelle (jamais nulle pour un nœud
  // monté), suffisante pour ce test qui ne cherche pas à vérifier
  // l'exclusion des éléments masqués elle-même.
  let offsetParentDescriptor;
  beforeAll(() => {
    offsetParentDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
      configurable: true,
      get() {
        return this.parentNode;
      },
    });
  });
  afterAll(() => {
    if (offsetParentDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "offsetParent", offsetParentDescriptor);
    }
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("déplace le focus dans la modale à l'ouverture, boucle Tab/Maj+Tab, et restaure le focus au déclencheur à la fermeture", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const openButton = screen.getByRole("button", { name: "Ouvrir À propos" });
    await user.click(openButton);

    const dialog = await screen.findByRole("dialog", { name: "À propos" });
    const firstButton = screen.getByRole("button", { name: "Rechercher une mise à jour" });
    const lastButton = screen.getByRole("button", { name: "Fermer" });

    // Ouverture : le focus doit se déplacer dans la modale (premier élément
    // focusable), jamais rester sur le bouton d'arrière-plan.
    await waitFor(() => expect(firstButton).toHaveFocus());

    // Maj+Tab depuis le premier élément boucle vers le dernier (piège actif).
    await user.tab({ shift: true });
    expect(lastButton).toHaveFocus();

    // Tab depuis le dernier élément boucle vers le premier — ne sort jamais
    // de la modale vers `openButton`, resté caché derrière l'overlay.
    await user.tab();
    expect(firstButton).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);

    // Fermeture (Échap) : le focus doit revenir au bouton déclencheur, pas à
    // <body>.
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "À propos" })).not.toBeInTheDocument();
    });
    await waitFor(() => expect(openButton).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });
});
