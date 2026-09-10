import { describe, it, expect, afterEach } from "vitest";
import {
  matchKey,
  truncateUnicodeSafe,
  visibleAge,
  formatLastSeen,
  formatMessageTime,
  formatLongDate,
  formatDayLabel,
  messagePreviewLabel,
  formatEventWhen,
} from "./format.js";

describe("matchKey", () => {
  it("produit la même clé quel que soit l'ordre des deux ids", () => {
    expect(matchKey("alice", "bob")).toBe(matchKey("bob", "alice"));
  });

  it("joint avec le séparateur '__' dans l'ordre trié", () => {
    expect(matchKey("bob", "alice")).toBe("alice__bob");
  });

  it("est déterministe pour des ids numériques (tri lexical, mais stable)", () => {
    expect(matchKey(10, 9)).toBe(matchKey(9, 10));
    expect(matchKey(10, 9)).toBe("10__9"); // "1" < "9" en tri lexical
  });

  it("gère deux ids identiques", () => {
    expect(matchKey("x", "x")).toBe("x__x");
  });

  it("gère des UUID réalistes", () => {
    const a = "00000000-0000-0000-0000-000000000001";
    const b = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    expect(matchKey(b, a)).toBe(`${a}__${b}`);
  });
});

describe("truncateUnicodeSafe", () => {
  it("retourne la chaîne inchangée si sous la limite", () => {
    expect(truncateUnicodeSafe("hello", 10)).toBe("hello");
    expect(truncateUnicodeSafe("hello", 5)).toBe("hello");
  });

  it("retourne \"\" pour une entrée falsy", () => {
    expect(truncateUnicodeSafe("", 5)).toBe("");
    expect(truncateUnicodeSafe(null, 5)).toBe("");
    expect(truncateUnicodeSafe(undefined, 5)).toBe("");
  });

  it("tronque du texte ASCII sur la limite exacte", () => {
    expect(truncateUnicodeSafe("abcdef", 3)).toBe("abc");
  });

  it("ne coupe jamais une paire surrogate (emoji simple) en deux", () => {
    // "😀😀" = 4 unités UTF-16 ; limite 3 ne doit pas laisser un surrogate seul.
    const out = truncateUnicodeSafe("😀😀", 3);
    expect(out).toBe("😀");
    expect([...out]).toHaveLength(1);
  });

  it("ne coupe pas un drapeau (paire d'indicateurs régionaux) en deux", () => {
    // 🇨🇦 = 2 points de code (4 unités UTF-16). Limite 4 -> drapeau entier ;
    // limites < 4 -> rien (le graphème ne rentre pas).
    expect(truncateUnicodeSafe("🇨🇦x", 4)).toBe("🇨🇦");
    expect(truncateUnicodeSafe("🇨🇦x", 2)).toBe("");
    expect(truncateUnicodeSafe("🇨🇦x", 5)).toBe("🇨🇦x");
  });

  it("ne casse pas une séquence ZWJ (famille) ni un sélecteur de variation", () => {
    const family = "👨‍👩‍👧"; // 8 unités UTF-16
    expect(truncateUnicodeSafe(family + "!", 8)).toBe(family);
    expect(truncateUnicodeSafe(family + "!", 5)).toBe(""); // graphème indivisible
    const heart = "❤️"; // coeur + sélecteur de variation U+FE0F
    expect(truncateUnicodeSafe(heart + "abc", 2)).toBe(heart);
  });

  it("chemin de repli sans Intl.Segmenter : protège au moins des surrogates orphelins", () => {
    const orig = Intl.Segmenter;
    // eslint-disable-next-line no-global-assign
    Intl.Segmenter = undefined;
    try {
      expect(truncateUnicodeSafe("😀😀", 3)).toBe("😀"); // recule d'un cran sur high surrogate
      expect(truncateUnicodeSafe("abcd", 3)).toBe("abc"); // ASCII inchangé
      // Preuve que le repli est bien pris : ici il coupe à 2 unités UTF-16
      // (un seul indicateur régional) là où Intl.Segmenter aurait rendu "".
      expect(truncateUnicodeSafe("🇨🇦x", 3)).toBe("🇨");
    } finally {
      Intl.Segmenter = orig;
    }
  });
});

describe("visibleAge", () => {
  it("masque l'âge quand show_birth_year === false", () => {
    expect(visibleAge({ age: 34, show_birth_year: false })).toBeNull();
  });

  it("expose l'âge sinon (true / undefined)", () => {
    expect(visibleAge({ age: 34, show_birth_year: true })).toBe(34);
    expect(visibleAge({ age: 34 })).toBe(34);
  });

  it("ne jette pas sur un profil absent", () => {
    expect(visibleAge(undefined)).toBeUndefined();
  });
});

describe("formatLastSeen", () => {
  it("retourne un libellé dédié si la date est absente", () => {
    expect(formatLastSeen(null)).toBe("Statut inconnu");
    expect(formatLastSeen(undefined)).toBe("Statut inconnu");
  });

  it("bascule les unités minute -> heure -> jour", () => {
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    expect(formatLastSeen(ago(10 * 1000))).toBe("Vu à l'instant");
    expect(formatLastSeen(ago(30 * 60 * 1000))).toBe("Vu il y a 30 min");
    expect(formatLastSeen(ago(3 * 60 * 60 * 1000))).toBe("Vu il y a 3 h");
    expect(formatLastSeen(ago(2 * 24 * 60 * 60 * 1000))).toBe("Vu il y a 2 j");
  });
});

describe("formatMessageTime", () => {
  it("retourne \"\" sans date", () => {
    expect(formatMessageTime(null)).toBe("");
    expect(formatMessageTime("")).toBe("");
  });

  it("retourne une heure formatée pour une date valide", () => {
    expect(formatMessageTime("2026-09-03T14:05:00Z")).toMatch(/\d/);
  });
});

describe("formatLongDate", () => {
  it("retourne \"\" sans date", () => {
    expect(formatLongDate(null)).toBe("");
  });

  it("produit une date longue en toutes lettres, jamais le format numérique ISO", () => {
    const out = formatLongDate("2026-09-15T12:00:00Z");
    expect(out).toMatch(/septembre 2026/);
    expect(out).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDayLabel", () => {
  it("retourne \"\" sans date", () => {
    expect(formatDayLabel(null)).toBe("");
  });

  it("reconnaît aujourd'hui et hier", () => {
    expect(formatDayLabel(new Date().toISOString())).toBe("Aujourd'hui");
    expect(formatDayLabel(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())).toBe("Hier");
  });
});

describe("messagePreviewLabel", () => {
  it("affiche 'Message supprimé' dès qu'il y a deleted_at, avant tout le reste", () => {
    expect(messagePreviewLabel({ deleted_at: "2026-01-01", kind: "image", text: "secret" })).toBe("Message supprimé");
  });

  it("mappe chaque type de média à son aperçu", () => {
    expect(messagePreviewLabel({ kind: "image" })).toBe("📷 Photo");
    expect(messagePreviewLabel({ kind: "video" })).toBe("🎥 Vidéo");
    expect(messagePreviewLabel({ kind: "audio" })).toBe("🎤 Message vocal");
    expect(messagePreviewLabel({ kind: "sticker" })).toBe("😊 Autocollant");
  });

  it("utilise le nom de fichier réel, avec repli 'Fichier'", () => {
    expect(messagePreviewLabel({ kind: "file", media_meta: { original_name: "cv.pdf" } })).toBe("📎 cv.pdf");
    expect(messagePreviewLabel({ kind: "file" })).toBe("📎 Fichier");
  });

  it("retombe sur le texte, ou \"\" si rien", () => {
    expect(messagePreviewLabel({ text: "coucou" })).toBe("coucou");
    expect(messagePreviewLabel({})).toBe("");
    expect(messagePreviewLabel(null)).toBe("");
  });
});

describe("formatEventWhen", () => {
  it("retourne \"\" sans date", () => {
    expect(formatEventWhen(null)).toBe("");
  });

  it("commence par un jour de semaine capitalisé", () => {
    const out = formatEventWhen("2026-09-03T18:30:00Z", "America/Toronto");
    expect(out[0]).toBe(out[0].toUpperCase());
    expect(out).toMatch(/\d/);
  });
});
