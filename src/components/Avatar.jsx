import React, { useEffect, useState } from "react";

export default function Avatar({ name, size = 44, url }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const [loaded, setLoaded] = useState(false);
  // Repli sur l'avatar-initiale si l'image échoue à charger (fichier
  // supprimé du storage, URL signée expirée, URL invalide) — jusqu'ici
  // absent ici alors que les autres visionneuses média de l'app (galerie
  // photo, stories) gèrent déjà ce cas : sans ça, une photo de profil cassée
  // affichait indéfiniment l'icône "image cassée" du navigateur au lieu du
  // cercle à initiale déjà prévu pour l'absence d'URL.
  const [errored, setErrored] = useState(false);
  useEffect(() => { setLoaded(false); setErrored(false); }, [url]);
  if (url && !errored) {
    return (
      <span
        // Balayage lumineux (bb-img-loading) tant que l'image n'a pas fini
        // de charger, plutôt qu'un cadre gris statique — retiré dès onLoad.
        className={loaded ? "" : "bb-img-loading"}
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <img
          src={url}
          alt={name}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`bb-img-fade ${loaded ? "bb-loaded" : ""}`}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            display: "block",
            boxShadow: "0 1px 3px rgba(8,20,14,0.15)",
          }}
        />
      </span>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "linear-gradient(160deg, var(--bb-gold-1), var(--bb-gold-2))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#1C1608",
        fontFamily: "'Fraunces', serif",
        fontWeight: 700,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}
