import { describe, it, expect, vi, beforeEach } from "vitest";

const plat = vi.hoisted(() => ({ native: true }));
vi.mock("./platform", () => ({ isNative: () => plat.native, getPlatform: () => (plat.native ? "android" : "web") }));

const plugin = vi.hoisted(() => ({ loaded: 0, share: vi.fn(), canShare: vi.fn() }));
// La fabrique ne s'exécute qu'au premier import() du plugin : plugin.loaded > 0 = plugin chargé.
vi.mock("@capacitor/share", () => {
  plugin.loaded += 1;
  return { Share: plugin };
});

import { shareNative, publicShareUrl } from "./nativeShare";

beforeEach(() => {
  plat.native = true;
  plugin.share.mockReset().mockResolvedValue({});
  plugin.canShare.mockReset().mockResolvedValue({ value: true });
});

describe("web", () => {
  it("shareNative ne fait rien et ne charge pas le plugin", async () => {
    plat.native = false;
    expect(await shareNative({ text: "x", url: "https://baobab-app-zeta.vercel.app/" })).toEqual({ ok: false, unsupported: true });
    expect(plugin.loaded).toBe(0);
    expect(plugin.share).not.toHaveBeenCalled();
  });
});

describe("shareNative (natif)", () => {
  it("transmet titre, texte, lien public et titre de feuille", async () => {
    const r = await shareNative({ title: "Baobab", text: "Rejoins-moi", url: "https://baobab-app-zeta.vercel.app/", dialogTitle: "Partager" });
    expect(r).toEqual({ ok: true });
    expect(plugin.share).toHaveBeenCalledWith({
      title: "Baobab", text: "Rejoins-moi", dialogTitle: "Partager", url: "https://baobab-app-zeta.vercel.app/",
    });
  });

  it.each([
    ["https://localhost/", "origine de la WebView"],
    ["https://localhost/profile/abc", "origine de la WebView + chemin"],
    ["http://127.0.0.1:5173/", "boucle locale"],
    ["https://app.localhost/", "sous-domaine .localhost"],
    ["capacitor://localhost/", "schéma iOS"],
    ["javascript:alert(1)", "schéma dangereux"],
    ["pas une url", "invalide"],
    ["", "vide"],
  ])("lien jamais local ou invalide (%s : %s) : retiré, le texte part seul", async (url) => {
    await shareNative({ title: "Baobab", text: "Rejoins-moi", url });
    const payload = plugin.share.mock.calls[0][0];
    expect(payload).not.toHaveProperty("url");
    expect(payload.text).toBe("Rejoins-moi");
  });

  it("ne partage jamais de fichiers", async () => {
    await shareNative({ text: "x", files: ["/data/user/0/photo.jpg"] });
    expect(plugin.share.mock.calls[0][0]).not.toHaveProperty("files");
  });

  it("annulation (« Share canceled », Android et iOS) : cancelled, pas une erreur", async () => {
    plugin.share.mockRejectedValue(new Error("Share canceled"));
    expect(await shareNative({ text: "x" })).toEqual({ ok: false, cancelled: true });
  });

  it("feuille déjà ouverte : busy", async () => {
    plugin.share.mockRejectedValue(new Error("Can't share while sharing is in progress"));
    expect(await shareNative({ text: "x" })).toEqual({ ok: false, busy: true });
  });

  it("échec réel : error (l'appelant bascule sur son repli)", async () => {
    plugin.share.mockRejectedValue(new Error("boom"));
    expect(await shareNative({ text: "x" })).toEqual({ ok: false, error: true });
  });

  it("partage indisponible (canShare = false) : unsupported, share() jamais appelé", async () => {
    plugin.canShare.mockResolvedValue({ value: false });
    expect(await shareNative({ text: "x" })).toEqual({ ok: false, unsupported: true });
    expect(plugin.share).not.toHaveBeenCalled();
  });

  it("canShare qui jette : on tente quand même le partage", async () => {
    plugin.canShare.mockRejectedValue(new Error("x"));
    expect((await shareNative({ text: "x" })).ok).toBe(true);
  });
});

describe("publicShareUrl", () => {
  it("garde une URL publique, normalisée", () => {
    expect(publicShareUrl("https://baobab-app-zeta.vercel.app/")).toBe("https://baobab-app-zeta.vercel.app/");
  });
  it("refuse tout le reste", () => {
    expect(publicShareUrl(undefined)).toBeNull();
    expect(publicShareUrl("ftp://x.test/")).toBeNull();
    expect(publicShareUrl("https://mon-pc.local/")).toBeNull();
  });
});
