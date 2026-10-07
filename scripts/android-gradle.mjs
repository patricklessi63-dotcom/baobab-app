// Lance le wrapper Gradle d'android/ de façon portable (Windows / macOS / Linux) :
//   node scripts/android-gradle.mjs assembleDebug
// (npm run android:build:debug / android:build:release l'utilisent.)
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const androidDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "android");
const isWin = process.platform === "win32";
const wrapper = path.join(androidDir, isWin ? "gradlew.bat" : "gradlew");

if (!existsSync(wrapper)) {
  console.error(`Wrapper Gradle introuvable : ${wrapper}. Le dossier android/ est-il présent ? (npx cap add android)`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage : node scripts/android-gradle.mjs <tâche gradle> (ex. assembleDebug, bundleRelease)");
  process.exit(1);
}

const res = spawnSync(wrapper, args, { cwd: androidDir, stdio: "inherit", shell: isWin });
if (res.error) {
  console.error(res.error.message);
  process.exit(1);
}
process.exit(res.status ?? 1);
