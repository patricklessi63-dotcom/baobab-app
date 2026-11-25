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

- **Accessibilité du fil** (`local_e774b28a…`, ce commit) : onglets de filtre au clavier (un seul arrêt de tabulation,
  flèches / Début / Fin, activation par Entrée ou clic : pas de requête à chaque flèche) ; menu de réactions nommé
  « Réactions », le focus y entre (sur ma réaction, sinon la première) et les flèches le parcourent ; bouton des
  commentaires avec `aria-expanded` ; suggestions de mention annoncées (`aria-controls` + `aria-activedescendant`, plus
  de bouton imbriqué dans une option) ; « Chargement... » en `role="status"`. Nouveau `src/lib/rovingFocus.js` (+ test).
  Tests : 94/94 sur le fil et les commentaires.
- **Recommandations** (`local_e774b28a…`, ce commit) : une ville (ou un pays) faite seulement d'espaces comptait comme
  « même ville » : +3 points et « À    , comme toi » (communautés, événements), +10 points et filtre « Ma ville uniquement »
  satisfait à tort (Rencontres), « Vous êtes tous les deux à    ! » (idées de premier message). Correctif commun
  `samePlaceText` (`src/lib/searchQuery.js`), utilisé par `matchingService.js`, `communities/recommendations.js`,
  `events/recommendations.js`, `ConversationStarters.jsx` ; 7 tests de non-régression. **Même motif restant hors de
  ma zone** (signalé à la coordination) : `CommunitiesTab.jsx` et `EventsTab.jsx` (« Près de toi »), `SocialShell.jsx`
  (filtre par ville) — une ville vide n'y matche que d'autres villes vides, effet mineur.
- **Fil** (`local_e774b28a…`, commit `0204352`) : le bandeau « N nouvelles publications » respecte le filtre affiché
  (Abonnements : auteurs suivis seulement ; Populaires et Photos : pas d'annonce de publications que le fil ne montrera
  pas). `countsTowardNewPostsBanner` dans `src/lib/feedFilters.js`, 3 tests ; 65/65 sur le fil.
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
