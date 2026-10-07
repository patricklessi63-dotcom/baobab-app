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
| 2 | Adaptation UI mobile (safe areas, barre d'état, splash, icônes, bouton retour…) | À faire |
| 3 | Plugins natifs : notifications push (FCM/APNs), deep links, caméra/photos, etc. | À faire |
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
3. **Redirections d'e-mail** : `src/Auth.jsx` construit `emailRedirectTo`
   (confirmation d'inscription, renvoi de confirmation) et `redirectTo`
   (réinitialisation de mot de passe) avec `window.location.origin`. En natif cela
   donnerait `https://localhost/...`, adresse **absente de la liste « Redirect URLs »
   de Supabase** : Supabase retombe alors sur le « Site URL » (le site Vercel), donc
   le lien ouvre le **site web dans le navigateur**, pas l'app. Le compte est bien
   confirmé / le mot de passe réinitialisable via le web, mais l'app ne s'ouvre pas
   avant les **deep links (étape 3)** ; après cela, il faudra aussi remplacer
   `window.location.origin` par une URL publique fixe en natif et l'ajouter aux
   « Redirect URLs » Supabase. Non modifié à l'étape 1 (web inchangé).
4. **Autres usages de `window.location.origin` en natif** (à corriger étape 2/3) :
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
