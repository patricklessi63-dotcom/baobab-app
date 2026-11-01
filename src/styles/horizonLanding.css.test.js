import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/styles/horizon-landing.css"), "utf8");
const body = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("horizon-landing.css : garde-fous de la page d'accueil", () => {
  it("n'affecte que les classes .hz-* (aucun sélecteur global)", () => {
    const selectors = body
      .replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "")
      .match(/[^{}@]+(?=\{)/g)
      .flatMap((s) => s.split(","))
      .map((s) => s.trim())
      .filter((s) => s && !/^(from|to|\d+%)$/.test(s) && !/^media\b/.test(s));
    for (const sel of selectors) expect(sel, sel).toMatch(/\.hz-/);
  });

  it("arrête toutes les animations avec prefers-reduced-motion ET avec l'interrupteur de la page", () => {
    expect(body).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
    expect(body).toMatch(/\.hz-root\[data-motion="reduce"\][^{]*\{[^}]*animation: none !important/);
  });

  it("respecte les zones sûres et les gouttières de 16 px", () => {
    for (const side of ["top", "right", "bottom", "left"]) expect(body).toContain(`env(safe-area-inset-${side}`);
    expect(body).toMatch(/padding-left: max\(16px/);
    expect(body).toMatch(/padding-right: max\(16px/);
  });

  it("garantit des zones tactiles d'au moins 44 px sur les boutons", () => {
    const blocks = (name) => body.match(new RegExp("\\" + name + "\\s*\\{[^}]*\\}", "g")) || [];
    for (const cls of [".hz-switch", ".hz-zone", ".hz-link"]) {
      expect(blocks(cls).join("")).toMatch(/min-height: 44px/);
    }
    expect(blocks(".hz-btn").join("")).toMatch(/min-height: 48px/);
  });

  it("garde un focus visible et ne masque jamais le contenu avant l'animation d'entrée", () => {
    expect(body).toMatch(/\.hz-root :focus-visible \{ outline: 2px solid/);
    // L'entrée part de l'état final (backwards) : sans animation, le texte reste visible.
    expect(body).not.toMatch(/\.hz-rise\s*\{[^}]*opacity:\s*0/);
  });
});
