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
