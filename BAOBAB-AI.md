# Baobab AI — conception ancrée dans l'existant

Rédigé le **20 octobre 2026**. **Statut global : CONÇU, RIEN N'EST IMPLÉMENTÉ.** Aucun code du bot, aucune table, aucune
fonction, aucun secret n'a été créé. Ce document décrit ce qui existe réellement (§1), une architecture cible minimale et sûre
(§2), une matrice d'automatisations (§3), la modération assistée (§4), le moindre privilège (§5), la boucle d'amélioration
continue (§6) et distingue **conçu** de **implémenté** (§7).

Principes non négociables, repris du brief : aucune clé dans le frontend ; aucun contournement de la sécurité pour faire
disparaître une erreur ; **jamais** de bannissement automatique ; le bot interactif n'a **jamais** la clé `service_role` ;
aucune modification directe de la production (branche + tests + validation humaine) ; ne jamais prétendre qu'une chose est faite
alors qu'elle ne l'est pas.

---

## 1. Ce qui existe réellement

### 1.1 `ai-assist` (suggestions d'écriture) — **déployée mais inopérante**

Fichier `supabase/functions/ai-assist/index.ts` (141 lignes). Preuves : lecture du code, `functions list` du 20 oct. (v2, déployée
le 22 août, JWT exigé), sonde sans jeton = 401, sonde avec la clé publique comme porteur = `{"error":"Non authentifié."}` (400).

- **Sept actions** dans une seule fonction : `improve_bio`, `improve_post`, `improve_event_description`, `suggest_community`,
  `suggest_conversation`, `translate_message`, `reformulate_message` (`:23`). Ce sont des **aides à la rédaction**, pas un assistant
  conversationnel : un message en entrée, un texte en sortie.
- **Authentification** : vérifie le JWT de l'appelant (`supabase.auth.getUser()`), charge son profil, respecte le réglage
  `ai_suggestions_enabled` (`:41-45`).
- **Limite** : 20 appels/heure/personne (`AI_RATE_LIMIT_PER_HOUR`), comptés dans `ai_usage` (`:51-62`), mais le comptage se fait
  **avant** l'appel et l'insertion **après** (`:72`) : des requêtes simultanées peuvent dépasser la limite (course). **Aucun budget global.**
- **Minimisation** : chaque action ne reçoit que son texte (bio ≤ 500 caractères, etc.) ; `suggest_conversation` ne reçoit que des champs
  publics des deux profils. **Exception à connaître** : `translate_message` envoie le **texte d'un message de conversation privée**
  à Anthropic, à la demande de l'utilisateur, message par message (`:113`).
- **Clé et modèle** : `ANTHROPIC_API_KEY` **absente** (`secrets list` du 20 oct.). Modèle par défaut `claude-3-5-haiku-latest`
  (`:19`). **Vérification dans la documentation Anthropic actuelle (platform.claude.com, 20 oct. 2026) : `claude-3-5-haiku-20241022`
  est RETIRÉ depuis le 19 février 2026 ; le remplaçant recommandé est `claude-haiku-4-5-20251001`, lui-même « pas avant le 15 octobre 2026 »
  (donc à éviter) ; le modèle courant de cette catégorie est `claude-haiku-5-5`** (retrait pas avant le 7 octobre 2027). **Conséquence : même avec une clé,
  la fonction échouerait tant que `ANTHROPIC_MODEL` ne nomme pas un modèle actif.** Je n'ai pas pu confirmer que l'alias `-latest`
  est lui-même retiré ; je constate que le modèle sous-jacent l'est.
- **SDK** : `npm:@anthropic-ai/sdk@0.27` (`:13`) — ancien ; à mettre à jour lors de la correction.
- **Côté client** : `src/lib/ai/aiClient.js` — jamais d'exception, délai 15 s, 5 appels/10 s par onglet, message d'erreur générique en français.
  Cinq composants l'appellent (`AiSuggestButton`, `AiConversationSuggestions`, `CommunityCreateForm`, `ConversationPane`).
- **Consentement** : opt-out (`ai_suggestions_enabled !== false` masque ou affiche les boutons) ; **aucun consentement explicite avant le
  premier usage**. `STORES.md:537` note le besoin (Apple 5.1.2(i)). Les textes légaux §11 décrivent déjà ces fonctions.

### 1.2 Anti-arnaque `src/lib/moneyGuard.js` — **heuristique locale, sans IA**

Listes de mots-clés normalisés (accents, apostrophes) qui déclenchent un **avertissement pédagogique, jamais un blocage** ;
isolée « pour être remplacée plus tard par une vraie modération » (`:1-14`). **Rien n'est journalisé côté serveur** : on ne sait pas
combien d'avertissements sont affichés ni s'ils sont justes.

### 1.3 Admin et signalements — **le seul humain dans la boucle**

`src/components/admin/AdminDashboard.jsx` + `src/lib/adminApi.js` (fonctions `admin_dashboard_stats`, `admin_list_reports`,
`admin_resolve_report`, `suspend_user`, `ban_user`, `admin_update_feedback`, rôles de plateforme). Les RPC existent en production
(`admin_dashboard_stats` atteint son corps, garde « Non autorise », sonde du 20 oct.). Journal `admin_actions`. Rôles dans `platform_roles`.
**Aucune IA n'y est branchée.**

### 1.4 Observabilité — **conçue, pas en place**

- `client_errors` : `src/lib/errorReporter.js` + `supabase-client-errors.sql` (purge 30 jours). **La table n'existe pas en production**
  (404, 20 oct.) : aucune erreur n'est collectée.
- `beta_events` / `trackBetaEvent` (`src/lib/trackBetaEvent.js`) : événements `screen_view` à chaque changement d'onglet (`SocialShell.jsx:189`),
  **sans purge** ; policy d'insertion limitée au titulaire. Table présente en production (200).
- `analytics_events` / `trackActivation` : jalons uniques par profil (`first_like`, `first_message`…). Table présente.
- `beta_feedback` + `supabase-beta-feedback-admin.sql` : retours testeurs triés (statut/priorité), `src/lib/feedbackTriage.js`.
- `supabase-beta-dashboard.sql` : tableau de bord SQL en lecture seule (chiffres de la bêta).
- `LANCEMENT.md` §13 : 12 requêtes de santé en lecture seule + sondes HTTP ; `cron.job_run_details`, `net._http_response`.

**Constat** : toutes les sources de données d'une boucle d'amélioration existent sur le papier ; seules `beta_events`, `analytics_events` et
`beta_feedback` sont en ligne.

---

## 2. Architecture cible : assistant d'aide « Baobab AI » (FAQ, onboarding, confidentialité)

### 2.1 Périmètre

**Dans le périmètre** : expliquer comment utiliser Baobab (créer son profil, comprendre les réglages de confidentialité, signaler/bloquer,
supprimer son compte, exporter ses données, comprendre la localisation « Canada », les événements, les communautés), orienter vers les pages légales
et les bons écrans, expliquer les conseils de sécurité (arnaques, rencontres).

**Hors périmètre, refusé poliment** : conseil juridique ou d'immigration (renvoyer vers IRCC / un représentant autorisé), questions sur d'autres
utilisateurs, lecture ou résumé des conversations privées, modification de données du compte, actions (bloquer, signaler, supprimer — le bot
**explique** où cliquer, il n'agit pas), avis médicaux, financiers, paiements.

### 2.2 Schéma

```
Navigateur (clé publique + JWT utilisateur)
   │  POST /functions/v1/baobab-ai-help   { question, lang, history ≤ 4 tours }
   ▼
Edge function baobab-ai-help  (verify_jwt = true ; jamais service_role)
   1. valide l'entrée (≤ 500 caractères, texte seul), masque e-mails/téléphones
   2. appelle, AVEC le JWT de l'utilisateur, la RPC ai_help_reserve()   ← limites par personne + budget global + disjoncteur (une seule transaction)
   3. récupère les passages d'aide les plus proches dans le CORPUS STATIQUE (fichiers du dépôt, pas de base de données)
   4. appelle l'API Anthropic (modèle épinglé, clé = secret de la fonction), sans outils, sans accès aux données utilisateur
   5. vérifie la réponse (longueur, liens autorisés, refus), journalise les MÉTADONNÉES seulement
   6. renvoie { answer, sources[], degraded:false }
   ▲
En cas d'échec (budget, disjoncteur ouvert, 5xx, délai) : { degraded:true, sources[] } → le client affiche la recherche FAQ locale (même corpus)
```

### 2.3 Corpus (RAG minimal)

- **Source** : 30 à 60 pages d'aide en Markdown dans le dépôt (`supabase/functions/baobab-ai-help/corpus/`), **rédigées à partir de textes existants**
  (pages légales `src/legalContent.jsx`, `LANCEMENT`-style FAQ, textes d'onboarding) et versionnées par `git` ; identifiant stable par page ; langue FR (EN plus tard).
- **Recherche** : v1 sans base vectorielle — classement par mots-clés (normalisation déjà disponible, `normalizeForSearch` dans `src/lib/searchQuery.js`) sur
  titre + résumé + mots-clés, puis les 3 à 4 meilleurs passages dans le prompt. Alternative si le corpus tient en ≈ 16 000 jetons : tout le corpus dans
  le prompt système avec **mise en cache du prompt** (lecture de cache à 0,01 $/Mtok sur Haiku 5.5 d'après la grille de prix du 20 oct.) — plus simple et plus robuste ;
  **à confirmer** : seuil minimal de mise en cache du modèle choisi (non lu).
- **Jamais dans le corpus** : données d'utilisateurs, messages, signalements, journaux.
- **Réponse ancrée** : le prompt exige de ne répondre qu'à partir des passages fournis et de dire « je ne sais pas » sinon, en citant l'identifiant de la page.
  Le client affiche la source cliquable. Un test d'évaluation vérifie que les réponses sans passage pertinent refusent.

### 2.4 Authentification, limites, budget, disjoncteur

Aucune clé `service_role` n'est nécessaire : tout passe par des RPC `SECURITY DEFINER` (avec `set search_path`) appelées avec le JWT de la personne.

Tables proposées (**SQL à écrire, non créées** ; chaque fichier suivrait la règle de `LANCEMENT.md` : fichier neuf, additif, avec bloc d'annulation) :

| Table / objet | Contenu | Accès |
| --- | --- | --- |
| `ai_help_usage(profile_id, day, calls, tokens_reserved)` | compteur par personne et par jour | écriture uniquement par la RPC ; lecture : son propre jour |
| `ai_help_budget(month, cap_micro_usd, reserved_micro_usd, tripped_at)` | budget global mensuel (en microdollars, entier) | écriture uniquement par la RPC ; lecture : admin |
| `ai_help_breaker(opened_until, failures_5min)` | disjoncteur global | RPC |
| `app_config.baobab_ai_enabled` (drapeau) | interrupteur d'arrêt | admin ; lu par la RPC |
| RPC `ai_help_reserve(est_tokens_in, est_tokens_out)` | dans **une transaction** : interrupteur ? disjoncteur ? compteur personne (`≤ 10/h, ≤ 30/jour`) ? budget restant ? → réserve le **pire cas** de coût ; renvoie `ok` ou un code (`disabled`, `breaker`, `user_limit`, `budget`) | `EXECUTE` : **`authenticated` seulement** (révoqué pour `anon` et `public` — leçon d'AUDIT I3) |
| RPC `ai_help_report_failure()` | incrémente les échecs ; au 5e échec en 5 min, ouvre le disjoncteur 10 min | `authenticated` |

- **Pourquoi la réservation au pire cas** : sans clé de service, la fonction ne peut pas « corriger » le compteur avec le coût réel de façon fiable ; on
  comptabilise donc le maximum possible (jetons d'entrée estimés + `max_tokens`). Le budget s'épuise un peu plus vite que la réalité (marge de sécurité).
  Un rapprochement mensuel avec la console Anthropic (`Usage > Export`) est une tâche humaine.
- **Disjoncteur** : ouvert ⇒ réponse dégradée sans appel externe pendant 10 min ; budget épuisé ⇒ dégradé jusqu'au mois suivant ou relèvement par un admin
  (**décision humaine**) ; interrupteur `baobab_ai_enabled=false` ⇒ dégradé immédiat sans déploiement.
- **Course** : la RPC fait tout dans une seule transaction avec verrou de ligne (`for update`) — correction du défaut de `ai-assist` (§1.1).
- Limites proposées : 10 questions/heure et 30/jour par personne ; 500 caractères par question ; 4 tours d'historique ; 400 à 600 jetons de sortie.

### 2.5 Journalisation sans contenu sensible

On journalise **uniquement** : horodatage, identifiant de profil, code de résultat (`ok`, `refus`, `limite`, `budget`, `disjoncteur`, `erreur_api`), identifiants des pages du
corpus utilisées, jetons d'entrée/sortie, latence, version du prompt, drapeau « pas de réponse trouvée ». **Ni la question, ni la réponse ne sont stockées par défaut.**
Un bouton « cette réponse n'a pas aidé » peut, **avec accord explicite à ce moment-là**, envoyer la question à `beta_feedback` (catégorie `bot`) pour améliorer le corpus.
Conservation : 90 jours puis purge par `pg_cron`. Les journaux d'exécution de la plateforme (Supabase Logs) ne doivent pas contenir la question : la fonction n'écrit jamais le prompt dans `console.log`.

### 2.6 Consentement avant le premier usage

Distinct du réglage `ai_suggestions_enabled` (opt-out existant). Avant la première question : écran expliquant, en français simple, que la question est envoyée à
Anthropic pour générer la réponse, qu'aucune conversation privée ni donnée de profil n'est transmise, que rien n'est utilisé pour entraîner un modèle (à confirmer avec
les conditions d'Anthropic au moment de l'écrire), avec **Accepter / Refuser**. Colonne à ajouter (**SQL à écrire**) : `profiles.ai_help_consent_at`. Refus ⇒ le bot reste en
mode FAQ locale. Cohérent avec Apple 5.1.2(i) (`STORES.md:537`) et à décrire dans la politique de confidentialité (à relire par un juriste).

### 2.7 Mode dégradé

Trois niveaux : (1) bot indisponible (budget, disjoncteur, panne, pas de consentement) ⇒ **recherche FAQ locale** sur le même corpus, sans réseau externe ; (2) corpus indisponible ⇒ lien
vers les pages légales et l'adresse de contact ; (3) tout est en panne ⇒ message statique. Le dégradé est un état **normal** et testé, jamais une erreur.

### 2.8 Modèle et appel

- Modèle : `claude-haiku-5-5` (« pour les tâches à fort volume et sensibles à la latence ») d'après la documentation du 20 oct., épinglé par variable `ANTHROPIC_MODEL`
  **avec contrôle de démarrage** qui échoue clairement si la valeur n'est pas dans une liste blanche.
- Prix (doc. du 20 oct., prompts ≤ 100 000 jetons) : **0,10 $/Mtok en entrée, 0,50 $/Mtok en sortie** ; lecture de cache 0,01 $/Mtok.
- **À vérifier à l'implémentation (non lu aujourd'hui)** : paramètres propres à cette génération (réflexion adaptative, niveau d'effort, présence de `temperature` — la documentation indique que
  `temperature`, `top_p`, `top_k` sont refusés avec une valeur non défaut à partir de Claude 4.7 : **ne pas les envoyer**), forme exacte du SDK à jour.

### 2.9 Résistance à l'injection de consignes

Le bot n'a **aucun outil** et **aucun accès aux données** : le pire résultat d'une injection est une réponse hors sujet ou impolie. Mesures : consignes système en tête ; question de l'utilisateur
dans un bloc délimité traité comme donnée ; interdiction de révéler le prompt ; sortie filtrée (liens uniquement vers `baobab-app-zeta.vercel.app`/domaine officiel et pages du corpus) ; refus
de toute demande d'action. Tests d'injection dans le jeu d'évaluation (§2.10).

### 2.10 Tests prévus (non écrits)

| Niveau | Contenu |
| --- | --- |
| Unitaires (Vitest, Deno test pour la fonction) | classement du corpus ; construction du prompt ; masquage e-mail/téléphone ; arithmétique du budget ; état du disjoncteur |
| Contrat | API Anthropic simulée : succès, 429, 5xx, délai, réponse vide ; la fonction ne laisse **jamais** fuiter l'erreur brute |
| SQL (projet de répétition) | RPC : limite par personne, budget, disjoncteur, concurrence (20 appels parallèles), `EXECUTE` refusé à `anon` |
| Évaluation | 50 questions FR avec page attendue ; 15 questions hors périmètre (doivent refuser) ; 15 injections ; seuils : ≥ 90 % de bonne source, 100 % de refus des hors périmètre critiques |
| UI | consentement, refus, mode dégradé, clavier/lecteur d'écran, 375 px |
| Coût | rapport du jeu d'évaluation : jetons moyens d'entrée/sortie mesurés, comparés à l'hypothèse ci-dessous |

### 2.11 Coûts estimés (formule et hypothèses explicites)

`Coût mensuel = N_tours × (T_in × p_in + T_out × p_out)`

Hypothèses (à remplacer par les mesures du jeu d'évaluation) : `p_in = 0,10 $/Mtok`, `p_out = 0,50 $/Mtok` (Haiku 5.5, doc. du 20 oct., prompt ≤ 100 k) ;
`T_in = 2 600` jetons (prompt système 300 + 4 passages × 300 + historique 800 + question 100) ; `T_out = 600` jetons (réponse + éventuelle réflexion adaptative — **hypothèse prudente**).
⇒ **≈ 0,00056 $ par tour**.

| Scénario | Tours/mois | Coût (Haiku 5.5) | Coût si `claude-haiku-4-5` (1 $/5 $ par Mtok) |
| --- | --- | --- | --- |
| Bêta : 100 testeurs × 6 tours | 600 | ≈ 0,34 $ | ≈ 3,4 $ |
| Mois 1 : 1 000 comptes, 20 % utilisent le bot, 5 tours | 1 000 | ≈ 0,56 $ | ≈ 5,6 $ |
| 10 000 comptes, mêmes taux | 10 000 | ≈ 5,6 $ | ≈ 56 $ |

Plafond mensuel proposé : **20 $** avec alerte à 80 % et disjoncteur à 100 % (cent fois la consommation du mois 1). Hors calcul : taxes, change CAD, coût de la plateforme
(invocations d'edge functions : inclus dans l'offre Supabase **[NON VÉRIFIÉ]**), temps humain. Ces chiffres sont des **ordres de grandeur**, pas une prévision.

---

## 3. Matrice des automatisations souhaitées

Légende : **R** = recommandation seule (le système détecte et propose, un humain décide et agit) ; **A** = action automatique autorisée
(**réversible, bornée en volume et en durée, journalisée, avec interrupteur d'arrêt**) ; **H** = confirmation humaine obligatoire avant toute action.
« Source existante » = donnée déjà produite par le projet. Rien n'est implémenté.

| # | Automatisation | R | A | H | Source existante | Déclencheur | Limites d'exécution | Arrêt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Erreurs répétitives** (même message > 20 fois/24 h) | Regrouper par signature, classer, estimer l'impact | — | Corriger le code ; fusionner | `client_errors` (**à créer**, SQL-5), `errorReporter.js` | `pg_cron` horaire, SQL pur dans `ops_findings` | Lecture seule ; ≤ 50 lignes/exécution | Désactiver le job (`cron.unschedule`) |
| 2 | **Rapport de santé** quotidien | Résumer comptes, erreurs, crons, signalements, taille de base (les 12 requêtes de `LANCEMENT.md` §13) | Écrire une ligne de rapport dans `ops_health_reports` | Toute action corrective | requêtes §13, `cron.job_run_details`, `net._http_response` | `pg_cron` 7 h | Lecture seule + 1 écriture ; ≤ 5 s | Désactiver le job |
| 3 | **Cohérence des données** (comptes sans profil, suppressions en retard, communautés sans propriétaire, événements orphelins) | Lister les anomalies | **Aucune** correction automatique | Toute réparation, rédigée en SQL à relire | tables existantes, triggers d'orphelins | `pg_cron` hebdomadaire | Lecture seule | Désactiver le job |
| 4 | **Notifications dupliquées** | Détecter (même type + cible + fenêtre de 5 min) | — | Corriger le trigger ; supprimer des lignes | `notifications`, triggers `notify_*` | `pg_cron` quotidien | Lecture seule | Désactiver le job |
| 5 | **Contenus indésirables / arnaques** | Calculer un *score probable* et prioriser la file de signalements | **Ajouter à la file de modération** + notifier les modérateurs ; **rien d'autre** | Masquer, avertir, suspendre, bannir, supprimer | `reports` & équivalents, `moneyGuard.js`, `report_count` | Trigger SQL à l'insertion d'un signalement (pas sur chaque message) | ≤ 200 files/jour ; aucun accès au contenu privé hors signalement | `app_config.moderation_assist_enabled=false` |
| 6 | **Rapports de performance** | Sondes HTTP, poids de page, temps de réponse, taille des bundles, `npm audit` | Ouvrir une *issue* GitHub quand un seuil est franchi | Optimisation ; changements d'architecture | sondes de `LANCEMENT.md` §13, CI | **GitHub Actions planifié** (quotidien, sans secrets : requêtes publiques) | 10 min d'exécution ; droits `issues:write` seulement | Désactiver le workflow |
| 7 | **Maintenance planifiée** | Proposer de nouvelles purges / index | **Exécuter les purges déjà approuvées** (notifications 90 j, `client_errors` 30 j, journaux du bot 90 j, `beta_events` à fixer) | Tout nouveau type de purge ; tout `DELETE` hors liste | crons existants (`LANCEMENT.md` §8.4) | `pg_cron` nocturne | Liste blanche de tables ; `LIMIT` par lot ; journal du nombre de lignes | `app_config.ops_purge_enabled=false` |
| 8 | **Propositions de correctifs** | Un assistant (humain + IA) rédige un correctif et ses tests | **Ouvrir une branche et une *pull request*** | Relecture, fusion, déploiement | CI (`ci.yml`), tests, historique | Manuel, ou sur une *issue* du point 6 | Jamais sur `main` ; jamais de SQL de production ni de déploiement de fonction | Fermer la PR ; retirer le droit d'écriture |

**Ce que personne ne fait automatiquement** : bannir, supprimer un compte ou un contenu, exécuter du SQL de production, déployer une fonction, modifier un secret,
relever un budget, désactiver une protection, répondre à un utilisateur au nom de l'équipe.

---

## 4. Modération assistée

- **Deux niveaux d'état, jamais confondus** : *probable* (signal automatique ou signalement non examiné) et *confirmé* (décision d'une personne habilitée). Seul « confirmé » a des
  conséquences pour le compte. Un signal *probable* ne change **rien** de visible pour l'utilisateur concerné (pas de masquage, pas de blocage de message).
- **Aucun bannissement, suspension ni suppression automatique.** Les RPC `ban_user` / `suspend_user` existent et sont réservées aux rôles de modération ; aucune tâche planifiée ne les appelle.
- **Priorisation** : mineur suspecté et arnaques d'abord (c'est déjà l'ordre annoncé dans les conditions, `legalContent.jsx` §« signalements »), puis harcèlement, puis le reste. Le score ne sert qu'à trier.
- **Procédure de contestation** (à décider par le propriétaire) : toute mesure confirmée est notifiée à la personne avec la catégorie (pas le détail du signalant) ; formulaire de contestation depuis
  l'app ; réexamen par une **autre** personne que celle qui a décidé ; délais cibles à publier (proposition : 24 h pour mineur/arnaque, 72 h pour le reste — **à valider**).
- **Conservation minimale** : on ne copie pas le contenu des messages. Un signal enregistre l'identifiant du contenu, la catégorie, le score, la date. Purge à 90 jours pour les signaux non confirmés ;
  pour les décisions confirmées, durée **à fixer avec un juriste** (décision 7 de `LANCEMENT.md` : aujourd'hui les signalements disparaissent avec le compte).
- **Faux positifs** : `moneyGuard.js` reconnaît lui-même le compromis (§1.2). Toute mesure d'IA doit être mesurée sur un échantillon relu par un humain avant d'être branchée à une file.
- **Pas de lecture du contenu privé** par le bot d'aide ; la modération n'examine que ce qui a été **signalé** ou ce qui est **public** (publications, communautés), jamais les conversations non signalées.

---

## 5. Principe du moindre privilège

| Composant | Rôle / clé | Peut | Ne peut pas |
| --- | --- | --- | --- |
| **Navigateur / app** | clé publique (`sb_publishable_…`) + JWT de l'utilisateur | ce que la RLS autorise à cette personne | contourner la RLS |
| **`baobab-ai-help`** (interactif) | JWT de l'appelant ; secret `ANTHROPIC_API_KEY` | RPC `ai_help_*` ; appeler Anthropic | lire une table utilisateur ; **jamais `service_role`** |
| **`ai-assist`** (existant) | JWT + **`service_role`** pour `ai_usage` | écrire `ai_usage` | — *À migrer vers le même schéma de RPC pour retirer la clé de service (recommandation)* |
| **Jobs `pg_cron` d'exploitation** (rapport de santé, cohérence, doublons, purges) | rôle `postgres` du cron, SQL en lecture sauf purges listées | lire les agrégats ; écrire `ops_findings`, `ops_health_reports` ; purges en liste blanche | appeler des API externes ; modifier un compte |
| **GitHub Actions planifié** (sondes) | `GITHUB_TOKEN` limité à ce dépôt (`issues:write`) ; **aucun secret Supabase ni Vercel** | requêtes HTTP publiques, ouvrir une *issue* | lire la base ; déployer |
| **Assistant de développement** | accès au dépôt, branche + PR | proposer du code | pousser sur `main` sans validation, exécuter du SQL de production, déployer une fonction, lire les secrets |
| **Humain (propriétaire / modérateur)** | tableaux de bord, CLI, rôles `platform_roles` | tout ce qui précède, avec journal | — |
| **Fonctions de paiement / push / suppression** (existantes) | `service_role` justifié (webhooks, cron) | tâches serveur | — *Resteront les seules à détenir la clé de service ; chacune vérifie elle-même son appelant* |

Règle d'or : **si une automatisation a besoin de `service_role`, c'est qu'elle doit être une tâche serveur planifiée et revue, pas un bot interactif.**

---

## 6. Boucle d'amélioration continue (observation → analyse → correction → vérification)

| Étape | Outil existant | Qui | Garde-fou |
| --- | --- | --- | --- |
| **Observation** | `client_errors` (à créer), `beta_events`, `analytics_events`, `beta_feedback`, `reports`, sondes HTTP, Supabase Logs/Reports, Vercel Deployments/Logs, `cron.job_run_details` | jobs planifiés + humain | lecture seule |
| **Analyse** | requêtes de `LANCEMENT.md` §13, `supabase-beta-dashboard.sql`, `feedbackTriage.js`, panneau « Santé » à créer dans l'admin | assistant (rapport) + humain | recommandation seule |
| **Correction** | **branche Git + tests Vitest + PR** ; SQL = fichier neuf, additif, bloc d'annulation, **répété d'abord sur le projet de répétition** | assistant propose, **humain valide et exécute** | jamais de modification directe de la production |
| **Vérification** | CI (`ci.yml` : build + suite complète), e2e (à créer), bilan SQL §4 de `LANCEMENT.md`, sondes anonymes (`rls-test-commands.md` étendu), requêtes de santé après déploiement | automatique + humain | un correctif n'est « terminé » qu'après sa vérification en production, notée avec date |

**Règle** : *jamais de modification directe de la production. Branche, tests, validation humaine, déploiement par le propriétaire, vérification, puis seulement « terminé ».*
Chaque correctif porte un identifiant de constat (par exemple C1 ou I3 de `AUDIT-BAOBAB.md`) et un test qui échouait avant.

---

## 7. Conçu ou implémenté ?

| Élément | Conçu | Implémenté | Remarque |
| --- | --- | --- | --- |
| Suggestions d'écriture (`ai-assist`) | oui | **oui (code), inopérant en prod** | clé absente, modèle retiré |
| Heuristique anti-arnaque `moneyGuard.js` | oui | **oui (client)** | pas de journalisation |
| Admin / signalements / rôles | oui | **oui** | sans IA |
| `client_errors` | oui | code oui, **table absente en prod** | SQL-5 non exécuté |
| `beta_events`, `analytics_events`, `beta_feedback` | oui | **oui, en ligne** | `screen_view` sans purge |
| Bot d'aide `baobab-ai-help` | **oui (ce document)** | **non** | rien n'existe |
| Corpus d'aide | oui (principe) | **non** | à rédiger |
| Tables `ai_help_*`, RPC, drapeau d'arrêt | oui | **non** | SQL à écrire |
| Consentement explicite IA | oui | **non** | colonne à créer |
| Jobs `pg_cron` d'exploitation (§3) | oui | **non** | rien de planifié hors crons existants |
| Workflow GitHub planifié (sondes) | oui | **non** | `ci.yml` ne tourne que sur push |
| Aide à la modération (score, file) | oui | **non** | |
| Procédure de contestation | à décider | **non** | décision du propriétaire |
| Tests et jeu d'évaluation du bot | oui | **non** | |

## 8. Décisions à prendre par le propriétaire pour ce chantier

1. Le bot d'aide entre-t-il en **bêta fermée (8–12 nov.)**, en production le 15 nov., ou après le lancement ? (Recommandé : bêta, puis décision.)
2. Budget mensuel maximal et devise (proposé : 20 $/mois).
3. Création de la clé Anthropic (jamais dans le chat ni dans un fichier) et choix du modèle.
4. Consentement : texte et moment (premier usage) — relecture juridique.
5. Délais de traitement et procédure de contestation à publier.
6. Durée de conservation des signaux et des décisions de modération.
7. Faut-il retirer `translate_message` (messages privés envoyés à un tiers) jusqu'à nouveau consentement explicite ?
