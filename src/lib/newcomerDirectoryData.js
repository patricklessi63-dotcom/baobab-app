// Répertoires d'organismes d'accueil (RIF francophone + généralistes) —
// extraits de newcomerGuideData.js pour l'allègement du bundle : ~150 lignes
// de données volumineuses utilisées UNIQUEMENT par ImmigrationNewsView (onglet
// lazy). Tant qu'elles vivaient dans newcomerGuideData.js — lui-même aussi
// importé par FeedTab.jsx (chunk principal) pour PRIORITY_STEPS — Rollup ne
// pouvait pas les sortir du chunk principal : un module partagé entre un chunk
// eager et un chunk lazy est hissé en entier dans le commun, et le
// tree-shaking ne retire pas un export utilisé par un autre importateur.

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
    note: "Le Québec gère son propre système d'immigration, distinct du réseau RIF (le français y est la langue majoritaire). Pour une installation au Québec, se tourner vers le ministère de l'Immigration, de la Francisation et de l'Intégration (MIFI) du gouvernement du Québec plutôt que vers ce répertoire. Pour l'accueil et l'établissement à Montréal, voir PROMIS dans le répertoire généraliste ci-dessous.",
  },
];

// Répertoire des organismes d'établissement généralistes — ouverts à toutes
// origines et langues, contrairement au réseau RIF ci-dessus (francophone).
// Ne présuppose jamais qu'une personne francophone préfère le RIF, ni
// qu'une personne non francophone doive être orientée uniquement ici :
// les deux répertoires coexistent, à choisir selon la langue et la
// situation de chacun (voir prompt-guide-nouvel-arrivant.md). Ne couvre
// pour l'instant que trois grandes villes, point de départ à étendre.
export const GENERALIST_DIRECTORY = [
  {
    city: "Toronto (Ontario)",
    orgs: [
      {
        name: "COSTI Immigrant Services",
        address: "1710 Dufferin Street, Toronto, ON M6E 3P2",
        phone: "416-658-1600",
        email: "info@costi.org",
        services: "17 emplacements dans le Grand Toronto, services offerts dans plus de 60 langues à plus de 39 000 personnes par an : établissement, emploi, formation linguistique, aide à l'intégration, soutien aux familles et aux réfugiés.",
      },
    ],
  },
  {
    city: "Vancouver (Colombie-Britannique)",
    orgs: [
      {
        name: "MOSAIC",
        phone: "604-254-9626",
        email: "info@mosaicbc.org",
        services: "Plusieurs emplacements à Vancouver et dans le Lower Mainland, 47 programmes différents, plus de 33 000 personnes servies par an, interprétation en 70 langues : emploi, cours d'anglais (dont préparation IELTS/CELPIP), établissement et orientation, santé mentale, information juridique de base, soutien aux familles, parrainage de réfugiés, prévention de la violence.",
      },
    ],
  },
  {
    city: "Montréal (Québec)",
    orgs: [
      {
        name: "PROMIS (Promotion-Intégration-Société nouvelle)",
        address: "3333 chemin de la Côte-Sainte-Catherine, Montréal, QC H3T 1C8",
        phone: "514-345-1615",
        hours: "Lun-ven 9h-17h",
        services: "Plus de 35 ans d'expérience : accueil et évaluation des besoins, francisation (cours gratuits jour/soir), soutien scolaire et accompagnement parental, aide à l'emploi, sécurité alimentaire (cuisines et jardins communautaires), accompagnement à l'entrepreneuriat immigrant, logement abordable pour femmes immigrantes seules (résidence Maria-Goretti).",
      },
    ],
  },
  {
    city: "Calgary (Alberta)",
    orgs: [
      {
        name: "Centre for Newcomers",
        address: "#125, 565 – 36 Street NE, Calgary, AB T2A 6K3 (second emplacement à Village Square, 2623, 56 Street NE)",
        phone: "403-569-3325",
        hours: "Lun-sam 8h30-16h30",
        services: "Cours d'anglais (LINC), aide à l'emploi et recherche d'emploi, établissement et intégration, programmes jeunesse, service de garde, développement professionnel.",
      },
    ],
  },
  {
    city: "Edmonton (Alberta)",
    orgs: [
      {
        name: "Catholic Social Services — Immigration and Settlement",
        address: "Alice Colak Centre, 8212, 118 Avenue, Edmonton, AB T5B 0S3",
        phone: "780-424-3545",
        services: "Établissement et immigration, accompagnement des nouveaux arrivants, dans le cadre d'un ensemble plus large de services communautaires.",
      },
    ],
  },
  {
    city: "Winnipeg (Manitoba)",
    orgs: [
      {
        name: "Immigrant Centre Manitoba (ICM)",
        address: "100 Adelaide Street, Winnipeg, MB R3A 0W2",
        phone: "204-943-9158",
        hours: "Lun-jeu 8h30-20h, ven 8h30-16h30, sam 8h30-16h (services limités)",
        services: "Établissement, emploi, banque de langues/interprétation, nutrition, préparation à l'examen de citoyenneté, préparation à l'examen théorique de conduite, programme d'accueil de quartier.",
      },
    ],
  },
  {
    city: "Halifax (Nouvelle-Écosse)",
    orgs: [
      {
        name: "ISANS (Immigrant Services Association of Nova Scotia)",
        address: "Mumford Professional Centre, 6960 Mumford Road, bureau 2120, Halifax, NS B3L 4P1",
        phone: "902-423-3607 · Sans frais (N.-É.) 1-866-431-6472",
        email: "info@isans.ca",
        hours: "Lun-ven 8h30-16h30",
        services: "Établissement (logement, soutien familial, interprétation/traduction), emploi et transition professionnelle, cours d'anglais (LINC), intégration communautaire, accompagnement entrepreneurial, service pré-arrivée (accompagnement avant le départ), réinstallation des réfugiés.",
      },
    ],
  },
];
