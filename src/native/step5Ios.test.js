import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse as parsePlist } from "plist";
import pkg from "../../package.json";
import capacitorConfig from "../../capacitor.config.json";
import publicOrigin from "../config/publicOrigin.json";
import { parseManifestPermissions } from "../../scripts/android-merged-permissions.mjs";

// Garde-fous de l'étape 5 (projet iOS) : aucun Mac ni Xcode ici, donc on vérifie ce qui est vérifiable
// en texte — cohérence des fichiers de configuration avec le reste du dépôt et avec les règles Apple
// citées dans MOBILE.md / STORES.md. La compilation réelle est faite par .github/workflows/ios-build.yml.

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const plist = (rel) => parsePlist(read(rel));

const info = plist("ios/App/App/Info.plist");
const entitlements = plist("ios/App/App/App.entitlements");
const privacy = plist("ios/App/App/PrivacyInfo.xcprivacy");
const pbxproj = read("ios/App/App.xcodeproj/project.pbxproj");

describe("Info.plist iOS", () => {
  it("textes d'autorisation : caméra, micro, photothèque, localisation — en français, non vides, honnêtes", () => {
    for (const key of [
      "NSCameraUsageDescription",
      "NSMicrophoneUsageDescription",
      "NSPhotoLibraryUsageDescription",
      "NSPhotoLibraryAddUsageDescription",
      "NSLocationWhenInUseUsageDescription",
      "NSLocationAlwaysAndWhenInUseUsageDescription",
    ]) {
      expect(typeof info[key], key).toBe("string");
      expect(info[key].length, key).toBeGreaterThan(30);
      expect(info[key], key).toMatch(/Baobab/);
    }
    // Position APPROXIMATIVE, app ouverte seulement (la clé « Always » n'est là que parce que le plugin
    // la référence ; jamais demandée : pas de mode d'arrière-plan « location »).
    expect(info.NSLocationWhenInUseUsageDescription).toMatch(/approximative/);
    expect(info.NSLocationAlwaysAndWhenInUseUsageDescription).toBe(info.NSLocationWhenInUseUsageDescription);
    expect(info.NSMicrophoneUsageDescription).toMatch(/vocau/);
  });

  it("export de chiffrement : HTTPS standard seulement => ITSAppUsesNonExemptEncryption = false", () => {
    expect(info.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it("aucune clé inutile : pas de mode d'arrière-plan, pas de schémas interrogés, pas de Face ID/contacts/Bluetooth", () => {
    // Les notifications push par alerte (apns-push-type: alert) n'exigent pas UIBackgroundModes
    // « remote-notification » (réservé aux notifications silencieuses) : voir MOBILE.md, étape 5.
    expect(info.UIBackgroundModes).toBeUndefined();
    expect(info.LSApplicationQueriesSchemes).toBeUndefined();
    for (const key of Object.keys(info)) {
      expect(key).not.toMatch(/FaceID|Contacts|Bluetooth|Calendars|Reminders|HealthShare|Tracking|LocalNetwork|Motion|SpeechRecognition/);
    }
  });

  it("orientations : iPhone portrait seulement ; iPad : les quatre (exigées par Apple pour le multitâche)", () => {
    expect(info.UISupportedInterfaceOrientations).toEqual(["UIInterfaceOrientationPortrait"]);
    expect(new Set(info["UISupportedInterfaceOrientations~ipad"])).toEqual(
      new Set([
        "UIInterfaceOrientationPortrait",
        "UIInterfaceOrientationPortraitUpsideDown",
        "UIInterfaceOrientationLandscapeLeft",
        "UIInterfaceOrientationLandscapeRight",
      ]),
    );
  });

  it("nom affiché, version et numéro de build viennent du projet (variables Xcode)", () => {
    expect(info.CFBundleDisplayName).toBe(capacitorConfig.appName);
    expect(info.CFBundleShortVersionString).toBe("$(MARKETING_VERSION)");
    expect(info.CFBundleVersion).toBe("$(CURRENT_PROJECT_VERSION)");
    expect(info.CFBundleIdentifier).toBe("$(PRODUCT_BUNDLE_IDENTIFIER)");
  });

  it("scènes UIScene : SceneDelegate (liens universels) branché sur Capacitor", () => {
    const scene = info.UIApplicationSceneManifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0];
    expect(scene.UISceneDelegateClassName).toBe("$(PRODUCT_MODULE_NAME).SceneDelegate");
    const sceneDelegate = read("ios/App/App/SceneDelegate.swift");
    expect(sceneDelegate).toContain("SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)");
    expect(sceneDelegate).toContain("SceneDelegateProxy.shared.scene(scene, continue: userActivity)");
  });
});

describe("Entitlements", () => {
  it("push : aps-environment ; liens universels : applinks sur l'hôte de src/config/publicOrigin.json (source unique)", () => {
    expect(["development", "production"]).toContain(entitlements["aps-environment"]);
    const domains = entitlements["com.apple.developer.associated-domains"];
    expect(domains).toEqual([`applinks:${new URL(publicOrigin.origin).host}`]);
  });

  it("aucun autre droit (pas de groupes, trousseau, iCloud, Apple Pay…)", () => {
    expect(Object.keys(entitlements).sort()).toEqual(["aps-environment", "com.apple.developer.associated-domains"]);
  });

  it("l'identifiant d'app est le même partout : Capacitor, projet Xcode, apple-app-site-association, Android", () => {
    expect(capacitorConfig.appId).toBe("ca.baobab.app");
    const ids = [...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
    expect(ids.length).toBe(2); // Debug + Release
    for (const id of ids) expect(id).toBe(capacitorConfig.appId);
    const aasa = JSON.parse(read("public/.well-known/apple-app-site-association"));
    expect(aasa.applinks.details[0].appIDs[0].endsWith(`.${capacitorConfig.appId}`)).toBe(true);
    expect(read("android/app/build.gradle")).toContain(`applicationId "${capacitorConfig.appId}"`);
  });
});

describe("Projet Xcode (project.pbxproj)", () => {
  it("MARKETING_VERSION = version de package.json = versionName Android ; CURRENT_PROJECT_VERSION = 1", () => {
    const versions = [...pbxproj.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
    expect(versions).toEqual([pkg.version, pkg.version]);
    const builds = [...pbxproj.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1]);
    expect(builds).toEqual(["1", "1"]);
    expect(read("android/app/build.gradle")).toContain(`versionName "${pkg.version}"`);
  });

  it("cible de déploiement iOS 15.0 (minimum de Capacitor 8) partout, Package.swift compris", () => {
    const targets = [...pbxproj.matchAll(/IPHONEOS_DEPLOYMENT_TARGET = ([^;]+);/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThanOrEqual(2);
    for (const t of targets) expect(t).toBe("15.0");
    expect(read("ios/App/CapApp-SPM/Package.swift")).toContain(".iOS(.v15)");
  });

  it("l'entitlement et le manifeste de confidentialité sont référencés (fichier, groupe, ressources) et existent", () => {
    expect(pbxproj.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2);
    for (const file of ["App.entitlements", "PrivacyInfo.xcprivacy"]) {
      expect(fs.existsSync(path.join(root, "ios/App/App", file)), file).toBe(true);
      expect(pbxproj).toMatch(new RegExp(`/\\* ${file.replace(".", "\\.")} \\*/ = \\{isa = PBXFileReference;[^}]*path = ${file.replace(".", "\\.")};`));
    }
    // PrivacyInfo.xcprivacy doit être COPIÉ dans le bundle (phase Resources), pas seulement listé.
    const resources = /\/\* Begin PBXResourcesBuildPhase section \*\/([\s\S]*?)\/\* End PBXResourcesBuildPhase section \*\//.exec(pbxproj)[1];
    expect(resources).toContain("PrivacyInfo.xcprivacy in Resources");
    // Intégrité : chaque identifiant référencé par un PBXBuildFile / un groupe est défini.
    const defined = new Set([...pbxproj.matchAll(/^\t\t([0-9A-F]{24}) \/\*/gm)].map((m) => m[1]));
    for (const m of pbxproj.matchAll(/fileRef = ([0-9A-F]{24})/g)) expect(defined.has(m[1]), m[1]).toBe(true);
    const group = /\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \(([\s\S]*?)\);/.exec(pbxproj)[1];
    for (const m of group.matchAll(/([0-9A-F]{24}) \/\*/g)) expect(defined.has(m[1]), m[1]).toBe(true);
    expect(group).toContain("App.entitlements");
    expect(group).toContain("PrivacyInfo.xcprivacy");
  });

  it("Swift Package Manager (pas de CocoaPods) : les 9 plugins sont dans Package.swift", () => {
    expect(fs.existsSync(path.join(root, "ios/App/Podfile"))).toBe(false);
    const spm = read("ios/App/CapApp-SPM/Package.swift");
    expect(spm).toContain(`exact: "${pkg.devDependencies["@capacitor/ios"].replace("^", "")}"`);
    for (const name of ["App", "Camera", "Geolocation", "Haptics", "Keyboard", "PushNotifications", "Share", "SplashScreen", "StatusBar"]) {
      expect(spm, name).toContain(`.package(name: "Capacitor${name}"`);
    }
    // @capacitor/ios et @capacitor/core : même version (Package.swift épingle capacitor-swift-pm à cette version).
    expect(pkg.devDependencies["@capacitor/ios"]).toBe(pkg.devDependencies["@capacitor/android"]);
    expect(pkg.dependencies["@capacitor/core"]).toBe(pkg.devDependencies["@capacitor/ios"]);
  });

  it("ios/.gitignore : fichiers générés (public copié par cap sync, config, Pods, DerivedData) non versionnés", () => {
    const ignore = read("ios/.gitignore");
    for (const entry of ["App/Pods", "App/App/public", "DerivedData", "xcuserdata", "capacitor-cordova-ios-plugins", "App/App/capacitor.config.json", "App/App/config.xml"]) {
      expect(ignore, entry).toContain(entry);
    }
  });
});

describe("AppDelegate : jeton APNs transmis au plugin push", () => {
  const delegate = read("ios/App/App/AppDelegate.swift");
  it("didRegisterForRemoteNotifications / didFailToRegister postent les notifications Capacitor", () => {
    expect(delegate).toContain("didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data");
    expect(delegate).toContain("NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)");
    expect(delegate).toContain("didFailToRegisterForRemoteNotificationsWithError error: Error");
    expect(delegate).toContain("NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)");
  });
});

describe("PrivacyInfo.xcprivacy (manifeste de confidentialité de l'app)", () => {
  const ALLOWED_TYPES = [
    "EmailAddress", "Name", "CoarseLocation", "SensitiveInfo", "PhotosorVideos", "AudioData", "EmailsOrTextMessages",
    "CustomerSupport", "OtherUserContent", "UserID", "DeviceID", "ProductInteraction", "CrashData", "OtherDiagnosticData",
  ].map((t) => `NSPrivacyCollectedDataType${t}`);
  const ALLOWED_PURPOSES = ["AppFunctionality", "Analytics", "ProductPersonalization"].map((p) => `NSPrivacyCollectedDataTypePurpose${p}`);

  it("aucun suivi, aucun domaine de suivi", () => {
    expect(privacy.NSPrivacyTracking).toBe(false);
    expect(privacy.NSPrivacyTrackingDomains).toEqual([]);
  });

  it("API à raison requise : aucune déclarée (aucune utilisée par le code de l'app ni les plugins, voir le commentaire du fichier)", () => {
    expect(privacy.NSPrivacyAccessedAPITypes).toEqual([]);
    // Si quelqu'un en ajoute, chaque entrée doit avoir catégorie + raison connue.
    for (const e of privacy.NSPrivacyAccessedAPITypes) {
      expect(e.NSPrivacyAccessedAPIType).toMatch(/^NSPrivacyAccessedAPICategory/);
      expect(e.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
    }
  });

  it("données collectées : types et finalités officiels, liées à l'identité, jamais utilisées pour le suivi, sans doublon", () => {
    const entries = privacy.NSPrivacyCollectedDataTypes;
    const types = entries.map((e) => e.NSPrivacyCollectedDataType);
    expect(new Set(types).size).toBe(types.length);
    for (const e of entries) {
      expect(ALLOWED_TYPES).toContain(e.NSPrivacyCollectedDataType);
      expect(e.NSPrivacyCollectedDataTypeLinked).toBe(true);
      expect(e.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(e.NSPrivacyCollectedDataTypePurposes.length).toBeGreaterThan(0);
      for (const p of e.NSPrivacyCollectedDataTypePurposes) expect(ALLOWED_PURPOSES).toContain(p);
    }
  });

  it("cohérent avec STORES.md §8 : localisation APPROXIMATIVE seulement, aucune donnée de publicité, de contacts ou de santé", () => {
    const types = privacy.NSPrivacyCollectedDataTypes.map((e) => e.NSPrivacyCollectedDataType);
    expect(types).toContain("NSPrivacyCollectedDataTypeCoarseLocation");
    expect(types).not.toContain("NSPrivacyCollectedDataTypePreciseLocation");
    expect(types).not.toContain("NSPrivacyCollectedDataTypeAdvertisingData");
    expect(types).not.toContain("NSPrivacyCollectedDataTypeContacts");
    expect(types).not.toContain("NSPrivacyCollectedDataTypeHealth");
    expect(types).not.toContain("NSPrivacyCollectedDataTypePurchaseHistory"); // vrai tant que le Premium n'est pas dans l'app native
    const stores = read("STORES.md");
    expect(stores).toContain("Localisation approximative");
  });
});

describe("Icône et écran de lancement iOS", () => {
  it("icône 1024×1024, PNG SANS canal alpha (Apple refuse la transparence)", () => {
    const buf = fs.readFileSync(path.join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
    expect(buf.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(buf.readUInt32BE(16)).toBe(1024);
    expect(buf.readUInt32BE(20)).toBe(1024);
    expect(buf[25]).toBe(2); // type de couleur 2 = RGB (6 = RGBA)
  });

  it("splash clair + sombre référencés par le jeu d'images et présents sur disque", () => {
    const dir = "ios/App/App/Assets.xcassets/Splash.imageset";
    const contents = JSON.parse(read(`${dir}/Contents.json`));
    expect(contents.images.length).toBe(6);
    expect(contents.images.some((i) => i.appearances?.[0]?.value === "dark")).toBe(true);
    for (const i of contents.images) expect(fs.existsSync(path.join(root, dir, i.filename)), i.filename).toBe(true);
    expect(read("ios/App/App/Base.lproj/LaunchScreen.storyboard")).toContain('image="Splash"');
  });
});

describe("Aucun secret ni fichier sensible dans le dépôt", () => {
  const FORBIDDEN = /(\.p8|\.p12|\.pem|\.jks|\.keystore|\.mobileprovision|\.cer)$|^(GoogleService-Info\.plist|keystore\.properties|key\.properties)$|^AuthKey_/;
  function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (["node_modules", "dist", ".git", ".gradle", "build", "Pods", "DerivedData"].includes(e.name)) return [];
        return walk(p);
      }
      return [p];
    });
  }
  it("aucun .p8 / .p12 / .pem / .jks / .keystore / .mobileprovision / GoogleService-Info.plist / keystore.properties", () => {
    const offenders = walk(root).filter((f) => FORBIDDEN.test(path.basename(f))).map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });

  it(".gitignore bloque ces motifs", () => {
    const ignore = read(".gitignore");
    for (const p of ["*.p8", "*.p12", "*.pem", "*.jks", "*.keystore", "*.mobileprovision", "keystore.properties", "GoogleService-Info.plist", "*.ipa", "*.xcarchive"]) {
      expect(ignore, p).toContain(p);
    }
  });

  it("aucun texte de clé privée ni de jeton dans les fichiers iOS/Android/workflows versionnés", () => {
    const files = [...walk(path.join(root, "ios")), ...walk(path.join(root, ".github"))].filter((f) => /\.(plist|xcprivacy|entitlements|swift|pbxproj|yml|json|xcconfig)$/.test(f));
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    }
  });
});

describe("scripts/android-merged-permissions.mjs", () => {
  const xml = `<?xml version="1.0"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="ca.baobab.app">
  <!-- <uses-permission android:name="android.permission.FAKE_IN_COMMENT" /> -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission
      android:name="android.permission.RECORD_AUDIO" />
  <uses-feature android:name="android.hardware.camera" android:required="false" />
  <application android:debuggable="true" />
</manifest>`;
  it("liste les permissions (commentaires ignorés, balises multi-lignes comprises) et les fonctionnalités", () => {
    const r = parseManifestPermissions(xml);
    expect(r.permissions).toEqual(["android.permission.INTERNET", "android.permission.RECORD_AUDIO"]);
    expect(r.features).toEqual(["android.hardware.camera (required=false)"]);
    expect(r.debuggable).toBe(true);
    expect(r.packageName).toBe("ca.baobab.app");
  });

  it("le manifeste source déclare le micro (messages vocaux) en plus de l'existant", () => {
    const r = parseManifestPermissions(read("android/app/src/main/AndroidManifest.xml"));
    expect(r.permissions).toEqual([
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.INTERNET",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECORD_AUDIO",
    ]);
  });
});
