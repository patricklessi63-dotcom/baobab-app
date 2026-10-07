import { describe, it, expect } from "vitest";
import { storagePathFromUrl, uniqueStoragePaths } from "./storagePaths";

const BASE = "https://proj.supabase.co/storage/v1/object/sign/community-media";

describe("storagePathFromUrl", () => {
  it("extrait le chemin d'une URL signée en retirant le jeton", () => {
    expect(storagePathFromUrl(`${BASE}/c1/170000-ab.jpg?token=abc.def`, "community-media")).toBe("c1/170000-ab.jpg");
  });

  it("décode les caractères encodés", () => {
    expect(storagePathFromUrl(`${BASE}/c1/photo%20t%C3%A9.png?token=x`, "community-media")).toBe("c1/photo té.png");
  });

  it("renvoie null pour un autre bucket, une URL vide ou invalide", () => {
    expect(storagePathFromUrl("https://x/storage/v1/object/sign/avatars/u/a.jpg?token=x", "community-media")).toBeNull();
    for (const bad of [null, undefined, "", 42, {}]) expect(storagePathFromUrl(bad, "community-media")).toBeNull();
    expect(storagePathFromUrl(`${BASE}/`, "community-media")).toBeNull();
  });

  it("refuse tout chemin qui sortirait du dossier ou un encodage cassé", () => {
    expect(storagePathFromUrl(`${BASE}/../avatars/u/a.jpg`, "community-media")).toBeNull();
    expect(storagePathFromUrl(`${BASE}/c1/%2E%2E/x.jpg`, "community-media")).toBeNull();
    expect(storagePathFromUrl(`${BASE}//c1/x.jpg`, "community-media")).toBeNull();
    expect(storagePathFromUrl(`${BASE}/c1/%E0%A4%A.jpg`, "community-media")).toBeNull();
  });
});

describe("uniqueStoragePaths", () => {
  it("dédoublonne et ignore les lignes sans média valide", () => {
    const rows = [
      { media_url: `${BASE}/c1/a.jpg?token=1` },
      { media_url: `${BASE}/c1/a.jpg?token=2` },
      { media_url: null },
      { media_url: "https://ailleurs.test/x.jpg" },
      { media_url: `${BASE}/c2/b.mp4?token=3` },
    ];
    expect(uniqueStoragePaths(rows, "community-media")).toEqual(["c1/a.jpg", "c2/b.mp4"]);
    expect(uniqueStoragePaths(null, "community-media")).toEqual([]);
  });
});

import { chunkList, listAllFileNames } from "./storagePaths";

describe("chunkList", () => {
  it("découpe en lots", () => {
    expect(chunkList([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkList([], 2)).toEqual([]);
  });
});

describe("listAllFileNames", () => {
  const makeList = (total: number) => {
    const calls: Array<{ prefix: string; limit: number; offset: number }> = [];
    const list = async (prefix: string, { limit, offset }: { limit: number; offset: number }) => {
      calls.push({ prefix, limit, offset });
      const names = Array.from({ length: total }, (_, i) => ({ name: `f${i}.jpg` }));
      return { data: names.slice(offset, offset + limit), error: null };
    };
    return { list, calls };
  };

  it("lit toutes les pages : 250 fichiers = 3 appels (et pas seulement les 100 premiers)", async () => {
    const { list, calls } = makeList(250);
    const names = await listAllFileNames(list, "user-1");
    expect(names).toHaveLength(250);
    expect(names[249]).toBe("f249.jpg");
    expect(calls.map((c) => c.offset)).toEqual([0, 100, 200]);
  });

  it("dossier vide ou exactement une page pleine : s'arrête correctement", async () => {
    expect(await listAllFileNames(makeList(0).list, "u")).toEqual([]);
    const full = makeList(100);
    expect(await listAllFileNames(full.list, "u")).toHaveLength(100);
    expect(full.calls).toHaveLength(2); // 100 reçus = page pleine -> une page vide confirme la fin
  });

  it("remonte une erreur de listage au lieu de renvoyer un résultat partiel", async () => {
    const list = async () => ({ data: null, error: new Error("boom") });
    await expect(listAllFileNames(list, "u")).rejects.toThrow("boom");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("process-scheduled-deletions : branchement (lecture du source, Deno non disponible sous Vitest)", () => {
  const src = readFileSync(join(process.cwd(), "supabase/functions/process-scheduled-deletions/index.ts"), "utf8");

  it("efface aussi les médias de publications de communauté, avant la suppression du compte", () => {
    expect(src).toContain('uniqueStoragePaths(communityPostRows, "community-media")');
    expect(src.indexOf("uniqueStoragePaths(communityPostRows")).toBeLessThan(src.indexOf("admin.auth.admin.deleteUser"));
  });

  it("liste les dossiers avec pagination et ne bloque jamais la suppression sur une erreur Storage", () => {
    expect(src).toContain("listAllSafe(\"avatars\"");
    expect(src).toContain("listAllSafe(\"post-media\"");
    expect(src).not.toMatch(/\.list\(userId\)/);
    // removeInChunks journalise (console.error) au lieu de lever.
    const fn = src.slice(src.indexOf("async function removeInChunks"), src.indexOf("async function listAllSafe"));
    expect(fn).not.toContain("throw");
  });
});
