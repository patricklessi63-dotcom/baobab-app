import React from "react";

// Contenu juridique de Baobab.
// Rédigé pour s'aligner sur les standards internationaux courants en matière de
// protection des données (RGPD européen, LPRPDE / PIPEDA canadienne, principes CCPA)
// et sur les clauses habituelles des conditions d'utilisation d'une application sociale.
// À faire réviser par un juriste avant une mise en production commerciale.

const LAST_UPDATE = "15 août 2026";

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-[13px] font-bold mb-1.5" style={{ color: "#F2E9DC" }}>{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function PrivacyPolicyContent() {
  return (
    <div>
      <p className="mb-4 opacity-70">Dernière mise à jour : {LAST_UPDATE}</p>

      <Section title="1. Qui nous sommes">
        <p>Baobab est une application communautaire qui met en relation des personnes immigrantes installées au Canada. Le responsable du traitement des données est l'exploitant de Baobab, joignable via l'adresse de contact indiquée dans l'application.</p>
      </Section>

      <Section title="2. Données que nous collectons">
        <p>Nous collectons uniquement les données nécessaires au fonctionnement du service :</p>
        <p>• Données de compte : adresse email, mot de passe (stocké de façon chiffrée, jamais en clair).</p>
        <p>• Données de profil : nom, âge, pays d'origine, langues parlées, ville, date d'arrivée au Canada, ce que vous recherchez, biographie, centres d'intérêt, photos que vous choisissez de publier.</p>
        <p>• Contenu que vous publiez : publications, stories, messages échangés avec d'autres membres.</p>
        <p>• Données techniques : adresse IP, type d'appareil, journaux de connexion, à des fins de sécurité et de prévention de la fraude.</p>
      </Section>

      <Section title="3. Finalités et base légale du traitement">
        <p>Nous traitons vos données pour : fournir le service de mise en relation (exécution du contrat qui nous lie à vous), assurer la sécurité de la plateforme et prévenir les abus (intérêt légitime), et, lorsque la loi l'exige, sur la base de votre consentement explicite (par exemple pour des communications marketing facultatives).</p>
      </Section>

      <Section title="4. Partage des données">
        <p>Vos informations de profil (à l'exception de votre email et mot de passe) sont visibles par les autres membres de la communauté, dans la mesure nécessaire au fonctionnement d'une application de mise en relation. Nous ne vendons jamais vos données personnelles à des tiers. Nous pouvons partager des données avec des prestataires techniques (hébergement, base de données) qui agissent en notre nom et sont contractuellement tenus de protéger vos données.</p>
      </Section>

      <Section title="5. Conservation des données">
        <p>Vos données sont conservées tant que votre compte est actif. En cas de suppression de votre compte, vos données de profil et vos contenus sont supprimés ou anonymisés dans un délai raisonnable, sauf obligation légale de conservation plus longue.</p>
      </Section>

      <Section title="6. Vos droits">
        <p>Conformément au Règlement général sur la protection des données (RGPD) pour les résidents de l'Union européenne, et à la Loi sur la protection des renseignements personnels et les documents électroniques (LPRPDE/PIPEDA) pour les résidents du Canada, vous disposez des droits suivants :</p>
        <p>• Droit d'accès à vos données personnelles.</p>
        <p>• Droit de rectification des données inexactes.</p>
        <p>• Droit à l'effacement (« droit à l'oubli »).</p>
        <p>• Droit à la portabilité de vos données.</p>
        <p>• Droit d'opposition et de limitation du traitement.</p>
        <p>• Droit de retirer votre consentement à tout moment.</p>
        <p>Vous pouvez exercer ces droits directement depuis les paramètres de votre compte, ou en nous contactant.</p>
      </Section>

      <Section title="7. Sécurité">
        <p>Nous mettons en œuvre des mesures techniques et organisationnelles raisonnables (chiffrement des mots de passe, contrôle d'accès par compte, règles de sécurité au niveau de la base de données) pour protéger vos données contre l'accès non autorisé, la perte ou l'altération.</p>
      </Section>

      <Section title="8. Mineurs">
        <p>Baobab est réservé aux personnes âgées de 18 ans et plus. Nous ne collectons pas sciemment de données concernant des personnes mineures.</p>
      </Section>

      <Section title="9. Transferts internationaux">
        <p>Vos données peuvent être hébergées sur des serveurs situés dans différents pays. Lorsque c'est le cas, nous veillons à ce que des garanties appropriées soient en place, conformément aux exigences applicables en matière de transferts internationaux de données.</p>
      </Section>

      <Section title="10. Modifications de cette politique">
        <p>Cette politique peut être mise à jour périodiquement. Toute modification substantielle vous sera communiquée dans l'application avant son entrée en vigueur.</p>
      </Section>

      <Section title="11. Fonctionnalités assistées par intelligence artificielle">
        <p>Baobab propose des fonctionnalités facultatives assistées par IA (amorces de conversation, aide à la reformulation, traduction, suggestions de rédaction). Ces fonctionnalités sont désactivables à tout moment dans Confidentialité → Suggestions IA.</p>
        <p>Le contenu de vos conversations privées n'est jamais utilisé pour entraîner un modèle d'IA ni partagé à des fins autres que de générer, à votre demande explicite, la suggestion demandée pour vous. Seules les informations strictement nécessaires à la fonctionnalité demandée sont transmises au fournisseur du service d'IA, jamais l'historique complet d'une conversation.</p>
      </Section>

      <Section title="12. Contact">
        <p>Pour toute question relative à vos données personnelles ou pour exercer vos droits, contactez-nous via l'adresse de contact fournie dans l'application. Vous disposez également du droit de déposer une plainte auprès de l'autorité de protection des données compétente (par exemple le Commissariat à la protection de la vie privée du Canada, ou la CNIL en France).</p>
      </Section>
    </div>
  );
}

export function TermsOfServiceContent() {
  return (
    <div>
      <p className="mb-4 opacity-70">Dernière mise à jour : {LAST_UPDATE}</p>

      <Section title="1. Acceptation des conditions">
        <p>En créant un compte sur Baobab, vous acceptez d'être lié par les présentes conditions d'utilisation. Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser l'application.</p>
      </Section>

      <Section title="2. Éligibilité">
        <p>Vous devez avoir au moins 18 ans pour créer un compte sur Baobab. En vous inscrivant, vous confirmez avoir l'âge légal requis et la capacité juridique de conclure ce contrat.</p>
      </Section>

      <Section title="3. Votre compte">
        <p>Vous êtes responsable de la confidentialité de votre mot de passe et de toute activité effectuée depuis votre compte. Vous vous engagez à fournir des informations exactes et à jour, et à ne pas créer de faux profil ou usurper l'identité d'un tiers.</p>
      </Section>

      <Section title="4. Règles de conduite">
        <p>En utilisant Baobab, vous acceptez de ne pas :</p>
        <p>• Publier du contenu haineux, discriminatoire, harcelant, violent ou à caractère sexuel explicite.</p>
        <p>• Usurper l'identité d'une autre personne ou créer un profil trompeur.</p>
        <p>• Utiliser l'application à des fins commerciales non autorisées, de sollicitation ou de spam.</p>
        <p>• Tenter de contourner les mesures de sécurité ou d'accéder aux données d'autres membres sans autorisation.</p>
        <p>• Harceler ou menacer d'autres membres, y compris en dehors de l'application.</p>
        <p>Tout manquement à ces règles peut entraîner la suspension ou la suppression de votre compte, avec ou sans préavis.</p>
      </Section>

      <Section title="5. Contenu publié par les utilisateurs">
        <p>Vous conservez la propriété du contenu que vous publiez (publications, photos, messages). En le publiant, vous accordez à Baobab une licence non exclusive, limitée à l'affichage de ce contenu dans l'application aux autres membres, dans le cadre normal du service. Vous êtes seul responsable du contenu que vous publiez.</p>
      </Section>

      <Section title="6. Nature du service et absence de garantie de résultat">
        <p>Baobab est une plateforme de mise en relation. Nous ne garantissons pas que vous trouverez une relation amoureuse, amicale ou autre grâce à l'application, et nous ne sommes pas responsables des interactions entre membres, en ligne ou lors de rencontres en personne.</p>
      </Section>

      <Section title="7. Sécurité personnelle">
        <p>Nous encourageons vivement la prudence lors de toute rencontre avec une personne connue via l'application : privilégiez un premier rendez-vous dans un lieu public, informez un proche de vos plans, et ne partagez jamais d'informations financières ou sensibles avec une personne que vous ne connaissez pas encore en confiance.</p>
      </Section>

      <Section title="8. Signalement et modération">
        <p>Vous pouvez signaler ou bloquer tout membre dont le comportement enfreint ces conditions. Nous nous réservons le droit d'examiner les signalements et de suspendre ou supprimer tout compte à notre discrétion raisonnable.</p>
      </Section>

      <Section title="9. Limitation de responsabilité">
        <p>Dans la mesure permise par la loi applicable, Baobab est fourni « tel quel », sans garantie d'aucune sorte. Nous ne pourrons être tenus responsables des dommages indirects résultant de l'utilisation de l'application ou des interactions entre membres.</p>
      </Section>

      <Section title="10. Résiliation">
        <p>Vous pouvez supprimer votre compte à tout moment depuis les paramètres de l'application. Nous pouvons suspendre ou résilier votre accès en cas de violation des présentes conditions.</p>
      </Section>

      <Section title="11. Droit applicable">
        <p>Les présentes conditions sont régies par les lois applicables dans la province ou le pays où le service est exploité. Tout litige sera soumis aux tribunaux compétents de cette juridiction, sous réserve des droits impératifs dont vous pourriez bénéficier en tant que consommateur dans votre pays de résidence.</p>
      </Section>

      <Section title="12. Modifications">
        <p>Nous pouvons modifier ces conditions à tout moment. Les modifications substantielles vous seront communiquées avant leur entrée en vigueur. La poursuite de l'utilisation de Baobab après une modification vaut acceptation des nouvelles conditions.</p>
      </Section>

      <Section title="13. Contact">
        <p>Pour toute question relative à ces conditions, contactez-nous via l'adresse de contact fournie dans l'application.</p>
      </Section>
    </div>
  );
}
