# Baobab — applications mobiles (Android + iOS) avec Capacitor

Ce document décrit comment le même code React/Vite que le site web est
empaqueté en applications Android (et plus tard iOS) avec
[Capacitor](https://capacitorjs.com). Le site web (Vercel) n'est **pas**
modifié : `npm run build` reste `vite build`.

## Stratégie

- **Approche** : Capacitor. L'app native embarque le build web (`dist/`) dans une
  WebView ; elle ne charge **pas** le site Vercel (aucun `server.url`).
- **Identifiant d'application** : `ca.baobab.app` (package Android **et** bundle id iOS).
- **Nom affiché** : « Baobab ».
- **Backend** : le même Supabase que le web (client JS inchangé).

## État d'avancement

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Capacitor + projet Android qui se synchronise, désactivation propre du Web Push en natif | **Fait** (ce document) |
| 2 | Adaptation UI mobile (zones sûres, hauteurs, cibles tactiles, tirer pour rafraîchir, barre d'état, splash, icônes, orientation) | **Fait** (section « Étape 2 » en bas ; bouton retour Android → étape 3) |
| 3a | Notifications push natives (FCM Android / APNs iOS), présence, liens profonds (App Links / Universal Links), e-mails d'authentification | **Fait** (section « Étape 3a » en bas ; reste à faire par le propriétaire : voir son tableau) |
| 3b | Caméra/photos, géolocalisation, partage, retour haptique, bouton retour Android | **Fait** (section « Étape 3b » en bas ; biométrie documentée, non implémentée) |
| 4 | Préparation des stores (fiches, signature, politique de confidentialité, paiements…) | À faire |
| 5 | iOS + CI (builds Android/iOS automatisés) | À faire |

## Versions (vérifiées le 6 octobre 2026)

| Élément | Valeur | Source |
| --- | --- | --- |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` | **8.5.2** (dernière stable : `npm view @capacitor/core version`) | registre npm |
| Node | ≥ 22 (déjà exigé par `package.json`) ; installé ici : 24.19.0 | https://capacitorjs.com/docs/getting-started/environment-setup |
| Android Studio | **2025.2.1 minimum** pour Capacitor 8 | idem |
| JDK | pas d'installation séparée requise : Android Studio fournit le bon JDK | idem |
| Android SDK | API 24 minimum, dernière stable API 36 (Android 16) | idem |
| Xcode (étape 5) | 26.0 minimum, Swift Package Manager par défaut (CocoaPods optionnel) | idem |
| Android Gradle Plugin / Gradle wrapper | 8.13.0 / 8.14.3 (générés par Capacitor 8.5.2) | `android/build.gradle`, `android/gradle/wrapper/gradle-wrapper.properties` |
| `minSdkVersion` | **24** (valeur de Capacitor 8) | `android/variables.gradle` |
| `compileSdkVersion` / `targetSdkVersion` | **36** | `android/variables.gradle` |

**targetSdk exigé par Google Play** : à partir du **31 août 2026**, les nouvelles
apps et les mises à jour doivent cibler **Android 16 (API 36)** ou plus
(extension possible jusqu'au 1er novembre 2026 via la Play Console). Source :
https://developer.android.com/google/play/requirements/target-sdk . Le projet
cible déjà l'API 36.

## Fichiers

- `capacitor.config.json` : `appId`, `appName`, `webDir: "dist"`,
  `server.androidScheme: "https"` (valeur par défaut de Capacitor ≥ 6, gardée
  explicitement). Pas de `server.url`.
- `android/` : projet Android natif, **versionné**. Les fichiers générés par
  `cap sync` (`app/src/main/assets/public`, `capacitor.config.json` copié,
  `capacitor.plugins.json`, `res/xml/config.xml`, `capacitor-cordova-android-plugins`)
  sont ignorés par git.
- `src/lib/platform.js` : `isNative()` et `getPlatform()` (`"web" | "android" | "ios"`).
- `scripts/android-gradle.mjs` : lance `gradlew`/`gradlew.bat` de façon portable.

## Scripts npm

| Commande | Effet |
| --- | --- |
| `npm run build` | **inchangé** (`vite build`) — c'est ce que Vercel exécute |
| `npm run cap:sync` | `vite build && cap sync` : reconstruit le web et copie dans les projets natifs |
| `npm run cap:open:android` | ouvre `android/` dans Android Studio |
| `npm run android:build:debug` | `gradlew assembleDebug` → APK de debug (`android/app/build/outputs/apk/debug/`) |
| `npm run android:build:release` | `gradlew bundleRelease` → AAB pour Google Play ; **nécessite une signature** (voir plus bas) |

## Lancer l'app Android

Prérequis : Android Studio ≥ 2025.2.1 (qui installe le JDK) et le SDK Android 36
(via le SDK Manager). Ensuite :

```
npm install
npm run cap:sync
npm run cap:open:android     # puis « Run » sur un émulateur ou un téléphone
```

ou, en ligne de commande (SDK/JDK configurés, `ANDROID_HOME` défini) :
`npm run cap:sync && npm run android:build:debug`.

À chaque modification du code web : relancer `npm run cap:sync`.

## Versions de l'app : versionName / versionCode

Dans `android/app/build.gradle` :

- `versionName` = champ `version` de `package.json` (actuellement **1.1.0**). À
  mettre à jour à la main en même temps que `package.json`.
- `versionCode` = entier **strictement croissant**, **1** actuellement. Google
  Play refuse tout envoi dont le `versionCode` n'est pas supérieur au précédent :
  l'incrémenter de 1 à **chaque** envoi (même d'un test interne), jamais le
  réutiliser. (Automatisation possible via la CI à l'étape 5.)

## Signature (release) — jamais dans le dépôt

- Aucun keystore, `.jks`, `.p12`, `.p8`, `.pem`, `keystore.properties` n'est
  versionné ; ces motifs sont dans `.gitignore` (racine et `android/.gitignore`).
- Le build **debug** est signé automatiquement avec la clé de debug locale.
- Le build **release** (`bundleRelease`) produira un AAB non signé tant qu'aucune
  configuration de signature n'existe. La clé d'envoi et la configuration
  (Play App Signing recommandé) seront préparées à l'étape 4 ; la clé doit être
  conservée par le propriétaire (hors dépôt, sauvegardée).
- `android/app/google-services.json` (Firebase/FCM, étape 3) : **non ignoré par
  décision** — il ne contient que des identifiants publics de projet (pas de clé
  privée) et la CI en aura besoin pour construire. À réviser si le propriétaire
  préfère l'injecter comme secret de CI.

## Ce que l'étape 1 change dans le code web

- `src/lib/pushNotifications.js` : `isPushSupported()` renvoie `false` et
  `isIosNotInstalled()` renvoie `false` quand `isNative()` est vrai. Conséquence :
  en natif, aucun service worker (`/sw.js`) n'est enregistré, aucun appel Web Push,
  aucune erreur console ; l'UI traite l'appareil comme « notifications non prises
  en charge ». Notifications natives (FCM/APNs) : **étape 3**.
- Sur le web, comportement strictement identique (tests existants verts).
- Taille du bundle principal : 461 884 o → 470 311 o (+8,4 ko brut, ≈ +3 ko gzip :
  `@capacitor/core`). Aucun plugin natif lourd n'est inclus.

## Points ouverts (à traiter par le propriétaire / étapes suivantes)

1. **Origine de la WebView** : en natif Android, l'app tourne sur
   `https://localhost` (`androidScheme: "https"`). Les requêtes vers Supabase
   (`https://*.supabase.co`) sont cross-origin depuis cette origine.
2. **CORS des edge functions** : `supabase/functions/_shared/cors.ts` renvoie
   `Access-Control-Allow-Origin: "*"`. L'origine `https://localhost` est donc déjà
   acceptée ; **aucune liste d'origines à compléter**, aucune modification faite.
   (Si le propriétaire restreint un jour CORS à une liste, il devra y ajouter
   `https://localhost` pour Android ; pour iOS (étape 5) selon le schéma choisi,
   `capacitor://localhost` par défaut.) PostgREST/Auth/Realtime/Storage de Supabase répondent avec un CORS permissif par défaut (comportement standard de Supabase, non testé ici)
   .
3. **Redirections d'e-mail** (**traité à l'étape 3a** : `linkOrigin()`, voir en bas ; texte ci-dessous = constat initial) : `src/Auth.jsx` construit `emailRedirectTo`
   (confirmation d'inscription, renvoi de confirmation) et `redirectTo`
   (réinitialisation de mot de passe) avec `window.location.origin`. En natif cela
   donnerait `https://localhost/...`, adresse **absente de la liste « Redirect URLs »
   de Supabase** : Supabase retombe alors sur le « Site URL » (le site Vercel), donc
   le lien ouvre le **site web dans le navigateur**, pas l'app. Le compte est bien
   confirmé / le mot de passe réinitialisable via le web, mais l'app ne s'ouvre pas
   avant les **deep links (étape 3)** ; après cela, il faudra aussi remplacer
   `window.location.origin` par une URL publique fixe en natif et l'ajouter aux
   « Redirect URLs » Supabase. Non modifié à l'étape 1 (web inchangé).
4. **Autres usages de `window.location.origin` en natif** (invitation et partage de profil : **traités à l'étape 3a** ; reste le retour Stripe) : (à corriger étape 2/3) :
   le lien d'invitation de `src/components/social/DiscoverTab.jsx` (donnerait
   `https://localhost/`) ; le retour Stripe (`SITE_URL` côté edge functions,
   redirection vers le site web). **Paiements** : Premium via Stripe dans une app
   distribuée sur Google Play / App Store soulève des règles de facturation des
   stores (biens numériques) — à trancher à l'étape 4 avant publication.
5. **CSP** : la Content-Security-Policy est envoyée par `vercel.json` (en-tête HTTP),
   elle ne s'applique donc pas à la WebView native (assets locaux). Une CSP `<meta>`
   dédiée pourra être ajoutée à l'étape 2 si souhaité.
6. **URL absolues Vercel** (`og:image`, `canonical`, etc.) : laissées telles quelles
   (utiles au web uniquement).
7. **Ressources de test Capacitor** : `android/app/src/androidTest` et `android/app/src/test`
   conservent le package modèle `com.getcapacitor.myapp` (fichiers d'exemple non
   utilisés par le build) ; à nettoyer éventuellement.

## Vérifications effectuées (étape 1)

- `npm run build` : OK.
- `npx cap sync android` : OK (0 erreur ; aucun plugin Capacitor installé).
- Tests : suite complète verte (190 fichiers, 1150 tests).
- **Build Android (`assembleDebug`) : NON vérifié sur cette machine** — ni JDK ni
  Android SDK installés (`java` introuvable, `ANDROID_HOME` / `ANDROID_SDK_ROOT`
  vides, pas de dossier `%LOCALAPPDATA%\Android\Sdk`). À valider par la CI (étape 5)
  ou par le propriétaire avec Android Studio.


---

# Étape 2 — Adaptation de l'interface aux téléphones (faite le 6 octobre 2026)

Principe suivi : le web ne doit pas bouger. Tout ce qui est JavaScript natif est
derrière `isNative()` + `import()` dynamique ; tout le CSS ajouté est étroit (un nom
de classe précis ou une media query de pointeur tactile), aucun sélecteur global.

## Design system : écart avec la palette du brief (DÉCISION DU PROPRIÉTAIRE)

Le brief citait Indigo #151B3D / Gold #D9A441 / Coral #E16B5D / Green #2E8B72 / Cream
#F7F2EA. Le dépôt utilise l'identité « Baobab 3.0 » (tokens `--bb-*` dans `index.html`,
`src/constants.js`, mode sombre réactif) qui **fait foi** ; rien n'a été remplacé.
Valeurs réellement utilisées pour splash, barre d'état et icônes :

| Brief | Dépôt (utilisé) | Remarque |
| --- | --- | --- |
| Indigo #151B3D | **Vert profond #14432A** (`--bb-indigo`, `theme_color` du manifest, fond du logo existant) ; #0D2E1C (`--bb-indigo-deep`) | l'indigo bleuté du brief n'existe pas dans l'app : le « primaire » est un vert |
| Gold #D9A441 | #D9A441 (`--bb-ochre`, couleur de l'arbre du logo) ; #F6D271 / #C9962F en sombre | identique |
| Coral #E16B5D | #E56B5D (aplats/icônes, `C.coral`) ; #C0392B comme couleur de texte/boutons danger (contraste AA) | proche |
| Green #2E8B72 | #1F7A5A (`--bb-leaf`, actions) ; #3FB37E / #6FD6A6 décoratif | proche |
| Cream #F7F2EA | #FAF7F2 (`--bb-bg` clair), #F8F5EF (`--bb-sand`) ; sombre #14120D | proche |

Splash clair = #14432A + arbre ; splash sombre et fond de fenêtre sombre = #14120D (jeton
`--bb-bg` sombre) ; fond de fenêtre clair = #FAF7F2. Si le propriétaire veut réellement
la palette du brief (indigo #151B3D…), c'est un chantier de refonte du design system, pas
un réglage mobile.

## Changements, point par point

**1. Zones sûres** (`viewport-fit=cover` déjà présent). Audit par grep de tous les
`fixed`/`sticky`. Déjà corrects : nav du bas, en-tête, compositeur de messages, feuilles
`AppModals`, `PostComposer`/`StoryComposer`, `UpdateNotice`, Auth, Landing. Corrigés :
bandeaux globaux « connexion interrompue » / « suppression de compte » (classe
`.bb-banner-stack`), toasts succès (au-dessus de la nav + zone basse) et erreur (sous
l'encoche), en-tête de la coque générique (onboarding / édition de profil), pied de
l'onboarding, `PublicPageShell`, visionneuse de stories (barres de progression, en-tête,
réactions, champ de réponse, panneau « vues »), visionneuse de photos (fermer, compteur,
zoom), 8 feuilles du bas sans marge de zone sûre (`AdmirersModal`, `FavoritesModal`,
`MatchInfoModal`, `MatchPreferencesModal`, `CommunityInviteModal`, `EventInviteModal`,
partage d'événement, `DeleteAccountModal`) + fiche de profil public ; gauche/droite
(paysage / tablette) sur l'en-tête et la nav. Le volet de messagerie retranche désormais
`safe-area-inset-top/bottom` de sa hauteur fixe (`calc(100dvh - 180px …)`) : sans cela
le champ de saisie passait sous la nav sur iPhone en PWA/natif.
*Android* : Capacitor 8 (plugin `SystemBars`, `insetsHandling: css`,
`initialViewportFitValueHint: cover`) rend la WebView plein écran (WebView ≥ 140 : `env()`
correct) ou l'insère avec du padding natif (WebView < 140 : `env()` = 0) ; dans les deux
cas le CSS existant convient.

**2. Hauteurs / clavier.** Le brief annonçait « 6 usages de `100vh` » : il n'y en avait
qu'un (messagerie, déjà avec repli `dvh`) ; en revanche **12 `min-h-screen`** Tailwind
(= `100vh`). Une seule règle `@supports (min-height: 100dvh) { .min-h-screen { min-height:
100dvh } }` (fin de `src/tailwind.css`) les couvre ; idem `max-h-[92vh]` (fiche de profil,
seule feuille assez haute pour dépasser). Les feuilles à 80/85 % restent en `vh` : elles
tiennent dans la zone visible même barre d'outils affichée, et en natif `vh` = `dvh`.
*Clavier* : `@capacitor/keyboard` 8.0.6, `resize: "native"` (iOS : la WebView est
redimensionnée ; Android : le plugin `SystemBars` relève le padding bas de la hauteur du
clavier). Filet de sécurité JS (`setupKeyboardGuard`, natif seulement) : à l'ouverture du
clavier, le champ actif est ramené dans la zone visible (`scrollIntoView({block:"nearest"})`).

**3. Cibles tactiles ≥ 44 × 44 px.** Classe `.bb-hit` : pseudo-élément invisible centré,
réservé aux pointeurs « grossiers » (`@media (pointer: coarse)`), `position: relative` à
spécificité nulle (`:where`) donc `absolute`/`fixed` existants prioritaires. Aucun
agrandissement visuel. `.bb-hit-v` (hauteur seule) pour les rangées d'icônes collées (écart
entre centres < 44 px : une extension horizontale volerait la zone du voisin). Appliquée à
~165 boutons : fermer ×, retour, menus ⋯ des conversations/messages, envoi (message vocal,
commentaires d'événement, réponse de story), j'aime / commenter / signaler / modifier /
supprimer (fil et communautés), réactions (puces), favoris / passer / signaler / bloquer,
onglets-pastilles (catégories du fil, filtres de messages, notifications, actualités),
visionneuses (fermer / précédent / suivant / zoom / son / ⋯), suppression du média d'un
brouillon, etc. Les sélecteurs d'emojis rapides (`MessageActionsMenu`, `CommunityPostCard`)
ont reçu de vrais `min-h 44 / min-w 40` (boutons collés). Vérifié dans un navigateur en
émulation tactile : la zone mesure 44 px, extension verticale seule pour `.bb-hit-v`, aucun
effet à la souris.
**Non corrigé volontairement (< 44 px restant)** : vignettes de photos 72 px de
`EditProfileForm` / onboarding (boutons × / étoile / flèches de 20 px posés sur la
vignette : une extension à 44 px recouvrirait la photo elle-même et ferait déclencher
« photo principale » / « supprimer » à la place de l'agrandissement — il faut agrandir les
vignettes ou passer à un menu ⋯, décision de design), le « + » d'ajout de statut sur sa propre
story, les 3 boutons ↑ ↓ × des médias d'un brouillon de publication, la grille 36 px des emojis
et des couleurs de fond de story (cellules collées), les libellés de la nav à 8 px. Les rangées
d'onglets horizontales défilantes rognent verticalement l'extension.
*Survol* : seuls 2 usages cachaient une action au survol : le menu ⋯ d'une ligne de
conversation (`opacity-0 group-hover`) et le × de suppression de la grille de publications du
profil (`hidden group-hover:flex`, injoignable au tactile) → visibles via
`[@media(hover:none)]`. Le reste (`hover:bg-…`) n'est que décoratif.

**4. Gestes.** *Tirer pour rafraîchir* : `src/hooks/usePullToRefresh.js` (touch events
passifs, jamais de `preventDefault`, seuil 70 px, uniquement page et conteneurs défilants à
`scrollTop 0`, un doigt, mouvement surtout vertical, aucune modale ouverte, désactivé
pendant un rechargement / une action ; pose `overscroll-behavior-y: contain` sur `<html>`
tant qu'il est actif pour neutraliser le rafraîchissement natif de Chrome Android).
Indicateur discret `PullToRefreshIndicator`. Branché sur : **le fil** (`PostsFeed`,
`loadPosts(null, {silent})` = le rechargement de la bannière « nouvelles publications »,
sans repasser par « Chargement… » ; désactivé en grille/profil, pendant la rédaction,
publication, suppression, signalement) et **la liste des conversations** (`MessagesTab` ←
`SocialShell.refreshConversations` = aperçus + non-lus + notifications, mêmes fonctions que
la reconnexion/reprise ; désactivé conversation ouverte). Les stories et suggestions du fil
ne sont pas rechargées par ce geste.
*Swipe Découverte* : **déjà présent** (`DiscoverTab` : glissement horizontal de la carte
principale, `touch-action: pan-y`, seuil 110 px, retour élastique, mêmes `decideSwipe` que
les boutons Passer / Se rencontrer) — rien ajouté. *Retour* : iOS système ; Android → étape 3.

**5. Mode sombre / barre d'état.** Le thème suit déjà `prefers-color-scheme` quand le
réglage est « Système », mais **par défaut le web est en clair** (choix produit). En natif,
`applyNativeThemeDefault()` (appelé par `main.jsx`) enregistre « Système » au tout premier
lancement sans préférence ; un choix explicite n'est jamais écrasé. (Le script d'amorçage de
`index.html` n'a pas été modifié : son hash est épinglé dans la CSP de `vercel.json`.)
`useNativeSystemBars` (appelé dans `App.jsx`) lit le fond **réellement affiché** en haut et en
bas de l'écran (accueil/connexion toujours vert sombre ; onboarding toujours clair ; coque
sociale selon le thème) et applique : `@capacitor/status-bar` 8.0.4 `setStyle` (+
`setBackgroundColor` sur Android, ignoré à partir d'Android 15/16 par le plugin) et
`SystemBars.setStyle({bar: "NavigationBar"})` (cœur de Capacitor, Android) ; recalcul
(anti-rebond 300 ms) à chaque changement de `data-theme`, de préférence système, d'écran ou de
navigation. Limite connue : WebView < 140 (rare) → la zone sous la barre d'état est le fond de
fenêtre (`bb_window_background`, suit le thème système, pas le réglage interne) : icônes
éventuellement mal contrastées si thème interne ≠ thème système.

**6. Splash et icônes.** Seule source de logo : `public/icon-512.png` (512 px, raster, carré
arrondi vert #14432A + arbre or/brun). Aucun nouveau logo :
`scripts/generate-native-asset-sources.mjs` (`npm run assets:sources`) détoure l'arbre et le
recompose sur fonds unis de la charte → `assets/icon-only.png` (1024², arbre ×1,5),
`icon-foreground.png` (1024², transparent, arbre ×1,8), `icon-background.png`, `splash.png`
(2732², #14432A), `splash-dark.png` (2732², #14120D). Puis `npm run assets:android`
(= `npx capacitor-assets generate --android --assetPath assets`, sharp inclus, fonctionne
sans Android Studio) a produit les 74 PNG de `android/app/src/main/res` (versionnés,
~0,9 Mo) et l'icône adaptative. `@capacitor/splash-screen` 8.0.2 : `launchAutoHide` avec 3 s
en secours, masquage manuel dès que la session est vérifiée (`hideSplash`), fond #14432A ;
Android 12+ : `windowSplashScreenBackground` = `bb_splash_background` (clair #14432A / sombre
#14120D).
**À fournir par le propriétaire** : le logo en **vectoriel (SVG) ou PNG ≥ 1024²** (l'actuel est
agrandi ×1,5 / ×1,8 : correct car aplats, mais moins net qu'une source native), une version de
l'arbre sans fond, et, pour iOS (étape 5), `icon-only.png` sans transparence (déjà le cas).
Déposer les fichiers dans `assets/` à la place des générés, puis `npm run assets:android`.

**7. Orientation.** Android : `android:screenOrientation="portrait"` sur `MainActivity`. Sur
Android 16 (targetSdk 36), le système **ignore** ce verrou sur les grands écrans (≥ 600 dp :
tablettes, pliables) : l'interface y reste donc exploitable en paysage (conteneurs centrés
`max-w-*`, zones sûres gauche/droite sur en-tête et nav). iOS : étape 5.

**8. Performances / listes.** Mesures par lecture du code : fil = pages de 20 (curseur) avec
défilement infini → ne dépasse ~200 cartes qu'après ~10 pages défilées d'affilée ; messages =
30 + « charger plus » ; Découverte = 500 profils en mémoire mais **un seul** rendu en mode pile
et 12 par clic en grille ; communautés/événements = pages de 20 + « charger plus ». **Aucune
liste ne dépasse ~200 éléments rendus en usage normal : pas de virtualisation.**
`content-visibility: auto` a été écarté : il impose le *paint containment* et rognerait les
ombres des cartes (`bb-card`) et les menus déroulants positionnés sous les cartes (réactions)
— à reconsidérer (avec marge interne) seulement si la télémétrie montre des fils > 200 cartes.
`<img>` : audit fait ; les seuls sans `loading="lazy"` sont au premier plan (visionneuses,
aperçus) ou décoratifs.

**9. Tablettes.** Aucune casse attendue : en-tête/contenu `max-w-7xl mx-auto`, nav
`max-w-xl mx-auto`, messagerie `max-w-6xl`, onboarding/auth `max-w-md`, pages publiques
`max-w-2xl`, visionneuse de stories `max-w-md`. Vérifié en émulation 768 × 1024 (métriques).

## Plugins ajoutés (versions vérifiées le 6 octobre 2026 avec `npm view`)

| Paquet | Version | Où |
| --- | --- | --- |
| `@capacitor/keyboard` | 8.0.6 | dépendance (chargé dynamiquement) |
| `@capacitor/status-bar` | 8.0.4 | dépendance (chargé dynamiquement) |
| `@capacitor/splash-screen` | 8.0.2 | dépendance (chargé dynamiquement) |
| `@capacitor/assets` | 3.0.5 | devDependency (génération des icônes/splash) |

Configuration : `capacitor.config.json` (`SplashScreen`, `Keyboard`, `SystemBars`).
`cap sync android` OK : 3 plugins détectés.

## À tester sur appareil réel (rien n'a pu l'être ici)

- Aucun test sur téléphone/émulateur Android ni iOS : ni JDK ni SDK sur cette machine. Toute
  la partie native (styles Android, splash Android 12+, icône adaptative, barres système,
  clavier) est **non vérifiée à l'exécution**.
- Safe areas réelles (encoche, Dynamic Island, barre de gestes) : en-tête, nav, bandeaux,
  toasts, visionneuses, feuilles du bas, volet de messagerie (champ de saisie visible clavier
  ouvert).
- Icônes des barres système correctes sur accueil/connexion (sombre), onboarding (clair),
  coque sociale en clair et en sombre, en changeant le thème système et le réglage interne.
- Tirer pour rafraîchir sur le fil et la liste des conversations (pas de double
  rafraîchissement natif Chrome ; pas de conflit avec le défilement ni avec le glissement
  horizontal des stories).
- Zones tactiles ≥ 44 px au doigt (menus ⋯, ×, j'aime, réactions) sans touches voisines
  parasites.
- Splash : aspect clair/sombre, durée, absence d'écran blanc entre splash et premier écran ;
  icône adaptative (rond, carré arrondi, goutte) : l'arbre doit rester entier.
- Tablette/pliable en paysage (Android 16 ignore le verrou portrait).

## Vérifications effectuées (étape 2)

- `npm run build` : OK. `npx cap sync android` : OK. Suite complète : verte.
- Émulation Chrome 375 × 812 et 768 × 1024 (pointeur tactile) de l'accueil, connexion,
  inscription, à propos, confidentialité, conditions : aucun débordement horizontal, aucune
  erreur, cartes centrées sur tablette ; zone `.bb-hit` mesurée à 44 px dans un vrai
  navigateur. Aucun compte créé, aucune connexion : les écrans connectés n'ont PAS été vus à
  l'écran.
- Bundle principal (`dist/assets/index-*.js`) : 470 311 o (fin d'étape 1) → **479 872 o** (+9,5 ko brut,
  139,3 ko gzip) : `usePullToRefresh`, `nativeUi`, `useNativeSystemBars`, indicateur, classes. Les plugins
  natifs sont des chunks séparés, jamais chargés par un navigateur : status-bar 0,41 ko, keyboard 0,43 ko,
  splash-screen 0,58 ko (+ `web-*.js` des plugins Capacitor). `index.html` (scripts à hash CSP) inchangé.
- Tests : 190 → 195 fichiers, 1150 → 1195 tests, tous verts (`nativeUi`, `useNativeSystemBars`,
  `usePullToRefresh`, intégrations fil et messagerie, garde-fous web avec mocks `@capacitor/*`).


---

# Étape 3a — Push natif, présence, liens profonds (faite le 7 octobre 2026)

Principe suivi : « étendre, ne pas doubler » et web identique. Le Web Push existant
(`push_subscriptions`, `public/sw.js`, VAPID) n'est pas touché ; tout le code natif est derrière
`isNative()` + `import()` dynamique (le seul import statique `@capacitor/*` du code applicatif reste
`@capacitor/core`, ce qu'un test vérifie).

## Décision : FCM pour Android, APNs direct pour iOS (pas « FCM pour les deux »)

Vérifié le 7 octobre 2026 dans la documentation officielle du plugin
(https://capacitorjs.com/docs/apis/push-notifications) et avec `npm view` : `@capacitor/push-notifications`
**8.1.3** (dernière 8.x, compatible `@capacitor/core >= 8`).

- Android : `register()` renvoie un **jeton FCM**.
- iOS : `register()` renvoie un **jeton APNs brut** ; la documentation précise que le plugin ne fournit
  pas de jeton FCM sur iOS.

« FCM pour les deux » exigerait donc d'ajouter à l'app iOS le SDK Firebase Messaging (pod/package Swift)
**et** un second plugin (type `@capacitor-firebase/messaging`) pour échanger le jeton APNs contre un jeton
FCM, plus un fichier `GoogleService-Info.plist` et une configuration Firebase iOS : du code natif iOS qui
n'existe pas encore (étape 5) et qu'on ne peut pas tester ici. L'envoi **APNs direct** ne demande rien de
plus côté client (le jeton du plugin sert tel quel) et, côté serveur, environ 60 lignes testées (JWT ES256
avec la clé `.p8` + une requête HTTP/2 que `fetch` de Deno gère), sans dépendance nouvelle.
Contrepartie assumée : deux chemins d'envoi côté serveur (FCM v1 et APNs), isolés dans un seul module pur
`supabase/functions/_shared/nativePush.ts`, testé (signature des JWT vérifiée avec les clés publiques,
mapping d'erreurs, suppression de jetons). À reconsidérer seulement si l'on veut un jour des fonctions
Firebase (sujets, analyses de notifications, A/B) sur iOS.

L'ancienne API FCM « legacy » (clé serveur) n'est **pas** utilisée (abandonnée par Google) : FCM HTTP v1,
`POST https://fcm.googleapis.com/v1/projects/<id>/messages:send`, jeton d'accès OAuth2 obtenu par un JWT
RS256 signé avec la clé du compte de service (`FCM_SERVICE_ACCOUNT_JSON`, portée
`https://www.googleapis.com/auth/firebase.messaging`), mis en cache jusqu'à son expiration.

## Flux de bout en bout

1. **Opt-in (jamais au premier lancement)** : la permission n'est demandée qu'au clic sur « Activer les
   notifications » de l'écran existant `NotificationsOptIn` (fin d'inscription) ou sur « Activer » de
   Réglages > Notifications (`NotificationPreferencesModal`). Ces deux écrans appellent les mêmes
   fonctions qu'avant (`enablePushNotifications` etc. dans `pushNotifications.js`), qui aiguillent en natif
   vers `src/lib/nativePush.js`.
2. `enableNativePush()` : `checkPermissions` → `requestPermissions` → canal Android `baobab_default`
   (`createChannel`, importance haute) → `register()` → attente de l'évènement `registration` (15 s max) →
   enregistrement du jeton. Refus : « Notifications bloquées. Tu peux les autoriser dans les réglages de ton
   téléphone (Applications, Baobab, Notifications). » ; fenêtre fermée sans réponse : message neutre (comme
   le web) ; `registrationError` ou `register()` qui échoue (typiquement `google-services.json` absent) :
   « Impossible d'activer les notifications sur cet appareil pour le moment. »
3. **Stockage** : nouvelle table `device_push_tokens` (`supabase-device-tokens.sql`, voir `DEPLOIEMENT.md` §11).
   Le client appelle la fonction `register_device_push_token` (insère **ou réassigne** le jeton au compte
   connecté : un jeton ne peut pas être dupliqué, et un téléphone qui passe du compte A au compte B change
   de propriétaire même si le nettoyage de A a échoué) ; si la fonction n'existe pas encore, repli sur un
   `upsert` par jeton ; si la table n'existe pas encore, **échec silencieux journalisé
   (`console.warn`) : l'activation réussit, l'app fonctionne**.
4. **Reconnexion** : `useNativePushSync` (à la connexion) ré-enregistre en silence le jeton si CE compte avait
   activé les notifications (clé locale `bb-native-push-optin:<user>`) ET que le téléphone a déjà accordé la
   permission. Il ne redemande jamais la permission. Un renouvellement spontané du jeton par le système
   (évènement `registration`) est aussi réenregistré.
5. **Déconnexion** (`handleSignOut`, avant `signOut()` car la RLS exige la session) : le jeton de CET appareil
   (seulement) est supprimé de la table, `unregister()` invalide le jeton côté système (le compte suivant sur
   ce téléphone en recevra un neuf) ; le choix de l'utilisateur est conservé pour sa prochaine connexion.
   « Désactiver » dans les réglages fait pareil et efface aussi ce choix. Suppression de compte : la ligne part
   par `on delete cascade` à la suppression réelle (après le délai de 24 h, comme le Web Push) ; l'utilisateur
   se déconnecte avant, ce qui supprime déjà le jeton.
6. **Envoi** : `send-push` (déclenché par les triggers `pg_net` existants de
   `supabase-push-notifications-triggers.sql`, toujours **non exécutés en prod** à ce jour) envoie le Web Push
   **inchangé** (même charge utile octet pour octet, mêmes préférences `notification_preferences`, mêmes
   suppressions 404/410), puis envoie aux jetons natifs du destinataire si la catégorie n'est pas désactivée.
   Messages FCM de type **notification** (affichés par le système app fermée, sans JavaScript) avec canal
   `baobab_default`, `priority: HIGH`, `data.url` ; APNs `apns-push-type: alert`, `url` à la racine. Si une
   variable d'environnement native manque, la plateforme concernée est ignorée (un seul journal au démarrage)
   et le Web Push part quand même ; une panne FCM/APNs n'interrompt jamais le Web Push (`Promise.allSettled`
   et `try/catch`).
7. **Suppression de jetons morts** : FCM `UNREGISTERED`/`NOT_FOUND`/HTTP 404, APNs `Unregistered`/410, et
   `BadDeviceToken` **après** un second essai sur l'autre environnement (sandbox/production). Volontairement
   **pas** supprimés : FCM `INVALID_ARGUMENT`/`SENDER_ID_MISMATCH`, APNs `DeviceTokenNotForTopic` (une
   mauvaise configuration effacerait des jetons valides).
8. **Clic sur la notification** : `pushNotificationActionPerformed` → `data.url` → même validation et même
   mapping que les liens profonds (ci-dessous). App fermée, le clic lance l'app et l'évènement est rejoué dès
   que l'écouteur est posé. `pushNotificationReceived` (app au premier plan) n'est **pas** écouté : les canaux
   Realtime existants affichent déjà la nouvelle activité (badge, liste) ; afficher en plus une alerte système
   la doublerait (`presentationOptions: ["badge"]` côté iOS pour la même raison).
9. **Icône de notification** : petite icône monochrome blanche (silhouette de l'arbre du logo existant,
   `ic_stat_baobab` en 5 densités) générée par `node scripts/generate-push-icon.mjs` à partir de
   `assets/icon-foreground.png` ; référencée avec la couleur d'accent `#14432A` et le canal par défaut dans
   `AndroidManifest.xml` (utilisés par le système quand l'app est fermée). Remplaçable par un logo
   monochrome fourni par le propriétaire.
10. **Liens des pushs** : message → `/messages/<profil expéditeur>` ; match → `/messages/<profil de l'autre>` ;
    like, abonné → `/profile/<profil>` (uuid vérifiés côté serveur, sinon `/`). La charge utile Web Push garde
    `url: "/"`.

## Présence (`@capacitor/app`)

- **Où est appliquée la règle « hors ligne 10 minutes après » ?** À la **lecture, côté client** :
  `src/lib/presence.js` (`isUserOnline`, `ONLINE_STALE_MS` = 10 min) compare `last_seen` à l'heure courante ;
  aucune vue ni SQL n'applique la règle (`is_online` n'est qu'un indice). Un `is_online=false` perdu (WebView
  gelée, téléphone éteint) est donc sans conséquence durable : vérifié, rien à corriger.
- Natif : `appStateChange` pilote `startPresence` (`lib/presenceHeartbeat.js`, extrait d'`App.jsx`) : premier plan
  → heartbeat **immédiat** puis toutes les 60 s ; arrière-plan → minuteur **arrêté** + dernier
  `is_online=false` best-effort. Une fois `appStateChange` actif, `visibilitychange` n'est plus écouté pour la
  présence (pas de double écriture) ; si le plugin ne charge pas, repli sur `visibilitychange`. **Web inchangé**
  (même séquence, même filtrage par visibilité).
- `useResumeTick` : un `appStateChange` actif déclenche le même rattrapage (> 60 s d'absence, au plus un par
  15 s) que le retour de visibilité, avec le même état partagé : si les deux évènements arrivent pour un même
  retour, un seul rattrapage (testé dans les deux ordres).

## Liens profonds

**Domaine : un seul endroit** — `src/config/publicOrigin.json` (`{"origin": "https://baobab-app-zeta.vercel.app"}`),
lu par `src/lib/publicOrigin.js` (`PUBLIC_WEB_ORIGIN`, surchargeable au build par `VITE_PUBLIC_WEB_ORIGIN`),
par `android/app/build.gradle` (hôte de l'intent-filter via `manifestPlaceholders`) et par les tests. Pour
changer de domaine : modifier ce fichier, puis (côté propriétaire) republier `.well-known` sur le nouveau
domaine, l'ajouter aux « Redirect URLs » Supabase et, à l'étape iOS, à l'entitlement `applinks:`.

**Constat** : l'app n'a pas de routeur d'entités (seulement `usePathname` pour les pages publiques) ni de lien
partageable existant : `buildEventShareMeta`/`shareCard` produisent des cartes envoyées dans une conversation
(`media_meta`), pas des URL. Les URL ci-dessous sont donc nouvelles ; le **web ne les consomme pas** (ouvrir
`/event/<uuid>` dans un navigateur affiche l'accueil, comme aujourd'hui). Seule l'app native les interprète.

| URL (domaine public) | Destination | Contrôle d'accès |
| --- | --- | --- |
| `/profile/<uuid>` | fiche du profil (le sien → onglet Profil) | requête `profiles` sous RLS ; absent ou inaccessible → « Ce profil n'est plus disponible. » |
| `/messages/<uuid du profil de l'autre>` | conversation avec cette personne | idem profil ; la messagerie reste soumise aux RLS de `messages` |
| `/event/<uuid>` | onglet Événements → détail | `events` sous RLS (événements privés inclus) ; échec → « Impossible de charger cet événement. », retour à la liste |
| `/community/<uuid>` | onglet Communautés → détail | `communities` sous RLS ; même mécanisme |
| `/update-password#access_token=…&refresh_token=…&type=recovery` | écran « Nouveau mot de passe » | session de récupération établie par `setSession` (le serveur valide les jetons) |
| `/?verified=1` | message « e-mail confirmé, entre ton mot de passe » | aucun jeton utilisé |
| `#error=…&error_code=otp_expired` | écran « Lien expiré / invalide » | — |

Validation (`src/lib/deepLinks.js`, liste blanche stricte, 39 cas de test) : `https` + hôte **exactement** égal au
domaine public (sous-domaines, `domaine@evil`, `//evil`, `/\evil`, `javascript:`, `http:` refusés) ; chemin
`^/(event|community|profile|messages)/<uuid>/?$` ; uuid obligatoire ; requête et fragment ignorés ; longueur
bornée. Une URL invalide est **ignorée sans bruit**. Une destination reçue déconnecté est conservée et ouverte
après la connexion, mais abandonnée au bout de 10 minutes et à la déconnexion. Les jetons de récupération ne
sont ni journalisés, ni stockés, ni envoyés au suivi (testé : aucun `console.*` ne les contient, même quand
Supabase refuse le jeton) ; l'URL reçue ne passe jamais dans `window.location` de la WebView.

**E-mails** : `Auth.jsx` (confirmation, renvoi, réinitialisation) et le lien d'invitation de `DiscoverTab` utilisent
`linkOrigin()` : `window.location.origin` sur le web (inchangé), le domaine public en natif. Le partage de profil
(`ProfileTab`, repli presse-papiers) idem. Reste `SITE_URL` du retour Stripe côté edge functions (web, inchangé).
**Limite connue** : le lien d'un e-mail est d'abord une URL `…supabase.co/auth/v1/verify?…` qui redirige ensuite
vers notre domaine ; selon l'application de messagerie ou le navigateur, la redirection n'est pas toujours remise
à l'app par Android/iOS. Dans ce cas le lien s'ouvre dans le navigateur et le flux web fonctionne comme avant :
rien n'est cassé, seul le « s'ouvre dans l'app » n'est pas garanti (à tester sur appareil).

**Android** : `intent-filter` `autoVerify` (https, hôte du fichier de config, préfixes `/event/`, `/community/`,
`/profile/`, `/messages/`, chemin `/update-password`). `/?verified=1` n'est **pas** déclaré côté Android (un filtre
ne peut pas tester la requête : il capturerait toute la page d'accueil du site). `public/.well-known/assetlinks.json`
(empreinte **à remplacer**). **iOS** : `public/.well-known/apple-app-site-association` (Team ID **à remplacer**,
mêmes composants, plus `/?verified=1` car AASA sait tester la requête) ; l'entitlement
`com.apple.developer.associated-domains` = `applinks:baobab-app-zeta.vercel.app` sera ajouté **à l'étape 5 (projet
iOS)**, avec `aps-environment` et la capacité Push Notifications.

**Vercel** : `vercel.json` gagne seulement deux règles d'en-têtes (`Content-Type: application/json` et
`Cache-Control` 1 h) pour ces deux chemins ; la réécriture SPA `/(.*)` → `/index.html` est inchangée (Vercel sert
d'abord les fichiers statiques, comme pour `/sw.js`). Preuve : `npm run build` produit
`dist/.well-known/assetlinks.json` et `dist/.well-known/apple-app-site-association` ; un test vérifie les règles
d'en-têtes et que la réécriture n'a pas bougé. **Après déploiement**, vérifier :
`curl -sI https://baobab-app-zeta.vercel.app/.well-known/apple-app-site-association` (doit répondre `200` et
`content-type: application/json`, **sans** redirection) — non vérifiable avant la mise en ligne.

## Ce que le propriétaire doit faire

| # | Tâche | Où / comment | Secret ? |
| --- | --- | --- | --- |
| 1 | Créer le projet Firebase | https://console.firebase.google.com → « Ajouter un projet » (Analytics facultatif) | non |
| 2 | Enregistrer l'app **Android** `ca.baobab.app` | Firebase → Paramètres du projet → Vos applications → Android ; télécharger `google-services.json` | non (identifiants publics de projet) |
| 3 | Placer `google-services.json` dans `android/app/` et le committer | sans lui, le build Android reste possible mais le push est désactivé (le plugin Gradle n'est appliqué que si le fichier existe) ; ne rien y inventer | non |
| 4 | Créer la clé du compte de service FCM | Firebase → Paramètres du projet → Comptes de service → « Générer une nouvelle clé privée » (JSON). Vérifier que l'API « Firebase Cloud Messaging API (V1) » est activée | **OUI** |
| 5 | Poser `FCM_SERVICE_ACCOUNT_JSON` | `supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat compte-de-service.json)"` | **OUI** |
| 6 | Créer la clé APNs `.p8` | developer.apple.com → Certificates, Identifiers & Profiles → Keys → « + » → cocher *Apple Push Notifications service (APNs)* → télécharger (**une seule fois**) ; noter le *Key ID* ; le *Team ID* est dans Membership. (Aucune app iOS Firebase n'est nécessaire avec l'option APNs directe.) | **OUI** (`.p8`) |
| 7 | Poser les secrets APNs | `supabase secrets set APNS_KEY_P8="$(cat AuthKey_XXXX.p8)" APNS_KEY_ID=… APNS_TEAM_ID=…` (facultatifs : `APNS_BUNDLE_ID`, défaut `ca.baobab.app` ; `APNS_USE_SANDBOX=true` pour des builds de développement iOS — sinon la fonction essaie aussi l'autre environnement avant de supprimer un jeton) | **OUI** |
| 8 | Exécuter `supabase-device-tokens.sql` | SQL Editor ; détails et vérifications : `DEPLOIEMENT.md` §11a | non |
| 9 | Re-déployer `send-push` | `supabase functions deploy send-push` (§11b). Les triggers `pg_net` du §1c (`supabase-push-notifications-triggers.sql`) doivent aussi être exécutés pour que quoi que ce soit parte | non |
| 10 | Empreinte SHA-256 de signature Android | `keytool -list -v -keystore <keystore> -alias <alias>` (clé d'envoi) **et**, si Play App Signing, l'empreinte de la **clé de signature d'application** (Play Console → Intégrité de l'application). Remplacer le champ dans `public/.well-known/assetlinks.json` (plusieurs empreintes possibles), déployer, vérifier : `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://baobab-app-zeta.vercel.app&relation=delegate_permission/common.handle_all_urls` | non (public) |
| 11 | Team ID Apple | remplacer `REMPLACER_PAR_LE_TEAM_ID_APPLE` dans `public/.well-known/apple-app-site-association` | non (public) |
| 12 | (Étape 5) capacités iOS | Push Notifications + Background Modes « Remote notifications », entitlement `applinks:` ; transmettre le jeton APNs au plugin dans `AppDelegate` (`didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegisterForRemoteNotificationsWithError` → `NotificationCenter` du plugin, voir la doc Capacitor) | — |
| 13 | Si changement de domaine | modifier `src/config/publicOrigin.json` ; ajouter `<domaine>/update-password` et `<domaine>/?verified=1` aux Redirect URLs Supabase (déjà fait pour le domaine actuel puisque le web les utilise) ; republier `.well-known` | non |

Le fichier `google-services.json` n'est **pas** dans le dépôt (le test `step3aConfig` vérifie qu'aucun fichier
réel ni aucune clé `.p8`/`.pem` n'est versionné).

## Vérifications effectuées (étape 3a)

- `npm run build` : OK (bundle principal 479 872 o → 486 750 o, +6,9 ko brut : `nativeApp`, `nativePush`,
  `deepLinks`, `publicOrigin`, hooks ; les plugins `push-notifications` et `app` sont des chunks séparés jamais
  chargés par un navigateur ; `index.html` et les hash CSP inchangés ; `dist/.well-known/*` présents).
- `npx cap sync android` : OK, 5 plugins (`app`, `keyboard`, `push-notifications`, `splash-screen`, `status-bar`).
- Tests : 195 → 209 fichiers, 1195 → 1359 tests, tous verts : module d'envoi natif (JWT RS256/ES256 vérifiés avec les clés
  publiques, mapping d'erreurs, jetons supprimés ou conservés, jeton d'accès en cache et partagé, panne sans
  fuite de secret), enregistrement/refus/réassignation/suppression des jetons, désinscription à la déconnexion
  (ordre vérifié), présence et reprise (`appStateChange`), liens valides / invalides / malveillants, lien de
  réinitialisation sans fuite de jeton, redirections e-mail natif vs web, web inchangé (Web Push, aucun plugin
  natif chargé), ressources et manifeste Android, `.well-known`, `vercel.json`.
- Syntaxe de `send-push/index.ts` et `nativePush.ts` : transformation `esbuild` OK. `nativePush.ts` est testé
  par Vitest sous Node (WebCrypto identique à Deno).

## NON vérifié (aucun appareil, aucun Firebase, aucun compte Apple, ni JDK/SDK/Deno ici)

- Aucune notification n'a été réellement envoyée ni reçue (ni FCM ni APNs) ; le schéma exact des erreurs
  FCM/APNs réelles est celui de la documentation, pas observé.
- `send-push/index.ts` n'a pas été exécuté sous Deno (pas de typecheck Deno) ; la requête APNs en HTTP/2 via
  `fetch` de Deno n'est pas testée contre `api.push.apple.com`.
- Gradle : `manifestPlaceholders`, lecture du JSON et application conditionnelle du plugin Google Services
  n'ont pas été exécutés (`assembleDebug` impossible ici) — à valider par la CI ou Android Studio.
- Android 13+ : fenêtre de permission, canal créé, icône monochrome, clic app fermée / en arrière-plan, rejeu de
  `pushNotificationActionPerformed` au démarrage à froid.
- Vérification automatique des App Links (`assetlinks.json` à remplir), comportement de Chrome face aux
  redirections e-mail, ouverture de l'app par un lien de réinitialisation sur appareil réel.
- Le heartbeat en arrière-plan réel (gel de la WebView) n'a pas été observé.

## Risques de régression à auditer (chemin normal du web)

1. **Présence (`App.jsx`)** : l'effet a été refactoré dans `startPresence` ; le web doit se comporter à
   l'identique (point « En ligne » entre deux comptes, passage hors ligne en changeant d'onglet).
2. **`send-push`** : `sendToRecipient` restructuré (Web Push extrait dans `sendWebPush`, charge utile identique).
   Après déploiement, envoyer un message à un compte abonné en Web Push et vérifier qu'il arrive encore.
3. **`useResumeTick`** : mêmes fonctions pour `visibilitychange` ; le rattrapage au retour d'onglet doit toujours
   se déclencher une fois.
4. **`NotificationsOptIn` / `NotificationPreferencesModal`** : web inchangé (textes et logique) ; seules des
   branches `isNative()` ont été ajoutées.
5. **Liens e-mail** : `linkOrigin()` remplace trois `window.location.origin` d'`Auth.jsx` ; sur le web la valeur
   est identique (tests existants verts).
6. **Pushs « like » et privilège Premium** : le corps du push `like` nomme la personne (comportement existant du
   Web Push, jamais exécuté en prod car les triggers ne l'ont jamais été). Si la liste des admirateurs doit rester
   floutée pour les comptes gratuits (`supabase-premium-admirers-reveal-fix.sql`), décider avant d'exécuter
   `supabase-push-notifications-triggers.sql` ; le lien `/profile/<uuid>` du push natif en révèle aussi l'identifiant.
7. `ProfileTab` : le repli « copier le lien » donne le domaine public en natif (au lieu de `https://localhost/`) ;
   inchangé sur le web.

# Étape 3b — Caméra, localisation, partage, haptique, retour Android (faite le 7 octobre 2026)

Principe inchangé : tout le code natif est derrière `isNative()` + `import()` dynamique ; le web est strictement
identique (un test monte l'App sur le web avec les 9 plugins simulés et vérifie qu'AUCUN n'est chargé, ni au
démarrage ni après les points d'entrée natifs : `src/App.webNoNativePlugins.dom.test.jsx`).

## Piège Capacitor corrigé : ne jamais renvoyer le proxy d'un plugin nu depuis une promesse

Symptôme : `Vitest caught 13 unhandled errors` — `"Geolocation.then()" is not implemented on web` (code
`UNIMPLEMENTED`). Cause : `nativeGeolocation.js` avait `async function loadPlugin() { ... return Geolocation; }`.
Un plugin Capacitor est un `Proxy` qui répond à n'importe quelle propriété par une méthode ; résoudre une promesse
avec lui lit `.then`, ce qui, sans implémentation (web, tests), rejette sans que personne ne l'attende. Le test
`App.nativeLinks` (natif simulé, plugin non simulé) déclenchait l'effet de permission de localisation au montage.
Même défaut latent dans `nativeCamera.js` et `nativePush.js` (ce dernier n'était masqué que par des plugins simulés
sans `then`). Correctif : `loadPlugin()` renvoie `{ plugin }` dans les trois modules (les autres appellent le plugin
dans la fonction même : `nativeApp`, `nativeShare`, `nativeUi`, `haptics`). Test : `nativePluginThenable.test.js`
(un faux proxy compte les lectures de `then` et rejette comme le vrai ; échoue sans le correctif). L'appel à
`checkPermissions` au montage n'est pas « inutile » : c'est l'effet natif du garde-fou, qui ne fait que LIRE l'état
(jamais de demande de permission au démarrage).

## Caméra et photos (`@capacitor/camera` 8.2.5)

- Bouton « Prendre une photo » (`NativeCameraButton`, rend `null` sur le web) branché là où l'app demande une photo :
  onboarding (étape photo), édition du profil, composeur de statut. Le choix « dans la galerie » reste le
  `<input type="file">` existant : en natif il ouvre déjà le sélecteur système (Photo Picker Android 13+, PHPicker iOS)
  sans aucune permission de stockage. `pickPhotos` (galerie via plugin) existe mais n'est volontairement pas branché.
- La photo repasse par les gestionnaires EXISTANTS (`handlePhotosSelected`, `handleNewPhotosSelected`,
  `onStoryMediaSelected`, via `fileListEvent`) : validation du type/signature, réduction, retrait EXIF/GPS (ré-encodage
  canvas + repli JPEG qui efface la latitude). Aucun chemin parallèle. Le plugin est appelé avec `includeMetadata: false`
  et `saveToGallery: false` (aucune écriture dans la galerie, donc aucune permission de stockage).
- Explication AVANT la fenêtre système si la permission est à l'état « prompt » (iOS) ; refus : message honnête avec le
  chemin des réglages (aucune API fiable pour les ouvrir) et l'alternative « + Ajouter » ; annulation : silencieuse.
- Android : aucune permission `CAMERA` déclarée (le plugin lance l'application Appareil photo par intent ; la déclarer
  obligerait l'app à la demander). Voir le commentaire dans `AndroidManifest.xml`.

## Géolocalisation (`@capacitor/geolocation` 8.2.3)

- `getCurrentPositionSafe` passe par le plugin en natif : localisation APPROXIMATIVE (`enableHighAccuracy: false`,
  alias `coarseLocation`), mêmes codes (`PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT`, `UNKNOWN`), même arrondi à
  2 décimales (~1,1 km, fait par `geolocation.js`), mêmes valeurs. Le web garde `navigator.geolocation` à l'identique.
- La permission n'est demandée qu'à l'état « prompt », au geste de l'utilisateur (création de compte, bouton du
  garde-fou) ; jamais au démarrage. Un texte d'explication précède la demande à l'inscription (natif seulement).
- Garde-fou d'accès : l'état de permission vient du plugin (`navigator.permissions.query` est incomplet dans les WebView)
  et est relu au retour au premier plan (l'utilisateur modifie le réglage hors de l'app).
- Android : `ACCESS_COARSE_LOCATION` seulement ; `ACCESS_FINE_LOCATION` volontairement absente (sinon Android afficherait le
  choix « précise » sans bénéfice) ; pas de `uses-feature gps`.

## Partage (`@capacitor/share` 8.0.3)

Feuille de partage système pour le profil, l'invitation (Découverte) et les communautés, avec le lien PUBLIC
(`linkOrigin()`), jamais `https://localhost` (garde-fou `publicShareUrl` : hôte local ou schéma non http(s) retiré).
Aucun fichier ni métadonnée. Annulation silencieuse ; échec réel : repli d'origine (copie du lien). Le nom d'une
communauté non publique ne quitte pas l'app (texte générique). La WebView Android n'a pas `navigator.share`, d'où le plugin.

## Retour haptique (`@capacitor/haptics` 8.0.2)

`src/lib/haptics.js` : `hapticLight()`, `hapticSuccess()`, `hapticError()` — no-op sur le web (pas de `navigator.vibrate`)
et avec `prefers-reduced-motion`, tire-et-oublie (renvoient `undefined`), jamais d'exception ni de rejet, anti-rafale
(120 ms). Branchés en UNE ligne, sans toucher à la logique : like (léger) / match (réussite) dans `handleLike`, message
envoyé (`insertMessageRow`, léger), statut publié (réussite), tirer pour rafraîchir déclenché (léger), trois erreurs de
validation de l'inscription (erreur). Volontairement pas partout : un retour par action significative, pas par tap.
Android : le plugin ajoute lui-même la permission normale `VIBRATE` (aucune invite).

## Bouton Retour d'Android (`@capacitor/app` `backButton`)

**Choix : réutiliser la pile existante, pas de nouveau registre.** L'app a déjà une pile de retour unique fondée sur
l'historique (`hooks/useEscapeKey.js` : `useEscapeKey` / `pushBackEntry`). Toutes les modales, feuilles et visionneuses
(`MediaViewerModal` compris), la conversation ouverte (`useEscapeKey(Boolean(activeMatch), closeChat)`) et chaque
changement d'onglet (`SocialShell.goTab`) y poussent une entrée + un `history.pushState` ; un retour d'historique ferme
le sommet de la pile, un seul niveau à la fois : modale/feuille/visionneuse, puis conversation, puis onglets jusqu'à
l'onglet par défaut. Un registre `backStack.js` parallèle aurait dupliqué cet ordre (deux piles : modale fermée deux
fois ou jamais) ; le repli « Escape sur la modale `aria-modal` la plus haute » est inutile puisque l'unique pile couvre
déjà tout (la seule `aria-modal` hors pile : `UpdateNotice`, non fermable).

Ce que Capacitor fait SANS écouteur : `history.back()` si la WebView peut reculer, et RIEN SINON (impossible de quitter
l'app avec Retour). `lib/nativeBack.js` (branché par `hooks/useNativeBack.js`, une fois dans `App.jsx`) ajoute donc un
écouteur `backButton` qui : si `canGoBack` → `window.history.back()` (exactement le geste par défaut : rien ne change
pour les modales/onglets) ; sinon (racine) → premier appui : message « Appuie encore pour quitter » (2 s, `role="status"`),
second appui dans les 2 s → `App.minimizeApp()` (l'état et les notifications sont conservés, comme les apps Android 12+ ;
`exitApp` tuerait l'activité). Désabonné au démontage (le comportement par défaut revient). Aucun écouteur ni import
de plugin sur le web. Limite connue (héritée du web) : les entrées « fantômes » laissées par `discard()` à la fin de
l'onboarding peuvent demander quelques appuis sans effet visible avant la racine.

## Biométrie : NON implémentée (documentation de l'option)

- Plugin : aucun plugin officiel Capacitor ; des plugins communautaires existent (par exemple
  `@aparajita/capacitor-biometric-auth` ou `@capgo/capacitor-native-biometric`, à revérifier avant adoption) ; Android
  `BiometricPrompt` (permission `USE_BIOMETRIC`), iOS Face ID (`NSFaceIDUsageDescription`).
- Coût : une dépendance communautaire à suivre à chaque montée de Capacitor, un écran de verrou, des cas limites
  (biométrie non enrôlée, changée, échecs répétés, repli code du téléphone), des tests sur appareil réel.
- Risques : faux sentiment de sécurité (le jeton Supabase reste dans le stockage de la WebView) ; verrou mal conçu =
  utilisateur enfermé dehors ; un mot de passe stocké en « trousseau » élargirait la surface d'attaque.
- Recommandation v1.1 : verrouillage optionnel à la RÉOUVERTURE de l'app seulement (après X minutes en arrière-plan),
  désactivé par défaut, réglable dans le profil, avec « Se déconnecter » toujours accessible ; JAMAIS de stockage ni de
  ré-saisie automatique de mot de passe ; la session reste celle de Supabase.

## Permissions

- Android déclarées (3b) : `ACCESS_COARSE_LOCATION`. Ajoutée par un plugin : `VIBRATE` (haptics). Aucune `CAMERA`,
  aucune permission de stockage. (Déjà là : `INTERNET`, `POST_NOTIFICATIONS`.)
- iOS (à ajouter à l'ÉTAPE 5, quand le projet iOS existera, dans `Info.plist`) : `NSCameraUsageDescription` (« Baobab utilise
  l'appareil photo pour prendre ta photo de profil ou de statut. »), `NSPhotoLibraryUsageDescription` (choix d'une photo
  existante), `NSLocationWhenInUseUsageDescription` (« Baobab utilise ta position approximative pour te proposer des
  personnes et des événements près de toi. »). Sans elles l'app plante à la demande de permission ; textes en français.

## Vérifications effectuées (étape 3b)

- `npm run build` : OK (bundle principal 486,7 → 494,2 ko brut ; les plugins `camera`, `geolocation`, `share`, `haptics`
  sont des chunks séparés jamais chargés par un navigateur).
- `npx cap sync android` : OK, 9 plugins (`app`, `camera`, `geolocation`, `haptics`, `keyboard`, `push-notifications`,
  `share`, `splash-screen`, `status-bar`).
- Suite complète verte ET 0 « unhandled error » (222 fichiers, 1495 tests) ; nouveaux tests : `nativePluginThenable`,
  `haptics`, `usePullToRefresh.haptic`, `nativeBack` (logique pure), `nativeBack.dom` (vraie pile : modale → conversation →
  racine, double appui, message qui disparaît, désabonnement, web sans écouteur), `App.webNoNativePlugins`.
- Les messages « `.range is not a function` » vus en sortie (stderr, pas des erreurs non gérées) viennent de faux clients
  Supabase sans `range` dans `CommunitiesTab.editComment` / `moderation-delete` ; code et tests inchangés par 3b, donc non nouveaux.

## NON vérifié (aucun appareil, aucun JDK/SDK, aucun Xcode)

- Aucune fenêtre de permission réelle (position approximative, appareil photo iOS), aucune photo réellement prise ni
  relue via `webPath`, aucune feuille de partage réelle, aucune vibration réelle (intensités, appareils sans vibreur).
- Comportement réel du bouton/geste Retour : `canGoBack` de la WebView avec les `pushState` (hypothèse : compté par la
  WebView Android), geste de retour prédictif Android 14+, absence de double traitement avec le callback natif.
- Que le plugin caméra Android ouvre bien l'application Appareil photo SANS permission `CAMERA` déclarée (conforme à son
  README) sur des téléphones de marques variées ; HEIC iOS sur appareil.
- Coordonnées « approximatives » réellement obtenues (précision du fournisseur Android/iOS).

## Risques de régression à auditer (chemin normal du web)

1. `getCurrentPositionSafe` : la branche `isNative()` précède l'ancien code ; le web doit renvoyer les mêmes codes, messages
   et arrondi (tests existants verts + test « web inchangé »).
2. `App.jsx` : l'effet `navigator.permissions.query` est désormais sauté en natif seulement (`isNative()`).
3. `ProfileTab` / `DiscoverTab` / `CommunitiesTab` : les trois gestionnaires de partage ont une branche natif en tête ; le web
   garde `navigator.share` / copie, sans `url` pour le profil et les communautés (comme avant).
4. `EditProfileForm`, `Step2Photo`, `StoryComposerModal` : un rendu `NativeCameraButton` ajouté (retourne `null` sur le web,
   DOM identique).
5. `usePullToRefresh`, `Auth`, `handleLike`, `insertMessageRow`, `addStory` : une ligne haptique ajoutée (no-op web).
6. `nativePush` / `nativeCamera` / `nativeGeolocation` : `loadPlugin()` renvoie `{ plugin }` — tout nouvel appelant doit
   déstructurer.
