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
