import { describe, it, expect } from "vitest";
import {
  computeMatch,
  filterCandidatesByPreferences,
  rankCandidates,
} from "./matchingService.js";
import { SCORE_FLOOR, SCORE_CEIL } from "./matchingConfig.js";

// ---------------------------------------------------------------------------
// filterCandidatesByPreferences — FILTRE DUR
// ---------------------------------------------------------------------------
describe("filterCandidatesByPreferences", () => {
  it("retourne la liste inchangée sans currentUser", () => {
    const list = [{ id: "a" }, { id: "b" }];
    expect(filterCandidatesByPreferences(null, list)).toBe(list);
  });

  it("exclut un candidat dont l'âge RENSEIGNÉ est hors des bornes", () => {
    const user = { pref_age_min: 25, pref_age_max: 40 };
    const out = filterCandidatesByPreferences(user, [
      { id: "young", age: 22 },
      { id: "ok", age: 30 },
      { id: "old", age: 55 },
    ]);
    expect(out.map((c) => c.id)).toEqual(["ok"]);
  });

  it("n'exclut JAMAIS un candidat sur une donnée d'âge manquante", () => {
    const user = { pref_age_min: 25, pref_age_max: 40 };
    const out = filterCandidatesByPreferences(user, [{ id: "noage" }, { id: "nullage", age: null }]);
    expect(out.map((c) => c.id)).toEqual(["noage", "nullage"]);
  });

  it("bornes d'âge par défaut : 18–99", () => {
    const out = filterCandidatesByPreferences({}, [
      { id: "17", age: 17 },
      { id: "18", age: 18 },
      { id: "99", age: 99 },
      { id: "100", age: 100 },
    ]);
    expect(out.map((c) => c.id)).toEqual(["18", "99"]);
  });

  it("distance 'Ma ville uniquement' : garde seulement la même ville (insensible à la casse)", () => {
    const user = { city: "Montréal", pref_distance: "Ma ville uniquement" };
    const out = filterCandidatesByPreferences(user, [
      { id: "same", city: "montréal" },
      { id: "other", city: "Québec" },
      { id: "nocity" },
    ]);
    expect(out.map((c) => c.id)).toEqual(["same"]);
  });

  it("distance : un candidat ayant masqué sa ville (show_city:false) est traité comme sans ville", () => {
    const user = { city: "Montréal", pref_distance: "Ma ville uniquement" };
    const out = filterCandidatesByPreferences(user, [{ id: "hidden", city: "Montréal", show_city: false }]);
    expect(out).toEqual([]);
  });

  it("distance 'Ma ville ou mon pays' : ville OU pays commun suffit", () => {
    const user = { city: "Montréal", country: "Canada", pref_distance: "Ma ville ou mon pays" };
    const out = filterCandidatesByPreferences(user, [
      { id: "city", city: "Montréal", country: "France" },
      { id: "country", city: "Lyon", country: "canada" },
      { id: "neither", city: "Lyon", country: "France" },
    ]);
    expect(out.map((c) => c.id)).toEqual(["city", "country"]);
  });

  it("filtre 'type de relation' : n'exclut que si le candidat a renseigné looking_for", () => {
    const user = { pref_looking_for: "Amour, Amitié" };
    const out = filterCandidatesByPreferences(user, [
      { id: "match", looking_for: "Amitié" },
      { id: "nomatch", looking_for: "Réseau professionnel" },
      { id: "empty", looking_for: "" },
      { id: "absent" },
    ]);
    expect(out.map((c) => c.id)).toEqual(["match", "empty", "absent"]);
  });
});

// ---------------------------------------------------------------------------
// computeMatch — SCORE
// ---------------------------------------------------------------------------
describe("computeMatch", () => {
  it("retourne un résultat neutre si un des deux profils est absent", () => {
    const r = computeMatch(null, { id: "x" });
    expect(r.score).toBe(0);
    expect(r.rawScore).toBe(0);
    expect(r.level).toBe("unknown");
    expect(r.reasons).toEqual([]);
    expect(r.breakdown).toEqual({});
  });

  it("applique le plancher SCORE_FLOOR quand rien n'est en commun", () => {
    const r = computeMatch({ id: "a" }, { id: "b" });
    expect(r.rawScore).toBe(0);
    expect(r.score).toBe(SCORE_FLOOR);
    expect(r.reasons).toHaveLength(1); // phrase de repli
  });

  it("applique le plafond SCORE_CEIL même quand rawScore dépasse (jamais 100 %)", () => {
    const rich = {
      looking_for: "Amitié, Amour, Réseau",
      relationship_values: "Honnêteté, Respect",
      interests: "Sport, Cuisine, Cinéma, Lecture, Voyage",
      wants_children: "Oui",
      family_importance: "Élevée",
      career_goal: "Stable",
      geographic_openness: "Ouvert",
      age: 30,
      pref_distance: "Peu importe",
      languages: "Français, Anglais",
      city: "Montréal",
      country: "Canada",
    };
    const r = computeMatch({ id: "a", ...rich }, { id: "b", ...rich });
    expect(r.rawScore).toBeGreaterThan(SCORE_CEIL);
    expect(r.score).toBe(SCORE_CEIL);
    expect(r.breakdown).toMatchObject({ intentions: 30, interests: 20, lifeProject: 15, languages: 10, location: 10 });
  });

  it("le score est arrondi (Math.round) à partir de la somme brute", () => {
    // location "même pays" = round(10/2) = 5 -> contribue un entier ; on
    // vérifie surtout qu'aucun score fractionnaire ne sort.
    const r = computeMatch(
      { id: "a", country: "Canada", languages: "Français" },
      { id: "b", country: "canada", languages: "Français" },
    );
    expect(Number.isInteger(r.score)).toBe(true);
    expect(Number.isInteger(r.rawScore)).toBe(true);
  });

  it("aucun NaN quand l'âge est manquant des deux côtés", () => {
    const r = computeMatch({ id: "a", interests: "Sport" }, { id: "b", interests: "Sport" });
    expect(Number.isNaN(r.score)).toBe(false);
    expect(Number.isNaN(r.rawScore)).toBe(false);
    expect(r.breakdown.preferences).toBe(0);
  });

  it("respecte la confidentialité : intérêts masqués (show_interests:false) ne rapportent aucun point", () => {
    const a = { id: "a", interests: "Sport, Cuisine, Voyage" };
    const visible = computeMatch(a, { id: "b", interests: "Sport, Cuisine, Voyage" });
    const hidden = computeMatch(a, { id: "b", interests: "Sport, Cuisine, Voyage", show_interests: false });
    expect(visible.breakdown.interests).toBeGreaterThan(0);
    expect(hidden.breakdown.interests).toBe(0);
    expect(hidden.commonInterests).toEqual([]);
  });

  it("la raison 'Son âge correspond à tes préférences' n'apparaît qu'avec une préférence d'âge explicite", () => {
    const base = { age: 31 };
    const withPref = computeMatch({ id: "a", age: 30, pref_age_min: 28 }, { id: "b", ...base });
    const noPref = computeMatch({ id: "a", age: 30 }, { id: "b", ...base });
    expect(withPref.reasons).toContain("Son âge correspond à tes préférences");
    expect(noPref.reasons).not.toContain("Son âge correspond à tes préférences");
  });

  it("respecte la confidentialité : projet de vie masqué (show_life_project:false) ne rapporte aucun point ni raison, même si tous les champs correspondent", () => {
    const a = {
      id: "a",
      wants_children: "Oui",
      family_importance: "Élevée",
      career_goal: "Stable",
      geographic_openness: "Ouvert",
    };
    const richB = { ...a, id: "b" };
    const visible = computeMatch(a, richB);
    const hidden = computeMatch(a, { ...richB, show_life_project: false });
    expect(visible.breakdown.lifeProject).toBeGreaterThan(0);
    expect(visible.reasons).toContain("Vous avez une vision similaire de votre projet de vie");
    expect(hidden.breakdown.lifeProject).toBe(0);
    expect(hidden.reasons).not.toContain("Vous avez une vision similaire de votre projet de vie");
  });

  it("deux non-réponses identiques ('Je préfère ne pas répondre' / 'Autre') ne comptent jamais comme point commun de projet de vie", () => {
    // wants_children et career_goal sont des non-réponses des deux côtés :
    // aucun des deux ne doit rapporter de points, seul family_importance
    // (une vraie valeur partagée) doit compter.
    const a = {
      id: "a",
      wants_children: "Je préfère ne pas répondre",
      career_goal: "Autre",
      family_importance: "Élevée",
    };
    const b = { ...a, id: "b" };
    const r = computeMatch(a, b);
    expect(r.breakdown.lifeProject).toBe(4); // poids de family_importance seul
  });

  it("respecte la confidentialité : année de naissance masquée (show_birth_year:false) ne rapporte aucun point d'âge ni raison, même si les âges sont proches", () => {
    const a = { id: "a", age: 30, pref_age_min: 28 };
    const visible = computeMatch(a, { id: "b", age: 31 });
    const hidden = computeMatch(a, { id: "b", age: 31, show_birth_year: false });
    expect(visible.breakdown.preferences).toBeGreaterThan(0);
    expect(visible.reasons).toContain("Son âge correspond à tes préférences");
    expect(hidden.breakdown.preferences).toBe(0);
    expect(hidden.reasons).not.toContain("Son âge correspond à tes préférences");
  });

  it("respecte la confidentialité : ville/pays masqués (show_city/show_country:false) ne rapportent aucun point de localisation ni libellé", () => {
    const a = { id: "a", city: "Montréal", country: "Canada" };
    const sameCityVisible = computeMatch(a, { id: "b", city: "montréal", country: "Canada" });
    const sameCityHidden = computeMatch(a, { id: "b", city: "montréal", country: "Canada", show_city: false, show_country: false });
    expect(sameCityVisible.breakdown.location).toBeGreaterThan(0);
    expect(sameCityVisible.locationLabel).toMatch(/Même ville/);
    expect(sameCityHidden.breakdown.location).toBe(0);
    expect(sameCityHidden.locationLabel).toBeNull();

    // Même pays uniquement (pas la même ville) : même garde attendue.
    const sameCountryHidden = computeMatch(
      { id: "a", country: "Canada" },
      { id: "b", country: "canada", show_country: false }
    );
    expect(sameCountryHidden.breakdown.location).toBe(0);
    expect(sameCountryHidden.locationLabel).toBeNull();
  });

  it("préférence de distance 'Ma ville ou mon pays' : un pays commun SEUL (villes différentes) rapporte déjà les points pleins", () => {
    const a = { id: "a", city: "Montréal", country: "Canada", pref_distance: "Ma ville ou mon pays" };
    const b = { id: "b", city: "Québec", country: "canada" };
    const r = computeMatch(a, b);
    expect(r.breakdown.preferences).toBe(7);
  });

  it("bonus 'valeurs relationnelles partagées' : ne s'applique que si les DEUX profils ont une intention romantique ET une valeur en commun", () => {
    const bothRomanticShared = computeMatch(
      { id: "a", looking_for: "Amour", relationship_values: "Honnêteté, Patience" },
      { id: "b", looking_for: "Relation sérieuse", relationship_values: "Respect, Honnêteté" }
    );
    // shared intentions: aucune intention littéralement identique ("Amour" vs
    // "Relation sérieuse") -> 0 pt d'intentions communes, mais le bonus valeurs
    // (+6) s'applique bien car les deux sont romantiques et partagent "Honnêteté".
    expect(bothRomanticShared.breakdown.intentions).toBe(6);

    // Un seul romantique ("Amour" pour a, "Amitié" pour b) : pas de bonus même
    // si relationship_values coïncident.
    const onlyOneRomantic = computeMatch(
      { id: "a", looking_for: "Amour", relationship_values: "Honnêteté" },
      { id: "b", looking_for: "Amitié", relationship_values: "Honnêteté" }
    );
    expect(onlyOneRomantic.breakdown.intentions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// rankCandidates — TRI sur rawScore non plafonné
// ---------------------------------------------------------------------------
describe("rankCandidates", () => {
  it("retourne [] sans currentUser", () => {
    expect(rankCandidates(null, [{ id: "a" }])).toEqual([]);
  });

  it("exclut le profil de l'utilisateur courant", () => {
    const user = { id: "me", interests: "Sport" };
    const out = rankCandidates(user, [{ id: "me", interests: "Sport" }, { id: "other", interests: "Sport" }]);
    expect(out.map((r) => r.profile.id)).toEqual(["other"]);
  });

  it("trie sur rawScore brut, pas sur le score affiché plafonné", () => {
    const rich = {
      looking_for: "Amitié, Amour, Réseau",
      relationship_values: "Honnêteté, Respect",
      interests: "Sport, Cuisine, Cinéma, Lecture, Voyage",
      family_importance: "Élevée",
      career_goal: "Stable",
      wants_children: "Oui",
      geographic_openness: "Ouvert",
      age: 30,
      pref_distance: "Peu importe",
      languages: "Français, Anglais",
      city: "Montréal",
      country: "Canada",
    };
    const user = { id: "me", ...rich };
    // A = profil complet (rawScore ~100). B = idem mais projet de vie plus
    // pauvre (rawScore ~97). Les deux plafonnent à SCORE_CEIL une fois
    // affichés — seul rawScore permet de les départager.
    const A = { id: "A", ...rich };
    const B = { id: "B", ...rich, geographic_openness: "" };
    const out = rankCandidates(user, [B, A]); // B fourni en premier exprès
    expect(out[0].match.score).toBe(out[1].match.score); // score affiché identique
    expect(out[0].match.rawScore).toBeGreaterThan(out[1].match.rawScore);
    expect(out.map((r) => r.profile.id)).toEqual(["A", "B"]);
  });
});
