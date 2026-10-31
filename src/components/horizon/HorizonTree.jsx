import React, { Suspense, lazy } from "react";
import TreeFallback from "./TreeFallback";
import { TREE_ARIA_LABEL } from "./treeLabel";

// Le canvas (et son modèle) vivent dans un chunk séparé : le chunk principal
// ne contient que ce petit conteneur et le repli SVG.
const TreeNetwork = lazy(() => import("./TreeNetwork"));

// Si le chunk ne charge pas (réseau coupé, déploiement en cours), on garde le
// repli statique : l'arbre est décoratif, il ne doit jamais faire tomber la page.
class TreeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* silencieux : le repli suffit */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Arbre animé chargé à la demande, avec repli SVG sans saut de mise en page. */
export default function HorizonTree(props) {
  const fallback = <TreeFallback ariaLabel={TREE_ARIA_LABEL} />;
  return (
    <TreeBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <TreeNetwork ariaLabel={TREE_ARIA_LABEL} {...props} />
      </Suspense>
    </TreeBoundary>
  );
}
