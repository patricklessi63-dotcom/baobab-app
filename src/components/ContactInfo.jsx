import React from "react";
import { SUPPORT_EMAIL } from "../lib/contact";

// Phrase de contact des pages publiques / légales. Alimentée par
// src/config/contact.json (voir lib/contact.js). Sans adresse configurée, aucune
// adresse n'est inventée : on renvoie vers les moyens qui EXISTENT dans l'app.
// `email` / `operator` permettent de tester avec d'autres valeurs que la config.
export default function ContactInfo({ subject = "", email = SUPPORT_EMAIL, className = "" }) {
  const href = email ? (subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`) : "";
  return (
    <p className={className} data-testid="contact-info">
      {email ? (
        <>
          Écrivez-nous à{" "}
          <a href={href} className="underline font-semibold" style={{ color: "#D9A441" }}>{email}</a>.
        </>
      ) : (
        <>
          Pour nous joindre, utilisez le formulaire de signalement dans l'application (bouton « Signaler » sur un profil, un message,
          une publication ou un événement) ou « Un souci, une idée ? » dans le menu de votre profil.
        </>
      )}
    </p>
  );
}
