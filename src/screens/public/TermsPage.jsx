import React from "react";
import PublicPageShell from "./PublicPageShell";
import { TermsOfServiceContent } from "../../legalContent";

export default function TermsPage({ navigate }) {
  return (
    <PublicPageShell title="Conditions d'utilisation" navigate={navigate}>
      <TermsOfServiceContent />
    </PublicPageShell>
  );
}
