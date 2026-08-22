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

// Répertoire des organismes d'accueil francophones — réseau RIF (13 réseaux
// régionaux financés par IRCC, ~300 organismes partenaires, 9 provinces + 2
// territoires, hors Québec). Toujours vérifier les coordonnées avant de se
// déplacer : elles peuvent changer.
export const PROVINCE_DIRECTORY = [
  {
    province: "Ontario",
    orgs: [
      {
        name: "CÉSOC (Est de l'Ontario — RSIFEO)",
        address: "815 boul. St-Laurent, bureau 107, Ottawa, ON K1K 3A7 (bureaux satellites à Hawkesbury et Cornwall)",
        phone: "613-248-1343 poste 301 · Sans frais 1-888-402-1359",
        hours: "Lun-ven 8h30-17h",
        services: "Établissement, appui aux aînés immigrants, employabilité, Point d'accueil francophone, aide à la réinstallation des réfugiés (PAR), entrepreneuriat (CACIA). Le RSIFEO couvre aussi Kingston, Brockville, Belleville, Smiths Falls, Lanark-Renfrew et Pembroke.",
      },
      {
        name: "Centre francophone du Grand Toronto (CFGT)",
        address: "555 rue Richmond Ouest, bureau 303, Toronto, ON M5V 3B1",
        phone: "416-922-2672 poste 420",
        services: "Évaluation des besoins, aide au logement et à l'inscription scolaire, aide aux formulaires gouvernementaux, cercles de conversation en français, préparation à l'examen de citoyenneté, services d'établissement en milieu scolaire.",
      },
      {
        name: "Réseau du Nord",
        website: "reseaudunord.ca",
        services: "Coordonne les services d'établissement francophones dans le Nord de l'Ontario (Sudbury, Timmins, Thunder Bay, etc.).",
      },
    ],
  },
  {
    province: "Alberta",
    orgs: [
      {
        name: "RIFA (Réseau en immigration francophone de l'Alberta)",
        email: "rifa@rifalberta.com",
        services: "Couvre Edmonton, Calgary (communauté francophone accueillante) et régions avoisinantes. Plus de 50 organismes membres ; oriente vers le bon service (accueil, emploi, francisation, citoyenneté).",
      },
    ],
  },
  {
    province: "Colombie-Britannique",
    orgs: [
      {
        name: "RIFCB (Réseau en immigration francophone de la Colombie-Britannique)",
        website: "rifcb.ca",
        services: "37 organismes membres à travers la province : établissement, recherche d'emploi, démarrage d'entreprise, éducation en français, santé en français, logement, aide juridique, aînés et communauté 2ELGBTQI+. Consulter le site pour être dirigé vers l'organisme le plus proche.",
      },
    ],
  },
  {
    province: "Manitoba",
    orgs: [
      {
        name: "Accueil francophone du Manitoba",
        address: "Winnipeg (quartier Saint-Boniface)",
        website: "accueilfrancophonemb.com",
        services: "Accueil et établissement, cours d'anglais, aide alimentaire, soutien aux aînés immigrants.",
        note: "Adresse et téléphone précis à confirmer via le formulaire de contact du site — non disponibles publiquement au moment de la compilation.",
      },
    ],
  },
  {
    province: "Saskatchewan",
    orgs: [
      {
        name: "SAIF-SK (Services d'accueil et d'intégration francophone de la Saskatchewan)",
        email: "info@saif-sk.ca",
        hours: "Lun-ven 8h30-17h",
        services: "Ressource principale pour les nouveaux arrivants francophones en Saskatchewan (Regina, Saskatoon) depuis 2000 : emploi, logement, santé, éducation et formation, gestion financière, intégration communautaire, programme jeunesse.",
      },
    ],
  },
  {
    province: "Nouvelle-Écosse",
    orgs: [
      {
        name: "IFNÉ (Immigration francophone de la Nouvelle-Écosse)",
        address: "6960 Mumford Road, bureau 2085, Halifax, NS B3L 4P1",
        phone: "902-433-2099",
        email: "info@ifne.ca",
        services: "Accompagnement personnalisé avec conseiller dédié, aide à la recherche d'emploi et de logement, apprentissage du français, accès aux services de santé et d'éducation, jumelage communautaire.",
      },
    ],
  },
  {
    province: "Nouveau-Brunswick",
    orgs: [
      {
        name: "RIFNB (Réseau en immigration francophone du Nouveau-Brunswick)",
        address: "702 rue Principale, bureau 5, Petit-Rocher, NB E8J 1V1",
        phone: "506-500-0223",
        email: "infos@rifnb.ca",
        hours: "Lun-ven 8h30-16h30",
        services: "Accueil et établissement, intégration culturelle et jeunesse, emploi et entrepreneuriat, éducation et petite enfance, droits et gouvernance, santé et bien-être.",
      },
    ],
  },
  {
    province: "Île-du-Prince-Édouard",
    orgs: [
      {
        name: "Coopérative d'intégration francophone de l'Î.-P.-É.",
        address: "149 Kent Street, bureau 202, Charlottetown, PE C1A 1N5",
        website: "tonile.ca",
        note: "Contact par courriel via le formulaire du site — aucun numéro de téléphone public trouvé au moment de la compilation.",
      },
    ],
  },
  {
    province: "Terre-Neuve-et-Labrador",
    orgs: [
      {
        name: "Accueil TNL / FFTNL (Fédération des francophones de Terre-Neuve et du Labrador)",
        address: "95 avenue Bonaventure, bureau 101, St-Jean, NL (2e point de service : Centre scolaire et communautaire des Grands-Vents, 65 chemin Ridge, bureau 233, St-Jean, NL A1B 4P5)",
        phone: "709-800-6590",
        email: "AccueilTNL@fftnl.ca",
        services: "Accueil et évaluation des besoins, référencement vers les services publics et communautaires, interprétation/traduction, jumelage et réseautage communautaire, préparation à la citoyenneté.",
      },
    ],
  },
  {
    province: "Yukon",
    orgs: [
      {
        name: "Association franco-yukonnaise (AFY)",
        address: "302 rue Strickland, Whitehorse, YT Y1A 2K1",
        phone: "867-668-2663 / 867-668-3511",
        email: "afy@afy.ca",
        hours: "Lun-ven 9h-17h",
        services: "Accueil et aide à l'établissement, aide à l'emploi, appui au recrutement pour les employeurs, formation, entrepreneuriat, vie communautaire et culturelle.",
      },
    ],
  },
  {
    province: "Territoires du Nord-Ouest",
    orgs: [
      {
        name: "CDÉTNO (Conseil de développement économique des Territoires du Nord-Ouest) — volet accueil et intégration",
        address: "5204 avenue Franklin, bureau 102, Yellowknife, NT X1A 2N4",
        phone: "867-873-5962",
        email: "etablissement@cdetno.com",
        services: "Offerts dans tous les TNO : évaluation des besoins, séances d'information, accompagnement administratif.",
      },
    ],
  },
  {
    province: "Nunavut",
    orgs: [],
    note: "Aucun organisme d'accueil francophone dédié identifié au moment de la compilation. Orienter vers IRCC (1-888-242-2100) ou le 211 pour être redirigé vers la ressource la plus pertinente.",
  },
  {
    province: "Québec",
    orgs: [],
    note: "Le Québec gère son propre système d'immigration, distinct du réseau RIF (le français y est la langue majoritaire). Pour une installation au Québec, se tourner vers le ministère de l'Immigration, de la Francisation et de l'Intégration (MIFI) du gouvernement du Québec plutôt que vers ce répertoire.",
  },
];

export const FEDERAL_RESOURCES = [
  { label: "IRCC — démarches officielles d'immigration", detail: "1-888-242-2100 · canada.ca", href: "https://www.canada.ca/fr/immigration-refugies-citoyennete.html" },
  { label: "Trouver des services gratuits pour nouveaux arrivants près de chez toi", detail: "Carte interactive officielle IRCC", href: "https://ircc.canada.ca/francais/nouveaux/map/services.asp" },
  { label: "211 — ressources communautaires et sociales locales", detail: "Service téléphonique et web gratuit, disponible en français, partout au Canada", href: "https://211.ca/" },
];

export const GUIDE_LIMITS =
  "Les coordonnées, délais et programmes ci-dessus peuvent changer — vérifie toujours auprès de la source (site de l'organisme, IRCC, ou 211) avant une démarche importante. Ceci n'est pas un conseil juridique, fiscal ou en immigration personnalisé : pour ces questions, adresse-toi à un consultant réglementé en immigration (CRCIC) ou un avocat.";
