import { describe, it, expect } from "vitest";
import { getProfileCompletion } from "./profileCompletion.js";

const FULL = {
  name: "Awa",
  birth_date: "1994-05-01",
  country: "Sénégal",
  province: "Québec",
  city: "Montréal",
  looking_for: "Amitié",
  interests: "Sport, Cuisine, Cinéma, Lecture, Voyage",
  bio: "x".repeat(120),
  arrived_since: "2 ans",
  immigration_status: "Résident permanent",
  occupation: "Infirmière",
  education_level: "Baccalauréat",
  languages_detail: [{ language: "Français" }, { language: "Wolof" }],
};

describe("getProfileCompletion", () => {
  it("profil absent -> 0 % et aucune astuce", () => {
    expect(getProfileCompletion(null)).toEqual({ percent: 0, tips: [] });
  });

  it("profil vide -> 0 % avec des astuces", () => {
    const r = getProfileCompletion({}, []);
    expect(r.percent).toBe(0);
    expect(r.tips.length).toBeGreaterThan(0);
  });

  it("profil complet + 3 photos -> 100 %, plus aucune astuce", () => {
    const r = getProfileCompletion(FULL, [{}, {}, {}]);
    expect(r.percent).toBe(100);
    expect(r.tips).toEqual([]);
  });

  it("plafonne à 100 % et arrondit le pourcentage", () => {
    // Seul arrived_since renseigné -> 2,5 % -> Math.round -> 3
    const r = getProfileCompletion({ arrived_since: "1 an" }, []);
    expect(r.percent).toBe(3);
  });

  it("photo : 1 photo compte à moitié et suggère d'en ajouter", () => {
    const one = getProfileCompletion({}, [{}]);
    const three = getProfileCompletion({}, [{}, {}, {}]);
    expect(three.percent - one.percent).toBe(10);
    expect(one.tips.some((t) => /quelques photos/i.test(t))).toBe(true);
  });

  it("centres d'intérêt : 1 à 4 rapportent 7 %, 5+ rapportent 15 %", () => {
    const few = getProfileCompletion({ interests: "Sport, Cuisine" }, []);
    const many = getProfileCompletion({ interests: "Sport, Cuisine, Cinéma, Lecture, Voyage" }, []);
    expect(few.percent).toBe(7);
    expect(many.percent).toBe(15);
    expect(few.tips.some((t) => /5 ou plus/i.test(t))).toBe(true);
  });

  it("intention intime : les 5 % 'valeurs' ne comptent qu'avec relationship_values", () => {
    const sansValeurs = getProfileCompletion({ looking_for: "Amour" }, []);
    const avecValeurs = getProfileCompletion({ looking_for: "Amour", relationship_values: "Honnêteté" }, []);
    expect(avecValeurs.percent - sansValeurs.percent).toBe(5);
  });

  it("intention non intime : looking_for seul suffit pour les 15 %", () => {
    const r = getProfileCompletion({ looking_for: "Réseau professionnel" }, []);
    expect(r.percent).toBe(15);
  });

  it("bio : >0 caractère -> 5 %, >=80 caractères -> 10 %", () => {
    expect(getProfileCompletion({ bio: "Salut" }, []).percent).toBe(5);
    expect(getProfileCompletion({ bio: "x".repeat(80) }, []).percent).toBe(10);
  });

  it("langues : 1 langue -> 5 %, 2+ -> 10 %, 0 -> astuce", () => {
    expect(getProfileCompletion({ languages_detail: [{ language: "Français" }] }, []).percent).toBe(5);
    expect(
      getProfileCompletion({ languages_detail: [{ language: "Français" }, { language: "Anglais" }] }, []).percent,
    ).toBe(10);
    expect(getProfileCompletion({}, []).tips.some((t) => /langues/i.test(t))).toBe(true);
  });
});
