import React from "react";
import PublicPageShell from "./PublicPageShell";
import { PrivacyPolicyContent } from "../../legalContent";

export default function PrivacyPage({ navigate }) {
  return (
    <PublicPageShell title="Politique de confidentialité" navigate={navigate}>
      <PrivacyPolicyContent />
    </PublicPageShell>
  );
}
