import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit robustesse (lancement) : un crash de rendu dans un onglet NON lazy
// (ici Messages/MessagesTab) ne doit pas remplacer toute la coquille.
// La barre de navigation reste utilisable et changer d'onglet réinitialise
// l'état d'erreur.
// navigation par historique déjà couverte par SocialShell.dom.test.jsx.
function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder()),
    channel: vi.fn(() => {
      const ch = {};
      ch.on = vi.fn(() => ch);
      ch.subscribe = vi.fn(() => ch);
      return ch;
    }),
    removeChannel: vi.fn(),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

vi.mock("./social/MessagesTab", () => ({
  default: function MessagesTabBoom() {
    throw new Error("Cannot read properties of null (reading 'name')");
  },
}));

import SocialShell from "./SocialShell";

let consoleErrorSpy;
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => consoleErrorSpy.mockRestore());

describe("SocialShell — crash de rendu dans un onglet non lazy", () => {
  it("affiche le message de secours dans le contenu, garde la barre de navigation, et se rétablit en changeant d'onglet", async () => {
    const user = userEvent.setup();
    render(<SocialShell currentUser={null} setView={vi.fn()} handleSignOut={vi.fn()} />);
    const nav = within(screen.getByRole("navigation"));

    await user.click(nav.getByRole("button", { name: "Messages" }));
    expect(screen.getByText(/Impossible de charger cette section/)).toBeInTheDocument();
    // pas de fuite technique
    expect(screen.queryByText(/Cannot read properties/)).toBeNull();
    // la navigation est toujours là et active
    expect(screen.getByRole("navigation")).toBeInTheDocument();

    await user.click(nav.getByRole("button", { name: "Rencontres" }));
    expect(screen.queryByText(/Impossible de charger cette section/)).toBeNull();
    expect(nav.getByRole("button", { name: "Rencontres" })).toHaveAttribute("aria-current", "page");
  });
});
