import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadHorizonFonts, HORIZON_FONTS_ID, HORIZON_FONTS_URL } from "./loadHorizonFonts";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

describe("jetons Horizon", () => {
  const css = read("src/styles/horizon-tokens.css");
  const tailwind = read("src/tailwind.css");

  it("définit la palette et les polices sous le préfixe --hz-* sans toucher aux --bb-*", () => {
    for (const v of ["--hz-nuit: #060b09", "--hz-canopee: #0f2b21", "--hz-seve: #1f7a5a", "--hz-braise: #f2a33a", "--hz-corail: #ea5f4b", "--hz-signal: #62f0ba", "--hz-ivoire: #f3eee4"]) {
      expect(css).toContain(v);
    }
    expect(css).toMatch(/--hz-font-display:\s*"Syne"/);
    expect(css).toMatch(/--hz-font-body:\s*"Manrope"/);
    expect(css).toMatch(/--hz-font-mono:\s*"IBM Plex Mono"/);
    expect(css).not.toMatch(/--bb-[a-z-]+\s*:/);
  });

  it("n'impose aucune police au reste de l'app : seulement des classes .hz-*", () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\{)/g).map((s) => s.trim());
    for (const sel of rules) expect(sel === ":root" || sel.startsWith(".hz-")).toBe(true);
  });

  it("est importé par tailwind.css", () => {
    expect(tailwind).toContain('@import "./styles/horizon-tokens.css"');
  });
});

describe("chargement des polices", () => {
  afterEach(() => document.getElementById(HORIZON_FONTS_ID)?.remove());

  it("est autorisé par la CSP de vercel.json (style-src et font-src), sans script inline ajouté", () => {
    const csp = JSON.parse(read("vercel.json")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    const directive = (name) => csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " "));
    expect(directive("style-src")).toContain(new URL(HORIZON_FONTS_URL).origin);
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    // Les empreintes de scripts inline épinglées par la CSP restent valables : index.html n'a pas gagné de script inline.
    const inline = (read("index.html").match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length;
    expect(inline).toBe(2);
  });

  it("demande display=swap et seulement les graisses utilisées", () => {
    const u = new URL(HORIZON_FONTS_URL);
    expect(u.searchParams.get("display")).toBe("swap");
    const families = u.searchParams.getAll("family");
    expect(families).toEqual(["Syne:wght@700;800", "IBM Plex Mono:wght@400;500"]);
  });

  it("injecte une seule balise <link>, même appelé plusieurs fois", () => {
    loadHorizonFonts();
    loadHorizonFonts();
    const links = document.querySelectorAll("#" + HORIZON_FONTS_ID);
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("rel")).toBe("stylesheet");
    expect(links[0].getAttribute("href")).toBe(HORIZON_FONTS_URL);
  });
});
