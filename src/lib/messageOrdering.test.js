import { describe, it, expect } from "vitest";
import { sortMessagesChronologically } from "./messageOrdering";

describe("sortMessagesChronologically", () => {
  it("laisse une liste déjà chronologique inchangée", () => {
    const list = [
      { id: 1, created_at: "2026-09-25T10:00:00.000Z" },
      { id: 2, created_at: "2026-09-25T10:00:01.000Z" },
    ];
    expect(sortMessagesChronologically(list)).toEqual(list);
  });

  it("réordonne une photo insérée après coup (upload lent) derrière un texte inséré entre-temps", () => {
    // Scénario concret : la photo est cliquée en premier (tableau local
    // ordonné [photo, texte]) mais son upload prend plusieurs secondes ;
    // le texte, envoyé juste après, est inséré en base avant elle.
    const photoOptimisticThenReal = { id: "real-photo", kind: "image", created_at: "2026-09-25T10:00:05.000Z" };
    const textReal = { id: "real-texte", kind: "text", created_at: "2026-09-25T10:00:01.000Z" };
    const clientOrder = [photoOptimisticThenReal, textReal]; // ordre de clic, pas l'ordre réel
    expect(sortMessagesChronologically(clientOrder)).toEqual([textReal, photoOptimisticThenReal]);
  });

  it("conserve l'ordre d'origine (tri stable) en cas de created_at strictement identique", () => {
    const a = { id: 1, created_at: "2026-09-25T10:00:00.000Z" };
    const b = { id: 2, created_at: "2026-09-25T10:00:00.000Z" };
    expect(sortMessagesChronologically([a, b])).toEqual([a, b]);
    expect(sortMessagesChronologically([b, a])).toEqual([b, a]);
  });

  it("ne modifie pas le tableau d'origine (nouvelle référence)", () => {
    const list = [{ id: 1, created_at: "2026-09-25T10:00:00.000Z" }];
    const sorted = sortMessagesChronologically(list);
    expect(sorted).not.toBe(list);
  });

  it("place un message sans created_at (filet de sécurité, ne devrait pas arriver) sans planter", () => {
    const withMissing = [
      { id: 1, created_at: "2026-09-25T10:00:00.000Z" },
      { id: 2, created_at: undefined },
    ];
    expect(() => sortMessagesChronologically(withMissing)).not.toThrow();
  });
});
