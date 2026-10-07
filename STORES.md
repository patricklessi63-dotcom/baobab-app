# Baobab — exigences des boutiques d'applications (étape 4)

Rédigé le **7 octobre 2026**. Ce document prépare la publication sur l'App Store (Apple) et Google Play :
audit du code face aux règles officielles, réponses proposées aux questionnaires, brouillons de fiche,
et la liste de ce que **seul le propriétaire** peut faire. Il accompagne `MOBILE.md` (tableau d'avancement,
étape 4) et `DEPLOIEMENT.md` (§12 : SQL à exécuter / fonction à redéployer).

Légende : **[À VALIDER]** = décision ou formulation à confirmer par le propriétaire (ou un juriste) ;
**[PROPRIÉTAIRE]** = action que seul le propriétaire peut faire ; rien n'a été exécuté en production,
aucun secret n'est dans le dépôt, aucune adresse e-mail / entité juridique n'a été inventée.

## 0. Sources officielles vérifiées (le 7 octobre 2026)

Les pages ont été lues via un outil de récupération qui en renvoie un résumé : les numéros de règle et
les chiffres ci-dessous viennent de ces lectures, **pas de la mémoire**. Quand deux lectures d'une même page
se contredisaient (captures d'écran Apple), c'est signalé. Les formulaires des consoles sont dynamiques :
**relire la question exacte dans App Store Connect / Play Console au moment de répondre.**

| Sujet | Source (URL) | Ce qui a été retenu |
| --- | --- | --- |
| Règles de revue Apple | https://developer.apple.com/app-store/review/guidelines/ | 1.1.4 (« hookup » interdit), **1.2** (UGC : filtre, signalement + réponse rapide, blocage, **contact publié**), 1.5 (contact), **3.1.1** (IAP), 3.1.1(a) (liens d'achat externes : sans droit particulier **seulement aux États-Unis**), 3.1.2, **3.1.3(b)** (multiplateforme : *« à condition que ces éléments soient aussi achetables dans l'app »*), **4.8** (Se connecter avec…), 5.1.1(i) (lien vers la politique de confidentialité dans l'app **et** la fiche), **5.1.1(v)** (suppression de compte dans l'app), 5.1.2(i) (partage avec une IA tierce : divulgation + consentement) |
| Suppression de compte Apple | https://developer.apple.com/support/offering-account-deletion-in-your-app/ | Facile à trouver ; pas de téléphone/e-mail/chat obligatoires ; réauthentification, confirmation, **délai raisonnable / suppression planifiée autorisés** ; la simple désactivation ne suffit pas ; prévenir si un abonnement Apple continue de facturer |
| Classification d'âge Apple | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions · https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating · https://developer.apple.com/news/upcoming-requirements/?id=07242025a | Valeurs **4+, 9+, 13+, 16+, 18+** ; *Réseau social* ⇒ au moins 13+ ; **« Override to Higher Age Rating »** obligatoire si le CLUF/les conditions imposent un âge supérieur à celui calculé ; nouvelles questions à renseigner (échéance annoncée : 31 janv. 2026, déjà passée) |
| App Privacy (étiquettes) | https://developer.apple.com/app-store/app-privacy-details/ | Catégories/types officiels, 3 questions (liée à l'identité ? suivi ? finalités), données des WebView incluses, réponses modifiables sans nouvelle version |
| Privacy manifest | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files · https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api | `PrivacyInfo.xcprivacy` : `NSPrivacyTracking`, `NSPrivacyCollectedDataTypes`, `NSPrivacyAccessedAPITypes` ; catégories d'API à raison requise (horodatage de fichiers `C617.1`, heure de démarrage `35F9.1`, espace disque `E174.1`/`E175.1`, claviers actifs `54BD.1`, `UserDefaults` `CA92.1`) ; obligatoire depuis le 1ᵉʳ mai 2024, SDK inclus |
| Captures Apple | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications | 1 à 10 captures, JPEG/PNG **sans transparence** ; iPhone et iPad 13" ; si on fournit la plus grande taille requise, les autres sont mises à l'échelle. **Deux lectures divergeaient** sur la taille iPhone obligatoire (6,9" 1320×2868 ou 6,1" 1179×2556/1206×2622) : fournir la plus grande (6,9") et lire l'invite de App Store Connect |
| Métadonnées Apple | https://developer.apple.com/help/app-store-connect/reference/app-information/app-information | Nom 30, sous-titre 30, mots-clés 100, description 4 000, texte promotionnel 170 caractères ; **URL de confidentialité et URL d'assistance obligatoires** |
| Catégories Apple | https://developer.apple.com/app-store/categories/ | **Pas de catégorie « Rencontres »** ; les apps de rencontre choisissent « Réseaux sociaux » (Social Networking) ; secondaire facultatif |
| Programme développeur Apple | https://developer.apple.com/programs/whats-included/ · https://developer.apple.com/programs/enroll/ | **99 USD / an** ; particulier : identifiant Apple avec double authentification + majorité légale + nom légal ; **organisation : D-U-N-S obligatoire**, entité légale, site web ; commission 30 % (15 % abonnements qualifiés) |
| Petites entreprises Apple | https://developer.apple.com/app-store/small-business-program/ | **15 %** si ≤ 1 M USD de revenus nets l'an passé et l'année en cours ; nouveaux développeurs éligibles d'office |
| UGC Google Play | https://support.google.com/googleplay/android-developer/answer/9876937 | Conditions acceptées avant de publier, contenu répréhensible défini, **signalement et blocage dans l'app**, modération continue, pas de monétisation qui encourage les abus ; contenu sexuel incident caché par défaut + mineurs exclus |
| Suppression de compte Google | https://support.google.com/googleplay/android-developer/answer/13327111 | Chemin **dans l'app** ET **ressource web** (URL à déclarer dans le formulaire Sécurité des données) : fonctionnelle, nomme l'app, met la suppression en évidence, prérequis expliqués ; conservation permise pour sécurité/fraude/obligations légales **si divulguée** |
| Normes de sécurité des enfants Google | https://support.google.com/googleplay/android-developer/answer/14747720 | S'applique aux apps déclarées **Réseaux sociaux / Rencontres** : page web publique de normes contre l'exploitation sexuelle des enfants (CSAE), moyen de remonter une préoccupation **dans l'app**, traitement du CSAM, **contact désigné** déclaré dans la Play Console — même si l'app est réservée aux adultes |
| Sécurité des données Google | https://support.google.com/googleplay/android-developer/answer/10787469 | Types (localisation approximative < précise, infos perso, messages, photos/vidéos, fichiers audio, activité, diagnostics, identifiants…), « collecté » ≠ « partagé », **prestataires agissant pour vous = pas du partage**, chiffrement en transit, suppression |
| Public cible Google | https://support.google.com/googleplay/android-developer/answer/9867159 | Tranches jusqu'à « 18 ans et plus » ; option **« Restreindre l'accès aux mineurs »** pour les apps 18+ seulement ; questionnaire de contenu (IARC) avant |
| Classification IARC | https://support.google.com/googleplay/android-developer/answer/9859655 | Questionnaire dans la Play Console, notes calculées par territoire |
| Paiements Google | https://support.google.com/googleplay/android-developer/answer/9858738 | Facturation Google Play **obligatoire** pour les fonctions/abonnements numériques consommés dans l'app ; **interdit de rediriger vers un autre moyen de paiement** (fiche, promotions, WebView, inscription) hors programmes spéciaux |
| Frais Google | https://support.google.com/googleplay/android-developer/answer/112622 | Régions « historiques » (dont le Canada) : **15 % sur le premier million USD** par an, puis 30 % ; autre structure en Australie/EEE/Japon/Royaume-Uni/États-Unis |
| Compte Google | https://support.google.com/googleplay/android-developer/answer/6112435 · https://support.google.com/googleplay/android-developer/answer/14151465 | **25 USD, une fois** ; pièce d'identité officielle + carte à son nom légal ; comptes **personnels créés après le 13 nov. 2023** : test fermé de **12 testeurs pendant 14 jours consécutifs** avant « Demander l'accès à la production » (examen ≈ 7 jours) ; vérification d'un appareil Android via l'app mobile Play Console |
| Éléments de fiche Google | https://support.google.com/googleplay/android-developer/answer/9866151 | Icône 512×512 PNG ≤ 1 024 Ko ; image de présentation 1024×500 ; 2 à 8 captures téléphone (côté 320–3 840 px, rapport ≤ 2:1) ; titre 30, description courte 80, longue 4 000 |
| targetSdk Google | https://developer.android.com/google/play/requirements/target-sdk | API 36 exigée pour les nouvelles apps et mises à jour depuis le 31 août 2026 (déjà le cas) |
| Coûts divers | https://firebase.google.com/pricing · https://docs.github.com/en/billing/reference/actions-runner-pricing · https://www.revenuecat.com/pricing/ | FCM : « sans frais » (forfait Spark) ; runner macOS GitHub : **0,062 USD/min** (Linux 2 cœurs 0,006) ; RevenueCat : gratuit jusqu'à 2 500 USD de revenus suivis par mois, puis **1 %** |
| Contexte Canada (Apple) | https://www.cippic.ca/news/cippic-takes-apple-to-competition-tribunal-over-alleged-anti-competitive-app-store-practices | Recours déposé en déc. 2025 devant le Tribunal de la concurrence contre les règles anti-incitation d'Apple : **rien n'a changé** à ce jour pour la boutique canadienne |

---

## 1. Inventaire EXACT des données collectées

Établi par lecture du schéma SQL (`supabase-*.sql`), des appels `supabase.from(...)`/`rpc` du client et des
edge functions. « Lié à l'identité » = rattaché à un compte (`profile_id`/`user_id`). Toutes les
transmissions passent en **HTTPS/WSS** (Supabase, Stripe, FCM, APNs, Anthropic) : « chiffrée en transit » = oui
partout. « Supprimable » = effacé par la suppression de compte (voir §3), sauf mention.

| Donnée | Où (table / fichier) | Finalité | Lié à l'identité | Partagée avec (sous-traitants) | Supprimable |
| --- | --- | --- | --- | --- | --- |
| Adresse e-mail | `auth.users` (Supabase Auth) ; `profiles.email_verified` | Compte, connexion, e-mails de confirmation / réinitialisation | Oui | Supabase | Oui |
| Mot de passe | `auth.users` (haché par Supabase Auth) | Authentification | Oui | Supabase | Oui |
| Prénom, nom | `profiles.name`, `last_name` | Profil affiché aux autres membres | Oui | Supabase | Oui |
| Date de naissance / âge | `profiles.birth_date`, `age`, `show_birth_year` | Vérification 18+, âge affiché (année masquable) | Oui | Supabase | Oui |
| Pays d'origine, langues, ville, province, parcours au Canada (arrivée, statut d'immigration, études, profession, projet) | `profiles.*` (`country`, `languages`, `city`, `province`, `arrived_since`, `immigration_status`…) | Profil, recommandations, filtres | Oui | Supabase | Oui |
| Intentions et préférences de rencontre (ce que je recherche, valeurs, famille, enfants, personnalité, âge min/max…) | `profiles.looking_for`, `relationship_values`, `wants_children`, `family_importance`, `pref_age_*`… | Matching / recommandations | Oui | Supabase | Oui |
| **Genre, orientation sexuelle** | — | **Non collectés** (aucune colonne, vérifié par recherche dans le code et le SQL) | — | — | — |
| Photos de profil, couverture | `profile_photos`, bucket `avatars` | Profil | Oui | Supabase (Storage) | Oui |
| **Localisation approximative** (lat./long. arrondies à 2 décimales ≈ 1,1 km, ville, région, pays, réglages d'usage) | `user_locations` (RLS : lecture par soi seul ; autres membres : `nearby_profiles()` ne renvoie qu'une distance) ; `profiles` ne contient pas de coordonnées | Accès réservé au Canada, personnes/événements proches | Oui | Supabase | Oui |
| Présence (en ligne, dernière activité) | `profiles.is_online`, `last_seen` | Afficher « en ligne » (masquable) | Oui | Supabase | Oui |
| Messages texte, réponses, réactions | `messages`, `message_reactions` | Messagerie | Oui | Supabase | Messages **envoyés** : oui ; reçus : restent chez l'auteur |
| Photos, vidéos, fichiers, **messages vocaux** de conversation | bucket `chat-media`, `messages.media_*` | Messagerie | Oui | Supabase (Storage) | Oui (fichiers envoyés par le compte) |
| Publications, commentaires, réactions du fil | `posts`, `post_media`, `post_comments`, `post_likes`, bucket `post-media` | Fil communautaire | Oui | Supabase | Oui |
| Statuts (stories, 24 h), vues, réactions | `stories`, `story_views`, `story_reactions`, bucket `avatars` | Statuts éphémères | Oui | Supabase | Oui (expirent seuls après 24 h) |
| Communautés (publications, commentaires, médias, adhésions, invitations) | `community_*`, bucket `community-media` | Communautés | Oui | Supabase | Oui (médias : **correctif de code livré**, voir §3) ; la communauté créée survit sans son créateur |
| Événements (participation, commentaires, photos, invitations, événements créés) | `events`, `event_*`, buckets `event-media`, `event-covers` | Événements | Oui | Supabase | Oui, sauf l'événement créé et sa couverture (survivent, créateur anonymisé) |
| Likes, passes, favoris, suivis, blocages, masquages | `likes`, `passes`, `favorites`, `follows`, `blocks`, `hidden_recommendations` | Matching, sécurité | Oui | Supabase | Oui |
| Signalements envoyés ou reçus | `reports`, `post_reports`, `community_reports`, `event_reports` | Modération | Oui | Supabase | Supprimés **avec** le compte concerné (cascade) — voir §2.4 |
| Jeton de notification | Web Push : `push_subscriptions` ; natif : `device_push_tokens` (jeton FCM/APNs + plateforme + version) | Notifications que l'utilisateur active | Oui | Supabase ; **Google (FCM)**, **Apple (APNs)** pour l'acheminement | Oui (cascade `auth.users`) |
| Préférences de notification, de confidentialité, de thème | `profiles.notification_preferences`, `show_*`, `localStorage` (`bb-theme`, …) | Réglages | Oui (base) / appareil | Supabase | Oui |
| Notifications internes | `notifications` | Fil d'activité | Oui | Supabase | Oui ; purge **90 jours** |
| Diagnostics : erreurs techniques | `client_errors` (message, pile, URL, user-agent, version, `profile_id` s'il est connu) | Corriger les bugs | Oui **si connecté** (sinon anonyme) | Supabase | `profile_id` mis à `null` à la suppression ; purge **30 jours** |
| Usage : événements d'écran/d'action, jalons d'activation | `beta_events` (profil, type, méta), `analytics_events` | Améliorer l'app (aucun outil publicitaire ni de suivi tiers dans `package.json`) | Oui | Supabase | Oui |
| Retours utilisateurs | `beta_feedback` (message, écran) | Support / amélioration | Oui | Supabase | Oui |
| Paiement Premium (web) | `subscriptions` (`stripe_customer_id`, plan, statut, échéance), `subscription_events` (événements Stripe) ; **aucun numéro de carte** (Stripe Checkout hébergé) | Facturer l'abonnement | Oui | **Stripe** | Lignes supprimées ; l'abonnement est résilié ; Stripe garde ses obligations légales |
| Texte envoyé à l'IA (bio, publication, description d'événement, **un** message à traduire/reformuler, prénom + ville + intérêts de deux matchs) | Non stocké par Baobab ; `ai_usage` ne garde que le type d'action | Suggestions facultatives (désactivables) | Oui (la requête est authentifiée) | **Anthropic** (via la fonction `ai-assist`) | `ai_usage` : oui |
| Journaux serveur (adresse IP, user-agent) | Infrastructure Supabase / Vercel (pas de table applicative) | Sécurité, exploitation | Selon l'hébergeur | Supabase, Vercel | Selon la politique de l'hébergeur |
| **Carnet d'adresses, contacts** | — | **Aucun accès** (aucune API de contacts dans le code) | — | — | — |
| **Galerie complète** | — | Aucun accès : sélecteur système (Photo Picker / PHPicker) ; l'appareil photo est lancé à la demande, sans permission `CAMERA` Android | — | — | — |
| **Identifiant publicitaire (IDFA/AAID), suivi inter-apps** | — | **Non utilisés** | — | — | — |

**Sous-traitants** : Supabase (base, auth, stockage, fonctions), Vercel (site web), Stripe (paiement web),
Google/Firebase (FCM, notifications Android), Apple (APNs, notifications iOS), Anthropic (IA facultative).
**Aucun courtier de données, aucune publicité, aucun suivi** : donc « Utilisée pour le suivi » = non partout.

---

## 2. Contenu généré par les utilisateurs : signalement, blocage, modération

### 2.1 Où « Signaler » et « Bloquer » existent (≤ 2 touches), fichier:ligne (état après cet audit)

Un « signalement » écrit dans la table indiquée ; l'utilisateur voit « Signalement envoyé » (`ReportModal.jsx`),
puis, pour un profil ou un contenu avec auteur connu, **la proposition de bloquer** l'auteur.

| Contenu / surface | Signaler | Bloquer | Table | État |
| --- | --- | --- | --- | --- |
| Profil — Découverte, mode **Grille** | `MatchCard.jsx:136-139` | `MatchCard.jsx:141-144` | `reports` | existait |
| Profil — Découverte, mode **Pile** (par défaut) | `DiscoverTab.jsx:451-458` (icône drapeau sur la carte) | `DiscoverTab.jsx:459-466` (icône) | `reports` | **MANQUAIT → ajouté** (avant : 2 touches via la fiche complète, peu visible) |
| Fiche de profil publique (recherche, favoris, admirateurs, notifications, abonnés, membres) | `PublicProfileModal.jsx:231-235` | `PublicProfileModal.jsx:236-240` | `reports` | existait |
| Profil — match / liste de conversations | `MessagesTab.jsx:222-225` (⋯ de la ligne) | `MessagesTab.jsx:226-229` | `reports` | existait |
| Conversation (en-tête) | `ConversationPane.jsx:444-447` (⋯ → Signaler) | `ConversationPane.jsx:450-453` | `reports` | existait |
| **Message précis** (texte, image, vocal) | `MessageActionsMenu.jsx:38-45` (« Signaler ce message », messages reçus) → `ConversationPane.jsx` (`onReport`) | via ⋯ de l'en-tête, ou proposition après signalement | `reports` (signale l'auteur du message) | **MANQUAIT → ajouté** |
| Statut (story) | `StoryViewerModal.jsx:233-248` (⋯ → Signaler) | `StoryViewerModal.jsx:250-256` | `reports` | existait |
| Publication du fil | `PostCard.jsx:157` | `PostCard.jsx:161-165` + proposition après signalement (`PostsFeed.jsx`) + avatar/nom → fiche (`PostCard.jsx:83-97`) | `post_reports` | signaler existait ; **bloquer MANQUAIT → ajouté** (3 chemins) |
| Commentaire du fil | `PostCard.jsx:205-216` | `PostCard.jsx:217-227` (icône) + proposition après signalement | `post_reports` | signaler existait ; **bloquer MANQUAIT → ajouté** |
| Communauté (la communauté elle-même) | `CommunityDetailView.jsx:122` | — (pas d'auteur individuel ; on peut bloquer un membre depuis la liste) | `community_reports` | existait |
| Publication de communauté | `CommunityPostCard.jsx:134` | `CommunityPostCard.jsx:137-141` + proposition après signalement (`CommunitiesTab.jsx`) | `community_reports` | signaler existait ; **bloquer MANQUAIT → ajouté** |
| Commentaire de communauté | `CommunityPostCard.jsx:214` | `CommunityPostCard.jsx:216-218` + proposition | `community_reports` | signaler existait ; **bloquer MANQUAIT → ajouté** |
| Membre d'une communauté | fiche via la liste (`CommunitiesTab.jsx` → `PublicProfileModal`) | idem | `reports` | existait |
| Événement | `EventDetailView.jsx:217` | — (organisateur : via sa fiche si participant) | `event_reports` | existait |
| **Commentaire d'événement** | `EventCommentsSection.jsx:60-72` | proposition de blocage après signalement | `reports` (signale l'auteur du message) | **MANQUAIT → ajouté** |
| **Photo d'événement** | `EventPhotoGallery.jsx:105-116` | proposition de blocage après signalement | `reports` (signale l'auteur de la photo) | **MANQUAIT → ajouté** |
| Participant d'un événement | fiche via la liste (`EventParticipantsList.jsx`) | idem | `reports` | existait |
| Actualités immigration (`info_articles`) | — | — | `info_reports` (table existante, **pas de bouton client**) | Contenu **éditorial** (équipe), pas du UGC : hors périmètre |

**Limites assumées** : (a) signaler un commentaire/une photo d'événement ou un message de conversation **signale
la personne** (table `reports`) et non l'élément : `event_reports` ne vise qu'un événement entier et la table
`reports` n'a pas de colonne « élément » — ajouter un type d'élément demanderait du SQL (non fait : décision
produit, voir §2.5) ; (b) pas de bouton « Bloquer » direct sur les commentaires d'événement ni sur une photo
(le blocage est proposé juste après le signalement).

### 2.2 Fiabilité du chemin (vérifiée par lecture et par tests)

- **Signalement enregistré** : `reports` (profils : catégories `harcelement, spam, faux_profil, contenu_inapproprie,
  arnaque, mineur_suspecte, autre`, contrainte `reports_category_check`), `post_reports`, `community_reports`
  (+ `usurpation`), `event_reports` (+ `faux_evenement`). Limites de débit côté serveur (20 signalements / 24 h,
  limite globale). **Bug trouvé et corrigé** : le fil proposait « Mineur suspecté » alors que la contrainte de
  `post_reports` le refuse (échec « Impossible d'envoyer ce signalement ») → le fil ne propose plus que les motifs
  acceptés (`src/lib/reportCategories.js`, test de dérive client/base `reportCategories.test.js`) ;
  `supabase-post-report-minor-category.sql` (nouveau, **à exécuter par le propriétaire**, optionnel) élargit la
  contrainte ; ensuite retirer le `.filter` de `POST_REPORT_CATEGORIES`.
- **Confirmation** : « Signalement envoyé » + « Merci, notre équipe va l'examiner » (`ReportModal.jsx:110-135`).
- **Un signalement de profil masque aussi le profil** des suggestions de la personne qui signale
  (`hidden_recommendations`, `App.jsx` `submitReport`).
- **Blocage immédiat côté client** : `blockedIds` (SocialShell) filtre Découverte/profils, fil (`PostsFeed.jsx:960,1068`),
  conversations/matchs (`getMatches` exclut les blocages), communautés (`CommunitiesTab.jsx:1535,1476,1565,1580`),
  événements (commentaires `EventsTab.jsx:1253` ; **photos `EventsTab.jsx:1262` et listes d'événements créés par la
  personne bloquée : ajoutés**), notifications (`SocialShell.jsx:1246`), statuts (`SocialShell.jsx:1575`), favoris/abonnés.
- **Le bloqué ne peut plus contacter** : garde RLS sur l'INSERT de `messages` (`supabase-scale-security.sql`), `likes`, `follows`, `favorites`,
  `event_invitations` (`supabase-block-bypass-fix.sql` → `supabase-target-account-state-guards-CONSOLIDATED-fix.sql`, dans `supabase-COMBINED-pending-fixes.sql`,
  **exécuté en prod** d'après `DEPLOIEMENT.md`) et sur l'INSERT de `post_likes`/`post_comments`/commentaires de communautés
  (`supabase-post-likes-comments-block-fix.sql`, `supabase-content-account-state-block-guards-remaining-fix.sql`, aussi dans le COMBINED).
  **Constat** : la LECTURE par un bloqué (`posts`, `post_comments`, `community_posts`, `event_comments`…) est filtrée par
  `supabase-content-select-block-filter-fix.sql`, qui **n'est ni dans le COMBINED ni dans `DEPLOIEMENT.md`** : il n'a donc très probablement **jamais été exécuté**
  → ce filtrage n'est aujourd'hui qu'**client** (un appel direct à l'API lit encore le contenu d'un bloqueur). Ajouté à `DEPLOIEMENT.md` §12c (fichier existant, non modifié).
  Volontairement non filtrés côté base même une fois exécuté : `events`, `event_media`, `reports*` → filtrage **client seulement** pour les événements et leurs photos.

### 2.3 Politique et contact (Apple 1.2 / 1.5, Google UGC)

- **CGU** (`src/legalContent.jsx`, §8) : paragraphe « tolérance zéro », comment signaler/bloquer, priorité aux signalements de mineurs et
  d'arnaques, délai **« visé d'environ 24 heures, sans que ce délai constitue un engagement »**, retrait de contenu et
  suspension/suppression. **[À VALIDER]** par le propriétaire/un juriste : la formule « environ 24 heures » (cible interne
  non engageante) ; ce délai n'est **pas** garanti par le code (traitement manuel par l'équipe).
- **Contact publié** : une seule constante, `src/config/contact.json` (`supportEmail`, `operatorName`), **vide**
  dans le dépôt. Vide : les pages publiques et légales affichent « utilisez le formulaire de signalement dans l'application
  (bouton « Signaler »… ou « Un souci, une idée ? » du menu du profil) » et **aucune adresse n'est inventée**.
  **[PROPRIÉTAIRE] à remplir : `supportEmail`** (et `operatorName`). Apple 1.2/1.5 et le champ « URL d'assistance » exigent un moyen
  de contact publié : **sans adresse, le risque de rejet Apple 1.2 est réel** (voir §15). Le formulaire « Un souci, une idée ? »
  existe dans l'app (`BetaFeedbackModal.jsx`, table `beta_feedback`) mais est réservé aux comptes connectés.
- **Filtre de contenu à la publication (Apple 1.2, 1ʳᵉ puce)** : **il n'existe pas** (aucune liste de mots, aucun filtre d'images :
  recherche dans `src` et le SQL). Apple le cite explicitement ; en pratique la revue accepte la combinaison
  *conditions + signalement + blocage + modération réactive*, mais c'est un point de rejet possible. Mitigation proposée
  (non implémentée, nouveau comportement et décision produit) : liste de termes interdits côté serveur (trigger
  `before insert` sur `posts`/`messages`…), ou outil de modération d'images. **[À VALIDER]**.

### 2.4 Outil d'administration déjà présent

`src/components/admin/AdminDashboard.jsx` (onglet « Admin » réservé aux rôles plateforme) + `supabase-admin.sql` :
**Tableau de bord** (utilisateurs, suspendus, bannis, signalements ouverts, retours), **Utilisateurs** (recherche, suspension
avec motif et durée, bannissement, rôles), **Signalements** (`admin_list_reports()` : union des 5 tables, **« mineur suspecté »
puis « arnaque » en tête**, `admin_resolve_report()` : résolu/ignoré), **Retours**. Rôles `moderator` / `admin` / `super_admin`
(`platform_roles`), actions journalisées dans `admin_actions` (acteur, cible, motif). Un compte banni/suspendu voit un écran
dédié (`App.jsx`). À exécuter en prod si pas fait : `supabase-admin-resolve-report-race-fix.sql` (course entre deux modérateurs).
**Constat** : les signalements d'un compte supprimé disparaissent (clés étrangères `on delete cascade`) — un utilisateur signalé
qui supprime son compte (24 h) efface les preuves ; voir §3.3.

### 2.5 Décisions produit en suspens (non faites ici)

1. Colonne « élément signalé » (message, commentaire, photo) dans `reports` : SQL + admin à adapter.
2. Filtre de contenu (§2.3).
3. Page publique « Normes de sécurité des enfants » exigée par Google pour les apps de rencontre (brouillon en §14, ligne « Google : normes CSAE »).

---

## 3. Suppression de compte

### 3.1 Flux réel (code lu)

1. **Accès** : avatar (haut à droite) → **Réglages** (`ProfileMenu.jsx:43-46`) → fenêtre « Paramètres » → **Zone de danger** → **Supprimer mon compte**
   (`AppModals.jsx:283-286`) → `DeleteAccountModal.jsx` : saisir **SUPPRIMER**, bouton « Programmer la suppression dans 24 heures ».
   Accessible **sans contacter le support** (Apple 5.1.1(v) ✔), sans mot de passe à ressaisir (réauthentification non exigée par Apple).
2. **Délai de grâce de 24 h** (« suppression planifiée ») : `profiles.deletion_requested_at` est posé ; le compte reste utilisable ;
   `AccountDeletionBanner.jsx` affiche « supprimé le … (N heures restantes) » avec **« Annuler la suppression »** (remet la colonne à `null`).
3. **Exécution** : tâche `pg_cron` horaire (`supabase-account-deletion.sql`, timeout 30 s : `supabase-account-deletion-timeout-fix.sql`) → edge function
   `process-scheduled-deletions` (autorisée par la clé service role) : annule les abonnements Stripe actifs, nettoie le Storage, supprime
   `auth.users` (la cascade supprime `profiles` et tout ce qui en dépend), puis filet `profiles.delete`.
4. **E-mail de confirmation de suppression** : **aucun** n'est envoyé (ni à la demande, ni à l'exécution). Recommandé mais non exigé par les
   boutiques ; à ajouter en même temps que l'e-mail de support (hors périmètre de cette étape).
5. **Fonction `delete-account`** : citée dans d'anciens commentaires mais **absente du dépôt** ; seule `process-scheduled-deletions` existe.

### 3.2 Ce qui est RÉELLEMENT effacé (après le délai)

| Donnée | Effacée ? | Mécanisme |
| --- | --- | --- |
| Compte de connexion (e-mail, mot de passe) | Oui | `auth.admin.deleteUser` |
| Profil, préférences, localisation (`user_locations`), photos (lignes) | Oui | cascade (`profiles`, `auth.users`) |
| Jetons de notification `push_subscriptions` et `device_push_tokens` | Oui | cascade `auth.users` |
| Messages **envoyés**, réactions | Oui | cascade `messages.from_id` |
| Publications, commentaires, likes, statuts, vues | Oui | cascade |
| Publications / commentaires de communautés, adhésions, invitations, demandes | Oui | cascade |
| Participations, invitations, commentaires et photos d'événements, signalements envoyés | Oui | cascade |
| Likes, passes, favoris, suivis, blocages, masquages | Oui | cascade |
| `beta_events`, `beta_feedback`, `analytics_events`, `ai_usage`, `subscriptions`, `subscription_events` | Oui | cascade |
| Abonnement Stripe actif | Résilié (`stripe.subscriptions.cancel`) | fonction |
| **Fichiers Storage** : `avatars/<user>/` (photos + médias de statuts), `chat-media` (fichiers envoyés par le compte), `event-media` (photos postées), `post-media/<user>/` | Oui | fonction (**listage paginé désormais : avant, seuls les 100 premiers fichiers d'un dossier étaient supprimés**) |
| **Fichiers Storage `community-media`** (photos/vidéos de publications de communauté) | **Non jusqu'ici → corrigé dans le code** | nouveau code dans `process-scheduled-deletions` : **à redéployer par le propriétaire** (`DEPLOIEMENT.md` §12b) |
| Couvertures de communautés / `event-covers` des événements créés | Non, volontairement | la communauté/l'événement survit (`created_by` → `null`) ; la couverture ne doit pas casser |

### 3.3 Ce qui reste (à déclarer aux boutiques et dans la politique)

- **Messages écrits par d'autres personnes** à ce compte : restent chez leurs auteurs.
- **Communautés et événements créés** : continuent d'exister sans leur créateur (`created_by` mis à `null`) ; le transfert de propriété automatique
  existe en SQL (`supabase-community-orphan-account-deletion-fix.sql`, `supabase-event-orphan-account-deletion-fix.sql`) mais **n'est pas exécuté** en prod.
- **Journal d'administration** `admin_actions` : cible mise à `null` (conservé, anonymisé) ; **`client_errors`** : `profile_id` mis à `null`, purge à 30 jours ;
  **notifications d'autres membres** mentionnant ce compte : `actor_id` à `null`, purge à 90 jours.
- **Signalements** (envoyés **ou reçus**) : supprimés par cascade avec le compte : **la suppression de compte efface les preuves d'un signalement
  contre ce compte**. Conserver ces preuves (obligation légale ? sécurité des mineurs ?) est une **décision du propriétaire [À VALIDER]**.
- **Sauvegardes** des prestataires (Supabase) et **données de paiement chez Stripe** (client Stripe non supprimé par la fonction) : conservation selon leurs
  règles ; à confirmer dans leurs consoles **[PROPRIÉTAIRE]**.
- Aucune durée de conservation n'a été inventée dans le texte public : seules les durées lues dans le code y figurent (24 h, 90 j, 30 j, 24 h).

### 3.4 Exigences des boutiques

- **Apple 5.1.1(v)** : ✔ dans l'app, planifiée (autorisé), annulable. Prévoir (si Premium vendu via Apple, §6) un message sur la résiliation de l'abonnement Apple.
- **Google Play** : ✔ chemin dans l'app + **page web `/suppression-compte`** (nouvelle, `src/screens/public/DeleteAccountPage.jsx`), à déclarer **[PROPRIÉTAIRE]**
  dans Play Console → Contenu de l'application → Sécurité des données → « Supprimer le compte » :
  `https://baobab-app-zeta.vercel.app/suppression-compte` (domaine : `src/config/publicOrigin.json`). La page nomme « Baobab », met la suppression en avant,
  décrit les étapes, le délai, ce qui est supprimé/conservé et renvoie vers le contact (vide tant que `contact.json` l'est : l'URL fonctionne mais, sans
  adresse, il n'y a **qu'un** moyen — l'app ; Google demande « plusieurs méthodes » de préférence → **renseigner `supportEmail`**).

---

## 4. Connexion tierce

`grep signInWithOAuth|signInWithIdToken|provider` dans `src` : **aucun résultat** ; `src/Auth.jsx` n'utilise que `signUp`,
`signInWithPassword`, `resetPasswordForEmail`. **« Se connecter avec Apple » n'est donc PAS requis** : règle 4.8 (« Login Services »)
— l'option équivalente n'est exigée que pour les apps qui utilisent un service de connexion tiers/social pour la configuration ou
l'authentification principale du compte ; exception explicite pour *« l'utilisation exclusive du système de comptes de l'entreprise »*
(https://developer.apple.com/app-store/review/guidelines/, 4.8). **Si on ajoute un jour Google/Facebook, Sign in with Apple devient obligatoire.**

## 5. Âge 18+

- **Client** : onboarding `Step1Identity.jsx` — `computeAge()` (date de naissance → âge, ajusté au jour près), `isStep1Valid` exige **18 ≤ âge ≤ 100** ;
  message « Tu dois avoir au moins 18 ans pour utiliser Baobab. » ; édition du profil `App.jsx:2076-2080` (même règle, même borne haute) ; l'inscription
  par e-mail exige de cocher l'acceptation des Conditions (qui rappellent « y compris la condition d'âge minimum de 18 ans », `Auth.jsx:654-669`) et enregistre
  `terms_accepted_at`. La date de naissance est demandée **à l'onboarding** (juste après l'inscription), pas dans le formulaire d'inscription.
- **Serveur** : **`supabase-age-check-server-side.sql` — NON exécuté** (contrainte `profiles_min_age_18`, `not valid`), livré tel quel (non réécrit).
  Sans lui, un appel direct à l'API peut enregistrer une date de naissance de mineur. **Action prioritaire du propriétaire**, avant toute soumission
  aux boutiques (Apple 1.2 / Google CSAE) ; puis, après vérification qu'aucune ligne existante ne la viole, `validate constraint`.
- **Signalement d'un mineur suspecté** : motif dédié, traité en tête par l'admin (§2.4).
- Pas de vérification d'âge par pièce d'identité (déclaratif) : à indiquer honnêtement dans les questionnaires (§11).

---

## 6. Achats intégrés (premium) — analyse, RIEN d'implémenté

### 6.1 Ce qui existe aujourd'hui

- **Offre** (`src/lib/premium/premiumConfig.js`) : Mensuel 9,99 $ CAD, Annuel 79,99 $ CAD ; avantages **actifs** : filtres de recherche avancés (Découverte),
  voir qui m'a aimé·e en premier (admirateurs), badge Premium. La messagerie limitée existe en SQL mais `app_config.monetization_enabled = false`.
- **Où c'est vendu / affiché** : onglet `premium` (`PremiumPage.jsx` : `startCheckout(plan)` → fonction `create-checkout-session` → redirection `window.location.href` vers
  Stripe Checkout) ; `ProfileTab.jsx` (bloc « Passer à Premium » avec prix, « Voir tous les détails », « Paiement sécurisé par Stripe », « Gérer » → `openBillingPortal()` →
  `create-portal-session`) ; `Paywall.jsx` (utilisé par `DiscoverTab.jsx:609` filtres, `AdmirersModal.jsx:55`) ; `ConversationPane.jsx:719` (« Passer à Premium » si limite).
  Retour de paiement `?premium=success|cancelled` géré par `App.jsx` (`create-checkout-session` renvoie vers `SITE_URL`).
- **Source de vérité** : `subscriptions` (écrite **uniquement** par `stripe-webhook`, service role) ; `is_premium()` (SQL) et `usePremiumStatus`.
- **État** : `stripe-webhook` et `cleanup-expired-stories` répondent **404** (jamais déployés, `DEPLOIEMENT.md` §2) ; sans clés Stripe, `create-checkout-session`
  répond « Abonnement Premium temporairement indisponible ». **Le Premium n'est donc pas actif aujourd'hui** (aucun abonné possible), mais l'**interface d'achat est
  visible** : elle serait embarquée telle quelle dans l'app native. **Rien n'a été masqué** dans l'UI à cette étape.

### 6.2 Règles (citées, vérifiées le 7 octobre 2026)

- **Apple 3.1.1** : pour *débloquer des fonctions* (abonnements, contenu premium, déverrouillage de version complète), **il faut l'achat intégré**.
  **3.1.1(a)** : les boutons/liens/appels à l'action vers un autre moyen d'achat sont permis **sans droit particulier seulement dans les apps de la boutique
  américaine** ; ailleurs (dont le **Canada**) il n'y en a **aucun** (les droits « StoreKit External Purchase » ne visent que des boutiques précises). Aucun
  changement au Canada à ce jour (recours CIPPIC en cours, sans effet).
- **Apple 3.1.3(b) « multiplateforme »** : une app peut donner accès à ce qui a été acquis **sur le web ou ailleurs**, **« à condition que ces éléments soient
  aussi achetables dans l'app »**. Conséquence : « Premium acheté sur le web et honoré dans l'app iOS, **sans** achat intégré » **n'est pas couvert**.
  **3.1.3(a) « Reader »** ne s'applique pas (ce n'est pas du contenu consommé type livres/vidéo).
- **Apple 3.1.2** : abonnement ≥ 7 jours, fonctionnel sur tous les appareils de l'utilisateur ; informations (durée, contenu, prix) avant l'achat ;
  **restauration des achats** à prévoir.
- **Google Play (paiements)** : facturation Google Play obligatoire pour les fonctions/abonnements numériques **dans l'app** ; **interdit de mener l'utilisateur vers un autre
  moyen de paiement** (fiche, promotions, **WebView**, inscription) — hors programmes dans certains pays (pas de programme applicable au Canada trouvé dans la page lue).
  Un bouton « Passer à Premium » qui ouvre Stripe dans la WebView = **rejet** probable.
- **Commissions** : Apple 30 %, **15 %** pour le Small Business Program (≤ 1 M USD) et les abonnements qualifiés ; Google (région « historique », Canada) **15 % jusqu'à
  1 M USD/an**, puis 30 % (abonnements : 15 % dans cette structure — **à reconfirmer en Play Console**). Pour 9,99 $ CAD : ≈ 1,50 $ de commission à 15 % (8,49 $ nets avant
  taxes) contre ≈ 3,00 $ à 30 % (6,99 $) ; annuel 79,99 $ : 12,00 $ ou 24,00 $ (taxes de vente à part, gérées différemment selon boutique).
- **Risques de rejet** : (1) boutons/prix/« Stripe » visibles dans l'app native (Apple 3.1.1 + Google paiements) ; (2) premium web honoré sans IAP (3.1.3(b)) ; (3) description
  de la fiche qui promet des fonctions payantes sans achat possible ; (4) Premium non restaurable.

### 6.3 Options

| | A. Premium web seulement, CTA masqués en natif, achats web **honorés** | B. Achats intégrés (RevenueCat / StoreKit 2 / Play Billing) + table `subscriptions` unifiée | C. Pas de Premium au lancement natif |
| --- | --- | --- | --- |
| Apple | **Risque élevé** : 3.1.3(b) exige l'IAP pour honorer l'achat web | Conforme | Conforme |
| Google | Risque modéré (honorer ≠ rediriger) si **aucun** CTA/prix dans l'app | Conforme | Conforme |
| Effort | ≈ 1 jour (masquer CTA par `isNative()`) | **≈ 8 à 12 jours-développeur** (estimation) + paramétrage boutiques | ≈ 1 jour |
| Coûts | 0 | commission 15 % (si éligible) + RevenueCat 0 € jusqu'à 2 500 USD/mois suivis puis 1 % | 0 |
| Revenu natif | 0 (web seulement) | oui | 0 |

### 6.4 RECOMMANDATION (chiffrée)

**Lancement natif = option C** (aucun Premium, aucun prix ni lien d'achat dans l'app native ; les fonctions réservées au Premium soit sont masquées, soit
sont ouvertes à tous — décision produit **[À VALIDER]** — les comptes gratuits ne perdent rien de ce qu'ils ont aujourd'hui puisque le Premium n'a **aucun
abonné**), implémentée en **un petit changement au pas 5 ou juste avant la première soumission** (≈ 1 jour : masquer `PremiumPage`, le bloc de `ProfileTab.jsx`,
`Paywall`/`ConversationPane` quand `isNative()`, sans toucher au web). Raison : Stripe n'est pas déployé, il n'y a aucun revenu à protéger, et A est
**non conforme sur iOS** (3.1.3(b)). **Option B seulement après le lancement**, quand le Premium web aura des abonnés ou une demande démontrée :
1) paramétrer produits + prix dans App Store Connect et Play Console **[PROPRIÉTAIRE]** ; 2) RevenueCat + plugin `@revenuecat/purchases-capacitor` (à épingler à la version
compatible Capacitor 8 au moment de l'adoption) ; 3) nouveau SQL : colonnes `provider` (`stripe|apple|google`) et `provider_subscription_id` sur `subscriptions`, unicité par
fournisseur, `is_premium()` inchangée (lit déjà `status`/`current_period_end`) ; 4) nouvelle edge function `revenuecat-webhook` qui écrit dans `subscriptions` +
`subscription_events` (idempotente, comme `stripe-webhook`) ; 5) UI native : écran d'abonnement via le plugin, **« Restaurer mes achats »**, gestion via les réglages
de la boutique ; web inchangé (Stripe) ; 6) suppression de compte : message « ton abonnement Apple/Google continue de facturer » (Apple l'exige) + lien de gestion ;
7) tests + liste de contrôle appareil réel (sandbox Apple, testeurs de licence Google). Déployer d'abord `stripe-webhook` (`DEPLOIEMENT.md` §2a) si le Premium web doit exister.

---

## 7. Pages légales et placeholders propriétaire

| Élément | Où | État |
| --- | --- | --- |
| Politique de confidentialité / Conditions **dans l'app** | Réglages → « Confidentialité » / « Conditions d'utilisation » (`AppModals.jsx:259,263`) ; à l'inscription : cases + liens (`Auth.jsx:654-669`, pied de page `Auth.jsx:717-719`) | ✔ |
| **Par URL publique** | `/confidentialite`, `/conditions`, `/a-propos`, **`/suppression-compte`** (sitemap, canonical par route) | ✔ |
| En natif | Les textes sont affichés **dans l'app** (modales de `legalContent.jsx`) : aucun navigateur externe, aucune dépendance ajoutée | ✔ |
| Texte à jour (7 oct. 2026) | `src/legalContent.jsx` : localisation approximative, push, photos/vidéos/voix, Stripe, Anthropic, diagnostics, stockage local, durées réelles, tolérance zéro | ✔ — **[À VALIDER] par un juriste** (le fichier le dit déjà) |
| `supportEmail` | `src/config/contact.json` | **[PROPRIÉTAIRE] vide** |
| `operatorName` (responsable du traitement) | idem | **[PROPRIÉTAIRE] vide** (seule mention existante : « BAOBAB — BY LESSI PATRICK » sur À propos) |
| Droit applicable / juridiction (CGU §12) | `legalContent.jsx` | générique, **[PROPRIÉTAIRE] à préciser** |
| Durées de conservation des sauvegardes / de Stripe / de Supabase | — | **non indiquées** (inconnues) **[PROPRIÉTAIRE]** |
| Tutoiement (app) / vouvoiement (textes légaux) | — | inchangé, choix éditorial |
| Mention « ne jamais utilisé pour entraîner un modèle d'IA » (confidentialité §11) | texte antérieur conservé | **[À VALIDER]** contre les conditions d'Anthropic applicables à votre compte API |
| Clé API Anthropic (ai-assist) | edge function | non reconfirmée (mémoire du projet) |

---

## 8. App Privacy d'Apple — réponses proposées (App Store Connect → Confidentialité de l'app)

Hypothèse : **version native sans Premium** (§6.4). **Suivi (tracking) : NON** (aucune donnée croisée avec des tiers ni courtier). Aucune publicité.

| Catégorie (officielle) | Type | Collectée ? | Liée à l'identité | Finalités |
| --- | --- | --- | --- | --- |
| Coordonnées | Adresse e-mail | Oui | Oui | Fonctionnalité de l'app |
| Coordonnées | Nom | Oui | Oui | Fonctionnalité de l'app |
| Localisation | **Localisation approximative** | Oui | Oui | Fonctionnalité de l'app, personnalisation du produit |
| Localisation | Localisation précise | **Non** | — | — |
| Données sensibles | (origine nationale/statut d'immigration) | **Oui [À VALIDER]** : prudence — pays d'origine et statut d'immigration ne figurent pas dans la liste exacte d'Apple (origine ethnique, orientation, religion…), mais peuvent s'en rapprocher ; sur-déclarer coûte moins cher que sous-déclarer | Oui | Fonctionnalité de l'app, personnalisation |
| Contenu de l'utilisateur | Photos ou vidéos | Oui | Oui | Fonctionnalité de l'app |
| Contenu de l'utilisateur | Données audio (messages vocaux) | Oui | Oui | Fonctionnalité de l'app |
| Contenu de l'utilisateur | E-mails ou messages texte (messages dans l'app) | Oui | Oui | Fonctionnalité de l'app |
| Contenu de l'utilisateur | Assistance client (retours « Un souci, une idée ? ») | Oui | Oui | Fonctionnalité de l'app |
| Contenu de l'utilisateur | Autre contenu (bio, publications, commentaires, événements) | Oui | Oui | Fonctionnalité de l'app |
| Identifiants | ID utilisateur | Oui | Oui | Fonctionnalité de l'app, analyses |
| Identifiants | ID d'appareil (jeton de notification APNs) | Oui **[À VALIDER]** | Oui | Fonctionnalité de l'app |
| Données d'utilisation | Interaction avec le produit (`beta_events`, `analytics_events`) | Oui | Oui | Analyses, fonctionnalité de l'app |
| Diagnostics | Données de plantage / autres données de diagnostic (`client_errors`) | Oui | Oui si connecté | Fonctionnalité de l'app |
| Achats | Historique d'achats | **Non** tant que le Premium n'est pas dans l'app native ; **Oui** après l'option B | — | — |
| Informations financières | Paiement | **Non** (Stripe Checkout hébergé, hors app) | — | — |
| Contacts, Santé, Historique de navigation, Historique de recherche | — | **Non** (les termes saisis dans la recherche servent la requête et ne sont pas conservés) | — | — |

Politique de confidentialité (obligatoire) : `https://baobab-app-zeta.vercel.app/confidentialite` ; « Choix de confidentialité » : facultatif.

## 9. Sécurité des données de Google Play — réponses proposées

« L'app collecte-t-elle ou partage-t-elle des données ? » **Oui, collecte.** « Partage » : **Non** — Supabase, Vercel, FCM, Stripe et Anthropic traitent des données **pour le compte de Baobab** (prestataires,
exclus de la définition du partage par Google) **[À VALIDER]**. « Toutes les données sont chiffrées en transit » : **Oui**. « Les utilisateurs peuvent demander la suppression » : **Oui** + URL (§3.4).

| Catégorie Google | Type | Collectée | Obligatoire / facultative | Finalités |
| --- | --- | --- | --- | --- |
| Localisation | Position approximative | Oui | **Obligatoire** pour le service de rencontres (accès Canada) | Fonctionnalités de l'app, personnalisation |
| Infos personnelles | Nom, adresse e-mail, ID utilisateur | Oui | Obligatoire | Fonctionnalités, gestion du compte |
| Infos personnelles | Autres infos (date de naissance, pays d'origine, langues, statut d'immigration, préférences) | Oui | Obligatoire (naissance) / facultatives | Fonctionnalités, personnalisation |
| Messages | Messages dans l'app | Oui | Facultative | Fonctionnalités |
| Photos et vidéos | Photos, vidéos | Oui | Facultative | Fonctionnalités |
| Fichiers audio | Enregistrements vocaux | Oui | Facultative | Fonctionnalités |
| Activité dans l'app | Interactions, autre contenu généré (publications, commentaires) | Oui | Obligatoire (interactions) | Analyses, fonctionnalités |
| Infos et performances de l'app | Journaux d'erreurs, diagnostics | Oui | Facultative | Analyses |
| Appareil ou autres ID | Jeton de notification | Oui | Facultative (opt-in) | Fonctionnalités |
| Infos financières | Historique d'achats / paiement | **Non** (version sans Premium natif) | — | — |
| Contacts, calendrier, santé, historique web | — | Non | — | — |

Politique de confidentialité : `…/confidentialite`. **Public cible : 18 ans et plus**, cocher « Restreindre l'accès aux mineurs » **[À VALIDER]**. Catégorie : **Rencontres** (existe sur Google Play).
Autres déclarations de la Play Console à remplir **[PROPRIÉTAIRE]** : publicités (non), accès aux apps financières/santé (non), **normes de sécurité des enfants** (voir §15).

## 10. Privacy manifest iOS (à finaliser à l'étape 5 avec le projet iOS)

Fichier à créer : `ios/App/App/PrivacyInfo.xcprivacy` (+ ceux des plugins, fournis par leurs paquets Swift). **Probable, à confirmer** par « Product → Archive → Générer un rapport de
confidentialité » dans Xcode (agrège les manifestes de l'app et des SDK) — les plugins `@capacitor/*` utilisés (app, camera, geolocation, haptics, keyboard, push-notifications, share,
splash-screen, status-bar) et Capacitor lui-même touchent **probablement** : `NSPrivacyAccessedAPICategoryUserDefaults` (raison `CA92.1`), `NSPrivacyAccessedAPICategoryFileTimestamp`
(`C617.1`), peut-être `DiskSpace` (`E174.1`) et `SystemBootTime` (`35F9.1`) — **aucune de ces raisons n'a été vérifiée dans le code des plugins** (pas de projet iOS ici).
Squelette (valeurs à valider) :
```xml
<key>NSPrivacyTracking</key><false/>
<key>NSPrivacyTrackingDomains</key><array/>
<key>NSPrivacyCollectedDataTypes</key><array><!-- un dict par type du §8 : EmailAddress, Name, CoarseLocation, PhotosorVideos, AudioData,
  EmailsOrTextMessages, CustomerSupport, OtherUserContent, UserID, DeviceID, ProductInteraction, CrashData/OtherDiagnosticData ;
  Linked=true, Tracking=false, Purposes=AppFunctionality (+Analytics / ProductPersonalization selon le tableau) --></array>
<key>NSPrivacyAccessedAPITypes</key><array><!-- UserDefaults CA92.1, FileTimestamp C617.1, … selon le rapport Xcode --></array>
```
Les messages d'usage `Info.plist` (caméra, photothèque, localisation) sont listés dans `MOBILE.md` (« Permissions »).

---

## 11. Questionnaires d'âge

**Apple** (App Store Connect → Informations de l'app → Classification d'âge) — réponses proposées : *Contrôles parentaux* : Non ; *Garantie d'âge* : **à valider** (la date de naissance
est déclarative, pas une vérification : plutôt « Non ») ; *Accès web sans restriction* : Non ; ***Contenu généré par les utilisateurs* : Oui** ; ***Messagerie et chat* : Oui** ; ***Réseau social* : Oui**
(fil, j'aime, commentaires → 13+ minimum) ; *Publicité* : Non ; *Thèmes matures, sexualité/nudité, violence, jeux d'argent, médical* : **Aucun** (le contenu explicite est interdit et modéré) ; puis
**« Override to Higher Age Rating » → 18+** : obligatoire car nos Conditions imposent 18 ans (https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating).
Relire les questions exactes dans la console.

**Google Play** : *Public cible* : **18 ans et plus uniquement** + « Restreindre l'accès aux mineurs » ; *Questionnaire de contenu (IARC)* : catégorie **réseau social / rencontres** ; violence : non ; contenu sexuel : non
(le contenu explicite est interdit, modéré par signalement) — mais l'app contient du **contenu généré par les utilisateurs** et des **interactions entre utilisateurs** : répondre « oui » à l'interaction/au partage d'informations ;
partage de localisation : oui (approximative) ; achats numériques : non (version sans Premium) ; accès internet sans restriction : non. La note est calculée par territoire : la lire et vérifier qu'elle est cohérente avec 18+.

---

## 12. Fiche de la boutique — brouillons à valider

**Catégories** : Apple **Réseaux sociaux** (pas de catégorie « Rencontres » ; secondaire : Style de vie, facultatif) ; Google **Rencontres**. **Nom** : « Baobab : rencontres au Canada » (29/30 — **vérifier la disponibilité**).

**Apple — sous-titre (30)** : « Rencontres et communauté » · **Texte promotionnel (170)** : « Rencontre des personnes qui vivent la même aventure que toi, au Canada : profils, messages, communautés et événements. Réservé aux 18 ans et plus. »

**Mots-clés Apple (≤ 100 caractères, séparés par des virgules, sans espaces inutiles)** : `rencontres,immigrants,nouveaux arrivants,Canada,diaspora,amitié,communauté,événements,francophone`

**Description courte Google (≤ 80)** — FR : « Rencontres et communauté pour les personnes qui s'installent au Canada. » · EN : « Dating and community for newcomers settling in Canada. »

**Description longue — FR (≤ 4 000)** :
> Baobab est une application de rencontres et de communauté pensée pour les personnes immigrantes et de la diaspora qui s'installent au Canada.
>
> • Découverte : parcours des profils, compatibilité estimée à partir de ce que tu choisis de renseigner (ville, langues, centres d'intérêt, ce que tu recherches).
> • Messages : conversations privées avec tes matchs, photos, messages vocaux, traduction facultative d'un message.
> • Communautés et événements : rejoins des groupes, crée ou participe à des sorties près de chez toi.
> • Fil et statuts : partage des nouvelles ; les statuts disparaissent après 24 heures.
> • Ton contrôle : tu choisis les champs visibles sur ton profil, tu peux masquer ton statut en ligne, signaler un contenu, bloquer une personne et supprimer ton compte depuis l'application.
>
> Baobab est réservé aux personnes de 18 ans et plus, le service de rencontres est réservé aux personnes se trouvant au Canada, et une politique de tolérance zéro s'applique au harcèlement et aux contenus répréhensibles. Nous ne garantissons pas qu'une rencontre aura lieu : l'application facilite la mise en relation, elle ne remplace pas la prudence (premier rendez-vous dans un lieu public, ne jamais envoyer d'argent).
>
> Les suggestions d'intelligence artificielle (reformulation, traduction, amorces de conversation) sont facultatives et désactivables.

**Description longue — EN (≤ 4,000)** :
> Baobab is a dating and community app for immigrants and diaspora members settling in Canada.
>
> • Discover: browse profiles with an estimated compatibility based on what you choose to share (city, languages, interests, what you're looking for).
> • Messages: private chats with your matches, photos, voice messages, optional translation of a single message.
> • Communities and events: join groups, create or attend outings near you.
> • Feed and stories: share updates; stories disappear after 24 hours.
> • Your control: choose which profile fields are visible, hide your online status, report content, block people and delete your account from within the app.
>
> Baobab is for adults aged 18 and over, the dating service is limited to people located in Canada, and we apply a zero-tolerance policy to harassment and objectionable content. We do not guarantee that you will meet someone: the app helps people connect, it does not replace common sense (meet in a public place first, never send money).
>
> AI suggestions (rewording, translation, conversation starters) are optional and can be turned off.

**Règles de rédaction** : aucune promesse de résultat (« trouve l'amour », « 100 % vérifiés » : **interdit**) ; ne pas mentionner « Premium » dans la fiche de la version native sans Premium (§6) ; ne pas dire « gratuit » si des fonctions payantes
existent ailleurs ; mentionner l'âge 18+ et la zone Canada. **URL d'assistance** (obligatoire Apple) : page ou adresse de contact **[PROPRIÉTAIRE]** (voir `supportEmail`). **URL marketing** : facultative.

## 13. Captures d'écran à fournir

À prendre sur un compte de test avec contenu **fictif** (jamais de vraies personnes) : 1) Découverte (pile) ; 2) profil détaillé ; 3) match / liste de messages ; 4) conversation ; 5) communautés ; 6) événements ; 7) fil + statuts ;
8) Réglages de confidentialité / « Signaler et bloquer » (montre la sécurité). Tailles (voir §0 — **relire dans la console à l'envoi**) :

| Boutique | Taille | Remarque |
| --- | --- | --- |
| Apple iPhone | **6,9" : 1320×2868** (ou 1290×2796 / 1260×2736) — ou 6,5" 1284×2778 — ou 6,3" 1206×2622 / 6,1" 1179×2556 | 1 à 10, PNG/JPEG **sans transparence** ; la plus grande taille requise est mise à l'échelle pour les autres |
| Apple iPad (si l'app est proposée sur iPad) | **13" : 2064×2752** (ou 2048×2732) | décider à l'étape 5 si iPad est pris en charge |
| Google téléphone | 2 à 8 captures, côté 320 à 3 840 px, rapport ≤ 2:1 (recommandé 1080×1920 ou 1920×1080) | |
| Google icône / image de présentation | **512×512 PNG ≤ 1 024 Ko** / **1024×500** (JPEG ou PNG 24 bits sans alpha) | l'icône source est `public/icon-512.png` ; image 1024×500 : **à créer** **[PROPRIÉTAIRE]** |
| Google tablettes 7"/10" | 1080–7680 px, 16:9 ou 9:16 | facultatif |

---

## 14. Ce que le propriétaire doit faire lui-même

| # | Tâche | Détail / coût | Où |
| --- | --- | --- | --- |
| 1 | **Remplir `src/config/contact.json`** (`supportEmail`, `operatorName`) | gratuit ; adresse dédiée (ex. de support) — **ne pas utiliser une adresse personnelle publique sans y avoir réfléchi** ; coût d'un domaine/boîte : à estimer (non vérifié) | dépôt |
| 2 | **Exécuter `supabase-age-check-server-side.sql`** (priorité haute, déjà livré) | 0 € | Supabase SQL Editor |
| 3 | Exécuter `supabase-post-report-minor-category.sql` (optionnel) puis retirer le `.filter` de `POST_REPORT_CATEGORIES` | 0 € | `DEPLOIEMENT.md` §12a |
| 4 | **Redéployer `process-scheduled-deletions`** (médias de communautés + listage paginé) ; vérifier le cron (`net._http_response`) | 0 € | `DEPLOIEMENT.md` §12b |
| 5 | Exécuter `supabase-community-orphan-account-deletion-fix.sql` et `supabase-event-orphan-account-deletion-fix.sql` (déjà livrés, non exécutés) | 0 € | `DEPLOIEMENT.md` §1e-1f |
| 6 | **Compte développeur Apple** | **99 USD/an** ; **particulier : pas de D-U-N-S** (nom légal affiché comme vendeur) ; **organisation : D-U-N-S obligatoire** + entité légale + site web ; double authentification | developer.apple.com |
| 7 | **Compte Google Play** | **25 USD, une fois** ; pièce d'identité officielle + carte à son nom ; vérification d'un appareil Android | play.google.com/console |
| 8 | **Test fermé Google : 12 testeurs, 14 jours consécutifs** (comptes personnels créés après le 13 nov. 2023), puis « Demander l'accès à la production » (≈ 7 jours) | à prévoir **3 semaines** avant la production ; recruter 12 personnes réelles | Play Console |
| 9 | **Page « Normes de sécurité des enfants »** + contact désigné (Google, apps Rencontres/Social) | brouillon à valider : *Baobab interdit toute exploitation ou mise en danger sexuelle d'enfants ; réservé aux 18+ ; moyens de signalement dans l'app (« Mineur suspecté ») ; retrait du contenu et bannissement ; transmission aux autorités compétentes lorsque la loi l'exige ; contact : …* **[À VALIDER]** (engagement légal) | à publier sur une URL puis la déclarer en Play Console |
| 10 | URL de la politique de confidentialité, URL d'assistance, URL de suppression | `…/confidentialite`, **à fournir**, `…/suppression-compte` | consoles |
| 11 | **Compte de démonstration pour les relecteurs** (jamais dans le dépôt) | compte e-mail **déjà confirmé**, onboarding terminé, avec une **position au Canada récente** (`user_locations.last_in_canada_at`, tolérance 60 jours, sinon l'onglet Rencontres est bloqué hors Canada) et quelques profils fictifs ; identifiants à saisir dans « Notes pour la revue » | App Store Connect / Play Console |
| 12 | Firebase (FCM, `google-services.json`, compte de service), clé APNs `.p8`, empreinte SHA-256, Team ID | Firebase **sans frais** (FCM) ; voir `MOBILE.md` étape 3a | Firebase / Apple |
| 13 | Signature Android (keystore + Play App Signing), `versionCode` croissant | gratuit ; **sauvegarder la clé hors dépôt** | `MOBILE.md` |
| 14 | CI macOS pour iOS (étape 5) | runner GitHub macOS **0,062 USD/min** : un build ≈ 15 à 25 min ≈ 1 à 1,6 USD ; **estimation** ~20 builds/mois ≈ 20 à 30 USD (non vérifié) ; Mac physique non indispensable avec la CI mais utile pour déboguer | GitHub |
| 15 | Décisions : filtre de contenu (§2.3), conservation des signalements (§3.3), Premium au lancement (§6.4), Données sensibles Apple (§8) | — | — |
| 16 | Revue juridique des textes (§7), droit applicable, durées de sauvegarde | budget à fixer | — |
| 17 | Image de présentation Google 1024×500, captures, textes localisés | design | — |
| 18 | Si Premium natif plus tard : produits IAP dans App Store Connect et Play Console, accords « Apps payantes » | commission 15 % (Small Business / première tranche Google) ; RevenueCat gratuit jusqu'à 2 500 USD/mois | consoles |

---

## 15. Liste de contrôle des tests sur appareils réels (rien n'a pu être exécuté ici)

- **Appareils** : Android récent (14–16) **et** ancien (API 24–28), iPhone récent **et** ancien (iOS minimal pris en charge à l'étape 5), petit écran + tablette.
- **Inscription / connexion** : e-mail de confirmation (le lien s'ouvre-t-il dans l'app ?), mot de passe oublié, refus de la date de naissance < 18 ans, case des Conditions.
- **Permissions** : localisation **refusée** (écran de garde, bouton « Réessayer »), appareil photo refusé, micro refusé, notifications refusées (Android 13+), puis autorisées dans les réglages au retour.
- **Notifications** app **fermée** et en arrière-plan : message, match ; clic → bonne conversation ; après déconnexion : plus de notification.
- **Mode avion / réseau coupé** : bandeau hors ligne, envoi d'un message coupé en vol, reprise.
- **Liens profonds** : `/event/…`, `/profile/…`, `/messages/…`, `/update-password`, `?verified=1` ; lien invalide ignoré.
- **Suppression de compte** : planifier, voir le bandeau, annuler, replanifier ; (en préproduction) laisser expirer et vérifier : compte, fichiers Storage (y compris `community-media`), jeton push.
- **Signalement / blocage** : sur **chaque surface du §2.1** ; vérifier la confirmation, la proposition de blocage, la disparition immédiate du contenu du bloqué (fil, conversations, communautés, événements, notifications), et que le bloqué ne peut plus écrire.
- **Légal** : politique et conditions depuis Réglages et l'inscription ; `/suppression-compte` depuis un navigateur ; liens `mailto:` une fois l'adresse renseignée.
- **Retour Android, partage, haptique, caméra** (`MOBILE.md` 3b) ; **Premium** : vérifier qu'**aucun** prix/lien d'achat n'apparaît dans la version native (§6.4).
- **Compte de démonstration** : se connecter comme le relecteur, hors Canada (onglet Rencontres accessible grâce à `last_in_canada_at`).

## 16. Risques de rejet par la boutique et mitigation

| Risque | Règle | Gravité | Mitigation |
| --- | --- | --- | --- |
| **UGC sans filtre ni contact publié** | Apple 1.2 / 1.5, Google UGC | Élevée | Contact publié (`supportEmail`), CGU « tolérance zéro » (faite), signalement/blocage sur toutes les surfaces (fait) ; ajouter un filtre de termes (§2.3) ; notes de revue décrivant la modération |
| **Paiement externe / Premium** | Apple 3.1.1, 3.1.3(b) ; Google paiements | Élevée | Ne **pas** montrer de CTA Stripe en natif (option C, §6.4) |
| **Mineurs** | Apple 1.2, Google CSAE | Élevée | Contrainte 18 ans côté **serveur** (SQL à exécuter), motif « Mineur suspecté », page CSAE, contact désigné, classification 18+ |
| **Contenu sexuel / « hookup »** | Apple 1.1.4, Google UGC | Moyenne | Conditions interdisant le contenu explicite, modération, description non suggestive (§12), pas de captures dénudées |
| **Localisation** | Apple 5.1.1/5.1.2, Google données | Moyenne | Approximative seulement, explication avant la demande, refus géré, textes d'usage iOS (`MOBILE.md`) ; la **restriction au Canada peut bloquer le relecteur** → compte de démonstration (§14 n°11) |
| **Suppression de compte** | Apple 5.1.1(v), Google | Moyenne | Faite (dans l'app + page web) ; redéployer la fonction ; surveiller le cron |
| **Âge / classification incohérente** | Apple 2.3.6 | Moyenne | 18+ (override) ; public cible Google 18+ |
| **Confidentialité** : étiquettes inexactes | Apple 5.1.1(i), Google | Moyenne | §8–§10 recoupés avec l'inventaire §1 ; mettre à jour si le code change |
| **Transfert de données à une IA tierce** | Apple 5.1.2(i) | Moyenne | Divulgué dans la politique (Anthropic) ; fonctions facultatives, désactivables ; **ajouter un consentement explicite avant le premier usage ?** **[À VALIDER]** |
| **Fonctionnalité minimale** (WebView) | Apple 4.2 | Moyenne | Notifications push natives, partage, caméra, haptique, liens profonds (étapes 2-3) |
| **Connexion tierce** | Apple 4.8 | Nulle aujourd'hui | Pas d'OAuth ; si ajouté, ajouter Sign in with Apple |
