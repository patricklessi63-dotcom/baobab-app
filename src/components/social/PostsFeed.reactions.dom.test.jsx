import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

// Réactions du fil (SQL-32) : faux client dont la table post_likes enregistre les écritures et peut simuler
// « colonne emoji absente » (SQL-32 pas encore exécuté) ou un conflit d'unicité.
function makeFake({ likes = [], missingColumn = false, conflictOnInsert = false } = {}) {
  const db = { likes: likes.map((l) => ({ ...l })), missingColumn, conflictOnInsert, calls: [] };
  const missing = { data: null, error: { code: "PGRST204", message: "Could not find the 'emoji' column of 'post_likes' in the schema cache" } };
  const plain = (rowsFor) => {
    const st = { range: null };
    const b = {};
    ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => { b[m] = vi.fn(() => b); });
    b.range = vi.fn((f, t) => { st.range = [f, t]; return b; });
    b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    b.then = (res, rej) => { const all = rowsFor(); return Promise.resolve({ data: st.range ? all.slice(st.range[0], st.range[1] + 1) : all, error: null }).then(res, rej); };
    return b;
  };
  const likesBuilder = () => {
    const op = { kind: "select", cols: "", payload: null, filters: {}, range: null };
    const b = {};
    b.select = vi.fn((cols) => { op.cols = cols || ""; return b; });
    b.insert = vi.fn((p) => { op.kind = "insert"; op.payload = p; return b; });
    b.update = vi.fn((p) => { op.kind = "update"; op.payload = p; return b; });
    b.delete = vi.fn(() => { op.kind = "delete"; return b; });
    b.eq = vi.fn((k, v) => { op.filters[k] = v; return b; });
    ["in", "order", "neq", "limit"].forEach((m) => { b[m] = vi.fn(() => b); });
    b.range = vi.fn((f, t) => { op.range = [f, t]; return b; });
    b.then = (res, rej) => {
      let out;
      if (op.kind === "select") {
        if (op.cols.includes("emoji") && db.missingColumn) out = missing;
        else {
          const rows = db.likes.map((l) => (op.cols.includes("emoji") ? l : { post_id: l.post_id, profile_id: l.profile_id }));
          out = { data: op.range ? rows.slice(op.range[0], op.range[1] + 1) : rows, error: null };
        }
      } else if (op.kind === "insert") {
        db.calls.push(["insert", op.payload]);
        if ("emoji" in op.payload && db.missingColumn) out = missing;
        else if (db.conflictOnInsert) out = { data: null, error: { code: "23505", message: "duplicate key" } };
        else { db.likes.push({ ...op.payload }); out = { data: null, error: null }; }
      } else if (op.kind === "update") {
        db.calls.push(["update", op.payload]);
        if (db.missingColumn) out = missing;
        else { db.likes.forEach((l) => { if (l.post_id === op.filters.post_id && l.profile_id === op.filters.profile_id) Object.assign(l, op.payload); }); out = { data: null, error: null }; }
      } else {
        db.calls.push(["delete", op.filters]);
        db.likes = db.likes.filter((l) => !(l.post_id === op.filters.post_id && l.profile_id === op.filters.profile_id));
        out = { data: null, error: null };
      }
      return Promise.resolve(out).then(res, rej);
    };
    return b;
  };
  const post = { id: "p1", author_id: "u2", body: "Bienvenue", created_at: "2026-11-01T12:00:00Z", profiles: { name: "Awa" } };
  const client = {
    from: vi.fn((table) => {
      if (table === "posts") return plain(() => [post]);
      if (table === "post_likes") return likesBuilder();
      return plain(() => []);
    }),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  };
  return { db, client };
}

async function mount(opts) {
  vi.resetModules();
  const fake = makeFake(opts);
  vi.doMock("../../supabaseClient", () => ({ supabase: fake.client }));
  const { default: PostsFeed } = await import("./PostsFeed");
  const onError = vi.fn();
  await act(async () => { render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={onError} />); });
  await screen.findByText("Bienvenue");
  return { ...fake, onError };
}

const likeRow = (profile, emoji) => ({ post_id: "p1", profile_id: profile, ...(emoji ? { emoji } : {}) });

describe("PostsFeed — réactions multiples", () => {
  beforeEach(() => { cleanup(); });

  it("charge les réactions : résumé des plus utilisées, total, et MA réaction", async () => {
    await mount({ likes: [likeRow("x1", "😂"), likeRow("x2", "😂"), likeRow("u1", "👏"), likeRow("x3", "❤️")] });
    const mine = await screen.findByRole("button", { name: "Retirer ma réaction 👏" });
    expect(mine.textContent).toContain("4");
    expect(mine.textContent).toContain("😂");
  });

  it("une première réaction avec le cœur : insert avec l'emoji ❤️", async () => {
    const { db } = await mount();
    fireEvent.click(await screen.findByRole("button", { name: "Aimer" }));
    await waitFor(() => expect(db.calls).toEqual([["insert", { post_id: "p1", profile_id: "u1", emoji: "❤️" }]]));
    expect(await screen.findByRole("button", { name: "Retirer le like" })).toBeTruthy();
  });

  it("choisir une autre réaction depuis le sélecteur : une seule requête UPDATE, le total ne change pas", async () => {
    const { db } = await mount({ likes: [likeRow("u1", "😂"), likeRow("x1", "❤️")] });
    fireEvent.click(await screen.findByRole("button", { name: "Choisir une réaction" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Solidarité/ }));
    await waitFor(() => expect(db.calls).toEqual([["update", { emoji: "🤝" }]]));
    const mine = await screen.findByRole("button", { name: "Retirer ma réaction 🤝" });
    expect(mine.textContent).toContain("2");
  });

  it("les six réactions sont proposées", async () => {
    await mount();
    fireEvent.click(await screen.findByRole("button", { name: "Choisir une réaction" }));
    const items = await screen.findAllByRole("menuitemradio");
    expect(items.map((i) => i.textContent)).toEqual(["❤️", "😂", "😍", "👏", "🤝", "😮"]);
  });

  it("toucher sa réaction la retire (DELETE) ; la touche cœur retire aussi une autre réaction", async () => {
    const { db } = await mount({ likes: [likeRow("u1", "😮")] });
    fireEvent.click(await screen.findByRole("button", { name: "Retirer ma réaction 😮" }));
    await waitFor(() => expect(db.calls[0][0]).toBe("delete"));
    expect(await screen.findByRole("button", { name: "Aimer" })).toBeTruthy();
  });

  it("conflit d'unicité (déjà réagi dans un autre onglet) : bascule en UPDATE, pas d'erreur", async () => {
    const { db, onError } = await mount({ conflictOnInsert: true });
    fireEvent.click(await screen.findByRole("button", { name: "Choisir une réaction" }));
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Bravo/ }));
    await waitFor(() => expect(db.calls.map((c) => c[0])).toEqual(["insert", "update"]));
    expect(onError).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Retirer ma réaction 👏" })).toBeTruthy();
  });

  describe("avant SQL-32 (colonne emoji absente)", () => {
    it("le fil se charge quand même (relecture sans emoji) : tout est un cœur", async () => {
      await mount({ missingColumn: true, likes: [likeRow("x1"), likeRow("u1")] });
      const mine = await screen.findByRole("button", { name: "Retirer le like" });
      expect(mine.textContent).toContain("2");
    });
    it("le cœur fonctionne comme avant (insert sans emoji)", async () => {
      const { db, onError } = await mount({ missingColumn: true });
      fireEvent.click(await screen.findByRole("button", { name: "Aimer" }));
      await waitFor(() => expect(db.calls.map((c) => c[0])).toEqual(["insert", "insert"]));
      expect(db.calls[1][1]).toEqual({ post_id: "p1", profile_id: "u1" });
      expect(onError).not.toHaveBeenCalled();
      expect(await screen.findByRole("button", { name: "Retirer le like" })).toBeTruthy();
    });
    it("une autre réaction annonce qu'elle arrive et revient en arrière", async () => {
      const { onError } = await mount({ missingColumn: true });
      fireEvent.click(await screen.findByRole("button", { name: "Choisir une réaction" }));
      fireEvent.click(await screen.findByRole("menuitemradio", { name: /Drôle/ }));
      await waitFor(() => expect(onError).toHaveBeenCalledWith("Les réactions multiples ne sont pas encore disponibles."));
      expect(await screen.findByRole("button", { name: "Aimer" })).toBeTruthy();
    });
  });
});
