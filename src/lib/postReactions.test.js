import { describe, it, expect } from "vitest";
import {
  POST_REACTIONS, HEART, normalizeReaction, tallyReactions, totalOf, topReactions, planReaction, applyReactionChange, isMissingEmojiColumn,
} from "./postReactions.js";

describe("réactions des publications", () => {
  it("six réactions : ❤️ 😂 😍 👏 🤝 😮", () => {
    expect(POST_REACTIONS).toEqual(["❤️", "😂", "😍", "👏", "🤝", "😮"]);
  });
  it("normalise un cœur avec ou sans sélecteur de variante ; refuse un emoji hors liste", () => {
    expect(normalizeReaction("❤")).toBe(HEART);
    expect(normalizeReaction("❤️")).toBe(HEART);
    expect(normalizeReaction("🤝")).toBe("🤝");
    expect(normalizeReaction("🔥")).toBeNull();
    expect(normalizeReaction("")).toBeNull();
    expect(normalizeReaction(null)).toBeNull();
  });
  it("dénombre par publication et retrouve MA réaction (ligne sans emoji = cœur)", () => {
    const { counts, mine } = tallyReactions([
      { post_id: "a", profile_id: "u1", emoji: "😂" },
      { post_id: "a", profile_id: "me", emoji: "👏" },
      { post_id: "a", profile_id: "u3" },
      { post_id: "b", profile_id: "me", emoji: "❤" },
      { post_id: "b", profile_id: "u2", emoji: "inconnu" },
    ], "me");
    expect(counts.a).toEqual({ "😂": 1, "👏": 1, "❤️": 1 });
    expect(counts.b).toEqual({ "❤️": 2 });
    expect(mine).toEqual({ a: "👏", b: "❤️" });
    expect(totalOf(counts.a)).toBe(3);
  });
  it("les emojis du résumé : les plus utilisés d'abord, trois au plus", () => {
    expect(topReactions({ "😂": 5, "❤️": 9, "👏": 1, "😮": 3, "🤝": 0 })).toEqual(["❤️", "😂", "😮"]);
    expect(topReactions({})).toEqual([]);
  });
  it("planReaction : ajouter, remplacer, retirer (même réaction), ignorer un emoji invalide", () => {
    expect(planReaction(null, "😂")).toEqual({ op: "insert", next: "😂" });
    expect(planReaction("😂", "👏")).toEqual({ op: "update", next: "👏" });
    expect(planReaction("😂", "😂")).toEqual({ op: "delete", next: null });
    expect(planReaction("❤", "❤️")).toEqual({ op: "delete", next: null });
    expect(planReaction("😂", "🔥")).toEqual({ op: "none", next: "😂" });
  });
  it("applyReactionChange : un remplacement ne change pas le total ; jamais de compteur négatif", () => {
    expect(applyReactionChange({ "❤️": 2 }, "❤️", "😂")).toEqual({ "❤️": 1, "😂": 1 });
    expect(applyReactionChange({ "❤️": 1 }, "❤️", null)).toEqual({});
    expect(applyReactionChange({}, "😂", null)).toEqual({});
    expect(applyReactionChange(undefined, null, "🤝")).toEqual({ "🤝": 1 });
  });
  it("détecte l'absence de la colonne emoji (SQL-32 pas encore exécuté)", () => {
    expect(isMissingEmojiColumn({ code: "PGRST204", message: "Could not find the 'emoji' column of 'post_likes' in the schema cache" })).toBe(true);
    expect(isMissingEmojiColumn({ code: "42703", message: "column post_likes.emoji does not exist" })).toBe(true);
    expect(isMissingEmojiColumn({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingEmojiColumn(null)).toBe(false);
  });
});
