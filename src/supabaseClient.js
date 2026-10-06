import { createClient } from "@supabase/supabase-js";
import { createTimeoutFetch } from "./lib/timeoutFetch";

// Ces valeurs viennent de ton fichier .env (voir .env.example)
// et des variables d'environnement configurées sur Vercel/Netlify au déploiement.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "Variables Supabase manquantes. Vérifie ton fichier .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)."
  );
}

// Délai maximal sur les requêtes de données : sans lui, une connexion « lie-fi »
// (réseau présent mais muet) laisse spinners et envois bloqués plusieurs minutes.
// Voir lib/timeoutFetch.js.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: createTimeoutFetch() },
});
