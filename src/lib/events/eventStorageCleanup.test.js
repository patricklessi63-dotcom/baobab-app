import { describe, it, expect, vi } from "vitest";
import { collectEventStoragePaths, listEventFolder, removeEventStorage } from "./eventStorageCleanup";

const file = (name) => ({ id: `id-${name}`, name });

// Faux client Storage : listings par bucket (tableau de pages ou fonction), remove contrôlable.
function makeClient({ lists = {}, remove } = {}) {
  const calls = { list: [], remove: [] };
  const client = {
    storage: {
      from: vi.fn((bucket) => ({
        list: vi.fn(async (prefix, opts) => {
          calls.list.push([bucket, prefix, opts]);
          const src = lists[bucket];
          if (typeof src === "function") return src(prefix, opts);
          const pages = src || [[]];
          return { data: pages[opts.offset / opts.limit] || [], error: null };
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

describe("listEventFolder", () => {
  it("renvoie les chemins complets du dossier de l'événement", async () => {
    const { client, calls } = makeClient({ lists: { "event-media": [[file("a.jpg"), file("b.png")]] } });
    expect(await listEventFolder(client, "event-media", "e1")).toEqual(["e1/a.jpg", "e1/b.png"]);
    expect(calls.list[0]).toEqual(["event-media", "e1", { limit: 100, offset: 0 }]);
  });

  it("lit toutes les pages (plus de 100 fichiers)", async () => {
    const p1 = Array.from({ length: 100 }, (_, i) => file(`p1-${i}.jpg`));
    const p2 = [file("dernier.jpg")];
    const { client, calls } = makeClient({ lists: { "event-media": [p1, p2] } });
    const out = await listEventFolder(client, "event-media", "e1");
    expect(out).toHaveLength(101);
    expect(out.at(-1)).toBe("e1/dernier.jpg");
    expect(calls.list.map((c) => c[2].offset)).toEqual([0, 100]);
  });

  it("s'arrête si le listage renvoie toujours la même page (offset ignoré)", async () => {
    const page = Array.from({ length: 100 }, (_, i) => file(`f${i}.jpg`));
    const { client, calls } = makeClient({ lists: { "event-media": () => ({ data: page, error: null }) } });
    expect(await listEventFolder(client, "event-media", "e1")).toHaveLength(100);
    expect(calls.list).toHaveLength(2);
  });

  it("ignore les sous-dossiers (entrées sans id)", async () => {
    const { client } = makeClient({ lists: { "event-covers": [[{ id: null, name: "sous-dossier" }, file("c.webp")]] } });
    expect(await listEventFolder(client, "event-covers", "e1")).toEqual(["e1/c.webp"]);
  });

  it("refuse un identifiant vide ou qui sortirait du dossier, sans aucun appel", async () => {
    const { client, calls } = makeClient();
    for (const bad of [null, undefined, "", "a/b", ".", "..", 42]) expect(await listEventFolder(client, "event-media", bad)).toEqual([]);
    expect(calls.list).toHaveLength(0);
  });

  it("ne lève jamais : erreur ou exception de listage → ce qui a été lu", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = makeClient({ lists: { "event-media": () => ({ data: null, error: { message: "refusé" } }) } });
    expect(await listEventFolder(a.client, "event-media", "e1")).toEqual([]);
    const b = makeClient({ lists: { "event-media": () => { throw new Error("réseau"); } } });
    expect(await listEventFolder(b.client, "event-media", "e1")).toEqual([]);
    err.mockRestore();
  });
});

describe("collectEventStoragePaths", () => {
  it("liste la couverture et les photos du dossier de l'événement", async () => {
    const { client } = makeClient({
      lists: { "event-covers": [[file("1-cover.jpg")]], "event-media": [[file("p.jpg"), file("q.jpg")]] },
    });
    expect(await collectEventStoragePaths(client, "e1")).toEqual({
      "event-covers": ["e1/1-cover.jpg"],
      "event-media": ["e1/p.jpg", "e1/q.jpg"],
    });
  });
});

describe("removeEventStorage", () => {
  it("retire chaque bucket et compte les fichiers réellement effacés", async () => {
    const { client, calls } = makeClient({
      // Le Storage n'efface que ce que la policy permet : ici seulement la couverture et une photo.
      remove: (bucket, paths) => ({ data: paths.filter((p) => !p.includes("autrui")).map((name) => ({ name })), error: null }),
    });
    const n = await removeEventStorage(client, { "event-covers": ["e1/c.jpg"], "event-media": ["e1/moi.jpg", "e1/autrui.jpg"] });
    expect(n).toBe(2);
    expect(calls.remove).toEqual([["event-covers", ["e1/c.jpg"]], ["event-media", ["e1/moi.jpg", "e1/autrui.jpg"]]]);
  });

  it("envoie par lots de 100", async () => {
    const { client, calls } = makeClient();
    const many = Array.from({ length: 205 }, (_, i) => `e1/${i}.jpg`);
    expect(await removeEventStorage(client, { "event-media": many })).toBe(205);
    expect(calls.remove.map((c) => c[1].length)).toEqual([100, 100, 5]);
  });

  it("aucun appel quand il n'y a rien à retirer", async () => {
    const { client, calls } = makeClient();
    expect(await removeEventStorage(client, { "event-covers": [], "event-media": [] })).toBe(0);
    expect(await removeEventStorage(client, null)).toBe(0);
    expect(calls.remove).toHaveLength(0);
  });

  it("ne lève jamais : une erreur sur un bucket n'empêche pas l'autre", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client, calls } = makeClient({
      remove: (bucket, paths) => {
        if (bucket === "event-covers") throw new Error("réseau");
        return { data: paths.map((name) => ({ name })), error: null };
      },
    });
    expect(await removeEventStorage(client, { "event-covers": ["e1/c.jpg"], "event-media": ["e1/p.jpg"] })).toBe(1);
    expect(calls.remove).toHaveLength(2);
    err.mockRestore();
  });
});
