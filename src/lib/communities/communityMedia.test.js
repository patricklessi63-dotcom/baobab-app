// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { communityMediaPath, resignCommunityPosts, COMMUNITY_MEDIA_URL_TTL } from "./communityMedia";

const BASE = "https://p.supabase.co/storage/v1/object/sign/community-media";
const signedOld = (p) => `${BASE}/${p}?token=vieux-5-ans`;

function client({ data, error, throws } = {}) {
  const createSignedUrls = vi.fn(async (paths, ttl) => {
    if (throws) throw new Error("réseau");
    return { data: data ? data(paths, ttl) : paths.map((path) => ({ path, signedUrl: `${BASE}/${path}?token=frais-${ttl}`, error: null })), error: error || null };
  });
  return { storage: { from: vi.fn(() => ({ createSignedUrls })) }, createSignedUrls };
}

describe("communityMediaPath", () => {
  it("extrait le chemin d'une URL signée ou publique, sans jeton", () => {
    expect(communityMediaPath(signedOld("c1/a%20b.jpg"))).toBe("c1/a b.jpg");
  });
  it("refuse les entrées invalides ou les tentatives de sortie de dossier", () => {
    for (const bad of [null, "", 42, "https://ailleurs.test/x.jpg", `${BASE}/../x.jpg`, `${BASE}//x.jpg`, `${BASE}/%E0%A4%A`]) {
      expect(communityMediaPath(bad)).toBeNull();
    }
  });
});

describe("resignCommunityPosts", () => {
  it("remplace le lien de 5 ans par un lien frais de 24 h (un seul appel, chemins dédoublonnés)", async () => {
    const c = client();
    const posts = [
      { id: 1, media_url: signedOld("c1/a.jpg") },
      { id: 2, media_url: null },
      { id: 3, media_url: signedOld("c1/a.jpg") },
    ];
    const out = await resignCommunityPosts(c, posts);
    expect(COMMUNITY_MEDIA_URL_TTL).toBe(86400);
    expect(c.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(c.createSignedUrls).toHaveBeenCalledWith(["c1/a.jpg"], 86400);
    expect(out[0].media_url).toContain("token=frais-86400");
    expect(out[0].media_url).not.toContain("vieux");
    expect(out[1]).toBe(posts[1]);
    expect(out[2].media_url).toContain("token=frais-86400");
    expect(posts[0].media_url).toContain("vieux"); // pas de mutation de l'entrée
  });

  it("aucun média : aucun appel Storage", async () => {
    const c = client();
    expect(await resignCommunityPosts(c, [{ id: 1, media_url: null }])).toHaveLength(1);
    expect(c.createSignedUrls).not.toHaveBeenCalled();
  });

  it("un fichier refusé par la policy garde son URL d'origine, les autres sont re-signés", async () => {
    const c = client({ data: (paths) => paths.map((path) => (path === "c2/b.jpg" ? { path, signedUrl: null, error: "Either the object does not exist or you do not have access to it" } : { path, signedUrl: `${BASE}/${path}?token=frais`, error: null })) });
    const out = await resignCommunityPosts(c, [{ id: 1, media_url: signedOld("c1/a.jpg") }, { id: 2, media_url: signedOld("c2/b.jpg") }]);
    expect(out[0].media_url).toContain("token=frais");
    expect(out[1].media_url).toContain("vieux");
  });

  it("erreur ou exception de Storage : la liste est rendue telle quelle, sans lever", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const posts = [{ id: 1, media_url: signedOld("c1/a.jpg") }];
    expect(await resignCommunityPosts(client({ error: { message: "boom" } }), posts)).toEqual(posts);
    expect(await resignCommunityPosts(client({ throws: true }), posts)).toEqual(posts);
    warn.mockRestore();
  });

  it("plus de 100 médias : lots de 100", async () => {
    const c = client();
    const posts = Array.from({ length: 205 }, (_, i) => ({ id: i, media_url: signedOld(`c1/${i}.jpg`) }));
    const out = await resignCommunityPosts(c, posts);
    expect(c.createSignedUrls.mock.calls.map((call) => call[0].length)).toEqual([100, 100, 5]);
    expect(out.every((p) => p.media_url.includes("frais"))).toBe(true);
  });
});
