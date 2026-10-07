import config from "../config/publicOrigin.json";
import { isNative } from "./platform";

// SOURCE UNIQUE du domaine public du site web (liens profonds, liens e-mail,
// lien d'invitation). Pour changer de domaine : modifier UNIQUEMENT
// src/config/publicOrigin.json — ce fichier est lu :
//  - par le code web/natif (ce module) ;
//  - par android/app/build.gradle (hôte de l'intent-filter App Links) ;
//  - par un test qui vérifie que tout reste cohérent.
// Il reste ensuite, côté propriétaire (voir MOBILE.md) : ajouter l'URL aux
// « Redirect URLs » Supabase, republier assetlinks.json / apple-app-site-association
// sur le nouveau domaine, et (étape iOS) l'entitlement `applinks:<nouvel hôte>`.
// Une variable d'environnement de build (VITE_PUBLIC_WEB_ORIGIN) peut surcharger
// la valeur sans modifier le dépôt (builds de préproduction).
function clean(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export const PUBLIC_WEB_ORIGIN =
  clean(import.meta.env?.VITE_PUBLIC_WEB_ORIGIN) || clean(config.origin) || "https://baobab-app-zeta.vercel.app";

export const PUBLIC_WEB_HOST = new URL(PUBLIC_WEB_ORIGIN).host;

/**
 * Origine à utiliser pour construire un lien destiné à être OUVERT ailleurs
 * (e-mail de confirmation, réinitialisation de mot de passe, invitation).
 * Web : window.location.origin, comportement strictement inchangé.
 * App native : window.location.origin vaut https://localhost (WebView), qui
 * n'est ni public ni autorisé par Supabase -> le domaine public.
 */
export function linkOrigin() {
  if (isNative()) return PUBLIC_WEB_ORIGIN;
  return typeof window !== "undefined" ? window.location.origin : PUBLIC_WEB_ORIGIN;
}
