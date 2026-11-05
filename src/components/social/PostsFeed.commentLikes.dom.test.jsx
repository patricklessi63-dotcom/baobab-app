import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

// « J'aime » des commentaires du fil (SQL-35) : faux client dont la table post_comment_likes enregistre les écritures
// ou répond « table absente ».
function makeFake({ likes = [], tableMissing = false, insertError = null } = {}) {
  const db = { likes: likes.map((l) => ({ ...l })), calls: [] };
  const post = { id: "p1", author_id: "u2", body: "Bienvenue", created_at: "2026-11-01T10:00:00Z", profiles: { name: "Awa" } };
  const comments = [{ id: "c1", post_id: "p1", author_id: "u3", body: "Joli !", created_at: "2026-11-01T11:00:00Z", profiles: { name: "Zoe" } }];
  const plain = (rowsFor) => {
    const st = { range: null };
    const b = {};
    ["select", "eq", "neq", "lte", "gt", "gte", "is", "ilike", "match", "contains", "not", "order", "limit", "or", "in"].forEach((m) => { b[m] = vi.fn(() => b); });
    b.range = vi.fn((f, t) => { st.range = [f, t]; return b; });
    b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    b.then = (res, rej) => {
      const all = rowsFor();
      return Promise.resolve({ data: st.range ? all.slice(st.range[0], st.range[1] + 1) : all, error: null }).then(res, rej);
    };
    return b;
  };
  const likesBuilder = () => {
    const op = { kind: "select", payload: null, filters: {} };
    const b = {};
    b.select = vi.fn(() => b); b.in = vi.fn(() => b); b.limit = vi.fn(() => b);
    b.insert = vi.fn((p) => { op.kind = "insert"; op.payload = p; return b; });
    b.delete = vi.fn(() => { op.kind = "delete"; return b; });
    b.eq = vi.fn((k, v) => { op.filters[k] = v; return b; });
    b.then = (res, rej) => {
      let out;
      if (tableMissing) out = { data: null, error: { code: "42P01", message: "relation post_comment_likes does not exist" } };
      else if (op.kind === "select") out = { data: db.likes, error: null };
      else if (op.kind === "insert") {
        db.calls.push(["insert", op.payload]);
        if (insertError) out = { data: null, error: insertError };
        else { db.likes.push({ ...op.payload }); out = { data: null, error: null }; }
      } else {
        db.calls.push(["delete", op.filters]);
        db.likes = db.likes.filter((l) => !(l.comment_id === op.filters.comment_id && l.profile_id === op.filters.profile_id));
        out = { data: null, error: null };
      }
      return Promise.resolve(out).then(res, rej);
    };
    return b;
  };
  const client = {
    from: vi.fn((t) => (t === "posts" ? plain(() => [post]) : t === "post_comments" ? plain(() => comments) : t === "post_comment_likes" ? likesBuilder() : plain(() => []))),
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
  fireEvent.click(screen.getByRole("button", { name: "Afficher les commentaires" }));
  await screen.findByText("Joli !");
  return { ...fake, onError };
}

describe("PostsFeed — j'aime des commentaires", () => {
  beforeEach(() => { cleanup(); window.localStorage.clear(); });

  it("affiche le compteur et MON j'aime", async () => {
    await mount({ likes: [{ comment_id: "c1", profile_id: "x1" }, { comment_id: "c1", profile_id: "u1" }] });
    const btn = await screen.findByRole("button", { name: "Retirer mon j'aime" });
    expect(btn.textContent).toContain("2");
  });

  it("aimer : insert, compteur et état à jour tout de suite ; ne plus aimer : delete", async () => {
    const { db } = await mount();
    fireEvent.click(await screen.findByRole("button", { name: "Aimer ce commentaire" }));
    await waitFor(() => expect(db.calls).toEqual([["insert", { comment_id: "c1", profile_id: "u1" }]]));
    const mine = await screen.findByRole("button", { name: "Retirer mon j'aime" });
    expect(mine.textContent).toContain("1");
    fireEvent.click(mine);
    await waitFor(() => expect(db.calls[1][0]).toBe("delete"));
    expect(await screen.findByRole("button", { name: "Aimer ce commentaire" })).toBeTruthy();
  });

  it("refus de la base : retour arrière et message", async () => {
    const { onError } = await mount({ insertError: { code: "42501", message: "permission denied" } });
    fireEvent.click(await screen.findByRole("button", { name: "Aimer ce commentaire" }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Aimer ce commentaire" })).toBeTruthy();
  });

  it("conflit d'unicité (déjà aimé ailleurs) : pas d'erreur", async () => {
    const { onError } = await mount({ insertError: { code: "23505", message: "duplicate key" } });
    fireEvent.click(await screen.findByRole("button", { name: "Aimer ce commentaire" }));
    expect(await screen.findByRole("button", { name: "Retirer mon j'aime" })).toBeTruthy();
    expect(onError).not.toHaveBeenCalled();
  });

  it("table absente (SQL-35 pas exécuté) : aucun bouton, aucune erreur affichée", async () => {
    const { onError } = await mount({ tableMissing: true });
    expect(screen.queryByRole("button", { name: /j'aime|Aimer ce commentaire/ })).not.toBeInTheDocument();
    expect(onError).not.toHaveBeenCalled();
  });
});
