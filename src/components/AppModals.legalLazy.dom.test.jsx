import React from "react";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import AppModals from "./AppModals";

// Les textes légaux (~20 ko) ne servent qu'à ces deux modales et aux pages publiques :
// ils sont chargés à la demande (React.lazy) pour que le chunk principal reste sous le
// seuil d'avertissement de Vite (500 ko). Ce test verrouille (1) que les modales les
// affichent toujours une fois chargés, (2) qu'aucun import statique ne les ramène dans
// le chunk principal.

function noop() {}

function renderModals(extra) {
  return render(
    <AppModals
      reportTarget={null} setReportTarget={noop} reportReason="" setReportReason={noop}
      reportCategory="" setReportCategory={noop} reportSending={false} reportSubmitted={false}
      submitReport={noop} cancelReport={noop} dismissReportAfterSubmit={noop}
      blockTarget={null} setBlockTarget={noop} confirmBlock={noop}
      unmatchTarget={null} setUnmatchTarget={noop} confirmUnmatch={noop}
      settingsOpen={false} setSettingsOpen={noop} currentUser={null}
      onToggleOnlineStatus={noop} onToggleDating={noop} onToggleField={noop}
      onUpdateNotificationPreference={noop}
      privacyOpen={false} setPrivacyOpen={noop} termsOpen={false} setTermsOpen={noop}
      aboutOpen={false} setAboutOpen={noop}
      myLocation={null} onEnableLocation={noop} onDisableLocation={noop} onUpdateLocationPref={noop}
      {...extra}
    />
  );
}

describe("AppModals — textes légaux chargés à la demande", () => {
  it("la modale Confidentialité affiche le texte une fois chargé", async () => {
    renderModals({ privacyOpen: true });
    expect(await screen.findByText("1. Qui nous sommes", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fermer" })).toBeInTheDocument();
  });

  it("la modale Conditions affiche le texte une fois chargé", async () => {
    renderModals({ termsOpen: true });
    expect(await screen.findByText("1. Acceptation des conditions", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("AppModals n'importe pas legalContent statiquement (sinon il retombe dans le chunk principal)", () => {
    const src = readFileSync(join(process.cwd(), "src/components/AppModals.jsx"), "utf8");
    expect(src).not.toMatch(/^import[^\n]*legalContent/m);
    expect(src).toMatch(/import\("\.\.\/legalContent"\)/);
  });
});
