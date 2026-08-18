import { useState, useEffect, useCallback } from "react";

// Routeur fait maison (Phase 12b) — pas de react-router-dom, cohérent
// avec le reste du projet (aucune dépendance runtime ajoutée depuis le
// début). À appeler une seule fois (dans App.jsx) et à distribuer via
// props : deux instances de ce hook auraient chacune leur propre état,
// et pushState depuis l'une ne réveillerait pas l'autre (pas de
// popstate déclenché par pushState, seulement par retour/avance).
export function usePathname() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((path) => {
    if (path === window.location.pathname) return;
    window.history.pushState({}, "", path);
    setPathname(path);
  }, []);

  return { pathname, navigate };
}
