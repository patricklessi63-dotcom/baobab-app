# Journal des modifications

## 11–24 septembre 2026 — Messagerie temps réel, navigation mobile, fiabilité réseau (v1.1.0)

Travail autonome continu sur ~2 semaines. 65+ commits sur `main`, chaque lot
ré-audité pour régression avant de passer au suivant. Build vert, CI verte,
suite de tests passée de 450 à 552 cas.

### Messagerie temps réel

- **Accusé de lecture à 3 états** : ajout de « distribué » (2 coches grises,
  destinataire en ligne mais pas encore lu) entre « envoyé » (1 coche) et « lu »
  (2 coches bleues), jusqu'ici absent. (`acd1868`)
- **Présence en ligne fiabilisée** : `is_online` pouvait rester bloqué à
  « vrai » indéfiniment après un crash/coupure réseau (aucun événement pour le
  corriger) ; nouveau `lib/presence.js` borne la confiance accordée à 10 min
  sans heartbeat récent. (`acd1868`)
- **Messages vocaux** : deux messages ne jouent plus en même temps (mise en
  pause automatique du précédent, comportement WhatsApp). (`b221ea6`)
- **Notifications push étendues** aux likes simples et nouveaux abonnés (en
  plus des messages et matchs) — edge function + trigger SQL livrés, en
  attente de déploiement manuel. Le branchement SQL des triggers messages/
  matchs eux-mêmes n'avait par ailleurs jamais été exécuté en prod. (`13640c2`)
- Curseur de pagination sans tie-break sur l'historique de conversation
  pouvant faire disparaître définitivement un message. (`8911994`)
- Double-clic sur « Charger plus » (notifications) pouvant faire disparaître
  des notifications déjà affichées. (`9a78d7d`)

### Navigation mobile (bouton/geste retour)

- Le bouton/geste retour du téléphone quittait l'application dès le premier
  appui au lieu de revenir à l'écran précédent : nouveau système de pile
  d'historique partagée (`pushBackEntry`, `useEscapeKey.js`) branché sur la
  navigation par onglets (`goTab`/`goBack`) et sur l'inscription. Composition
  automatique avec les modales déjà ouvertes par-dessus. (`690fd90`, `16830db`)
- Revue a posteriori : purger plusieurs entrées d'un coup (fin d'inscription)
  aurait déclenché une cascade de vraies navigations arrière — corrigé avant
  tout impact utilisateur. (`5f74044`)
- Retour incohérent après avoir ouvert une conversation depuis une
  notification « Nouveau message ». (`36c09d9`)
- Flèche de retour ajoutée sur Communautés/Événements (accessibles depuis le
  menu profil, n'en avaient aucune). (`690fd90`)

### Fiabilité réseau — « échec traité comme résultat négatif confirmé »

Série de bugs où une simple coupure réseau transitoire était interprétée
comme une réponse serveur définitive :

- **Statut Premium avalé** : un échec réseau de la vérification faisait
  perdre le badge/l'accès Premium jusqu'au rechargement complet. (`e7a7cdd`)
- **Rôle admin/modérateur avalé** : même défaut, perte silencieuse de
  l'accès au tableau de bord admin pour toute la session. (`16d03ee`)
- **Perte de compte apparente** : un échec du chargement du propre profil
  renvoyait un membre existant vers l'inscription, comme si son compte
  n'avait jamais existé — le plus grave des quatre. (`4fd74c8`)
- **Candidats/matchs/likes jamais rechargés** après un échec du chargement
  initial : « Découvrir » vide, « Aucun match » affichés à tort
  indéfiniment. (`632a6ed`)
- **Message d'erreur muet sur « Gérer mon abonnement »** (signalé en prod) :
  le SDK Supabase ne met jamais le corps JSON d'une erreur HTTP dans `data`
  (il faut le relire depuis `error.context`) — la vraie raison serveur était
  systématiquement perdue derrière un « Réessaie » générique. (`9db1a85`)

### Confidentialité & sécurité

- **Fuite de ville** dans « Autour de toi » : la simple présence dans la
  liste révélait une ville masquée par l'utilisateur, même sans l'afficher
  en texte. (`d0fd728`)
- **Badge « En ligne » affiché pour un compte banni/suspendu** dans le widget
  Accueil. (`68e0bbb`)
- **Communauté orpheline** : le dernier owner/admin pouvait quitter sa
  communauté et la laisser sans personne pour la gérer — bloqué côté client,
  filet de sécurité RLS livré (non exécuté) pour couvrir un appel API direct.
  (`eb43ad4`, `08377be`)
- **Personnes bloquées invitables** à une communauté malgré le blocage.
  (`c3005fd`)
- Texte de confirmation de blocage précisé (conséquences bidirectionnelles).
  (`2555493`)

### Communautés & événements

- **Réception des invitations à un événement** (Accepter/Refuser) : les
  fonctions serveur existaient déjà mais n'étaient appelées nulle part —
  impossible de refuser une invitation, restait « en attente » pour
  toujours. (`b6c0d1b`)
- Statut de participation figé sur « liste d'attente » après une promotion
  automatique (place libérée), pouvant provoquer une désinscription
  accidentelle en cascade. (`a878d6f`)
- Bouton « Modifier » resté actif sur un événement annulé, provoquant des
  notifications contradictoires. (`75d4206`)
- Doubles suppressions possibles sur la modération de contenu (post/
  commentaire par un modérateur, événement/message par un organisateur).
  (`bbc020b`, `12cc368`)
- Doubles envois de commentaire (communauté et fil) sur clic/Entrée rapide.
  (`10b05fb`, `9ed183b`)
- Pollution de liste par une pagination en retard après un changement de
  filtre (communautés/événements). (`cb3cbbe`)

### Autres corrections

- **Fuseau horaire des événements** : les heures composées le jour d'un
  changement heure d'été/hiver étaient décalées d'1h en base (bug DST dans
  `zonedInputsToUtc`). (`652dcf5`)
- **Recherche insensible aux accents** manquante dans messages, conversations,
  actualités et emojis (« Rene » ne trouvait pas « René »). (`3220c42`, `5b0537f`)
- CSP en production bloquait silencieusement la pause d'animation en
  arrière-plan. (`f7e7335`)
- Contraste WCAG des icônes or (badges Crown/Gem/étoiles) et perte de focus
  clavier à la fermeture des menus (emoji, pièces jointes, notifications,
  profil). (`d1c4f2e`, `c91a1a3`)
- SEO de base : `robots.txt`, `sitemap.xml`, `og:url`/canonical,
  `og:image` absolue. (`9854b70`)
- Débordements et cibles tactiles mobiles (audit responsive). (`ba3e737`)
- Champs obligatoires marqués + bouton désactivé tant qu'invalide (édition
  de profil), cohérent avec les formulaires événements/communautés déjà
  conformes. (`17e4aa4`)


## 10 septembre 2026 (après-midi) — Identité 4.0 : le vert remplace l'orange

Direction validée (proposition : `claude.ai/code/artifact/a56e8049…`). L'orange
terracotta `--bb-clay #C1613D` est retiré de toute l'interface.

- **Accent unique = vert feuille** `--bb-leaf #1F7A5A` (5,3:1 sur blanc, WCAG AA).
  `--bb-leaf-light #3FB37E` pour le décor non-textuel (halo « en ligne », points
  « écrit… »). `--bb-leaf-deep #185C43` pour survol/pressé.
- **CTA** (Auth, landing, boutons d'envoi, `.bb-btn-heart`, cœurs match) : orange → vert.
- **Bulles de messagerie envoyées** : dégradé or→orange → aplat vert feuille, texte blanc.
- **Dégradés** : `--bb-gold-2` #C1613D → #C98A2E (ambré) ; couvertures de cartes
  `or→corail` → `or→vert` ; barres de progression onboarding/profil.
- **Corail confiné aux alertes** : tous les états d'erreur / danger passent en
  `--bb-coral-text #C0392B` (réactif) ou `coralTextStatic` (écrans crème fixe).
- **Contour de focus clavier** : `--bb-clay` → `--bb-leaf` (24 fichiers).
- **`--bb-clay` / `C.clay` entièrement supprimés.**
- **Logo** : `BaobabLogo.jsx` SVG (canopée 5 cercles, tronc évasé, racines en
  tripode, fruit or) remplace l'emoji 🌳.
- **Messagerie vivante** : pastille « en ligne » qui pulse, « écrit… » à 3 points
  animés, fondu `bb-fade-in` sur les nouvelles bulles — coupés par `prefers-reduced-motion`.
- **Profil** : grille « Explorer » (doublon de la barre d'onglets) supprimée ;
  barre d'onglets rendue clairement défilable sur mobile (dégradés de bord,
  recentrage de l'onglet actif) ; ordre revu (Communautés/Événements remontés).
- **Onglet Abonnement** : avantages réels + 2 prix visibles + CTA vers la page
  complète (au lieu de « Tu es sur le plan gratuit » seul).
- **Accueil** : carte unique → 2 cartes Communautés / Événements.
- **Bouton « Inviter ma communauté »** (Rencontres) : donnait l'impression de ne
  rien faire → partage natif / copie du lien avec confirmation visible.

Reste optionnel : l'illustration `baobab-canada-bg.svg` garde un `#C1613D` dans
son dégradé de coucher de soleil (décor, pas du chrome d'interface).


## Session du 9–10 septembre 2026 — diagnostic complet, perf, accessibilité, tests

Travail autonome. ~40 commits sur `main` (Vercel redéploie automatiquement).
Build vert, CI verte, chaque lot ré-audité pour régression.

### Base de données (à exécuter dans Supabase — voir `DEPLOIEMENT.md`)

| Fichier | Objet |
|---|---|
| `supabase-COMBINED-pending-fixes.sql` | **Exécuté en prod.** 44+ correctifs : bypass d'autorisation par NULL, gardes RLS d'état de compte (banni/suspendu, onboarding incomplet, suppression en attente) et de blocage sur tout le contenu généré, protection des colonnes de confiance à l'inscription, limites de longueur, buckets Storage, 3 tâches cron. Rendu tolérant aux fonctions absentes ; se répare tout seul en fin de fichier. |
| `supabase-combined-supersede-order-regression-fix.sql` | **Exécuté en prod.** Rattrape 3 régressions laissées par le script consolidé (sections SUPERSEDED dont le DDL écrasait en dernier des correctifs plus récents). |
| `DEPLOIEMENT.md` | Runbook des actions manuelles restantes. |

**Reste à faire (côté Patrick, terminal + CLI Supabase) :** déployer les edge functions `cleanup-expired-stories` (simple, sans secret) et `stripe-webhook` (nécessite les clés Stripe). Toujours en 404. Sans `stripe-webhook`, la synchro Premium/abonnements ne se fait pas automatiquement après paiement. Voir `DEPLOIEMENT.md`.

### Bugs corrigés

- **Premium** : au retour d'un paiement Stripe, la revérification du statut s'auto-annulait avant son 1er tick → bannière « confirmation en cours » bloquée indéfiniment. (`0bb3679`)
- **Notifications temps réel** : non dédupliquées → badge cloche gonflé durablement. Puis une régression de ce correctif (incrément dans un `setState` imbriqué non idempotent, rejoué par React) également corrigée. (`859e8ff`, `6accb66`)
- **Graphe social** : likes/matches/blocages reçus hors ligne non rattrapés au retour réseau ; ajout d'un resync ciblé sans le `loadAll()` complet. (`c5225af`)
- **Composer de publication** : média « fantôme » réapparaissant si la fenêtre était fermée pendant la validation/compression asynchrone. (`89a3711`)
- **Formulaire événement** : la détection de saisie non enregistrée ignorait durée et nombre max de participants. (`a91b48a`)
- **Onboarding** : une étape pouvait être soumise deux fois par double-tap → lignes de photos en double / double `onboarding_completed_at`. (`1d7bef1`)
- **Édition de profil** : possibilité de supprimer sa dernière photo → profil sans image partout. (`e206037`)
- **Communautés/événements** : pagination « Charger plus » masquée sur l'accueil neutre → bloqué à 20 éléments. (`319c623`)
- **Découverte** : pagination « Afficher plus » non réinitialisée au changement de filtre/tri. (`86d0f78`)
- **DOM invalide** : `<button>` imbriqué dans un `<button>` sur la carte de communauté et la tuile de statut du fil. (`29d646f`, `6ada2ec`)
- **Notification push** : `client.navigate()` non gardé + focus sur un onglet arbitraire. (`841ec95`)

### Performance

Chunk principal **911 kB → 404 kB** (−55 %, 251 → 115 kB gzip). L'avertissement Vite « chunk > 500 kB » a disparu.

- Vendor chunks séparés : `vendor-react` (142 kB), `vendor-supabase` (220 kB), `vendor-icons` (48 kB) — meilleur cache entre déploiements. (`c7465a0`)
- Chargement à la demande : écran d'auth, onboarding, édition de profil, pages légales (`3bea942`) ; 6 modales secondaires de `SocialShell` (`6f9a06a`) ; répertoires d'organismes sortis du commun (`73dc5bc`).
- `rollup-plugin-visualizer` disponible via `ANALYZE=1 npm run build`.

### Accessibilité & contraste

- `role="alert"` sur 8 messages d'erreur muets pour les lecteurs d'écran ; `aria-label` sur boutons icône-seule et champs de recherche. (`7674c39`, `5211852`)
- Contraste WCAG AA : 8 paires texte/fond estompé en mode sombre (`bc7866f`) ; jeton réactif `--bb-coral-text` (#C0392B clair / #E56B5D sombre) pour le corail utilisé comme couleur de texte, 35 fichiers migrés (`f75efc8`, `cf424e7`, `df18009`) ; classe `.bb-btn-danger` pour les boutons « texte blanc sur fond corail » (`9c48fe5`, `58dd991`).
- Focus trap / Échap / `role="dialog"` : déjà en place partout (hooks `useFocusTrap` / `useEscapeKey`), vérifié.

- Icône PWA « maskable » : `public/icon-512-maskable.png` (logo réduit à 78 %, centré sur fond #14432A) généré par `scripts/generate-maskable-icon.mjs` (codec PNG maison, zéro dépendance — `npm run icons:maskable`), ajouté au manifest. (`5eb2e35`)

### Tests (nouveau — le projet n'en avait aucun)

- **Vitest** + **335 tests** (293 de logique pure + 42 de composant via jsdom/Testing Library). `npm test`. (`e27071a` … `cfd01d2`)
- Couverture : échappement des requêtes PostgREST (sécurité), `matchKey`/troncature Unicode, algo de matching, garde-fous géo, force du mot de passe, mapping des erreurs FR, validation média, linkify (XSS), rate-limit, permissions/config communautés & événements, export calendrier, comparaison de versions ; modales de confirmation, `ChunkErrorBoundary`, carte communauté au clavier, garde anti-double-submit onboarding.
- **Workflow CI GitHub Actions** (`.github/workflows/ci.yml`) : `npm test` + `npm run build` sur chaque push/PR, Node 22. (`bb027c8`, `ea2a0b1`)
- Aucun bug révélé par les tests — la logique pure du projet est écrite très défensivement.
