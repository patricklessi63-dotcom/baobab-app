import { describe, it, expect, vi, afterEach } from "vitest";
import { validateMediaFile, detectKindFromMime, detectKindFromFile } from "./mediaValidation.js";
import { MEDIA_LIMITS } from "./mediaConstants.js";

// Faux fichier : le module ne lit que .type, .size et .slice(0,12).arrayBuffer().
function fakeFile({ type, size, head = [], name }) {
  const buf = new Uint8Array(12);
  head.forEach((b, i) => {
    buf[i] = b;
  });
  return {
    type,
    name,
    size: size ?? Math.max(1, head.length),
    slice(start, end) {
      return { arrayBuffer: async () => buf.buffer.slice(start, end) };
    },
  };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const WEBP_HEAD = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

describe("validateMediaFile", () => {
  it("rejette un kind inconnu", async () => {
    expect(await validateMediaFile(fakeFile({ type: "image/png", head: PNG_MAGIC }), "hologramme")).toEqual({
      ok: false,
      error: "Type de média non pris en charge.",
    });
  });

  it("rejette un type MIME hors allowlist du kind", async () => {
    const r = await validateMediaFile(fakeFile({ type: "image/svg+xml", head: [] }), "image");
    expect(r).toEqual({ ok: false, error: "Ce format de fichier n'est pas autorisé." });
  });

  it("rejette un fichier trop volumineux", async () => {
    const r = await validateMediaFile(
      fakeFile({ type: "image/png", size: MEDIA_LIMITS.image.maxBytes + 1, head: PNG_MAGIC }),
      "image",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/trop volumineux/);
  });

  it("rejette un fichier vide (0 octet)", async () => {
    const r = await validateMediaFile(fakeFile({ type: "image/png", size: 0, head: PNG_MAGIC }), "image");
    expect(r).toEqual({ ok: false, error: "Ce fichier est vide." });
  });

  it("rejette un fichier dont la signature binaire contredit le type déclaré", async () => {
    const r = await validateMediaFile(fakeFile({ type: "image/png", size: 5000, head: JPEG_MAGIC }), "image");
    expect(r).toEqual({ ok: false, error: "Le contenu du fichier ne correspond pas à son type déclaré." });
  });

  it("accepte un PNG avec la bonne signature", async () => {
    expect(await validateMediaFile(fakeFile({ type: "image/png", size: 5000, head: PNG_MAGIC }), "image")).toEqual({
      ok: true,
    });
  });

  it("accepte un WEBP (RIFF....WEBP)", async () => {
    expect(await validateMediaFile(fakeFile({ type: "image/webp", size: 5000, head: WEBP_HEAD }), "image")).toEqual({
      ok: true,
    });
  });

  it("ne bloque pas les types sans signature connue (gif, texte) sur le seul critère binaire", async () => {
    expect(await validateMediaFile(fakeFile({ type: "image/gif", size: 5000, head: [0, 0, 0] }), "image")).toEqual({
      ok: true,
    });
    expect(await validateMediaFile(fakeFile({ type: "text/plain", size: 20, head: [0x68, 0x69] }), "file")).toEqual({
      ok: true,
    });
  });

  it("ne bloque pas si la lecture des octets échoue (laisse le serveur trancher)", async () => {
    const bad = {
      type: "image/png",
      size: 5000,
      slice: () => ({ arrayBuffer: async () => { throw new Error("lecture impossible"); } }),
    };
    expect(await validateMediaFile(bad, "image")).toEqual({ ok: true });
  });
});

describe("detectKindFromMime", () => {
  it("classe par préfixe MIME, tout le reste en 'file'", () => {
    expect(detectKindFromMime("image/png")).toBe("image");
    expect(detectKindFromMime("video/mp4")).toBe("video");
    expect(detectKindFromMime("audio/webm")).toBe("audio");
    expect(detectKindFromMime("application/pdf")).toBe("file");
    expect(detectKindFromMime("text/plain")).toBe("file");
  });
});

// ---------------------------------------------------------------------------
// Audit médias mobiles (6 oct. 2026)
// ---------------------------------------------------------------------------
const HEIC_HEAD = [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]; // ....ftypheic

afterEach(() => {
  delete globalThis.createImageBitmap;
});

describe("validateMediaFile — taille : message avec la taille réelle", () => {
  it("affiche la taille réelle du fichier ET la limite en Mo", async () => {
    const r = await validateMediaFile(
      fakeFile({ type: "image/jpeg", size: 12.3 * 1024 * 1024, head: JPEG_MAGIC }),
      "image",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Fichier trop volumineux (12.3 Mo, max 8.0 Mo).");
  });
});

describe("validateMediaFile — photos à file.type vide ou non standard", () => {
  it("accepte un JPEG à type vide reconnu par son extension (IMG_0001.JPG) et sa signature", async () => {
    const r = await validateMediaFile(fakeFile({ type: "", name: "IMG_0001.JPG", size: 5000, head: JPEG_MAGIC }), "image");
    expect(r).toEqual({ ok: true });
  });

  it("accepte l'alias image/jpg", async () => {
    const r = await validateMediaFile(fakeFile({ type: "image/jpg", name: "a.jpg", size: 5000, head: JPEG_MAGIC }), "image");
    expect(r).toEqual({ ok: true });
  });

  it("refuse un type vide dont le contenu contredit l'extension (signature)", async () => {
    const r = await validateMediaFile(fakeFile({ type: "", name: "a.png", size: 5000, head: JPEG_MAGIC }), "image");
    expect(r.ok).toBe(false);
  });

  it("refuse un type vide à extension inconnue", async () => {
    const r = await validateMediaFile(fakeFile({ type: "", name: "notes.txt", size: 5000, head: [] }), "image");
    expect(r).toEqual({ ok: false, error: "Ce format de fichier n'est pas autorisé." });
  });

  it("reste strict pour les vidéos : un type vide n'est jamais déduit du nom", async () => {
    const r = await validateMediaFile(fakeFile({ type: "", name: "clip.mp4", size: 5000, head: [] }), "video");
    expect(r.ok).toBe(false);
  });
});

describe("validateMediaFile — HEIC/HEIF", () => {
  it("accepte un HEIC que ce navigateur sait décoder (il sera converti en JPEG à l'envoi)", async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }));
    const r = await validateMediaFile(fakeFile({ type: "image/heic", name: "a.heic", size: 5000, head: HEIC_HEAD }), "image");
    expect(r).toEqual({ ok: true });
  });

  it("accepte un HEIC à type vide (Android/Windows) reconnu par l'extension", async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }));
    const r = await validateMediaFile(fakeFile({ type: "", name: "IMG_9.HEIC", size: 5000, head: HEIC_HEAD }), "image");
    expect(r).toEqual({ ok: true });
  });

  it("refuse un HEIC illisible avec un message clair (pas « format non autorisé »)", async () => {
    globalThis.createImageBitmap = vi.fn(async () => { throw new Error("decode"); });
    const r = await validateMediaFile(fakeFile({ type: "image/heic", name: "a.heic", size: 5000, head: HEIC_HEAD }), "image");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/HEIC/);
    expect(r.error).toMatch(/JPEG/);
  });

  it("refuse un faux HEIC (signature ftyp absente)", async () => {
    globalThis.createImageBitmap = vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() }));
    const r = await validateMediaFile(fakeFile({ type: "image/heic", name: "a.heic", size: 5000, head: JPEG_MAGIC }), "image");
    expect(r.ok).toBe(false);
  });

  it("HEIC n'est jamais accepté pour un autre kind (vidéo, fichier)", async () => {
    const r = await validateMediaFile(fakeFile({ type: "image/heic", name: "a.heic", size: 5000, head: HEIC_HEAD }), "file");
    expect(r.ok).toBe(false);
  });
});

describe("validateMediaFile — allowlist plus étroite (couverture d'événement, bucket sans GIF)", () => {
  const options = { mimes: ["image/jpeg", "image/png", "image/webp"], formatError: "Pas de GIF ici." };
  it("refuse un GIF avec le message dédié", async () => {
    const gif = fakeFile({ type: "image/gif", name: "a.gif", size: 5000, head: [] });
    expect(await validateMediaFile(gif, "image", options)).toEqual({ ok: false, error: "Pas de GIF ici." });
  });
  it("accepte toujours un JPEG, et le GIF reste valide sans l'option", async () => {
    expect(await validateMediaFile(fakeFile({ type: "image/jpeg", size: 5000, head: JPEG_MAGIC }), "image", options)).toEqual({ ok: true });
    expect(await validateMediaFile(fakeFile({ type: "image/gif", size: 5000, head: [] }), "image")).toEqual({ ok: true });
  });
});

describe("detectKindFromFile", () => {
  it("classe une photo à type vide comme image, via l'extension", () => {
    expect(detectKindFromFile({ type: "", name: "a.jpg" })).toBe("image");
    expect(detectKindFromFile({ type: "video/mp4", name: "a.mp4" })).toBe("video");
    expect(detectKindFromFile({ type: "", name: "doc.bin" })).toBe("file");
    expect(detectKindFromFile({ type: undefined, name: undefined })).toBe("file");
  });
});
