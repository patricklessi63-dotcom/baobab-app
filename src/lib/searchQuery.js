// Aide pour construire en sécurité des filtres ILIKE/OR à partir d'une
// saisie utilisateur libre (recherche de communautés/événements/profils).
// Sans ça, un texte contenant "%", "_" ou "," produit un comportement
// surprenant, voire une requête cassée (voir commentaires ci-dessous).

// Échappe les caractères spéciaux du pattern LIKE/ILIKE de Postgres :
// "%" (n'importe quelle suite de caractères) et "_" (un caractère) sont
// des jokers même dans la partie saisie par l'utilisateur — sans
// échappement, chercher "100%" matcherait "100" suivi de n'importe quoi
// au lieu du texte littéral "100%". Le backslash est échappé en premier
// car c'est le caractère d'échappement lui-même.
export function escapeLikePattern(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Entoure la valeur de guillemets doubles pour l'insérer sans risque
// dans la chaîne de filtre brute passée à .or() de PostgREST : la
// virgule et les parenthèses y sont des caractères réservés (séparateur
// de conditions / groupement) — sans guillemets, une recherche contenant
// une virgule (ex: "Montréal, QC") casse la requête entière (erreur 400
// PGRST100) au lieu de simplement filtrer. Seuls le guillemet et le
// backslash doivent alors être échappés à l'intérieur des guillemets.
// Vérifié empiriquement contre l'API PostgREST du projet (voir
// discussion) : "or=(name.ilike.%a, b%)" échoue en 400, alors que
// 'or=(name.ilike."%a, b%")' est accepté.
export function escapeOrFilterValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// Normalise un texte pour une comparaison de recherche insensible à la fois
// aux accents/diacritiques ET à la casse — ex. "Montreal" (tapé sans accent,
// clavier anglais ou saisie rapide) doit retrouver "Montréal", et "MARIE"
// doit retrouver "marie". Originellement écrite dans SocialShell.jsx pour la
// recherche globale du header (candidats/profils), puis centralisée ici pour
// être réutilisée par toute recherche texte purement client (liste de
// conversations, messages d'une conversation, actualités immigration...) —
// elle ne remplace PAS escapeLikePattern/escapeOrFilterValue ci-dessus, qui
// servent à construire un filtre ILIKE côté serveur (Postgres), insensible à
// la casse mais PAS aux accents en l'absence de l'extension unaccent.
const DIACRITICS_RE = /\p{Diacritic}/gu;
// Bug corrigé à l'audit (v1.1.0) : "œ"/"æ" (ligatures françaises — cœur,
// sœur, œuf, vœu, nœud...) ne sont PAS des caractères accentués au sens
// Unicode : ils n'ont aucune décomposition canonique, donc "cœur".normalize
// ("NFD") reste "cœur" tel quel (vérifié) et \p{Diacritic} ne les retire pas
// non plus — seuls les vrais diacritiques (accents, cédille...) portés sur
// une lettre de base passent par ce mécanisme. Or ces mots sont très
// fréquemment autocorrigés par le clavier (iOS/Mac transforme "coeur" tapé
// en "cœur" à la volée) : sans ce correctif, rechercher "coeur" ne trouvait
// jamais un message/actualité contenant "cœur" (autocorrigé), ni l'emoji
// ❤️ dans le sélecteur d'emojis, et inversement. Remplacement manuel après
// le passage en minuscules (qui uniformise déjà Œ/Æ en œ/æ).
export function normalizeForSearch(text) {
  return (text || "")
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}
