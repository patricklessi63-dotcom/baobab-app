import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Le fond de la fenêtre Android (visible avant le premier rendu de la WebView
// et dans les surfaces de débordement) doit être celui du thème effectivement
// affiché : --bb-bg de index.html en clair (ivoire) et en sombre (nuit verte).
const root = process.cwd();
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const xml = (dir) => fs.readFileSync(path.join(root, "android/app/src/main/res", dir, "bb_colors.xml"), "utf8");
const win = (text) => text.match(/name="bb_window_background">(#[0-9A-Fa-f]{6})</)[1].toUpperCase();

describe("fond de fenêtre Android aligné sur les jetons Horizon", () => {
  const light = html.match(/--bb-bg: (#[0-9A-Fa-f]{6});/)[1].toUpperCase();
  const darkBlock = html.slice(html.indexOf(':root[data-theme="dark"] {'));
  const dark = darkBlock.match(/--bb-bg: (#[0-9A-Fa-f]{6});/)[1].toUpperCase();

  it("thème clair = --bb-bg clair", () => expect(win(xml("values"))).toBe(light));
  it("thème sombre = --bb-bg sombre", () => expect(win(xml("values-night"))).toBe(dark));
});
