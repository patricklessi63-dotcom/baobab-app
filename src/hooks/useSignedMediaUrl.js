import { useEffect, useState } from "react";
import { getSignedUrl } from "../lib/signedUrlCache";

// Résout une URL signée pour un chemin Storage privé. No-op pour les
// messages sans média (texte/sticker) ou tant qu'un aperçu local (upload en
// cours) est fourni à la place.
export function useSignedMediaUrl(mediaPath, { skip = false } = {}) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mediaPath || skip) { setUrl(null); return; }
    let alive = true;
    setLoading(true);
    getSignedUrl(mediaPath).then((signed) => {
      if (alive) { setUrl(signed); setLoading(false); }
    });
    return () => { alive = false; };
  }, [mediaPath, skip]);

  return { url, loading };
}
