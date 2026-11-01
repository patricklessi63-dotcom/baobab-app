import React, { useEffect } from "react";
import HorizonTree from "./HorizonTree";
import { loadHorizonFonts } from "./loadHorizonFonts";
import { useReduceMotion } from "./useReduceMotion";
import { isNative } from "../../lib/platform";
import "../../styles/horizon-stage.css";

// Scène « fenêtre sur la nuit » : l'arbre animé (réseau de points, chargé à la
// demande, avec repli SVG) entouré des repères de la page d'accueil Horizon —
// coins, balayage, légendes en police mono. Le contenu (titre, boutons...) est
// posé par-dessus via `children`. Même niveau d'animation que l'accueil :
// c'est le composant qui harmonise la connexion, l'onboarding et le fil.
//  - hudTop / hudBottom : légendes décoratives (aria-hidden)
//  - tree : false pour une scène sans arbre (halo + balayage seulement)
//  - treeClassName : classes ajoutées au calque de l'arbre (positionnement)
export default function HorizonStage({
  className = "",
  style,
  hudTop,
  hudBottom,
  tree = true,
  treeClassName = "",
  zone = null,
  seed,
  children,
}) {
  const { reduce } = useReduceMotion();
  const native = isNative();

  useEffect(() => {
    loadHorizonFonts();
  }, []);

  return (
    <div className={`hzs-stage ${className}`} style={style} data-testid="hzs-stage">
      {tree && (
        <div className={`hzs-tree ${treeClassName}`}>
          <HorizonTree zone={zone} reduceMotion={reduce} lite={native} seed={seed} />
        </div>
      )}
      <i className="hzs-corner c1" aria-hidden="true" />
      <i className="hzs-corner c2" aria-hidden="true" />
      <i className="hzs-corner c3" aria-hidden="true" />
      <i className="hzs-corner c4" aria-hidden="true" />
      <div className="hzs-scan" aria-hidden="true" />
      {hudTop && <p className="hzs-hud tl" aria-hidden="true">{hudTop}</p>}
      {hudBottom && <p className="hzs-hud bl" aria-hidden="true">{hudBottom}</p>}
      {children && <div className="hzs-content">{children}</div>}
    </div>
  );
}
