// Adresse externe sûre à mettre dans un lien (href) : seulement http: ou https:.
// Les adresses d'articles viennent de flux externes (fetch-immigration-news) puis de la base : une adresse
// « javascript: » ou « data: » placée dans un flux deviendrait un lien piégé au clic. Retourne l'adresse normalisée,
// ou null si elle n'est pas exploitable (vide, relative, autre schéma, mal formée).
export function safeHttpUrl(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 2048) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch (_) {
    return null;
  }
}
