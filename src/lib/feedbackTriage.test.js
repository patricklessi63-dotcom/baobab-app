import { describe, it, expect, afterEach, vi } from "vitest";
import {
  APP_VERSION,
  detectCategories,
  detectPriority,
  detectDevice,
  detectBrowser,
} from "./feedbackTriage.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("APP_VERSION", () => {
  it("provient de package.json", () => {
    expect(APP_VERSION).toBe("1.0.0");
  });
});

describe("detectCategories", () => {
  it("retourne [] pour un texte vide", () => {
    expect(detectCategories("")).toEqual([]);
    expect(detectCategories("   ")).toEqual([]);
  });

  it("retourne ['autre'] quand rien ne matche", () => {
    expect(detectCategories("bonjour tout le monde")).toEqual(["autre"]);
  });

  it("associe un mot-clé à sa catégorie (insensible à la casse)", () => {
    expect(detectCategories("problème de CONNEXION à mon compte")).toContain("connexion");
    expect(detectCategories("le mode sombre s'affiche mal")).toContain("mode_sombre");
  });

  it("peut renvoyer plusieurs catégories pour un même message", () => {
    const cats = detectCategories("impossible d'envoyer une photo dans la messagerie");
    expect(cats).toContain("messagerie");
    expect(cats).toContain("photo_video");
  });
});

describe("detectPriority", () => {
  it("critique sur un marqueur critique", () => {
    expect(detectPriority("impossible de me connecter depuis ce matin")).toBe("critique");
    expect(detectPriority("je pense qu'il y a une faille de sécurité")).toBe("critique");
  });

  it("élevée sur un marqueur élevé", () => {
    expect(detectPriority("l'appli plante quand j'ouvre la messagerie")).toBe("elevee");
  });

  it("moyenne sur un marqueur moyen", () => {
    expect(detectPriority("l'affichage est bizarre sur mobile")).toBe("moyenne");
  });

  it("moyenne par défaut si le texte est non vide sans marqueur", () => {
    expect(detectPriority("petite suggestion de couleur")).toBe("moyenne");
  });

  it("faible si le texte est vide", () => {
    expect(detectPriority("")).toBe("faible");
    expect(detectPriority("   ")).toBe("faible");
  });
});

describe("detectDevice / detectBrowser", () => {
  it("retourne 'inconnu' sans navigator", () => {
    vi.stubGlobal("navigator", undefined);
    expect(detectDevice()).toBe("inconnu");
    expect(detectBrowser()).toBe("inconnu");
  });

  it("identifie l'appareil à partir du user agent", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" });
    expect(detectDevice()).toBe("iOS");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Linux; Android 14)" });
    expect(detectDevice()).toBe("Android");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" });
    expect(detectDevice()).toBe("Windows");
  });

  it("identifie le navigateur, en distinguant Edge et Chrome", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 ... Chrome/120 Safari/537.36 Edg/120" });
    expect(detectBrowser()).toBe("Edge");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 ... Chrome/120 Safari/537.36" });
    expect(detectBrowser()).toBe("Chrome");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh) ... Version/17 Safari/605" });
    expect(detectBrowser()).toBe("Safari");
  });
});
