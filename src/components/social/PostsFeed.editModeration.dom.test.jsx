import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";

import { MODERATION_REFUSAL } from "../../lib/contentModeration";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

// Modération à la MODIFICATION d'une publication : le texte modifié est contrôlé comme un nouveau texte, et un refus
// (local ou serveur) affiche le vrai motif au lieu du message générique « Impossible de modifier ».

function builder(result) {
  const b = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.then = (res, rej) => Promise.resolve(result).then(res, rej);
  return b;
}
const post = { id: "post-1", author_id: "u1", body: "Texte original", created_at: "2024-01-01T12:00:00Z", updated_at: null, profiles: { name: "Moi" } };

async function mount(updateResult) {
  vi.resetModules();
  const updates = [];
  const rpc = vi.fn().mockResolvedValue({ data: null });
  vi.doMock("../../supabaseClient", () => ({
    supabase: {
      rpc,
      from: vi.fn((table) => {
        if (table === "posts") {
          return {
            ...builder({ data: [post], error: null }),
            update: vi.fn((payload) => {
              updates.push(payload);
              const chain = {};
              ["eq", "is", "select"].forEach((m) => { chain[m] = vi.fn(() => chain); });
              chain.maybeSingle = vi.fn(() => Promise.resolve(updateResult()));
              return chain;
            }),
          };
        }
        return builder({ data: [], error: null });
      }),
      channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
      removeChannel: vi.fn(),
      storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
    },
  }));
  const { default: PostsFeed } = await import("./PostsFeed");
  const onError = vi.fn();
  await act(async () => { render(<PostsFeed currentUser={{ id: "u1", name: "Moi" }} onError={onError} />); });
  return { updates, onError, rpc };
}

async function editTo(text) {
  fireEvent.click(await screen.findByRole("button", { name: "Modifier la publication" }));
  const field = document.querySelector("textarea");
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
}

describe("PostsFeed — modération d'une modification", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("un texte insultant est refusé AVANT l'envoi, avec le vrai motif ; aucune requête de modification", async () => {
    const { updates, onError } = await mount(() => ({ data: post, error: null }));
    await editTo("espèce de connard");
    await waitFor(() => expect(onError).toHaveBeenCalledWith(MODERATION_REFUSAL));
    expect(updates).toEqual([]);
  });

  it("refus du serveur (déclencheur) : le vrai motif est affiché, pas « Impossible de modifier »", async () => {
    const { onError } = await mount(() => ({ data: null, error: { code: "P0001", message: "MODERATION_REFUSED: Ce message contient des propos non autorisés." } }));
    await editTo("un texte que le client laisse passer");
    await waitFor(() => expect(onError).toHaveBeenCalledWith(MODERATION_REFUSAL));
  });

  it("un texte propre est enregistré normalement", async () => {
    const { updates, onError } = await mount(() => ({ data: { ...post, body: "Texte corrigé", updated_at: "2024-01-02T00:00:00Z" }, error: null }));
    await editTo("Texte corrigé");
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].body).toBe("Texte corrigé");
    expect(onError).not.toHaveBeenCalled();
  });

  it("autre erreur : message générique inchangé", async () => {
    const { onError } = await mount(() => ({ data: null, error: { code: "500", message: "boom" } }));
    await editTo("Texte corrigé");
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Impossible de modifier cette publication."));
  });
});
