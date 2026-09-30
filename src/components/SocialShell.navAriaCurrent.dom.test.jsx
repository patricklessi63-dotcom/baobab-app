import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit accessibilité clavier de la navigation principale (barre du bas,
// SocialShell.jsx) : l'onglet actif n'était signalé que visuellement (icône/
// texte dorés), sans aria-current sur les boutons — un lecteur d'écran ne
// pouvait donc jamais annoncer lequel des 5 onglets correspond à l'écran
// affiché. Ce fichier vérifie uniquement ce point, indépendamment de la
// navigation par historique déjà couverte par SocialShell.dom.test.jsx.
function makeQueryBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
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

import SocialShell from "./SocialShell";

function setup() {
  const props = { currentUser: null, setView: vi.fn(), handleSignOut: vi.fn() };
  return render(<SocialShell {...props} />);
}

function bottomNav() {
  return within(screen.getByRole("navigation"));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "");
});

describe("SocialShell — aria-current sur la barre de navigation du bas", () => {
  it("seul l'onglet actif (Découverte au montage) porte aria-current=\"page\", les 4 autres n'ont pas l'attribut", () => {
    setup();
    const nav = bottomNav();

    expect(nav.getByRole("button", { name: "Découverte" })).toHaveAttribute("aria-current", "page");
    for (const label of ["Rencontres", "Messages", "Intégration", "Profil"]) {
      expect(nav.getByRole("button", { name: label })).not.toHaveAttribute("aria-current");
    }
  });

  it("changer d'onglet au clic déplace aria-current vers le nouvel onglet actif", async () => {
    const user = userEvent.setup();
    setup();
    const nav = bottomNav();

    await user.click(nav.getByRole("button", { name: "Rencontres" }));

    expect(nav.getByRole("button", { name: "Rencontres" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("button", { name: "Découverte" })).not.toHaveAttribute("aria-current");
  });
});
