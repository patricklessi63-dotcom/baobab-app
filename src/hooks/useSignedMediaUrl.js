import { useCallback, useEffect, useRef, useState } from "react";
import { getSignedUrl, invalidateSignedUrl } from "../lib/signedUrlCache";

// Résout une URL signée pour un chemin Storage privé. No-op pour les
// messages sans média (texte/sticker) ou tant qu'un aperçu local (upload en
// cours) est fourni à la place.
//
// refresh() : à appeler quand le chargement du média échoue (onError de
// <img>/<video>/<audio>). Une URL signée vit 1 h : une conversation laissée
// ouverte plus longtemps (ou un téléphone qui sort de veille) affichait une
// image cassée définitive. refresh() redemande UNE nouvelle URL par chemin et
// renvoie true ; s'il a déjà été tenté (le fichier est vraiment inaccessible)
// ou n'a pas de sens, il renvoie false et l'appelant affiche son repli.
export function useSignedMediaUrl(mediaPath, { skip = false } = {}) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const refreshedPathRef = useRef(null);
  const pathRef = useRef(mediaPath);
  pathRef.current = mediaPath;

  useEffect(() => {
    if (!mediaPath || skip) { setUrl(null); return; }
    let alive = true;
    setLoading(true);
    getSignedUrl(mediaPath).then((signed) => {
      if (alive) { setUrl(signed); setLoading(false); }
    });
    return () => { alive = false; };
  }, [mediaPath, skip]);

  const refresh = useCallback(() => {
    const path = pathRef.current;
    if (!path || skip || refreshedPathRef.current === path) return false;
    refreshedPathRef.current = path;
    invalidateSignedUrl(path);
    getSignedUrl(path).then((signed) => {
      if (pathRef.current === path && signed) setUrl(signed);
    });
    return true;
  }, [skip]);

  return { url, loading, refresh };
}
