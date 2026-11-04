import { describe, it, expect } from "vitest";
import { storyDurationFor, STORY_MIN_MS, STORY_MAX_MS } from "./storyTiming.js";

describe("storyDurationFor", () => {
  it("un statut court garde la durée minimale", () => {
    expect(storyDurationFor({ text: "Salut" })).toBe(STORY_MIN_MS);
    expect(storyDurationFor({ text: "" })).toBe(STORY_MIN_MS);
    expect(storyDurationFor(null)).toBe(STORY_MIN_MS);
  });
  it("un texte plus long dure plus longtemps, avec un plafond", () => {
    const medium = storyDurationFor({ text: "x".repeat(60) });
    expect(medium).toBeGreaterThan(STORY_MIN_MS);
    expect(medium).toBeLessThan(STORY_MAX_MS);
    expect(storyDurationFor({ text: "x".repeat(5000) })).toBe(STORY_MAX_MS);
  });
  it("la durée croît avec la longueur", () => {
    expect(storyDurationFor({ text: "x".repeat(80) })).toBeGreaterThan(storyDurationFor({ text: "x".repeat(40) }));
  });
  it("une photo ou une vidéo garde la durée minimale (la vidéo fixe la sienne ensuite)", () => {
    expect(storyDurationFor({ media_url: "https://x/y.jpg", text: "x".repeat(500) })).toBe(STORY_MIN_MS);
  });
});
