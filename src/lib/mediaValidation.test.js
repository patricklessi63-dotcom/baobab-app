import { describe, it, expect } from "vitest";
import { validateMediaFile, detectKindFromMime } from "./mediaValidation.js";
import { MEDIA_LIMITS } from "./mediaConstants.js";

// Faux fichier : le module ne lit que .type, .size et .slice(0,12).arrayBuffer().
function fakeFile({ type, size, head = [] }) {
  const buf = new Uint8Array(12);
  head.forEach((b, i) => {
    buf[i] = b;
  });
  return {
    type,
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
