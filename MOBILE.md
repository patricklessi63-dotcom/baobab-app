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
| 4 | Préparation des stores : exigences UGC, suppression de compte, âge, achats intégrés (analyse), pages légales, questionnaires de confidentialité, fiche (voir `STORES.md`) | **Fait** (code + documents ; section « Étape 4 » en bas ; démarches de comptes et validations juridiques : tableau du propriétaire dans `STORES.md` §14) |
| 5 | Projet iOS (généré, configuré), pipeline de build cloud (GitHub Actions : CI, Android, iOS) et **guide de publication pas à pas** | **Fait** (section « Étape 5 » puis « Guide de publication » en bas ; **aucun build natif n'a encore été exécuté** : ni Mac, ni Gradle, ni CI lancée ici) |

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
| 12 | (Étape 5 : **code fait** — AppDelegate, entitlements `aps-environment` + `applinks:` ; reste à activer les capacités sur l'identifiant d'app Apple, voir le guide) capacités iOS | Push Notifications + Background Modes « Remote notifications », entitlement `applinks:` ; transmettre le jeton APNs au plugin dans `AppDelegate` (`didRegisterForRemoteNotificationsWithDeviceToken` / `didFailToRegisterForRemoteNotificationsWithError` → `NotificationCenter` du plugin, voir la doc Capacitor) | — |
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
- iOS (**fait à l'étape 5**, voir `ios/App/App/Info.plist`) : `NSCameraUsageDescription` (« Baobab utilise
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

# Étape 4 — Exigences des boutiques (faite le 7 octobre 2026)

Tout le détail (sources officielles citées, inventaire des données, réponses aux questionnaires, brouillons de fiche, tableau du
propriétaire, tests sur appareils, risques de rejet) est dans **`STORES.md`**. Ici : le résumé de ce qui a changé dans le code.

## Ce qui a changé

- **UGC (signalement / blocage)** : points d'entrée ajoutés là où il en manquait — carte Découverte en mode Pile (Signaler + Bloquer), menu d'un
  message reçu (« Signaler ce message »), commentaires et photos d'événement (signalement de l'auteur), « Bloquer l'auteur » sur publications et
  commentaires du fil et des communautés, proposition de blocage après un signalement de contenu, avatar/nom d'un auteur du fil → sa fiche ;
  les photos d'une personne bloquée et les événements créés par elle disparaissent. **Bug corrigé** : « Mineur suspecté » faisait échouer le
  signalement d'une publication du fil (contrainte `post_reports`) — motifs alignés sur la base + test de dérive client/base.
- **Pages légales** : textes mis à jour d'après ce que l'app collecte réellement, section « tolérance zéro » dans les Conditions, contact via
  `src/config/contact.json` (**vide par défaut**), nouvelle page publique **`/suppression-compte`** (sitemap, lien d'accueil, visible aussi connecté).
- **Suppression de compte** (code de l'edge function, **non déployé**) : médias de publications de communauté désormais effacés, listage Storage paginé
  (avant : 100 fichiers max par dossier), jamais bloquée par une erreur Storage.
- **Rien d'implémenté** pour les achats intégrés (analyse et recommandation : `STORES.md` §6) ; **rien masqué** dans l'UI.

## Ce que le propriétaire doit faire (résumé ; liste complète : `STORES.md` §14)

Renseigner `src/config/contact.json` ; exécuter `supabase-age-check-server-side.sql` (priorité) ; redéployer `process-scheduled-deletions` ;
décider du filtre de contenu, de la conservation des signalements et du Premium au lancement ; créer les comptes Apple (99 USD/an) et Google (25 USD) ;
test fermé Google (12 testeurs, 14 jours) ; compte de démonstration pour les relecteurs ; page « Normes de sécurité des enfants » ; revue juridique des textes.

## Vérifications effectuées (étape 4)

- `npm run build` : OK. `npx cap sync android` : OK. Suite complète verte, 0 « unhandled error » (voir le message de livraison pour les chiffres).
- Nouveaux tests : signalement de message, commentaires/photos d'événement, bouton Bloquer de la carte Pile, bloquer l'auteur (fil et communautés), motifs alignés sur la
  base, événements/photos d'un bloqué, contact (config vide : aucune adresse inventée), textes légaux (durées recoupées avec le SQL), page `/suppression-compte` (chemin
  recoupé avec les libellés réels, route publique, sitemap), helpers Storage de la suppression de compte.
- **NON vérifié** : aucune soumission, aucun compte développeur, aucun appareil ; sources des boutiques lues via un outil de résumé (voir `STORES.md` §0) ; consoles non consultées.

## Risques de régression à auditer (web)

1. **Pages publiques** : `/suppression-compte` est rendue **avant** les vues par session (même connecté) ; les autres routes publiques sont inchangées. Vérifier `/`, `/connexion`, `/a-propos`, `/confidentialite`, `/conditions`.
2. **CGU / Confidentialité** : contenu long modifié (inscription, Réglages, pages publiques) ; `LegalSection` est exporté ; date « 7 octobre 2026 ».
3. **Boutons nouveaux** : Découverte (Pile) — icônes sur la carte swipeable (`onPointerDown` stoppé, vérifier qu'elles n'entravent pas le glissement ni la navigation de photos) ;
   fil et communautés — icône Bloquer à côté de Signaler ; avatar/nom des auteurs du fil devenus cliquables (ouvre `PublicProfileModal` via `setViewedProfileId`).
4. **Signalement des publications du fil** : liste de motifs réduite (plus de « Mineur suspecté ») jusqu'à l'exécution de `supabase-post-report-minor-category.sql`.
5. **Événements** : les événements créés par une personne bloquée disparaissent des listes ; photos d'un bloqué masquées.


# Étape 5 — Projet iOS et pipeline de build cloud (faite le 7 octobre 2026)

Rien n'a été **exécuté** côté Apple, Google, Firebase ou Supabase : aucune publication, aucune soumission, aucun secret créé.
Cette étape produit le projet iOS, les workflows GitHub Actions et le guide. **Aucun build natif (Gradle, Xcode) n'a été lancé ici** :
cette machine n'a ni Mac, ni JDK, ni SDK Android, et seul `ci.yml` (sans compilation native) a tourné sur GitHub. Le premier lancement de `android-build.yml` / `ios-build.yml` sera
donc la première compilation réelle du projet Android **et** du projet iOS (voir « Ce qui n'a pas pu être vérifié »).

## Sources officielles vérifiées (7 octobre 2026)

Les pages Apple/Google ont été lues avec un outil qui en renvoie un résumé (certaines pages Apple ne renvoyaient que leur titre) :
les points signalés « de mémoire » n'ont pas pu être relus mot à mot.

| Sujet | Source | Ce qui a été retenu |
| --- | --- | --- |
| Envoi à App Store Connect | https://developer.apple.com/news/upcoming-requirements/ | Depuis le **28 avril 2026** : build avec **Xcode 26 ou plus**, SDK iOS 26 ; depuis le 9 septembre 2026 : cible de déploiement iOS 13 minimum (nous sommes à 15) |
| Capacitor 8 : pré-requis | https://capacitorjs.com/docs/getting-started/environment-setup · https://capacitorjs.com/docs/updating/8-0 | Xcode **26.0 minimum**, Node 22, **Swift Package Manager par défaut** (CocoaPods facultatif), cible de déploiement iOS **15.0**, Android Studio 2025.2.1, AGP 8.13.0, Gradle 8.14.3 |
| Plugins : clés `Info.plist` | https://capacitorjs.com/docs/apis/camera · https://capacitorjs.com/docs/apis/geolocation | Caméra : `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`, `NSPhotoLibraryUsageDescription` ; localisation : `NSLocationWhenInUseUsageDescription` **et** `NSLocationAlwaysAndWhenInUseUsageDescription` (la seconde ne déclenche aucune invite, même texte autorisé) |
| Push iOS | https://capacitorjs.com/docs/apis/push-notifications | Les deux méthodes d'`AppDelegate` qui postent `capacitorDidRegisterForRemoteNotifications` / `capacitorDidFailToRegisterForRemoteNotifications` ; capacité Push Notifications |
| Runners GitHub | https://github.com/actions/runner-images/blob/main/README.md · https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md · https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md | `macos-26` (arm64, GA ; `macos-latest` pointe dessus) avec Xcode 26.0.1 à 26.6 (défaut 26.6) dans `/Applications/Xcode_26.x.app`, Node 22 et 24, Java 17/21/25 ; `ubuntu-latest` = 24.04 : Android SDK API 36, build-tools 36.0.0, Java 17 (défaut) et 21 |
| Versions des actions | https://github.com/actions/checkout/releases · https://github.com/actions/setup-node/releases · https://github.com/actions/upload-artifact/releases · https://github.com/actions/setup-java/releases (API `releases/latest`) | `checkout` **v7**, `setup-node` **v7**, `upload-artifact` **v7**, `setup-java` **v6** (toutes en Node 24) |
| JDK pour AGP | https://developer.android.com/build/releases/gradle-plugin | JDK 17 minimum ; le projet compile en Java 21 (`android/app/capacitor.build.gradle`) : **JDK 21** (Temurin) |
| Envoi de builds | https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds | Xcode, Transporter, **`altool`** (`xcrun altool --upload-app`, livré avec Xcode, aucune dépréciation indiquée sur cette page) ou API App Store Connect |
| Clés API App Store Connect | https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api | Seul un **Admin** crée une clé ; Issuer ID + Key ID ; le `.p8` ne se télécharge **qu'une fois** |
| Signature automatique dans le cloud | https://developer.apple.com/forums/thread/698117 (forum Apple, **pas la documentation**) | La signature de **distribution** par clé API exige une clé de rôle **Admin** ; une clé App Manager échoue |
| Identifiant d'app / capacités | https://developer.apple.com/help/account/identifiers/register-an-app-id | Identifiant explicite + cases Push Notifications, Associated Domains ; rôle Account Holder ou Admin |
| Clé APNs | https://developer.apple.com/help/account/keys/create-a-private-key | Keys → + → APNs ; **téléchargement unique** ; clé « par équipe » (toutes les apps) ou « par sujet » |
| Fiche dans App Store Connect | https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app | Plateforme, nom, langue principale, identifiant d'app, SKU, accès ; l'Account Holder doit d'abord accepter le dernier contrat |
| TestFlight interne | https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers | Testeurs internes = utilisateurs App Store Connect, 100 par groupe, builds disponibles 90 jours |
| Export (chiffrement) | https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance · https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations | Les algorithmes standard/du système (HTTPS) peuvent être exemptés ; **la responsabilité de la déclaration est celle du propriétaire** (voir plus bas) |
| Manifeste de confidentialité | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api · https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests | Catégories d'API à raison requise ; types/finalités de données collectées ; **Xcode génère un rapport agrégé** (Product > Archive > Generate Privacy Report). Les listes exactes de constantes n'ont pas pu être relues sur la page : orthographe des clés `NSPrivacyCollectedDataType…` **de mémoire** (trois confirmées par recherche : `PhotosorVideos`, `EmailsOrTextMessages`, `OtherDiagnosticData`) → à confirmer par le rapport Xcode |
| Signature Android / Play App Signing | https://developer.android.com/studio/publish/app-signing | Clé d'**envoi** (la vôtre, réinitialisable) ≠ clé de **signature de l'app** (gardée par Google) ; validité de la clé : au-delà du 22 octobre 2033 |
| Test fermé Google | https://support.google.com/googleplay/android-developer/answer/14151465 | Comptes **personnels créés après le 13 novembre 2023** : **12 testeurs inscrits en continu pendant 14 jours**, puis « Demander l'accès à la production » ; examen « en général sept jours ou moins, parfois plus » |
| Tarifs CI | https://docs.github.com/en/billing/reference/actions-runner-pricing | macOS 0,062 USD/min (lu à l'étape 4, voir `STORES.md` §0) |

## Le projet iOS a-t-il pu être généré sous Windows ? **OUI**

`npm install -D @capacitor/ios@8.5.2` (même version que `@capacitor/core` et `@capacitor/android`) puis `npx cap add ios` ont fonctionné sur
cette machine Windows : Capacitor 8 crée le projet avec **Swift Package Manager** (aucun CocoaPods, aucun `pod install`, donc aucun besoin de macOS pour
générer ni synchroniser). `npx cap sync ios` fonctionne aussi (9 plugins détectés, `Package.swift` généré) et tourne également sur Linux (la CI le vérifie).
Seule la **compilation** exige macOS/Xcode : elle est faite par `ios-build.yml`. Aucun workflow « ios-bootstrap » n'est donc nécessaire.

### Fichiers (tous versionnés, rien de généré ni de sensible)

| Fichier | Rôle |
| --- | --- |
| `ios/App/App.xcodeproj/project.pbxproj` | Projet Xcode (modifié à la main à partir du modèle Capacitor : `MARKETING_VERSION` = 1.1.0, `CURRENT_PROJECT_VERSION` = 1, `CODE_SIGN_ENTITLEMENTS`, références à `App.entitlements` et `PrivacyInfo.xcprivacy` — ce dernier **copié dans le bundle** via la phase Resources —, région de développement `fr`) |
| `ios/App/App/Info.plist` | Textes d'autorisation (français), chiffrement, orientations, scènes |
| `ios/App/App/App.entitlements` | `aps-environment` (push), `com.apple.developer.associated-domains` = `applinks:<hôte de src/config/publicOrigin.json>` |
| `ios/App/App/PrivacyInfo.xcprivacy` | Manifeste de confidentialité de l'app |
| `ios/App/App/AppDelegate.swift` | + transmission du jeton APNs au plugin push |
| `ios/App/App/SceneDelegate.swift` | fourni par Capacitor 8 (cycle de vie UIScene) : ouverture d'URL et liens universels |
| `ios/App/App/Assets.xcassets/` | icône 1024 px (sans transparence) et écran de lancement clair/sombre, générés par `npm run assets:ios` depuis `assets/` |
| `ios/App/CapApp-SPM/Package.swift` | dépendances Swift Package Manager (les 9 plugins), **géré par `cap sync`** |
| `ios/.gitignore` | `App/Pods`, `App/App/public` (web copié par `cap sync`), `App/App/capacitor.config.json`, `App/App/config.xml`, `DerivedData`, `xcuserdata`, `capacitor-cordova-ios-plugins` |

Le `.gitignore` racine interdit en plus `*.p8 *.p12 *.pem *.mobileprovision *.cer *.ipa *.xcarchive GoogleService-Info.plist ExportOptions.plist`.

### Configuration iOS : décisions et écarts avec la demande

| Sujet | Valeur / décision |
| --- | --- |
| Identifiant / nom | `ca.baobab.app` / « Baobab » (Capacitor, projet Xcode, AASA, Android : un test vérifie qu'ils coïncident) |
| Version | `MARKETING_VERSION` 1.1.0 = `package.json` = `versionName` Android ; build `CURRENT_PROJECT_VERSION` 1 dans le projet, **remplacé par la CI** (numéro d'exécution) |
| Cible de déploiement | **iOS 15.0** (minimum de Capacitor 8 ; Apple exige ≥ 13) |
| Appareils | iPhone **et** iPad (réglage Capacitor par défaut). iPhone : portrait seulement ; iPad : 4 orientations (exigées par Apple pour le multitâche). **Conséquence : captures d'écran iPad 13 pouces à fournir** (`STORES.md` §13). Pour ne cibler que l'iPhone : `TARGETED_DEVICE_FAMILY = 1` dans le projet (l'app tourne alors en mode compatibilité sur iPad, sans captures iPad) — **décision du propriétaire** |
| Autorisations | Caméra, **micro** (messages vocaux, `getUserMedia` dans la WebView : Capacitor accorde l'accès au niveau WebView, iOS demande l'accord à l'utilisateur), photothèque (lecture), photothèque (ajout : présente parce que le plugin caméra la référence, jamais utilisée : `saveToGallery: false`), localisation « quand l'app est ouverte » **et** « toujours » (même texte, la seconde n'est jamais demandée). Sans ces clés l'app plante à la demande d'autorisation et Apple signale l'envoi |
| `ITSAppUsesNonExemptEncryption` | **false** : l'app n'utilise que HTTPS/WSS fournis par iOS (aucun algorithme de chiffrement maison ni bibliothèque cryptographique ajoutée). Évite la question à chaque envoi. C'est une **déclaration d'exportation sous la responsabilité du propriétaire** (Apple le précise) : à confirmer ; la France a un régime d'import séparé (ANSSI) si l'app y est distribuée |
| `UIBackgroundModes` `remote-notification` | **NON ajouté (écart volontaire avec la demande)** : ce mode ne sert qu'aux notifications **silencieuses** (`content-available`). `send-push` envoie des notifications **à alerte** (`apns-push-type: alert`, pas de `content-available`, vérifié dans `nativePush.ts`), que le système affiche sans ce mode ; la documentation Capacitor ne le demande pas ; déclarer un mode d'arrière-plan inutilisé expose à une question en revue. Pour des notifications silencieuses plus tard : ajouter la clé `UIBackgroundModes` = `remote-notification` à `Info.plist` **et** `content-available: 1` côté serveur |
| `LSApplicationQueriesSchemes` | non ajouté (l'app n'interroge aucun autre schéma d'URL) |
| Liens universels | gérés par `SceneDelegate` (Capacitor 8 = UIScene) : `application(_:open:options:)` et `application(_:continue:)` ne sont **plus** utilisés avec les scènes, rien à ajouter dans `AppDelegate` |
| `aps-environment` | `development` dans le fichier ; à l'export App Store, Xcode signe avec le profil de **distribution** (valeur `production`). Le workflow imprime les droits réellement signés pour le contrôler |
| `UIRequiredDeviceCapabilities` | `armv7` (valeur du modèle Capacitor, inchangée) |
| Région / langues | région de développement `fr`, `CFBundleLocalizations` fr + en (les boîtes système — « Autoriser » — suivent la langue du téléphone ; les textes d'autorisation sont en français) |
| Écran de lancement | storyboard Capacitor + jeu d'images `Splash` (fond #14432A clair, #14120D sombre, arbre au centre : mêmes visuels qu'Android, générés par `capacitor-assets`) ; plugin `SplashScreen` : `backgroundColor` #14432A |

### Manifeste de confidentialité (`PrivacyInfo.xcprivacy`)

- `NSPrivacyTracking` = false, aucun domaine de suivi.
- **API à raison requise : aucune déclarée.** Vérification faite : recherche de `UserDefaults`, horodatages de fichiers (`creationDate`,
  `modificationDate`, `attributesOfItem`, `stat`), heure de démarrage (`systemUptime`, `mach_absolute_time`), espace disque
  (`volumeAvailableCapacity`, `systemFreeSize`), claviers actifs (`activeInputModes`) dans **tout** `node_modules/@capacitor/ios`, `CapacitorCordova`
  et les 9 plugins : **aucune occurrence** (Capacitor 8 stocke ses valeurs dans des fichiers, pas dans `UserDefaults`). Le code Swift de l'app
  (`AppDelegate`, `SceneDelegate`) n'en utilise pas non plus. **Limite** : les dépendances Swift récupérées au moment du build (`ion-ios-camera`,
  `ion-ios-geolocation`, `capacitor-swift-pm`) ne sont pas lisibles ici ; si Apple répond après un envoi par un e-mail « ITMS-91053 » (déclaration
  manquante), ajouter la catégorie et la raison citées dans l'e-mail au tableau `NSPrivacyAccessedAPITypes`.
- **Données collectées** (14 types, tous « liées à l'identité », jamais pour le suivi) alignées sur `STORES.md` §8 : adresse e-mail, nom, localisation
  **approximative**, données sensibles (origine/statut d'immigration — **[À VALIDER]**, sur-déclarer coûte moins cher), photos/vidéos, données audio,
  messages, assistance client, autre contenu, identifiant utilisateur, identifiant d'appareil (jeton APNs), interaction avec le produit, plantages, autres
  diagnostics. **Achats : non déclarés** (pas de Premium dans l'app native, recommandation option C). Les réponses de l'étiquette « App Privacy » dans App
  Store Connect doivent rester **identiques** à ce fichier.

### Icône et écran de lancement

`npm run assets:ios` (= `capacitor-assets generate --ios --assetPath assets`, fonctionne sous Windows) a produit `AppIcon-512@2x.png` (**1024×1024, PNG
sans canal alpha** : Apple refuse l'icône transparente, vérifié par un test) et 6 images d'écran de lancement (clair/sombre ×1/×2/×3). Les trois anciens
visuels de remplacement du modèle Capacitor ont été supprimés. Même source qu'Android (`assets/icon-only.png`, `splash*.png`, voir étape 2) ; le propriétaire
doit toujours fournir le logo vectoriel/≥ 1024 px pour une meilleure netteté.

### Correctif Android découvert en chemin : micro

`getUserMedia` (messages vocaux) dans la WebView Android exige `RECORD_AUDIO` **et** `MODIFY_AUDIO_SETTINGS` dans le manifeste : Capacitor
(`BridgeWebChromeClient.onPermissionRequest`) les demande à l'exécution, et une permission non déclarée est refusée d'office. Elles manquaient : **les messages
vocaux n'auraient pas fonctionné sur Android**. Ajoutées à `AndroidManifest.xml` (invite au premier clic sur le micro seulement). Conséquence pour Google Play :
la permission « microphone » apparaît (déjà couverte par « Fichiers audio » dans la Sécurité des données, `STORES.md` §9).

## Signature Android et numéro de version (`android/app/build.gradle`)

- **Signature de release** : lue dans les variables d'environnement `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
  (ce que fait la CI), sinon dans `android/keystore.properties` (ignoré par git : `storeFile`, `storePassword`, `keyAlias`, `keyPassword`). Sans l'un ni l'autre,
  `bundleRelease` produit un AAB **non signé**. Aucune clé dans le dépôt.
- **`versionCode`** : `-PbaobabVersionCode=<n>` (la CI passe le numéro d'exécution du workflow, ou le champ `version_code` du lancement manuel) ; **1** en build
  local. Google Play exige un entier **strictement croissant** à chaque envoi.
- **Numéro de build iOS** : `CURRENT_PROJECT_VERSION` remplacé par la CI de la même façon (champ `build_number` ou numéro d'exécution). TestFlight refuse deux
  builds de même numéro pour une même version (`MARKETING_VERSION`). Pour une nouvelle version publique : changer la version dans `package.json`, `android/app/build.gradle`
  (`versionName`) **et** `project.pbxproj` (`MARKETING_VERSION`, 2 endroits) — un test vérifie qu'ils coïncident.

## Workflows GitHub Actions (`.github/workflows/`)

Principes communs : **aucun secret dans le dépôt** ; `permissions: contents: read` ; `concurrency` (annule les doublons) ; `timeout-minutes` ; `GITHUB_TOKEN`
implicite seulement (`persist-credentials: false`) ; actions `actions/*` épinglées au tag majeur courant ; les secrets ne sont lus que dans l'environnement de l'étape
qui en a besoin (jamais au niveau du job : un `postinstall` npm n'y a pas accès), jamais dans un script `run`, jamais affichés (aucun `set -x`) ; une étape
« Détecter les secrets » n'en exporte que des booléens (`if: steps.detect.outputs.signing == 'true'` : l'équivalent sûr de `if: env.X != ''`, qui ne
fonctionnerait pas pour un secret à portée d'étape).

| Workflow | Déclencheurs | Secrets attendus (noms exacts) | Produit |
| --- | --- | --- | --- |
| `ci.yml` | `pull_request` vers `main` et `push` sur `main` | aucun (valeurs bidon pour les variables `VITE_*`) | build web, suite de tests (`--pool=forks --poolOptions.forks.singleFork=true`), `cap sync android` et `cap sync ios`, vérification que `Package.swift`/`capacitor.build.gradle` versionnés sont à jour. Ne compile rien de natif, ne publie rien |
| `android-build.yml` | **manuel seulement** (champ facultatif `version_code`) | facultatifs : `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` ; recommandés : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | **toujours** : APK de debug (valide que le projet compile), manifestes fusionnés (journal + artefact) et liste des permissions (journal + résumé du job). **Si les 4 secrets de signature existent** : AAB de release signé (artefact, 14 jours) et empreinte SHA-256 du certificat. Aucun envoi à Google Play (le premier AAB se téléverse à la main) |
| `ios-build.yml` | **manuel** (champs `build_number`, case `upload_testflight`) ou **tag `v*`** ; jamais un push de branche | facultatifs : `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_KEY_P8` (contenu du fichier), `APPLE_TEAM_ID` ; recommandés : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | **toujours** : compilation pour le simulateur sans signature. **Si les 4 secrets Apple existent** : archive signé (signature **automatique** par la clé API), export `.ipa` (artefact, 7 jours), contrôle des droits signés, puis envoi à **TestFlight** (build de test : rien n'est soumis à la revue) |

Détails à connaître :

- **Valeurs `VITE_*`** : le build web les **grave** dans l'app. Sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (mêmes valeurs publiques que sur Vercel), les workflows compilent
  avec des valeurs bidon (utile pour valider la compilation, l'app ne se connectera à rien) ; **avec des secrets de signature mais sans ces deux valeurs, le workflow
  échoue volontairement** plutôt que de produire un AAB/IPA inutilisable.
- **Android** : JDK 21 (Temurin), Android SDK préinstallé sur `ubuntu-latest` (API 36, build-tools 36.0.0), `./gradlew assembleDebug processReleaseMainManifest`. Le journal
  affiche chaque manifeste fusionné trouvé puis les permissions effectives (script `scripts/android-merged-permissions.mjs`, testé). **Attendu aujourd'hui** (à confirmer au
  premier passage) : `INTERNET`, `POST_NOTIFICATIONS`, `ACCESS_COARSE_LOCATION`, `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `VIBRATE`, plus celles que Firebase/Google Play
  Services ajoutent quand `google-services.json` est présent (réseau, réveil, `com.google.android.c2dm…`). Toute permission **inattendue** (caméra, stockage, position précise,
  contacts) est à examiner avant d'envoyer l'AAB. Le nom exact de la tâche Gradle `processReleaseMainManifest` n'a pas pu être exécuté ici ; si Gradle la refusait, il suffirait de la retirer de
  la ligne de l'étape « APK de debug » (le manifeste de la variante debug est produit de toute façon par `assembleDebug`).
- **iOS** : `macos-26`, Xcode 26 le plus récent installé (le workflow vérifie `≥ 26`), `xcodebuild -list` et `-resolvePackageDependencies` d'abord (le journal montre les schémas),
  compilation simulateur `-sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO`. Le projet n'a **pas de schéma partagé** (modèle Capacitor) :
  `xcodebuild` utilise le schéma implicite « App ». Si une exécution échoue sur ce point, ouvrir le projet sur un Mac une fois (Xcode crée alors un schéma partagé) et le committer.
- **Signature iOS automatique** : `xcodebuild archive -allowProvisioningUpdates -authenticationKeyPath/ID/IssuerID` + `exportArchive` avec `ExportOptions.plist` créé à l'exécution
  (`method: app-store-connect`, `signingStyle: automatic`, `manageAppVersionAndBuildNumber: false`). **La clé API doit avoir le rôle Admin** (voir sources) : c'est un compromis de
  sécurité — une clé Admin peut tout faire dans App Store Connect : la stocker uniquement comme secret GitHub, la **révoquer** (App Store Connect > Utilisateurs et accès > Intégrations)
  au moindre doute. Alternative non implémentée : certificats et profils manuels (fastlane `match` ou secrets de certificat `.p12` + profil), qui évitent la clé Admin mais exigent plus
  d'étapes. L'identifiant d'app et ses capacités doivent exister (guide, C2).
- **Envoi TestFlight** : `xcrun altool --upload-app -f <ipa> -t ios --apiKey … --apiIssuer …` (outil d'Apple livré avec Xcode : aucun tiers ne reçoit la clé). Alternative maintenue si `altool`
  venait à être retiré : l'action `apple-actions/upload-testflight-build@v5` (v5.5.1 à la date de vérification), non utilisée ici pour ne confier la clé à aucune action tierce.
- **Coût iOS** : un build macOS dure typiquement 15 à 25 minutes (**estimation**, non mesurée) ; tarif lu à l'étape 4 : 0,062 USD/min, soit environ 1 à 1,6 USD par exécution. Dépôt privé ou
  public : vérifier la facturation sur https://docs.github.com/en/billing/reference/actions-runner-pricing.

## Scripts npm ajoutés

| Commande | Effet |
| --- | --- |
| `npm run cap:sync:ios` | `vite build && cap sync ios` (fonctionne aussi sous Windows) |
| `npm run cap:open:ios` | ouvre le projet dans Xcode (**macOS uniquement**) |
| `npm run ios:build:sim` | `xcodebuild` simulateur sans signature (**macOS uniquement**, sert de mémo : la CI fait la même chose) |
| `npm run assets:ios` | régénère l'icône et l'écran de lancement iOS depuis `assets/` |

`npm run build` est **inchangé** (Vercel). Nouveaux paquets de développement : `@capacitor/ios` 8.5.2, `yaml` et `plist` (uniquement pour les tests).

## Tests ajoutés

`src/native/step5Ios.test.js` : textes d'autorisation, chiffrement, absence de clés inutiles, orientations, entitlements (hôte = `publicOrigin.json`), identifiant d'app partout identique,
version = `package.json`, cible iOS 15, références du `pbxproj` (entitlements, manifeste copié dans le bundle, intégrité des identifiants), Swift Package Manager, `AppDelegate` push, manifeste de
confidentialité (types et finalités autorisés, aucune donnée de suivi), icône 1024 sans alpha, splash, absence de fichier/clé sensible dans le dépôt, script de permissions Android.
`src/native/step5Workflows.test.js` : syntaxe YAML (parseur `yaml`), permissions minimales, `concurrency`/`timeout`, **aucun déclencheur `push` de branche** pour les builds natifs, secrets
(noms autorisés, jamais dans un `run`, jamais de `set -x`, aucun blob/clé en clair, aucune injection de script), étapes sensibles conditionnées, actions épinglées par tag majeur, runners, Node 22 / JDK 21.

## Vérifications effectuées (étape 5)

- `npm run build` : OK (bundle principal 487,2 ko brut, 142,0 ko gzip ; `dist/` produit comme avant, `index.html` et ses hash CSP inchangés).
- `npx cap sync android` et `npx cap sync ios` : OK, 9 plugins chacun ; les fichiers versionnés (`Package.swift`, `capacitor.build.gradle`, `capacitor.settings.gradle`) restent inchangés après la synchronisation.
- Suite complète : **239 fichiers, 1 634 tests, tous verts, 0 « unhandled error »** (`npx vitest run --pool=forks --poolOptions.forks.singleFork=true`), dont les 64 nouveaux tests des deux fichiers `step5*`.
- Syntaxe : les 3 workflows sont parsés par `yaml` (tests) et tous leurs scripts `run` passent `bash -n`. Les fichiers `.plist` / `.xcprivacy` / `.entitlements` sont parsés par `plist` (tests). Le `pbxproj` n'a pas de parseur ici : intégrité des
  références vérifiée par test (chaque identifiant référencé est défini, le fichier est dans le groupe et la phase Resources).
- `git ls-files` : aucun fichier `.p8 .p12 .pem .jks .keystore .mobileprovision .cer`, `google-services.json`, `GoogleService-Info.plist`, `keystore.properties` (test + recherche).

## Ce qui n'a PAS pu être vérifié (aucun Mac, aucun JDK, aucune CI exécutée)

- **`ci.yml` a tourné sur GitHub : VERT** (commit `2d2e040`, build + 1 634 tests + `cap sync android`/`ios` + contrôle de dérive, sur ubuntu). Son premier passage avait révélé que la CI échouait déjà depuis l'étape 3a : la valeur bidon `VITE_VAPID_PUBLIC_KEY` n'était pas du base64url décodable (test `pushNotifications.webUnchanged`) ; corrigé dans `ci.yml`. **`android-build.yml` et `ios-build.yml` n'ont jamais tourné** (lancement manuel : à faire par le propriétaire). Le premier lancement révélera d'éventuelles erreurs : noms de tâches Gradle, chemin exact des manifestes fusionnés, schéma Xcode implicite, résolution Swift Package Manager (téléchargement de `capacitor-swift-pm`, `ion-ios-camera`…),
  signature automatique, `altool`. Les workflows sont écrits pour échouer **clairement** (journal des 200 dernières lignes pour le simulateur, artefacts) et la compilation sans secret tourne avant tout ce qui est signé.
- **Gradle** : le bloc de signature et `versionCode` de `build.gradle` n'ont jamais été exécutés (syntaxe Groovy de mémoire, calquée sur la documentation Android) ; `assembleDebug` n'a jamais tourné non plus (étape 1).
- **Xcode** : le `project.pbxproj` modifié à la main n'a jamais été ouvert dans Xcode ; l'entitlements / le manifeste de confidentialité n'ont pas été soumis à la validation d'Apple. Le rapport « Generate Privacy Report » n'a pas été produit.
- **Signature automatique par clé API** : ni la création du certificat de distribution, ni l'enregistrement automatique des capacités (Push, Associated Domains) n'ont été testés ; d'où la recommandation de créer l'identifiant d'app et ses capacités soi-même (guide C2).
- Aucune permission réelle, aucun jeton APNs, aucun lien universel (AASA : Team ID à remplacer), aucune notification, aucun message vocal sur iPhone.

## Risques de régression à auditer

1. `android/app/build.gradle` : `versionCode` passe par `baobabVersionCode` (valeur 1 inchangée en local) et un bloc de signature conditionnel est ajouté ; sans variables de signature, `assembleDebug`/`bundleRelease` se comportent comme avant (AAB non signé).
2. `AndroidManifest.xml` : **deux permissions ajoutées** (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`) : le micro apparaît dans la fiche Google Play (Sécurité des données déjà alignée) ; test mis à jour (`step5Ios.test.js`).
3. `.github/workflows/ci.yml` : actions passées en v7/v6, étape supplémentaire `cap sync` + contrôle de dérive (`git diff --exit-code`) : si elle échoue, lancer `npx cap sync` et committer `Package.swift` / `capacitor.build.gradle`.
4. `package.json` / `package-lock.json` : trois devDependencies ajoutées (`@capacitor/ios`, `yaml`, `plist`) ; `npm ci` doit rester propre.
5. Le web (Vercel) n'est pas touché : aucun fichier de `src/` hors tests n'a changé.

---

# GUIDE DE PUBLICATION (pour quelqu'un qui n'a jamais publié d'application)

Lecture conseillée : tout le guide une fois, puis suivre **(F) Ordre recommandé**. Les noms de menus des consoles changent souvent : si un libellé diffère, cherchez le mot-clé
(« API », « Keys », « Signing »). Rien dans ce guide ne coûte ni n'engage sans votre clic : les comptes (A) coûtent de l'argent réel.

## (A) Créer les comptes

| Compte | Coût (voir `STORES.md` §0 et §14) | À savoir |
| --- | --- | --- |
| **Apple Developer Program** (https://developer.apple.com/programs/enroll/) | **99 USD / an** | Identifiant Apple avec double authentification ; **particulier** : nom légal affiché comme vendeur, pas de D-U-N-S ; **organisation** : numéro D-U-N-S, entité légale, site web (délai variable). Le titulaire du compte (« Account Holder ») doit accepter les contrats dans App Store Connect avant de créer une app |
| **Google Play Console** (https://play.google.com/console) | **25 USD, une fois** | Pièce d'identité officielle + carte à votre nom légal ; vérification d'un appareil Android (application mobile Play Console). **Compte personnel créé après le 13 novembre 2023 : test fermé obligatoire** (B7) |
| **GitHub** (déjà là) | selon facturation | Le dépôt héberge les workflows ; secrets : Settings du dépôt |
| **Firebase** (https://console.firebase.google.com) | sans frais pour FCM (forfait Spark) | Compte Google |

## (B) Android

### B1. Générer la clé d'envoi (keystore) — **une seule fois, à ne jamais perdre**

1. `keytool` est fourni avec Android Studio (JDK intégré, dossier `jbr\bin`, par exemple `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe` — chemin à vérifier) ou avec tout JDK 17+
   (installation possible : `winget install EclipseAdoptium.Temurin.21.JDK`, identifiant à confirmer avec `winget search temurin`).
2. Créez un dossier **hors du dépôt et hors de OneDrive** (le projet est dans `Desktop`, synchronisé par OneDrive), par exemple `C:\Baobab-cles\`, puis dans PowerShell :

```
cd C:\Baobab-cles
keytool -genkeypair -v -keystore baobab-upload.keystore -alias baobab-upload -keyalg RSA -keysize 2048 -validity 10000 -storetype PKCS12
```

3. `keytool` demande un mot de passe (choisir un mot de passe long, **le noter dans un gestionnaire de mots de passe**), puis nom/organisation/pays (« CA »). Avec PKCS12, le mot de passe de la clé est **le même** que celui du keystore :
   vous donnerez donc la même valeur à `ANDROID_KEYSTORE_PASSWORD` et `ANDROID_KEY_PASSWORD`. L'alias est `baobab-upload`. La validité de 10 000 jours (≈ 27 ans) dépasse l'exigence de Google (au-delà du 22 octobre 2033).
4. **Sauvegardez** `baobab-upload.keystore` **et** le mot de passe dans au moins **deux** endroits hors dépôt (gestionnaire de mots de passe + clé USB). Ne l'envoyez jamais par e-mail ni dans le dépôt (`.gitignore` bloque `*.keystore`).
5. **Activez Play App Signing** (B6) : c'est le réglage par défaut des nouvelles apps. Votre keystore est alors la clé d'**envoi** : si vous la perdez, Google permet de la **réinitialiser** (demande dans la Play Console) ; la clé qui signe réellement l'app chez les utilisateurs est gardée par Google.

### B2. Encoder le keystore en base64 et créer les secrets GitHub

1. Dans PowerShell, copiez le keystore encodé dans le presse-papiers (rien n'est affiché) :
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\Baobab-cles\baobab-upload.keystore')) | Set-Clipboard`
2. Sur GitHub : le dépôt → **Settings → Secrets and variables → Actions → New repository secret**. Créez (nom exact → valeur) :

| Nom | Valeur |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | le contenu du presse-papiers (collez, une seule ligne) |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | `baobab-upload` |
| `ANDROID_KEY_PASSWORD` | le même mot de passe (PKCS12) |
| `VITE_SUPABASE_URL` | l'URL du projet Supabase (Supabase → Project Settings → API ; même valeur que la variable Vercel du même nom) |
| `VITE_SUPABASE_ANON_KEY` | la clé « anon » publique (même page ; même valeur que sur Vercel). **Jamais** la clé « service_role » |

3. Effacez ensuite le presse-papiers (copiez un autre texte).

### B3. (Avant le premier build « de production ») Firebase

Voir (D) : sans `android/app/google-services.json`, l'app se construit mais les notifications push sont désactivées.

### B4. Lancer le workflow

GitHub → onglet **Actions → Android build → Run workflow** (laissez `version_code` vide : le numéro d'exécution sert de `versionCode`, croissant ; s'il doit dépasser un numéro déjà envoyé à Google, saisissez-le). Durée : quelques minutes
à une dizaine (estimation). Sans secrets de signature : seul l'APK de debug est construit (bon test de compilation).

### B5. Lire le résultat et récupérer l'AAB

1. Ouvrez l'exécution : étape **« Afficher le manifeste fusionné et les permissions effectives »** (et le « Summary » en bas de page) = ce que Google Play analysera. Vérifiez qu'il n'y a **aucune permission surprenante** (attendu : réseau, notifications, position approximative,
   micro, vibration + celles de Firebase si présent).
2. Section **Artifacts** en bas : `baobab-android-release-aab` (l'`.aab`, à envoyer à Google), `baobab-android-debug-apk` (à installer sur un téléphone de test pour essayer sans passer par Google : activer l'installation d'apps inconnues),
   `baobab-android-merged-manifests`. L'étape « Empreinte SHA-256 » imprime l'empreinte de la clé d'**envoi** (utile pour B8).

### B6. Créer la fiche Play Console et envoyer le premier AAB

1. Play Console → **Créer une application** (nom — vérifier la disponibilité de « Baobab : rencontres au Canada » —, langue par défaut, application (pas jeu), gratuite) → accepter les déclarations.
2. **Version → Test → Test interne** : créer une version, **téléverser l'AAB** (le tout premier se téléverse à la main), laisser **Play App Signing activé**. Ajouter vos adresses e-mail comme testeurs internes : installation immédiate sur vos téléphones via le lien.
3. Remplir **Contenu de l'application** : politique de confidentialité (`https://baobab-app-zeta.vercel.app/confidentialite`), **Sécurité des données** (réponses prêtes : `STORES.md` §9), classification du contenu (IARC, `STORES.md` §11), **public cible 18 ans et plus** + restriction aux mineurs,
   **suppression de compte** (URL `…/suppression-compte`), **normes de sécurité des enfants** (page à publier + contact, `STORES.md` §14 n°9), publicités : non. **Fiche principale** : textes et captures (`STORES.md` §12–13).

### B7. Test fermé obligatoire (comptes personnels créés après le 13 novembre 2023)

Règle lue le 7 octobre 2026 (https://support.google.com/googleplay/android-developer/answer/14151465) : **12 testeurs au minimum, inscrits en continu pendant 14 jours** (s'ils se désinscrivent puis se réinscrivent, les 14 jours
doivent être consécutifs), puis bouton **« Demander l'accès à la production »** (formulaire sur le test, l'app et la préparation) ; l'examen prend « en général sept jours ou moins, parfois plus ». **À revérifier au moment de le faire** : la règle a déjà évolué. Recrutez 12 personnes **réelles**
tôt : c'est le délai le plus long du projet. **Démarrez ce test dès que le premier AAB est prêt**, sans attendre l'iOS.

### B8. Empreinte SHA-256 → `assetlinks.json` (liens d'app)

Après le premier envoi : Play Console → **Version → Configuration → Intégrité de l'application → Signature d'application** (libellés à confirmer) : copiez l'empreinte **SHA-256 du certificat de signature de l'application** (celle de Google) — et, si vous voulez tester avec l'APK/AAB signé localement, celle de votre clé d'envoi
(imprimée par le workflow). Collez-les dans `public/.well-known/assetlinks.json` (champ `sha256_cert_fingerprints`, plusieurs valeurs possibles, format `AA:BB:…`), déployez le site (Vercel), puis vérifiez :
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://baobab-app-zeta.vercel.app&relation=delegate_permission/common.handle_all_urls`. Un test du dépôt exige aujourd'hui que le champ commence par « REMPLACER » : **mettez-le à jour avec la vraie valeur** (`src/native/step3aConfig.test.js`).

## (C) iOS

Prérequis : compte Apple Developer actif (A), contrats acceptés par l'Account Holder.

### C1. Identifiant d'app (App ID) avec les capacités

developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers → +** → **App IDs** → type App → **Explicit** → Bundle ID **`ca.baobab.app`** → cocher **Push Notifications** et **Associated Domains** → Register.
(Rôle Account Holder ou Admin.) Sans cela, la signature automatique peut échouer ou produire un profil sans ces droits.

### C2. Clé API App Store Connect (pour la CI)

App Store Connect (https://appstoreconnect.apple.com) → **Utilisateurs et accès → Intégrations → App Store Connect API → clés d'équipe → « + »** : nom `GitHub CI`, accès **Admin** (nécessaire à la signature de distribution automatique ; compromis expliqué plus haut) → **Télécharger la clé (`AuthKey_XXXXXXXXXX.p8`) : possible UNE SEULE fois**, sauvegardez-la hors dépôt.
Notez l'**Issuer ID** (en haut de la page, un UUID) et le **Key ID** (colonne de la clé). **Cette clé n'est PAS la clé APNs de C5** : ce sont deux fichiers `.p8` différents.
Créez les secrets GitHub (même chemin que B2) :

| Nom | Valeur |
| --- | --- |
| `APP_STORE_CONNECT_ISSUER_ID` | l'Issuer ID |
| `APP_STORE_CONNECT_KEY_ID` | le Key ID |
| `APP_STORE_CONNECT_KEY_P8` | **tout le contenu** du fichier `.p8` (ouvrir avec le Bloc-notes, copier de `-----BEGIN PRIVATE KEY-----` à `-----END PRIVATE KEY-----`) |
| `APPLE_TEAM_ID` | l'identifiant d'équipe (10 caractères : developer.apple.com → Compte → **Membership details**) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | comme B2 (déjà créés si vous avez fait Android) |

### C3. Créer l'app dans App Store Connect

App Store Connect → **Apps → « + » → Nouvelle app** : plateforme iOS, nom (30 caractères max, disponibilité à vérifier), langue principale (français Canada), **identifiant d'app `ca.baobab.app`** (liste de ceux enregistrés en C1), **SKU** (au choix, ex. `baobab-ios-001`, jamais affiché), accès complet. La fiche existe alors, vide, et attend un build.

### C4. Activer les services côté Apple si nécessaire

Associated Domains et Push sont cochés en C1. Rien d'autre à activer pour Baobab (pas de Sign in with Apple : STORES.md §4).

### C5. Clé APNs (pour que Supabase envoie les notifications iOS)

developer.apple.com → **Keys → « + »** → nom `Baobab APNs` → cocher **Apple Push Notifications service (APNs)** → Configure : clé « par équipe » (la plus simple) → Continue → Register → **Download** (`AuthKey_YYYYYYYYYY.p8`, **une seule fois**). Notez son **Key ID** et le Team ID.
Puis (terminal, voir `DEPLOIEMENT.md` §11b) : `supabase secrets set APNS_KEY_P8="$(cat AuthKey_YYYYYYYYYY.p8)" APNS_KEY_ID=YYYYYYYYYY APNS_TEAM_ID=<Team ID>`. Ne **jamais** mettre cette clé dans GitHub ni dans le dépôt.
Pendant les tests TestFlight/Xcode (certificat de développement), le jeton est « sandbox » ; la fonction réessaie sur l'autre environnement avant de supprimer un jeton (voir étape 3a).

### C6. Team ID → `apple-app-site-association` (liens universels)

Remplacez `REMPLACER_PAR_LE_TEAM_ID_APPLE` dans `public/.well-known/apple-app-site-association` par votre Team ID (c'est le préfixe de l'identifiant, ex. `ABCDE12345.ca.baobab.app`) — public, pas un secret —, déployez sur Vercel, puis vérifiez :
`curl -sI https://baobab-app-zeta.vercel.app/.well-known/apple-app-site-association` doit répondre `200` et `content-type: application/json`, **sans redirection**. Le test `step3aConfig.test.js` exige aujourd'hui « REMPLACER… » : adaptez-le.

### C7. Lancer le workflow iOS

GitHub → **Actions → iOS build → Run workflow** (laissez `build_number` vide et la case **upload_testflight** cochée). Le workflow : compile pour le simulateur (échoue ici si le code ne compile pas), puis archive signé, exporte l'`.ipa`, **affiche les droits signés** (vérifiez
`aps-environment` = `production` et `applinks:baobab-app-zeta.vercel.app`) et envoie à **TestFlight**. Un tag `v1.1.0` poussé déclenche le même travail (envoi compris). Durée : 15 à 25 minutes (estimation).
En cas d'échec voir « Dépannage » ci-dessous.

### C8. TestFlight (testeurs internes)

Après l'envoi, App Store Connect traite le build (quelques minutes à une heure, variable) : un e-mail confirme. App Store Connect → votre app → **TestFlight** : le build apparaît ; la question de conformité à l'exportation est déjà répondue par `Info.plist`.
**Testeurs internes** : seuls des utilisateurs de votre équipe App Store Connect (jusqu'à 100 par groupe ; Utilisateurs et accès → ajouter l'adresse du testeur avec un rôle « Developer » ou « App Manager »). Ils installent l'app **TestFlight** sur leur iPhone et acceptent l'invitation. Le build reste disponible 90 jours.

### C9. Soumettre à la revue de l'App Store (VOUS, jamais la CI)

App Store Connect → app → version 1.1.0 : textes et mots-clés (`STORES.md` §12), captures (§13 ; **iPad 13" si l'app est proposée sur iPad**), **App Privacy** (réponses du §8, identiques au manifeste), **classification d'âge** avec « Override to Higher Age Rating » = 18+ (§11),
URL de confidentialité, **URL d'assistance (obligatoire : exige `supportEmail`)**, catégorie « Réseaux sociaux », sélectionner le build, et dans **Notes pour la revue** : identifiants du **compte de démonstration** (compte e-mail déjà confirmé, onboarding terminé, avec une
**position au Canada récente** car l'onglet Rencontres est réservé au Canada : `STORES.md` §14 n°11 — jamais dans le dépôt), description de la modération (signalement, blocage, délai visé). Puis « Ajouter pour examen ». **Aucun Premium ne doit apparaître dans l'app native** (voir Risques).

### Dépannage (premiers échecs probables)

| Message | Cause probable | Que faire |
| --- | --- | --- |
| « No profiles for 'ca.baobab.app' were found » / profil sans capacité Push ou Associated Domains | identifiant d'app absent ou capacités non cochées | C1 ; relancer |
| « Cloud signing permission error » / refus de créer un certificat de distribution | clé API non **Admin** | recréer la clé avec l'accès Admin (C2), remplacer les 3 secrets |
| « Unable to find a destination … iOS Simulator » / schéma introuvable | schéma implicite « App » | voir « Détails à connaître » (ouvrir une fois sur un Mac, committer le schéma partagé) |
| Échec de résolution des paquets Swift | réseau / dépôt Swift indisponible | relancer ; lire le journal de l'étape `-resolvePackageDependencies` |
| « The bundle version must be higher than the previously uploaded version » | numéro de build déjà utilisé | saisir un `build_number` plus grand |
| E-mail d'Apple « ITMS-90683 Missing purpose string » | clé `Info.plist` manquante pour une API référencée | ajouter la clé (texte français honnête) |
| E-mail d'Apple « ITMS-91053 Missing API declaration » | API à raison requise non déclarée | l'ajouter à `PrivacyInfo.xcprivacy` (catégorie + raison citées) |
| Android : « Keystore was tampered with, or password was incorrect » | mauvais `ANDROID_KEYSTORE_PASSWORD` | vérifier le secret |
| Play : « Le code de version … a déjà été utilisé » | `versionCode` déjà envoyé | relancer avec un `version_code` plus grand |

## (D) Firebase (notifications Android)

1. https://console.firebase.google.com → **Ajouter un projet** (Analytics facultatif : le refuser réduit les données collectées).
2. **Paramètres du projet → Vos applications → Ajouter une application → Android** : nom du package **`ca.baobab.app`** (SHA-1 facultatif pour FCM). Télécharger **`google-services.json`**.
3. Placer le fichier dans **`android/app/google-services.json`** et le **committer** (identifiants publics du projet, pas de clé privée : décision déjà documentée à l'étape 1).
4. **Paramètres du projet → Comptes de service → Générer une nouvelle clé privée** (JSON, **secret**) ; vérifier que l'API « Firebase Cloud Messaging API (V1) » est activée ; puis `supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat compte-de-service.json)"` (Git Bash). Ne jamais committer ce JSON.
5. Aucune app iOS Firebase n'est nécessaire (APNs direct, voir étape 3a).

## (E) Ce qui reste à déployer côté Supabase

Source de vérité et commandes exactes : **`DEPLOIEMENT.md`** (relire l'état à jour ; ce qui suit est un **ordre suggéré**, vérifié le 7 octobre 2026). Aucune de ces actions n'a été faite par les agents.

1. SQL `supabase-age-check-server-side.sql` (priorité : contrainte 18 ans côté serveur ; puis `validate constraint` après vérification qu'aucune ligne ne la viole).
2. SQL `supabase-content-select-block-filter-fix.sql` (§12c : filtre de lecture du blocage), `supabase-indexes-launch-fix.sql` (§10), correctif `can_view_event()` (§8).
3. SQL `supabase-device-tokens.sql` (§11a : jetons push natifs).
4. SQL orphelins et modération : `supabase-community-orphan-guard-fix.sql`, `supabase-community-role-change-orphan-fix.sql`, `supabase-community-orphan-account-deletion-fix.sql`, `supabase-event-orphan-account-deletion-fix.sql` (§1d–§1f), `supabase-admin-resolve-report-race-fix.sql`.
5. Secrets (FCM, APNs : D4 et C5) puis edge functions : `send-push` (§11b), **`process-scheduled-deletions`** (§12b, suppression de compte exigée par les boutiques), `cleanup-expired-stories` (§2b).
6. SQL `supabase-push-notifications-triggers.sql` (§1c) **après** `send-push` : sans lui aucune notification ne part ; **décider avant** si le push « like » doit nommer la personne (risque 6 de l'étape 3a : Premium/admirateurs).
7. Facultatifs : `supabase-unaccent-search.sql` (§1b), `supabase-post-report-minor-category.sql` (§12a).
8. `stripe-webhook` (§2a) **seulement** si le Premium web doit exister : il répond 404 aujourd'hui (jamais déployé).
9. `src/config/contact.json` : renseigner `supportEmail` et `operatorName` puis redéployer le site (§12d).

## (F) Ordre recommandé des opérations et durées typiques

Les durées d'approbation sont **variables** (non garanties) ; seuls chiffres lus : test fermé Google 14 jours, examen de l'accès à la production « en général sept jours ou moins ».

1. **Aujourd'hui** : créer les comptes Apple et Google (A) — la vérification d'identité et le D-U-N-S (organisation) sont les délais les moins prévisibles. Recruter les 12 testeurs Google.
2. Renseigner `contact.json`, trancher le Premium (**option C : masquer prix/CTA Premium en natif, ≈ 1 jour de code, à faire AVANT toute soumission** : `STORES.md` §6.4) et le filtre de contenu.
3. Supabase (E) : au minimum les points 1 à 5.
4. Firebase (D), puis secrets GitHub Android (B2), lancer **Android build** (B4), corriger ce que la première compilation révèle, créer la fiche Play et démarrer le **test fermé** (B6–B7) : le compte à rebours de 14 jours commence.
5. Pendant ces 14 jours : identifiant d'app et clés Apple (C1, C2, C5), créer l'app (C3), Team ID dans AASA (C6), lancer **iOS build** (C7), tester sur de vrais iPhone via TestFlight (C8) avec la **checklist** ci-dessous.
6. Corriger, répéter les builds (numéros de build croissants), préparer fiches, captures, notes de revue (C9, B6).
7. Soumettre iOS à la revue ; demander l'accès à la production Android une fois les 14 jours écoulés ; surveiller les e-mails des deux boutiques.
8. Après acceptation : publier, vérifier `assetlinks.json` / AASA, surveiller les erreurs (`client_errors`) et les signalements.

## (G) Tableau d'avancement final et ce que seul le propriétaire peut faire

| Étape | Contenu | Code/documents | Vérifié sur appareil ou en vrai build ? |
| --- | --- | --- | --- |
| 1 | Capacitor + projet Android | Fait | **Non** : `assembleDebug` jamais exécuté avant la première CI |
| 2 | Interface mobile, splash, icônes | Fait | **Non** (aucun téléphone ; émulation navigateur seulement) |
| 3a | Push natif, présence, liens profonds | Fait | **Non** (aucune notification envoyée ni reçue ; AASA/assetlinks avec valeurs à remplacer) |
| 3b | Caméra, localisation, partage, haptique, retour Android | Fait | **Non** |
| 4 | Exigences des boutiques (UGC, suppression de compte, légal, questionnaires) | Fait (code + `STORES.md`) | **Non soumis** ; décisions et comptes à faire par le propriétaire |
| 5 | Projet iOS, CI Android/iOS, guide | Fait (ce document) | **Non** : aucun workflow exécuté, aucun Mac, aucun Xcode |

**Ce que seul le propriétaire peut faire** (liste consolidée) :

1. Comptes Apple Developer (99 USD/an) et Google Play (25 USD), vérifications d'identité ; D-U-N-S si organisation.
2. Créer et **sauvegarder** le keystore Android ; créer **tous** les secrets GitHub (Android : 4 + 2 ; iOS : 4 + 2) ; ne jamais les coller dans une conversation ni un fichier du dépôt.
3. Créer l'identifiant d'app Apple et ses capacités, la clé API App Store Connect (Admin), la clé APNs, l'app dans App Store Connect, la fiche Play Console.
4. Firebase : projet, `google-services.json` (à committer), compte de service FCM (secret Supabase).
5. Exécuter le SQL et déployer les edge functions listés en (E) ; poser les secrets Supabase.
6. Renseigner `src/config/contact.json` ; Team ID dans AASA ; empreintes SHA-256 dans `assetlinks.json` (puis adapter le test `step3aConfig.test.js`).
7. Décisions produit/juridiques : Premium au lancement (option C), filtre de contenu, conservation des signalements, données sensibles Apple, déclaration d'exportation (chiffrement), iPad ou iPhone seulement, relecture juridique des textes.
8. Recruter 12 testeurs Google pour 14 jours ; fournir un compte de démonstration aux relecteurs ; captures d'écran (iPhone 6,9", iPad 13" si iPad), image de présentation Google 1024×500, logo vectoriel.
9. Tester sur de vrais appareils (checklist ci-dessous) ; soumettre à la revue (Apple) et demander la production (Google).

### Checklist de tests sur appareils réels

Reprendre **`STORES.md` §15** (appareils, inscription, permissions, notifications app fermée, hors ligne, liens profonds, suppression de compte, signalement/blocage sur chaque surface, légal, compte de démonstration) **et ajouter pour cette étape** :

- iPhone : fenêtres d'autorisation (caméra, **micro**, localisation approximative) en français ; refus puis autorisation dans Réglages ; un message vocal enregistré, envoyé et réécouté (WKWebView).
- iPhone : notification push reçue **app fermée** (jeton APNs enregistré dans `device_push_tokens`, `platform = ios`), clic → bonne page ; après déconnexion, plus de notification.
- Liens universels : `/profile/<uuid>`, `/event/<uuid>` ouverts depuis Messages/Notes ouvrent l'**app** (AASA servi sans redirection, Team ID correct) ; lien d'e-mail de confirmation et de réinitialisation.
- Zones sûres (encoche, Dynamic Island, barre d'accueil), clavier, écran de lancement clair/sombre sans écran blanc, icône sur l'écran d'accueil, iPad en portrait et en paysage.
- Origine `capacitor://localhost` : connexion, chargement des données, Realtime, envoi de médias vers Supabase (CORS permissif : voir « Points ouverts » de l'étape 1).
- Android : message vocal (invite micro au premier clic) ; permissions listées par le workflow = permissions réellement demandées.

### Risques connus (à garder en tête avant de soumettre)

1. **Premium / achats intégrés** : l'interface d'achat Stripe est **toujours visible dans l'app native** (rien n'a été masqué). Apple 3.1.1/3.1.3(b) et Google (paiements) la rejetteront. **Recommandation : option C** (aucun Premium dans la version native au lancement, ≈ 1 jour de code), `STORES.md` §6.4. **À faire avant la première soumission.**
2. **Contact support vide** (`contact.json`) : Apple 1.2/1.5 et l'« URL d'assistance » obligatoire ; risque de rejet réel.
3. **Aucun filtre de contenu** à la publication (Apple 1.2) : compensé par signalement + blocage + modération réactive, mais point de rejet possible.
4. **SQL jamais exécutés en prod** : notamment **`supabase-age-check-server-side.sql`** (sans lui un appel direct à l'API peut enregistrer un mineur), `supabase-content-select-block-filter-fix.sql`, `supabase-device-tokens.sql`, `supabase-push-notifications-triggers.sql` (aucun push sans lui) ; fonctions `process-scheduled-deletions` à redéployer (suppression de compte exigée par les boutiques).
5. **`stripe-webhook` répond 404** (jamais déployé) : le Premium web n'est pas actif ; le bouton d'achat reste visible (voir 1).
6. **Valeurs à remplacer** : Team ID (AASA), empreintes SHA-256 (`assetlinks.json`), `supportEmail` ; et les tests qui exigent « REMPLACER… » à adapter ensuite.
7. **Aucune compilation réelle** (iOS comme Android) : `project.pbxproj` modifié à la main, bloc de signature Gradle jamais exécuté, schéma Xcode implicite, signature automatique par clé Admin (compromis de sécurité), `altool`. Le premier passage de la CI peut échouer ; chaque échec est lisible dans les journaux.
8. **Manifeste de confidentialité** : noms de constantes écrits de mémoire (trois confirmés) ; aucune API à raison requise déclarée alors que des dépendances Swift tierces n'ont pas pu être lues ; déclaration « données sensibles » à valider.
9. **Export (chiffrement)** : `ITSAppUsesNonExemptEncryption = false` est votre déclaration, pas celle d'Apple.
10. **IA tierce** (Anthropic, `ai-assist`) : clé non reconfirmée ; Apple 5.1.2(i) demande un consentement explicite avant d'envoyer des données à une IA tierce (`STORES.md` §16, à valider).
11. **Compte de démonstration** : l'onglet Rencontres est réservé au Canada ; un relecteur hors Canada est bloqué sans compte dont `user_locations.last_in_canada_at` est récent.
12. **Micro Android** : permission `RECORD_AUDIO` ajoutée à cette étape (invite au premier usage, `STORES.md` §9 déjà aligné).
