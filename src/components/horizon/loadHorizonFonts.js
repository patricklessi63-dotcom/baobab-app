// Charge Syne (titres) et IBM Plex Mono (étiquettes) à la demande, uniquement
// quand une page Horizon s'affiche : le reste de l'app ne paie rien. Manrope est
// déjà chargé par index.html (400 à 800). La CSP de vercel.json autorise déjà
// fonts.googleapis.com (style-src) et fonts.gstatic.com (font-src) ; on injecte
// une balise <link> (aucun script inline, donc aucune empreinte CSP à modifier).
// display=swap : le texte s'affiche tout de suite avec la police de repli.
export const HORIZON_FONTS_ID = "hz-fonts";
export const HORIZON_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";

export function loadHorizonFonts() {
  try {
    if (typeof document === "undefined" || document.getElementById(HORIZON_FONTS_ID)) return;
    const link = document.createElement("link");
    link.id = HORIZON_FONTS_ID;
    link.rel = "stylesheet";
    link.href = HORIZON_FONTS_URL;
    document.head.appendChild(link);
  } catch {
    /* polices décoratives : la page fonctionne avec les polices de repli */
  }
}
