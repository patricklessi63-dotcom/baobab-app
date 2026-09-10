import { describe, it, expect } from "vitest";
import { linkify } from "./linkify.js";

describe("linkify", () => {
  it("retourne un seul segment texte quand il n'y a aucun lien", () => {
    expect(linkify("bonjour tout le monde")).toEqual([
      { type: "text", text: "bonjour tout le monde" },
    ]);
  });

  it("détecte une URL https simple entourée de texte", () => {
    expect(linkify("va voir https://baobab.app ici")).toEqual([
      { type: "text", text: "va voir " },
      { type: "link", href: "https://baobab.app", text: "https://baobab.app" },
      { type: "text", text: " ici" },
    ]);
  });

  it("détecte http:// aussi bien que https://", () => {
    const segs = linkify("http://exemple.com");
    expect(segs).toEqual([{ type: "link", href: "http://exemple.com", text: "http://exemple.com" }]);
  });

  it("ne reconnaît PAS une URL sans protocole (baobab.app, www.x.com)", () => {
    expect(linkify("visite baobab.app maintenant")).toEqual([
      { type: "text", text: "visite baobab.app maintenant" },
    ]);
    expect(linkify("www.exemple.com")).toEqual([{ type: "text", text: "www.exemple.com" }]);
  });

  it("ne reconnaît PAS une adresse e-mail", () => {
    expect(linkify("écris à moi@exemple.com stp")).toEqual([
      { type: "text", text: "écris à moi@exemple.com stp" },
    ]);
  });

  it("neutralise les schémas dangereux (javascript:, data:) — non reconnus comme liens", () => {
    for (const payload of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "  JAVASCRIPT:alert(1)",
    ]) {
      const segs = linkify(payload);
      expect(segs.every((s) => s.type === "text")).toBe(true);
    }
  });

  it("gère plusieurs liens dans le même texte", () => {
    const segs = linkify("un https://a.com deux https://b.com fin");
    expect(segs.filter((s) => s.type === "link").map((s) => s.href)).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("chaîne vide / null / undefined -> tableau vide", () => {
    expect(linkify("")).toEqual([]);
    expect(linkify(null)).toEqual([]);
    expect(linkify(undefined)).toEqual([]);
  });

  it("accepte une valeur non-string sans lever", () => {
    expect(linkify(42)).toEqual([{ type: "text", text: "42" }]);
  });

  it("comportement réel connu : la ponctuation finale est incluse dans l'URL (pas de rognage)", () => {
    // Le module ne retire volontairement pas la ponctuation de fin — documenté
    // ici pour figer le comportement (un rognage casserait les URLs à parenthèses).
    const segs = linkify("regarde https://exemple.com/page.");
    expect(segs.find((s) => s.type === "link").href).toBe("https://exemple.com/page.");
  });

  it("s'arrête au premier espace / guillemet / chevron", () => {
    expect(linkify('lien "https://x.com" cité').find((s) => s.type === "link").href).toBe(
      "https://x.com"
    );
    expect(linkify("<https://y.com>").find((s) => s.type === "link").href).toBe("https://y.com");
  });

  it("appels répétés : pas d'état de lastIndex partagé (regex global)", () => {
    const a = linkify("https://un.com");
    const b = linkify("https://deux.com");
    expect(a[0].href).toBe("https://un.com");
    expect(b[0].href).toBe("https://deux.com");
  });
});
