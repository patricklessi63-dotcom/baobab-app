# Baobab — Audit de lancement (Phase 1)

Rédigé le **mardi 20 octobre 2026 (J0)**, dépôt à `8ca01dd` (840 commits, aucun commit depuis le 8 octobre).
Objectif du propriétaire : lancement officiel le **dimanche 15 novembre 2026**. Il reste **26 jours**.

**Règle de lecture.** Chaque affirmation est soit **[PROUVÉ]** (fichier:ligne, commit, ou sonde datée), soit
**[NON VÉRIFIÉ]** (avec la raison). Rien ici n'a été exécuté contre la production, à une exception près : des
lectures (sondes HTTP avec la clé publique, `functions list`, `secrets list`, `vercel ls/env ls/domains ls`).
Aucun SQL exécuté, aucune fonction déployée, aucun secret posé, aucun compte créé ni utilisé.

**Ce document ne refait pas les audits existants.** Il consolide `LANCEMENT.md` (8 oct.), `DEPLOIEMENT.md`,
`BAOBAB-3.0-AUDIT.md` (daté du 25 août, très ancien), `MOBILE.md`, `STORES.md`, `CHANGELOG.md`
(s'arrête au 24 sept.), `rls-test-commands.md`, `supabase-integration.md`, revérifie ce qui pouvait avoir changé, et
comble des trous (sections 0, 2, 5 et 9 contiennent des constats **nouveaux**, marqués **NOUVEAU**).

## Table des matières

0. [Preuves et vérifications exécutées aujourd'hui](#0-preuves-et-vérifications-exécutées-aujourdhui)
1. [Fonctionnalités existantes et état](#1-fonctionnalités-existantes-et-état)
2. [Problèmes critiques](#2-problèmes-critiques)
3. [Problèmes importants](#3-problèmes-importants)
4. [Améliorations recommandées](#4-améliorations-recommandées)
5. [Risques de sécurité (inspection réelle)](#5-risques-de-sécurité-inspection-réelle)
6. [Fonctionnalités manquantes](#6-fonctionnalités-manquantes)
7. [Dépendances techniques et état réel](#7-dépendances-techniques-et-état-réel)
8. [Plan d'exécution classé par priorité](#8-plan-dexécution-classé-par-priorité)
9. [Diagnostic des erreurs HTTP 401/403 « au chargement »](#9-diagnostic-des-erreurs-http-401403-au-chargement)
10. [Rapport d'avancement J0 (format demandé)](#10-rapport-davancement-j0-format-demandé)

---

## 0. Preuves et vérifications exécutées aujourd'hui

Toutes les heures sont celles de la machine (heure locale, 20 octobre 2026).

| # | Vérification | Résultat | Heure |
| --- | --- | --- | --- |
| 1 | `git pull --ff-only origin main` | « Already up to date » (des erreurs de suppression de `.git/worktrees/agent-*` : *Permission denied*, sans conséquence sur le pull) | 23:11 |
| 2 | `npm run build` | **OK**, 23,5 s ; chunk principal `index-*.js` **487,21 kB** (141,98 kB gzip), `vendor-supabase` 219,9 kB, `vendor-react` 141,8 kB | 23:12 |
| 3 | `npx vitest run --pool=forks --poolOptions.forks.singleFork=true` | **240 fichiers, 1652 tests, tous verts**, 174,5 s | 23:13–23:16 |
| 4 | `npm audit --omit=dev` | **0 vulnérabilité** | 23:13 |
| 5 | Site `https://baobab-app-zeta.vercel.app` : `/`, `/connexion`, `/confidentialite`, `/conditions`, `/a-propos`, `/suppression-compte`, `/app-version.json`, `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/sw.js`, `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` | **200** partout. `/inexistant` renvoie **aussi 200** (la même page d'accueil : pas de vrai 404) | 23:13 |
| 6 | En-têtes du site | CSP stricte (`default-src 'self'`, scripts par hash, `frame-ancestors 'none'`, `object-src 'none'`), HSTS 2 ans + preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy: camera=(), microphone=(self), geolocation=(self)` | 23:13 |
| 7 | Edge functions (POST sans jeton) | `process-scheduled-deletions`, `fetch-immigration-news`, `ai-assist`, `create-checkout-session`, `create-portal-session`, `delete-account` : **401** (passerelle) ; `send-push` : **401 « unauthorized »** (sa propre garde) ; **`cleanup-expired-stories` : 404** et **`stripe-webhook` : 404** (jamais déployées) | 23:13 |
| 8 | `OPTIONS` sur `ai-assist` avec `Origin: https://evil.example` | 200 + `Access-Control-Allow-Origin: *` | 23:13 |
| 9 | `npx supabase functions list` | 7 fonctions en ligne = 6 du dépôt (sur 8 ; manquent `cleanup-expired-stories` et `stripe-webhook`) + `delete-account` fantôme : identique au 8 octobre (aucune mise à jour depuis le 22 août pour `ai-assist`, `process-scheduled-deletions`, etc.) | 23:19 |
| 10 | `npx supabase secrets list` (noms seulement) | Présents : `PUSH_WEBHOOK_SECRET`, `VAPID_*` (3), `SUPABASE_*`. **Absents : `ANTHROPIC_API_KEY`, `STRIPE_*`, `SITE_URL`, `FCM_SERVICE_ACCOUNT_JSON`, `APNS_*`.** (La CLI affiche des empreintes, pas les valeurs ; je n'en recopie aucune.) | 23:19 |
| 11 | `npx vercel ls` / `env ls` / `domains ls` | Dernier déploiement de production **Ready, il y a 12 jours** (donc ≈ 8 oct.) ; domaine `baobab-app.ca` rattaché depuis 60 jours | 23:20 |
| 12 | `https://baobab-app.ca/` et `www.` | **Ne résolvent pas** (curl code 000) | 23:13 |
| 13 | `GET /auth/v1/settings` (public) | `mailer_autoconfirm: false` (**confirmation d'e-mail exigée**), `disable_signup: false` (inscriptions ouvertes au niveau Auth), e-mail seul fournisseur, `anonymous_users: false`, aucun OAuth | 23:2x |
| 14 | Lecture anonyme (clé publique) de 41 tables | 38 tables renvoient `[]` (RLS), **sauf `profile_photos` : 11 lignes lisibles sans connexion** (voir C2) ; `client_errors` et `device_push_tokens` : **404 table inconnue** | 23:13 |
| 15 | Listage anonyme des 6 buckets de Storage | `[]` partout (pas de listage) | 23:2x |
| 16 | RPC en anonyme | `get_my_likers` répond 200 `{"likers": [], "admirers_count": 0}` ; **`admin_dashboard_stats` atteint son corps** et répond « Non autorise » (P0001) ; `public_user_count` répond **4** | 23:2x |
| 17 | `GET /rest/v1/` (schéma OpenAPI) avec la clé publique | **401** : l'introspection du schéma est fermée à `anon` (bon point) | 23:2x |
| 18 | Navigateur intégré, 6 pages à **375 px et 1280 px** | Aucun débordement horizontal (`scrollWidth` = largeur de fenêtre, ou 1265 à 1280 px à cause de l'ascenseur) ; **console : aucun message** ; `h1` correct sur chaque page | 23:2x |
| 19 | Poids de l'accueil (`performance.getEntriesByType`) | **10 requêtes**, **≈ 279 kB transférés** (document 10 kB, JS 139,9 + 47,4 + 58,8 + 9,6 kB, CSS 7,6 kB, SVG 2,2 kB, feuille Google Fonts 1,3 kB, `app-version.json` ×2), 957 kB décodés, TTFB 56 ms, `DOMContentLoaded` 265 ms, `load` 266 ms | 23:2x |
| 20 | Secrets dans le dépôt (`git grep`) | `eyJ…`, `sk_live`, `service_role`, clés privées : **aucun secret réel**. Seules occurrences : fixtures de tests, un exemple `sk_live_...` dans `DEPLOIEMENT.md:538`, et la clé **publique** `sb_publishable_…` dans `rls-test-commands.md` (publique par conception : elle est dans le bundle) | 23:1x |
| 21 | Secrets dans l'historique (`git log -S` sur 6 motifs) | **Aucune clé réelle**. Les trois commits remontés (`cb10be2`, `86893f7`, `e3ebcba`) contiennent des jetons/clés factices de tests (`"…x…"`, `SECRET-MATERIAL`). Aucun `.env`, `.p8`, `.jks`, `google-services.json` jamais ajouté (seul `.env.example`) | 23:1x |
| 22 | Documentation Anthropic actuelle (`platform.claude.com/docs`) | `claude-3-5-haiku-20241022` : **RETIRÉ le 19 février 2026**. Actifs : `claude-haiku-5-5` (retrait pas avant 7 oct. 2027), `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`. `claude-haiku-4-5-20251001` : actif, retrait « pas avant le 15 oct. 2026 » (donc à éviter). | 23:2x |

Après ajout du test `src/native/auditDocs.test.js` (23:29–23:32) : `npm run build` OK (12,9 s) et suite complète **241 fichiers, 1660 tests, tous verts** (157,8 s).

**Lighthouse n'est pas disponible : aucun score n'est avancé.** Les chiffres 19 sont des mesures brutes de
chargement, pas un score de performance.

**Non vérifié aujourd'hui (et pourquoi) :**
- Tout parcours **connecté** (interdiction de créer ou d'utiliser un compte). Les 401/403 « au chargement »
  n'ont donc pas pu être **reproduits** ; ils sont diagnostiqués par lecture + sondes (section 9).
- Les réglages du tableau de bord Supabase : hook « Before User Created », SMTP, Site URL, Redirect URLs,
  « Max rows », sauvegardes/PITR, limites de débit Auth, quotas. La CLI ne les lit pas.
- L'état exact de chaque fichier SQL en production (il faut lancer le *bilan* de `LANCEMENT.md` §4 dans le
  SQL Editor). Les seuls indices d'aujourd'hui : `client_errors` et `device_push_tokens` n'existent pas ;
  `user_locations.last_in_canada_at` **existe** (lecture 200) ; `get_my_likers` **existe**.
- L'état de la CI GitHub aujourd'hui (je ne touche pas aux identifiants GitHub). `MOBILE.md` la dit verte au 7 oct.
- Que la production corresponde exactement au HEAD (l'empreinte du bundle diffère de ma compilation locale, ce
  qui peut venir des variables d'environnement ; la page de confidentialité en ligne porte « 7 octobre 2026 »,
  cohérente avec le commit `02b0cd9`).
- Le comportement sur appareil réel, la compilation Android/iOS, Stripe, l'envoi d'e-mails.

---

## 1. Fonctionnalités existantes et état

Légende : **OP-P** = opérationnel prouvé · **OP-NP** = opérationnel (code + tests) mais non prouvé en production ·
**BLOQUÉ** = bloqué par une action du propriétaire · **ABSENT**.

Important : « tests verts » signifie que la **logique** est testée (jsdom, mocks). Aucun test n'exerce la vraie
base ni un navigateur réel connecté : il n'existe ni test e2e, ni test RLS automatisé (`package.json` : pas de
Playwright/Cypress ; seul `rls-test-commands.md` est manuel, 3 commandes `curl`).

| Fonctionnalité | État | Preuve et réserves |
| --- | --- | --- |
| **Landing et pages publiques** (accueil, connexion, confidentialité, conditions, à propos, suppression de compte) | **OP-P** | §0 lignes 5, 18, 19. Réserves : adresse de contact **vide** (`src/config/contact.json`), compteur « **4 membres déjà sur Baobab** » affiché (décision 3 de `LANCEMENT.md`), page `/inexistant` en 200. |
| **Inscription / connexion / réinitialisation** | **OP-NP** (public) / OP-P (équipe) | Confirmation d'e-mail exigée (§0-13). Une inscription réelle (adresse mailinator) a réussi le 8 sept. (commit `36b15dc`). **Non vérifié** : hook de bêta privée (`supabase-beta-access.sql`) encore actif ou non, SMTP personnalisé, limite d'e-mails du service intégré. `public_user_count()` = **4** : une poignée de comptes seulement. Pas de CAPTCHA (aucune occurrence dans `src/`). |
| **Profils / onboarding** | **OP-NP** | `OnboardingWizard`, tests nombreux. L'âge minimum de 18 ans n'est appliqué que côté client tant que `supabase-age-check-server-side.sql` n'est pas exécuté (**[NON VÉRIFIÉ]** en prod ; `LANCEMENT.md` le tient pour non exécuté). Voir C2 et C3 pour les fuites de données de profil. |
| **Découverte / matching** | **OP-NP** | Double opt-in, exclusion immédiate d'un profil signalé (`BAOBAB-3.0-AUDIT.md` item 5), `nearby_profiles` avec `show_general_area`. Aucun test de pertinence sur de vraies données ; un seul flux (pas de types de lien amitié/pro). |
| **Fil (publications)** | **OP-NP** | Tables et RLS dans `supabase-feed-posts.sql`. Filtre de lecture par blocage **non exécuté** (SQL-3). |
| **Statuts (stories)** | **OP-NP**, purge **cassée** | `cleanup-expired-stories` n'est **pas déployée** (404, §0-7) : le cron de 3 h échoue chaque nuit et les statuts expirés ne sont pas purgés. |
| **Messagerie** (texte, photo, vocal, réactions, réponses, accusés, saisie) | **OP-NP** | Realtime + RLS (`supabase-protect-rls.sql:17-21`, `supabase-audit-fixes.sql`). Médias dans un bucket privé `chat-media` (policies lues dans `supabase-chat-media-storage.sql`). Test en conditions réelles à deux comptes : **jamais fait par cette mission**. |
| **Communautés** | **OP-NP** | Communautés privées/`invite_only` **visibles et membres listables par tout compte connecté** (décision 4 de `LANCEMENT.md`). Gouvernance/orphelins : SQL non exécutés. |
| **Événements** (publics, communauté, privés, liste d'attente, rappels) | **OP-NP** | `can_view_event` : correctif **non exécuté** (SQL-2) ; un événement privé refusé reste lisible. Rappels : cron `send_event_reminders` planifié via COMBINED. |
| **Notifications dans l'app** | **OP-NP** | `supabase-notifications-persistence.sql` ; purge à 90 jours via cron COMBINED. |
| **Push web** | **OP-NP** | Secrets `VAPID_*` et `PUSH_WEBHOOK_SECRET` présents. Version déployée de `send-push` = **22 août** (v6, `verify_jwt:false`) ; le dépôt a du code plus récent (like/abonnement, jetons natifs). Triggers message/match « probablement exécutés le 25 août » (`LANCEMENT.md` §2) — **[NON VÉRIFIÉ]**. |
| **Push natif** (FCM/APNs) | **ABSENT / BLOQUÉ** | `device_push_tokens` : **404** aujourd'hui ; secrets `FCM_*`/`APNS_*` absents ; aucun compte Firebase/Apple prouvé. |
| **Premium / Stripe** | **BLOQUÉ** | `stripe-webhook` 404 ; `STRIPE_*` et `SITE_URL` absents ; `create-checkout-session` répond « temporairement indisponible » (commit du 30 sept. cité par `LANCEMENT.md`). `monetization_enabled=false` (**[NON VÉRIFIÉ]** : `app_config` n'est pas lisible en anonyme). Le bouton « Devenir Premium » reste visible et échoue. |
| **Admin / modération** | **OP-NP** | `src/components/admin/AdminDashboard.jsx` (stats, signalements, utilisateurs, retours bêta, rôles) ; RPC `admin_*` existent en prod (`admin_dashboard_stats` répond P0001 en anonyme). Races corrigées dans des SQL **non exécutés** (SQL-8). Aucun test de bout en bout côté modérateur. |
| **IA `ai-assist`** | **BLOQUÉ + CASSÉ** | Fonction déployée (v2, 22 août) mais : (a) `ANTHROPIC_API_KEY` **absente** ; (b) **modèle par défaut `claude-3-5-haiku-latest` retiré** par Anthropic le 19 fév. 2026 (`supabase/functions/ai-assist/index.ts:19`) — **même avec une clé, tous les appels échoueraient** tant que `ANTHROPIC_MODEL` n'est pas posé ; (c) SDK `npm:@anthropic-ai/sdk@0.27` (`:13`), ancien. Les textes légaux (§11) annoncent pourtant cette fonctionnalité. |
| **Présence en ligne** | **OP-NP** | `lib/presence.js`, heartbeat 60 s, borne de confiance 10 min (`CHANGELOG`). |
| **Géolocalisation / portail Canada** | **OP-NP** | La colonne `user_locations.last_in_canada_at` **existe** en prod (lecture 200), donc la migration `canada-gate` est appliquée (le 400 de septembre est résolu). |
| **Suppression de compte** (différée 24 h) + export de données | **OP-NP**, version en ligne **obsolète** | Fonction en ligne = 22 août ; 4 correctifs d'effacement de fichiers et d'ordre **non déployés**. Une fonction `delete-account` **fantôme** (absente du dépôt) permet une suppression immédiate (`LANCEMENT.md` §8.3). Page publique `/suppression-compte` : OP-P. |
| **Signalement / blocage** (profil, message, publication, commentaire, statut, événement, communauté) | **OP-NP** | Couverture UGC complète au 7 oct. (commits `5d65e99`, `9f9486c`, `7e989fe`…). Côté serveur, le filtre de blocage sur les lectures est dans SQL-3 **non exécuté**. Les signalements sont supprimés en cascade avec le compte (décision 7). |
| **Anti-arnaque** (`moneyGuard.js`) | **OP-NP** | Heuristique de mots-clés **côté client**, avertissement jamais bloquant (`src/lib/moneyGuard.js:1-14`) ; rien n'est journalisé côté serveur. |
| **Suivi d'erreurs** (`errorReporter.js`) | **ABSENT en prod** | La table `client_errors` n'existe pas (§0-14) : chaque rapport d'erreur est un `insert` qui échoue en silence. Aucune télémétrie d'erreurs aujourd'hui. |
| **Apps natives** (Capacitor 8, Android + iOS) | **ABSENT côté boutiques** | Projets générés et testés par jsdom ; `MOBILE.md:165` : build Android « NON vérifié » (ni JDK ni SDK sur la machine de développement) ; workflows de build **jamais lancés** ; aucun appareil, aucun compte développeur prouvé. |

---

## 2. Problèmes critiques

« Critique » = à régler **avant d'ouvrir les inscriptions au public**, sinon risque réel pour des personnes.

**C1 — Tout compte connecté peut lire tous les profils, colonnes comprises.** [PROUVÉ par lecture]
`supabase-scale-security.sql:63-66` : `create policy … on profiles for select to authenticated using (true)`. Les
réglages de confidentialité (`show_birth_year`, `show_city`…) sont « UI-only » (`:49-52`). La liste côté client
`src/lib/otherProfileColumns.js` reconnaît l'exposition : `birth_date` exact, `ban_reason`, `suspend_reason`,
`report_count`, `flagged_for_review`, `notification_preferences` sont lisibles par un `select=*` direct sur l'API,
même si l'écran ne les affiche pas. Aujourd'hui, avec 4 comptes, l'enjeu est faible ; **avec des inscriptions
ouvertes, n'importe quel inscrit (aucune vérification au-delà de l'e-mail, pas de CAPTCHA) peut aspirer toute la base**.
**Non testé avec un jeton** (interdit) : la preuve est la policy elle-même. Correctif : SQL **à écrire** (vue publique
des colonnes sûres + retrait du `select` direct, ou privilèges par colonne) — non rédigé dans cette phase.

**C2 — Les photos de profil sont listables sans connexion.** [PROUVÉ par sonde, **NOUVEAU**]
`GET /rest/v1/profile_photos?select=*` avec la seule clé publique renvoie **11 lignes** (`id`, `profile_id`, `url`,
`position`, `created_at`) — le 20 oct. à 23:13. La table `profile_photos` **n'est créée dans aucun fichier SQL du
dépôt** (c'est la seule table lue par `src/` et absente du dépôt, avec le bucket `avatars`) : sa politique de lecture a
été posée à la main ou dans un fichier perdu. Combinée au bucket `avatars` public, cela permet de **récupérer les
photos de tous les inscrits avant tout compte**. Correctif : SQL **à écrire** (policy `to authenticated`) et
**versionner** la table dans le dépôt.

**C3 — La base de production est en retard sur le dépôt, et personne n'a vérifié de combien.** [PROUVÉ en partie]
`LANCEMENT.md` recense 21 fiches SQL (SQL-1 à SQL-21) jamais exécutées : âge ≥ 18 ans côté serveur, événements
privés, filtre de blocage, index, `client_errors`, gardes d'état de compte, gouvernance de communauté, etc.
Aujourd'hui j'ai confirmé deux absences (`client_errors`, `device_push_tokens`) et deux présences
(`last_in_canada_at`, `get_my_likers`). **Tant que le bilan de `LANCEMENT.md` §4 n'est pas lancé, l'état réel est
inconnu.** Il n'existe **aucun environnement de test** de la base : tout SQL se joue directement en production.

**C4 — Edge functions périmées ou fantômes.** [PROUVÉ]
`process-scheduled-deletions` en ligne = 22 août (le droit à l'effacement s'exécute avec l'ancien code qui efface
des fichiers encore utilisés par d'autres) ; `cleanup-expired-stories` absente ; `send-push` ancienne ;
`delete-account` fantôme (code absent du dépôt, suppression immédiate sans nettoyage — `LANCEMENT.md` §8.3).

**C5 — L'ouverture des inscriptions n'est pas éprouvée.** [NON VÉRIFIÉ — dépend du propriétaire]
Le hook « Before User Created » peut encore refuser les inconnus ; le SMTP intégré de Supabase est limité en volume
(`LANCEMENT.md` §9.1) ; le domaine `baobab-app.ca` ne résout pas (§0-12) donc aucune adresse d'expéditeur de ce
domaine ; Site URL/Redirect URLs inconnus. **Un jour de lancement où les e-mails de confirmation ne partent pas est un
lancement raté.**

**C6 — Conformité : aucun moyen de contacter l'exploitant, et le droit québécois n'est pas traité.** [PROUVÉ]
`src/config/contact.json` = `{"supportEmail": "", "operatorName": ""}` ; les pages légales n'affichent donc aucune adresse
(contrôle navigateur : aucune « @ » dans `/conditions`, `/a-propos`, `/suppression-compte`). `src/legalContent.jsx` cite le
RGPD et la LPRPDE (`:7`, `:76`) ; **aucune occurrence de « Québec » ni de « Loi 25 »** (grep du 20 oct.) alors que la plateforme
vise des personnes immigrantes au Canada, donc au Québec. Pas d'entité juridique (seule mention : « BAOBAB — BY LESSI
PATRICK »). Textes **non relus par un juriste** (décision 12). Je ne donne pas d'avis juridique : c'est un constat de
manque à faire traiter.

**C7 — L'IA annoncée ne peut pas fonctionner telle quelle.** [PROUVÉ] Voir tableau §1 (clé absente **et** modèle retiré).
Les textes légaux §11 décrivent des fonctions IA qui échoueront : incohérence à lever avant le lancement (activer
correctement ou masquer + retirer du texte).

---

## 3. Problèmes importants

| ID | Constat | Preuve |
| --- | --- | --- |
| I1 | **Aucune observabilité en production** : `client_errors` absente, pas d'alerte, pas de tableau de bord technique. | §0-14 ; `src/lib/errorReporter.js:115` |
| I2 | **Pas de tests e2e ni de tests RLS automatisés** ; CI uniquement sur push (pas de planification) ; builds natifs jamais lancés. | `package.json`, `.github/workflows/` (3 fichiers : `ci.yml`, `android-build.yml`, `ios-build.yml`) |
| I3 | **`EXECUTE` accordé à `anon` sur les RPC `SECURITY DEFINER`** : `revoke … from public` ne retire pas le droit direct de `anon` posé par défaut par Supabase. Preuve : `admin_dashboard_stats` répond depuis un appel anonyme et n'est arrêté que par le garde interne. **NOUVEAU.** Défense en profondeur absente (un oubli de garde dans une fonction = faille). | §0-16 ; `supabase-security-definer-revoke-grant-audit-fix.sql:232-233` (n'écrit que `from public`) |
| I4 | **Domaine `baobab-app.ca` non résolu** ; l'adresse officielle est donc encore `baobab-app-zeta.vercel.app` (canonical, sitemap, OG, e-mails). | §0-12 ; `LANCEMENT.md` §9.5 |
| I5 | **Compteur public « 4 membres »** : mauvaise preuve sociale (décision 3). | §0-5/18 |
| I6 | `ai-assist` : limite horaire « vérifier puis insérer » **après** l'appel (course possible), **aucun budget global**, texte de messages privés envoyé à Anthropic pour `translate_message` (contraire au principe « pas de lecture des conversations privées » du brief pour le futur bot, même si c'est à la demande), consentement par **opt-out** (`!== false`) et non consentement explicite préalable (Apple 5.1.2(i) noté dans `STORES.md:537`). | `ai-assist/index.ts:51-62, :72, :113`; `ConversationPane.jsx:837` |
| I7 | `client_errors` (une fois créée) sera **insérable par n'importe qui sans limite de débit** (policy ouverte à `anon`, voulue) : risque de remplissage jusqu'à la purge à 30 jours. | `supabase-client-errors.sql:41-47` |
| I8 | Journal `screen_view` dans `beta_events` à **chaque changement d'onglet, sans purge** (décision 16). | `SocialShell.jsx:189` |
| I9 | Vidéos envoyées : métadonnées (GPS) conservées (décision 17). Signalements supprimés avec le compte (décision 7). Notification « like » nomme la personne alors que « Qui m'a aimé » est flouté (décision 6). | `LANCEMENT.md` §10 |
| I10 | 133 fichiers SQL à la racine, sans outil de migration ni ordre garanti : rejouer un fichier restaure silencieusement une ancienne version (`LANCEMENT.md` §6.2, 12 pièges). Risque opérationnel élevé pour un solo. | `LANCEMENT.md` §6 |
| I11 | Interface **100 % française** pour un public immigrant (le réglage `en` n'est qu'une préférence stockée). | `src/hooks/useLanguage.js:3-7` |
| I12 | Politique `Permissions-Policy: camera=()` — acceptable pour le web (le champ fichier utilise l'appareil photo du système), mais à **reconfirmer sur appareil** ; `/inexistant` en 200 (pas de 404 ; impact SEO mineur). | §0-5, §0-6 |
| I13 | Un `git stash` existe (`stash@{0}: phase1-extraction-wip`) ; non touché, contenu inconnu. | `git stash list` |

---

## 4. Améliorations recommandées

Classées par rapport coût/bénéfice pour le 15 novembre (détails au §8).

1. **Fermer les fuites de lecture** : colonnes de `profiles` réservées au titulaire, `profile_photos` réservée aux connectés, `REVOKE EXECUTE … FROM anon` sur les RPC métier, versionner `profile_photos`.
2. **Créer un environnement de répétition** (second projet Supabase gratuit) pour y jouer le bilan, les SQL et des tests RLS à deux comptes **avant** la production.
3. **Observabilité minimale** : exécuter `supabase-client-errors.sql`, y ajouter une limite de débit (SQL à écrire), un panneau « Santé » dans l'admin alimenté par des requêtes en lecture seule déjà écrites (`LANCEMENT.md` §13).
4. **Filet de tests** : 6 à 8 parcours e2e (Playwright, en CI, contre le site et un projet de test) + un script de tests RLS anonyme/connecté exécutable.
5. **Feature flags d'ouverture** : masquer « Devenir Premium », les boutons IA et le compteur de membres tant que non prêts (code, côté assistant).
6. **Anti-bot à l'inscription** : CAPTCHA (Turnstile/hCaptcha) côté client + activation côté Supabase, **ensemble**, jamais l'un sans l'autre (`LANCEMENT.md` §9.1).
7. **Traiter `ai-assist` pour de bon** : modèle `claude-haiku-5-5`, SDK à jour, budget global, consentement explicite — ou le retirer du périmètre du 15 nov.
8. **Modération minimale à la publication** : liste de mots interdits évidents + délai de traitement des signalements publié (Apple 1.2, décision 2) ; prévu avant les boutiques, utile dès le web.
9. **Page 404 réelle** et domaine officiel avec DNS valide, e-mails transactionnels depuis le domaine.
10. **Discipline de migration** après le lancement : dossier `supabase/migrations` + `supabase db push` sur la branche de test.

---

## 5. Risques de sécurité (inspection réelle)

Méthode : scripts d'analyse sur les 133 fichiers `supabase-*.sql` (le script de FONCTIONS exclut COMBINED, concaténation des autres, et
`cleanup-test-data`, soit 131 fichiers), sondes anonymes, lecture des fonctions et des en-têtes.

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| RLS activée sur les tables créées par le dépôt | **57/57 tables** ont `enable row level security` | script du 20 oct. ; seule `profile_photos` est hors dépôt |
| Fonctions `SECURITY DEFINER` sans `set search_path` | **0 sur 153 définitions** analysées | script du 20 oct. |
| `EXECUTE` à `anon`/`public` | **Défaillant** : `revoke … from public` seul (I3). Des RPC métier sont appelables en anonyme ; les gardes de corps sont la seule défense | §0-16 |
| `profiles` SELECT | **Large pour tout connecté** (C1) ; anonyme fermé (`[]`) | `supabase-scale-security.sql:63-66` ; sonde |
| `messages`, `likes`, `passes`, `blocks`, `reports`, `follows`, `favorites`, `notifications` | Anonyme : `[]` | §0-14 |
| `messages` / `likes` / `passes` côté connecté | Lecture limitée aux parties (policies `supabase-protect-rls.sql:17-21, 38-53`) | lecture |
| Buckets de Storage | Listage anonyme fermé (6 buckets `[]`) ; `chat-media` privé avec policies de conversation | §0-15 ; `supabase-chat-media-storage.sql` |
| Vues | Aucune vue exposée repérée dans le dépôt | grep `create view` : **[NON VÉRIFIÉ en prod]** |
| Publications Realtime | `messages`, `message_reactions`, `favorites`, `follows`, `blocks`, `passes`, `likes` (replica identity **full** pour 5 d'entre elles). Les politiques RLS filtrent les INSERT/UPDATE ; **les événements DELETE de Realtime ne sont pas filtrés par RLS** d'après la documentation de Supabase que je connais. Ceci pourrait faire fuiter des suppressions de `likes`/`blocks`/`passes` d'autrui à un abonné. **[NON VÉRIFIÉ]** — à tester avec deux comptes sur le projet de répétition (10 minutes). | `supabase-likes-realtime-replica-identity-fix.sql:33`, `supabase-follows-favorites-blocks-passes-realtime-fix.sql:37-40` |
| Secrets dans le dépôt / l'historique | **Aucun secret réel** (§0-20, 21) | `git grep`, `git log -S` |
| `.gitignore` | `.env*`, `*.p8`, `*.jks`, `*.keystore`, `*.pem`, `keystore.properties`, `.vercel` exclus | `.gitignore` |
| CSP / en-têtes | **Bons** : pas de `unsafe-inline` en script (hash), pas de `unsafe-eval`, `frame-ancestors 'none'`, HSTS preload. `style-src 'unsafe-inline'` (inévitable avec les styles React/Tailwind) | `vercel.json:9-13` |
| CORS des edge functions | `Access-Control-Allow-Origin: *` (`_shared/cors.ts:5`), vérifié par sonde. Acceptable car les fonctions exigent un JWT ou un secret ; à resserrer à l'origine officielle une fois le domaine fixé | §0-8 |
| Limitation de débit existante | Triggers SQL : likes, messages, abonnements, signalements, plafond global d'actions, limites de création de contenu, quota de stockage (non exécuté). `ai-assist` : 20/h/personne (course possible). Pas de limite sur `client_errors` (I7), pas de limite IP côté application | fichiers `supabase-*rate-limit*.sql`, `supabase-global-action-rate-limit-fix.sql` |
| Confirmation d'e-mail | **Exigée** (`mailer_autoconfirm:false`) | §0-13 |
| Protection force brute (Auth) | **[NON VÉRIFIÉ]** : limites de débit Auth dans le tableau de bord ; pas de CAPTCHA ; mot de passe ≥ 8 caractères (`Auth.jsx`) ; protection « mots de passe divulgués » à vérifier | `LANCEMENT.md` §9.1 |
| Dépendances | `npm audit --omit=dev` : 0 vulnérabilité | §0-4 |
| Fonction fantôme `delete-account` | Active, JWT exigé ; supprime l'appelant immédiatement sans nettoyage | `LANCEMENT.md` §8.3 ; sonde 401 |
| Clé publique dans `rls-test-commands.md` | Publique par conception (même valeur dans le bundle). Ne pas la confondre avec une clé secrète | §0-20 |
| Données de l'ancien test | Un compte créé en prod par une session précédente (`test-loc-…@mailinator.com`, commit `36b15dc`) peut subsister | `supabase-cleanup-test-data.sql` existe ; **ne jamais l'exécuter tel quel** |

---

## 6. Fonctionnalités manquantes

Pour un lancement public d'une plateforme de rencontres/communautés, non présentes (grep ou fichiers, 20 oct.) :

- **Anti-bot** (CAPTCHA, vérification supplémentaire) — absent.
- **Modération à la publication** (filtre) — absente (réactive seulement) ; **file de modération avec délai promis** — non publiée.
- **Vérification d'identité / de photo** — absente (badge e-mail seulement).
- **Anglais** (au moins landing, légal, aide) — absent.
- **Aide / FAQ / assistant** — absente (c'est l'objet de `BAOBAB-AI.md`).
- **Page 404** et pages d'état/incident — absentes.
- **Traduction automatique des messages** — présente seulement via `ai-assist` (inopérant).
- **Recherche multi-conversations, types de lien (amitié/pro/amoureux), rappels contextuels** — non commencés (`BAOBAB-3.0-AUDIT.md`).
- **Tests e2e, tests RLS automatisés, charge** — absents.
- **Sauvegarde/restauration éprouvée** — non vérifiée (PITR ? durée ?).
- **Responsable de la protection des renseignements personnels désigné, registre des incidents, procédure d'incident** — rien dans le dépôt (**non vérifié** hors dépôt ; relève d'un conseil juridique).

---

## 7. Dépendances techniques et état réel

| Dépendance | État réel (preuve) | Bloquant pour le 15 nov. ? |
| --- | --- | --- |
| **Supabase** (projet `vozehymbihnckzklxesw`) | Actif ; Auth e-mail, confirmation exigée ; 7 fonctions ; ~4 comptes ; réglages du tableau de bord **non lus** | **Oui** : bilan SQL, hook, SMTP, sauvegardes |
| **Vercel** | Production Ready (déployée il y a 12 j.) ; 3 variables d'env. présentes ; déploie `main` à chaque push | Non (gel des pushs prévu) |
| **Domaine `baobab-app.ca`** (Cloudflare) | Rattaché à Vercel depuis 60 j., **DNS ne résout pas** | **Oui** si le domaine est l'adresse officielle et le domaine d'expédition e-mail |
| **SMTP** | Inconnu (service intégré probable) | **Oui** |
| **Stripe** | Aucun secret, 2 fonctions absentes, aucun produit prouvé | Non si Premium reporté (recommandé) |
| **Anthropic** | Pas de clé ; modèle par défaut retiré ; docs actuelles : `claude-haiku-5-5` (0,10 $/Mtok entrée, 0,50 $/Mtok sortie, prompts ≤ 100 k) | Non si IA reportée |
| **Firebase (FCM)** | Aucun projet prouvé, `google-services.json` absent | Non (natif après) |
| **APNs / Apple Developer** | Aucun compte prouvé (99 USD/an) | Non (natif après) |
| **Google Play** | Aucun compte prouvé ; test fermé **12 testeurs × 14 jours** puis ≈ 7 jours d'accès à la production (`STORES.md:497`) → **≈ 3 semaines minimum** | Natif : **impossible avant le 15 nov.** si non démarré |
| **GitHub Actions** | `ci.yml` vert au 7 oct. (non revérifié) ; builds natifs jamais lancés | Non |

---

## 8. Plan d'exécution classé par priorité

P0 = condition de lancement ; P1 = fortement recommandé ; P2 = après le lancement. Le plan jour par jour est dans
`PLAN-LANCEMENT-15-NOV.md`.

**P0 (propriétaire)** : lancer le bilan SQL ; créer le projet de répétition ; sauvegarde/PITR ; exécuter les SQL de `LANCEMENT.md` SQL-1→SQL-5 puis SQL-6→SQL-15 ;
redéployer `process-scheduled-deletions` et `send-push` (`--no-verify-jwt`), déployer `cleanup-expired-stories`, supprimer `delete-account` ; SMTP + hook + Site URL + Redirect URLs ;
DNS du domaine ; adresse de contact + nom d'exploitant ; relecture juridique (dont Loi 25).

**P0 (assistant, dans le dépôt)** : rédiger et tester sur la répétition les SQL de fermeture C1/C2/I3 ; feature flags (Premium, IA, compteur) ; mettre à jour le texte légal à relire ; e2e + tests RLS ; panneau Santé.

**P1** : CAPTCHA ; modération minimale ; correctifs `ai-assist` ; Baobab AI d'aide (bêta) ; 404 ; purge `beta_events`.

**P2** : Stripe, apps natives (Play : démarrer le test fermé tôt), anglais, migrations structurées.

---

## 9. Diagnostic des erreurs HTTP 401/403 « au chargement »

**Ce qui est connu.** Le brief et la mission évoquent « deux erreurs 403/401 récurrentes au chargement, sans impact
fonctionnel, notées en août ». **Je n'ai trouvé aucune trace de cette note** : recherche dans `CHANGELOG.md`,
`DEPLOIEMENT.md`, `MOBILE.md`, `STORES.md`, `LANCEMENT.md`, et dans les messages de l'historique git (`git log --grep`
sur « 403 », « 401 », « console », « au chargement » ; `git log -S"403"`). Les seules erreurs de chargement documentées
dans le dépôt sont **d'autres codes** : un **400** sur `user_locations` et un **404** sur `get_my_likers` (commits
`e86b548`, `36b15dc`, 2 et 8 sept.), une CSP qui bloquait un script (`4330172`, `f7e7335`, `d69d4e1`). Je signale donc
que **cette note d'août est introuvable** ; je ne peux pas dire quelles URL exactes étaient en cause.

**Ce que j'ai pu établir aujourd'hui (sans compte).**

1. **Visiteur anonyme sur l'accueil : zéro 401/403.** Les 10 requêtes (§0-19) sont toutes en 200 ; la console du
   navigateur est vide. Les erreurs récurrentes ne viennent donc **pas** de la page publique.
2. **Un jeton de session périmé ou invalide produit exactement ce couple d'erreurs**, prouvé par sonde :
   - `GET /auth/v1/user` avec un jeton invalide → **403** `bad_jwt` ;
   - `GET /rest/v1/profiles` avec un jeton invalide → **401** `PGRST301` « JWT cryptographic operation failed » ;
   - `GET /auth/v1/user` avec la clé publique comme porteur → **401** `no_authorization`.
   Un utilisateur qui **revient** sur le site avec une session périmée/révoquée dans le navigateur déclenche au
   chargement une requête Auth (**403**) puis, selon le moment du rafraîchissement, une requête de données avec l'ancien
   jeton (**401**), avant que `supabase-js` ne rafraîchisse ou ne déconnecte. Le commentaire de
   `src/lib/sessionGuard.js:1-17` décrit la même mécanique (repli sur la clé anonyme quand le rafraîchissement
   échoue). C'est l'**hypothèse la plus probable** pour « deux erreurs 401/403 au chargement sans impact ».
3. **Seconde mécanique possible (documentée, non testée aujourd'hui)** : PostgREST traduit une violation de privilège/RLS
   (`42501`) en **401 pour le rôle `anon` et 403 pour le rôle `authenticated`**. Une écriture refusée par une policy
   au chargement donnerait donc un 401 si elle part avant que la session soit prête, un 403 ensuite. Candidats par
   lecture du code : les écritures de suivi `analytics_events` (`trackActivation.js:70`) et `beta_events`
   (`SocialShell.jsx:189`, policy `to authenticated … profile_id = current_profile_id()`), le heartbeat `profiles.update`
   (`App.jsx:726-760`), l'upsert de `user_locations`. **Aucune n'est prouvée fautive** ; je n'ai pas pu exécuter d'écriture
   (tentative d'insertion anonyme de contrôle refusée par le système, à juste titre).
4. **Ce qui n'est PAS la cause** : `client_errors` et `device_push_tokens` donnent des **404** (table inconnue), pas des
   401/403 ; la CSP ne produit aucun code HTTP.

**Comment lever le doute en 5 minutes (action du propriétaire, ou de l'assistant avec un compte de test fourni
par le propriétaire).** Ouvrir le site connecté, DevTools > Network, filtrer `status-code:401` puis `403`, recharger,
noter l'URL, la méthode et la réponse JSON (`code`, `error_code`). Lecture : `bad_jwt`/`session_not_found` sur
`/auth/v1/*` = session périmée (bruit, mais à gérer proprement) ; `42501` sur `/rest/v1/<table>` = écriture refusée par
une policy (à corriger à la source). **Interdit de « corriger » en assouplissant une policy ou en donnant `anon` le droit :
la bonne correction est de ne pas émettre la requête tant que la session n'est pas prête, ou de nettoyer la session
périmée à la détection.**

---

## 10. Rapport d'avancement J0 (format demandé)

- **État initial réel** : application riche, 1652 tests verts, build OK, site en ligne sans erreur visible, mais **production en retard sur le dépôt** (SQL, fonctions), **fuites de lecture** (C1, C2), **aucun moyen de contacter l'exploitant**, IA cassée, Stripe/natif non démarrés, aucune observabilité.
- **Problèmes confirmés** : C1–C7, I1–I13 (§2–§3), dont deux **nouveaux** par sonde (C2, I3).
- **Actions réalisées (terminé)** : audit consolidé ; vérifications §0 ; 4 documents ; test de cohérence `src/native/auditDocs.test.js`. **Rien n'a été corrigé dans le produit** (phase documentaire).
- **Tests exécutés** : §0.
- **Risques restants** : voir `SYNTHESE-PHASE-1.md` §2.
- **Prochaine étape** : le propriétaire lance le bilan SQL et crée le projet de répétition (J+1) ; l'assistant rédige et teste les SQL de fermeture (C1, C2, I3).
- **État du lancement vs 15 nov.** : **tenable pour le web seul, à risque.** Voir `PLAN-LANCEMENT-15-NOV.md` (chemin critique, dates de report, GO/NO-GO).
