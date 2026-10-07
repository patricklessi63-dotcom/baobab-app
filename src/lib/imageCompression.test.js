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

// ---------------------------------------------------------------------------
// Audit de régression « médias mobile » (6 oct. 2026) : GPS d'un original
// conservé, repli GPS, images animées.
// ---------------------------------------------------------------------------

// JPEG minimal (SOI, APP1 Exif avec orientation=6 + IFD GPS, SOS) : l'IFD GPS
// porte une latitude (3 rationnels = 24 octets, motif 0x5A reconnaissable).
function jpegWithGps({ name = "IMG_0001.JPG" } = {}) {
  const tiff = new Uint8Array(92);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]); dv.setUint32(4, 8, true);
  dv.setUint16(8, 2, true);
  // IFD0 : Orientation (0x0112) = 6, puis pointeur GPS (0x8825) -> 38.
  dv.setUint16(10, 0x0112, true); dv.setUint16(12, 3, true); dv.setUint32(14, 1, true); dv.setUint16(18, 6, true);
  dv.setUint16(22, 0x8825, true); dv.setUint16(24, 4, true); dv.setUint32(26, 1, true); dv.setUint32(30, 38, true);
  dv.setUint32(34, 0, true);
  // IFD GPS @38 : LatitudeRef 'N' + Latitude (rationnels @68).
  dv.setUint16(38, 2, true);
  dv.setUint16(40, 1, true); dv.setUint16(42, 2, true); dv.setUint32(44, 2, true); tiff[48] = 0x4e;
  dv.setUint16(52, 2, true); dv.setUint16(54, 5, true); dv.setUint32(56, 3, true); dv.setUint32(60, 68, true);
  dv.setUint32(64, 0, true);
  tiff.fill(0x5a, 68, 92);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const segLen = exif.length + 2;
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segLen >> 8, segLen & 255, ...exif, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  return new File([bytes], name, { type: "image/jpeg" });
}

const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());

describe("compressImageIfNeeded — régressions de l'audit médias mobile", () => {
  it("JPEG redimensionné dont le ré-encodé est plus lourd : l'original (et son GPS) ne part JAMAIS", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 200_000 });
    const file = jpegWithGps();
    // Original plus léger (< 200 Ko) : avant le correctif la branche
    // « redimensionné » le conservait tel quel, EXIF compris.
    expect(file.size).toBeLessThan(200_000);
    const result = await compressImageIfNeeded(file, 1280);
    expect(result).not.toBe(file);
    expect(result.size).toBe(200_000);
    expect(result.type).toBe("image/jpeg");
  });

  it("JPEG de repli (décodage impossible) : la position GPS est effacée, l'orientation conservée", async () => {
    installBitmapMock({ throws: true });
    installCanvasMock();
    const file = jpegWithGps();
    expect((await bytesOf(file)).includes(0x5a)).toBe(true);
    const result = await compressImageIfNeeded(file);
    const out = await bytesOf(result);
    expect(out.length).toBe(file.size);
    expect(out.includes(0x5a)).toBe(false); // latitude effacée
    expect(out.includes(0x4e)).toBe(false); // 'N' de LatitudeRef effacé
    // Début du TIFF = 2 (SOI) + 4 (marqueur+longueur APP1) + 6 ("Exif\0\0") = 12.
    // Orientation (0x0112 = 6) intacte : la photo ne se couche pas.
    const dv = new DataView(out.buffer, out.byteOffset);
    expect(dv.getUint16(12 + 10, true)).toBe(0x0112);
    expect(dv.getUint16(12 + 18, true)).toBe(6);
    // Fin du fichier (SOS + données image) inchangée.
    expect(Array.from(out.slice(-9))).toEqual([0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
  });

  it("JPEG de repli quand toBlob renvoie null : GPS effacé aussi", async () => {
    installBitmapMock({ width: 800, height: 600 });
    installCanvasMock({ blobNull: true });
    const result = await compressImageIfNeeded(jpegWithGps());
    expect((await bytesOf(result)).includes(0x5a)).toBe(false);
  });

  it("repli : un JPEG sans EXIF ressort tel quel (même objet)", async () => {
    installBitmapMock({ throws: true });
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])], "a.jpg", { type: "image/jpeg" });
    expect(await compressImageIfNeeded(file)).toBe(file);
  });

  it("repli : un EXIF corrompu (offsets hors segment) ne fait jamais échouer l'envoi", async () => {
    installBitmapMock({ throws: true });
    const bad = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 20, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x49, 0x49, 0x2a, 0, 0xff, 0xff, 0xff, 0x7f, 1, 2])], "a.jpg", { type: "image/jpeg" });
    expect(await compressImageIfNeeded(bad)).toBe(bad);
  });

  it("WebP animé : renvoyé tel quel (le canvas n'en garderait que la première image)", async () => {
    installBitmapMock({ width: 400, height: 400 });
    const canvas = installCanvasMock({ blobSize: 100 });
    const head = new Uint8Array(40);
    head.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x12]); // VP8X, drapeaux 0x12 = alpha + animation
    const file = new File([head], "sticker.webp", { type: "image/webp" });
    expect(await compressImageIfNeeded(file)).toBe(file);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("APNG (chunk acTL avant IDAT) : renvoyé tel quel", async () => {
    installBitmapMock({ width: 400, height: 400 });
    const canvas = installCanvasMock({ blobSize: 100 });
    const chunk = (type, len) => [0, 0, 0, len, ...[...type].map((c) => c.charCodeAt(0)), ...new Array(len + 4).fill(0)];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", 13), ...chunk("acTL", 8), ...chunk("IDAT", 4)]);
    const file = new File([png], "anim.png", { type: "image/png" });
    expect(await compressImageIfNeeded(file)).toBe(file);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("PNG ordinaire (sans acTL) : traité normalement", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    installCanvasMock({ blobSize: 5 });
    const chunk = (type, len) => [0, 0, 0, len, ...[...type].map((c) => c.charCodeAt(0)), ...new Array(len + 4).fill(0)];
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", 13), ...chunk("IDAT", 4)]);
    const result = await compressImageIfNeeded(new File([png], "a.png", { type: "image/png" }));
    expect(result.type).toBe("image/jpeg");
  });

  it("WebP statique avec bloc EXIF (VP8X 0x08) : jamais conservé tel quel même si plus léger", async () => {
    installBitmapMock({ width: 600, height: 600 });
    installCanvasMock({ blobSize: 5000 });
    const head = new Uint8Array(40);
    head.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x08]);
    const file = new File([head], "a.webp", { type: "image/webp" });
    const result = await compressImageIfNeeded(file);
    expect(result).not.toBe(file);
    expect(result.size).toBe(5000);
  });

  it("createImageBitmap défaillant : repli sur <img> avant d'abandonner (au lieu d'envoyer l'original)", async () => {
    installBitmapMock({ throws: true });
    installCanvasMock({ blobSize: 1000 });
    const realURL = globalThis.URL;
    globalThis.URL = { createObjectURL: vi.fn(() => "blob:y"), revokeObjectURL: vi.fn() };
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
    } finally {
      delete globalThis.Image;
      globalThis.URL = realURL;
    }
  });
});

// JPEG minimal : SOI, APP1 Exif (orientation), SOF0 (dimensions brutes), SOS.
function jpegWithOrientation(orientation, width, height) {
  const tiff = new Uint8Array(26);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]); dv.setUint32(4, 8, true);
  dv.setUint16(8, 1, true);
  dv.setUint16(10, 0x0112, true); dv.setUint16(12, 3, true); dv.setUint32(14, 1, true); dv.setUint16(18, orientation, true);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const app1Len = exif.length + 2;
  const sof = [0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, app1Len >> 8, app1Len & 255, ...exif, ...sof, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9]);
  return new File([bytes], "IMG_0002.JPG", { type: "image/jpeg" });
}

describe("compressImageIfNeeded — orientation ignorée par createImageBitmap (Safari)", () => {
  function installImageMock(naturalWidth, naturalHeight) {
    const created = [];
    globalThis.URL = { createObjectURL: vi.fn(() => "blob:o"), revokeObjectURL: vi.fn() };
    globalThis.Image = class {
      constructor() { created.push(this); }
      set src(_v) {
        this.naturalWidth = naturalWidth;
        this.naturalHeight = naturalHeight;
        setTimeout(() => this.onload?.(), 0);
      }
    };
    return created;
  }
  const realURL = globalThis.URL;
  afterEach(() => { delete globalThis.Image; globalThis.URL = realURL; });

  it("portrait iPhone (orientation 6, cadre brut paysage) dont le bitmap n'est PAS pivoté : redécodé via <img> (jamais envoyé couché)", async () => {
    installBitmapMock({ width: 4000, height: 3000 }); // dimensions brutes : orientation ignorée
    const canvas = installCanvasMock({ blobSize: 1000 });
    const images = installImageMock(3000, 4000); // <img> applique l'orientation
    const result = await compressImageIfNeeded(jpegWithOrientation(6, 4000, 3000), 1920);
    expect(images.length).toBe(1);
    expect(canvas.width).toBe(1440);
    expect(canvas.height).toBe(1920);
    expect(getProcessedImageSize(result)).toEqual({ width: 1440, height: 1920 });
  });

  it("navigateur qui applique l'orientation (Chrome) : le bitmap est gardé, <img> jamais utilisé", async () => {
    installBitmapMock({ width: 3000, height: 4000 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    const images = installImageMock(3000, 4000);
    await compressImageIfNeeded(jpegWithOrientation(6, 4000, 3000), 1920);
    expect(images.length).toBe(0);
    expect(canvas.width).toBe(1440);
    expect(canvas.height).toBe(1920);
  });

  it("orientation normale (1) : aucune vérification supplémentaire, bitmap gardé", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    const images = installImageMock(3000, 4000);
    await compressImageIfNeeded(jpegWithOrientation(1, 4000, 3000), 1920);
    expect(images.length).toBe(0);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1440);
  });

  it("si <img> n'applique pas non plus l'orientation, on garde le bitmap (pas de régression)", async () => {
    installBitmapMock({ width: 4000, height: 3000 });
    const canvas = installCanvasMock({ blobSize: 1000 });
    installImageMock(4000, 3000);
    await compressImageIfNeeded(jpegWithOrientation(6, 4000, 3000), 1920);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1440);
  });
});
