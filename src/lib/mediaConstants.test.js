import { describe, it, expect } from "vitest";
import { resolveImageMime, looksLikeImage, isHeicMime, extFromMime, EVENT_COVER_MIMES } from "./mediaConstants.js";
import { MEDIA_LIMITS } from "./mediaConstants.js";

describe("resolveImageMime", () => {
  it("garde un type déclaré valide (normalisé en minuscules)", () => {
    expect(resolveImageMime({ type: "image/PNG", name: "a.png" })).toBe("image/png");
  });

  it("corrige les alias non standard (image/jpg, image/pjpeg, image/x-png)", () => {
    expect(resolveImageMime({ type: "image/jpg", name: "a.jpg" })).toBe("image/jpeg");
    expect(resolveImageMime({ type: "image/pjpeg", name: "a.jpg" })).toBe("image/jpeg");
    expect(resolveImageMime({ type: "image/x-png", name: "a.png" })).toBe("image/png");
  });

  it("déduit le type de l'extension quand file.type est vide (IMG_0001.JPG, .HEIC)", () => {
    expect(resolveImageMime({ type: "", name: "IMG_0001.JPG" })).toBe("image/jpeg");
    expect(resolveImageMime({ type: "", name: "IMG_0002.HEIC" })).toBe("image/heic");
    expect(resolveImageMime({ type: "", name: "scan.heif" })).toBe("image/heif");
    expect(resolveImageMime({ type: "", name: "mon été 😀.final.WebP" })).toBe("image/webp");
  });

  it("traite application/octet-stream comme un type absent", () => {
    expect(resolveImageMime({ type: "application/octet-stream", name: "a.jpeg" })).toBe("image/jpeg");
  });

  it("ne devine rien pour une extension inconnue ou un nom sans point", () => {
    expect(resolveImageMime({ type: "", name: "notes.txt" })).toBe("");
    expect(resolveImageMime({ type: "", name: "photo" })).toBe("");
    expect(resolveImageMime({ type: "", name: "" })).toBe("");
  });

  it("ne réétiquette jamais un type déclaré non image (vidéo, pdf)", () => {
    expect(resolveImageMime({ type: "video/mp4", name: "clip.jpg" })).toBe("video/mp4");
  });
});

describe("looksLikeImage / isHeicMime / extFromMime", () => {
  it("looksLikeImage tolère un type vide si l'extension est une image", () => {
    expect(looksLikeImage({ type: "", name: "a.jpg" })).toBe(true);
    expect(looksLikeImage({ type: "", name: "a.mp4" })).toBe(false);
    expect(looksLikeImage({ type: "video/mp4", name: "a.mp4" })).toBe(false);
  });

  it("isHeicMime", () => {
    expect(isHeicMime("image/heic")).toBe(true);
    expect(isHeicMime("image/heif")).toBe(true);
    expect(isHeicMime("image/jpeg")).toBe(false);
  });

  it("l'extension de chemin Storage dérive du type MIME, jamais du nom du fichier", () => {
    expect(extFromMime("image/jpeg")).toBe("jpg");
    expect(extFromMime("image/png")).toBe("png");
  });
});

describe("EVENT_COVER_MIMES", () => {
  it("est un sous-ensemble strict de l'allowlist image (pas de GIF : bucket event-covers)", () => {
    expect(EVENT_COVER_MIMES).not.toContain("image/gif");
    for (const m of EVENT_COVER_MIMES) expect(MEDIA_LIMITS.image.mimes).toContain(m);
  });
});
