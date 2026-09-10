// Contenu du Guide du nouvel arrivant — compilé par l'utilisateur (Patrick) le
// 22 août 2026 à partir de sources publiques (sites officiels des organismes,
// IRCC, réseau immigrationfrancophone.ca / réseau RIF). Transcription fidèle,
// à rafraîchir périodiquement plutôt qu'à compléter par supposition — voir
// prompt-guide-nouvel-arrivant.md pour le prompt de mise à jour.

export const ESSENTIAL_DOCUMENTS = [
  "Passeport valide de tous les membres de la famille",
  "Confirmation de résidence permanente (CRP) ou permis de travail/études valide",
  "Certificats de naissance, de mariage/divorce, diplômes et relevés de notes (originaux + traductions certifiées si le document n'est pas en français ou en anglais)",
  "Carnet de vaccination et dossiers médicaux (soi-même et les enfants)",
  "Relevés bancaires récents et preuves de fonds",
  "Permis de conduire national et permis de conduire international si possible",
  "Plusieurs photos d'identité format passeport",
  "Une copie numérique (cloud) de tous les documents ci-dessus, au cas où les originaux seraient perdus",
  "Coordonnées d'urgence (famille, futur employeur, logement)",
];

export const BORDER_NOTE =
  "À l'arrivée à la frontière : prévoir de déclarer ses biens (liste des effets personnels / formulaire de déclaration douanière) ; garder tous les documents d'immigration accessibles pour le contrôle.";

// Démarches prioritaires, dans l'ordre — l'ordre est intentionnel.
export const PRIORITY_STEPS = [
  {
    icon: "CreditCard",
    title: "Numéro d'assurance sociale (NAS)",
    body: "Obligatoire pour travailler, produire ses impôts et, dans les faits, pour ouvrir un compte bancaire ou obtenir certains services. Gratuit, délivré sur place à un bureau Service Canada sur présentation du passeport et du document d'immigration (CRP, permis de travail ou d'études). À faire dès les premiers jours.",
    linkLabel: "Service Canada — NAS",
    href: "https://www.canada.ca/fr/emploi-developpement-social/services/numero-assurance-sociale.html",
  },
  {
    icon: "Stethoscope",
    title: "Carte d'assurance maladie provinciale",
    body: "S'inscrire le plus tôt possible auprès du régime de santé de sa province (documents : preuve de statut d'immigration + preuve d'adresse). Délai avant couverture active : environ 3 mois en Ontario (OHIP), Colombie-Britannique (MSP), Nouvelle-Écosse (MSI) et Québec (RAMQ) ; couverture dès l'arrivée, sans délai de carence, en Alberta (AHCIP), au Manitoba (MHSIP) et en Saskatchewan. Dans les provinces à délai de carence, souscrire une assurance santé privée temporaire est fortement recommandé.",
    linkLabel: "Trouver le régime de ta province",
    href: "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/setablir-canada/soins-sante.html",
  },
  {
    icon: "Wallet",
    title: "Compte bancaire",
    body: "La plupart des grandes banques (RBC, BMO, Banque Scotia, CIBC, Banque Nationale) offrent des forfaits « nouveaux arrivants » sans exiger d'historique de crédit canadien, valides généralement jusqu'à 3-5 ans après l'arrivée. Documents habituels : deux pièces d'identité (passeport + document d'immigration) ; une preuve d'adresse peut être demandée mais n'est pas toujours exigée pour ces forfaits.",
  },
  {
    icon: "Home",
    title: "Adresse et logement",
    body: "Conserver une copie du bail : il sert de preuve d'adresse pour le NAS, la carte santé, la banque et l'inscription scolaire.",
  },
  {
    icon: "Phone",
    title: "Numéro de téléphone canadien",
    body: "Nécessaire pour les vérifications bancaires et la plupart des démarches en ligne.",
  },
  {
    icon: "Car",
    title: "Permis de conduire",
    body: "Certaines provinces ont des ententes d'échange direct avec certains pays (souvent sans nouvel examen) ; en l'absence d'entente, un examen théorique et pratique est requis. Le permis international permet de conduire temporairement en attendant (durée limitée selon la province). Vérifier auprès de la société d'assurance/immatriculation provinciale (ICBC en C.-B., MPI au Manitoba, SGI en Saskatchewan, ministère des Transports ailleurs).",
  },
  {
    icon: "Receipt",
    title: "Déclaration de revenus (impôts)",
    body: "Produire une déclaration dès la première année de résidence, même sans revenu canadien : cela ouvre le droit à des crédits (Allocation canadienne pour enfants, crédit pour la TPS/TVH, allocations provinciales, etc.). Le NAS est requis pour produire une déclaration auprès de l'Agence du revenu du Canada (ARC).",
    linkLabel: "Agence du revenu du Canada",
    href: "https://www.canada.ca/fr/agence-revenu.html",
  },
  {
    icon: "BadgeCheck",
    title: "Carte de résident permanent (carte RP)",
    body: "Si elle n'a pas été reçue avant le départ, la demande se fait après l'arrivée avec une adresse canadienne, via le compte IRCC en ligne. Les délais de traitement varient : vérifier le statut sur canada.ca.",
    linkLabel: "IRCC — Carte de RP",
    href: "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/nouveaux-immigrants/carte-rp.html",
  },
];

// Repères supplémentaires, non séquentiels (déjà présents dans le guide avant
// l'ajout du répertoire — conservés tels quels).
export const EXTRA_TIPS = [
  {
    icon: "GraduationCap",
    title: "Reconnaissance des diplômes",
    body: "Selon la profession et la province, une évaluation ou un ordre professionnel peut être requis avant de pratiquer. Les délais peuvent être longs — s'y prendre tôt.",
  },
  {
    icon: "PhoneCall",
    title: "Numéros utiles",
    body: "911 pour toute urgence (police, feu, ambulance). Chaque province a aussi une ligne santé non urgente (ex. Info-Santé 811 au Québec) pour un avis médical par téléphone.",
  },
];


export const FEDERAL_RESOURCES = [
  { label: "IRCC — démarches officielles d'immigration", detail: "1-888-242-2100 · canada.ca", href: "https://www.canada.ca/fr/immigration-refugies-citoyennete.html" },
  { label: "Trouver des services gratuits pour nouveaux arrivants près de chez toi", detail: "Carte interactive officielle IRCC", href: "https://ircc.canada.ca/francais/nouveaux/map/services.asp" },
  { label: "211 — ressources communautaires et sociales locales", detail: "Service téléphonique et web gratuit, disponible en français, partout au Canada", href: "https://211.ca/" },
];

export const GUIDE_LIMITS =
  "Les coordonnées, délais et programmes ci-dessus peuvent changer — vérifie toujours auprès de la source (site de l'organisme, IRCC, ou 211) avant une démarche importante. Ceci n'est pas un conseil juridique, fiscal ou en immigration personnalisé : pour ces questions, adresse-toi à un consultant réglementé en immigration (CRCIC) ou un avocat.";
