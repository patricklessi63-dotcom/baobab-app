# Journal de travail — mandat autonome du 25 novembre au 25 décembre 2026

Journal commun à toutes les sessions Claude qui travaillent sur Baobab. Une ligne par action vérifiée,
la plus récente en haut de chaque section. On n'y écrit « fait » qu'avec une preuve (commit, test, contrôle).

## Mandat

Donné par le propriétaire le 25 novembre 2026, valable jusqu'au 25 décembre 2026 inclus : analyser, corriger,
améliorer, tester et déployer sans validation individuelle pour les opérations techniques ordinaires.
Restent soumis à son accord explicite : opérations financières, achats, abonnements payants, changements de
propriété, suppressions définitives de données, autorisations sensibles.

## Coordination

- **Responsable de coordination** : session « Fix remove_community_member » (`local_c5b0c767…`). Elle tient ce
  journal et la répartition ; toute session qui prend un chantier l'annonce avant de commencer.
- **Répartition au 25 novembre** :

| Session | Chantier |
| --- | --- |
| Coordination (`local_c5b0c767…`) | journal, répartition, communautés et événements côté client, relecture des SQL |
| « show_birth_year » (`local_f49a575b…`) | audit global (tests, build, dépendances, lint), régressions, performance du paquet principal, console admin |
| « Fix duplicate event… » (`local_bafa9cbe…`) | événements, médias, stockage ; Premium, Stripe, IA |
| « emoji / recommandations » (`local_e774b28a…`) | découverte, fil, recommandations |

## Règles communes (inchangées)

1. **SQL et déploiement en production** : seulement si le propriétaire **nomme le fichier** (le classifieur
   refuse « exécute tout ») ; une seule session exécute à la fois (annonce, puis message de fin) ; contrôle en
   lecture seule avant et après ; consignation dans `LANCEMENT.md`.
2. **Aucune sauvegarde de la base n'existe** (offre gratuite, critère O1 non rempli, `SAUVEGARDE.md`) : tout SQL de
   production est donc additif et réversible, rejoué d'abord sur le projet de répétition.
3. `git fetch origin main` juste avant chaque push, avance rapide uniquement, jamais de push forcé.
4. Jamais de mot de passe, de clé ou de secret saisi ou écrit dans le dépôt.
5. Pas de doublon : annoncer sa zone (fichiers) avant d'écrire du code.

## État de départ (25 novembre 2026)

- `origin/main` = `d6380b8` (aucun commit entre le 13 et le 25 novembre).
- Production : SQL-1 à 15 et SQL-22 à 42 exécutés, ainsi que `supabase-profile-report-minor-constraint-fix.sql` et
  `supabase-report-statuses.sql` (5 novembre). Détail : `LANCEMENT.md` (en-tête et §7, catégorie A). L'en-tête de
  `LANCEMENT.md` les disait encore « non exécutés » : corrigé le 25 novembre.
- Dépendances : `npm audit --omit=dev` → 0 vulnérabilité ; mises à jour mineures disponibles (Capacitor 8.6,
  supabase-js 2.119, PGlite 0.5.17…), majeures non engagées (React 19, Vite 8, Vitest 5, Tailwind 4).

## Actions qui attendent le propriétaire

Ces actions ne peuvent pas être faites par une session : il faut une intervention humaine.

| Action | Pourquoi | Comment |
| --- | --- | --- |
| Première sauvegarde de la production | Aucune sauvegarde n'existe | `SAUVEGARDE.md` (mot de passe de la base requis) |
| Test de bout en bout à deux vrais comptes | Seule preuve réelle de la messagerie en production | `TEST-PRODUCTION-DEUX-COMPTES.md` |
| SMTP, DNS de `baobab-app.ca`, adresse de contact, textes légaux | Inscriptions et conformité | `LANCEMENT.md` §0 et §9 |
| Reconstruire les apps natives | Elles embarquent l'ancien code | `MOBILE.md` |

## Journal

### 25 novembre 2026

- **Tests autonomes** (coordination) : `vite.config.js` fournit des valeurs factices de `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` et `VITE_VAPID_PUBLIC_KEY` quand l'environnement n'en a pas (une vraie valeur reste prioritaire).
  Avant, 16 fichiers de test échouaient dans tout dossier sans `.env` (« supabaseUrl is required »), signalé par `local_e774b28a…`.
- **« Près de toi » / « Autour de toi »** (coordination, suite du correctif recommandations de `local_e774b28a…`) : une
  ville faite d'espaces des deux côtés comptait comme la même ville. `CommunitiesTab.jsx`, `EventsTab.jsx` (ligne de la
  section seulement, annoncé à `local_bafa9cbe…`) et `SocialShell.jsx` (`nearbyMembers`) passent par `samePlaceText`.
  Garde-fou `src/native/samePlaceUsage.test.js` (vérifié par mutation : échoue avec l'ancien `EventsTab.jsx`).

- **SQL-43 livré, NON exécuté** (`local_bafa9cbe…`) : `supabase-community-media-mod-delete.sql`. Le média d'une publication
  de communauté supprimée par un **modérateur** restait orphelin dans le bucket `community-media` (policy Storage DELETE
  réservée au propriétaire du fichier, alors que la policy de `community_posts` autorise le modérateur). La policy devient
  « propriétaire OU modérateur de la communauté du dossier ». Test PGlite `src/native/communityMediaModDelete.test.js`
  (11 cas, défaut reproduit avant, 2 mutations détectées). Fiche et inventaire dans `LANCEMENT.md`. **Pour l'exécuter, le
  propriétaire doit nommer le fichier** ; à rejouer d'abord sur la répétition. Les fichiers déjà orphelins se listent avec la
  requête en lecture seule du bas du fichier (nettoyage ensuite par l'API Storage).

- **Accessibilité du fil** (`local_e774b28a…`, commit `1d39f23`) : onglets de filtre au clavier (un seul arrêt de tabulation,
  flèches / Début / Fin, activation par Entrée ou clic : pas de requête à chaque flèche) ; menu de réactions nommé
  « Réactions », le focus y entre (sur ma réaction, sinon la première) et les flèches le parcourent ; bouton des
  commentaires avec `aria-expanded` ; suggestions de mention annoncées (`aria-controls` + `aria-activedescendant`, plus
  de bouton imbriqué dans une option) ; « Chargement... » en `role="status"`. Nouveau `src/lib/rovingFocus.js` (+ test).
  Tests : 94/94 sur le fil et les commentaires.
- **Recommandations** (`local_e774b28a…`, commit `1d39f23`) : une ville (ou un pays) faite seulement d'espaces comptait comme
  « même ville » : +3 points et « À    , comme toi » (communautés, événements), +10 points et filtre « Ma ville uniquement »
  satisfait à tort (Rencontres), « Vous êtes tous les deux à    ! » (idées de premier message). Correctif commun
  `samePlaceText` (`src/lib/searchQuery.js`), utilisé par `matchingService.js`, `communities/recommendations.js`,
  `events/recommendations.js`, `ConversationStarters.jsx` ; 7 tests de non-régression. **Même motif restant hors de
  ma zone** (signalé à la coordination) : `CommunitiesTab.jsx` et `EventsTab.jsx` (« Près de toi »), `SocialShell.jsx`
  (filtre par ville) — une ville vide n'y matche que d'autres villes vides, effet mineur.
- **Fil** (`local_e774b28a…`, commit `0204352`) : le bandeau « N nouvelles publications » respecte le filtre affiché
  (Abonnements : auteurs suivis seulement ; Populaires et Photos : pas d'annonce de publications que le fil ne montrera
  pas). `countsTowardNewPostsBanner` dans `src/lib/feedFilters.js`, 3 tests ; 65/65 sur le fil.
- **Performance** (`local_f49a575b…`, commit `f7cdff5`) : `ProfileTab` et `ConversationPane` chargés à la demande
  (ChunkErrorBoundary + Suspense, conversation préchargée à l'affichage de Messages) ; fichier principal 550 → 439 ko
  minifiés. Tests : 22 fichiers touchés et 188 tests voisins verts, build OK. Non vérifié sur des écrans connectés.
- **Sécurité — photos d'événements** (`local_bafa9cbe…`) : liens signés de la galerie `event-media` ramenés de 30 jours à
  24 h (déjà re-signés à chaque chargement, aucun effet sur l'affichage) ; un participant retiré d'un événement privé ne
  garde plus l'accès 30 jours. Durée commune `src/lib/mediaUrlTtl.js` (aussi utilisée par les médias de communauté),
  garde-fou `src/lib/mediaUrlTtl.test.js` (3 tests, échoue si 30 jours est remis : mutation vérifiée). Fichier touché :
  `EventsTab.jsx` (constante seulement, annoncé au coordinateur). Tests liés 15 fichiers / 35 tests verts ; build OK.
- **Sécurité — médias des communautés** (`local_bafa9cbe…`) : faille corrigée. `community_posts.media_url` recevait une
  URL signée valable **5 ans** (bucket privé `community-media`) ; une URL signée ne se révoque pas, donc un membre exclu
  d'une communauté privée gardait l'accès à la photo ou à la vidéo pendant 5 ans, et un média que le modérateur n'avait pas
  pu supprimer du Storage restait consultable. Désormais le lien enregistré vit 24 h et la liste re-signe les médias à
  chaque chargement (la policy du bucket revérifie membre / communauté publique). Format d'URL inchangé : la suppression de
  compte (`process-scheduled-deletions`) reste compatible, aucun SQL ni redéploiement. Fichiers :
  `src/lib/communities/communityMedia.js` (+ 7 tests), `src/components/social/CommunitiesTab.jsx`,
  `CommunitiesTab.mediaResign.dom.test.jsx` (test qui échoue si la re-signature est retirée : mutation vérifiée).
  Suite complète : 342/344 fichiers verts au premier passage, les 2 échecs (`haptics`, `nativeBack`, non modifiés)
  passent seuls (11/11) : délai sous charge. Build OK. **Limites** : les publications déjà enregistrées gardent en base
  leur ancien jeton de 5 ans (non révocable sans rotation de la clé JWT) ; la liste ne le montre plus. Couvertures
  d'événements (`event-covers`, même durée de 5 ans) : **non modifiées**, risque faible accepté (seule la couverture d'un
  événement privé est en jeu, et un lien court casserait les cartes d'événements publics partagées en message).
- **Linter** (coordination) : ESLint 9 ajouté (`eslint.config.js`, script `npm run lint`, étape dans `.github/workflows/ci.yml`).
  Règles de bogue certain en erreur (variable non définie, règle des hooks, JSX non défini), le reste en avertissement.
  État : **0 erreur**, 67 avertissements (variables inutilisées, dépendances de hooks) à traiter progressivement.
- **Bogue critique corrigé — inscription bloquée** (coordination) : depuis `5d6b0ec` (3 novembre), l'étape « Parcours au
  Canada » de l'inscription lisait `user?.arrived_since`, variable inexistante → `ReferenceError`, message « Une erreur est
  survenue », personne ne pouvait dépasser cette étape. Corrigé (`currentUser`) dans `src/screens/onboarding/OnboardingWizard.jsx` ;
  test de régression dans `OnboardingWizard.dom.test.jsx` (échouait avant, passe après). Commit `1d7cad3`.
  **Vérifié en ligne** : le site sert `OnboardingWizard-Cym0veya.js`, qui lit la variable du profil connecté (plus de `user`
  libre). Non vérifié : une vraie inscription de bout en bout (aucun compte de test en production).
- **Bogue corrigé — plantage de l'onglet Messages** (coordination) : depuis `561ed64` (1er novembre), `useKeyboardViewport`
  était appelé après le retour anticipé de la liste vide ; passer de 1 conversation à 0 (blocage) ou de 0 à 1 (première
  connexion en direct) faisait planter l'écran (« Rendered fewer/more hooks »). Corrigé dans `MessagesTab.jsx` ; test
  `MessagesTab.hooksOrder.dom.test.jsx` (2 tests, échouaient avant).
- **Performance** (`local_e774b28a…`, commit `fa73a30`) : l'onglet Rencontres (`DiscoverTab`) se charge à la demande ;
  fichier principal 570 → 550 ko minifiés. Fichiers : `src/components/SocialShell.jsx`, `src/components/SocialShell.lazyTabs.test.js`
  (6 tests). Vérifié en ligne par la session : le site charge `DiscoverTab-*.js` à part. Suite : bannière « nouvelles
  publications » du fil incohérente avec les filtres, puis audit des recommandations.
- **Tests** (`local_f49a575b…`, commit `f1c23c9`) : `pushNotifications.webUnchanged` ne dépend plus de la clé VAPID de
  l'environnement. Son audit : 2824/2825 en suite complète (seul échec : `SocialShell.dom` « popstate », 5/5 seul,
  délai sous charge) ; build OK ; 0 vulnérabilité ; **aucun linter configuré** (pas d'`eslint.config`, pas de script `lint`).
- **Attribué** à `local_f49a575b…` : chargement différé de `ProfileTab` et `ConversationPane` (après `fa73a30`, une seule
  session à la fois sur `SocialShell.jsx`).
- **Audit de base sur `d6380b8`** (coordination) : build OK ; suite complète **2825 tests / 342 fichiers, tous verts**.
- **Documentation** : en-tête de `LANCEMENT.md` corrigé (les deux SQL de signalement du 5 novembre y étaient encore
  « non exécutés » alors que le §7 les prouve exécutés ; SQL-26, 34, 37 à 40 et 42 ajoutés à l'état de la production).
- Coordination : rôle de coordinateur convenu avec `local_f49a575b…` ; répartition ci-dessus envoyée aux sessions actives.
- Audit des dépendances : 0 vulnérabilité en production (`npm audit --omit=dev`).
