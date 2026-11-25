import { describe, it, expect, vi } from "vitest";
import { collectCommunityStoragePaths, communityCoverPath, removeCommunityStorage } from "./communityStorageCleanup";

const PUB = "https://proj.supabase.co/storage/v1/object/public/avatars";

function makeClient({ list = [[]], remove } = {}) {
  const calls = { list: [], remove: [] };
  const client = {
    storage: {
      from: vi.fn((bucket) => ({
        list: vi.fn(async (prefix, opts) => {
          calls.list.push([bucket, prefix, opts]);
          return { data: list[opts.offset / opts.limit] || [], error: null };
        }),
        remove: vi.fn(async (paths) => {
          calls.remove.push([bucket, paths]);
          return remove ? remove(bucket, paths) : { data: paths.map((name) => ({ name })), error: null };
        }),
      })),
    },
  };
  return { client, calls };
}

describe("communityCoverPath", () => {
  it("extrait le chemin d'une couverture de communauté", () => {
    expect(communityCoverPath(`${PUB}/u1/community-1700.jpg`)).toBe("u1/community-1700.jpg");
    expect(communityCoverPath(`${PUB}/u1/community-1700.webp?t=1`)).toBe("u1/community-1700.webp");
  });

  it("ne vise JAMAIS une photo de profil ni un autre fichier du dossier", () => {
    expect(communityCoverPath(`${PUB}/u1/avatar-1700.jpg`)).toBeNull();
    expect(communityCoverPath(`${PUB}/u1/1700.jpg`)).toBeNull();
    expect(communityCoverPath(`${PUB}/u1/sous/community-1.jpg`)).toBeNull();
    expect(communityCoverPath(`${PUB}/community-1.jpg`)).toBeNull();
  });

  it("refuse les entrées invalides et les remontées de dossier", () => {
    for (const bad of [null, undefined, "", 42, "https://x/autre/u1/community-1.jpg"]) expect(communityCoverPath(bad)).toBeNull();
    expect(communityCoverPath(`${PUB}/../u1/community-1.jpg`)).toBeNull();
    expect(communityCoverPath(`${PUB}/u1/community-..%2Fx.jpg`)).toBeNull();
    expect(communityCoverPath(`${PUB}/u1/community-%E0%A4%A.jpg`)).toBeNull();
  });
});

describe("collectCommunityStoragePaths", () => {
  it("liste le dossier de la communauté et ajoute sa couverture", async () => {
    const { client, calls } = makeClient({ list: [[{ id: "a", name: "p.jpg" }, { id: "b", name: "v.mp4" }]] });
    const out = await collectCommunityStoragePaths(client, { id: "c1", cover_url: `${PUB}/u1/community-9.jpg` });
    expect(out).toEqual({ "community-media": ["c1/p.jpg", "c1/v.mp4"], avatars: ["u1/community-9.jpg"] });
    expect(calls.list[0].slice(0, 2)).toEqual(["community-media", "c1"]);
  });

  it("sans couverture ni média : rien à retirer", async () => {
    const { client } = makeClient();
    expect(await collectCommunityStoragePaths(client, { id: "c1", cover_url: null })).toEqual({ "community-media": [], avatars: [] });
  });

  it("lit toutes les pages (plus de 100 médias)", async () => {
    const p1 = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, name: `${i}.jpg` }));
    const { client } = makeClient({ list: [p1, [{ id: "z", name: "z.jpg" }]] });
    const out = await collectCommunityStoragePaths(client, { id: "c1" });
    expect(out["community-media"]).toHaveLength(101);
  });
});

describe("removeCommunityStorage", () => {
  it("retire les médias et la couverture, compte ce qui est réellement effacé", async () => {
    const { client, calls } = makeClient({
      remove: (bucket, paths) => ({ data: paths.filter((p) => !p.includes("autrui")).map((name) => ({ name })), error: null }),
    });
    const n = await removeCommunityStorage(client, { "community-media": ["c1/moi.jpg", "c1/autrui.jpg"], avatars: ["u1/community-9.jpg"] });
    expect(n).toBe(2);
    expect(calls.remove).toEqual([["community-media", ["c1/moi.jpg", "c1/autrui.jpg"]], ["avatars", ["u1/community-9.jpg"]]]);
  });

  it("ignore tout bucket qui ne lui appartient pas", async () => {
    const { client, calls } = makeClient();
    await removeCommunityStorage(client, { "chat-media": ["x/y.jpg"], "community-media": [] });
    expect(calls.remove).toHaveLength(0);
  });
});
