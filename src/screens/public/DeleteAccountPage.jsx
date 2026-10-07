import React from "react";
import PublicPageShell from "./PublicPageShell";
import ContactInfo from "../../components/ContactInfo";
import { LegalSection as Section, RETENTION } from "../../legalContent";

// Page publique de demande de suppression de compte (/suppression-compte).
// Exigée par Google Play (fiche « Sécurité des données » : URL web où demander la
// suppression du compte et des données, accessible sans réinstaller l'application)
// et utile à Apple (5.1.1(v)) : la suppression se fait DANS l'application, sans
// contacter le support. Le chemin décrit ci-dessous est le chemin RÉEL :
// ProfileMenu.jsx (« Réglages ») -> AppModals.jsx (« Zone de danger » ->
// « Supprimer mon compte ») -> DeleteAccountModal.jsx (saisir SUPPRIMER). Le test
// DeleteAccountPage.dom.test.jsx vérifie ces libellés dans le code source.
export default function DeleteAccountPage({ navigate }) {
  return (
    <PublicPageShell title="Supprimer mon compte Baobab" navigate={navigate}>
      <p>
        Cette page explique comment supprimer votre compte <strong>Baobab</strong> et les données associées. La suppression se fait
        directement dans l'application, sans avoir à contacter personne.
      </p>

      <div className="mt-5" />

      <Section title="Depuis l'application Baobab">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>Ouvrez Baobab et connectez-vous à votre compte.</li>
          <li>Touchez votre photo de profil (en haut à droite), puis <strong>Réglages</strong>.</li>
          <li>Descendez jusqu'à la <strong>Zone de danger</strong> et touchez <strong>Supprimer mon compte</strong>.</li>
          <li>Tapez <strong>SUPPRIMER</strong> pour confirmer, puis touchez <strong>Programmer la suppression dans {RETENTION.deletionGraceHours} heures</strong>.</li>
        </ol>
        <p>
          Vous ne pouvez plus ouvrir l'application ou vous avez oublié votre mot de passe ? Sur la page de connexion, utilisez
          « Mot de passe oublié » pour retrouver l'accès à votre compte, puis suivez les étapes ci-dessus.
        </p>
      </Section>

      <Section title="Délai et annulation">
        <p>
          La suppression est effective {RETENTION.deletionGraceHours} heures après votre demande. Pendant ce délai, votre compte reste
          utilisable et un bandeau en haut de l'écran vous permet de <strong>annuler la suppression</strong> d'un geste. Passé ce
          délai, la suppression est définitive et ne peut pas être annulée.
        </p>
      </Section>

      <Section title="Ce qui est supprimé">
        <p>• Votre compte de connexion (adresse e-mail et mot de passe) et votre profil.</p>
        <p>• Vos photos de profil, vos statuts, vos publications, commentaires et leurs photos ou vidéos.</p>
        <p>• Les messages que vous avez envoyés, avec leurs images, vidéos, messages vocaux et fichiers.</p>
        <p>• Vos likes, favoris, personnes suivies, blocages, invitations, participations, demandes d'adhésion et réglages.</p>
        <p>• Votre position approximative, vos préférences de notification et les jetons de notification de vos appareils.</p>
        <p>• Votre abonnement Premium, qui est résilié, s'il y en a un.</p>
      </Section>

      <Section title="Ce qui peut subsister">
        <p>
          • Les messages que d'autres personnes vous ont écrits restent la propriété de leurs auteurs.
          <br />• Les communautés et événements que vous avez créés continuent d'exister pour leurs membres, sans votre nom.
          <br />• Des copies peuvent subsister temporairement dans les sauvegardes de nos prestataires, et certaines données (par
          exemple de paiement chez notre prestataire de paiement) peuvent être conservées aussi longtemps qu'une obligation légale
          l'exige.
        </p>
      </Section>

      <Section title="Besoin d'aide ?">
        <ContactInfo subject="Baobab — suppression de compte" />
        <p>
          Plus de détails dans notre{" "}
          <button type="button" onClick={() => navigate("/confidentialite")} className="underline font-semibold" style={{ color: "#D9A441" }}>
            politique de confidentialité
          </button>
          .
        </p>
      </Section>
    </PublicPageShell>
  );
}
