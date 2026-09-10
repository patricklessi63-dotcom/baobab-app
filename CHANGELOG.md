# Journal des modifications

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
