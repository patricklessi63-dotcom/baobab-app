import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Audit médias mobiles (6 oct. 2026) : la sélection de photos de profil
// (onboarding / édition) lisait l'ORIGINAL de chaque photo en data URL (4 à
// 8 Mo ×1,33 par photo : 6 à 10 photos = plusieurs dizaines de Mo de chaînes en
// mémoire sur un téléphone d'entrée de gamme) et n'envoyait au Storage une
// version réduite qu'au moment de l'envoi, sans jamais retirer le GPS de
// l'aperçu. prepareImageSelection réduit d'abord, un fichier à la fois, puis
// fabrique l'aperçu à partir du fichier réduit.

const mocks = vi.hoisted(() => ({
  validate: vi.fn(),
  compress: vi.fn(),
  inFlight: 0,
  maxInFlight: 0,
}));

vi.mock("./mediaValidation", () => ({ validateMediaFile: (...a) => mocks.validate(...a) }));
vi.mock("./imageCompression", () => ({ compressImageIfNeeded: (...a) => mocks.compress(...a) }));

import { prepareImageSelection } from "./prepareImageSelection.js";

const realFileReader = globalThis.FileReader;

class FakeFileReader {
  readAsDataURL(file) {
    setTimeout(() => {
      if (file.unreadable) { this.error = new Error("read"); this.onerror?.(); return; }
      this.result = `data:${file.type};name=${file.name}`;
      this.onload?.();
    }, 0);
  }
}

function f(name, extra = {}) {
  return { name, type: "image/jpeg", size: 1000, ...extra };
}

beforeEach(() => {
  mocks.validate.mockReset().mockResolvedValue({ ok: true });
  mocks.inFlight = 0;
  mocks.maxInFlight = 0;
  mocks.compress.mockReset().mockImplementation(async (file) => {
    mocks.inFlight += 1;
    mocks.maxInFlight = Math.max(mocks.maxInFlight, mocks.inFlight);
    await new Promise((r) => setTimeout(r, 2));
    mocks.inFlight -= 1;
    return { ...file, name: file.name.replace(/\.\w+$/, ".jpg"), reduced: true };
  });
  globalThis.FileReader = FakeFileReader;
});

afterEach(() => {
  globalThis.FileReader = realFileReader;
});

describe("prepareImageSelection", () => {
  it("renvoie les fichiers réduits dans l'ordre choisi, avec un aperçu fabriqué depuis le fichier RÉDUIT", async () => {
    const out = await prepareImageSelection([f("a.JPG"), f("b.PNG", { type: "image/png" })]);
    expect(out.map((o) => o.file.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(out.every((o) => o.file.reduced)).toBe(true);
    // aperçu lu sur le fichier réduit (a.jpg), pas sur l'original (a.JPG)
    expect(out[0].preview).toBe("data:image/jpeg;name=a.jpg");
  });

  it("traite les fichiers UN À LA FOIS (jamais plusieurs bitmaps décodés en parallèle)", async () => {
    await prepareImageSelection([f("1.jpg"), f("2.jpg"), f("3.jpg"), f("4.jpg"), f("5.jpg"), f("6.jpg")]);
    expect(mocks.maxInFlight).toBe(1);
  });

  it("passe maxDimension (1280 par défaut) à la compression", async () => {
    await prepareImageSelection([f("a.jpg")]);
    expect(mocks.compress).toHaveBeenCalledWith(expect.anything(), 1280);
    await prepareImageSelection([f("a.jpg")], { maxDimension: 1600 });
    expect(mocks.compress).toHaveBeenLastCalledWith(expect.anything(), 1600);
  });

  it("un fichier refusé ne fait pas perdre les autres ; l'erreur est préfixée du nom quand il y a plusieurs fichiers", async () => {
    mocks.validate
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: "Fichier trop volumineux (12.3 Mo, max 8.0 Mo)." })
      .mockResolvedValueOnce({ ok: true });
    const onError = vi.fn();
    const out = await prepareImageSelection([f("a.jpg"), f("gros.jpg"), f("c.jpg")], { onError });
    expect(out.map((o) => o.file.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("gros.jpg : Fichier trop volumineux (12.3 Mo, max 8.0 Mo).");
    expect(mocks.compress).toHaveBeenCalledTimes(2); // pas de compression d'un fichier refusé
  });

  it("une seule photo choisie : message d'erreur tel quel, sans nom de fichier", async () => {
    mocks.validate.mockResolvedValue({ ok: false, error: "Ce fichier est vide." });
    const onError = vi.fn();
    const out = await prepareImageSelection([f("a.jpg")], { onError });
    expect(out).toEqual([]);
    expect(onError).toHaveBeenCalledWith("Ce fichier est vide.");
  });

  it("un nom très long est abrégé dans le message", async () => {
    mocks.validate.mockResolvedValue({ ok: false, error: "x" });
    const onError = vi.fn();
    await prepareImageSelection([f("n".repeat(100) + ".jpg"), f("b.jpg")], { onError });
    const first = onError.mock.calls[0][0];
    expect(first.length).toBeLessThan(60);
    expect(first).toContain("...");
  });

  it("une photo illisible (FileReader en erreur) est signalée sans rejeter toute la sélection", async () => {
    mocks.compress.mockImplementation(async (file) => ({ ...file, reduced: true, unreadable: file.name === "cassee.jpg" }));
    const onError = vi.fn();
    const out = await prepareImageSelection([f("cassee.jpg"), f("ok.jpg")], { onError });
    expect(out.map((o) => o.file.name)).toEqual(["ok.jpg"]);
    expect(onError).toHaveBeenCalledWith("cassee.jpg : Impossible de lire cette photo.");
  });
});
