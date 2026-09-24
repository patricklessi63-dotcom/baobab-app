import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppModals from "./AppModals";

// Audit affichage releaseNotes (item 19 "mise à jour" — bannière/modale) :
// avant ce correctif, la modale "À propos" (bouton "Rechercher une mise à
// jour") rendait la liste COMPLÈTE de releaseNotes (pas de troncature comme
// dans UpdateNotice.jsx) sans jamais poser maxHeight/overflowY sur sa carte —
// contrairement aux modales confidentialité/CGU du même fichier qui, elles,
// avaient déjà ce garde-fou. Avec 0-1 item (seule vraie mise à jour vécue en
// prod avant 1.1.0), ça ne débordait jamais. Avec les 6 items réels de la
// 1.1.0, la carte (ancrée en bas sur mobile, sans scroll possible) peut
// pousser le bouton "Fermer" hors écran. Ce test verrouille : (1) tous les
// items s'affichent bien en liste, (2) la carte a bien un plafond de hauteur
// scrollable.

vi.mock("../lib/version", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, checkForUpdate: vi.fn() };
});

import { checkForUpdate } from "../lib/version";

const SIX_NOTES = [
  "Messagerie : nouvel indicateur « distribué » entre envoyé et lu",
  "Notifications push étendues aux nouveaux likes et abonnés",
  "Le bouton retour du téléphone fonctionne écran par écran",
  "Réception des invitations à un événement (accepter/refuser)",
  "Recherche insensible aux accents dans les messages",
  "Corrections de bugs de fiabilité et de confidentialité",
];

function noop() {}

function renderAboutModal() {
  return render(
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
      aboutOpen={true}
      setAboutOpen={noop}
      myLocation={null}
      onEnableLocation={noop}
      onDisableLocation={noop}
      onUpdateLocationPref={noop}
    />
  );
}

describe("AppModals — modale À propos / vérification de mise à jour", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("affiche les 6 notes de version en liste et garde la carte scrollable (pas de débordement mobile)", async () => {
    checkForUpdate.mockResolvedValue({
      ok: true,
      mandatory: false,
      recommended: true,
      info: { latestVersion: "1.1.0", releaseNotes: SIX_NOTES },
    });
    const user = userEvent.setup();
    renderAboutModal();

    await user.click(screen.getByRole("button", { name: "Rechercher une mise à jour" }));

    expect(await screen.findByText("Baobab 1.1.0 est disponible")).toBeInTheDocument();
    // Chaque <li> est rendu "• {note}" (puce + note en nœuds de texte
    // distincts) : on vérifie le textContent plutôt qu'un match exact.
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    for (const note of SIX_NOTES) {
      expect(items.some((text) => text.includes(note))).toBe(true);
    }

    // La carte doit rester scrollable (regression guard) : sans ça, une
    // longue liste de releaseNotes pousse le bouton "Fermer" hors écran sur
    // mobile, comme les modales confidentialité/CGU voisines le préviennent
    // déjà via le même style.
    const dialog = screen.getByRole("dialog", { name: "À propos" });
    const card = dialog.firstElementChild;
    expect(card.style.maxHeight).toBe("80vh");
    expect(card.style.overflowY).toBe("auto");

    // Le bouton "Fermer" doit rester atteignable (présent dans le DOM, dans
    // la même carte scrollable).
    expect(within(dialog).getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });

  it("ne plante pas si releaseNotes est absent (app-version.json mal formé)", async () => {
    checkForUpdate.mockResolvedValue({
      ok: true,
      mandatory: false,
      recommended: true,
      info: { latestVersion: "1.1.0" },
    });
    const user = userEvent.setup();
    renderAboutModal();

    await user.click(screen.getByRole("button", { name: "Rechercher une mise à jour" }));

    expect(await screen.findByText("Baobab 1.1.0 est disponible")).toBeInTheDocument();
  });
});
