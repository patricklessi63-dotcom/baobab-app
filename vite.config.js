/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { visualizer } from "rollup-plugin-visualizer";

// Source unique de la version installée : package.json (déjà l'endroit
// conventionnel pour ça) — injectée à la compilation, jamais dupliquée en
// dur ailleurs dans le code (item 4 du cahier des charges "mise à jour").
// La version "disponible" (ce que le serveur annonce) vit séparément dans
// public/app-version.json, mise à jour à chaque release qui doit être
// signalée aux utilisateurs déjà installés.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

// Le visualizer n'est activé qu'à la demande (ANALYZE=1 npm run build) — jamais
// dans un build de prod normal. Il n'émet qu'un fichier de rapport local
// (dist/stats.html), n'altère pas le bundle.
const analyze = process.env.ANALYZE === "1";

export default defineConfig({
  plugins: [
    react(),
    ...(analyze
      ? [visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true })]
      : []),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Tests unitaires (Vitest) — logique pure uniquement, environnement Node,
  // pas de jsdom ni de testing-library. Ce bloc n'a aucun effet sur `vite
  // build` / `vite dev` (lu seulement par Vitest).
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "src/**/__tests__/*.test.js"],
  },
  build: {
    rollupOptions: {
      output: {
        // Découpage des dépendances lourdes et stables en chunks distincts
        // (item 2b) : gain de cache navigateur entre déploiements (ces libs
        // changent rarement) et téléchargement parallélisé. Aucun risque
        // fonctionnel — ces modules sont de toute façon chargés au démarrage.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("@supabase") ||
            id.includes("/phoenix/") ||
            id.includes("iceberg-js")
          ) {
            return "vendor-supabase";
          }
          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/scheduler/") ||
            id.includes("react-is")
          ) {
            return "vendor-react";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
});
