import { useEffect } from "react";
import { isNative } from "../lib/platform";
import { syncNativePushRegistration } from "../lib/nativePush";

// App native : à la connexion, ré-enregistre en SILENCE le jeton push si ce
// compte a déjà activé les notifications et que le téléphone a déjà accordé la
// permission (jeton renouvelé, reconnexion après déconnexion). Ne demande
// JAMAIS la permission : elle n'est demandée qu'au geste de l'utilisateur
// (écran d'opt-in de l'inscription ou Réglages > Notifications). No-op sur le web.
export function useNativePushSync(userId) {
  useEffect(() => {
    if (!isNative() || !userId) return;
    syncNativePushRegistration(userId);
  }, [userId]);
}
