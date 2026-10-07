import { useEffect, useRef } from "react";
import { isNative } from "../lib/platform";
import { onAppUrlOpen, getLaunchUrl } from "../lib/nativeApp";
import { listenNotificationTaps } from "../lib/nativePush";
import { parseAuthLink, parseDeepLink } from "../lib/deepLinks";

// Liens profonds de l'app native, à appeler UNE fois dans App.jsx. No-op complet
// sur le web (aucun écouteur, aucun import dynamique).
//
// Trois sources, une seule destination :
//  - appUrlOpen : lien App Links / Universal Links ouvert pendant que l'app tourne ;
//  - getLaunchUrl : lien qui a lancé l'app à froid ;
//  - clic sur une notification push (data.url posé par send-push).
// Chaque URL est validée par lib/deepLinks.js (liste blanche, uuid) AVANT toute
// action ; une URL invalide ou étrangère est ignorée sans bruit. Aucune URL (donc
// aucun jeton de récupération de mot de passe) n'est journalisée.
const DEDUPE_MS = 2000;

export function useNativeLinks({ onEntityLink, onAuthLink }) {
  const entityRef = useRef(onEntityLink);
  const authRef = useRef(onAuthLink);
  entityRef.current = onEntityLink;
  authRef.current = onAuthLink;

  useEffect(() => {
    if (!isNative()) return undefined;
    let cancelled = false;
    const removers = [];
    let last = { url: null, at: 0 };

    const handle = (url) => {
      if (typeof url !== "string" || url.length === 0) return;
      // Le même lien peut arriver deux fois (getLaunchUrl ET appUrlOpen au lancement à froid).
      const now = Date.now();
      if (last.url === url && now - last.at < DEDUPE_MS) return;
      last = { url, at: now };
      const auth = parseAuthLink(url);
      if (auth) {
        authRef.current?.(auth);
        return;
      }
      const dest = parseDeepLink(url);
      if (dest) entityRef.current?.(dest);
    };

    const keep = (remove) => {
      if (cancelled) remove();
      else removers.push(remove);
    };
    onAppUrlOpen(handle).then(keep);
    listenNotificationTaps(handle).then(keep);
    getLaunchUrl().then((url) => { if (!cancelled) handle(url); });

    return () => {
      cancelled = true;
      removers.forEach((r) => r());
    };
  }, []);
}
