// Affiche les permissions et fonctionnalités EFFECTIVES d'un ou plusieurs AndroidManifest.xml
// fusionnés (ce que Google Play analyse), à partir des fichiers produits par Gradle :
//   node scripts/android-merged-permissions.mjs android/app/build/intermediates/merged_manifests/...
// Utilisé par .github/workflows/android-build.yml (le résultat est aussi écrit dans le résumé du
// job GitHub Actions). N'échoue jamais sur le contenu : c'est un rapport à relire, pas un garde-fou.
import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Extrait les noms de balises <uses-permission*> / <uses-feature> d'un manifeste (texte XML). */
export function parseManifestPermissions(rawXml) {
  const xml = rawXml.replace(/<!--[\s\S]*?-->/g, ""); // les commentaires ne comptent pas
  const names = (tag) =>
    [...xml.matchAll(new RegExp(`<${tag}\\b[^>]*?android:name="([^"]+)"[^>]*?>`, "gs"))].map((m) => m[1]);
  const features = [...xml.matchAll(/<uses-feature\b([^>]*?)\/?>/gs)].map((m) => {
    const name = /android:name="([^"]+)"/.exec(m[1])?.[1] ?? /android:glEsVersion="([^"]+)"/.exec(m[1])?.[1] ?? "?";
    const required = /android:required="([^"]+)"/.exec(m[1])?.[1];
    return required ? `${name} (required=${required})` : name;
  });
  return {
    permissions: [...new Set([...names("uses-permission"), ...names("uses-permission-sdk-23")])].sort(),
    features: [...new Set(features)].sort(),
    debuggable: /android:debuggable="true"/.test(xml),
    packageName: /<manifest\b[^>]*\bpackage="([^"]+)"/s.exec(xml)?.[1] ?? null,
  };
}

function main(paths) {
  if (paths.length === 0) {
    console.error("Usage : node scripts/android-merged-permissions.mjs <AndroidManifest.xml> [...]");
    process.exit(0);
  }
  const summary = process.env.GITHUB_STEP_SUMMARY;
  for (const file of paths) {
    const info = parseManifestPermissions(readFileSync(file, "utf8"));
    const lines = [
      `### ${file}`,
      `- package : ${info.packageName ?? "(non indiqué dans ce manifeste)"}`,
      `- debuggable : ${info.debuggable}`,
      `- permissions (${info.permissions.length}) :`,
      ...info.permissions.map((p) => `  - \`${p}\``),
      `- fonctionnalités matérielles déclarées (${info.features.length}) :`,
      ...(info.features.length ? info.features.map((f) => `  - \`${f}\``) : ["  - aucune"]),
      "",
    ];
    console.log(lines.join("\n"));
    if (summary) appendFileSync(summary, lines.join("\n") + "\n");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
