import React, { useId } from "react";
import { MARK_SIZE } from "./baobabMark.js";
import { markBody } from "./baobabMarkSvg.js";

// Marque Baobab « Horizon » : baobab simplifié (tronc en bouteille ivoire, canopée
// en réseau menthe, racines braise, soleil braise -> corail). La géométrie est la
// même que celle des fichiers assets/logo/*.svg et de toutes les icônes (source
// unique : baobabMark.js), le contenu est une chaîne statique du dépôt.
//
// - palette "dark" (défaut) : pour fonds sombres (nuit, canopée).
//   palette "light" : pour fonds ivoire (tronc canopée, couronne sève).
// - variant "mono" : une seule couleur (`color`, « currentColor » par défaut), traits
//   épaissis : notifications, tampons, impressions une couleur.
// - title : si fourni, la marque est exposée aux lecteurs d'écran (role="img",
//   aria-label) ; sinon elle est décorative (aria-hidden), ce qui convient partout où un
//   texte visible porte déjà le nom « Baobab ».
// `accent` est conservé pour compatibilité avec l'ancienne signature et ignoré.
export default function BaobabLogo({
  size = 24,
  palette = "dark",
  variant = "color",
  color = "currentColor",
  title,
  className = "",
  // eslint-disable-next-line no-unused-vars
  accent,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const inner = markBody({ variant, palette, color, idPrefix: `bb${uid}` });
  const a11y = title ? { role: "img", "aria-label": title } : { "aria-hidden": "true" };
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_SIZE} ${MARK_SIZE}`}
      className={className}
      focusable="false"
      {...a11y}
      dangerouslySetInnerHTML={{ __html: (title ? `<title>${title.replace(/[<>&]/g, "")}</title>` : "") + inner }}
    />
  );
}
