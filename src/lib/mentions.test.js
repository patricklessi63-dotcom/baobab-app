import { describe, it, expect } from "vitest";
import { findActiveMention, applyMention, addMention, prunedMentions, splitMentions, escapeLike, isMissingColumnError, MAX_MENTIONS } from "./mentions.js";

describe("findActiveMention", () => {
  it("détecte « @ » en début de texte ou après une espace, avec la requête déjà tapée", () => {
    expect(findActiveMention("@aw", 3)).toEqual({ start: 0, query: "aw" });
    expect(findActiveMention("Salut @Awa", 10)).toEqual({ start: 6, query: "Awa" });
    expect(findActiveMention("Salut @", 7)).toEqual({ start: 6, query: "" });
  });
  it("accepte un prénom suivi d'un nom (une seule espace)", () => {
    expect(findActiveMention("coucou @Awa Di", 14)).toEqual({ start: 7, query: "Awa Di" });
    expect(findActiveMention("coucou @Awa Diop bien", 21)).toBeNull();
  });
  it("une adresse e-mail n'est pas une mention (« @ » collé à un mot)", () => {
    expect(findActiveMention("ecris a moi@exemple.ca", 22)).toBeNull();
  });
  it("pas de mention au-delà d'un retour à la ligne, d'une espace de tête, ou sans « @ »", () => {
    expect(findActiveMention("@Awa\nsuite", 10)).toBeNull();
    expect(findActiveMention("@ Awa", 5)).toBeNull();
    expect(findActiveMention("bonjour", 7)).toBeNull();
    expect(findActiveMention("", 0)).toBeNull();
    expect(findActiveMention(null, 0)).toBeNull();
  });
  it("tient compte de la position du curseur (texte après le curseur ignoré)", () => {
    expect(findActiveMention("@Awa et la suite", 4)).toEqual({ start: 0, query: "Awa" });
  });
});

describe("applyMention / addMention / prunedMentions", () => {
  it("remplace la requête par « @Nom » suivi d'une espace et place le curseur après", () => {
    expect(applyMention("Salut @aw la suite", 6, 9, { name: "Awa Diop" })).toEqual({ text: "Salut @Awa Diop  la suite", caret: 16 });
    expect(applyMention("@a", 0, 2, { name: "Awa" })).toEqual({ text: "@Awa ", caret: 5 });
  });
  it("ajoute sans doublon et plafonne à cinq", () => {
    let m = [];
    for (let i = 0; i < 8; i++) m = addMention(m, { id: `u${i}`, name: `N${i}` });
    expect(m).toHaveLength(MAX_MENTIONS);
    expect(addMention(m, { id: "u0", name: "N0" })).toBe(m);
    expect(addMention([], { name: "Sans id" })).toEqual([]);
  });
  it("ne garde que les mentions encore présentes dans le texte", () => {
    const ms = [{ id: "a", name: "Awa" }, { id: "b", name: "Zoe" }, { id: "a", name: "Awa" }];
    expect(prunedMentions("Bonjour @Awa !", ms)).toEqual([{ id: "a", name: "Awa" }]);
    expect(prunedMentions("rien", ms)).toEqual([]);
    expect(prunedMentions("@Awa @Zoe", null)).toEqual([]);
  });
});

describe("splitMentions", () => {
  const ms = [{ id: "a", name: "Awa" }, { id: "d", name: "Awa Diop" }];
  it("sans mention : un seul segment de texte", () => {
    expect(splitMentions("Bonjour", [])).toEqual([{ text: "Bonjour" }]);
    expect(splitMentions("", null)).toEqual([{ text: "" }]);
  });
  it("surligne les mentions connues, le nom le plus long d'abord", () => {
    const seg = splitMentions("Merci @Awa Diop et @Awa !", ms);
    expect(seg.map((s) => s.text)).toEqual(["Merci ", "@Awa Diop", " et ", "@Awa", " !"]);
    expect(seg[1].mention.id).toBe("d");
    expect(seg[3].mention.id).toBe("a");
  });
  it("ne surligne pas un nom collé à d'autres lettres (« @Awassa » n'est pas « @Awa »)", () => {
    expect(splitMentions("@Awassa", ms)).toEqual([{ text: "@Awassa" }]);
  });
  it("une « @mot » inconnue reste du texte", () => {
    expect(splitMentions("Salut @Zoe", ms)).toEqual([{ text: "Salut @Zoe" }]);
  });
});

describe("utilitaires", () => {
  it("escapeLike protège % _ \\", () => {
    expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  });
  it("isMissingColumnError reconnaît une colonne absente, pas les autres erreurs", () => {
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'parent_id' column of 'post_comments'" }, "parent_id")).toBe(true);
    expect(isMissingColumnError({ code: "42703", message: "column mentions does not exist" }, "parent_id", "mentions")).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'zzz' column" }, "parent_id", "mentions")).toBe(false);
    expect(isMissingColumnError({ code: "23505", message: "duplicate" }, "parent_id")).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});
