import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const plat = vi.hoisted(() => ({ native: true, platform: "android" }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => plat.platform }));

const plugin = vi.hoisted(() => ({
  loaded: 0,
  checkPermissions: vi.fn(),
  takePhoto: vi.fn(),
  chooseFromGallery: vi.fn(),
}));
// La fabrique ne s'exécute qu'au premier import() du plugin : plugin.loaded > 0 = plugin chargé.
vi.mock("@capacitor/camera", () => {
  plugin.loaded += 1;
  return { Camera: plugin };
});

import {
  takePhoto, pickPhotos, checkCameraPermission, webPathToFile, fileListEvent, mapCameraError, cameraSettingsPath, CAMERA_MESSAGES,
} from "./nativeCamera";
import { prepareImageSelection } from "./prepareImageSelection";
import { compressImageIfNeeded } from "./imageCompression";

// JPEG minimal avec bloc EXIF contenant une latitude GPS (motif 0x5A reconnaissable) — même fabrique
// que imageCompression.test.js.
function jpegWithGpsBytes() {
  const tiff = new Uint8Array(92);
  const dv = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]); dv.setUint32(4, 8, true);
  dv.setUint16(8, 2, true);
  dv.setUint16(10, 0x0112, true); dv.setUint16(12, 3, true); dv.setUint32(14, 1, true); dv.setUint16(18, 6, true);
  dv.setUint16(22, 0x8825, true); dv.setUint16(24, 4, true); dv.setUint32(26, 1, true); dv.setUint32(30, 38, true);
  dv.setUint32(34, 0, true);
  dv.setUint16(38, 2, true);
  dv.setUint16(40, 1, true); dv.setUint16(42, 2, true); dv.setUint32(44, 2, true); tiff[48] = 0x4e;
  dv.setUint16(52, 2, true); dv.setUint16(54, 5, true); dv.setUint32(56, 3, true); dv.setUint32(60, 68, true);
  dv.setUint32(64, 0, true);
  tiff.fill(0x5a, 68, 92);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const segLen = exif.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, segLen >> 8, segLen & 255, ...exif, 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
}
const bytesOf = async (f) => new Uint8Array(await f.arrayBuffer());

function mockFetchOk(bytes = jpegWithGpsBytes(), type = "image/jpeg") {
  globalThis.fetch = vi.fn(async () => ({ ok: true, blob: async () => new Blob([bytes], { type }) }));
}

beforeEach(() => {
  plat.native = true; plat.platform = "android";
  plugin.checkPermissions.mockReset();
  plugin.takePhoto.mockReset();
  plugin.chooseFromGallery.mockReset();
  mockFetchOk();
});
afterEach(() => {
  delete globalThis.createImageBitmap;
  delete globalThis.document;
  delete globalThis.FileReader;
});

describe("web : aucun plugin chargé, rien ne s'exécute", () => {
  it("takePhoto / pickPhotos / checkCameraPermission : UNSUPPORTED ou null, plugin jamais importé", async () => {
    plat.native = false; plat.platform = "web";
    expect(await takePhoto()).toEqual({ ok: false, code: "UNSUPPORTED" });
    expect(await pickPhotos({ multiple: true, limit: 3 })).toEqual({ ok: false, code: "UNSUPPORTED" });
    expect(await checkCameraPermission()).toBeNull();
    expect(plugin.loaded).toBe(0);
    expect(plugin.takePhoto).not.toHaveBeenCalled();
  });
});

describe("takePhoto (natif)", () => {
  it("renvoie un File avec le bon type et un nom propre ; n'écrit pas dans la galerie et ne demande aucune métadonnée", async () => {
    plugin.takePhoto.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/cache/IMG_20261006_142501.jpg" });
    const r = await takePhoto();
    expect(r.ok).toBe(true);
    expect(r.file).toBeInstanceOf(File);
    expect(r.file.type).toBe("image/jpeg");
    expect(r.file.name).toMatch(/^photo-\d+\.jpg$/); // jamais le nom d'origine (date/heure de prise de vue)
    const opts = plugin.takePhoto.mock.calls[0][0];
    expect(opts.saveToGallery).toBe(false);
    expect(opts.includeMetadata).toBe(false);
    expect(opts.editable).toBe("no");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://localhost/_capacitor_file_/cache/IMG_20261006_142501.jpg");
  });

  it("annulation (code structuré ou message) : PAS une erreur, aucun message", async () => {
    plugin.takePhoto.mockRejectedValue({ code: "OS-PLUG-CAMR-0006", message: "Couldn't take photo because the process was canceled." });
    expect(await takePhoto()).toEqual({ ok: false, code: "CANCELLED" });
    plugin.takePhoto.mockRejectedValue(new Error("User cancelled photos app"));
    expect(await takePhoto()).toEqual({ ok: false, code: "CANCELLED" });
  });

  it("permission refusée : message honnête avec le chemin des réglages (Android)", async () => {
    plugin.takePhoto.mockRejectedValue({ code: "OS-PLUG-CAMR-0003", message: "Couldn't access camera." });
    const r = await takePhoto();
    expect(r.code).toBe("PERMISSION_DENIED");
    expect(r.message).toContain("Réglages, Applications, Baobab, Autorisations, Appareil photo");
  });

  it("permission refusée : chemin iOS", async () => {
    plat.platform = "ios";
    plugin.takePhoto.mockRejectedValue({ code: "OS-PLUG-CAMR-0003" });
    expect((await takePhoto()).message).toContain("Réglages, Baobab, Appareil photo");
    expect(cameraSettingsPath()).toBe("Réglages, Baobab, Appareil photo");
  });

  it("aucun appareil photo : UNAVAILABLE", async () => {
    plugin.takePhoto.mockRejectedValue({ code: "OS-PLUG-CAMR-0007" });
    expect(await takePhoto()).toEqual({ ok: false, code: "UNAVAILABLE", message: CAMERA_MESSAGES.NO_CAMERA });
  });

  it("erreur inconnue : message générique français, jamais le texte technique du plugin", async () => {
    plugin.takePhoto.mockRejectedValue(new Error("java.io.IOException: boom"));
    const r = await takePhoto();
    expect(r).toEqual({ ok: false, code: "ERROR", message: CAMERA_MESSAGES.ERROR });
  });

  it("lecture du fichier impossible (fetch refuse) : ERROR, pas d'exception", async () => {
    plugin.takePhoto.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/x.jpg" });
    globalThis.fetch = vi.fn(async () => ({ ok: false }));
    expect((await takePhoto()).code).toBe("ERROR");
    globalThis.fetch = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    expect((await takePhoto()).code).toBe("ERROR");
  });

  it("résultat sans webPath : ERROR", async () => {
    plugin.takePhoto.mockResolvedValue({});
    expect((await takePhoto()).code).toBe("ERROR");
  });
});

describe("webPathToFile : type et nom corrects", () => {
  it.each([
    ["octet-stream + extension .png", "application/octet-stream", "https://localhost/_capacitor_file_/a.png", "image/png", "png"],
    ["type vide + extension .HEIC", "", "https://localhost/_capacitor_file_/A.HEIC", "image/heic", "heic"],
    ["alias image/jpg", "image/jpg", "https://localhost/_capacitor_file_/a.jpg", "image/jpeg", "jpg"],
    ["rien d'exploitable : JPEG par défaut", "", "https://localhost/_capacitor_file_/photo", "image/jpeg", "jpg"],
    ["extension suivie d'une requête", "", "https://localhost/_capacitor_file_/a.webp?v=3", "image/webp", "webp"],
  ])("%s", async (_l, blobType, path, type, ext) => {
    mockFetchOk(jpegWithGpsBytes(), blobType);
    const f = await webPathToFile(path);
    expect(f.type).toBe(type);
    expect(f.name.endsWith(`.${ext}`)).toBe(true);
  });

  it("noms distincts pour une sélection multiple", async () => {
    const a = await webPathToFile("https://localhost/a.jpg", { index: 0 });
    const b = await webPathToFile("https://localhost/b.jpg", { index: 1 });
    expect(a.name).not.toBe(b.name);
  });
});

describe("pickPhotos (natif)", () => {
  it("multiple + limite : lit les fichiers un à un, respecte la limite, aucune métadonnée demandée", async () => {
    plugin.chooseFromGallery.mockResolvedValue({ results: [1, 2, 3, 4].map((n) => ({ type: 0, webPath: `https://localhost/_capacitor_file_/${n}.jpg` })) });
    let inFlight = 0; let maxInFlight = 0;
    globalThis.fetch = vi.fn(async () => {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight -= 1;
      return { ok: true, blob: async () => new Blob([jpegWithGpsBytes()], { type: "image/jpeg" }) };
    });
    const r = await pickPhotos({ multiple: true, limit: 3 });
    expect(r.ok).toBe(true);
    expect(r.files).toHaveLength(3);
    expect(maxInFlight).toBe(1); // une photo à la fois (mémoire)
    const opts = plugin.chooseFromGallery.mock.calls[0][0];
    expect(opts).toMatchObject({ allowMultipleSelection: true, limit: 3, includeMetadata: false });
  });

  it("une seule photo par défaut", async () => {
    plugin.chooseFromGallery.mockResolvedValue({ results: [{ webPath: "https://localhost/1.jpg" }, { webPath: "https://localhost/2.jpg" }] });
    const r = await pickPhotos();
    expect(r.files).toHaveLength(1);
    expect(plugin.chooseFromGallery.mock.calls[0][0]).toMatchObject({ allowMultipleSelection: false, limit: 1 });
  });

  it("annulation (code, ou liste vide) : CANCELLED sans message", async () => {
    plugin.chooseFromGallery.mockRejectedValue({ code: "OS-PLUG-CAMR-0020" });
    expect(await pickPhotos({ multiple: true, limit: 5 })).toEqual({ ok: false, code: "CANCELLED" });
    plugin.chooseFromGallery.mockResolvedValue({ results: [] });
    expect(await pickPhotos()).toEqual({ ok: false, code: "CANCELLED" });
  });

  it("accès à la galerie refusé : message photos", async () => {
    plugin.chooseFromGallery.mockRejectedValue({ code: "OS-PLUG-CAMR-0005" });
    const r = await pickPhotos();
    expect(r.code).toBe("PERMISSION_DENIED");
    expect(r.message).toMatch(/photos/i);
  });
});

describe("checkCameraPermission", () => {
  it.each([[{ camera: "granted" }, "granted"], [{ camera: "limited" }, "granted"], [{ camera: "denied" }, "denied"], [{ camera: "prompt" }, "prompt"], [{ camera: "prompt-with-rationale" }, "prompt"]])("%j -> %s", async (status, expected) => {
    plugin.checkPermissions.mockResolvedValue(status);
    expect(await checkCameraPermission()).toBe(expected);
  });
  it("plugin en erreur : null (inconnu), jamais d'exception", async () => {
    plugin.checkPermissions.mockRejectedValue(new Error("x"));
    expect(await checkCameraPermission()).toBeNull();
  });
});

describe("fileListEvent / mapCameraError", () => {
  it("fileListEvent reproduit ce que lisent les gestionnaires (target.files, target.value affectable)", () => {
    const f = new File(["x"], "a.jpg", { type: "image/jpeg" });
    const e = fileListEvent([f]);
    expect(Array.from(e.target.files)).toEqual([f]);
    e.target.value = ""; // les gestionnaires existants font e.target.value = ""
    expect(e.target.value).toBe("");
  });
  it("mapCameraError : cas limites", () => {
    expect(mapCameraError(undefined).code).toBe("ERROR");
    expect(mapCameraError({ message: "Permission denied" }).code).toBe("PERMISSION_DENIED");
  });
});

// ---------------------------------------------------------------------------
// VIE PRIVÉE : le fichier du plugin peut contenir l'EXIF/GPS d'origine. Il doit
// ressortir du pipeline existant SANS position GPS, jamais l'original.
// ---------------------------------------------------------------------------
describe("la photo native repasse par le pipeline existant : aucun GPS ne part", () => {
  function installCanvas({ blobSize = 1000 } = {}) {
    const canvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() })),
      toBlob: vi.fn((cb, type) => cb(new Blob([new Uint8Array(blobSize)], { type }))),
    };
    globalThis.document = { createElement: vi.fn(() => canvas) };
    return canvas;
  }
  class FakeFileReader {
    readAsDataURL(file) {
      setTimeout(() => { this.result = `data:${file.type};size=${file.size}`; this.onload?.(); }, 0);
    }
  }

  it("le File brut du plugin CONTIENT bien le GPS (le module ne le nettoie pas : c'est le rôle du pipeline)", async () => {
    plugin.takePhoto.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/a.jpg" });
    const { file } = await takePhoto();
    expect((await bytesOf(file)).includes(0x5a)).toBe(true);
  });

  it("prepareImageSelection (profil) : le fichier retenu est le ré-encodage canvas, sans GPS", async () => {
    plugin.takePhoto.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/a.jpg" });
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
    installCanvas({ blobSize: 50_000 });
    globalThis.FileReader = FakeFileReader;
    const { file } = await takePhoto();
    const errors = [];
    const out = await prepareImageSelection([file], { onError: (m) => errors.push(m) });
    expect(errors).toEqual([]);
    expect(out).toHaveLength(1);
    expect(out[0].file).not.toBe(file);
    expect(out[0].file.size).toBe(50_000);
    expect((await bytesOf(out[0].file)).includes(0x5a)).toBe(false);
  });

  it("prepareImageSelection : décodage impossible -> repli JPEG avec la latitude effacée", async () => {
    plugin.takePhoto.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/a.jpg" });
    globalThis.createImageBitmap = vi.fn(async () => { throw new Error("decode"); });
    installCanvas();
    globalThis.FileReader = FakeFileReader;
    const { file } = await takePhoto();
    const out = await prepareImageSelection([file]);
    expect(out).toHaveLength(1);
    const bytes = await bytesOf(out[0].file);
    expect(bytes.includes(0x5a)).toBe(false);
    expect(bytes.includes(0x4e)).toBe(false);
  });

  it("statuts : compressImageIfNeeded (appelé par addStory à la publication) fait le même nettoyage", async () => {
    plugin.takePhoto.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/a.jpg" });
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 3000, height: 2000, close: vi.fn() }));
    installCanvas({ blobSize: 30_000 });
    const { file } = await takePhoto();
    const out = await compressImageIfNeeded(file, 1280);
    expect(out).not.toBe(file);
    expect((await bytesOf(out)).includes(0x5a)).toBe(false);
  });
});
