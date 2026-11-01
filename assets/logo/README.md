# Logo Baobab « Horizon »

Un baobab simplifié : tronc en bouteille ivoire, cinq branches principales qui se divisent
en deux niveaux et finissent en nœuds menthe, racines braise, soleil braise vers corail derrière.

Ces SVG sont GÉNÉRÉS : ne pas les éditer à la main. La source unique est
`src/components/baobabMark.js` (géométrie), `baobabMarkSvg.js` et `baobabWordmark.js`.
Pour tout régénérer (SVG, icônes web, sources natives, ressources Android) : `npm run assets:logo`,
puis `npm run assets:android` et `npm run assets:ios` pour les projets natifs. Un test
(`src/native/logoAssets.test.js`) échoue si un fichier du dépôt s'écarte du générateur.

## Usage

| Fichier | Quand l'utiliser |
| --- | --- |
| `baobab-mark.svg` | Marque seule sur fond sombre (nuit, canopée). Version de référence. |
| `baobab-mark-light.svg` | Marque seule sur fond clair (ivoire) : tronc canopée, couronne sève, racines corail. |
| `baobab-mark-mono.svg` | Une seule couleur (`currentColor`), traits épaissis : icône de notification Android, couche monochrome Android 13, tampon, impression une couleur. |
| `baobab-wordmark.svg` / `-light.svg` | Marque + mot BAOBAB, pour fond sombre / clair. |

Dans React : `<BaobabLogo size={32} />` (décoratif), `<BaobabLogo title="Baobab" />` (nom
accessible), `palette="light"` sur fond ivoire, `variant="mono"` pour une couleur.

Le mot BAOBAB est dessiné en tracés vectoriels (lettres larges, graisse extra-grasse dans
l'esprit de Syne 800) : ce n'est PAS le tracé exact de Syne, la police n'étant pas disponible
dans le dépôt. Si Syne ExtraBold est fournie, remplacer les lettres de `baobabWordmark.js` par
ses contours.

## Couleurs (palette Horizon, liste blanche testée)

| Rôle | Couleur |
| --- | --- |
| Fond | nuit `#060B09` (lueur canopée `#0F2B21`) |
| Tronc (fond sombre) | ivoire `#F3EEE4` |
| Canopée, nœuds (fond sombre) | menthe `#62F0BA` |
| Racines, ligne d'horizon (fond sombre) | braise `#F2A33A` |
| Soleil | dégradé braise `#F2A33A` vers corail `#EA5F4B` |
| Fond clair | ivoire `#F3EEE4` ; tronc canopée `#0F2B21`, couronne sève `#1F7A5A`, racines corail `#EA5F4B` |

Aucune autre couleur dans la marque.

## Zone de protection

Laisser autour de la marque un vide d'au moins 1/8 de sa largeur (soit environ 45 unités sur la
grille de 512), sans texte ni bord. Pour une icône d'application, la marque occupe 70 à 84 % de
la hauteur du carré ; pour l'icône « maskable » PWA et l'avant-plan adaptatif Android, elle reste
dans un cercle centré (80 % du côté pour la PWA ; 64 % du côté pour l'avant-plan adaptatif
Android et la couche monochrome, sous le cercle sûr de 66 %).

## Tailles minimales

- Marque en couleur : 24 px de haut (lisible comme arbre + soleil dès 16 px, sans détail des
  sous-branches).
- Marque monochrome : 24 dp (icône de notification Android), traits déjà épaissis.
- Logo avec mot BAOBAB : 120 px de large.
- Icône du store : fournie en 1024 x 1024 sans canal alpha (App Store) et 512 x 512 (Google Play),
  dans `assets/store/`.
