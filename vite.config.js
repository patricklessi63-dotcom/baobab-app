import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Source unique de la version installée : package.json (déjà l'endroit
// conventionnel pour ça) — injectée à la compilation, jamais dupliquée en
// dur ailleurs dans le code (item 4 du cahier des charges "mise à jour").
// La version "disponible" (ce que le serveur annonce) vit séparément dans
// public/app-version.json, mise à jour à chaque release qui doit être
// signalée aux utilisateurs déjà installés.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
