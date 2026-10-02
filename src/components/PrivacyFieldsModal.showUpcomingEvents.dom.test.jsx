import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PrivacyFieldsModal from "./PrivacyFieldsModal";

// Bug corrigé à l'audit de cette modale : profiles.show_upcoming_events
// (supabase-events-v2.sql) est bien lu par SocialShell.jsx pour décider
// d'afficher ou non la liste "Mes événements" dans l'onglet Profil
// (ProfileTab.jsx), mais ce réglage n'était proposé NULLE PART comme un
// choix explicite à l'utilisateur — ni dans cette modale, ni dans la modale
// Paramètres (AppModals.jsx). Un réglage câblé côté lecture sans aucun
// interrupteur côté écriture : personne ne pouvait jamais le désactiver.

describe("PrivacyFieldsModal — réglage show_upcoming_events", () => {
  it("propose un interrupteur pour \"Mes événements\", coché par défaut (profiles.show_upcoming_events par défaut true)", () => {
    render(
      <PrivacyFieldsModal
        open
        onClose={() => {}}
        currentUser={{ id: "u1" }}
        onToggleField={() => {}}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /Mes événements/ });
    expect(checkbox).toBeChecked();
  });

  it("reflète un show_upcoming_events déjà désactivé en base", () => {
    render(
      <PrivacyFieldsModal
        open
        onClose={() => {}}
        currentUser={{ id: "u1", show_upcoming_events: false }}
        onToggleField={() => {}}
      />
    );

    const checkbox = screen.getByRole("checkbox", { name: /Mes événements/ });
    expect(checkbox).not.toBeChecked();
  });

  it("appelle onToggleField(\"show_upcoming_events\", false) au clic, exactement comme les autres réglages de la modale", async () => {
    const user = userEvent.setup();
    const onToggleField = vi.fn();
    render(
      <PrivacyFieldsModal
        open
        onClose={() => {}}
        currentUser={{ id: "u1" }}
        onToggleField={onToggleField}
      />
    );

    await user.click(screen.getByRole("checkbox", { name: /Mes événements/ }));

    expect(onToggleField).toHaveBeenCalledWith("show_upcoming_events", false);
  });
});
