import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { compressImageIfNeeded } from "./imageCompression.js";

// Environnement `node` (fichier *.test.js) : ni jsdom ni canvas réel. On
// mocke donc createImageBitmap + document.createElement("canvas"). `File` et
// `Blob` sont des globales natives sous Node 22, on s'en sert telles quelles.

// Faux fichier minimal : le module ne lit que .type, .size et .name.
function fakeImageFile({ type = "image/png", size = 800_000, name = "photo.png" } = {}) {
  return { type, size, name };
}

// Fabrique un faux canvas qui enregistre les dimensions demandées et rend un
// Blob JPEG dont la taille est contrôlée par le test.
function installCanvasMock({ blobSize = 1000, blobNull = false } = {}) {
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      fillStyle: "",
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    })),
    toBlob: vi.fn((cb) => {
      cb(blobNull ? null : new Blob([new Uint8Array(blobSize)], { type: "image/jpeg" }));
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
  it("laisse le fichier intact quand l'image est sous la limite", async () => {
    installBitmapMock({ width: 1200, height: 900 });
    installCanvasMock();
    const file = fakeImageFile();
    const result = await compressImageIfNeeded(file);
    expect(result).toBe(file);
    expect(document.createElement).not.toHaveBeenCalled();
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
