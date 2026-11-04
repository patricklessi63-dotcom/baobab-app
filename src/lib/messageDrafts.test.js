// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadDraft, saveDraft, clearDraft, clearAllDrafts, DRAFT_TTL_MS, MAX_DRAFT_LENGTH } from "./messageDrafts";

describe("messageDrafts", () => {
  beforeEach(() => localStorage.clear());

  it("enregistre et restaure un brouillon par conversation", () => {
    saveDraft("me", "alice", "Salut Alice");
    saveDraft("me", "bob", "Coucou Bob");
    expect(loadDraft("me", "alice")).toBe("Salut Alice");
    expect(loadDraft("me", "bob")).toBe("Coucou Bob");
    expect(loadDraft("me", "carol")).toBe("");
  });

  it("garde un brouillon distinct par compte sur le même appareil", () => {
    saveDraft("me", "alice", "à moi");
    expect(loadDraft("autre-compte", "alice")).toBe("");
  });

  it("un texte vide ou fait d'espaces supprime le brouillon", () => {
    saveDraft("me", "alice", "texte");
    saveDraft("me", "alice", "   ");
    expect(loadDraft("me", "alice")).toBe("");
    expect(localStorage.length).toBe(0);
  });

  it("clearDraft supprime uniquement la conversation visée", () => {
    saveDraft("me", "alice", "a");
    saveDraft("me", "bob", "b");
    clearDraft("me", "alice");
    expect(loadDraft("me", "alice")).toBe("");
    expect(loadDraft("me", "bob")).toBe("b");
  });

  it("expire après 30 jours et se nettoie", () => {
    const t0 = 1_000_000;
    saveDraft("me", "alice", "vieux", t0);
    expect(loadDraft("me", "alice", t0 + DRAFT_TTL_MS - 1)).toBe("vieux");
    expect(loadDraft("me", "alice", t0 + DRAFT_TTL_MS + 1)).toBe("");
    expect(localStorage.length).toBe(0);
  });

  it("plafonne la longueur", () => {
    saveDraft("me", "alice", "x".repeat(MAX_DRAFT_LENGTH + 500));
    expect(loadDraft("me", "alice")).toHaveLength(MAX_DRAFT_LENGTH);
  });

  it("ignore un contenu corrompu sans planter", () => {
    localStorage.setItem("bb-draft:me:alice", "pas du json");
    expect(loadDraft("me", "alice")).toBe("");
    localStorage.setItem("bb-draft:me:bob", JSON.stringify({ t: 12, ts: "x" }));
    expect(loadDraft("me", "bob")).toBe("");
  });

  it("clearAllDrafts supprime les brouillons mais pas les autres clés", () => {
    saveDraft("me", "alice", "a");
    saveDraft("me", "bob", "b");
    localStorage.setItem("bb-pending-location", "x");
    clearAllDrafts();
    expect(loadDraft("me", "alice")).toBe("");
    expect(loadDraft("me", "bob")).toBe("");
    expect(localStorage.getItem("bb-pending-location")).toBe("x");
  });

  it("sans identifiant, ne fait rien", () => {
    saveDraft(null, "alice", "x");
    saveDraft("me", undefined, "x");
    expect(localStorage.length).toBe(0);
    expect(loadDraft(null, "alice")).toBe("");
  });

  it("stockage indisponible ou plein : aucune exception", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(() => saveDraft("me", "alice", "texte")).not.toThrow();
    spy.mockRestore();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    expect(loadDraft("me", "alice")).toBe("");
    get.mockRestore();
  });
});
