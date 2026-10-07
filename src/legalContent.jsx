import React from "react";
import ContactInfo from "./components/ContactInfo";
import { OPERATOR_NAME } from "./lib/contact";

// Contenu juridique de Baobab.
// Rédigé pour s'aligner sur les standards internationaux courants en matière de
// protection des données (RGPD européen, LPRPDE / PIPEDA canadienne, principes CCPA)
// et sur les clauses habituelles des conditions d'utilisation d'une application sociale.
// À faire réviser par un juriste avant une mise en production commerciale.
//
// Mise à jour du 7 octobre 2026 (préparation des boutiques d'applications) : le texte
// décrit désormais ce que l'application collecte RÉELLEMENT (voir STORES.md, §1 :
// inventaire des données, avec les fichiers sources). Aucune information juridique
// n'est inventée : l'identité de l'exploitant et l'adresse de contact viennent de
// src/config/contact.json (vides tant que le propriétaire ne les a pas renseignées),
// et les durées ci-dessous sont celles qu'on lit dans le code / le SQL.
// Quand le texte change, mettre à jour LAST_UPDATE (un test vérifie son format).

export const LAST_UPDATE = "7 octobre 2026";

// Durées réellement appliquées par le code / le SQL (le test legalContent.test.jsx
// les recoupe avec les fichiers sources — ne les changer qu'avec eux) :
//  - statuts (stories) : supabase-stories-expiration.sql (expires_at = created_at + 24 h)
//  - suppression de compte : DeleteAccountModal.jsx / process-scheduled-deletions (24 h)
//  - notifications : supabase-cleanup-old-notifications.sql (90 jours)
//  - rapports d'erreurs techniques : supabase-client-errors.sql (30 jours)
export const RETENTION = { storiesHours: 24, deletionGraceHours: 24, notificationsDays: 90, clientErrorsDays: 30 };

export function LegalSection({ title, children }) {
  return (
    <div className="mb-5">
      <h2 className="text-[13px] font-bold mb-1.5" style={{ color: "#F2E9DC" }}>{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function PrivacyPolicyContent() {
  return (
    <div>
      <p className="mb-4 opacity-70">Dernière mise à jour : {LAST_UPDATE}</p>

      <LegalSection title="1. Qui nous sommes">
        <p>Baobab est une application communautaire qui met en relation des personnes immigrantes installées au Canada. Le responsable du traitement des données est l'exploitant de Baobab{OPERATOR_NAME ? <> ({OPERATOR_NAME})</> : null}.</p>
        <ContactInfo />
      </LegalSection>

      <LegalSection title="2. Données que nous collectons">
        <p>Nous collectons uniquement les données nécessaires au fonctionnement du service :</p>
        <p>• Compte : adresse email et mot de passe (conservé sous forme hachée par notre service d'authentification, jamais en clair), indicateur d'email vérifié.</p>
        <p>• Profil : prénom et nom, date de naissance (l'âge est calculé ; vous pouvez masquer l'année), pays d'origine, langues, ville et province, parcours au Canada (date d'arrivée, statut, études, profession, projet), ce que vous recherchez, centres d'intérêt, préférences de rencontre que vous choisissez de renseigner, biographie, photos de profil. Nous ne vous demandons ni votre genre ni votre orientation.</p>
        <p>• Localisation approximative : si vous l'autorisez dans votre téléphone ou votre navigateur, votre position est arrondie (environ 1 km) et enregistrée avec votre ville, votre région et votre pays. Elle est demandée à l'inscription (le service de rencontres est réservé au Canada) et sert à vérifier l'accès, à proposer des personnes et des événements proches et à calculer une distance ; les autres membres ne voient jamais vos coordonnées, seulement une distance si vos réglages le permettent. Vous pouvez la désactiver dans les réglages de localisation.</p>
        <p>• Ce que vous publiez : publications, statuts (stories), commentaires, messages échangés avec d'autres membres, photos, vidéos, messages vocaux et fichiers joints, communautés et événements que vous créez ou rejoignez, signalements et blocages.</p>
        <p>• Notifications : si vous les activez, un identifiant technique de votre appareil (jeton de notification) et vos préférences de notification.</p>
        <p>• Paiement : lorsque l'abonnement Premium est proposé, le paiement est traité par Stripe ; nous ne recevons ni ne conservons votre numéro de carte, seulement un identifiant client Stripe, la formule choisie et l'état de l'abonnement.</p>
        <p>• Données techniques et d'usage : adresse IP, type d'appareil et journaux de connexion (sécurité, prévention de la fraude), rapports d'erreurs techniques (message d'erreur, page, version de l'application), et quelques événements d'usage rattachés à votre compte (par exemple écrans consultés, actions clés) pour améliorer l'application. Nous n'utilisons aucun outil publicitaire ni de suivi à des fins de publicité.</p>
        <p>• Ce que nous ne collectons pas : votre carnet d'adresses, votre galerie de photos complète (vous choisissez vous-même les fichiers à envoyer) ni votre position précise. Le micro et l'appareil photo ne sont utilisés que lorsque vous enregistrez un message vocal ou prenez une photo.</p>
        <p>• Stockage sur votre appareil : votre session, votre thème d'affichage et quelques préférences sont enregistrés localement sur votre appareil ; nous n'utilisons pas de cookie publicitaire.</p>
      </LegalSection>

      <LegalSection title="3. Finalités et base légale du traitement">
        <p>Nous traitons vos données pour : fournir le service de mise en relation (exécution du contrat qui nous lie à vous), assurer la sécurité de la plateforme, modérer les contenus signalés et prévenir les abus (intérêt légitime), envoyer les notifications que vous avez activées, traiter votre abonnement Premium si vous en souscrivez un, et, lorsque la loi l'exige, sur la base de votre consentement explicite (par exemple pour la localisation ou des communications marketing facultatives).</p>
      </LegalSection>

      <LegalSection title="4. Partage des données">
        <p>Vos informations de profil (à l'exception de votre email et mot de passe) sont visibles par les autres membres de la communauté, dans la mesure nécessaire au fonctionnement d'une application de mise en relation et selon les réglages de confidentialité de vos champs. Nous ne vendons jamais vos données personnelles à des tiers.</p>
        <p>Nous faisons appel à des prestataires techniques qui traitent des données pour notre compte : Supabase (base de données, authentification, stockage des fichiers et fonctions serveur), Vercel (hébergement du site web), Google Firebase Cloud Messaging et Apple Push Notification service (acheminement des notifications sur Android et iOS), Stripe (paiement de l'abonnement Premium) et Anthropic (fonctionnalités d'intelligence artificielle facultatives, voir la section 11). Ils ne reçoivent que les données nécessaires à leur mission.</p>
      </LegalSection>

      <LegalSection title="5. Conservation des données">
        <p>Vos données sont conservées tant que votre compte est actif. Certaines données sont supprimées plus tôt : les statuts (stories) disparaissent après {RETENTION.storiesHours} heures, les notifications sont supprimées après {RETENTION.notificationsDays} jours et les rapports d'erreurs techniques après {RETENTION.clientErrorsDays} jours.</p>
        <p>Vous pouvez supprimer votre compte à tout moment depuis l'application (menu du profil, Réglages, Supprimer mon compte) ou depuis la page « Suppression de compte » de notre site. La suppression est programmée avec un délai de {RETENTION.deletionGraceHours} heures pendant lequel vous pouvez l'annuler ; passé ce délai, votre profil, vos photos et médias, vos publications, commentaires, messages envoyés, abonnements, jetons de notification et vos réglages sont effacés. Les messages que vous avez envoyés sont supprimés (y compris pour leurs destinataires) ; ceux que d'autres personnes vous ont écrits restent la propriété de leurs auteurs. Des copies peuvent subsister temporairement dans les sauvegardes de nos prestataires ou être conservées plus longtemps lorsqu'une obligation légale l'exige.</p>
      </LegalSection>

      <LegalSection title="6. Vos droits">
        <p>Conformément au Règlement général sur la protection des données (RGPD) pour les résidents de l'Union européenne, et à la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE/PIPEDA) pour les résidents du Canada, vous disposez des droits suivants :</p>
        <p>• Droit d'accès à vos données personnelles.</p>
        <p>• Droit de rectification des données inexactes.</p>
        <p>• Droit à l'effacement (« droit à l'oubli »).</p>
        <p>• Droit à la portabilité de vos données.</p>
        <p>• Droit d'opposition et de limitation du traitement.</p>
        <p>• Droit de retirer votre consentement à tout moment.</p>
        <p>Vous pouvez exercer ces droits directement depuis l'application (modification du profil, « Exporter mes données » et « Supprimer mon compte » dans les Réglages), ou en nous contactant.</p>
      </LegalSection>

      <LegalSection title="7. Sécurité">
        <p>Nous mettons en œuvre des mesures techniques et organisationnelles raisonnables (chiffrement des échanges en transit, hachage des mots de passe, contrôle d'accès par compte, règles de sécurité au niveau de la base de données) pour protéger vos données contre l'accès non autorisé, la perte ou l'altération.</p>
      </LegalSection>

      <LegalSection title="8. Mineurs">
        <p>Baobab est réservé aux personnes âgées de 18 ans et plus. Nous ne collectons pas sciemment de données concernant des personnes mineures. Si vous pensez qu'un compte appartient à une personne mineure, signalez-le avec le motif « Mineur suspecté » : ces signalements sont traités en priorité.</p>
      </LegalSection>

      <LegalSection title="9. Transferts internationaux">
        <p>Vos données peuvent être hébergées sur des serveurs situés dans différents pays. Lorsque c'est le cas, nous veillons à ce que des garanties appropriées soient en place, conformément aux exigences applicables en matière de transferts internationaux de données.</p>
      </LegalSection>

      <LegalSection title="10. Modifications de cette politique">
        <p>Cette politique peut être mise à jour périodiquement. Toute modification substantielle vous sera communiquée dans l'application avant son entrée en vigueur.</p>
      </LegalSection>

      <LegalSection title="11. Fonctionnalités assistées par intelligence artificielle">
        <p>Baobab propose des fonctionnalités facultatives assistées par IA (amorces de conversation, aide à la reformulation, traduction, suggestions de rédaction). Ces fonctionnalités sont désactivables à tout moment dans Réglages → Confidentialité des champs → Suggestions IA.</p>
        <p>Lorsque vous en utilisez une, le texte concerné est envoyé à notre fournisseur d'IA, Anthropic, uniquement pour générer la suggestion demandée : votre biographie, le texte d'une publication, le titre et la description d'un événement, l'idée d'une communauté que vous décrivez, un seul message à traduire ou à reformuler, ou, pour les amorces de conversation, le prénom, la ville et les centres d'intérêt de deux personnes qui ont matché. Jamais l'historique complet d'une conversation n'est transmis, et rien n'est envoyé sans une action de votre part.</p>
        <p>Baobab n'utilise jamais le contenu de vos conversations privées pour entraîner un modèle d'IA, et ne le transmet à Anthropic que dans les cas décrits ci-dessus, à votre demande, pour générer la suggestion demandée.</p>
      </LegalSection>

      <LegalSection title="12. Contact">
        <p>Pour toute question relative à vos données personnelles ou pour exercer vos droits, contactez-nous. Vous disposez également du droit de déposer une plainte auprès de l'autorité de protection des données compétente (par exemple le Commissariat à la protection de la vie privée du Canada, ou la CNIL en France).</p>
        <ContactInfo subject="Baobab — données personnelles" />
      </LegalSection>
    </div>
  );
}

export function TermsOfServiceContent() {
  return (
    <div>
      <p className="mb-4 opacity-70">Dernière mise à jour : {LAST_UPDATE}</p>

      <LegalSection title="1. Acceptation des conditions">
        <p>En créant un compte sur Baobab, vous acceptez d'être lié par les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser l'application.</p>
      </LegalSection>

      <LegalSection title="2. Éligibilité">
        <p>Vous devez avoir au moins 18 ans pour créer un compte sur Baobab. En vous inscrivant, vous confirmez avoir l'âge légal requis et la capacité juridique de conclure ce contrat. Le service de rencontres est réservé aux personnes se trouvant au Canada.</p>
      </LegalSection>

      <LegalSection title="3. Votre compte">
        <p>Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité effectuée depuis votre compte. Vous vous engagez à fournir des informations exactes et à jour, et à ne pas créer de faux profil ou usurper l'identité d'un tiers.</p>
      </LegalSection>

      <LegalSection title="4. Règles de conduite">
        <p>En utilisant Baobab, vous acceptez de ne pas :</p>
        <p>• Publier du contenu haineux, discriminatoire, harcelant, violent ou à caractère sexuel explicite.</p>
        <p>• Publier ou rechercher du contenu qui sexualise, expose ou met en danger des personnes mineures, ou entrer en contact avec une personne que vous savez mineure.</p>
        <p>• Usurper l'identité d'une autre personne ou créer un profil trompeur.</p>
        <p>• Utiliser l'application à des fins commerciales non autorisées, de sollicitation, d'arnaque ou de spam, ni demander de l'argent ou des informations financières à d'autres membres.</p>
        <p>• Tenter de contourner les mesures de sécurité ou d'accéder aux données d'autres membres sans autorisation.</p>
        <p>• Harceler ou menacer d'autres membres, y compris en dehors de l'application.</p>
        <p>Tout manquement à ces règles peut entraîner la suspension ou la suppression de votre compte, avec ou sans préavis.</p>
      </LegalSection>

      <LegalSection title="5. Contenu publié par les utilisateurs">
        <p>Vous conservez la propriété du contenu que vous publiez (publications, photos, messages). En le publiant, vous accordez à Baobab une licence non exclusive, limitée à l'affichage de ce contenu dans l'application aux autres membres, dans le cadre normal du service. Vous êtes seul responsable du contenu que vous publiez.</p>
      </LegalSection>

      <LegalSection title="6. Nature du service et absence de garantie de résultat">
        <p>Baobab est une plateforme de mise en relation. Nous ne garantissons pas que vous trouverez une relation amoureuse, amicale ou autre grâce à l'application, et nous ne sommes pas responsables des interactions entre membres, en ligne ou lors de rencontres en personne.</p>
      </LegalSection>

      <LegalSection title="7. Sécurité personnelle">
        <p>Nous encourageons vivement la prudence lors de toute rencontre avec une personne connue via l'application : privilégiez un premier rendez-vous dans un lieu public, informez un proche de vos plans, et ne partagez jamais d'informations financières ou sensibles avec une personne que vous ne connaissez pas encore en confiance.</p>
      </LegalSection>

      <LegalSection title="8. Signalement, blocage et modération">
        <p>Baobab applique une politique de tolérance zéro envers le contenu répréhensible et les comportements abusifs (haine, harcèlement, menaces, contenu sexuel explicite, exploitation ou mise en danger de personnes mineures, arnaques, usurpation d'identité).</p>
        <p>Vous pouvez signaler un profil, un message, une publication, un commentaire, un statut, une communauté, un événement ou une photo d'événement, en quelques touches, avec le bouton « Signaler » ou le menu de l'élément concerné. Vous pouvez aussi bloquer un membre : cette personne ne peut plus vous écrire ni voir votre profil, et vous ne voyez plus ses contenus.</p>
        <p>Notre équipe examine les signalements, en traitant en priorité ceux qui concernent une personne mineure suspectée et les arnaques. Nous visons à traiter les signalements dans un délai d'environ 24 heures, sans que ce délai constitue un engagement. Nous pouvons retirer un contenu, suspendre ou supprimer tout compte à notre discrétion raisonnable, avec ou sans préavis, et conserver les informations nécessaires pour faire respecter ces conditions ou répondre à une obligation légale.</p>
      </LegalSection>

      <LegalSection title="9. Abonnement Premium">
        <p>Baobab propose un abonnement Premium facultatif, qui donne accès à des fonctionnalités supplémentaires. Avant toute souscription, le prix, la périodicité, les conditions de renouvellement et d'annulation vous sont présentés. Le paiement est traité par notre prestataire de paiement et l'abonnement peut être géré ou annulé depuis votre compte. Les conditions de paiement, de remboursement et d'annulation applicables à un achat effectué depuis une boutique d'applications peuvent dépendre de celle-ci.</p>
      </LegalSection>

      <LegalSection title="10. Limitation de responsabilité">
        <p>Dans la mesure permise par la loi applicable, Baobab est fourni « tel quel », sans garantie d'aucune sorte. Nous ne pourrons être tenus responsables des dommages indirects résultant de l'utilisation de l'application ou des interactions entre membres.</p>
      </LegalSection>

      <LegalSection title="11. Résiliation et suppression du compte">
        <p>Vous pouvez supprimer votre compte à tout moment depuis l'application (menu du profil, Réglages, Supprimer mon compte) ou depuis la page « Suppression de compte » de notre site ; la suppression prend effet après un délai de {RETENTION.deletionGraceHours} heures, pendant lequel vous pouvez l'annuler. Nous pouvons suspendre ou résilier votre accès en cas de violation des présentes conditions.</p>
      </LegalSection>

      <LegalSection title="12. Droit applicable">
        <p>Les présentes conditions sont régies par les lois applicables dans la province ou le pays où le service est exploité. Tout litige sera soumis aux tribunaux compétents de cette juridiction, sous réserve des droits impératifs dont vous pourriez bénéficier en tant que consommateur dans votre pays de résidence.</p>
      </LegalSection>

      <LegalSection title="13. Modifications">
        <p>Nous pouvons modifier ces conditions à tout moment. Les modifications substantielles vous seront communiquées avant leur entrée en vigueur. La poursuite de l'utilisation de Baobab après une modification vaut acceptation des nouvelles conditions.</p>
      </LegalSection>

      <LegalSection title="14. Contact">
        <p>Pour toute question relative à ces conditions, ou pour nous signaler un contenu ou un comportement, contactez-nous.</p>
        <ContactInfo subject="Baobab — conditions d'utilisation" />
      </LegalSection>
    </div>
  );
}
