import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f) => readFileSync(join(process.cwd(), f), "utf8");

// Chaque page publique déclarée dans App.jsx doit être dans le sitemap (même
// domaine que src/config/publicOrigin.json) et couverte par la réécriture SPA de
// vercel.json (sinon un accès direct à l'URL renverrait un 404).
describe("pages publiques : routes, sitemap, réécriture Vercel", () => {
  const routes = ["/a-propos", "/confidentialite", "/conditions", "/suppression-compte"];
  const sitemap = read("public/sitemap.xml");
  const origin = JSON.parse(read("src/config/publicOrigin.json")).origin;
  const app = read("src/App.jsx");

  it.each(routes)("%s est dans le sitemap et dans App.jsx", (route) => {
    expect(sitemap).toContain(`<loc>${origin}${route}</loc>`);
    expect(app).toContain(`"${route}"`);
  });

  it("vercel.json réécrit toutes les routes vers index.html", () => {
    const vercel = JSON.parse(read("vercel.json"));
    expect(vercel.rewrites).toContainEqual({ source: "/(.*)", destination: "/index.html" });
  });
});
