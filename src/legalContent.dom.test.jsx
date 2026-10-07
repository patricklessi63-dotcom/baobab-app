import React from "react";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen } from "@testing-library/react";
import { PrivacyPolicyContent, TermsOfServiceContent, LAST_UPDATE, RETENTION } from "./legalContent";
import ContactInfo from "./components/ContactInfo";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

describe("textes légaux — exactitude vis-à-vis du code", () => {
  it("la date « Dernière mise à jour » est une date française valide et s'affiche sur les deux textes", () => {
    expect(LAST_UPDATE).toMatch(/^\d{1,2}(er)? (janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre) \d{4}$/);
    const { unmount } = render(<PrivacyPolicyContent />);
    expect(screen.getByText(`Dernière mise à jour : ${LAST_UPDATE}`)).toBeInTheDocument();
    unmount();
    render(<TermsOfServiceContent />);
    expect(screen.getByText(`Dernière mise à jour : ${LAST_UPDATE}`)).toBeInTheDocument();
  });

  it("les durées annoncées sont celles du code et du SQL", () => {
    expect(read("supabase-stories-expiration.sql")).toContain(`interval '${RETENTION.storiesHours} hours'`);
    expect(read("supabase-cleanup-old-notifications.sql")).toContain(`interval '${RETENTION.notificationsDays} days'`);
    expect(read("supabase-client-errors.sql")).toContain(`interval '${RETENTION.clientErrorsDays} days'`);
    expect(read("src/components/AccountDeletionBanner.jsx")).toContain(`GRACE_HOURS = ${RETENTION.deletionGraceHours}`);
    expect(read("supabase/functions/process-scheduled-deletions/index.ts")).toContain(`Date.now() - ${RETENTION.deletionGraceHours} * 60 * 60 * 1000`);
  });

  it("la politique de confidentialité décrit les données réellement collectées et les prestataires", () => {
    render(<PrivacyPolicyContent />);
    const text = document.body.textContent;
    for (const word of ["Localisation approximative", "jeton de notification", "messages vocaux", "Stripe", "Anthropic", "Supabase", "Vercel", "Firebase Cloud Messaging", "Apple Push Notification service", "rapports d'erreurs techniques", "carnet d'adresses"]) {
      expect(text).toContain(word);
    }
    expect(text).toContain(`${RETENTION.storiesHours} heures`);
    expect(text).toContain(`${RETENTION.notificationsDays} jours`);
  });

  it("les conditions contiennent la tolérance zéro, le signalement/blocage et le chemin de suppression", () => {
    render(<TermsOfServiceContent />);
    const text = document.body.textContent;
    expect(text).toContain("tolérance zéro");
    expect(text).toContain("Signaler");
    expect(text).toContain("bloquer un membre");
    expect(text).toContain("Supprimer mon compte");
    // Aucun engagement chiffré de délai de modération : « vise », « sans que ce délai constitue un engagement ».
    expect(text).toContain("sans que ce délai constitue un engagement");
  });

  it("sans adresse configurée : aucune adresse inventée, renvoi vers le formulaire de signalement de l'application", () => {
    render(<ContactInfo email="" />);
    expect(screen.getByTestId("contact-info").textContent).toContain("formulaire de signalement dans l'application");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("avec une adresse configurée : lien mailto", () => {
    render(<ContactInfo email="aide@example.org" subject="Baobab — test" />);
    const link = screen.getByRole("link", { name: "aide@example.org" });
    expect(link.getAttribute("href")).toBe("mailto:aide@example.org?subject=Baobab%20%E2%80%94%20test");
  });
});
