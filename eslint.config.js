// Analyse statique (npm run lint). Objectif : attraper les VRAIS bogues (variable non définie, règle des
// hooks React violée, clé dupliquée, code inatteignable…) sans bruit de style. Les règles qui signalent
// des défauts certains sont en « error » ; celles qui demandent un jugement sont en « warn ».
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  {
    ignores: [
      "dist/**", "node_modules/**", "android/**", "ios/**", "coverage/**", "stats.html",
      "supabase/functions/**", // Deno (TypeScript), hors périmètre de ce linter
      ".claude/**",
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2024, __APP_VERSION__: "readonly" }, // défini par vite.config.js
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "18.3" } },
    rules: {
      "react/jsx-uses-vars": "error", // sans elle, tout composant utilisé seulement en JSX passerait pour « inutilisé »
      "react/jsx-uses-react": "error",
      "react/jsx-no-undef": "error",
      "react/jsx-key": "warn",
      "react/no-direct-mutation-state": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": ["warn", { args: "none", ignoreRestSiblings: true, varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-escape": "warn",
      "no-control-regex": "off", // filtres de caractères de contrôle voulus
    },
  },
  {
    // Scripts Node, configuration et tests.
    files: ["scripts/**", "*.config.{js,mjs}", "**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { "no-regex-spaces": "off" }, // les tests comparent du texte mis en forme, espaces comprises
  },
];
