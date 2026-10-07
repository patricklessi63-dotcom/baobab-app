import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compressImageIfNeeded, getProcessedImageSize, canDecodeImage } from "./imageCompression.js";

// Environnement `node` (fichier *.test.js) : ni jsdom ni canvas réel. On
// mocke donc createImageBitmap + document.createElement("canvas"). `File` et
// `Blob` sont des globales natives sous Node 22, on s'en sert telles quelles.

// Faux fichier minimal : le module ne lit que .type, .size et .name.
function fakeImageFile({ type = "image/png", size = 800_000, name = "photo.png" } = {}) {
  return { type, size, name };
}

// Fabrique un faux canvas qui enregistre les dimensions demandées et rend un
// Blob JPEG dont la taille est contrôlée par le test.
function installCanvasMock({ blobSize = 1000, blobNull = false, blobType = null } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    })),
    // Comme un vrai navigateur : le blob porte le type demandé (blobType permet
    // de simuler Safari qui répond PNG à une demande WebP).
    toBlob: vi.fn((cb, type) => {
      cb(blobNull ? null : new Blob([new Uint8Array(blobSize)], { type: blobType || type }));
    }),
  };
  globalThis.document = { createElement: vi.fn(() => canvas) };
  return canvas;
}

function installBitmapMock({ width, height, throws = false } = {}) {
  globalThis.createImageBitmap = vi.fn(async () => {
    if (throws) throw new Error("decode failed");
    return { width, height, close: vi.fn() };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.createImageBitmap;
  delete globalThis.document;
});

describe("compressImageIfNeeded", () => {
  it("ne redimensionne pas une image sous la limite (dimensions inchangées)", async () => {
    installBitmapMock({ width: 1200, height: 900 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    const file = fakeImageFile({ type: "image/jpeg", name: "photo.jpg" });
    const result = await compressImageIfNeeded(file);
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(900);
    expect(result.type).toBe("image/jpeg");
  });

  it("redimensionne au plus grand côté = maxDimension par défaut (1920)", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    const file = fakeImageFile({ size: 900_000 });
    const result = await compressImageIfNeeded(file);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1440);
    expect(result).not.toBe(file);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("photo.jpg");
    expect(result.size).toBe(1000);
  });

  it("respecte un maxDimension personnalisé", async () => {
    installBitmapMock({ width: 4000, height: 2000 });
    const canvas = installCanvasMock({ blobSize: 500 });
    const result = await compressImageIfNeeded(fakeImageFile({ size: 400_000 }), 800);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    expect(result.size).toBe(500);
  });

  it("ne touche jamais un GIF", async () => {
    installBitmapMock({ width: 4000, height: 4000 });
    installCanvasMock();
    const file = fakeImageFile({ type: "image/gif", name: "anim.gif" });
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("ne touche pas un fichier non-image", async () => {
    installBitmapMock({ width: 4000, height: 4000 });
    installCanvasMock();
    const file = { type: "video/mp4", size: 5_000_000, name: "clip.mp4" };
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
  });

  it("retombe sur le fichier original si le canvas échoue (toBlob → null)", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobNull: true });
    const file = fakeImageFile({ size: 900_000 });
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
  });

  it("retombe sur le fichier original si createImageBitmap lève une erreur", async () => {
    installBitmapMock({ throws: true });
    installCanvasMock();
    const file = fakeImageFile({ size: 900_000 });
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
  });

  it("garde l'original si la version compressée est plus lourde", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 2_000_000 });
    const file = fakeImageFile({ size: 100_000 });
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
  });
});

// ---------------------------------------------------------------------------
// Audit médias mobiles (6 oct. 2026) : vie privée (EXIF/GPS), orientation,
// HEIC, file.type vide, idempotence.
// ---------------------------------------------------------------------------
describe("compressImageIfNeeded — vie privée, HEIC, types douteux", () => {
  it("ré-encode TOUJOURS un JPEG, même sous la limite : le canvas retire l'EXIF/GPS", async () => {
    installBitmapMock({ width: 800, height: 600 });
    const canvas = installCanvasMock({ blobSize: 50_000 });
    // Original de 60 Ko (avec ses métadonnées GPS) : avant le correctif, une
    // image sous la limite était renvoyée telle quelle, coordonnées du domicile
    // comprises.
    const file = fakeImageFile({ type: "image/jpeg", size: 60_000, name: "IMG_0001.JPG" });
    const result = await compressImageIfNeeded(file);
    expect(result).not.toBe(file);
    expect(canvas.toBlob).toHaveBeenCalledTimes(1);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0001.jpg");
  });

  it("garde le ré-encodage d'un JPEG même s'il est un peu plus lourd (la vie privée prime)", async () => {
    installBitmapMock({ width: 800, height: 600 });
    installCanvasMock({ blobSize: 70_000 });
    const file = fakeImageFile({ type: "image/jpeg", size: 60_000 });
    const result = await compressImageIfNeeded(file);
    expect(result).not.toBe(file);
    expect(result.size).toBe(70_000);
  });

  it("demande l'orientation EXIF au décodage (imageOrientation: from-image)", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock();
    await compressImageIfNeeded(fakeImageFile({ type: "image/jpeg", size: 900_000 }));
    expect(createImageBitmap).toHaveBeenCalledWith(expect.anything(), { imageOrientation: "from-image" });
  });

  it("retente sans options si le navigateur rejette l'objet d'options", async () => {
    let calls = 0;
    globalThis.createImageBitmap = vi.fn(async (_f, opts) => {
      calls += 1;
      if (opts) throw new TypeError("options not supported");
      return { width: 4000, height: 3000, close: vi.fn() };
    });
    installCanvasMock({ blobSize: 1000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/jpeg", size: 900_000 }));
    expect(calls).toBe(2);
    expect(result.size).toBe(1000);
  });

  it("convertit un HEIC en JPEG (.jpg, image/jpeg)", async () => {
    installBitmapMock({ width: 3000, height: 2000 });
    installCanvasMock({ blobSize: 400_000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/heic", size: 1_500_000, name: "IMG_0042.HEIC" }));
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("IMG_0042.jpg");
  });

  it("convertit un HEIC même si le JPEG obtenu est plus lourd (HEIC refusé par le bucket)", async () => {
    installBitmapMock({ width: 1000, height: 800 });
    installCanvasMock({ blobSize: 300_000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/heic", size: 100_000, name: "a.heic" }));
    expect(result.type).toBe("image/jpeg");
  });

  it("reconnaît un fichier à file.type VIDE par son extension (.JPG) et corrige son type", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 1000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "", size: 900_000, name: "photo.JPG" }));
    expect(result.type).toBe("image/jpeg");
  });

  it("repli : un fichier à type vide qui ne se décode pas ressort au moins avec son vrai type", async () => {
    installBitmapMock({ throws: true });
    installCanvasMock();
    const file = new File([new Uint8Array(10)], "photo.png", { type: "" });
    const result = await compressImageIfNeeded(file);
    // Sans l'étiquette corrigée, le bucket recevait application/octet-stream.
    expect(result.type).toBe("image/png");
  });

  it("repli : alias non standard image/jpg corrigé en image/jpeg", async () => {
    installBitmapMock({ throws: true });
    const file = new File([new Uint8Array(10)], "photo.jpg", { type: "image/jpg" });
    expect((await compressImageIfNeeded(file)).type).toBe("image/jpeg");
  });

  it("nom avec espaces, accents, émoji et plusieurs points : base conservée, extension .jpg", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 1000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/png", size: 900_000, name: "mon été 😀.final.PNG" }));
    expect(result.name).toBe("mon été 😀.final.jpg");
  });

  it("nom sans extension : jamais un nom vide ni une fausse extension", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 1000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/jpeg", size: 900_000, name: "photo" }));
    expect(result.name).toBe("photo.jpg");
  });

  it("PNG sous la limite : reste PNG (transparence conservée) quand le ré-encodage ne grossit pas", async () => {
    installBitmapMock({ width: 600, height: 600 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    const ctx = canvas.getContext();
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/png", size: 5000, name: "logo.png" }));
    expect(result.type).toBe("image/png");
    expect(result.name).toBe("logo.png");
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png", expect.any(Number));
  });

  it("PNG sous la limite : garde l'original si le ré-encodage est plus lourd", async () => {
    installBitmapMock({ width: 600, height: 600 });
    installCanvasMock({ blobSize: 9000 });
    const file = fakeImageFile({ type: "image/png", size: 5000 });
    expect(await compressImageIfNeeded(file)).toBe(file);
  });

  it("Safari sans encodeur WebP (renvoie du PNG) : n'étiquette jamais un PNG en webp", async () => {
    installBitmapMock({ width: 600, height: 600 });
    installCanvasMock({ blobSize: 1000, blobType: "image/png" });
    const file = fakeImageFile({ type: "image/webp", size: 5000, name: "a.webp" });
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
  });

  it("ne ré-encode jamais un fichier qu'elle a déjà produit (« Réessayer » un envoi)", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    const first = await compressImageIfNeeded(fakeImageFile({ type: "image/jpeg", size: 900_000 }));
    canvas.toBlob.mockClear();
    createImageBitmap.mockClear();
    const second = await compressImageIfNeeded(first, 1280);
    expect(second).toBe(first);
    expect(createImageBitmap).not.toHaveBeenCalled();
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("expose les dimensions finales d'une image produite (réserve de place avant chargement)", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 1000 });
    const result = await compressImageIfNeeded(fakeImageFile({ type: "image/jpeg", size: 900_000 }), 1600);
    expect(getProcessedImageSize(result)).toEqual({ width: 1600, height: 1200 });
    expect(getProcessedImageSize(fakeImageFile())).toBeNull();
  });

  it("libère le bitmap (close) même quand le dessin échoue", async () => {
    const close = vi.fn();
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 800, height: 600, close }));
    const canvas = installCanvasMock();
    canvas.getContext = vi.fn(() => ({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: () => { throw new Error("canvas too big"); },
    }));
    const file = fakeImageFile({ type: "image/jpeg", size: 50_000 });
    expect(await compressImageIfNeeded(file)).toBe(file);
    expect(close).toHaveBeenCalled();
  });

  it("sans createImageBitmap (Safari < 15) : décode via <img> au lieu d'envoyer l'original", async () => {
    delete globalThis.createImageBitmap;
    installCanvasMock({ blobSize: 1000 });
    const revoke = vi.fn();
    const realURL = globalThis.URL;
    globalThis.URL = { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: revoke };
    globalThis.Image = class {
      set src(_v) {
        this.naturalWidth = 4000;
        this.naturalHeight = 3000;
        setTimeout(() => this.onload?.(), 0);
      }
    };
    try {
      const result = await compressImageIfNeeded(fakeImageFile({ type: "image/jpeg", size: 900_000 }));
      expect(result.size).toBe(1000);
      expect(revoke).toHaveBeenCalledWith("blob:x");
    } finally {
      delete globalThis.Image;
      globalThis.URL = realURL;
    }
  });
});

describe("canDecodeImage", () => {
  it("vrai si décodable, faux sinon, jamais de rejet", async () => {
    installBitmapMock({ width: 10, height: 10 });
    expect(await canDecodeImage({ type: "image/heic" })).toBe(true);
    installBitmapMock({ throws: true });
    expect(await canDecodeImage({ type: "image/heic" })).toBe(false);
  });
});
