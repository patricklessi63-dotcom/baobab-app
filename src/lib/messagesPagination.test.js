import { describe, it, expect } from "vitest";
import { buildOlderMessagesFilter } from "./messagesPagination";

// Bug corrigé à l'audit pagination (loadOlderMessages, App.jsx) : voir le
// commentaire de messagesPagination.js. Ces tests couvrent directement la
// construction du filtre curseur composé, pas l'appel réseau (App.jsx n'a
// aucun harnais de test — fichier racine trop volumineux pour être monté
// simplement ; la couverture réelle du bug se limite donc à cette fonction
// pure, extraite précisément pour rester testable en isolation).
describe("buildOlderMessagesFilter", () => {
  it("combine un .lt strict sur created_at avec une égalité + .lt sur id pour les égalités exactes", () => {
    const filter = buildOlderMessagesFilter({ created_at: "2024-01-01T00:00:00.000Z", id: 42 });
    expect(filter).toBe(
      "created_at.lt.2024-01-01T00:00:00.000Z,and(created_at.eq.2024-01-01T00:00:00.000Z,id.lt.42)"
    );
  });

  // Bug réel évité : avec l'ancien filtre (".lt('created_at', oldest)" seul),
  // un message partageant EXACTEMENT le created_at du plus ancien déjà
  // affiché était exclu pour toujours dès que son "jumeau" avait déjà été
  // chargé — jamais revu, même en rechargeant la page suivante. On simule
  // ici l'évaluation du filtre PostgREST généré (OR de deux conditions) sur
  // un petit jeu de lignes pour vérifier que ce message est bien retrouvé.
  it("retrouve un message au même created_at exact que le curseur (jamais sauté), sans revoir les plus récents (jamais dupliqué)", () => {
    const rows = [
      { id: 3, created_at: "2024-01-01T00:00:01.000Z" }, // plus récent que le curseur -> ne doit pas revenir
      { id: 2, created_at: "2024-01-01T00:00:00.000Z" }, // = le curseur lui-même -> ne doit pas revenir (déjà affiché)
      { id: 1, created_at: "2024-01-01T00:00:00.000Z" }, // même created_at que le curseur, id inférieur -> doit revenir
      { id: 0, created_at: "2023-12-31T23:59:59.000Z" }, // strictement plus ancien -> doit revenir
    ];
    const cursor = { created_at: "2024-01-01T00:00:00.000Z", id: 2 };
    const filter = buildOlderMessagesFilter(cursor);

    // Interprète le filtre "a.lt.X,and(a.eq.X,b.lt.Y)" généré, exactement
    // comme PostgREST évaluerait le OR côté serveur.
    const [ltClause, andClause] = filter.split(",and(");
    const ltValue = ltClause.replace("created_at.lt.", "");
    const [eqValue, idLtValue] = andClause.replace(")", "").split(",id.lt.").map((s, i) => (i === 0 ? s.replace("created_at.eq.", "") : s));
    const matched = rows.filter((r) => r.created_at < ltValue || (r.created_at === eqValue && String(r.id) < idLtValue));

    expect(matched.map((r) => r.id).sort()).toEqual([0, 1]);
  });
});
