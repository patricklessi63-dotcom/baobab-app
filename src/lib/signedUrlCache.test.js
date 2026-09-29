import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock du client Supabase : on capture les appels à createSignedUrl pour
// vérifier combien d'allers-retours réseau partent réellement.
const { createSignedUrlMock } = vi.hoisted(() => ({
  createSignedUrlMock: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: createSignedUrlMock,
        createSignedUrls: vi.fn(async () => ({ data: [], error: null })),
      })),
    },
  },
}));

import { getSignedUrl } from "./signedUrlCache.js";

beforeEach(() => {
  createSignedUrlMock.mockReset();
});

describe("getSignedUrl — déduplication des requêtes en vol", () => {
  it("deux appels concurrents pour le même path ne déclenchent qu'un seul appel réseau", async () => {
    let resolveNetwork;
    createSignedUrlMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        })
    );

    const path = `conv1/${Date.now()}-a.jpg`;
    const p1 = getSignedUrl(path);
    const p2 = getSignedUrl(path);

    // Les deux appelants doivent partager la même requête en vol : un seul
    // appel à createSignedUrl doit être parti vers Supabase, même si le
    // cache local était vide pour les deux (ex. scroll rapide qui démonte
    // puis remonte la bulle média avant la fin du premier aller-retour).
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);

    resolveNetwork({ data: { signedUrl: "https://example.test/signed-a" }, error: null });

    const [url1, url2] = await Promise.all([p1, p2]);
    expect(url1).toBe("https://example.test/signed-a");
    expect(url2).toBe("https://example.test/signed-a");
  });

  it("un appel après résolution de l'appel en vol relance bien une requête si le cache a expiré entre-temps", async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: { signedUrl: "https://example.test/signed-b" },
      error: null,
    });

    const path = `conv1/${Date.now()}-b.jpg`;
    const url = await getSignedUrl(path);
    expect(url).toBe("https://example.test/signed-b");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);

    // Deuxième appel immédiat : servi depuis le cache, pas de nouvel appel réseau.
    const cachedUrl = await getSignedUrl(path);
    expect(cachedUrl).toBe("https://example.test/signed-b");
    expect(createSignedUrlMock).toHaveBeenCalledTimes(1);
  });
});
