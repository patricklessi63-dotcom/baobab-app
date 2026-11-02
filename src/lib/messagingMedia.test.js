import { describe, it, expect } from "vitest";
import { photoDisplaySize, PHOTO_MAX_WIDTH, PHOTO_MAX_HEIGHT } from "./photoLayout";
import { downsamplePeaks, rmsLevel, normalizeWaveform, pseudoWaveform, normalizeDuration, WAVEFORM_BARS } from "./voiceWaveform";
import { planReactionToggle } from "./reactionToggle";
import { dayKey, formatDayLabel } from "../utils/format";

describe("photoDisplaySize — proportions respectées", () => {
  it("paysage 4:3 : pleine largeur, hauteur proportionnelle", () => {
    expect(photoDisplaySize(1600, 1200)).toEqual({ width: 240, height: 180 });
  });
  it("portrait 3:4 : la photo n'est plus rognée (240 × 320)", () => {
    expect(photoDisplaySize(1200, 1600)).toEqual({ width: 240, height: 320 });
  });
  it("carré : 240 × 240", () => {
    expect(photoDisplaySize(1000, 1000)).toEqual({ width: 240, height: 240 });
  });
  it("portrait 9:16 : plafonné en hauteur, largeur réduite pour garder le rapport", () => {
    const s = photoDisplaySize(1080, 1920);
    expect(s.height).toBe(PHOTO_MAX_HEIGHT);
    expect(s.width / s.height).toBeCloseTo(9 / 16, 1);
  });
  it("panorama extrême : rapport plafonné à 3:1 (rognage centré), jamais plus étroit que 96 px", () => {
    const s = photoDisplaySize(6000, 500);
    expect(s.width).toBe(PHOTO_MAX_WIDTH);
    expect(s.height).toBeGreaterThanOrEqual(80);
  });
  it("petite image : jamais agrandie au-delà de sa taille réelle (hors plancher tactile)", () => {
    expect(photoDisplaySize(200, 150)).toEqual({ width: 200, height: 150 });
    const tiny = photoDisplaySize(50, 50);
    expect(tiny).toEqual({ width: 96, height: 96 }); // plancher tactile
  });
  it("dimensions inconnues ou corrompues (media_meta venu de l'autre participant) -> null", () => {
    for (const bad of [[undefined, undefined], [0, 100], [100, 0], [NaN, 5], ["800", "600"], [-5, 10], [Infinity, 4], [1e9, 1e9]]) {
      expect(photoDisplaySize(...bad)).toBeNull();
    }
  });
});

describe("voiceWaveform", () => {
  it("downsamplePeaks renvoie toujours le bon nombre de barres, bornées 6..100", () => {
    const levels = Array.from({ length: 237 }, (_, i) => (Math.sin(i / 7) + 1) / 2);
    const bars = downsamplePeaks(levels);
    expect(bars).toHaveLength(WAVEFORM_BARS);
    expect(Math.max(...bars)).toBe(100);
    expect(Math.min(...bars)).toBeGreaterThanOrEqual(6);
  });
  it("silence ou liste vide : barres plates au plancher (pas de NaN)", () => {
    expect(downsamplePeaks([])).toEqual(new Array(WAVEFORM_BARS).fill(6));
    expect(downsamplePeaks([0, 0, 0])).toEqual(new Array(WAVEFORM_BARS).fill(6));
    expect(downsamplePeaks([NaN, -1, undefined]).every((v) => v === 6)).toBe(true);
  });
  it("normalise un enregistrement très calme sur le pic global", () => {
    const bars = downsamplePeaks([0.01, 0.02, 0.01, 0.005], 4);
    expect(Math.max(...bars)).toBe(100);
  });
  it("rmsLevel : silence = 0, signal plein = borné à 1", () => {
    expect(rmsLevel(new Uint8Array(128).fill(128))).toBe(0);
    expect(rmsLevel(Uint8Array.from({ length: 128 }, (_, i) => (i % 2 ? 255 : 0)))).toBe(1);
    expect(rmsLevel(null)).toBe(0);
  });
  it("normalizeWaveform n'accepte pas n'importe quoi (jsonb écrit par l'autre participant)", () => {
    expect(normalizeWaveform("abc")).toBeNull();
    expect(normalizeWaveform([1, 2])).toBeNull();
    expect(normalizeWaveform({ length: 99999 })).toBeNull();
    const huge = normalizeWaveform(new Array(100000).fill(50));
    expect(huge).toHaveLength(128);
    expect(normalizeWaveform([5, "x", 250, -3, NaN])).toEqual([6, 6, 100, 6, 6]);
  });
  it("pseudoWaveform est déterministe par message et reste dans les bornes", () => {
    expect(pseudoWaveform(42)).toEqual(pseudoWaveform(42));
    expect(pseudoWaveform(42)).not.toEqual(pseudoWaveform(43));
    const w = pseudoWaveform("abc");
    expect(w).toHaveLength(WAVEFORM_BARS);
    expect(w.every((v) => v >= 10 && v <= 100)).toBe(true);
  });
  it("normalizeDuration rejette Infinity, NaN, négatifs et valeurs absurdes", () => {
    expect(normalizeDuration(12.4)).toBe(12.4);
    for (const bad of [Infinity, NaN, -1, 0, "5", null, 99999]) expect(normalizeDuration(bad)).toBeNull();
  });
});

describe("planReactionToggle — une réaction par personne et par message", () => {
  const me = "u1";
  it("première réaction : ajout", () => {
    const r = planReactionToggle([], me, "❤️");
    expect(r.addEmoji).toBe("❤️");
    expect(r.removeEmojis).toEqual([]);
    expect(r.next).toEqual([{ profile_id: me, emoji: "❤️" }]);
  });
  it("même emoji : retrait", () => {
    const r = planReactionToggle([{ profile_id: me, emoji: "❤️" }], me, "❤️");
    expect(r.addEmoji).toBeNull();
    expect(r.removeEmojis).toEqual(["❤️"]);
    expect(r.next).toEqual([]);
  });
  it("autre emoji : remplace la précédente, ne touche pas celles des autres", () => {
    const list = [{ profile_id: me, emoji: "❤️" }, { profile_id: "u2", emoji: "❤️" }];
    const r = planReactionToggle(list, me, "😂");
    expect(r.removeEmojis).toEqual(["❤️"]);
    expect(r.addEmoji).toBe("😂");
    expect(r.next).toEqual([{ profile_id: "u2", emoji: "❤️" }, { profile_id: me, emoji: "😂" }]);
  });
  it("nettoie aussi d'anciennes réactions multiples du même utilisateur", () => {
    const list = [{ profile_id: me, emoji: "❤️" }, { profile_id: me, emoji: "👍" }];
    const r = planReactionToggle(list, me, "🎉");
    expect(r.removeEmojis.sort()).toEqual(["❤️", "👍"].sort());
    expect(r.next.filter((x) => x.profile_id === me)).toHaveLength(1);
  });
  it("entrée invalide : traitée comme une liste vide", () => {
    expect(planReactionToggle(undefined, me, "👍").next).toHaveLength(1);
  });
});

describe("séparateurs de jour", () => {
  it("dayKey distingue le même jour/mois d'années différentes", () => {
    expect(dayKey("2025-03-03T12:00:00")).not.toBe(dayKey("2026-03-03T12:00:00"));
    expect(dayKey("2026-03-03T01:00:00")).toBe(dayKey("2026-03-03T23:00:00"));
    expect(dayKey(null)).toBe("");
    expect(dayKey("n'importe quoi")).toBe("");
  });
  it("formatDayLabel ajoute l'année pour une date d'une autre année seulement", () => {
    const lastYear = new Date();
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    lastYear.setMonth(0, 15);
    expect(formatDayLabel(lastYear.toISOString())).toContain(String(lastYear.getFullYear()));
    const sameYear = new Date(new Date().getFullYear(), 0, 2, 12);
    const today = new Date();
    if (sameYear.toDateString() !== today.toDateString() && new Date(today.getTime() - 86400000).toDateString() !== sameYear.toDateString()) {
      expect(formatDayLabel(sameYear.toISOString())).not.toMatch(/\d{4}/);
    }
  });
});

import { findMatchRanges } from "./searchQuery";
describe("findMatchRanges — surlignage de la recherche", () => {
  it("ignore casse et accents mais renvoie les indices du texte d'origine", () => {
    expect(findMatchRanges("Un Café très chaud", "cafe")).toEqual([{ start: 3, end: 7 }]);
    expect(findMatchRanges("CAFÉ café", "café")).toEqual([{ start: 0, end: 4 }, { start: 5, end: 9 }]);
  });
  it("reste exact quand la normalisation change la longueur (œ → oe, é décomposé)", () => {
    const t = "cœur de e\u0301té";
    const r = findMatchRanges(t, "ete");
    expect(t.slice(r[0].start, r[0].end)).toBe("été");
    expect(findMatchRanges("cœur", "coeur")).toEqual([{ start: 0, end: 4 }]);
  });
  it("requête vide ou absente : aucune plage ; occurrences successives", () => {
    expect(findMatchRanges("abc", "")).toEqual([]);
    expect(findMatchRanges("abc", "   ")).toEqual([]);
    expect(findMatchRanges("aaaa", "aa")).toEqual([{ start: 0, end: 2 }, { start: 2, end: 4 }]);
    expect(findMatchRanges("ab", "abc")).toEqual([]);
    expect(findMatchRanges(null, "a")).toEqual([]);
  });
});
