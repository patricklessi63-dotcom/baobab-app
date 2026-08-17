// Palette sombre partagée par tous les écrans d'authentification
// (Auth.jsx + UpdatePasswordScreen.jsx) — auparavant définie séparément
// dans chaque fichier (et divergente : UpdatePasswordScreen utilisait la
// palette claire de src/constants.js), ce qui créait une rupture visuelle
// en plein parcours de connexion. Un seul endroit désormais.
export const C = {
  dusk: "#0F1526",
  dusk3: "#232D52",
  bark: "#8A6A52",
  clay: "#C1613D",
  ochre: "#D9A441",
  acacia: "#8FAE86",
  sand: "#F2E9DC",
  sandDim: "rgba(242,233,220,0.72)",
};
