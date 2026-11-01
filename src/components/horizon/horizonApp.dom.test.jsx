import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, act, renderHook, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// L'arbre (canvas + chunk lazy) n'est pas l'objet de ces tests : on vérifie ce
// que la scène lui transmet.
vi.mock("./HorizonTree", () => ({
  default: (props) => <div data-testid="tree" data-reduce={String(props.reduceMotion)} />,
}));

import HorizonStage from "./HorizonStage";
import HorizonLoader from "./HorizonLoader";
import HorizonBrand from "./HorizonBrand";
import HorizonBackdrop from "./HorizonBackdrop";
import { useReduceMotion, REDUCE_MOTION_KEY } from "./useReduceMotion";

const read = (f) => fs.readFileSync(path.resolve(process.cwd(), f), "utf8");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    localStorage.removeItem(REDUCE_MOTION_KEY);
  } catch {
    /* ignoré */
  }
  document.documentElement.removeAttribute("data-motion");
  document.getElementById("hz-fonts")?.remove();
});

describe("index.html — identité Horizon pour toute l'app", () => {
  const html = read("index.html");

  it("chaque script inline est épinglé par son empreinte dans la CSP de vercel.json", () => {
    const csp = JSON.parse(read("vercel.json")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(blocks.length).toBe(2);
    for (const b of blocks) {
      const hash = "sha256-" + crypto.createHash("sha256").update(b, "utf8").digest("base64");
      expect(csp, "empreinte absente de la CSP : " + hash).toContain(hash);
    }
  });

  it("le thème par défaut sans préférence enregistrée est sombre, et « Réduire les animations » est appliqué avant le rendu", () => {
    const themeScript = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((b) => b.includes("bb-theme"));
    expect(themeScript).toContain('else if (t !== "system") document.documentElement.setAttribute("data-theme", "dark")');
    expect(themeScript).toContain('localStorage.getItem("bb-reduce-motion") === "1"');
    expect(themeScript).toContain('setAttribute("data-motion", "reduce")');
  });

  it("le thème sombre porte la palette Horizon (nuit verte, ivoire, signal) et le clair l'ivoire", () => {
    const dark = html.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n    \}/)[1];
    expect(dark).toContain("--bb-bg: #060B09");
    expect(dark).toContain("--bb-text: #F3EEE4");
    expect(dark).toContain("--bb-accent: #62F0BA");
    const rootBlock = html.match(/:root \{([\s\S]*?)\n    \}/)[1];
    expect(rootBlock).toContain("--bb-bg: #F3EEE4");
    expect(rootBlock).toContain("--bb-text: #0F2B21");
  });

  it("charge Syne, Manrope et IBM Plex Mono (plus Fraunces) et autorise leur origine", () => {
    expect(html).toContain("family=Syne:wght@600;700;800");
    expect(html).toContain("family=IBM+Plex+Mono");
    expect(html).not.toContain("Fraunces");
  });
});

describe("HorizonLoader / HorizonBrand / HorizonBackdrop", () => {
  it("le chargeur est un statut accessible avec son étiquette", () => {
    render(<HorizonLoader label="Chargement du fil" />);
    expect(screen.getByRole("status")).toHaveTextContent("Chargement du fil");
  });

  it("la marque affiche BAOBAB et un pictogramme décoratif", () => {
    const { container } = render(<HorizonBrand />);
    expect(container).toHaveTextContent("BAOBAB");
    expect(container.querySelector("svg").getAttribute("aria-hidden")).toBe("true");
  });

  it("le fond animé est décoratif", () => {
    const { container } = render(<HorizonBackdrop />);
    const bg = container.querySelector(".bb-horizon-bg");
    expect(bg).not.toBeNull();
    expect(bg.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("HorizonStage", () => {
  it("affiche l'arbre, les repères, les légendes décoratives et le contenu", () => {
    const { container } = render(
      <HorizonStage hudTop="Mon Baobab" hudBottom="Chaque point est un lien">
        <h2>Bonjour</h2>
      </HorizonStage>
    );
    expect(screen.getByTestId("tree")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bonjour" })).toBeInTheDocument();
    expect(container.querySelectorAll(".hzs-corner").length).toBe(4);
    expect(container.querySelector(".hzs-scan")).not.toBeNull();
    const hud = [...container.querySelectorAll(".hzs-hud")];
    expect(hud.map((h) => h.textContent)).toEqual(["Mon Baobab", "Chaque point est un lien"]);
    expect(hud.every((h) => h.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("transmet « Réduire les animations » à l'arbre", () => {
    localStorage.setItem(REDUCE_MOTION_KEY, "1");
    render(<HorizonStage />);
    expect(screen.getByTestId("tree").getAttribute("data-reduce")).toBe("true");
  });

  it("sans arbre (tree=false), la scène ne monte aucun arbre", () => {
    render(<HorizonStage tree={false} />);
    expect(screen.queryByTestId("tree")).toBeNull();
  });
});

describe("useReduceMotion — préférence valable pour toute l'app", () => {
  it("le basculement pose data-motion sur <html>, persiste, et se retire en le rebasculant", () => {
    const { result } = renderHook(() => useReduceMotion());
    expect(result.current.manual).toBe(false);
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.manual).toBe(true);
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBe("1");

    act(() => result.current.toggle());
    expect(result.current.manual).toBe(false);
    expect(document.documentElement.hasAttribute("data-motion")).toBe(false);
    expect(localStorage.getItem(REDUCE_MOTION_KEY)).toBeNull();
  });

  it("deux composants restent synchronisés (l'interrupteur des Réglages agit sur l'arbre)", () => {
    const a = renderHook(() => useReduceMotion());
    const b = renderHook(() => useReduceMotion());
    act(() => a.result.current.toggle());
    expect(b.result.current.manual).toBe(true);
    expect(b.result.current.reduce).toBe(true);
  });

  it("lit le réglage enregistré au montage", () => {
    localStorage.setItem(REDUCE_MOTION_KEY, "1");
    const { result } = renderHook(() => useReduceMotion());
    expect(result.current.manual).toBe(true);
    expect(document.documentElement.getAttribute("data-motion")).toBe("reduce");
  });

  it("stockage bloqué : le basculement fonctionne quand même pour la visite en cours", () => {
    const { result } = renderHook(() => useReduceMotion());
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("stockage bloqué");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("stockage bloqué");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("stockage bloqué");
    });
    act(() => result.current.toggle());
    expect(result.current.manual).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.manual).toBe(false);
  });
});
