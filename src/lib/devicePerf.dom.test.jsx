import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isLiteDevice, applyPerformanceHint } from "./devicePerf.js";

afterEach(() => document.documentElement.removeAttribute("data-perf"));

describe("isLiteDevice", () => {
  it("appareil modeste : 4 cœurs ou moins, ou 2 Go ou moins", () => {
    expect(isLiteDevice({ hardwareConcurrency: 4 })).toBe(true);
    expect(isLiteDevice({ hardwareConcurrency: 8, deviceMemory: 2 })).toBe(true);
    expect(isLiteDevice({ hardwareConcurrency: 2, deviceMemory: 8 })).toBe(true);
  });
  it("appareil confortable ou information absente : pas de mode léger", () => {
    expect(isLiteDevice({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(isLiteDevice({})).toBe(false);
    expect(isLiteDevice(null)).toBe(false);
  });
});

describe("applyPerformanceHint", () => {
  it("pose puis retire data-perf sur <html>", () => {
    expect(applyPerformanceHint(document, { hardwareConcurrency: 2 })).toBe(true);
    expect(document.documentElement.getAttribute("data-perf")).toBe("lite");
    expect(applyPerformanceHint(document, { hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(document.documentElement.hasAttribute("data-perf")).toBe(false);
  });
  it("ne plante jamais sans document", () => {
    expect(applyPerformanceHint(null, {})).toBe(false);
  });
});

describe("index.html — mode léger", () => {
  const html = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
  it("fige le fond animé et retire le flou de verre en mode léger", () => {
    expect(html).toContain(':root[data-perf="lite"] .bb-horizon-bg');
    expect(html).toMatch(/:root\[data-perf="lite"\] \.bb-glass[^}]*backdrop-filter: none/);
  });
  it("les halos du fond n'ont plus de filtre de flou (leur dégradé est déjà doux)", () => {
    const block = html.match(/\.bb-horizon-bg::before, \.bb-horizon-bg::after \{([^}]*)\}/)[1];
    expect(block).not.toContain("filter");
  });
});
