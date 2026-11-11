# Baobab — LANCEMENT : le seul document à suivre

> ## ⏸ LANCEMENT REPORTÉ DU 15 NOVEMBRE AU 15 DÉCEMBRE 2026 (décision du propriétaire, novembre 2026)
> **Nouvelle date de lancement : mardi 15 décembre 2026** (jour de la semaine à confirmer par le propriétaire : l'ancienne cible, le 15 novembre, était un dimanche). Le **gel des fonctionnalités passe à environ 13-14 décembre** (à confirmer) ; le calendrier intermédiaire (bêta, tests, répétition) **se décale d'un mois** : toutes les dates de novembre ci-dessous se lisent « + 1 mois » et seront recalculées avec le propriétaire. Les critères de lancement restent applicables tels quels. Les fichiers ne sont pas renommés (nom historique « 15-NOV »).
> **Critère O1 (sauvegarde / restauration) : toujours NON REMPLI** — offre gratuite, aucune sauvegarde ni PITR ; à décider avant tout nouveau SQL de production (`LANCEMENT.md` §9.4).
> **État de la production au début de novembre 2026** (déclaré par le propriétaire / les sessions qui l'ont exécuté ; non revérifié par l'assistant sauf mention) :
> - **SQL exécuté** : SQL-1 à SQL-15, SQL-22 (blocs 1, 2, 4A, 3A, 3B), SQL-23, SQL-24, correction de géolocalisation (`supabase-geolocation-privacy-fix.sql`). Toujours **sans sauvegarde** ni répétition préalable.
> - **Fonctions Edge déployées** : `process-scheduled-deletions` v6, `cleanup-expired-stories` v1, `send-push` v7. La fonction fantôme `delete-account` n'est **pas supprimée** (suppression irréversible ; code sauvegardé hors dépôt).
> - **SQL-25, SQL-27, SQL-28, SQL-29, SQL-30 : EXÉCUTÉS en production le 4 novembre 2026** (accord explicite du propriétaire, sans sauvegarde ; vérifiés en lecture seule : 7 policies de blocage restrictives, `is_blocked_pair` sans droit pour `anon`, fenêtre de suppression = 15 min, 4 déclencheurs de limitation, 0 clé étrangère sans index, 0 table sans RLS, seule `public_user_count` exécutable par `anon`, données intactes). Le blocage est donc désormais effectif côté serveur pour la messagerie, les likes, follows, favoris et invitations.
> - **SQL-31, SQL-32, SQL-33, SQL-35, SQL-36 : EXÉCUTÉS en production le 5 novembre 2026** (accord explicite du propriétaire, sans sauvegarde, snapshot « avant » hors dépôt, un fichier à la fois ; tous rejoués d'abord sur la répétition). Contrôles en lecture seule faits après exécution : 12 policies de blocage restrictives, `is_blocked_with_*` sans droit pour `anon`, `notifications_type_check` à 26 types (aucun perdu), 101 termes et 4 exceptions de modération, 11 déclencheurs `trg_moderation_*`, `trg_modban_signup` et `trg_modban_email` sur `auth.users`, toutes les tables `moderation_*` en RLS sans droit pour `anon`, aucune table publique sans RLS. **Confirmé par le propriétaire le 5 novembre 2026** : une connexion normale et un message normal faits juste après l'exécution, tout fonctionne (aucun compte de test en production). **Livrés, NON exécutés** : `supabase-profile-report-minor-constraint-fix.sql` (priorité haute : « Mineur suspecté » refusé par la base) et `supabase-report-statuses.sql` (après SQL-31).
> - **Messagerie** : correctifs et nouveautés poussés sur `main` (voir `RAPPORT-MESSAGERIE.md`) ; essai réel à deux comptes fait **sur le projet de répétition seulement**, jamais en production.
> - **Toujours ouverts** : test de bout en bout sur la production à deux comptes réels (**pas-à-pas prêt : `TEST-PRODUCTION-DEUX-COMPTES.md`**, à jouer par le propriétaire avec deux appareils), SMTP / DNS / contact / textes légaux, décisions §10, SQL optionnels (SQL-16 à SQL-21 hors ceux déjà exécutés).


Dernière mise à jour : **8 octobre 2026** ; **20 octobre 2026** : fiche SQL-22 (fuites de lecture), guide §9.7 (projet de répétition), lignes de bilan correspondantes. Remplace, pour l'ordre des opérations, les listes dispersées de
`DEPLOIEMENT.md` (§1 à §12), `MOBILE.md` et `STORES.md` (qui restent les références de détail).

**Comment l'utiliser.** Va dans l'ordre. Chaque case `- [ ]` est une action. Tout ce qui est écrit
**[PROUVÉ]** a une preuve citée (fichier, commit, commande lancée le 8 octobre). Tout ce qui est écrit
**[À VÉRIFIER]** vient avec une requête de vérification en lecture seule à coller dans le *SQL Editor* de
Supabase (l'écran où l'on colle du SQL : Supabase > SQL Editor > New query). Rien n'est supposé sans le dire.

**Ce que fait ce document, et ce qu'il ne fait pas.** Il n'a exécuté AUCUN SQL, déployé AUCUNE fonction,
posé AUCUN secret. Il n'a modifié aucun fichier `supabase-*.sql`. Les seules actions faites sur tes
services, le 8 octobre, sont des lectures : `supabase functions list`, `supabase secrets list` (noms
seulement, valeurs masquées), `supabase functions download delete-account` (copie locale du code d'une fonction,
dans un dossier temporaire), `vercel env ls` / `vercel domains ls` / `vercel domains inspect` (noms seulement), et une
dizaine d'appels HTTP sans identifiant (sondes).

---

## Table des matières

0. [Les 10 actions les plus urgentes](#0-les-10-actions-les-plus-urgentes-pour-le-lancement-web)
1. [Règles d'or (ce qu'il ne faut jamais faire)](#1-règles-dor)
2. [État prouvé au 8 octobre 2026](#2-état-prouvé-au-8-octobre-2026)
3. [Lancement web minimal (12 étapes)](#3-lancement-web-minimal-12-étapes)
4. [Étape 0 — le bilan en lecture seule](#4-étape-0--le-bilan-en-lecture-seule-à-lancer-en-premier)
5. [Ordre d'exécution du SQL (fiches)](#5-ordre-dexécution-du-sql-fiches)
6. [Conflits entre fichiers et pièges d'ordre](#6-conflits-entre-fichiers-et-pièges-dordre)
7. [Inventaire des 139 fichiers SQL](#7-inventaire-des-139-fichiers-sql)
8. [Edge functions](#8-edge-functions)
9. [Réglages manuels hors code](#9-réglages-manuels-hors-code)
10. [Décisions du propriétaire](#10-décisions-du-propriétaire)
11. [Séquence globale J-7 → J → J+7](#11-séquence-globale-j-7--j--j7)
12. [Après le lancement : Stripe, IA, apps natives](#12-après-le-lancement--stripe-ia-apps-natives)
13. [Contrôles de santé après le lancement](#13-contrôles-de-santé-après-le-lancement)
14. [Ce qui n'a pas pu être prouvé, et corrections faites ailleurs](#14-ce-qui-na-pas-pu-être-prouvé-et-corrections-faites-ailleurs)

**Mots à connaître** (une demi-phrase chacun) : *RLS* = règles de sécurité appliquées ligne par ligne dans la
base ; *policy* = une de ces règles ; *trigger* = code SQL qui se déclenche tout seul quand une ligne est
ajoutée/modifiée ; *edge function* = petit programme hébergé par Supabase, appelé par une URL ; *secret* =
valeur confidentielle stockée côté Supabase (jamais dans le code) ; *CLI* = l'outil `npx supabase ...` que tu
lances dans un terminal ; *cron* = tâche planifiée dans la base (extension `pg_cron`) ; *Vault* = coffre de
secrets de la base ; *JWT* = le jeton de connexion d'un utilisateur ; *index* = « table des matières » d'une
colonne qui accélère les recherches ; *contrainte* = règle de validité d'une colonne ; *bucket* = un dossier
de stockage de fichiers.

---

## 0. Les 10 actions les plus urgentes pour le lancement web

Classées par urgence (pas forcément dans l'ordre d'exécution : celui-ci est au §3).

1. **Lancer le bilan lecture seule (§4).** 5 minutes. Tout le reste dépend de ce qu'il montre.
2. **Autoriser les vraies inscriptions** : vérifier que le *Auth Hook « Before User Created »* (la liste
   blanche de la bêta, `supabase-beta-access.sql`) est désactivé, configurer un **SMTP personnalisé** (l'envoi
   d'e-mails de confirmation), l'URL du site et les URL de redirection (§9.1). Sans cela, des inconnus ne
   peuvent pas s'inscrire ou ne reçoivent pas leur e-mail.
3. **Imposer l'âge de 18 ans côté serveur** : `supabase-age-check-server-side.sql` (SQL-1). Aujourd'hui,
   un appel direct à l'API pourrait enregistrer un mineur.
4. **Fermer les fuites de confidentialité** : `can_view_event` (SQL-2, un événement privé refusé reste lisible),
   `supabase-content-select-block-filter-fix.sql` (SQL-3, un profil bloqué peut encore lire le contenu) et, surtout,
   **`supabase-close-read-leaks.sql` (SQL-22)** : les photos de profil (table `profile_photos`) sont lisibles **sans compte**, adresses d'images comprises.
5. **Redéployer `process-scheduled-deletions`** (§8) : la version en ligne date du **22 août**, 4 correctifs de
   la suppression de compte ne sont pas déployés (effacement de fichiers d'autres personnes, ordre de
   suppression, médias de communautés). Obligatoire pour la conformité (droit à l'effacement, boutiques).
6. **Exécuter le lot de correctifs de sécurité restants** (SQL-6 à SQL-15, dans l'ordre) et **`supabase-client-errors.sql`**
   (SQL-5) : sans cette table, aucune erreur du site n'est rapportée.
7. **Ne pas abaisser « Max rows » sous 1000** (Supabase > Settings > API). Le site pagine par 1000 ; en dessous,
   les listes s'arrêtent en silence après la première page (§9.2).
8. **Renseigner `src/config/contact.json`** (adresse de support et nom de l'exploitant) et trancher le domaine :
   `baobab-app.ca` est attaché à Vercel **mais son DNS ne résout pas** (§9.5). Redéployer le site ensuite.
9. **Trancher Premium/IA avant d'ouvrir** : les secrets Stripe et `ANTHROPIC_API_KEY` ne sont **pas** posés ;
   les boutons « Devenir Premium » et « Améliorer mon texte » échouent poliment (§10, décisions 13 à 15).
10. **Examiner puis supprimer la fonction fantôme `delete-account`** (en ligne depuis le 17 août, absente du
    dépôt) : elle permet à tout utilisateur connecté de supprimer immédiatement son compte en contournant le
    délai de 24 h et le nettoyage de fichiers (§8.3).

---

## 1. Règles d'or

- [ ] **Ne rejoue JAMAIS un fichier `supabase-*.sql` « déjà exécuté ».** Beaucoup redéfinissent des fonctions ou
      des règles qui ont été corrigées depuis : les rejouer ramène l'ancienne version, **sans erreur visible**
      (voir §6). Ne rejoue pas non plus `supabase-COMBINED-pending-fixes.sql`.
- [ ] **N'exécute que les fichiers de la catégorie B** (« à exécuter », §7), dans l'ordre du §5.
- [ ] **Un fichier à la fois**, puis la requête de vérification de sa fiche. Si une erreur s'affiche, **arrête-toi**
      et note le message : ne passe pas au fichier suivant.
- [ ] Les valeurs secrètes (clés Stripe, clé Anthropic, clé de service, clé `.p8`, fichiers JSON de compte de
      service, keystore Android) ne se collent **jamais** dans une conversation, un commit ou un fichier du dépôt.
- [ ] Vercel déploie la branche `main` en production à chaque `git push`. Pas de push « pour tester » pendant la
      semaine du lancement.
- [ ] Avant tout SQL sensible, vérifie la sauvegarde disponible (§9.4).

---

## 2. État prouvé au 8 octobre 2026

| Sujet | État | Preuve |
| --- | --- | --- |
| `supabase-COMBINED-pending-fixes.sql` (45 sections) | **Exécuté en prod** le 9 sept 2026 | `DEPLOIEMENT.md` (en-tête, §1, commit `9b05c5b` du 10 sept) ; mémoire de déploiement. Vérifications notées à l'époque : fonctions admin réparées, dossier `avatars` non listable en anonyme. |
| `supabase-combined-supersede-order-regression-fix.sql` | **Exécuté en prod** le 10 sept 2026 | `DEPLOIEMENT.md` ; vérification notée : INSERT anonyme sur likes/abonnements refusé (401). |
| Tous les SQL livrés après le 10 sept | **Jamais exécutés** (d'après `DEPLOIEMENT.md`) | `DEPLOIEMENT.md` §1b à §12 ; **[À VÉRIFIER]** par le bilan (§4). |
| Triggers push « message » et « match » | **Probablement exécutés le 25 août** (contrairement à `DEPLOIEMENT.md` §1c) | Le secret `PUSH_WEBHOOK_SECRET` a été créé le 25 août à 23 h 19 (heure locale), dix minutes après le commit du fichier de triggers ; l'en-tête de `supabase-account-deletion-timeout-fix.sql` parle des « triggers push mis en place ce soir ». **[À VÉRIFIER]** (ligne « triggers push message + match » du bilan). |
| Edge functions en ligne | 7 fonctions, dont `delete-account` absente du dépôt (voir §8) | `npx supabase functions list`, lancé le 8 oct. |
| `stripe-webhook`, `cleanup-expired-stories` | **404 : jamais déployées** | Sondes HTTP du 8 oct. |
| Secrets Supabase présents (noms) | `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` + les `SUPABASE_*` fournis par la plateforme (dont `SUPABASE_SERVICE_ROLE_KEY`) | `npx supabase secrets list` du 8 oct. |
| Secrets Supabase **absents** | `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `SITE_URL`, `FCM_SERVICE_ACCOUNT_JSON`, `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID` | idem |
| Variables d'environnement Vercel (production) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` présentes | `vercel env ls` du 8 oct. (aucune autre variable ; `VITE_PUBLIC_WEB_ORIGIN` facultative, absente) |
| Site web | En ligne : `https://baobab-app-zeta.vercel.app` répond 200 ; `/.well-known/assetlinks.json` répond 200 (mais contient encore un texte à remplacer) | sondes du 8 oct. |
| Domaine `baobab-app.ca` | Ajouté à Vercel le 22 août, **DNS non configuré** : « Could not resolve host » ; Vercel affiche « domain is not configured properly » | `vercel domains inspect baobab-app.ca`, résolution DNS du 8 oct. |
| Intégration continue GitHub (`ci.yml`) | Vert d'après `MOBILE.md` (commit `ae0ec5f`) ; les builds natifs (`android-build.yml`, `ios-build.yml`) n'ont **jamais été lancés** | `MOBILE.md` ; non revérifié le 8 oct. (je ne touche pas aux identifiants GitHub) |
| **Sauvegarde / PITR** | **AUCUNE sauvegarde restaurable constatée le 1er novembre 2026** : `supabase backups list` renvoie `pitr_enabled=false` et `backups=[]` (aucune sauvegarde quotidienne listée). **Critère GO « sauvegarde/PITR confirmée » (O1) NON rempli.** Aucun SQL de production ne doit être joué tant que le propriétaire n'a pas décidé (§9.4). | Constat d'une autre session de travail du propriétaire, en lecture seule, le 1er nov. ; **non revérifié par l'assistant de l'audit** |
| Réglages du tableau de bord Supabase (Auth, SMTP, Max rows…) | **Inconnus** : non lisibles par la CLI | §9 : à vérifier à la main |
| Appareil réel (Android/iOS) | Rien n'a été testé sur un vrai téléphone | `MOBILE.md` §(G) |

### 2.1 Journal d'exécution SQL en production, 1er novembre 2026

**Source** : compte rendu d'une autre session de travail du propriétaire, qui dit avoir agi avec l'**accord explicite du propriétaire**. L'assistant de l'audit n'a exécuté **aucun** SQL et n'a pas de preuve directe de l'exécution fichier par fichier ; il a seulement revérifié de l'extérieur, en lecture seule, les effets visibles (voir « Vérifié » ci-dessous).

**Déclaré exécuté, un fichier à la fois, bilan §4 relancé après chacun (35 « NON » → 10, aucune régression)** :
- **SQL-1** : contrainte `profiles_min_age_18` posée **puis validée** (pré-contrôle : 5 profils, 0 mineur, 0 sans date de naissance).
- **SQL-2** (`can_view_event`), **SQL-3** (8 politiques), **SQL-4** (12 index), **SQL-5** (`client_errors` + tâche de purge).
- **SQL-6 à SQL-13**, **SQL-14** (bloc **fusionné**, et non le fichier `accept-event-invitation-membership-check`), **SQL-15**.
- **SQL-22** : blocs **1** (`profile_photos`), **2** (`EXECUTE` retiré à `anon` : une seule fonction reste appelable en anonyme, `public_user_count`), **4A** (`blocks`/`passes` en réplique par défaut), **3A** (`get_my_profile()`), **3B** (6 colonnes sensibles illisibles par `authenticated`). Le code client qui passe par `get_my_profile()` avait été vérifié dans le bundle en ligne avant le 3B.
- **SQL-23** (exclusion de membre) : déjà exécuté le 31 octobre.
- **`geolocation-privacy-fix`** (exécuté plus tard le 1er novembre, accord explicite du propriétaire, même source) : `nearby_profiles()` respecte désormais `show_general_area`. Bilan §4 : ligne « nearby_profiles respecte show_general_area » = oui, 0 régression.
- **SQL-24** (`supabase-age-refresh-cron.sql`, même source) : fonction `refresh_profile_ages()` sans droit pour `anon`/`authenticated`, tâche pg_cron `baobab-refresh-profile-ages` à `0 9 * * *`, rattrapage immédiat (1 âge périmé corrigé, 0 restant).

**Volontairement NON exécutés** : blocs **1B** et **4B** de SQL-22.
**Restent « NON » (9, optionnels ou à décision ; 10 avant l'exécution de `geolocation-privacy-fix`)** : SQL-16 et SQL-17 (push natifs), SQL-18 (`unaccent`), SQL-19 (motif « mineur » des publications, avec changement de code), SQL-20 (quota de stockage : plafond à décider), SQL-21 (trigger de partage d'événement privé), `scale-security` (politique de création de profil), `account-deletion-timeout-fix`, `report-minor-category`.

**Vérifié par l'assistant de l'audit, le 1er novembre, depuis l'extérieur (lecture seule, clé publique du site)** :
- `profile_photos` : **401** pour un visiteur sans compte (le 31 octobre : 11 lignes lisibles sans compte). **La fuite C2 est fermée côté lecture anonyme.**
- `profiles`, `events`, `messages`, `blocks` : 401 en anonyme.
- `client_errors` : la table **existe** (200, 0 ligne ; le 31 octobre : 404).
- `admin_dashboard_stats` et `get_my_profile` : « permission denied » en anonyme (42501) ; `public_user_count` : 200, renvoie 4.
- Le site répond 200.
- **Non revérifié par moi** : le contenu exact des fonctions, politiques et contraintes (le bilan §4 de l'autre session fait foi), et le comportement d'un compte connecté (simulation en transaction annulée faite par l'autre session : `get_my_profile` renvoie la seule ligne de l'appelant, les colonnes des autres restent lisibles, `select *` est refusé, les photos sont visibles).

**Retour arrière** : table `public.baobab_sql22_backup` (blocs 1, 3B, 4A) et instantané des définitions (106 fonctions, 160 politiques, 49 triggers, 261 contraintes, droits) enregistré **hors dépôt**. Ils permettent de défaire les définitions, **pas de restaurer des données**.

**Risques à garder en tête**
1. **Aucune sauvegarde restaurable** (offre gratuite, `pitr_enabled=false`) : critère GO **O1 toujours NON rempli** (§9.4). Les SQL ont été exécutés sans point de retour des données.
2. `client_errors` accepte des **INSERT anonymes sans limite de débit** (amélioration n° 7 de l'audit non faite) : à plafonner avant l'ouverture.
3. Après le 3B, **toute colonne ajoutée plus tard à `profiles`** exige `grant select (colonne) on public.profiles to authenticated;`, sinon elle sera illisible.
4. Un onglet resté ouvert avec l'ancien code client peut afficher des erreurs jusqu'au rechargement.
5. Le test de bout en bout à deux comptes réels (§3, étape 12) n'est toujours pas fait : il est maintenant **plus important**, car il valide en vrai ce que les simulations n'ont montré que sur des schémas factices.

---

## 3. Lancement web minimal (12 étapes)

Le strict nécessaire pour ouvrir au public. Chaque étape renvoie au détail. Les apps natives, Stripe, l'IA et les
pushs natifs sont **hors de cette liste** (§12).

- [ ] **1. Bilan lecture seule** (§4). Garde le résultat : il sert de « avant ».
- [ ] **2. Accès aux outils** : dans un terminal à la racine du dépôt, `npx supabase projects list` doit fonctionner
      (CLI connectée) ; Vercel est connecté (`npx vercel env ls`).
- [ ] **3. Inscriptions et e-mails** (§9.1) : désactiver le hook de bêta privée (ou élargir la liste), SMTP
      personnalisé, Site URL, URL de redirection, confirmation d'e-mail activée. **Teste avec une vraie adresse
      externe** (une adresse qui n'est pas celle de l'équipe Supabase).
- [x] **4. SQL-1 — âge 18 ans** (§5, pré-contrôle puis exécution). *Déclaré exécuté le 1er nov. (§2.1).*
- [x] **5. SQL-2 et SQL-3** — événements privés (`can_view_event`) et filtre de lecture des blocages. *Déclaré exécuté le 1er nov.*
- [x] **6. SQL-4 et SQL-5** — index de lancement (hors heures de pointe) et `client_errors`. *Déclaré exécuté le 1er nov. ; `client_errors` existe (sonde).*
- [x] **7. Lot SQL-6 → SQL-15** — gardes d'état de compte, gouvernance, transferts de propriété, listes d'attente,
      bloc fusionné `accept_event_invitation`. Dans l'ordre exact du §5. **Puis SQL-22** (fuites de lecture), répété d'abord sur le projet de répétition (§9.7).
      *Déclaré exécuté le 1er nov., SQL-22 compris (blocs 1, 2, 4A, 3A, 3B), **sans répétition préalable et sans sauvegarde** (§2.1) ; fuite `profile_photos` fermée en lecture anonyme (sonde).*
- [ ] **8. Edge functions** (§8) : redéployer `process-scheduled-deletions`, déployer `cleanup-expired-stories`,
      vérifier que le cron de suppression répond 200.
- [ ] **9. Réglages Supabase** (§9) : Max rows ≥ 1000, sauvegardes, quotas Storage.
- [ ] **10. Site** : `src/config/contact.json` rempli, domaine tranché (§9.5), pages légales relues, push du dépôt
      (Vercel redéploie), vérification de `https://<ton-domaine>/`.
- [ ] **11. Décisions bloquantes** (§10) : au minimum les décisions 3, 4, 12, 13, 14, 15 et 20 (les décisions 1, 2, 8 sont pour les boutiques).
- [ ] **12. Test de bout en bout puis bilan final** : deux comptes réels (inscription, e-mail, onboarding, like
      mutuel, message, signalement, blocage, suppression de compte), puis relancer le bilan (§4) : plus aucune
      ligne « NON » dans les catégories web ; lancer les requêtes de santé du §13.

---

## 4. Étape 0 — le bilan en lecture seule (à lancer en premier)

Colle le bloc ci-dessous dans le SQL Editor (« New query ») et clique Run. Il ne modifie **rien** : il ne fait
que lire les catalogues de la base. Il renvoie une ligne par contrôle ; les lignes **NON** s'affichent d'abord.

Comment lire le résultat :

| Fichier concerné | Résultat attendu AUJOURD'HUI | Si l'attendu n'est pas respecté |
| --- | --- | --- |
| Socle d'août (catégorie C), COMBINED et correctif d'ordre (A) | **oui** | Un « NON » veut dire que ce fichier n'est pas appliqué. S'il est **additif** (ajoute une colonne/une table, « if not exists »), tu peux l'exécuter seul. S'il est marqué DANGEREUX/écrase des objets (§7), **ne le rejoue pas** : note la ligne et demande une session d'aide. |
| Lot du 25 août | **oui** (probable) | idem |
| À exécuter (catégorie B) | **NON** (normal : jamais exécutés), sauf « triggers push message + match » (probable *oui*) | Un « oui » veut dire qu'il est déjà appliqué : saute ce fichier. |
| `events-guards` ligne « accept_event_invitation garde événement passé » | **oui**, et doit RESTER oui après SQL-14 | Si elle passe à NON, le fichier de `accept_event_invitation` non fusionné a été exécuté : exécute le bloc de SQL-14. |

```sql
with
  tbl as (select tablename::text as k from pg_tables where schemaname = 'public'),
  col as (select (table_name || '.' || column_name)::text as k, is_nullable as nul from information_schema.columns where table_schema = 'public'),
  fn  as (select p.proname::text as k, p.prosrc as s from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
  trg as (select tgname::text as k, pg_get_triggerdef(oid) as s from pg_trigger where not tgisinternal),
  pol as (select lower(tablename || '|' || policyname) as k, coalesce(qual, '') || ' ' || coalesce(with_check, '') as s from pg_policies),
  con as (select conname::text as k, pg_get_constraintdef(oid) as s, convalidated as valid from pg_constraint),
  idx as (select indexname::text as k from pg_indexes where schemaname = 'public'),
  cr  as (select jobname::text as k, command as s from cron.job),
  vlt as (select name::text as k from vault.secrets),
  bkt as (select id::text as k from storage.buckets),
  pub as (select tablename::text as k from pg_publication_tables where pubname = 'supabase_realtime'),
  bilan(fichier, controle, ok) as (
    values
      ('supabase-schema.sql', 'tables profiles, likes, passes, messages', (array['profiles', 'likes', 'passes', 'messages']::text[] <@ array(select k from tbl))),
      ('supabase-missing-columns.sql', 'colonnes profiles.cover_url / last_seen / is_online', (array['profiles.cover_url', 'profiles.last_seen', 'profiles.is_online']::text[] <@ array(select k from col))),
      ('supabase-events.sql', 'tables events, event_attendees', (array['events', 'event_attendees']::text[] <@ array(select k from tbl))),
      ('supabase-matching.sql', 'table blocks + préférences de recherche', (array['blocks']::text[] <@ array(select k from tbl) and array['profiles.pref_age_min', 'profiles.pref_distance']::text[] <@ array(select k from col))),
      ('supabase-profile-onboarding.sql', 'tables favorites, profile_photos + colonnes d''onboarding', (array['favorites', 'profile_photos']::text[] <@ array(select k from tbl) and array['profiles.birth_date', 'profiles.onboarding_completed_at']::text[] <@ array(select k from col))),
      ('supabase-protect-rls.sql', 'fonction sync_profile_verification + profiles.email_verified', (array['sync_profile_verification']::text[] <@ array(select k from fn) and array['profiles.email_verified']::text[] <@ array(select k from col))),
      ('supabase-stories.sql', 'table stories', (array['stories']::text[] <@ array(select k from tbl))),
      ('supabase-stories-media.sql', 'colonnes stories.media_url / media_kind', (array['stories.media_url', 'stories.media_kind']::text[] <@ array(select k from col))),
      ('supabase-stories-expiration.sql', 'stories.expires_at + fonction set_story_expiry', (array['stories.expires_at']::text[] <@ array(select k from col) and array['set_story_expiry']::text[] <@ array(select k from fn))),
      ('supabase-stories-2.sql', 'tables story_views, story_reactions + stories.bg_color', (array['story_views', 'story_reactions']::text[] <@ array(select k from tbl) and array['stories.bg_color']::text[] <@ array(select k from col))),
      ('supabase-messaging.sql', 'table reports + messages.read_at', (array['reports']::text[] <@ array(select k from tbl) and array['messages.read_at', 'reports.category']::text[] <@ array(select k from col))),
      ('supabase-messages-media.sql', 'colonnes messages.kind / media_path / media_meta', (array['messages.kind', 'messages.media_path', 'messages.media_meta']::text[] <@ array(select k from col))),
      ('supabase-chat-media-storage.sql', 'bucket chat-media', (array['chat-media']::text[] <@ array(select k from bkt))),
      ('supabase-audit-fixes.sql', 'policy d''envoi de message (match réciproque)', (array['messages|un utilisateur envoie seulement dans une conversation matchee']::text[] <@ array(select k from pol))),
      ('supabase-communities.sql', 'tables communautés + fonctions de rôle', (array['communities', 'community_members', 'community_posts', 'community_comments', 'community_reports', 'community_invites', 'community_join_requests', 'notifications']::text[] <@ array(select k from tbl) and array['current_profile_id', 'is_community_member']::text[] <@ array(select k from fn))),
      ('supabase-communities-2.sql', 'communities.rules + decline_invite', (array['communities.rules']::text[] <@ array(select k from col) and array['decline_invite', 'create_community']::text[] <@ array(select k from fn))),
      ('supabase-communities-3.sql', 'bucket community-media + réponses aux commentaires', (array['community-media']::text[] <@ array(select k from bkt) and array['community_posts.media_url', 'community_comments.reply_to_id']::text[] <@ array(select k from col))),
      ('supabase-dating-2.sql', 'profiles.dating_enabled + unmatch_profile', (array['profiles.dating_enabled']::text[] <@ array(select k from col) and array['unmatch_profile']::text[] <@ array(select k from fn))),
      ('supabase-messaging-2.sql', 'table message_reactions + messages.reply_to_id', (array['message_reactions']::text[] <@ array(select k from tbl) and array['messages.reply_to_id', 'messages.deleted_at']::text[] <@ array(select k from col))),
      ('supabase-push-notifications.sql', 'table push_subscriptions', (array['push_subscriptions']::text[] <@ array(select k from tbl))),
      ('supabase-geolocation.sql', 'table user_locations + nearby_profiles', (array['user_locations']::text[] <@ array(select k from tbl) and array['nearby_profiles']::text[] <@ array(select k from fn))),
      ('supabase-fix-name-not-null.sql', 'profiles.name accepte NULL', (exists (select 1 from col where k = 'profiles.name' and nul = 'YES'))),
      ('supabase-account-deletion.sql', 'colonne deletion_requested_at + cron de suppression + secret Vault service_role_key', (array['profiles.deletion_requested_at']::text[] <@ array(select k from col) and array['baobab-process-scheduled-deletions']::text[] <@ array(select k from cr) and array['service_role_key']::text[] <@ array(select k from vlt))),
      ('supabase-admin.sql', 'rôles plateforme et journal admin', (array['platform_roles', 'admin_actions']::text[] <@ array(select k from tbl) and array['profiles.banned_at', 'profiles.suspended_until']::text[] <@ array(select k from col) and array['is_moderator_or_above', 'grant_platform_role']::text[] <@ array(select k from fn))),
      ('supabase-beta-feedback-category.sql', 'beta_feedback.category', (array['beta_feedback.category']::text[] <@ array(select k from col))),
      ('supabase-immigration-news.sql', 'tables d''actualités + cron des actualités', (array['immigration_news', 'immigration_news_fetch_log']::text[] <@ array(select k from tbl) and array['baobab-fetch-immigration-news']::text[] <@ array(select k from cr))),
      ('supabase-immigration-news-2.sql', 'table immigration_news_favorites', (array['immigration_news_favorites']::text[] <@ array(select k from tbl))),
      ('supabase-info.sql', 'module Info Canada (articles, éditeurs, signalements)', (array['info_articles', 'info_editors', 'info_reports']::text[] <@ array(select k from tbl))),
      ('supabase-last-name.sql', 'profiles.last_name', (array['profiles.last_name']::text[] <@ array(select k from col))),
      ('supabase-public-user-count.sql', 'fonction public_user_count', (array['public_user_count']::text[] <@ array(select k from fn))),
      ('supabase-delete-own-content.sql', 'policy « le créateur supprime son événement »', (array['events|le createur supprime son evenement']::text[] <@ array(select k from pol))),
      ('supabase-match-preferences-looking-for.sql', 'profiles.pref_looking_for', (array['profiles.pref_looking_for']::text[] <@ array(select k from col))),
      ('supabase-messaging-read-receipts-privacy.sql', 'profiles.show_read_receipts', (array['profiles.show_read_receipts']::text[] <@ array(select k from col))),
      ('supabase-premium-messaging.sql', 'table app_config + get_message_quota', (array['app_config']::text[] <@ array(select k from tbl) and array['get_message_quota', 'enforce_premium_message_limits']::text[] <@ array(select k from fn))),
      ('supabase-premium-badge-protect.sql', 'fonction/trigger protect_premium_flag', (array['protect_premium_flag']::text[] <@ array(select k from fn) and array['trg_protect_premium_flag']::text[] <@ array(select k from trg))),
      ('supabase-realtime-messages.sql', 'table messages dans la publication Realtime', (array['messages']::text[] <@ array(select k from pub))),
      ('supabase-like-rate-limit.sql', 'limite de débit des likes', (array['check_like_rate_limit']::text[] <@ array(select k from fn) and array['trg_like_rate_limit']::text[] <@ array(select k from trg))),
      ('supabase-events-v2.sql', 'tables d''événements v2 + can_view_event/join_event', (array['event_staff', 'event_invitations', 'event_comments', 'event_media', 'event_reports']::text[] <@ array(select k from tbl) and array['can_view_event', 'join_event']::text[] <@ array(select k from fn))),
      ('supabase-follows.sql', 'table follows', (array['follows']::text[] <@ array(select k from tbl))),
      ('supabase-premium.sql', 'tables subscriptions, subscription_events + is_premium', (array['subscriptions', 'subscription_events']::text[] <@ array(select k from tbl) and array['is_premium']::text[] <@ array(select k from fn))),
      ('supabase-intelligence.sql', 'tables hidden_recommendations, recommendation_feedback, ai_usage', (array['hidden_recommendations', 'recommendation_feedback', 'ai_usage']::text[] <@ array(select k from tbl))),
      ('supabase-launch-growth.sql', 'table analytics_events + profiles.usage_goals', (array['analytics_events']::text[] <@ array(select k from tbl) and array['profiles.usage_goals']::text[] <@ array(select k from col))),
      ('supabase-scale-security.sql', 'policy de création de profil (anti-usurpation)', (array['profiles|creation de son propre profil uniquement']::text[] <@ array(select k from pol))),
      ('supabase-scale-security-2.sql', 'limite de débit des messages/abonnements + index', (array['check_message_rate_limit', 'check_follow_rate_limit']::text[] <@ array(select k from fn) and array['idx_messages_match_key_created']::text[] <@ array(select k from idx))),
      ('supabase-feed-posts.sql', 'tables du fil (posts, likes, commentaires, signalements)', (array['posts', 'post_likes', 'post_comments', 'post_reports']::text[] <@ array(select k from tbl))),
      ('supabase-events-timezone.sql', 'events.timezone', (array['events.timezone']::text[] <@ array(select k from col))),
      ('supabase-notifications-persistence.sql', 'notifications like/message + notification_preferences', (array['profiles.notification_preferences']::text[] <@ array(select k from col) and array['notify_message', 'notify_like']::text[] <@ array(select k from fn))),
      ('supabase-beta-access.sql', 'table beta_testers + check_beta_whitelist', (array['beta_testers']::text[] <@ array(select k from tbl) and array['check_beta_whitelist']::text[] <@ array(select k from fn))),
      ('supabase-beta-tracking.sql', 'tables beta_events, beta_feedback', (array['beta_events', 'beta_feedback']::text[] <@ array(select k from tbl))),
      ('supabase-premium-badge.sql', 'profiles.is_premium + trigger de synchro', (array['profiles.is_premium']::text[] <@ array(select k from col) and array['trg_sync_profile_premium_flag']::text[] <@ array(select k from trg))),
      ('supabase-founder-badge.sql', 'profiles.is_founder', (array['profiles.is_founder']::text[] <@ array(select k from col))),
      ('supabase-founder-birth-year-privacy.sql', 'profiles.show_birth_year', (array['profiles.show_birth_year']::text[] <@ array(select k from col))),
      ('supabase-index-blocks-passes.sql', 'index idx_blocks_to_id / idx_passes_to_id', (array['idx_blocks_to_id', 'idx_passes_to_id']::text[] <@ array(select k from idx))),
      ('supabase-unlike.sql', 'policy « retirer son propre like »', (array['likes|un utilisateur retire son propre like']::text[] <@ array(select k from pol))),
      ('supabase-account-deletion-timeout-fix.sql', 'cron de suppression avec timeout 30 s', (exists (select 1 from cr where k = 'baobab-process-scheduled-deletions' and s ilike '%timeout_milliseconds%'))),
      ('supabase-beta-feedback-admin.sql', 'beta_feedback.status/priority + admin_update_feedback', (array['beta_feedback.status', 'beta_feedback.priority']::text[] <@ array(select k from col) and array['admin_update_feedback']::text[] <@ array(select k from fn))),
      ('supabase-canada-gate.sql', 'user_locations.last_in_canada_at', (array['user_locations.last_in_canada_at']::text[] <@ array(select k from col))),
      ('supabase-events-guards.sql', 'join_event refuse un événement passé', (exists (select 1 from fn where k = 'join_event' and s ilike '%deja passe%'))),
      ('supabase-geolocation-privacy-fix.sql', 'nearby_profiles respecte show_general_area', (exists (select 1 from fn where k = 'nearby_profiles' and s ilike '%show_general_area%'))),
      ('supabase-report-minor-category.sql', 'reports_category_check accepte « mineur_suspecte »', (exists (select 1 from con where k = 'reports_category_check' and s ilike '%mineur_suspecte%'))),
      ('supabase-age-check-server-side.sql', 'contrainte profiles_min_age_18 présente', (array['profiles_min_age_18']::text[] <@ array(select k from con))),
      ('supabase-age-check-server-side.sql', 'contrainte profiles_min_age_18 VALIDÉE (validate constraint fait)', (exists (select 1 from con where k = 'profiles_min_age_18' and valid))),
      ('§8 (DEPLOIEMENT.md) can_view_event', 'can_view_event ignore les invitations refusées', (exists (select 1 from fn where k = 'can_view_event' and s ilike '%declined%'))),
      ('supabase-content-select-block-filter-fix.sql', 'lecture des posts filtrée par blocage', (exists (select 1 from pol where k = 'posts|lecture des publications par tout utilisateur authentifie' and s ilike '%blocks%'))),
      ('supabase-indexes-launch-fix.sql', '12 index de lancement', (array['idx_favorites_to_id', 'idx_stories_expires_at', 'idx_stories_profile_created', 'idx_profiles_created_at', 'idx_profile_photos_profile_position', 'idx_community_posts_community_created', 'idx_community_comments_post', 'idx_event_comments_event_created', 'idx_event_invitations_invited_status', 'idx_community_invites_invited_status', 'idx_community_join_requests_profile_pending', 'idx_communities_created_at']::text[] <@ array(select k from idx))),
      ('supabase-client-errors.sql', 'table client_errors + cron de purge', (array['client_errors']::text[] <@ array(select k from tbl) and array['baobab-cleanup-old-client-errors']::text[] <@ array(select k from cr))),
      ('supabase-posts-update-account-state-guard-fix.sql', 'édition de post refusée aux comptes bannis', (exists (select 1 from pol where k = 'posts|editer sa propre publication' and s ilike '%banned_at%'))),
      ('supabase-community-comments-update-account-state-guard-fix.sql', 'édition de commentaire de communauté refusée aux comptes bannis', (exists (select 1 from pol where k = 'community_comments|l''auteur modifie son propre commentaire' and s ilike '%banned_at%'))),
      ('supabase-admin-resolve-report-race-fix.sql', 'admin_resolve_report refuse un signalement déjà traité', (exists (select 1 from fn where k = 'admin_resolve_report' and s ilike '%deja traite%'))),
      ('supabase-community-join-request-block-bypass-fix.sql', 'notify_join_request tient compte des blocages', (exists (select 1 from fn where k = 'notify_join_request' and s ilike '%blocks%'))),
      ('supabase-community-event-governance-banned-staff-fix.sql', 'gestion de communauté refusée aux comptes bannis', (exists (select 1 from pol where k = 'communities|le staff modifie sa communaute' and s ilike '%banned_at%'))),
      ('supabase-community-orphan-guard-fix.sql', 'départ d''un dernier owner/admin refusé (policy DELETE)', (exists (select 1 from pol where k = 'community_members|quitter ou etre retire selon la hierarchie' and s ilike '%orphaned%'))),
      ('supabase-community-role-change-orphan-fix.sql', 'auto-rétrogradation du dernier owner refusée (policy UPDATE)', (exists (select 1 from pol where k = 'community_members|changement de role selon la hierarchie' and s ilike '%orphaned%'))),
      ('supabase-community-invite-block-bypass-fix.sql', 'invitation de communauté refusée entre profils bloqués', (exists (select 1 from pol where k = 'community_invites|le staff cree des invitations' and s ilike '%blocks%'))),
      ('supabase-community-orphan-account-deletion-fix.sql', 'trigger de transfert de propriété (communautés)', (array['community_members_promote_successor']::text[] <@ array(select k from trg))),
      ('supabase-event-orphan-account-deletion-fix.sql', 'trigger de transfert de propriété (événements)', (array['event_staff_promote_successor']::text[] <@ array(select k from trg))),
      ('supabase-waitlist-promotion-race-fix.sql', 'promote_from_waitlist verrouille l''événement', (exists (select 1 from fn where k = 'promote_from_waitlist' and s ilike '%events where id = v_event_id for update%'))),
      ('supabase-accept-event-invitation-membership-check-fix.sql', 'accept_event_invitation revérifie l''accès (can_view_event)', (exists (select 1 from fn where k = 'accept_event_invitation' and s ilike '%can_view_event%'))),
      ('supabase-events-guards.sql', 'accept_event_invitation garde « événement passé » (doit rester vrai APRÈS le bloc fusionné)', (exists (select 1 from fn where k = 'accept_event_invitation' and s ilike '%deja passe%'))),
      ('supabase-premium-media-kind-mismatch-fix.sql', 'paywall messagerie bloque les photos (kind image)', (exists (select 1 from fn where k = 'enforce_premium_message_limits' and s ilike '%''image'', ''video''%'))),
      ('supabase-device-tokens.sql', 'table device_push_tokens + register_device_push_token', (array['device_push_tokens']::text[] <@ array(select k from tbl) and array['register_device_push_token']::text[] <@ array(select k from fn))),
      ('supabase-push-notifications-triggers.sql', 'triggers push message + match', (array['trg_push_notify_message', 'trg_push_notify_match']::text[] <@ array(select k from trg))),
      ('supabase-push-notifications-triggers.sql', 'triggers push like + abonnement', (array['trg_push_notify_like', 'trg_push_notify_follow']::text[] <@ array(select k from trg))),
      ('supabase-push-notifications-triggers.sql', 'secret Vault push_webhook_secret', (array['push_webhook_secret']::text[] <@ array(select k from vlt))),
      ('supabase-unaccent-search.sql', 'fonction unaccent_immutable', (array['unaccent_immutable']::text[] <@ array(select k from fn))),
      ('supabase-post-report-minor-category.sql', 'post_reports accepte « mineur_suspecte »', (exists (select 1 from con where k = 'post_reports_category_check' and s ilike '%mineur_suspecte%'))),
      ('supabase-storage-account-quota.sql', 'trigger de quota de stockage', (array['trg_enforce_storage_account_quota']::text[] <@ array(select k from trg))),
      ('§8 (DEPLOIEMENT.md) block_private_event_share', 'trigger anti-partage d''événement privé (optionnel)', (array['trg_block_private_event_share']::text[] <@ array(select k from trg))),
      ('supabase-COMBINED-pending-fixes.sql', 'garde is_moderator_or_above corrigée (coalesce)', (exists (select 1 from fn where k = 'is_moderator_or_above' and s ilike '%coalesce%'))),
      ('supabase-COMBINED-pending-fixes.sql', 'colonnes de confiance protégées (triggers INSERT OR UPDATE)', (exists (select 1 from trg where k = 'trg_protect_premium_flag' and s ilike '%insert or update%') and exists (select 1 from trg where k = 'trg_protect_founder_flag' and s ilike '%insert or update%') and array['trg_protect_profile_trust_columns']::text[] <@ array(select k from trg))),
      ('supabase-COMBINED-pending-fixes.sql', '3 crons du COMBINED planifiés', (array['baobab-cleanup-old-notifications', 'baobab-send-event-reminders', 'baobab-cleanup-expired-stories']::text[] <@ array(select k from cr))),
      ('supabase-COMBINED-pending-fixes.sql', 'get_my_likers + reports.status + stripe_event_created_at', (array['get_my_likers']::text[] <@ array(select k from fn) and array['reports.status', 'subscriptions.stripe_event_created_at']::text[] <@ array(select k from col))),
      ('supabase-combined-supersede-order-regression-fix.sql', 'likes : garde banni/suspendu présente (état final autoritaire)', (exists (select 1 from pol where k = 'likes|un utilisateur like en son propre nom' and s ilike '%banned_at%'))),
      ('supabase-combined-supersede-order-regression-fix.sql', 'reports : limite globale ; create_event : garde d''authentification', (exists (select 1 from fn where k = 'check_report_rate_limit' and s ilike '%global_recent_action_count%') and exists (select 1 from fn where k = 'create_event' and s ilike '%current_profile_id() is null%'))),
      ('supabase-close-read-leaks.sql', 'bloc 1 : profile_photos avec RLS active et sans accès anon', coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.profile_photos')) and not has_table_privilege('anon', to_regclass('public.profile_photos'), 'SELECT'), false)),
      ('supabase-close-read-leaks.sql', 'bloc 2 : aucune fonction SECURITY DEFINER appelable par anon (hors public_user_count)', (not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and p.proname <> 'public_user_count' and has_function_privilege('anon', p.oid, 'EXECUTE')))),
      ('supabase-close-read-leaks.sql', 'bloc 2 : toute fonction SECURITY DEFINER fixe son search_path', (not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%')))),
      ('supabase-close-read-leaks.sql', 'bloc 3A : fonction get_my_profile', (array['get_my_profile']::text[] <@ array(select k from fn))),
      ('supabase-close-read-leaks.sql', 'bloc 3B : birth_date illisible pour les comptes connectés', (not has_column_privilege('authenticated', 'public.profiles', 'birth_date', 'SELECT'))),
      ('supabase-close-read-leaks.sql', 'bloc 4A : blocks et passes sans réplique complète (Realtime DELETE)', (not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('blocks', 'passes') and c.relreplident = 'f')))
  )
select case when ok then 'oui' else 'NON' end as present, fichier, controle
from bilan
order by ok, fichier, controle;
```

- [ ] Bilan exécuté, résultat sauvegardé (capture d'écran ou export CSV).

Deux contrôles à part (ne figurent pas dans le bilan car ils lisent des valeurs) :

```sql
-- Les secrets du coffre (noms seulement, jamais les valeurs) : on attend service_role_key et push_webhook_secret.
select name, created_at from vault.secrets order by name;

-- Les tâches planifiées existantes (on en attend 5 aujourd'hui, 6 avec client_errors) :
select jobname, schedule, active from cron.job order by jobname;
-- Attendu : baobab-cleanup-expired-stories (0 3 * * *), baobab-cleanup-old-notifications (30 3 * * *),
--           baobab-fetch-immigration-news (0 */6 * * *), baobab-process-scheduled-deletions (0 * * * *),
--           baobab-send-event-reminders (*/15 * * * *) ; plus baobab-cleanup-old-client-errors (45 3 * * *) après SQL-5.
```

---

## 5. Ordre d'exécution du SQL (fiches)

Chaque fiche : le fichier, ce qu'il change, ce qu'il faut avoir avant, le risque, la vérification après, et comment
annuler. **Cadre commun** : SQL Editor > New query > coller le **contenu entier** du fichier > Run. Les fichiers sont
à la racine du dépôt (`C:\Users\user\OneDrive\Desktop\Claude`). Niveaux de risque : *lecture seule* ; *additif*
(ajoute une table/colonne/index sans toucher à l'existant) ; *modifie des fonctions/règles* (remplace une
définition existante : annulable en rejouant l'ancienne) ; *verrou* (bloque brièvement les écritures d'une table).

Prérequis communs, **tous satisfaits d'après le bilan** (à confirmer lignes C) : le socle d'août et le COMBINED.

### Phase W — web (à faire avant l'ouverture)

#### SQL-1 — `supabase-age-check-server-side.sql` (priorité haute)
- [ ] **Pré-contrôle** (lecture seule) : cherche des comptes déjà mineurs, car la contrainte s'appliquera à
      CHAQUE mise à jour de leur ligne (même le simple « en ligne ») et les bloquerait :
      ```sql
      select id, name, birth_date from profiles
      where birth_date is not null and birth_date > (current_date - interval '18 years');
      ```
      Résultat vide attendu. S'il y a des lignes (comptes de test ?), corrige-les ou traite-les **avant**.
- [ ] Exécuter le fichier.
- **Change** : ajoute la contrainte `profiles_min_age_18` (« naissance ≥ 18 ans ») marquée `NOT VALID` : elle contrôle
  toute nouvelle écriture, pas les anciennes lignes.
- **Risque** : *additif*, verrou très bref sur `profiles`.
- **Après** : bilan, ligne « contrainte profiles_min_age_18 présente » = oui. Puis, une fois le pré-contrôle vide :
  ```sql
  alter table profiles validate constraint profiles_min_age_18;
  ```
  (la ligne « VALIDÉE » du bilan passe à oui ; cette commande ne bloque pas les écritures).
- **Annuler** : `alter table profiles drop constraint if exists profiles_min_age_18;`

#### SQL-2 — correctif `can_view_event()` (bloc de `DEPLOIEMENT.md` §8, pas de fichier)
- **Change** : une personne qui refuse une invitation à un événement privé, ou dont l'invitation est révoquée,
  n'y voit plus rien (avant : elle gardait l'accès complet).
- **Prérequis** : `supabase-events-v2.sql` appliqué (bilan, ligne `events-v2`).
- **Risque** : *modifie une fonction* (une seule). Sans effet pour les invités en attente/acceptés.
- [ ] Exécuter :
  ```sql
  create or replace function can_view_event(p_event_id uuid)
  returns boolean language sql stable security definer set search_path = public as $$
    select case ev.visibility
      when 'public' then true
      when 'community' then is_community_member(ev.community_id)
      when 'private' then (
        is_event_mod(ev.id) or is_event_participant(ev.id)
        or exists (
          select 1 from event_invitations
          where event_id = ev.id and invited_profile_id = current_profile_id()
            and status <> 'declined'
        )
      )
      else false end
    from events ev where ev.id = p_event_id;
  $$;
  ```
- **Après** : bilan, ligne « can_view_event ignore les invitations refusées » = oui.
- **Annuler** (définition d'origine de `supabase-events-v2.sql`) : même bloc, avec la ligne
  `or exists (select 1 from event_invitations where event_id = ev.id and invited_profile_id = current_profile_id())`
  sans le `and status <> 'declined'`.

#### SQL-3 — `supabase-content-select-block-filter-fix.sql`
- [ ] Exécuter le fichier.
- **Change** : 8 règles de lecture (posts, médias, likes et commentaires du fil ; posts, likes et commentaires de
  communauté ; commentaires d'événement) masquent le contenu entre deux profils qui se sont bloqués. Aujourd'hui,
  le masquage n'existe que dans l'application.
- **Prérequis** : `blocks`, `can_view_event` (idéalement après SQL-2), tables du fil et des communautés.
- **Risque** : *modifie des règles* (8 policies recréées par `drop` + `create`). Ajoute une sous-requête sur
  `blocks` à chaque lecture : négligeable à l'échelle du lancement.
- **Après** : bilan (ligne `content-select-block-filter-fix` = oui) ; test fonctionnel avec deux comptes : A bloque B,
  B ne voit plus les publications de A (écran du fil).
- **Annuler** : recréer chaque policy d'origine (textes dans `supabase-feed-posts.sql`, `supabase-communities.sql`
  §publications/likes/commentaires, `supabase-events-v2.sql` §commentaires) ; ne le fais qu'en cas de problème avéré.

#### SQL-4 — `supabase-indexes-launch-fix.sql`
- [ ] Exécuter **hors heures de pointe**.
- **Change** : crée 12 index sur les chemins chauds (démarrage de session, ouverture d'une communauté, invitations).
- **Risque** : *verrou* : chaque `create index` bloque les écritures de sa table quelques millisecondes à quelques
  secondes (pas les lectures) ; le fichier ignore avec un message (NOTICE) une table/colonne absente.
- **Après** : bilan, ligne « 12 index de lancement » = oui.
- **Annuler** : `drop index if exists idx_favorites_to_id, idx_stories_expires_at, idx_stories_profile_created, idx_profiles_created_at, idx_profile_photos_profile_position, idx_community_posts_community_created, idx_community_comments_post, idx_event_comments_event_created, idx_event_invitations_invited_status, idx_community_invites_invited_status, idx_community_join_requests_profile_pending, idx_communities_created_at;`

#### SQL-5 — `supabase-client-errors.sql`
- [ ] Exécuter le fichier.
- **Change** : crée la table `client_errors` (rapports d'erreurs JavaScript envoyés par le site, lisibles par les
  modérateurs/admins) et un cron de purge à 30 jours (`baobab-cleanup-old-client-errors`, 3 h 45).
- **Risque** : *additif* (nouvelle table, extension `pg_cron` déjà présente). **Constat** : ce fichier (10 sept, 19 h 23)
  n'est cité nulle part dans `DEPLOIEMENT.md` ; tant qu'il n'est pas exécuté, le site ne rapporte aucune erreur.
- **Après** : bilan (ligne `client-errors` = oui) ; `select count(*) from client_errors;` fonctionne.
- **Annuler** : `select cron.unschedule('baobab-cleanup-old-client-errors'); drop function if exists cleanup_old_client_errors(); drop table if exists client_errors;`

#### SQL-6 — `supabase-posts-update-account-state-guard-fix.sql`
- **Change** : un compte banni, suspendu, sans onboarding terminé ou en suppression ne peut plus **modifier** ses anciennes publications.
- **Prérequis** : `supabase-posts-account-state-guard-fix.sql` (dans le COMBINED : bilan, ligne « COMBINED »).
- **Risque** : *modifie une règle* (policy UPDATE de `posts`). **Après** : bilan. **Annuler** : recréer la policy
  d'origine `"Editer sa propre publication"` avec `using (author_id = current_profile_id()) with check (author_id = current_profile_id())` (pour `authenticated`).
- [ ] Exécuté.

#### SQL-7 — `supabase-community-comments-update-account-state-guard-fix.sql`
- **Change** : même garde pour la modification des commentaires de communauté.
- **Prérequis** : `supabase-communities-3.sql` et `supabase-content-account-state-block-guards-remaining-fix.sql`.
- **Risque** : *modifie une règle*. **Après** : bilan. **Annuler** : recréer `"L'auteur modifie son propre commentaire"` avec `using/with check (author_id = current_profile_id())`.
- [ ] Exécuté.

#### SQL-8 — `supabase-admin-resolve-report-race-fix.sql`
- **Change** : si deux membres du staff traitent le même signalement, le second reçoit « Signalement introuvable ou
  déjà traité » au lieu d'écraser la décision du premier.
- **Prérequis** : `supabase-admin.sql`, tables de signalements. **Risque** : *modifie une fonction*.
- **Après** : bilan. **Annuler** : rejouer la définition de `admin_resolve_report` de `supabase-profile-reports-moderation.sql`.
- [ ] Exécuté.

#### SQL-9 — `supabase-community-join-request-block-bypass-fix.sql`
- **Change** : une demande d'adhésion ne notifie plus un membre du staff qui a bloqué (ou est bloqué par) le demandeur.
- **Prérequis** : `supabase-communities.sql`. **Risque** : *modifie une fonction* (`notify_join_request`).
- **Après** : bilan. **Annuler** : rejouer la fonction d'origine (`supabase-communities.sql`, § notifications).
- [ ] Exécuté.

#### SQL-10 — `supabase-community-event-governance-banned-staff-fix.sql`
- **Change** : un owner de communauté / organisateur d'événement **banni ou suspendu** ne peut plus gérer sa
  communauté/son événement par l'API (modifier, supprimer, exclure, traiter les signalements, accepter les demandes…).
  **Ce fichier contient aussi** les versions finales des règles des trois fichiers suivants, qu'il rend inutiles :
  `supabase-community-orphan-guard-fix.sql`, `supabase-community-role-change-orphan-fix.sql`,
  `supabase-community-invite-block-bypass-fix.sql`.
- **Prérequis** : `supabase-communities.sql`, `supabase-events-v2.sql`, `supabase-existence-oracle-fix.sql` (COMBINED).
- **Risque** : *modifie des règles et 2 fonctions* (`accept_join_request`, `reject_join_request`) — le plus gros
  fichier du lot (≈ 15 objets). Conséquence assumée : un owner banni devient un « owner fantôme » (rien ne
  permet encore à un admin de réattribuer une communauté : lacune connue).
- **Après** : bilan, lignes `community-event-governance…`, `…orphan-guard…`, `…role-change…`, `…invite-block…` = oui toutes les quatre.
- **Annuler** : pas d'annulation simple (≈ 15 objets) ; en cas de problème, ne rien rejouer au hasard.
- [ ] Exécuté. **Ne PAS exécuter ensuite** les trois fichiers « couverts » (ils effaceraient les gardes de bannissement).
      Si tu préfères les exécuter quand même, fais-le **avant** ce fichier, dans cet ordre : `orphan-guard`, `role-change`, `invite-block`, puis la gouvernance.

#### SQL-11 — `supabase-community-orphan-account-deletion-fix.sql`
- **Change** : trigger `BEFORE DELETE` sur `community_members` : quand le dernier owner/admin supprime son compte, la
  propriété passe au membre le mieux placé (modérateur d'abord, puis le plus ancien). Limite : une communauté à un seul
  membre reste sans responsable.
- **Prérequis** : `supabase-communities.sql`. **Risque** : *additif* (1 fonction + 1 trigger ; définit aussi la fonction
  `community_would_be_orphaned_by_leaving`, identique dans les 4 fichiers qui la contiennent).
- **Après** : bilan. **Annuler** : `drop trigger if exists community_members_promote_successor on community_members; drop function if exists community_promote_successor_on_departure();`
- [ ] Exécuté.

#### SQL-12 — `supabase-event-orphan-account-deletion-fix.sql`
- **Change** : même chose pour les organisateurs d'événements (`event_staff`). Limite connue : presque tous les
  événements n'ont qu'un seul membre de staff (la fonction « co-organisateur » n'est pas branchée dans l'app).
- **Prérequis** : `supabase-events-v2.sql`. **Risque** : *additif*.
- **Après** : bilan. **Annuler** : `drop trigger if exists event_staff_promote_successor on event_staff; drop function if exists event_staff_promote_successor_on_departure();`
- [ ] Exécuté.

#### SQL-13 — `supabase-waitlist-promotion-race-fix.sql`
- **Change** : la liste d'attente d'un événement ne promeut plus deux fois la même personne quand deux participants
  partent en même temps. **Prérequis** : `supabase-events-v2.sql`. **Risque** : *modifie une fonction + un trigger*.
- **Après** : bilan. **Annuler** : rejouer `promote_from_waitlist` d'origine (`supabase-events-v2.sql` §liste d'attente).
- [ ] Exécuté.

#### SQL-14 — `accept_event_invitation()` : bloc FUSIONNÉ (à la place de `supabase-accept-event-invitation-membership-check-fix.sql`)
- **Pourquoi pas le fichier** : ce fichier a été écrit à partir de la version d'origine de `supabase-events-v2.sql`.
  Il ignore `supabase-events-guards.sql` (supposé en prod) et **supprimerait** le refus d'accepter une invitation à
  un événement déjà passé. Le bloc ci-dessous est la fusion des deux (le texte vient mot pour mot de ces deux
  fichiers ; **non testé contre ta base**).
- **Change** : accepter une invitation revérifie que tu as encore accès à l'événement (ex. tu as quitté la
  communauté) **et** refuse un événement annulé ou passé.
- **Prérequis** : SQL-2 (`can_view_event`). **Risque** : *modifie une fonction*.
- [ ] Exécuter :
  ```sql
  create or replace function accept_event_invitation(p_invitation_id uuid)
  returns event_attendees
  language plpgsql security definer set search_path = public
  as $$
  declare v_event_id uuid; v_max int; v_canceled timestamptz; v_date timestamptz; v_going int; v_status text; v_row event_attendees;
  begin
    select event_id into v_event_id from event_invitations
      where id = p_invitation_id and status = 'pending' and invited_profile_id = current_profile_id()
      for update;
    if not found then raise exception 'Invitation introuvable ou deja traitee'; end if;

    if not can_view_event(v_event_id) then
      raise exception 'Tu n''as plus acces a cet evenement (ex. tu as quitte la communaute concernee)';
    end if;

    select max_participants, canceled_at, event_date into v_max, v_canceled, v_date from events where id = v_event_id for update;
    if v_canceled is not null then raise exception 'Cet evenement est annule'; end if;
    if v_date is not null and v_date <= now() then raise exception 'Cet evenement est deja passe'; end if;

    update event_invitations set status = 'accepted' where id = p_invitation_id;

    select count(*) into v_going from event_attendees where event_id = v_event_id and status = 'going';
    v_status := case when v_max is null or v_going < v_max then 'going' else 'waitlisted' end;

    insert into event_attendees (event_id, profile_id, status)
    values (v_event_id, current_profile_id(), v_status)
    on conflict (event_id, profile_id) do update set status = excluded.status, updated_at = now()
    returning * into v_row;

    return v_row;
  end;
  $$;
  ```
  (`create or replace` conserve les droits d'exécution déjà réglés : pas besoin de refaire de `grant`.)
- **Après** : bilan, **deux** lignes doivent être « oui » : « accept_event_invitation revérifie l'accès (can_view_event) »
  et « accept_event_invitation garde événement passé ».
- **Annuler** : rejouer `accept_event_invitation` de `supabase-events-guards.sql` (sans le contrôle `can_view_event`).
- [ ] Exécuté. Le fichier `supabase-accept-event-invitation-membership-check-fix.sql` est **marqué « remplacé par le bloc fusionné »**
      et ne doit pas être exécuté.

#### SQL-15 — `supabase-premium-media-kind-mismatch-fix.sql`
- **Change** : le paywall de la messagerie (limites de messages et de médias pour les comptes gratuits) bloque enfin
  les photos (`kind = 'image'` et non `'photo'`). **Sans effet visible tant que `monetization_enabled = false`**
  (c'est le cas) ; à faire AVANT toute activation de la monétisation.
- **Prérequis** : `supabase-premium-messaging.sql`. **Risque** : *modifie une fonction*.
- **Après** : bilan. **Annuler** : rejouer la fonction d'origine de `supabase-premium-messaging.sql` (déconseillé).
- [ ] Exécuté.

#### SQL-22 — `supabase-close-read-leaks.sql` (fuites de lecture C1, C2, I3 de l'audit ; à jouer APRÈS SQL-15)

> **Gravité réelle du constat C2 (20 oct.)** : `profile_photos` est lisible **sans compte** : 11 lignes, dont l'adresse (`url`) de chaque photo.
> Le bucket `avatars` étant **public**, ces adresses ouvrent **les images elles-mêmes**, sans compte. Ce n'est donc pas seulement une liste de chemins :
> les photos des inscrits sont téléchargeables. À corriger **en premier** (bloc 1, aucun changement de code). Fermer la table n'empêche pas de rouvrir une adresse
> déjà copiée (voir bloc 1B).

- [ ] **Prérequis 1 — répétition.** Ce fichier n'a été validé **que sur un schéma factice local** (moteur PGlite, `src/native/closeReadLeaks.test.js`), jamais sur ta base.
      Joue-le d'abord sur le projet de répétition (§9.7), avec **deux comptes de test**, puis seulement en production. Si la répétition n'est pas prête, le **bloc 1 seul**
      est le plus urgent et le plus simple ; tu peux le jouer en production après sauvegarde (§9.4) et pré-contrôle, en gardant la sauvegarde des politiques.
- [ ] **Prérequis 2 — sauvegarde** (§9.4) et **bilan** (§4) : les six lignes `supabase-close-read-leaks.sql` doivent être « NON » avant, « oui » après (le bloc 4A est « NON » tant que `blocks`/`passes` ont une réplique complète).
- **Règle de collage** : un bloc à la fois, jamais le fichier entier. Pour chaque bloc : coller le **pré-contrôle** (lecture seule) et **copier son résultat dans un fichier hors dépôt AVANT de continuer** (surtout 1.f, 2.d, 3.d : c'est ta copie de secours) ; coller le **correctif** (de `-- >>> CORRECTIF` à `-- <<<`) ; coller le **contrôle après**.
  **Journal automatique** (revue du 28 oct.) : les correctifs 1, 2, 3B, 4A et 4B enregistrent d'abord l'état d'origine dans la table `public.baobab_sql22_backup` (invisible pour l'API ; ne la supprime pas avant la fin de la surveillance post-lancement). Le retour arrière de chaque bloc (lignes `--|` du fichier) commence par un petit `do $$ ... $$` qui rejoue ce journal. L'éditeur SQL de Supabase n'affiche pas toujours les messages `NOTICE` (fonctions ignorées) : **seuls les contrôles après font foi** (bloc 2 : la première requête doit rendre uniquement `public_user_count()`).
  **Pré-contrôle 2.e (nouveau, à lire avant le bloc 2)** : (i) aucun réglage `pre_request` (sinon toute requête anonyme échouerait) ; (ii) liste des politiques lisibles sans compte qui appellent une fonction qui va être révoquée à `anon` (ces tables répondront 401 au lieu de `[]` : acceptable seulement si l'app ne les lit pas avant connexion, ce qui est le cas aujourd'hui) ; (iii) fonctions que ton rôle ne peut pas modifier (elles resteraient appelables sans compte).
  Les blocs 1B, 3B et 4B sont « armés » : ajoute en tête de ce que tu colles la ligne `set baobab.arm = 'bloc3b';` (ou `'bloc1b'`, `'bloc4b'`), sinon le script refuse volontairement.

| Bloc | Ferme | Changement de code requis ? | Annuler |
| --- | --- | --- | --- |
| **1** `profile_photos` | C2 : RLS activée, 4 politiques minimales (lecture par comptes connectés, hors blocages/comptes bannis ; écriture seulement de ses propres photos), plus aucun droit pour `anon` | **Non** | Lignes `--|` du bloc + sauvegarde des politiques (pré-contrôle 1.f) |
| **2** fonctions `SECURITY DEFINER` | I3 : retire `EXECUTE` à `anon` et PUBLIC sur toutes (liste blanche : `public_user_count`), ajoute `search_path`, règle les privilèges par défaut pour les futures | **Non** | Lignes `--|` + sauvegarde 2.d |
| **4A** Realtime `blocks`/`passes` | Les événements DELETE ne portent plus que la clé primaire | **Non** (le temps réel des retraits de blocage devient différé) | `replica identity full` |
| **3A** `get_my_profile()` | Prépare 3B (additif, aucun droit changé) | **Non** | `drop function` |
| **3B** colonnes sensibles | C1 : retire à tout compte connecté la lecture de `birth_date`, `ban_reason`, `suspend_reason`, `report_count`, `flagged_for_review`, `notification_preferences` | **Oui, déjà fait** : `src/lib/ownProfile.js` (voir ci-dessous). **À jouer après le déploiement de ce code** | `grant select on profiles to authenticated` |
| **1B** bucket `avatars` privé *(optionnel)* | Rend les anciennes adresses d'images inutilisables | **Oui, gros chantier non fait** (URL signées partout) : **ne pas jouer** | `public = true` |
| **4B** Realtime `likes`/`follows`/`favorites` *(optionnel)* | Idem 4A | Non (perte du temps réel des retraits) | `replica identity full` |

- **Ordre recommandé (code → SQL)** : (1) bloc 1 → (2) bloc 2 → (3) bloc 4A → (4) bloc 3A → (5) **déployer le code** (`git push`, contient `ownProfile.js`) et vérifier avec un compte de test :
  connexion, ouverture de l'onboarding, modification du profil (le code se comporte comme avant tant que 3B n'est pas joué) → (6) bloc 3B → (7) vérification et test à deux comptes.
- **Avant le bloc 3B** : tous les SQL qui ajoutent une colonne à `profiles` (SQL-1 à SQL-15 : `supabase-intelligence.sql`, `supabase-launch-growth.sql`, `supabase-messaging-read-receipts-privacy.sql`, `supabase-match-preferences-looking-for.sql`...) doivent déjà être joués ; les pré-contrôles 3.c2, 3.e et 3.f doivent donner le résultat attendu (3.e et 3.c2 : 0 ligne).
- **Après le bloc 3B** : toute colonne ajoutée plus tard à `profiles` n'est pas lisible par les comptes connectés tant qu'on n'a pas exécuté `grant select (nouvelle_colonne) on public.profiles to authenticated;` **ou rejoué le correctif 3B** (avec sa ligne `set baobab.arm = 'bloc3b';` : il est idempotent et re-donne la lecture de toutes les colonnes sauf les six). La requête 3.f doit toujours rendre exactement les six colonnes sensibles.
  Un test (`src/lib/ownProfile.test.js`) fait échouer la CI si du code réintroduit `select("*")` / `.select()` direct sur `profiles`.
- **Ce que tu dois constater après** (sondes anonymes, clé publique, comptage seulement) : `profile_photos` → 401 (plus « 11 ») ; `rpc/admin_dashboard_stats` → 401/403 **avant** le corps (plus « Non autorise ») ;
  `rpc/public_user_count` → 200 (la page d'accueil garde son compteur). Avec un jeton du compte A : `profiles?select=*&id=eq.<B>` → refusé ; `profiles?select=id,name,age,avatar_url&id=eq.<B>` → 200.
  Les sondes « anonyme = `[]` » du plan (S1) deviennent « anonyme = `[]` **ou 401** » : une table dont la politique appelle `current_profile_id()` répond désormais 401 à un anonyme au lieu de `[]` (aucune donnée exposée dans les deux cas).
- **Test Realtime (10 minutes, sur la répétition uniquement)** : avec deux comptes A et B ouverts dans deux navigateurs, A et B n'étant pas liés, abonner B (console du navigateur, client Supabase) à `postgres_changes` `DELETE` sur `blocks` sans filtre,
  puis faire retirer un blocage à A. Avant le bloc 4A, B reçoit-il la ligne (`from_id`, `to_id`) de A ? Après le 4A, il ne doit recevoir que `id`. Refaire le test avec la clé publique seule (sans connexion). Note le résultat : c'est ce qui décide du bloc 4B.
  Documentation Supabase (guides/realtime/postgres-changes) : « RLS policies are not applied to DELETE statements » ; sans `replica identity full`, un DELETE ne transmet que la clé primaire. **Non vérifié ici** : l'abonnement anonyme, et si Realtime exige le droit de lecture de la table.
- **Risque accepté pour `likes`, `follows`, `favorites` (bloc 4B non joué)** : un DELETE révèle un couple d'identifiants (qui a retiré un like/abonnement/favori de qui), sans nom ni contenu ; il faut un compte pour s'abonner. Justification : sensibilité moindre que les blocages, et le temps réel
  du retrait de like est une fonctionnalité visible. À réexaminer après le lancement (migration vers « Broadcast » avec canaux privés, recommandée par Supabase pour la sécurité et l'échelle). **Décision 21.**
- **Limites connues** : (a) bloc 1 : la photo principale reste visible aux comptes connectés via `profiles.avatar_url` même pour un profil bloqué (les profils ne sont pas filtrés par blocage côté serveur) ; (b) les fonctions `SECURITY DEFINER` appelables par un compte connecté
  mais qui ne devraient l'être que par un cron (ex. `send_event_reminders` est déjà fermée) restent à revoir à la main avec la requête 2.a ; (c) le bloc 2 ne touche pas les fonctions `SECURITY INVOKER` ; (d) PGlite exécute PostgreSQL 18, Supabase 15 ou 17 : aucune syntaxe utilisée n'est propre à la 18.
- [ ] Bloc 1  - [ ] Bloc 2  - [ ] Bloc 4A  - [ ] Bloc 3A  - [ ] Code déployé et vérifié  - [ ] Bloc 3B  - [ ] Sondes anonymes et test à deux comptes notés

### Phase N — apps natives et notifications (après le lancement web, §12)

#### SQL-16 — `supabase-device-tokens.sql`
- **Change** : table `device_push_tokens` (jetons des téléphones) + fonction `register_device_push_token`. RLS : chacun ne voit que les siens.
- **Prérequis** : aucun. **Risque** : *additif*. Tant que ce n'est pas fait, l'app native tourne mais ne reçoit aucun push.
- **Après** : bilan ; `select policyname, cmd from pg_policies where tablename = 'device_push_tokens';` → 4 lignes.
- **Annuler** : `drop function if exists register_device_push_token(text,text,text); drop table if exists device_push_tokens;`
- [ ] Exécuté (avant la publication native).

#### SQL-17 — `supabase-push-notifications-triggers.sql`
- **Change** : 4 triggers qui appellent l'edge function `send-push` à chaque message, match, like et abonnement.
- **Constat** : très probablement déjà en prod pour *message* et *match* depuis le 25 août (§2). Le fichier est
  **idempotent** : le rejouer est sans danger, il ajoute surtout *like* et *abonnement*.
- **Avant de l'exécuter, dans cet ordre** :
  1. [ ] Redéployer `send-push` (§8) **avec `--no-verify-jwt`**.
  2. [ ] Vérifier que le secret du coffre existe : `select name from vault.secrets where name = 'push_webhook_secret';`
         (sinon, voir « ÉTAPE MANUELLE » en bas du fichier : `select vault.create_secret('<la même valeur que PUSH_WEBHOOK_SECRET>', 'push_webhook_secret');` — **tu** tapes la valeur, personne d'autre).
  3. [ ] **Décider** si un push « like » doit nommer la personne (décision 6). Si tu ne veux pas : après l'exécution,
         `drop trigger if exists trg_push_notify_like on likes;`
- **Après** : bilan (deux lignes) ; test : like depuis un second compte, puis
  `select id, status_code, timed_out, created from net._http_response order by created desc limit 5;` → `status_code = 200`.
- **Annuler** : `drop trigger if exists trg_push_notify_message on messages; drop trigger if exists trg_push_notify_match on likes; drop trigger if exists trg_push_notify_like on likes; drop trigger if exists trg_push_notify_follow on follows;`
- [ ] Exécuté.

### Phase O — optionnels

- [ ] **SQL-18 — `supabase-unaccent-search.sql`** : extensions `unaccent`/`pg_trgm`, fonction `unaccent_immutable`, 7 index. *Additif, verrou bref.*
      **Aucun effet visible** tant que le code du site n'utilise pas la fonction (non fait). À ne faire que si tu prévois ce chantier. Annuler : `drop index if exists idx_communities_name_unaccent_trgm, idx_communities_description_unaccent_trgm, idx_communities_city_unaccent_trgm, idx_events_title_unaccent_trgm, idx_events_description_unaccent_trgm, idx_events_city_unaccent_trgm, idx_profiles_name_unaccent_trgm;`
- [ ] **SQL-19 — `supabase-post-report-minor-category.sql`** : autorise le motif « mineur suspecté » sur les signalements de publications (contrainte plus permissive). Aujourd'hui le site ne propose simplement pas ce motif pour une publication. Après l'avoir exécuté, retirer le `.filter(...)` dans `src/lib/reportCategories.js` (code : session de développement). *Additif.*
- [ ] **SQL-20 — `supabase-storage-account-quota.sql`** : plafond de stockage par compte (1 Go « arbitraire »), trigger sur `storage.objects`. **Décision requise** (plafond, comptes existants au-dessus). Pré-contrôle dans le fichier (requête « avant d'activer »). **Risque non vérifié** : la table `storage.objects` appartient à Supabase ; la création du trigger peut être refusée (« must be owner of table objects »). Si c'est refusé, abandonne : ce n'est pas indispensable.
- [ ] **SQL-21 — filet « événement privé non partageable en conversation »** (`DEPLOIEMENT.md` §8, 2 blocs : trigger `trg_block_private_event_share`, puis nettoyage des cartes déjà envoyées). Optionnel : le site masque déjà l'option ; ce trigger protège contre un client modifié.
- [x] **SQL-23 (exécuté en production le 31/10/2026) — `supabase-remove-community-member-cleanup-events-fix.sql`** : fonction `SECURITY DEFINER` `remove_community_member_and_cleanup_events(p_member_id)` ; exclure un membre décline désormais ses invitations « pending » et retire ses inscriptions aux événements « membres » à venir (`DEPLOIEMENT.md` §6). *Additif (une fonction), aucune policy modifiée.* **À jouer AVANT le déploiement du client** qui l'appelle (`handleRemoveMember`) : sans elle, l'exclusion d'un membre échoue (« Impossible de retirer ce membre »). Contrôle : `select prosecdef, has_function_privilege('anon', oid, 'execute') from pg_proc where proname = 'remove_community_member_and_cleanup_events';` → `true | false`. Annuler : `drop function if exists remove_community_member_and_cleanup_events(uuid);` (le client doit alors revenir au `.delete()` direct). Validé seulement sur un schéma factice PGlite (`src/native/removeCommunityMember.test.js`).
- [x] **SQL-25 — `supabase-block-enforcement-messages-fix.sql`** (livré le 03/11/2026, **EXÉCUTÉ en production le 04/11/2026** (accord explicite du propriétaire, **sans sauvegarde**, vérifié ensuite en lecture seule : voir `AUDIT-COMPLET-2026-11.md`)) : corrige le blocage « à sens unique » de la messagerie (la personne bloquée pouvait continuer à écrire, réagir et téléverser dans la conversation). Ajoute `is_blocked_pair(a, b)` (SECURITY DEFINER, répond seulement à l'une des deux personnes, aucun droit pour `anon`) et des policies **RESTRICTIVES** `INSERT` (messages, message_reactions, storage.objects chat-media, likes, follows, favorites, event_invitations). *Additif : aucune policy existante modifiée ni supprimée, aucune RLS désactivée.* Contrôle et retour arrière : en-tête du fichier. Validé sur schéma factice PGlite (`src/native/blockEnforcement.test.js`) et sur la répétition (`scripts/staging-e2e.mjs`). **Exécuter sur la répétition d'abord, puis en production avec ton autorisation explicite.**
- [x] **SQL-36 — `supabase-block-enforcement-content-fix.sql`** (livré le 05/11/2026, **EXÉCUTÉ en production le 05/11/2026** avec l'accord explicite du propriétaire, sans sauvegarde ; vérifié en lecture seule : 12 policies `*_block_enforcement_insert` toutes restrictives, 4 fonctions `is_blocked_with_*` sans droit pour `anon` ; prérequis : SQL-25) : même défaut que SQL-25 sur **six tables** que SQL-25 ne couvrait pas — `post_comments`, `post_likes`, `community_comments`, `community_post_likes`, `event_comments` (blocage avec l'organisateur `events.created_by`) et `community_invites` : leur policy INSERT lit `blocks` avec les droits de l'appelant (RLS) donc la personne **bloquée** ne voit pas le blocage et peut encore commenter / aimer / inviter via l'API (relevé en lecture seule des policies de production le 05/11). Ajoute 6 policies **RESTRICTIVES** INSERT qui utilisent `is_blocked_pair()` (SQL-25) **via 4 petites fonctions `is_blocked_with_*` (SECURITY DEFINER, booléen seulement, fermées à anon)** : retrouver l'auteur par sous-requête est lui aussi soumis à la RLS, si bien que *celui qui a bloqué* ne voyait plus la publication et passait (trou trouvé à l'essai sur baobab-staging) ; `is_blocked_with_comment_author` est fournie pour SQL-35 ; additif, aucune policy modifiée, aucun changement de client ; un refus remonte comme un 42501 (« Tu n'as pas la permission… »). Les lectures (SELECT) ne changent pas (choix de SQL-25). Retour arrière : 6 `drop policy` en tête du fichier. Validé sur schéma factice PGlite avec la RLS de lecture de `posts`/`community_posts`/`events` (`src/native/blockEnforcementContent.test.js`, 26 cas : défaut reproduit avant dans les deux sens, refus dans les deux sens après, usage normal et tiers non affectés, organisateur d'événement) et sur la répétition (essai avant/après de la session messagerie, premier jet) ; **rejoué sur baobab-staging avec la version corrigée (39/39 : bloqué et bloqueur, deux sens, six chemins) avant la production**.
- [x] **SQL-37 — `supabase-premium-entitlements.sql`** (livré le 05/11/2026, **EXÉCUTÉ en production le 10/11/2026** sur ordre explicite du propriétaire, sans sauvegarde, contrôle en lecture seule avant/après : 3 avantages actifs, une seule policy SELECT, RLS active, anonyme sans accès, comptes connectés sans écriture, fonctions exécutables par les comptes connectés seulement ; **non testé en réel** : `admin_premium_stats()` appelée par un vrai administrateur, prérequis : `supabase-premium.sql` et `supabase-admin.sql`) : fondation serveur de Baobab Premium (phase P0). Ajoute (1) la table `premium_entitlements` (catalogue des trois avantages réellement livrés ; lecture pour les comptes connectés, aucune policy d'écriture), (2) `has_premium_feature(profil, clé)` = `is_premium()` ET avantage actif, brique des futures policies RLS (la résiliation retire l'accès sans autre action) et (3) `admin_premium_stats()` : abonnés, essais, formules, résiliations programmées et réalisées, conversion, réservée aux administrateurs, **sans aucun montant** (Stripe fait foi pour les revenus). Additif, aucun changement de client ; rien ne s'en sert encore, donc exécution sans urgence et sans effet visible. Retour arrière : 3 `drop` en tête du fichier. Validé sur schéma factice PGlite (`src/native/premiumEntitlements.test.js`, 14 cas) ; **à rejouer sur la répétition avant la production**.
- [ ] **SQL-38 — `supabase-premium-collections.sql`** (livré le 10/11/2026, **NON exécuté**, prérequis : SQL-37 et `supabase-feed-posts.sql`) : avantage Premium « collections privées de publications ». Deux tables (`post_collections`, `post_collection_items`), RLS : créer une collection ou y ranger une publication exige `has_premium_feature(moi, 'private_collections')` (vérifié côté serveur : un compte gratuit qui forge la requête reçoit un 42501) ; lire, renommer, retirer et supprimer ses propres lignes reste toujours permis, **même après résiliation** (on ne détruit pas ce que la personne a rangé). Limites par trigger : 20 collections, 500 publications par collection, nom de 1 à 40 caractères, pas de doublon de nom. Aucune policy pour `anon`. Sans effet visible tant que `VITE_FEATURE_PREMIUM` est éteint. Retour arrière : 2 `drop table`, 2 `drop function` et une ligne du catalogue, en tête du fichier. Validé sur schéma factice PGlite avec SQL-37 réellement chargé (`src/native/premiumCollections.test.js`, 13 cas, contrôle de mutation fait : retirer l'exigence Premium fait échouer 7 tests) ; **à rejouer sur la répétition avant la production**.
- [ ] **SQL-39 — `supabase-premium-ai.sql`** (livré le 11/11/2026, **NON exécuté**, prérequis : SQL-37 (exécuté) et `supabase-intelligence.sql`) : ouvre les **outils d'écriture IA réservés à Premium** (« Corriger mon texte », « Rédiger à partir de mon idée »). Ajoute la ligne `ai_writing_tools` au catalogue `premium_entitlements` (la mettre à `active = false` coupe ces deux outils pour tous, sans redéployer : interrupteur de coût) et un index `ai_usage(created_at)` pour le plafond mensuel global. Idempotent, ne réactive pas un avantage coupé. **Sans lui, les deux outils restent refusés à tout le monde** et les actions IA existantes ne changent pas. Va avec la **nouvelle version de l'Edge Function `ai-assist`** (quotas : 10 suggestions/24 h en gratuit, 100 en Premium, rafale 20/h, **coupe-circuit global de 20 000 appels/mois** ; réglables par `AI_FREE_PER_DAY`, `AI_PREMIUM_PER_DAY`, `AI_RATE_LIMIT_PER_HOUR`, `AI_MONTHLY_GLOBAL_CAP`), à redéployer **après** ce fichier. Ordre : SQL-39, puis `npx supabase functions deploy ai-assist --project-ref vozehymbihnckzklxesw`, puis `VITE_FEATURE_AI` (la clé `ANTHROPIC_API_KEY` doit être posée). Validé sur schéma factice PGlite avec SQL-37 réellement chargé (`src/native/premiumAi.test.js`) ; la politique d'accès et de coût est testée à part (`supabase/functions/_shared/aiPolicy.test.ts`, 12 cas). L'appel au modèle n'est pas rejouable hors ligne. **À rejouer sur la répétition avant la production.**
- [ ] **SQL-40 — `supabase-premium-stats.sql`** (livré le 11/11/2026, **NON exécuté**, prérequis : SQL-37 (exécuté), `supabase-feed-posts.sql`, `supabase-follows.sql`) : avantage Premium « Mes statistiques ». Ajoute la ligne `creator_stats` au catalogue (la mettre à `active = false` coupe la fonction pour tous) et la fonction `my_creator_stats(jours)` : pour le compte connecté **uniquement**, renvoie des NOMBRES (publications, j'aime et commentaires reçus hors les siens, abonnés, nouveaux abonnés, cinq publications les plus appréciées, courbe par semaine ; période bornée de 7 à 90 jours). **Aucune table créée et aucune visite enregistrée** : Baobab ne sait pas qui consulte un profil, et l'écran le dit au lieu d'afficher de faux compteurs de vues. Aucune identité dans le résultat (pas de liste de personnes). Refus 42501 pour un compte gratuit ou résilié (vérifié côté serveur), aucun droit pour `anon`. Sans effet visible tant que `VITE_FEATURE_PREMIUM` est éteint ; un client sans le SQL affiche « pas encore disponibles ». Retour arrière : un `drop function` et une ligne du catalogue, en tête du fichier. Validé sur schéma factice PGlite avec SQL-37 réellement chargé (`src/native/premiumStats.test.js`, 16 cas, contrôles de mutation faits : retirer le droit ou compter ses propres j'aime fait échouer 3 tests chacun) ; **à rejouer sur la répétition avant la production**.
- [x] **SQL-27 — `supabase-message-delete-window.sql`** (livré le 04/11/2026, **EXÉCUTÉ en production le 04/11/2026** (accord explicite du propriétaire, **sans sauvegarde**, vérifié ensuite en lecture seule : voir `AUDIT-COMPLET-2026-11.md`)) : « Supprimer pour tout le monde » avec **délai vérifié par le serveur** (heure du serveur, 15 minutes par défaut, paramètre `app_config.message_delete_window_minutes`, 1 à 10 080) et **contenu effacé** : texte remplacé par « Ce message a été supprimé. », pièce jointe neutralisée (avant : l'auteur pouvait supprimer sans limite de temps, la date venait du téléphone et le texte d'origine restait lisible par l'API). Tout passe par le déclencheur existant `enforce_message_update_rules` (aucun appel direct à l'API ne peut le contourner) ; `deleted_at`/`deleted_by` posés par le serveur ; idempotent ; suppression non annulable. *Modifie une fonction + ajoute une colonne (additif).* **Déploiement : pousser le client d'abord** (il fonctionne avant le SQL, option limitée à 15 min côté interface), puis exécuter le fichier, puis vérifier (en-tête du fichier). Changer le délai : `update public.app_config set message_delete_window_minutes = 30;` (effet immédiat). **Limite** : le fichier d'une photo/vidéo supprimée reste dans le bucket privé `chat-media` (le client tente de le retirer par l'API Storage). Retour arrière dans l'en-tête (le contenu déjà effacé ne revient pas). Validé sur schéma factice PGlite (`src/native/messageDeleteWindow.test.js`, 17 cas) ; pas encore essayé sur le projet de répétition.
- [x] **SQL-28 — `supabase-client-errors-rate-limit-fix.sql`** (livré le 04/11/2026, **EXÉCUTÉ en production le 04/11/2026** (accord explicite du propriétaire, **sans sauvegarde**, vérifié ensuite en lecture seule : voir `AUDIT-COMPLET-2026-11.md`)) : ferme le « `client_errors` sans limite de débit » resté ouvert (déni de service du stockage par un visiteur anonyme). Déclencheur BEFORE INSERT : 30 lignes/minute, 300/jour, 3 000 au total (limites globales), `profile_id` imposé. *Additif : policy et contraintes existantes inchangées.* Contrôle et retour arrière en tête du fichier. Pire cas borné ≈ 40 Mo. Validé PGlite (`src/native/clientErrorsRateLimit.test.js`) et répétition. **À exécuter avec ton autorisation explicite ; priorité haute avant l'ouverture au public.**
- [x] **SQL-30 — `supabase-comment-rate-limit-fix.sql`** (livré le 04/11/2026, **EXÉCUTÉ en production le 04/11/2026** (accord explicite du propriétaire, **sans sauvegarde**, vérifié ensuite en lecture seule : voir `AUDIT-COMPLET-2026-11.md`)) : déclencheurs BEFORE INSERT sur `post_comments`, `community_comments`, `event_comments` (20 par 5 minutes, 300 par 24 h, par auteur). *Additif.* Contrôle et retour arrière en tête du fichier. Avec ton autorisation explicite.
- [x] **SQL-29 — `supabase-fk-indexes-fix.sql`** (livré le 04/11/2026, **EXÉCUTÉ en production le 04/11/2026** (accord explicite du propriétaire, **sans sauvegarde**, vérifié ensuite en lecture seule : voir `AUDIT-COMPLET-2026-11.md`)) : 43 index manquants sur des clés étrangères (audit base de données). Sans eux, supprimer un profil parcourt entièrement chaque table liée. *Additif, rejouable.* Complète SQL-4. **Hors heures de pointe**, avec ton autorisation explicite. Retour arrière : `drop index if exists public.idx_…`.
- [x] **SQL-34 — `supabase-client-errors-rate-limit-v2-fix.sql`** (livré le 04/11/2026, **EXÉCUTÉ en production le 04/11/2026** (accord explicite du propriétaire, sans sauvegarde ; vérifié en lecture seule : fonction v2 active, déclencheur présent, `anon` sans droit d'exécution, policy inchangée, 1 ligne / 64 ko)) : affine SQL-28 (déjà exécuté) après la revue croisée du 04/11 : dédoublonnage silencieux d'une même erreur sur 10 minutes, plafonds séparés anonymes / connectés (20/min · 500/jour et 120/min · 5 000/jour), plafond de taille 100 Mo à la place de « 3 000 lignes au total ». *Additif : `create or replace` d'une fonction ; retour arrière = rejouer `supabase-client-errors-rate-limit-fix.sql`.* À exécuter avec ton autorisation explicite.
- [x] **SQL-24 — `supabase-age-refresh-cron.sql`** (livré le 01/11/2026, **déclaré exécuté le 1er nov.**, §2.1) : `profiles.age` n’est écrit qu’une fois (inscription ou modification du profil) et rien ne le fait vieillir ; c’est pourtant ce nombre que voient les autres membres. Constaté en production le 01/11 : 1 profil sur 5 avait un âge périmé. Ajoute la fonction `refresh_profile_ages()` (aucun droit pour `anon`/`authenticated`) et la tâche pg_cron `baobab-refresh-profile-ages` (09:00 UTC, tous les jours), puis corrige immédiatement les âges déjà périmés. *Additif, aucune règle modifiée.* Contrôles et retour arrière : en-tête du fichier. Validé sur schéma factice PGlite (`src/native/ageRefresh.test.js`).

### Fichiers à NE PAS exécuter (récapitulatif)
Tous ceux des catégories A, C et D du §7, `supabase-accept-event-invitation-membership-check-fix.sql` (remplacé par SQL-14), et — sauf choix contraire expliqué en SQL-10 — `supabase-community-orphan-guard-fix.sql`, `supabase-community-role-change-orphan-fix.sql`, `supabase-community-invite-block-bypass-fix.sql`.

---

## 6. Conflits entre fichiers et pièges d'ordre

Cette analyse a comparé, fichier par fichier, toutes les fonctions, règles (policies), triggers et contraintes
redéfinis plusieurs fois. Quand deux fichiers redéfinissent la même chose, **le dernier exécuté gagne**, sans erreur.

### 6.1 Quel fichier gagne (état final voulu)

| Objet | Définitions successives (la dernière gagne) | État en prod | Après la mission de lancement |
| --- | --- | --- | --- |
| `create_event()` | `events-v2` < `events-timezone` < `create-community-event-authz-fix` < `events-duration-guard` < **`combined-supersede-order-regression-fix`** | final = correctif d'ordre (10 sept) | inchangé |
| Policies INSERT `likes`, `follows`, `favorites`, `messages`, `event_invitations` | `matching`/`follows`/…/`events-guards` < `banned/deletion-pending/onboarding-incomplete…-fix` < `block-bypass-fix` < `target-account-state-guards-CONSOLIDATED-fix` < **correctif d'ordre** | final = correctif d'ordre | inchangé |
| `check_report_rate_limit()` | `report-rate-limit-fix` < `global-action-rate-limit-fix` < **correctif d'ordre** | final = correctif d'ordre | inchangé |
| `join_event()` | `events-v2` / `scale-security` < `events-guards` < **`existence-oracle-fix`** | final = existence-oracle | inchangé |
| `accept_event_invitation()` | `events-v2` < **`events-guards`** (en prod) < `accept-event-invitation-membership-check-fix` ← *régresse la garde « événement passé »* | `events-guards` | **bloc fusionné SQL-14** |
| `accept_join_request()`, `reject_join_request()` | `communities` < **`existence-oracle-fix`** (en prod) < `community-event-governance-banned-staff-fix` | existence-oracle | gouvernance (SQL-10) |
| Policies `community_members` (départ, changement de rôle) | `communities` < `orphan-guard-fix` / `role-change-orphan-fix` < **`governance`** (reprend les deux et ajoute le bannissement) | communities (version d'origine) | gouvernance |
| Policy INSERT `community_invites` | `communities` < `invite-block-bypass-fix` < **`governance`** (reprend le blocage) | communities | gouvernance |
| `community_would_be_orphaned_by_leaving()` | 4 définitions **identiques** (guard, role-change, account-deletion, governance) | absente | peu importe l'ordre |
| `admin_resolve_report()` | `admin` < `profile-reports-moderation` (en prod) < `admin-resolve-report-race-fix` | profile-reports-moderation | race-fix (SQL-8) |
| `admin_list_reports()` | `admin` < `profile-reports-moderation` < `report-minor-category` (août) < **`admin-lists-limit-fix`** (COMBINED) | admin-lists-limit-fix | inchangé |
| `admin_dashboard_stats()` | 5 fichiers ; `beta-feedback-admin` et `admin-dashboard-stats-fix` ont aujourd'hui le **même texte** | version fusionnée correcte | inchangé |
| `get_my_likers()`, `get_liker_profile_reveal()` | `premium-admirers-reveal-fix` < `schema-cache-404-400-fix` < **`likers-profile-overexposure-fix`** | final | inchangé |
| `nearby_profiles()` | `geolocation` < **`geolocation-privacy-fix`** | privacy-fix | inchangé |
| `enforce_premium_message_limits()` | `premium-messaging` < `premium-media-kind-mismatch-fix` | premium-messaging | media-kind-fix (SQL-15) |
| `promote_from_waitlist()` + trigger | `events-v2` < `waitlist-promotion-race-fix` | events-v2 | waitlist (SQL-13) |
| `notify_join_request()` | `communities` < `community-join-request-block-bypass-fix` | communities | SQL-9 |
| Policy UPDATE `posts` ; UPDATE `community_comments` | `feed-posts` / `communities-3` < `…-update-account-state-guard-fix` | version d'origine | SQL-6 / SQL-7 |
| 8 policies SELECT (posts, post_media, post_likes, post_comments, community_posts, community_post_likes, community_comments, event_comments) | fichiers d'origine < `content-select-block-filter-fix` | version d'origine | SQL-3 |
| `can_view_event()` | `events-v2` < bloc §8 | events-v2 | SQL-2 |
| Triggers `trg_protect_founder_flag`, `trg_protect_premium_flag` (colonnes de confiance de `profiles`) | `founder-badge` / `premium-badge-protect` (UPDATE seulement) < **`profile-insert-trust-columns-protect-fix`** (INSERT **ou** UPDATE) | final (COMBINED) | à ne pas rejouer |
| Cron `baobab-process-scheduled-deletions` | `account-deletion` (timeout 5 s) < **`account-deletion-timeout-fix`** (30 s) | **[À VÉRIFIER]** (bilan) | inchangé |

### 6.2 Les pièges (à connaître avant de toucher quoi que ce soit)

1. **Rejouer `supabase-COMBINED-pending-fixes.sql`** : il se « répare » à la fin pour 3 objets, mais il remettrait
   `accept_join_request`/`reject_join_request` à la version d'avant la gouvernance (SQL-10) et des policies d'avant
   les autres correctifs. **Ne le rejoue pas.**
2. **`supabase-events-guards.sql` rejoué** : écraserait `join_event()` (la version qui masque l'existence d'un
   événement privé) et la policy d'invitations (gardes d'état de compte). Régression de sécurité silencieuse.
3. **`supabase-accept-event-invitation-membership-check-fix.sql` exécuté tel quel** : supprime la garde « événement
   déjà passé » de `accept_event_invitation()`. Utiliser le bloc fusionné SQL-14.
4. **`orphan-guard`, `role-change`, `invite-block` exécutés APRÈS la gouvernance** : ils redéfinissent les mêmes
   règles **sans** la garde de bannissement (régression). Avant, oui ; après, non.
5. **`supabase-report-minor-category.sql` rejoué** : remet `admin_list_reports()` sans le plafond de 200 lignes ;
   **`supabase-beta-feedback-admin.sql`** : `admin_list_feedback()` sans plafond ; **`supabase-premium-messaging.sql`** :
   `admin_dashboard_stats()` sans signalements de profil ; **`supabase-admin.sql`** : 12 fonctions d'origine ;
   **`supabase-geolocation.sql`** : `nearby_profiles()` sans respect de « zone générale ».
6. **Ré-exécuter `supabase-founder-badge.sql` ou `supabase-premium-badge-protect.sql`** : réinstalle un trigger plus faible
   (UPDATE seulement) ; un compte flambant neuf pourrait s'attribuer Premium/Fondateur à l'inscription.
7. **`supabase-launch-growth.sql` n'est pas idempotent** : il décale `onboarding_step` de +1 à chaque exécution.
8. **`supabase-account-deletion.sql` rejoué après son correctif de délai** : remet le timeout du cron à 5 s.
9. **`supabase-cleanup-test-data.sql`** : supprime des comptes (bloc commenté) ; ne jamais l'exécuter sur la production réelle.
10. **`supabase-schema.sql`** : contient les règles d'origine « lecture publique ». Ne jamais le rejouer.
11. **Contrainte d'âge** (SQL-1) : à chaque mise à jour d'une ligne `profiles` d'un compte déjà mineur (même le « en ligne »),
    Postgres vérifie la contrainte : d'où le pré-contrôle.
12. **Le hook de bêta privée** (`supabase-beta-access.sql`) vit dans le tableau de bord : le SQL ne peut ni le voir ni le couper (§9.1).

### 6.3 Incohérences de documentation corrigées ou signalées

- `DEPLOIEMENT.md` §2a disait de poser `SUPABASE_SERVICE_ROLE_KEY` avec `supabase secrets set` : **inutile** (déjà fournie par
  la plateforme, preuve : `supabase secrets list`) et la CLI refuse normalement les noms commençant par `SUPABASE_`. Corrigé.
- `DEPLOIEMENT.md` §2a ne listait que 3 événements Stripe ; le code de `stripe-webhook` en traite **5** (§8.2). Corrigé.
- `DEPLOIEMENT.md` §2c et §11b : `supabase functions deploy send-push` **sans** `--no-verify-jwt` aurait fait basculer la
  fonction en « JWT obligatoire » (elle est aujourd'hui en `verify_jwt: false`) et fait échouer tous les appels des
  triggers (qui n'envoient que `x-webhook-secret`). Corrigé.
- `DEPLOIEMENT.md` §1c (« jamais exécuté ») est probablement faux pour les triggers *message* et *match* (§2).
- `DEPLOIEMENT.md` ne mentionne pas `supabase-client-errors.sql` ni `supabase-storage-account-quota.sql` : ajoutés ici.

---

## 7. Inventaire des 139 fichiers SQL

Légende des catégories : **A** = en prod (prouvé) ; **B** = à exécuter ; **C** = socle d'août, supposé en prod, à
vérifier par le bilan ; **D** = obsolète ou outil manuel, ne pas exécuter. « Modifié » = date du dernier commit.

### Catégorie A — déjà en prod (47 fichiers) [PROUVÉ]

Exécutés avec le script consolidé le **9 sept 2026** (le correctif d'ordre le 10 sept). Preuve : `DEPLOIEMENT.md` (en-tête et §1), commit `9b05c5b` ; chaque fichier ci-dessous a été modifié pour la dernière fois au plus tard le 9 sept à 23 h 15, donc avant le constat d'exécution (commit `9b05c5b`, 10 sept 17 h 06). Rien à faire ; **ne rien rejouer**.

| Fichier | Modifié | Rôle | Remarque |
| --- | --- | --- | --- |
| `supabase-COMBINED-pending-fixes.sql` | 09/09 | Script consolidé : les 45 sections ci-dessous, dans un ordre voulu. | Exécuté le 9 sept. NE JAMAIS le rejouer (voir « Pièges »). |
| `supabase-authz-null-bypass-CRITIQUE-fix.sql` | 04/09 | Un NULL SQL faisait passer les gardes admin/modérateur pour vraies : corrigé. |  |
| `supabase-storage-anon-listing-fix.sql` | 04/09 | Les dossiers de photos (avatars, post-media) ne sont plus listables par un visiteur sans compte. |  |
| `supabase-stripe-webhook-ordering-fix.sql` | 04/09 | Fiabilité des abonnements (ordre et doublons des événements Stripe) : colonne stripe_event_created_at. | Le code correspondant (stripe-webhook) n'est pas déployé. |
| `supabase-existence-oracle-fix.sql` | 08/09 | join_event / accept_join_request / reject_join_request : plus appelables sans connexion. | accept/reject_join_request seront redéfinies par la gouvernance (SQL-10). |
| `supabase-security-definer-revoke-grant-audit-fix.sql` | 08/09 | Retire l'accès anonyme à check_beta_whitelist, send_event_reminders et d'autres fonctions sensibles. |  |
| `supabase-create-community-event-authz-fix.sql` | 04/09 | create_community / create_event refusent un appel sans connexion. | create_event est écrasée puis rétablie par le correctif d'ordre. |
| `supabase-premium-admirers-reveal-fix.sql` | 04/09 | « Qui m'a aimé » : le floutage Premium est aussi appliqué côté serveur. |  |
| `supabase-schema-cache-404-400-fix.sql` | 08/09 | Corrige deux erreurs console (get_my_likers en 404, user_locations en 400). |  |
| `supabase-likers-profile-overexposure-fix.sql` | 08/09 | get_my_likers / get_liker_profile_reveal ne renvoient plus le profil complet. | Version finale de ces deux fonctions. |
| `supabase-global-action-rate-limit-fix.sql` | 04/09 | Limite de débit globale (40 actions / 60 s) sur messages, likes, abonnements, signalements, invitations. |  |
| `supabase-target-account-state-guards-CONSOLIDATED-fix.sql` | 09/09 | Gardes banni / onboarding incomplet / suppression en attente + blocage sur likes, abonnements, favoris, messages, invitations. | Remplace 3 fichiers obsolètes (voir catégorie D). |
| `supabase-public-user-count-accuracy-fix.sql` | 04/09 | Le compteur public de membres ne compte que les profils réels. |  |
| `supabase-event-media-columns-protect-fix.sql` | 09/09 | Colonnes sensibles des médias d'événement non modifiables par UPDATE. |  |
| `supabase-content-creation-limits-fix.sql` | 09/09 | Limites de création de contenu côté serveur. |  |
| `supabase-profile-trust-columns-protect-fix.sql` | 09/09 | Colonnes de confiance/modération de profiles non modifiables par l'utilisateur (UPDATE). |  |
| `supabase-profile-insert-trust-columns-protect-fix.sql` | 09/09 | Idem à la création du profil : plus d'auto-attribution de is_premium / is_founder. | Critique. |
| `supabase-profile-bio-length-guard-fix.sql` | 09/09 | Biographie limitée à 300 caractères côté serveur. |  |
| `supabase-remaining-text-length-guards-fix.sql` | 09/09 | Limites de longueur serveur sur les autres champs texte. |  |
| `supabase-user-risk-level-authz-fix.sql` | 02/09 | user_risk_level() exige une autorisation. |  |
| `supabase-platform-role-authz-fix.sql` | 02/09 | platform_role() exige une autorisation. |  |
| `supabase-info-role-authz-fix.sql` | 02/09 | info_role() exige une autorisation. |  |
| `supabase-event-participant-count-authz-fix.sql` | 02/09 | Le nombre de participants d'un événement respecte sa visibilité. |  |
| `supabase-community-select-anon-fix.sql` | 02/09 | communities / community_members / event_staff : lecture réservée aux comptes connectés. | Ces tables restent lisibles par TOUT compte connecté (décision 4). |
| `supabase-message-reactions-select-fix.sql` | 02/09 | Les réactions de messages ne sont lisibles que par les participants. |  |
| `supabase-admin-search-escape-fix.sql` | 02/09 | Recherche admin : caractères % et _ échappés. |  |
| `supabase-profile-reports-moderation.sql` | 22/08 | Ajoute reports.status (sans lui, le tableau de bord admin était cassé). |  |
| `supabase-admin-dashboard-stats-fix.sql` | 01/09 | admin_dashboard_stats() : version fusionnée correcte. | Version finale de cette fonction. |
| `supabase-admin-lists-limit-fix.sql` | 03/09 | Plafonne admin_list_reports() / admin_list_feedback() à 200 lignes. | Version finale de ces deux fonctions. |
| `supabase-admin-list-reports-hotfix.sql` | 05/11 | Corrige le HTTP 400 de admin_list_reports() (UNION uuid/bigint car `reports.id` est bigint en production ; ORDER BY qualifié) et ajoute la source `profile` à admin_resolve_report(). | **EXÉCUTÉ en production le 05/11/2026** ; version finale des deux fonctions (remplace celle de admin-lists-limit-fix). |
| `supabase-profile-report-minor-constraint-fix.sql` | 05/11 | Autorise le motif « mineur_suspecte » sur les signalements de PROFIL (la contrainte `reports_category_check` de production le refuse : l'envoi échoue). **Priorité haute (protection des mineurs).** | **EXÉCUTÉ en production le 05/11/2026** (accord explicite du propriétaire, sans sauvegarde ; vérifié en lecture seule après exécution : voir « Exécution en production du 5 novembre (suite) » de MODERATION.md). **CONSTATÉ EXÉCUTÉ EN PRODUCTION le 05/11/2026** (lecture seule : contraintes et fonctions présentes ; exécuté par une autre voie que cette session, avant le relevé) ; essai répétition 9/9 ; ne pas rejouer `report-minor-category` (écraserait le hotfix `admin_list_reports`). |
| `supabase-report-statuses.sql` | 05/11 | Statuts de signalement en attente / en cours d'examen / confirmé / résolu / rejeté : élargit les CHECK de status de 4 tables (présents en production, confirmé en lecture seule), `admin_set_report_status`, `admin_list_reports('open')` = à traiter, `admin_resolve_report` depuis open / in_review / confirmed. | **EXÉCUTÉ en production le 05/11/2026** (accord explicite du propriétaire, sans sauvegarde ; vérifié en lecture seule après exécution : voir « Exécution en production du 5 novembre (suite) » de MODERATION.md). **CONSTATÉ EXÉCUTÉ EN PRODUCTION le 05/11/2026** (lecture seule : contraintes et fonctions présentes ; exécuté par une autre voie que cette session, avant le relevé) ; à jouer APRÈS le hotfix du 05/11 (déjà exécuté) ; le journal des étapes va dans `moderation_decisions` seulement si SQL-31 est installé (sinon aucun journal, aucune erreur). Rejeu de zéro sur la répétition : 39/39 ; test PGlite (14, `reports.id` bigint et uuid). |
| `supabase-events-duration-guard.sql` | 09/09 | Durée d'événement bornée côté serveur. | Sa version de create_event() est écrasée par le correctif d'ordre : ne pas rejouer seul. |
| `supabase-communities-4.sql` | 01/09 | Correctif des réactions multi-emoji de communauté. |  |
| `supabase-user-locations-rls-hardening.sql` | 02/09 | Filet RLS sur user_locations. |  |
| `supabase-profile-text-length-guard-fix.sql` | 03/09 | Limites de longueur serveur sur les champs texte du profil. |  |
| `supabase-post-media.sql` | 21/08 | Galerie multi-médias du fil général (table post_media). |  |
| `supabase-post-media-bucket-limit-fix.sql` | 03/09 | Bucket post-media : taille et types de fichiers limités. |  |
| `supabase-likes-realtime-replica-identity-fix.sql` | 03/09 | Retrait de like répercuté en temps réel sur les autres appareils. |  |
| `supabase-follows-favorites-blocks-passes-realtime-fix.sql` | 03/09 | Temps réel pour abonnements, favoris, blocages, passes. |  |
| `supabase-block-bypass-fix.sql` | 09/09 | Garde de blocage sur likes/abonnements/favoris/invitations (version du 3 sept). | OBSOLÈTE : écrasait les gardes plus récentes ; l'état final vient du correctif d'ordre. Ne pas rejouer. |
| `supabase-report-rate-limit-fix.sql` | 09/09 | Limite de débit des signalements (version du 3 sept). | OBSOLÈTE : remplacée par la limite globale. Ne pas rejouer. |
| `supabase-posts-account-state-guard-fix.sql` | 09/09 | Gardes d'état de compte à la publication (posts, médias, likes, commentaires du fil). |  |
| `supabase-post-likes-comments-block-fix.sql` | 09/09 | Liker/commenter une publication d'un profil qui vous a bloqué est refusé. |  |
| `supabase-content-account-state-block-guards-remaining-fix.sql` | 09/09 | Mêmes gardes sur le reste du contenu (communautés, événements, réactions, statuts). |  |
| `supabase-cleanup-old-notifications.sql` | 09/09 | Purge des notifications de plus de 90 jours (cron 3 h 30). |  |
| `supabase-event-reminders-cron.sql` | 09/09 | Rappels d'événement 24 h / 1 h (cron toutes les 15 min). |  |
| `supabase-cleanup-expired-stories.sql` | 09/09 | Purge des statuts expirés (cron 3 h) : appelle l'edge function du même nom. | La fonction n'est pas déployée (404) : le cron échoue chaque nuit sans dommage. |
| `supabase-combined-supersede-order-regression-fix.sql` | 09/09 | Rétablit l'état final correct de 3 objets écrasés par l'ordre du COMBINED. | Exécuté le 10 sept ; aussi inclus en dernière section du COMBINED. |
| `supabase-story-reactions-emoji-check-fix.sql` | 04/11 | Remplace la contrainte `story_reactions_emoji_check` (émojis abîmés en production : toute réaction à un statut était refusée, erreur 23514). | SQL-26. **Exécuté en production le 04/11/2026** (avec accord explicite, lecture avant / après, essai d'insertion annulé). Défaut documenté : ne jamais coller d'émojis en clair dans un éditeur SQL. |

### Catégorie B — livrés, NON exécutés : à exécuter (35 fichiers)

Ordre et fiches : §5. Tous postérieurs à l'exécution du COMBINED, aucun mentionné comme exécuté dans `DEPLOIEMENT.md` (le bilan §4 le confirme ou l'infirme).

| Fichier | Modifié | Rôle | Remarque |
| --- | --- | --- | --- |
| `supabase-age-check-server-side.sql` | 25/08 | Contrainte « 18 ans minimum » imposée côté serveur sur profiles.birth_date. | SQL-1. Priorité haute. |
| `supabase-indexes-launch-fix.sql` | 06/10 | 12 index manquants sur les chemins chauds (démarrage de session, communautés, invitations). | SQL-4. |
| `supabase-content-select-block-filter-fix.sql` | 10/09 | Les profils bloqués ne peuvent plus LIRE le contenu l'un de l'autre (8 tables). | SQL-3. |
| `supabase-block-enforcement-messages-fix.sql` | 03/11 | Une personne BLOQUÉE ne peut plus écrire à celle qui l'a bloquée : fonction `is_blocked_pair()` (SECURITY DEFINER) + policies RESTRICTIVES sur messages, message_reactions et storage.objects (chat-media). | SQL-25. Additif, aucune policy existante touchée. **Défaut constaté sur la répétition** (la sous-requête sur `blocks` d'une policy ne voit que les blocages créés par l'appelant). Validé PGlite + répétition, Exécuté en production le 04/11/2026 (vérifié). |
| `supabase-block-enforcement-content-fix.sql` | 05/11 | SQL-36 : blocage effectif sur 6 tables (commentaires du fil, j'aime de publications, commentaires et j'aime de communauté, commentaires d'événement, invitations de communauté) via 6 policies restrictives `is_blocked_pair`. | SQL-36. Prérequis SQL-25. Répété sur staging (39/39), **EXÉCUTÉ en production le 05/11/2026**. |
| `supabase-premium-entitlements.sql` | 05/11 | SQL-37 : catalogue des avantages Premium, `has_premium_feature()` et `admin_premium_stats()` (statistiques d'abonnement, sans montants). | **EXÉCUTÉ en production le 10/11/2026.** Prérequis `supabase-premium.sql`, `supabase-admin.sql`. Rien ne s'en sert encore. |
| `supabase-premium-collections.sql` | 10/11 | SQL-38 : collections privées de publications (Premium), droit de création vérifié côté serveur, limites par trigger. | SQL-38. Prérequis SQL-37, `supabase-feed-posts.sql`. À répéter sur staging avant la production. |
| `supabase-premium-ai.sql` | 11/11 | SQL-39 : avantage `ai_writing_tools` au catalogue Premium + index de comptage global `ai_usage`. | SQL-39. Prérequis SQL-37, `supabase-intelligence.sql`. À exécuter AVANT le redéploiement d'`ai-assist`. |
| `supabase-premium-stats.sql` | 11/11 | SQL-40 : avantage `creator_stats` + `my_creator_stats()` (statistiques d'interactions du compte, sans suivi des visites). | SQL-40. Prérequis SQL-37, `supabase-feed-posts.sql`, `supabase-follows.sql`. À répéter sur staging avant la production. |
| `supabase-story-reactions-emoji-check-fix.sql` | 04/11 | SQL-26 : la contrainte `story_reactions_emoji_check` de la production refuse les émojis du client (réaction aux statuts : 400 / 23514) ; le script remplace la contrainte, sans rien supposer de son état actuel. | Livré par une autre session ; **statut d'exécution non vérifié par l'auteur de cette ligne** (à confirmer avec la session qui l'a écrit). Voir l'en-tête du fichier. |
| `supabase-message-delete-window.sql` | 04/11 | SQL-27 : « supprimer pour tout le monde » avec délai serveur (`app_config.message_delete_window_minutes`, 15 min) et contenu effacé ; redéfinit `enforce_message_update_rules`. | SQL-27. Pousser le client avant ; à jouer après relecture. |
| `supabase-comment-rate-limit-fix.sql` | 04/11 | SQL-30 : limite de débit des commentaires (publications, communautés, événements) : 20 / 5 min et 300 / 24 h par auteur. | **Défaut constaté sur la répétition** : 60 commentaires de suite acceptés (les publications, statuts et signalements étaient déjà limités). Additif. Validé PGlite + répétition. Exécuté en production le 04/11/2026 (vérifié). |
| `supabase-fk-indexes-fix.sql` | 04/11 | SQL-29 : 43 index sur des clés étrangères qui n'en avaient aucun (suppression de compte et jointures par auteur / communauté / événement). | Additif, idempotent (`create index if not exists`), aucune donnée touchée ; verrou d'écriture très bref par table : hors heures de pointe. Appliqué sur la répétition : 0 clé étrangère sans index ensuite. Exécuté en production le 04/11/2026 (vérifié). |
| `supabase-client-errors-rate-limit-v2-fix.sql` | 04/11 | SQL-34 : remplace le corps de `client_errors_guard()` (SQL-28) : dédoublonnage (même message + même 1re ligne de pile en 10 min), plafonds par compartiment (anonymes 20/min 500/jour ; connectés 120/min 5 000/jour), plafond de TAILLE 100 Mo. | Corrige les trois défauts de conception de SQL-28 relevés à la revue croisée (plafonds globaux : un anonyme aveuglait tout le monde ; le jour du lancement la table cessait d'enregistrer ; 3 000 lignes en ~10 jours). Additif (`create or replace`). Validé PGlite (17 tests) + répétition. **Exécuté en production le 04/11/2026 (vérifié).** |
| `supabase-client-errors-rate-limit-fix.sql` | 04/11 | SQL-28 : plafonne les écritures ANONYMES dans `client_errors` (30/min, 300/jour, 3 000 au total, lot refusé en entier) et force `profile_id` à celui de l'appelant. | **Défaut constaté sur la répétition** : une requête sans compte insérait 2 000 lignes de 8 Ko (16 Mo) — de quoi remplir les 500 Mo de l'offre gratuite et mettre toute la base en lecture seule. Additif. Validé PGlite + répétition, Exécuté en production le 04/11/2026 (vérifié). |
| `supabase-client-errors.sql` | 10/09 | Table client_errors (rapporteur d'erreurs du site) + purge à 30 jours. | SQL-5. Absent de DEPLOIEMENT.md jusqu'ici. |
| `supabase-admin-resolve-report-race-fix.sql` | 25/09 | Deux admins ne peuvent plus traiter le même signalement en double. | SQL-8. |
| `supabase-posts-update-account-state-guard-fix.sql` | 30/09 | Un compte banni ne peut plus réécrire ses anciennes publications. | SQL-6. |
| `supabase-community-comments-update-account-state-guard-fix.sql` | 30/09 | Idem pour les commentaires de communauté. | SQL-7. |
| `supabase-community-event-governance-banned-staff-fix.sql` | 02/10 | Un owner/organisateur banni ne peut plus gérer sa communauté / son événement. | SQL-10. Contient aussi les 3 correctifs ci-dessous marqués « couvert ». |
| `supabase-community-orphan-guard-fix.sql` | 18/09 | Le dernier owner/admin ne peut plus quitter sa communauté (policy DELETE). | COUVERT par la gouvernance (SQL-10). À sauter ; sinon l'exécuter AVANT SQL-10, jamais après. |
| `supabase-community-role-change-orphan-fix.sql` | 25/09 | Le dernier owner ne peut plus se rétrograder (policy UPDATE). | COUVERT par SQL-10. Même règle. |
| `supabase-community-invite-block-bypass-fix.sql` | 25/09 | Pas d'invitation de communauté entre deux profils bloqués. | COUVERT par SQL-10. Même règle. |
| `supabase-community-join-request-block-bypass-fix.sql` | 25/09 | Pas de notification de demande d'adhésion vers un membre du staff bloqué. | SQL-9. Non couvert par la gouvernance. |
| `supabase-community-orphan-account-deletion-fix.sql` | 02/10 | Transfert automatique de la propriété d'une communauté quand son owner supprime son compte. | SQL-11. |
| `supabase-event-orphan-account-deletion-fix.sql` | 02/10 | Idem pour les organisateurs d'événements. | SQL-12. |
| `supabase-accept-event-invitation-membership-check-fix.sql` | 30/09 | accept_event_invitation revérifie l'accès (ex-membre d'une communauté). | CONFLIT : à NE PAS exécuter tel quel. Utiliser le bloc fusionné SQL-14. |
| `supabase-waitlist-promotion-race-fix.sql` | 25/09 | La liste d'attente d'un événement ne promeut plus deux fois la même personne. | SQL-13. |
| `supabase-premium-media-kind-mismatch-fix.sql` | 30/09 | Le paywall messagerie bloque enfin les photos (kind 'image'). | SQL-15. Sans effet tant que monetization_enabled = false. |
| `supabase-device-tokens.sql` | 06/10 | Table des jetons push des applications Android/iOS + fonction d'enregistrement. | SQL-16. Pour les apps natives. |
| `supabase-push-notifications-triggers.sql` | 15/09 | 4 triggers qui appellent send-push (message, match, like, abonnement). | SQL-17. Probablement déjà en partie en prod (voir fiche). |
| `supabase-unaccent-search.sql` | 15/09 | Extension unaccent + index de recherche sans accents. | SQL-18. Optionnel : aucun effet visible sans changement de code. |
| `supabase-post-report-minor-category.sql` | 07/10 | Autorise le motif « mineur suspecté » sur les signalements de publications. | SQL-19. Optionnel. |
| `supabase-storage-account-quota.sql` | 04/09 | Plafond de stockage total par compte (trigger sur storage.objects). | SQL-20. DÉCISION requise (plafond 1 Go arbitraire) ; ne pas exécuter sans relecture. |
| `supabase-close-read-leaks.sql` | 20/10 | Ferme les fuites de lecture : `profile_photos` (RLS), `EXECUTE` retiré à anon sur les fonctions SECURITY DEFINER + search_path, colonnes sensibles de `profiles`, Realtime DELETE. | SQL-22. **Répéter d'abord** (§9.7) ; bloc par bloc ; ordre code → SQL. |
| `supabase-remove-community-member-cleanup-events-fix.sql` | 31/10 | Fonction `remove_community_member_and_cleanup_events()` : l'exclusion d'un membre par le staff décline aussi ses invitations et retire ses inscriptions aux événements « membres » à venir de la communauté (une transaction). | SQL-23. À jouer **AVANT** de déployer le client qui l'appelle. |
| `supabase-age-refresh-cron.sql` | 01/11 | Fonction `refresh_profile_ages()` + tâche quotidienne : recalcule `profiles.age` à partir de `birth_date` (l’âge affiché ne vieillissait jamais). | SQL-24. Additif. Déclaré exécuté le 01/11 (§2.1). |
| `supabase-moderation-text.sql` | 04/11 | Modération de texte gratuite : liste de termes et d'exceptions, `moderation_check()`, déclencheurs sur messages / publications / commentaires / statuts / biographies, sanctions progressives, appels, signalements d'images avec masquage après 3 signalements. | SQL-31. **EXÉCUTÉ en production le 05/11/2026** (accord explicite du propriétaire, sans sauvegarde ; contrôles en lecture seule après exécution : voir la section « Exécution en production » de MODERATION.md / ACTUALITES.md). Répétition d'abord. Fichier entièrement ASCII. Lire `MODERATION.md`. Interrupteur : `moderation_settings.text_filter_enabled`. |
| `supabase-post-reactions.sql` | 04/11 | Réactions multiples sur le fil général : colonne `emoji` sur `post_likes` (6 réactions, une par personne), policy UPDATE avec gardes d'état de compte et de blocage. Les likes existants deviennent des cœurs. | SQL-32. **EXÉCUTÉ en production le 05/11/2026** (accord explicite du propriétaire, sans sauvegarde ; contrôles en lecture seule après exécution : voir la section « Exécution en production » de MODERATION.md / ACTUALITES.md). Additif, entièrement ASCII, retour arrière en pied de fichier. Sans lui, le fil marche comme avant (cœur seul). Validé sur PGlite avec RLS (`src/native/postReactions.test.js`). |
| `supabase-post-threads-mentions.sql` | 04/11 | Fil général : réponses aux commentaires (`post_comments.parent_id`, un niveau), mentions `@` (`mentions` jsonb, 5 au plus), notifications `post_mention` et `comment_replied` (aucune entre personnes qui se sont bloquées), ajout des deux types à `notifications_type_check` SANS recopier sa liste. | SQL-33. **EXÉCUTÉ en production le 05/11/2026** (accord explicite du propriétaire, sans sauvegarde ; contrôles en lecture seule après exécution : voir la section « Exécution en production » de MODERATION.md / ACTUALITES.md). Additif, entièrement ASCII, retour arrière en pied de fichier. Sans lui, les commentaires restent à plat. Validé sur PGlite (`src/native/postThreads.test.js`). |
| `supabase-post-comment-likes.sql` | 05/11 | Fil général : « j'aime » sur les commentaires (`post_comment_likes`, un par personne, gardes de compte et de blocage) + notification `comment_liked` ajoutée à `notifications_type_check` SANS recopier sa liste. | SQL-35. **EXÉCUTÉ en production le 05/11/2026** (accord explicite du propriétaire, sans sauvegarde ; contrôles en lecture seule après exécution : voir la section « Exécution en production » de MODERATION.md / ACTUALITES.md). Additif, entièrement ASCII, retour arrière en pied de fichier. Sans lui, le bouton n'apparaît pas. Validé sur PGlite avec RLS (`src/native/postCommentLikes.test.js`). |

### Catégorie C — socle d'août (60 fichiers) : supposé en prod, À VÉRIFIER

Antérieurs au COMBINED et absents de celui-ci ; l'application tourne en bêta depuis août et leurs objets sont référencés par les fichiers en prod, mais **aucun document ne prouve leur exécution** : le bilan (§4) contient une ligne par fichier. **Ne rejoue aucun de ces fichiers** : beaucoup écraseraient des versions corrigées plus tard (colonne « Remarque » et §6).

| Fichier | Modifié | Rôle | Remarque |
| --- | --- | --- | --- |
| `supabase-account-deletion.sql` | 22/08 | Suppression de compte avec délai de 24 h : colonne + cron horaire. | Étape manuelle : secret Vault service_role_key. Rejouer remettrait le timeout à 5 s. |
| `supabase-account-deletion-timeout-fix.sql` | 25/08 | Cron de suppression : délai de réponse porté à 30 s. | Rejouer APRÈS account-deletion seulement. |
| `supabase-admin.sql` | 21/08 | Rôles plateforme, journal admin, suspension/bannissement, tableau de bord. | DANGEREUX à rejouer (écrase 12 fonctions corrigées). |
| `supabase-audit-fixes.sql` | 17/08 | Un message exige un match réciproque réel. | Rejouer écraserait la policy d'envoi de message. |
| `supabase-beta-access.sql` | 18/08 | Liste blanche de la bêta (Auth Hook « Before User Created »). | Si le hook est actif au lancement, les inscriptions publiques sont refusées. |
| `supabase-beta-feedback-admin.sql` | 01/09 | Suivi admin des retours (statut, priorité). | Ses fonctions sont remplacées par le COMBINED : ne pas rejouer. |
| `supabase-beta-feedback-category.sql` | 21/08 | Catégories de retour rapide. |  |
| `supabase-beta-tracking.sql` | 18/08 | Tables beta_events et beta_feedback. |  |
| `supabase-canada-gate.sql` | 25/08 | Colonne last_in_canada_at (restriction Rencontres au Canada). |  |
| `supabase-chat-media-storage.sql` | 17/08 | Dossier privé chat-media + règles d'accès. |  |
| `supabase-communities.sql` | 17/08 | Communautés : tables, rôles, RLS. | DANGEREUX à rejouer (écrase une vingtaine d'objets corrigés depuis). |
| `supabase-communities-2.sql` | 20/08 | Règles de communauté, refus d'invitation. | Rejouer écraserait create_community. |
| `supabase-communities-3.sql` | 20/08 | Médias, réactions et réponses dans les communautés. |  |
| `supabase-dating-2.sql` | 20/08 | Activation des Rencontres, unmatch, réorganisation des photos. |  |
| `supabase-delete-own-content.sql` | 22/08 | Suppression de ses propres communautés/événements ; admin peut tout supprimer. |  |
| `supabase-events.sql` | 16/08 | Premières tables d'événements. |  |
| `supabase-events-guards.sql` | 25/08 | Pas de participation à un événement passé/annulé. | Rejouer ÉCRASERAIT join_event et la policy d'invitations (régression de sécurité). |
| `supabase-events-timezone.sql` | 18/08 | Fuseau horaire des événements. | Rejouer écraserait create_event. |
| `supabase-events-v2.sql` | 17/08 | Événements v2 : visibilité, staff, invitations, signalements, photos, discussion, rappels. | DANGEREUX à rejouer (écrase ~20 objets corrigés). |
| `supabase-feed-posts.sql` | 18/08 | Fil général : posts, likes, commentaires, signalements. | Rejouer écraserait plusieurs policies corrigées. |
| `supabase-fix-name-not-null.sql` | 20/08 | profiles.name accepte NULL (inscription). |  |
| `supabase-follows.sql` | 17/08 | Système d'abonnements. |  |
| `supabase-founder-badge.sql` | 09/09 | Badge fondateur (is_founder) attribué au compte de Patrick. | Rejouer réinstalle un trigger plus faible (voir fiche). |
| `supabase-founder-birth-year-privacy.sql` | 18/08 | Réglage « afficher mon année de naissance » (fondateur). |  |
| `supabase-geolocation.sql` | 20/08 | Table user_locations + nearby_profiles. | Rejouer écraserait la version corrigée de nearby_profiles. |
| `supabase-geolocation-privacy-fix.sql` | 25/08 | « Afficher ma zone générale » devient effectif. | Version finale de nearby_profiles. |
| `supabase-immigration-news.sql` | 21/08 | Actualités IRCC/ASFC : tables + cron toutes les 6 h. | Dépend de l'edge function fetch-immigration-news. |
| `supabase-immigration-news-2.sql` | 22/08 | Favoris d'actualités. |  |
| `supabase-index-blocks-passes.sql` | 18/08 | Index blocks(to_id) et passes(to_id). |  |
| `supabase-info.sql` | 21/08 | Module Info Canada (articles, éditeurs, révisions, signalements). |  |
| `supabase-intelligence.sql` | 17/08 | Recommandations masquées, retours, journal d'usage IA. |  |
| `supabase-last-name.sql` | 21/08 | Colonne last_name. |  |
| `supabase-launch-growth.sql` | 17/08 | Objectif d'usage, journal d'activation. | NON IDEMPOTENT : décale onboarding_step de +1 à chaque exécution. |
| `supabase-like-rate-limit.sql` | 22/08 | Limite de débit des likes. | Rejouer écraserait la version avec limite globale. |
| `supabase-match-preferences-looking-for.sql` | 22/08 | Filtre « type de relation recherché ». |  |
| `supabase-matching.sql` | 16/08 | Préférences de recherche, table blocks, anti-auto-like. | Rejouer écraserait la policy de likes (gardes de compte). |
| `supabase-messages-media.sql` | 17/08 | Messages riches (image, vidéo, audio, fichier). |  |
| `supabase-messaging.sql` | 17/08 | Messagerie : lecture, table reports, catégories de signalement. |  |
| `supabase-messaging-2.sql` | 20/08 | Réactions, réponses, suppression de messages. |  |
| `supabase-messaging-read-receipts-privacy.sql` | 22/08 | Réglage des accusés de lecture. |  |
| `supabase-missing-columns.sql` | 16/08 | Colonnes is_online, last_seen, cover_url. |  |
| `supabase-notifications-persistence.sql` | 18/08 | Notifications like/message persistées + préférences. |  |
| `supabase-premium.sql` | 17/08 | Abonnements Premium (subscriptions, is_premium()). |  |
| `supabase-premium-badge.sql` | 18/08 | Badge Premium (is_premium) synchronisé depuis subscriptions ; abonnement offert au fondateur. |  |
| `supabase-premium-badge-protect.sql` | 09/09 | Interdit l'auto-attribution du badge Premium. | Rejouer réinstalle un trigger plus faible (voir fiche). |
| `supabase-premium-messaging.sql` | 22/08 | Limites de la messagerie gratuite (désactivées : monetization_enabled = false). | Rejouer écraserait admin_dashboard_stats. |
| `supabase-profile-onboarding.sql` | 16/08 | Colonnes d'onboarding, confidentialité par champ, table favorites. | Rejouer écraserait la policy de favoris. |
| `supabase-protect-rls.sql` | 16/08 | Messages/likes/passes plus lisibles par tous ; colonnes de vérification. |  |
| `supabase-public-user-count.sql` | 21/08 | Compteur public de membres (version d'origine). | Remplacée par public-user-count-accuracy-fix. |
| `supabase-push-notifications.sql` | 20/08 | Table push_subscriptions (Web Push). |  |
| `supabase-realtime-messages.sql` | 22/08 | Messages dans la publication Realtime (livraison instantanée). |  |
| `supabase-report-minor-category.sql` | 25/08 | Motif « mineur suspecté » sur les signalements de profil. | Rejouer écraserait admin_list_reports (régression). |
| `supabase-scale-security.sql` | 17/08 | Audit sécurité/performance : RLS profils, buckets, join_event. | DANGEREUX à rejouer. |
| `supabase-scale-security-2.sql` | 17/08 | Limites de débit messages/abonnements, index, contraintes. | Rejouer écraserait les versions à limite globale. |
| `supabase-schema.sql` | 15/08 | Socle initial : tables profiles, likes, passes, messages. | Contient les règles d'origine « lecture publique ». Ne jamais le rejouer. |
| `supabase-stories.sql` | 16/08 | Table des statuts (stories). |  |
| `supabase-stories-2.sql` | 22/08 | Vues, réactions et couleur de fond des statuts. | Rejouer écraserait des gardes (voir fiche). |
| `supabase-stories-expiration.sql` | 18/08 | Expiration réelle des statuts à 24 h. |  |
| `supabase-stories-media.sql` | 16/08 | Photo/vidéo dans les statuts. |  |
| `supabase-unlike.sql` | 18/08 | Retirer un like avant match. |  |

### Catégorie D — obsolètes ou outils manuels (6 fichiers) : ne pas exécuter

| Fichier | Modifié | Rôle | Remarque |
| --- | --- | --- | --- |
| `supabase-banned-target-action-fix.sql` | 09/09 | Première version des gardes « compte banni » (likes, abonnements, favoris, messages, invitations). | OBSOLÈTE : remplacé par target-account-state-guards-CONSOLIDATED-fix. Ne pas exécuter. |
| `supabase-deletion-pending-target-action-fix.sql` | 09/09 | Première version des gardes « suppression en attente ». | OBSOLÈTE (même remplaçant). Ne pas exécuter. |
| `supabase-onboarding-incomplete-target-action-fix.sql` | 09/09 | Première version des gardes « onboarding incomplet ». | OBSOLÈTE (même remplaçant). Ne pas exécuter. |
| `supabase-cleanup-test-data.sql` | 21/08 | Outil manuel pour supprimer des comptes de test. | DESTRUCTIF : n'exécuter qu'en connaissance de cause, jamais en production réelle. |
| `supabase-beta-dashboard.sql` | 21/08 | Requêtes de statistiques de la bêta (lecture seule). | Outil de consultation, pas une migration. |
| `supabase-moderation-text-rollback.sql` | 04/11 | Retour arrière de SQL-31 (coupure douce, retrait des déclencheurs, suppression complète commentée). | Outil manuel, ne pas exécuter sans avoir lu `MODERATION.md` §4. |

Total : 47 + 28 + 60 + 6 = 141 fichiers.

---

## 8. Edge functions

Une *edge function* se déploie avec la CLI depuis la racine du dépôt. Commande générale (le *project-ref* —
l'identifiant du projet Supabase — est `vozehymbihnckzklxesw`, relevé dans les URL du code et dans
`supabase link`) :

```bash
npx supabase functions deploy <nom> --project-ref vozehymbihnckzklxesw [--no-verify-jwt]
```

`--no-verify-jwt` = la porte d'entrée de Supabase ne vérifie plus le jeton de connexion ; **chaque fonction listée
ci-dessous vérifie elle-même son appelant** (secret partagé ou clé de service), ce qui est voulu pour les appels
automatiques (cron, triggers, Stripe).

### 8.1 État de chacune (preuve : `npx supabase functions list` + sondes HTTP du 8 oct.)

| Fonction | En ligne ? | Dernier déploiement | JWT | Code du dépôt plus récent ? | Sonde sans jeton | Action |
| --- | --- | --- | --- | --- | --- | --- |
| `process-scheduled-deletions` | oui (v5) | 22 août 03:57 (heure locale) | exigé | **OUI** : 4 commits (25 août, 1er sept, 4 sept, 7 oct) + `_shared` | 401 (porte d'entrée) | **Redéployer** (priorité) |
| `cleanup-expired-stories` | **NON (404)** | jamais | — | — | 404 | **Déployer** |
| `send-push` | oui (v6) | 22 août 03:43 | **non exigé** | **OUI** : 15 sept (like/abonnement), 6 oct (jetons natifs FCM/APNs) + `_shared` | 401 « unauthorized » (texte brut) | Redéployer **avec** `--no-verify-jwt` (avant SQL-17 / apps natives) |
| `stripe-webhook` | **NON (404)** | jamais | — | — | 404 | Déployer avec `--no-verify-jwt` + secrets (voir ci-dessous, §12) |
| `create-checkout-session` | oui (v2) | 22 août 03:59 | exigé | **OUI** : 1er sept (double abonnement après paiement refusé) | 401 | Redéployer + secrets Stripe (§12) |
| `create-portal-session` | oui (v2) | 22 août 03:59 | exigé | non | 401 | Secrets Stripe seulement (§12) |
| `ai-assist` | oui (v2) | 22 août 14:43 | exigé | non | 401 | **Inopérante** : `ANTHROPIC_API_KEY` absente (§12) |
| `fetch-immigration-news` | oui (v2) | 20 août 23:07 | exigé | non (le commit du 21 août ne fait que versionner) | 401 | Rien ; vérifier le journal (§13) |
| `delete-account` | oui (v4) | 17 août 15:16 | exigé | **absente du dépôt** | 401 | Examiner puis supprimer (§8.3) |

### 8.2 Détail et commandes

- [ ] **`process-scheduled-deletions`** (suppression de compte différée de 24 h, appelée toutes les heures par le cron)
  - Pourquoi : la version en ligne efface des fichiers encore utilisés par d'autres personnes et supprime dans le
    mauvais ordre ; le nouveau code corrige cela, efface aussi les médias de communautés et pagine le listage.
  - Secrets : aucun nouveau. Utilise `SUPABASE_SERVICE_ROLE_KEY` (déjà présent) et `STRIPE_SECRET_KEY` (**absent** :
    l'annulation d'abonnement Stripe est alors simplement ignorée, ce qui est acceptable tant que Stripe n'est pas actif).
  - Commande : `npx supabase functions deploy process-scheduled-deletions --project-ref vozehymbihnckzklxesw --no-verify-jwt`
    (aujourd'hui en ligne avec « JWT exigé » ; le cron envoie la clé de service dans l'en-tête `Authorization` et la fonction la compare elle-même
    à la clé attendue. Avec `--no-verify-jwt`, seule cette comparaison décide : plus robuste si la clé stockée dans le coffre n'a pas le format d'un jeton JWT.)
  - Vérification : `npx supabase functions list --project-ref vozehymbihnckzklxesw` (date de mise à jour = maintenant) ;
    à l'heure pile suivante : `select id, status_code, timed_out, error_msg, created from net._http_response order by created desc limit 5;`
    → `status_code = 200`, `timed_out = false`. Sinon, voir `supabase-account-deletion-timeout-fix.sql` (cron à 30 s).
  - Annuler : `git checkout b4c3b41 -- supabase/functions/process-scheduled-deletions` puis redéployer (version du 22 août).
- [ ] **`cleanup-expired-stories`** (purge des statuts expirés depuis 7 jours, ligne + fichiers ; cron `0 3 * * *`)
  - Secrets : aucun nouveau. Commande : `npx supabase functions deploy cleanup-expired-stories --project-ref vozehymbihnckzklxesw --no-verify-jwt`
  - Vérification : la sonde `curl -s -o /dev/null -w "%{http_code}" -X POST https://vozehymbihnckzklxesw.supabase.co/functions/v1/cleanup-expired-stories` passe de **404** à **401** ; le lendemain 3 h, `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;`.
  - Avant son déploiement, le cron de 3 h échoue chaque nuit sans dommage ; les statuts expirés ne sont simplement pas purgés.
- [ ] **`send-push`** (notifications push ; secret partagé `x-webhook-secret` = `PUSH_WEBHOOK_SECRET`)
  - Secrets présents : `PUSH_WEBHOOK_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
    Facultatifs pour les apps natives (absents) : `FCM_SERVICE_ACCOUNT_JSON` (Android), `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID`
    (iOS), et `APNS_BUNDLE_ID` (défaut `ca.baobab.app`), `APNS_USE_SANDBOX=true` (builds de développement).
    Une plateforme dont les secrets manquent est ignorée ; le Web Push continue.
  - Commande : `npx supabase functions deploy send-push --project-ref vozehymbihnckzklxesw --no-verify-jwt`
  - Vérification : la sonde `curl -s -X POST https://vozehymbihnckzklxesw.supabase.co/functions/v1/send-push -w "\n%{http_code}\n"`
    doit répondre `unauthorized` + `401`. Si elle répond du JSON `UNAUTHORIZED_NO_AUTH_HEADER`, le drapeau a été oublié :
    redéployer avec `--no-verify-jwt`.
  - Annuler : `git checkout 1a3b3ca -- supabase/functions/send-push` puis redéployer avec `--no-verify-jwt` (version du 22 août).
- [ ] **`stripe-webhook`** (reçoit les événements Stripe ; seul écrivain de `subscriptions`) — **à faire seulement si le Premium web doit exister** (décision 13)
  - Secrets requis : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. `SITE_URL` n'est **pas** lu par ce webhook, mais par
    `create-checkout-session` et `create-portal-session` (URL de retour après paiement). Ne pose pas `SUPABASE_SERVICE_ROLE_KEY` (déjà là).
  - Commandes (**tu** tapes les valeurs ; ne les colle jamais dans une conversation) :
    ```bash
    npx supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=... --project-ref vozehymbihnckzklxesw
    npx supabase functions deploy stripe-webhook --project-ref vozehymbihnckzklxesw --no-verify-jwt
    ```
  - Tableau de bord Stripe > Developers > Webhooks : endpoint `https://vozehymbihnckzklxesw.supabase.co/functions/v1/stripe-webhook`,
    événements **traités par le code** : `checkout.session.completed`, `customer.subscription.created`,
    `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Le « Signing secret » (`whsec_...`)
    va dans `STRIPE_WEBHOOK_SECRET`. Commence en **mode test** (clés `sk_test_`, webhook de test).
  - Vérification : la sonde sans signature répond **400 « Signature manquante. »** (secrets présents) ; **500 « Configuration
    serveur incomplète. »** = un secret manque ; 404 = non déployée.
- [ ] **`create-checkout-session` / `create-portal-session`** (Premium web)
  - Secrets : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `SITE_URL` (l'origine publique du site, ex. `https://<domaine>`),
    facultatif `STRIPE_TRIAL_DAYS`. Sans eux : « Abonnement Premium temporairement indisponible. » (comportement actuel, prouvé le 30 sept).
  - Redéployer `create-checkout-session` (code du 1er sept) : `npx supabase functions deploy create-checkout-session --project-ref vozehymbihnckzklxesw`
- [ ] **`ai-assist`** (suggestions d'écriture et traduction ; modèle par défaut `claude-3-5-haiku-latest`, 20 appels/heure/personne)
  - Secret requis : `ANTHROPIC_API_KEY` (**absent**). Facultatifs : `ANTHROPIC_MODEL`, `AI_RATE_LIMIT_PER_HOUR` (20), `AI_FREE_PER_DAY` (10), `AI_PREMIUM_PER_DAY` (100), `AI_MONTHLY_GLOBAL_CAP` (20 000 appels/mois sur toute la plateforme, coupe-circuit de coût ; voir SQL-39).
    **[À VÉRIFIER]** : le modèle par défaut est-il toujours proposé par Anthropic ? Sinon, pose `ANTHROPIC_MODEL` avec le nom
    d'un modèle actuel (voir la documentation d'Anthropic).
  - Commande : `npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref vozehymbihnckzklxesw` (pas de redéploiement nécessaire :
    les secrets sont lus à chaque démarrage ; au besoin, redéployer sans drapeau).
  - Vérification : dans l'app, « Améliorer mon texte » ; journal : Supabase > Edge Functions > ai-assist > Logs.
- [ ] **`fetch-immigration-news`** (actualités IRCC/ASFC, cron toutes les 6 h) : rien à déployer. Vérifier :
  `select * from immigration_news_fetch_log order by fetched_at desc limit 5;` et `select count(*) from immigration_news;`.

### 8.3 La fonction fantôme `delete-account`

En ligne depuis le 17 août, absente du dépôt, jamais appelée par le site (`grep` sur `src/` : aucune occurrence).
J'ai téléchargé son code (`supabase functions download`, lecture seule) : un utilisateur **connecté** qui l'appelle voit
son compte **supprimé immédiatement** (profil puis compte d'authentification), sans le délai de 24 h, sans
nettoyage des fichiers (le code l'avoue en commentaire), sans les transferts de propriété des SQL-11/12. Ce n'est pas
une faille contre autrui (elle n'agit que sur l'appelant) mais un chemin de suppression non maîtrisé.

- [ ] Décision : la supprimer (recommandé) — `npx supabase functions delete delete-account --project-ref vozehymbihnckzklxesw`.
      (La suppression d'une fonction est irréversible, mais son code n'est de toute façon plus maintenu.)

### 8.4 Tâches planifiées attendues (`pg_cron` + `pg_net`)

| Cron (nom) | Horaire | Défini par | Appelle | Statut |
| --- | --- | --- | --- | --- |
| `baobab-process-scheduled-deletions` | toutes les heures | `account-deletion` (+ `account-deletion-timeout-fix`) | edge function du même nom | [À VÉRIFIER] |
| `baobab-fetch-immigration-news` | toutes les 6 h | `immigration-news` | edge function du même nom | [À VÉRIFIER] |
| `baobab-cleanup-expired-stories` | 3 h 00 | COMBINED | edge function (404 aujourd'hui) | planifié [PROUVÉ via COMBINED], échoue jusqu'au déploiement |
| `baobab-cleanup-old-notifications` | 3 h 30 | COMBINED | SQL pur (purge > 90 jours) | [PROUVÉ via COMBINED] |
| `baobab-send-event-reminders` | toutes les 15 min | COMBINED | SQL pur | [PROUVÉ via COMBINED] |
| `baobab-cleanup-old-client-errors` | 3 h 45 | `client-errors` (SQL-5) | SQL pur | à venir |

Les trois crons qui appellent une fonction lisent le secret du coffre `service_role_key` ; les triggers push lisent `push_webhook_secret`.
Les crons qui appellent une fonction n'ont pas de délai de réponse réglé (5 s par défaut de `pg_net`) sauf celui des suppressions (30 s).

---

## 9. Réglages manuels hors code

Ces réglages vivent dans les tableaux de bord : la CLI ne peut pas les lire. **Statut de tous : [À VÉRIFIER]** à la main.

### 9.1 Supabase > Authentication
- [ ] **Hooks > « Before User Created »** : doit être **désactivé** pour une ouverture publique (c'est lui qui applique la
      liste blanche `beta_testers` de `supabase-beta-access.sql` et répond « Baobab est en beta privée sur invitation »).
      Test sans tableau de bord : tenter une inscription avec une adresse **non** listée. Indice SQL (le hook a-t-il
      déjà servi ?) : `select count(*) as invites, count(used_at) as utilises from beta_testers;`
- [ ] **E-mails (SMTP)** : d'après la documentation de Supabase, le service d'e-mail intégré est prévu pour des tests (très
      limité en volume et en destinataires) et ne convient pas à un lancement public. Configure un SMTP personnalisé
      (Authentication > Emails / SMTP Settings) avec un expéditeur de ton domaine. **[À VÉRIFIER]** dans le tableau de bord ; test = inscription avec une adresse extérieure à ton équipe.
- [ ] **Site URL** : l'origine publique finale (aujourd'hui `https://baobab-app-zeta.vercel.app`). Le renvoi d'e-mail de confirmation
      retombe dessus si l'URL de redirection est absente (commentaire de `src/Auth.jsx`).
- [ ] **Redirect URLs** : ajouter, pour chaque origine publique utilisée (domaine final **et** `vercel.app` tant qu'il sert) :
      `<origine>/?verified=1` et `<origine>/update-password` (ce sont exactement les deux adresses construites par `src/Auth.jsx`).
      Les apps natives réutilisent le domaine public (`linkOrigin()`), donc rien d'autre à ajouter pour elles.
- [ ] **Confirm email** (Authentication > Providers > Email) : activé (le code attend le flux de confirmation et le marqueur `?verified=1`).
- [ ] **Modèles d'e-mails** (Authentication > Email Templates) : « Confirm signup » et « Reset password » en français, conservant la variable du lien de confirmation fournie par Supabase.
- [ ] **CAPTCHA (Authentication > Attack Protection)** : **NE PAS l'activer** tant que le site ne transmet pas de jeton CAPTCHA : `grep` du code
      (`captcha`, `turnstile`, `hcaptcha`) = aucune occurrence ; l'activer côté Supabase casserait l'inscription et la connexion.
- [ ] **Limites de débit (Authentication > Rate Limits)** : relis les valeurs affichées (inscriptions et e-mails par heure) ; elles plafonnent l'afflux le jour J.
- [ ] **Protection contre les mots de passe divulgués** (« Leaked password protection ») : activée si ton offre la propose (selon l'offre) ; le site impose déjà 8 caractères minimum (`minLength={8}`).
- [ ] **Durée de session/JWT** : laisser la valeur par défaut (le code compte sur le rafraîchissement automatique).

### 9.2 Supabase > Settings > API
- [ ] **Max rows : laisser à 1000, ne jamais descendre en dessous de 1000.** Le code pagine par pages de 1000 lignes
      (`PAGE_SIZE = 1000` dans `src/lib/inChunks.js`) et s'arrête quand une page renvoie moins de 1000 lignes. Avec un plafond de 500,
      la première page ferait 500 lignes et la lecture s'arrêterait là, **sans erreur** (listes de blocages tronquées, export de données incomplet).
      (Le seuil « ≥ 500 » évoqué dans certains audits est insuffisant ; la bonne règle est **≥ 1000**.)
- [ ] Vérifier que le schéma exposé est `public` et que l'API Data est activée (valeurs par défaut).

### 9.3 Supabase > Database / Storage / Realtime
- [ ] **Extensions** `pg_cron`, `pg_net`, `vault` : déjà utilisées (le bilan et les crons le prouvent). Rien à faire sauf erreur.
- [ ] **Storage** : limite globale de taille de fichier ≥ **50 Mo** (les dossiers `avatars`, `post-media`, `chat-media`, `community-media` acceptent 50 Mo
      par fichier ; `event-media` 20 Mo ; `event-covers` 8 Mo). Surveille l'espace utilisé (Storage > Usage) : un quota gratuit se remplit vite avec des vidéos.
      Requête : `select bucket_id, count(*) as fichiers, pg_size_pretty(sum((metadata->>'size')::bigint)) as taille from storage.objects group by 1 order by sum((metadata->>'size')::bigint) desc;`
- [ ] **Realtime** : vérifier le plafond de connexions simultanées de ton offre (chaque visiteur ouvre ~8 canaux sur une connexion). Le jour J : Reports > Realtime.
- [ ] **CORS** : rien à régler. Les edge functions répondent `Access-Control-Allow-Origin: *` (`supabase/functions/_shared/cors.ts`) ; l'API Supabase est ouverte par conception (la sécurité repose sur la RLS).

### 9.4 Supabase > Database > Backups (région, sauvegardes, PITR)
- [ ] **Procédure gratuite de sauvegarde et de restauration : `SAUVEGARDE.md`** (4 nov. 2026) — données critiques, commandes `pg_dump` chiffrées depuis ton ordinateur, copie des fichiers du Storage, restauration sur un projet de répétition, vérification d'intégrité (`scripts/backup-verify.sql`). **Non exécutée à ce jour** : le critère O1 reste non rempli tant qu'une sauvegarde n'a pas été faite et une restauration essayée une fois.
- [ ] Noter la **région** du projet, la fréquence et la **durée de conservation** des sauvegardes de ton offre, et si le *PITR* (retour à n'importe quel
      instant) est disponible/activé. Prends une sauvegarde/un point de contrôle **juste avant** SQL-1 à SQL-15. Cette durée alimente la décision 11.
- [ ] **Constat du 1er novembre 2026 (à traiter en priorité).** La commande `supabase backups list` renvoie `pitr_enabled=false` et aucune sauvegarde : le projet
      n'a, à ce jour, **aucun point de retour restaurable**. Les instantanés de définitions (fonctions, politiques, contraintes) pris hors dépôt servent au retour
      arrière des fichiers SQL, mais **ne restaurent pas les données**. Décision du propriétaire, avant tout SQL de production :
      (a) **activer le PITR** ou une offre avec sauvegardes quotidiennes (c'est un réglage payant du tableau de bord : je ne le change pas) ;
      (b) à défaut, **exporter les données** (dump complet de la base, `supabase db dump --data-only`, plus les fichiers du Storage) et les garder hors dépôt ;
      (c) ou, sachant qu'il n'y a aujourd'hui que quelques comptes de test (5 profils au 1er nov.), accepter le risque par écrit et réduire l'exposition en jouant
      les SQL un par un avec les « Annuler » de §5. Tant que ce choix n'est pas fait, le critère O1 du plan reste **NON rempli**.

### 9.5 Vercel et le dépôt (site web)
- [ ] **Variables d'environnement de production** (Vercel > Project > Settings > Environment Variables) : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
      `VITE_VAPID_PUBLIC_KEY` — **présentes [PROUVÉ, `vercel env ls` du 8 oct.]**. Autre variable lue par le code : `VITE_PUBLIC_WEB_ORIGIN` (facultative,
      surcharge l'origine publique ; absente). Aucune autre variable `VITE_*` n'existe dans `src/`, `index.html` ou `vite.config.js`.
- [ ] **Domaine personnalisé** : `baobab-app.ca` et `www.baobab-app.ca` sont rattachés au projet Vercel mais **le DNS ne résout pas** (Vercel :
      « This domain is not configured properly »). Le domaine est géré chez Cloudflare (serveurs de noms `ainsley`/`craig.ns.cloudflare.com`). Ouvre
      Vercel > Project > Settings > Domains : l'écran indique les enregistrements DNS exacts à créer chez Cloudflare. Attends que Vercel affiche « Valid Configuration ».
- [ ] **Si le domaine devient l'adresse officielle**, changer ensemble (puis un seul push) : `src/config/publicOrigin.json` ; les URL absolues
      de `index.html` (`canonical`, `og:url`, `og:image`), `public/robots.txt`, `public/sitemap.xml` ; Supabase Site URL + Redirect URLs (§9.1) ;
      `SITE_URL` (Stripe, §8.2) ; `public/.well-known/*` (apps natives). **Aucun test ne vérifie `index.html`, `robots.txt` ni `sitemap.xml`** : après le
      changement, cherche `baobab-app-zeta` dans le dépôt (hors fichiers de test) pour ne rien oublier. La CSP de `vercel.json`
      n'a pas à changer (elle ne mentionne que `*.supabase.co`).
- [ ] **`src/config/contact.json`** : actuellement `{ "supportEmail": "", "operatorName": "" }` **[PROUVÉ]**. Tant que c'est vide, les pages
      Confidentialité/Conditions/Suppression n'affichent aucune adresse. Renseigner une adresse **dédiée** (pas ton adresse personnelle publique)
      et le nom de l'exploitant, puis pousser. Exigé pour les boutiques (Apple 1.2/1.5) et utile pour l'exercice des droits (LPRPDE/RGPD).
- [ ] **`public/.well-known/assetlinks.json`** (Android) : contient `REMPLACER_PAR_LEMPREINTE_SHA256…` ; **`apple-app-site-association`** (iOS) :
      `REMPLACER_PAR_LE_TEAM_ID_APPLE`. Sans effet pour le site web ; à remplir avant les apps (§12). Les tests acceptent la marque ou la vraie valeur.
- [ ] **`public/app-version.json`** : `latestVersion 1.1.0`, `minimumVersion 1.0.0`, `updateRequired false` (24 sept). Le site vérifie ce fichier toutes
      les 30 min ; ne mets `updateRequired: true` qu'en cas de bug grave ; republie à chaque version notable.
- [ ] **Redéploiement** : un `git push origin main` suffit (Vercel construit et publie). Vérifier : Vercel > Deployments (statut *Ready*) puis ouvrir le site.

### 9.6 GitHub (apps natives uniquement)
Secrets du dépôt (Settings > Secrets and variables > Actions), lus par `.github/workflows/android-build.yml` et `ios-build.yml` (lancés **à la main** ou par un tag `v*`, jamais à chaque push) :
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`,
`APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_KEY_P8`, `APPLE_TEAM_ID`. Détail : `MOBILE.md` (guide de publication B et C).

### 9.7 Créer un projet Supabase de répétition (staging) — il n'en existait aucun

Objectif : jouer les SQL (SQL-1 à SQL-22), tester la sécurité à deux comptes et prévisualiser le site **sans jamais toucher à la production**. Le plan gratuit suffit.

- [ ] **1. Créer le projet.** supabase.com > New project > nom « baobab-repetition », même région que la production, mot de passe de base de données **différent** (garde-le dans ton gestionnaire de mots de passe). Note l'URL et la clé « publishable/anon » (Project Settings > API) : ce sont les seules valeurs dont le site a besoin. **Ne copie jamais la clé `service_role` dans un fichier du dépôt.**
- [ ] **2. Reproduire la structure de la production.**
      **Voie recommandée : copier le schéma (sans les données) de la production.** C'est la seule qui reproduit l'état *réel*, y compris `profile_photos` (créée à la main) et les politiques inconnues du dépôt. L'export est une **lecture** de la production (aucune écriture) :
      `npx supabase db dump --db-url "<URL de connexion de la production>" --schema public -f schema-prod.sql` (demande Docker Desktop ; sinon `pg_dump --schema-only --schema=public` avec les outils client PostgreSQL). L'URL de connexion se trouve dans Project Settings > Database (« Connection string »), avec le mot de passe de la **production** : ne la colle nulle part ailleurs que dans ton terminal, et ne commite pas `schema-prod.sql`.
      Puis, dans le projet de répétition : SQL Editor, coller le contenu de `schema-prod.sql` (ou `psql "<URL de la répétition>" -f schema-prod.sql`). Ajouter ensuite à la main ce que l'export `public` ne contient pas : les buckets Storage (Storage > New bucket : `avatars`, `post-media`, `chat-media`, `community-media`, `event-media`, `event-covers`) et leurs politiques (`supabase-scale-security.sql` §7, `supabase-storage-anon-listing-fix.sql`, `supabase-chat-media-storage.sql`, `supabase-communities-3.sql`, `supabase-events-v2.sql` §18), les extensions (`pg_cron`, `pg_net`, `vault` : Database > Extensions) et la publication Realtime (`supabase-realtime-messages.sql`, `supabase-follows-favorites-blocks-passes-realtime-fix.sql`).
      **Voie de secours : rejouer les fichiers dans l'ordre où la production les a reçus** (non rejoué par l'assistant : c'est l'ordre de l'histoire, à confirmer par le bilan §4) : (a) les fichiers de la catégorie C (§7) par date de création dans git — `git log --diff-filter=A --format="%aI %s" --name-only -- "supabase-*.sql"` donne cet ordre ; `supabase-schema.sql` d'abord, jamais `supabase-cleanup-test-data.sql` ; (b) `supabase-COMBINED-pending-fixes.sql` ; (c) `supabase-combined-supersede-order-regression-fix.sql` ; (d) les fiches SQL-1 à SQL-15 dans l'ordre du §5. Aucun fichier ne crée `profile_photos` : le bloc 1 de SQL-22 la crée au besoin, mais les politiques que tu veux tester ne seront alors pas celles de la production. **Lance le bilan (§4) sur la répétition** : il doit donner le même résultat que sur la production avant SQL-1.
- [ ] **3. Réglages d'authentification de la répétition** (Authentication) : **désactiver « Confirm email »** (pas de SMTP à configurer) ; **ne pas** activer le hook « Before User Created » ; Site URL = `http://localhost:5173` ; Redirect URLs = `http://localhost:5173/?verified=1` et `http://localhost:5173/update-password`, plus l'adresse de la préversion Vercel si tu en utilises une.
- [ ] **4. Lancer le site contre la répétition, en local.** À la racine du dépôt, créer `.env.local` (ignoré par git : `.gitignore` exclut `.env*`) avec **trois lignes** :
      `VITE_SUPABASE_URL=https://<ref-repetition>.supabase.co`, `VITE_SUPABASE_ANON_KEY=<clé anon de la répétition>`, `VITE_VAPID_PUBLIC_KEY=` (vide : le push web n'est pas testé). Puis `npm run dev` et ouvrir `http://localhost:5173`. **Vérification de sécurité** : dans le navigateur, l'onglet Network doit montrer des requêtes vers `<ref-repetition>.supabase.co`, **jamais** vers `vozehymbihnckzklxesw.supabase.co`. Supprime `.env.local` (ou renomme-le) quand tu as fini.
- [ ] **5. Préversion Vercel contre la répétition (facultatif).** Vercel > Project > Settings > Environment Variables : ajouter les mêmes `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en cochant **uniquement « Preview »** (décoche Production et Development), idéalement limitées à une branche `repetition` (« Git Branch »). Pousser cette branche donne une adresse de préversion qui parle à la répétition ; `main` et la production restent sur la vraie base. Ne jamais cocher « Production » pour ces valeurs.
- [ ] **6. Créer deux comptes de test (A et B).** Authentication > Users > Add user > Create new user, cocher « Auto Confirm User », deux adresses factices à toi (ex. `a@exemple.invalid`, `b@exemple.invalid`) et deux mots de passe **de test** que tu choisis (jamais ceux d'un vrai service). Ouvrir le site (local ou préversion) : A dans une fenêtre, B dans une fenêtre de navigation privée ; terminer l'onboarding de chacun avec une photo. Ces comptes permettent les tests du plan : S2 (A ne lit pas `birth_date` de B), blocage de A par B (les galeries se masquent), test Realtime de SQL-22.
- [ ] **7. Rejouer dans l'ordre** : bilan → SQL-1 à SQL-15 → SQL-22 bloc par bloc (pré-contrôle, correctif, contrôle). Noter chaque résultat. Corriger les écarts **avant** d'approcher la production.
- Ce que la répétition ne prouve pas : la charge, les e-mails réels (SMTP désactivé), les edge functions (non déployées), les vraies données.

---

## 10. Décisions du propriétaire

Chaque décision : le contexte, ma recommandation (une recommandation, pas une décision prise) et la conséquence. Les numéros 1 à 12 suivent ta liste ;
13 à 22 sont des décisions que l'analyse a fait apparaître.

1. **Premium dans les apps natives** *(MOBILE.md « Risques » n° 1, STORES.md §6)*. L'interface d'achat Stripe est visible dans l'app native ; Apple (3.1.1/3.1.3(b)) et Google la rejetteront.
   **Reco : option C** — aucun Premium, aucun prix, aucun lien d'achat dans l'app native au lancement (≈ 1 jour de code, à faire AVANT toute soumission). **Conséquence** : pas de revenu natif ; le web garde Stripe ; achats intégrés (option B, 8 à 12 jours) seulement quand il y aura des abonnés.
2. **Filtre de contenu à la publication** *(Apple 1.2, STORES.md §2.3)*. Aujourd'hui : signalement + blocage + modération réactive, aucun filtre à la publication.
   **Reco** : ne pas bloquer le lancement web ; avant la soumission iOS, ajouter au minimum une liste de mots interdits évidents côté serveur/client et publier un délai de traitement des signalements. **Conséquence** : risque de rejet Apple sans cela ; un filtre trop strict frustre les utilisateurs.
3. **Compteur « N membres déjà sur Baobab » de la landing** *(DEPLOIEMENT.md §9 n° 5)*. Affiche « 4 membres » : mauvaise preuve sociale.
   **Reco** : n'afficher le compteur qu'à partir d'un seuil (ex. 50) ou le retirer au lancement (petit changement de code). **Conséquence** : sans seuil, un chiffre minuscule décourage.
4. **Communautés `invite_only`/privées visibles par tout compte connecté** *(prouvé : `supabase-community-select-anon-fix.sql` limite à « connecté », pas à « membre »)*.
   Nom, description, ville, catégorie **et la liste nominative des membres** de n'importe quelle communauté sont lisibles par tout compte connecté.
   **Reco** : décider avant l'ouverture ; si des communautés sensibles (groupes vulnérables) sont attendues, restreindre la liste des membres et la fiche des communautés privées aux membres (SQL **à écrire**, aucun fichier ne le fait). **Conséquence** : sinon n'importe qui, avec un compte gratuit, peut lister qui appartient à quoi.
5. **Cartes d'événements de communauté partagées en conversation** *(DEPLOIEMENT.md §8, 3 options)*. Titre, date et ville restent lisibles par un non-membre (la couverture a été retirée).
   **Reco : (b)** retirer l'option « Dans une conversation » aussi pour `community` (comme pour `private`), garder « Inviter ». **Conséquence** : un petit changement de code ; on perd un raccourci d'invitation. (a) accepter ; (c) exigerait une vérification serveur.
6. **Notification « like » : nommer la personne, ou garder les admirateurs floutés** *(MOBILE.md étape 3a, risque 6)*. Le push « like » nomme la personne ; la liste « Qui m'a aimé » est floutée pour les comptes gratuits (`premium-admirers-reveal-fix`).
   **Reco** : au lancement (Premium inactif), l'impact est faible, mais **ne jamais activer le Premium** sans avoir corrigé cela ; en attendant, tu peux supprimer le trigger like (voir SQL-17) ou faire une session de code pour un texte générique. **Conséquence** : sinon un compte gratuit découvre qui l'a aimé et contourne le Premium.
7. **Signalements supprimés avec le compte (cascade)** *(STORES.md §3.3)*. Supprimer un compte efface les signalements envoyés **et reçus** : un harceleur efface les preuves en supprimant son compte.
   **Reco** : conserver (en anonymisant l'auteur) au moins les signalements graves (mineur suspecté, arnaque, harcèlement) pendant une durée à fixer avec un juriste ; demande un SQL (clé étrangère « set null ») en session de développement. **Conséquence** : sans cela, perte de preuves ; avec cela, il faut le décrire dans la politique de confidentialité.
8. **iPad : oui ou non** *(MOBILE.md étape 5)*. Le projet iOS vise iPhone **et** iPad par défaut (captures iPad 13" obligatoires, tests en 4 orientations).
   **Reco** : iPhone seulement pour la première version (réduit les tests et les captures). **Conséquence** : petit changement de configuration iOS ; l'app tourne quand même en mode compatible sur iPad.
9. **Thème « Système » par défaut en natif** *(MOBILE.md étape 2, point 5)*. Le web est clair par défaut ; en natif, le premier lancement suit le thème du téléphone.
   **Reco** : garder tel quel. **Conséquence** : l'app native suit le mode sombre du téléphone ; le web ne change pas.
10. **Palette du brief ou identité « Baobab 3.0 »** *(MOBILE.md étape 2)*. Le dépôt utilise le vert profond #14432A (identité en production), pas l'indigo du brief.
    **Reco** : garder Baobab 3.0. **Conséquence** : adopter la palette du brief = refonte du design system.
11. **Durée de conservation des sauvegardes** *(STORES.md §3.3 et §7)*. Aucune durée n'a été inventée dans les textes publics.
    **Reco** : relever la durée réelle de ton offre (§9.4) et l'écrire dans la politique de confidentialité ; faire valider par un juriste. **Conséquence** : un utilisateur qui supprime son compte reste dans les sauvegardes jusqu'à leur expiration : il faut le dire.
12. **Entité juridique et adresse de contact** *(DEPLOIEMENT.md §9 n° 1-2, STORES.md §7)*. Aucune adresse ni entité n'existe dans l'app ; seule mention : « BAOBAB — BY LESSI PATRICK » (page À propos).
    **Reco** : une adresse dédiée (idéalement sur ton domaine, une fois son DNS en place), nom de l'exploitant et droit applicable précisés ; relecture juridique des textes (géolocalisation, paiements, push, IA non décrits). **Conséquence** : obligatoire pour les boutiques ; sans adresse, aucun moyen d'exercer ses droits.
13. **Ouvrir le Premium web au lancement ?** Stripe n'est pas configuré (secrets absents, `stripe-webhook` 404). **Reco** : reporter Stripe après le lancement ; accepter (ou faire masquer par une session de code) le bouton « Devenir Premium » qui répond « temporairement indisponible ». **Conséquence** : si tu actives Stripe, le faire d'abord en mode test.
14. **IA (« Améliorer mon texte », traduction)** : `ANTHROPIC_API_KEY` absente, donc inopérante, avec un message d'erreur poli. **Reco** : décider avec le coût (20 appels/h/personne) ; Apple 5.1.2(i) exige un consentement explicite avant d'envoyer des données à une IA tierce (STORES.md §16). **Conséquence** : sans clé, les boutons IA échouent ; avec clé, il faut le consentement et l'indiquer dans la politique.
15. **Ouverture publique ou bêta sur invitation** : désactiver le hook (§9.1) ouvre l'inscription à tous (donc les protections de ce document deviennent critiques). **Reco** : ouvrir seulement après SQL-1 à SQL-5 et le test de bout en bout. **Conséquence** : sinon, rester en liste blanche (`insert into beta_testers (email) values (...)`).
16. **Journal d'écran `screen_view`** : une ligne dans `beta_events` à chaque changement d'onglet, sans purge. **Reco** : l'échantillonner ou le retirer pour le public (code), ou prévoir une purge. **Conséquence** : croissance rapide de la table.
17. **Vidéos et position GPS** : les vidéos envoyées gardent leurs métadonnées (position). **Reco** : avertir à la sélection ou accepter. **Conséquence** : fuite de position involontaire (les photos, elles, sont nettoyées).
18. **`delete-account` fantôme** : supprimer (§8.3). **Conséquence** : aucune (le site ne l'appelle pas).
19. **Page publique « Normes de sécurité des enfants »** exigée par Google pour les apps de rencontre (STORES.md §2.5 et §14) : à publier avant la soumission Android.
20. **Domaine officiel** : `baobab-app.ca` ou `baobab-app-zeta.vercel.app` (§9.5) : à trancher avant d'envoyer des liens publics, car l'adresse figure dans les e-mails, les liens profonds et le sitemap.
21. **Realtime : accepter ou fermer les DELETE de `likes`/`follows`/`favorites`** (SQL-22, blocs 4A/4B). **Reco** : jouer 4A (blocks, passes) ; accepter le risque pour les trois autres jusqu'au résultat du test de répétition ; migrer vers Broadcast privé après le lancement. **Conséquence** : fermer 4B supprime le temps réel du retrait d'un like/abonnement/favori.
22. **Bucket `avatars` public** : les images restent téléchargeables par quiconque connaît l'adresse (SQL-22, bloc 1B). **Reco** : accepter pour le 15 novembre (noms non devinables, listage fermé) et planifier le passage aux URL signées (plusieurs jours de code) ; remplacer les photos exposées si l'une pose problème. **Conséquence** : un bucket privé casse toutes les images tant que le client n'utilise pas d'URL signées.

---

## 11. Séquence globale J-7 → J → J+7

« J » = le jour d'ouverture au public. Si J est dans moins de 7 jours, fais plusieurs jours le même jour, **dans l'ordre**.

### J-7 à J-5 — préparer, sans risque
- [ ] Bilan (§4) et sauvegarde du résultat.
- [ ] Outils : CLI Supabase connectée, Vercel connecté, `git pull`.
- [ ] Tableau de bord (§9.1 à §9.4) : SMTP personnalisé, Site URL, Redirect URLs, hook, Max rows, sauvegardes.
- [ ] Domaine : DNS du domaine choisi (§9.5) ; adresse de contact créée.
- [ ] Décisions bloquantes (§10 : 3, 4, 12, 13 à 15, 20).
- [ ] Relecture juridique des textes (décision 12), au moins un premier passage.

### J-5 à J-3 — SQL puis fonctions
- [ ] Sauvegarde/point de contrôle (§9.4).
- [ ] SQL-1 (pré-contrôle puis exécution), SQL-2, SQL-3, SQL-4 (hors pic), SQL-5.
- [ ] SQL-6 à SQL-15, un par un, bilan après chaque série.
- [ ] SQL-22 (fuites de lecture) bloc par bloc, **après répétition** (§9.7), puis sondes anonymes.
- [ ] Déployer `process-scheduled-deletions` et `cleanup-expired-stories` (§8.2) ; examiner `delete-account` (§8.3).
- [ ] Remplir `contact.json`, ajuster le domaine (§9.5), `git pull --rebase origin main` puis `git push origin main`.

### J-2 à J-1 — essais et gel
- [ ] Test de bout en bout avec deux comptes réels sur le site de production (inscription par e-mail externe, confirmation, onboarding, like mutuel, message, photo, signalement, blocage, événement privé avec refus d'invitation, suppression de compte puis vérification après l'heure pile suivante).
- [ ] Bilan final : aucune ligne « NON » en catégories web ; requêtes de santé (§13) enregistrées dans un onglet SQL Editor.
- [ ] **Gel** : plus de `git push` risqué jusqu'à J+2.

### J — ouverture
- [ ] Désactiver le hook de bêta privée (si ce n'est pas déjà fait) ; faire une inscription réelle, la confirmer, vérifier l'arrivée de l'e-mail.
- [ ] Surveiller en direct (§13) pendant les premières heures : Supabase > Logs (Auth, API), Vercel > Deployments / Logs, `client_errors`.

### J+1 à J+7 — surveiller
- [ ] Chaque matin : requêtes du §13 (comptes, erreurs, signalements ouverts, suppressions en attente, crons, réponses `pg_net`).
- [ ] J+1 : vérifier que le cron de 3 h (statuts expirés) a répondu 200 et que `baobab-cleanup-old-client-errors` existe.
- [ ] J+2 : traiter la file de signalements et de retours ; vérifier l'espace Storage.
- [ ] J+3 : relire Supabase > Reports (erreurs 4xx/5xx, CPU, connexions) et les conseils de sécurité/performance du tableau de bord.
- [ ] J+7 : décider de la suite (§12) avec les données réelles (premiers inscrits, erreurs fréquentes).

---

## 12. Après le lancement : Stripe, IA, apps natives

À faire seulement après un lancement web stable. Le guide pas à pas des boutiques est `MOBILE.md` (« GUIDE DE PUBLICATION », parties A à G) et `STORES.md` §14.

### 12.1 Stripe (Premium web)
- [ ] Décision 13. Créer les produits/prix dans Stripe (mode test d'abord), poser les secrets (§8.2), déployer `stripe-webhook` et redéployer `create-checkout-session`, configurer le webhook Stripe, tester un abonnement de test de bout en bout, puis passer en mode réel.
- [ ] Avant d'activer `monetization_enabled` : SQL-15 fait ; décision 6 tranchée.

### 12.2 IA
- [ ] Décision 14 ; poser `ANTHROPIC_API_KEY` (et `ANTHROPIC_MODEL` au besoin) ; tester.

### 12.3 Notifications push natives
- [ ] Firebase : projet, app Android `ca.baobab.app`, `google-services.json` placé dans `android/app/` et committé, compte de service FCM → `FCM_SERVICE_ACCOUNT_JSON` (secret).
- [ ] Apple : clé APNs `.p8` → `APNS_KEY_P8`, `APNS_KEY_ID`, `APNS_TEAM_ID` (secrets).
- [ ] SQL-16 (`device-tokens`), redéployer `send-push` avec `--no-verify-jwt`, puis SQL-17 (triggers) après la décision 6.

### 12.4 Applications Android / iOS
- [ ] Comptes Apple Developer (99 USD/an) et Google Play (25 USD) ; D-U-N-S si organisation (STORES.md §14).
- [ ] Décisions 1, 2, 8, 12, 19 ; option C (Premium masqué en natif) **avant** toute soumission.
- [ ] Android : keystore (à sauvegarder en deux endroits), 4 secrets GitHub de signature + 2 secrets `VITE_*`, lancer « Android build », fiche Play, **test fermé de 12 testeurs pendant 14 jours**, empreinte SHA-256 dans `assetlinks.json`.
- [ ] iOS : identifiant d'app avec capacités (Push, domaines associés), clé API App Store Connect, clé APNs, app dans App Store Connect, Team ID dans `apple-app-site-association`, lancer « iOS build », TestFlight, soumission par toi.
- [ ] Compte de démonstration pour les relecteurs (position récente au Canada), captures d'écran, textes de fiche (STORES.md §12-13).
- [ ] Tests sur appareils réels (checklist `MOBILE.md` §(G) et `STORES.md` §15) — **rien n'a jamais été testé sur un vrai téléphone, ni compilé en CI**.

---

### Drapeaux de lancement (Premium, IA, compteur public)

Depuis le 1er novembre 2026, l’application **masque par défaut** ce qui n’est pas prêt (code : `src/lib/featureFlags.js`) :

| Réglage Vercel (variable d’environnement) | Effet quand absent | Pour activer |
|---|---|---|
| `VITE_FEATURE_PREMIUM` | Pas d’onglet « Abonnement », pas de « Qui m’a aimé », pas de paywall des filtres avancés, pas de bouton « Enregistrer dans une collection », pas d’onglet « Statistiques » (un compte déjà abonné garde l’onglet pour gérer son abonnement) | `true`, **après** le déploiement de `stripe-webhook`, `create-checkout-session` et `create-portal-session`, la pose des secrets Stripe, **et l’exécution de SQL-37, puis SQL-38 et SQL-40** (sans SQL-38 les collections, sans SQL-40 les statistiques annoncent « pas encore disponibles ») |
| `VITE_FEATURE_AI` | Aucun bouton « Améliorer avec l’IA » ni suggestions de conversation | `true`, **après** la pose de `ANTHROPIC_API_KEY` et le déploiement de `ai-assist` (version à quotas). Pour les outils d'écriture réservés à Premium (« Corriger », « Rédiger ») : aussi SQL-39 **avant** ce déploiement, et `VITE_FEATURE_PREMIUM` |
| (aucun) compteur public | Le compteur « N membres déjà sur Baobab » n’apparaît qu’à partir de 50 membres (`MEMBER_COUNT_PUBLIC_MIN`) | Modifier la constante |

Les variables `VITE_*` sont figées à la compilation : après les avoir définies dans Vercel, **redéployer**.

## 13. Contrôles de santé après le lancement

Toutes les requêtes sont en lecture seule (SQL Editor, rôle propriétaire). Garde-les dans un onglet.

```sql
-- 1. Comptes créés par jour (14 derniers jours)
select date_trunc('day', created_at)::date as jour, count(*) as comptes
from auth.users where created_at > now() - interval '14 days' group by 1 order by 1 desc;

-- 2. Santé des inscriptions : e-mails non confirmés sur 3 jours (un taux élevé = e-mails qui n'arrivent pas)
select count(*) filter (where email_confirmed_at is null) as non_confirmes, count(*) as total
from auth.users where created_at > now() - interval '3 days';

-- 3. Profils : onboarding terminé, bannis, suppressions en attente
select count(*) as profils,
       count(*) filter (where onboarding_completed_at is not null) as onboarding_termine,
       count(*) filter (where banned_at is not null) as bannis,
       count(*) filter (where deletion_requested_at is not null) as suppressions_en_attente
from profiles;

-- 4. Activité des dernières 24 h
select (select count(*) from messages where created_at > now() - interval '24 hours') as messages_24h,
       (select count(*) from likes where created_at > now() - interval '24 hours') as likes_24h,
       (select count(*) from posts where created_at > now() - interval '24 hours') as publications_24h;

-- 5. Erreurs du site (après SQL-5) : les plus fréquentes sur 24 h
select message, count(*) as occurrences, max(created_at) as derniere, count(distinct profile_id) as profils
from client_errors where created_at > now() - interval '24 hours' group by message order by occurrences desc limit 20;

-- 6. Files d'attente : signalements ouverts par source et retours bêta nouveaux
select 'profil' as source, count(*) as ouverts from reports where status = 'open'
union all select 'communaute', count(*) from community_reports where status = 'open'
union all select 'evenement', count(*) from event_reports where status = 'open'
union all select 'publication', count(*) from post_reports where status = 'open'
union all select 'info', count(*) from info_reports where status = 'open'
union all select 'retours beta nouveaux', count(*) from beta_feedback where status = 'nouveau';

-- 7. Suppressions de compte EN RETARD (délai de 24 h + cron horaire : plus de 25 h = problème)
select count(*) as en_retard from profiles
where deletion_requested_at is not null and deletion_requested_at < now() - interval '25 hours';

-- 8. Dernière exécution de chaque tâche planifiée
select j.jobname, j.schedule, j.active, d.status, d.start_time, left(d.return_message, 80) as message
from cron.job j
left join lateral (select * from cron.job_run_details where jobid = j.jobid order by start_time desc limit 1) d on true
order by j.jobname;

-- 9. Appels automatiques récents (cron et triggers push) : codes de réponse sur 24 h (conservés peu de temps)
select status_code, timed_out, count(*) as n from net._http_response
where created > now() - interval '24 hours' group by 1, 2 order by n desc;
select id, status_code, timed_out, left(error_msg, 80) as erreur, created
from net._http_response order by created desc limit 10;

-- 10. Actualités : dernière récupération
select * from immigration_news_fetch_log order by fetched_at desc limit 3;

-- 11. Volumétrie : taille de la base et des plus grosses tables ; stockage par dossier
select pg_size_pretty(pg_database_size(current_database())) as base;
select c.relname as table_, pg_size_pretty(pg_total_relation_size(c.oid)) as taille
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 10;
select bucket_id, count(*) as fichiers, pg_size_pretty(sum((metadata->>'size')::bigint)) as taille
from storage.objects group by 1 order by sum((metadata->>'size')::bigint) desc;

-- 12. Croissance du journal d'écran (décision 16)
select count(*) as lignes, count(*) filter (where created_at > now() - interval '24 hours') as dernieres_24h from beta_events;
```

**Sondes HTTP** (aucun identifiant ; à lancer dans Git Bash) :

```bash
curl -s -o /dev/null -w "site: %{http_code}\n"   https://baobab-app-zeta.vercel.app/            # 200
curl -s -o /dev/null -w "version: %{http_code}\n" https://baobab-app-zeta.vercel.app/app-version.json   # 200
for f in process-scheduled-deletions cleanup-expired-stories fetch-immigration-news ai-assist; do
  echo -n "$f: "; curl -s -o /dev/null -w "%{http_code}\n" -X POST https://vozehymbihnckzklxesw.supabase.co/functions/v1/$f; done   # 401 chacune (404 = non déployée)
curl -s -w "\n%{http_code}\n" -X POST https://vozehymbihnckzklxesw.supabase.co/functions/v1/send-push                          # unauthorized + 401
curl -s -w "\n%{http_code}\n" -X POST https://vozehymbihnckzklxesw.supabase.co/functions/v1/stripe-webhook                     # 404 avant déploiement ; 400 « Signature manquante. » après
```

**Où regarder les premiers jours**
- *Vercel* : Deployments (dernier déploiement *Ready*), Logs, Analytics si activé.
- *Supabase* : Logs (Auth : échecs d'inscription et d'e-mail ; API : erreurs 4xx/5xx ; Postgres ; Edge Functions), Reports (CPU, connexions, Realtime),
  Database > Advisors (conseils de sécurité/performance), Storage > Usage.
- *Seuils d'alerte à retenir* : e-mails non confirmés > 30 % ; `en_retard` (requête 7) > 0 ; une tâche planifiée en échec deux jours de suite ;
  `client_errors` : un même message > 20 fois par jour.

---

## 14. Ce qui n'a pas pu être prouvé, et corrections faites ailleurs

**Non prouvé (aucun accès SQL à ta base, et aucune lecture du tableau de bord)** :
- L'état réel de chaque fichier de la catégorie C et de chaque fichier de la catégorie B : le bilan (§4) tranche.
- Que les 45 sections du COMBINED se soient toutes exécutées sans erreur (preuve : notes de vérification dans `DEPLOIEMENT.md`, pas un relevé de la base) : lignes « COMBINED » du bilan.
- Les triggers push *message*/*match* (probable *oui*), le cron de suppression à 30 s, l'existence du secret Vault `service_role_key`.
- Tous les réglages du tableau de bord (hook, SMTP, Site URL, Redirect URLs, Max rows, sauvegardes, quotas) : §9.
- Que le bloc fusionné SQL-14 et le bilan s'exécutent sans erreur sur ta base : le bilan a été validé pour la syntaxe sur un moteur PostgreSQL de test, pas contre Supabase.
- Que `supabase-storage-account-quota.sql` soit autorisé sur `storage.objects`.
- Que le modèle IA par défaut soit encore disponible.
- L'état de l'intégration continue GitHub au 8 octobre (je n'y touche pas).
- Tout ce qui concerne les téléphones : aucun test réel, aucune compilation native réelle.
- **SQL-22 (`supabase-close-read-leaks.sql`)** : validé uniquement sur un schéma factice local (PGlite, `src/native/closeReadLeaks.test.js`), jamais sur une base Supabase. Revue indépendante du 28 oct. : garde de structure du bloc 1, garde de clé primaire des blocs 4A/4B (sans clé, `replica identity default` interdit tout DELETE/UPDATE : reproduit sur PGlite), conservation de l'EXECUTE de tous les rôles, `extensions` ajouté au `search_path`, privilèges par défaut explicites pour authenticated/service_role et pour le schéma `extensions`, journal de sauvegarde et retour arrière automatique, vérification interne du 3B. Non vérifié (PGlite ne peut pas le représenter) : les politiques réelles de `profile_photos`, les fonctions `SECURITY DEFINER` inconnues du dépôt, le comportement de Realtime (DELETE, filtres, abonnement anonyme) et de Storage, PostgREST (cache de schéma, codes HTTP), les rôles réels de Supabase (`postgres` n'y est pas super-utilisateur : le script ignore les fonctions d'un autre propriétaire), la version de PostgreSQL de Supabase.

**Corrections documentaires faites avec ce fichier** : en-têtes « Voir `LANCEMENT.md` » dans `DEPLOIEMENT.md`, `MOBILE.md` et `STORES.md` ;
`DEPLOIEMENT.md` §1c, §2a, §2c, §11b, §12b (drapeau `--no-verify-jwt`, secrets, événements Stripe, état probable des triggers push). Aucun fichier `supabase-*.sql` n'a été modifié ;
un test (`src/native/launchDoc.test.js`) fait échouer la CI si un fichier `supabase-*.sql` ou une edge function n'est pas mentionné dans ce document.
