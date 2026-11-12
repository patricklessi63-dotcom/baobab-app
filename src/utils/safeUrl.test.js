import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { safeHttpUrl } from "./safeUrl.js";

describe("safeHttpUrl", () => {
  it("accepte http et https, et normalise", () => {
    expect(safeHttpUrl("https://www.canada.ca/fr/immigration")).toBe("https://www.canada.ca/fr/immigration");
    expect(safeHttpUrl("  http://example.com  ")).toBe("http://example.com/");
    expect(safeHttpUrl("HTTPS://Example.com/Path?x=1#a")).toBe("https://example.com/Path?x=1#a");
  });
  it.each([
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)", "file:///etc/passwd", "blob:https://x/y", "ftp://example.com", "mailto:a@b.ca", "tel:+15145550100",
    "//example.com/chemin", "/chemin/relatif", "example.com", "http://", "https://", "",
  ])("refuse « %s »", (bad) => expect(safeHttpUrl(bad)).toBeNull());
  it("refuse une valeur absente, non texte ou démesurée", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
    expect(safeHttpUrl("https://example.com/" + "a".repeat(2100))).toBeNull();
  });
  it("une adresse contenant javascript: plus loin reste une adresse https ordinaire", () => {
    expect(safeHttpUrl("https://example.com/?next=javascript:alert(1)")).toBe("https://example.com/?next=javascript:alert(1)");
  });
});

describe("régression : les adresses venues d'un flux externe passent par safeHttpUrl", () => {
  const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
  it("ImmigrationNewsView ne met jamais item.source_url tel quel dans un href", () => {
    const src = read("src/components/social/ImmigrationNewsView.jsx");
    expect(src.includes("href={item.source_url}")).toBe(false);
    expect(src.includes("safeHttpUrl(item.source_url)")).toBe(true);
  });
  it("la fonction d'import ne garde que des adresses http(s)", () => {
    const fn = read("supabase/functions/fetch-immigration-news/index.ts");
    expect(fn.includes("https?:")).toBe(true);
    expect(fn.includes("r.title && r.source_url);")).toBe(false);
  });
});
