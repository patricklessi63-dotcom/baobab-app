import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import BaobabLogo from "./BaobabLogo.jsx";
import { HORIZON } from "./baobabMark.js";

describe("BaobabLogo (marque Horizon)", () => {
  it("décoratif par défaut : aria-hidden, taille demandée", () => {
    const { container } = render(<BaobabLogo size={40} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.getAttribute("width")).toBe("40");
    expect(svg.getAttribute("viewBox")).toBe("0 0 512 512");
    expect(svg.querySelectorAll("circle,line,path").length).toBeGreaterThan(30);
  });
  it("avec title : role img + nom accessible", () => {
    const { getByRole } = render(<BaobabLogo title="Baobab" />);
    expect(getByRole("img", { name: "Baobab" })).toBeTruthy();
  });
  it("n'emploie que des couleurs Horizon (plus de #1E2A4F ni d'ancien vert)", () => {
    const allowed = new Set(Object.values(HORIZON).map((c) => c.toUpperCase()));
    for (const props of [{}, { palette: "light" }, { variant: "mono", color: HORIZON.ivoire }]) {
      const { container, unmount } = render(<BaobabLogo {...props} />);
      for (const m of container.innerHTML.matchAll(/#[0-9a-fA-F]{6}\b/g)) expect(allowed.has(m[0].toUpperCase()), m[0]).toBe(true);
      unmount();
    }
  });
  it("deux instances n'entrent pas en collision d'identifiants de dégradé", () => {
    const { container } = render(
      <>
        <BaobabLogo />
        <BaobabLogo />
      </>
    );
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });
});
