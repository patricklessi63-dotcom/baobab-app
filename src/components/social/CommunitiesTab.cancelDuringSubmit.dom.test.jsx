import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Bug identifié à l'audit création/édition de communauté : create_community()
// (RPC) est une requête réseau qu'on ne peut pas annuler côté client une fois
// lancée (handleSubmit dans CommunityCreateForm.jsx). Le bouton "Annuler" du
// pied de formulaire se désactive bien pendant `submitting`
// (disabled={submitting}), mais le bouton "← Annuler" affiché en haut d'écran
// par CommunitiesTab restait, lui, actionnable tout du long — tout comme la
// touche Échap (useEscapeKey). Comme le formulaire est déjà "dirty" (nom
// rempli) à cet instant, cliquer dessus ouvrait directement la confirmation
// "Quitter sans enregistrer ?" ; la confirmer démontait CommunityCreateForm
// mais n'annulait rien : create_community() aboutissait quand même juste
// après, côté serveur, malgré la confirmation explicite de l'utilisateur de
// tout abandonner — la communauté se retrouvait donc créée en base sans que
// l'interface ne la montre jamais.
//
// Ce test vérifie que le bouton "← Annuler" (haut d'écran) est neutralisé
// tant que la création est en vol : cliquer dessus ne doit ni ouvrir la
// confirmation, ni faire quitter l'écran de création.

const mocks = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

function makeSimpleBuilder(result = { data: [], error: null, count: 0 }) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: mocks.fromMock,
    rpc: (...args) => mocks.rpcMock(...args),
    storage: { from: vi.fn(() => ({ upload: vi.fn(() => Promise.resolve({ error: null })), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import CommunitiesTab from "./CommunitiesTab";

describe("CommunitiesTab — annuler pendant une création en vol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fromMock.mockImplementation(() => makeSimpleBuilder({ data: [], error: null, count: 0 }));
  });

  it("« ← Annuler » (haut d'écran) n'ouvre pas « Quitter sans enregistrer ? » et ne referme pas l'écran pendant que create_community est en vol", async () => {
    const user = userEvent.setup();
    let resolveRpc;
    mocks.rpcMock.mockImplementation(() => new Promise((r) => { resolveRpc = r; }));

    render(<CommunitiesTab currentUser={{ id: "u1", user_id: "au1", name: "Testeur", city: "Montréal" }} onError={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Créer" }));
    await user.type(await screen.findByLabelText("Nom *"), "Club de lecture");
    await user.click(screen.getByRole("button", { name: "🎓 Études" }));

    await user.click(screen.getByRole("button", { name: "Créer la communauté" }));
    await waitFor(() => expect(mocks.rpcMock).toHaveBeenCalledWith("create_community", expect.objectContaining({ p_name: "Club de lecture" })));

    // Deux boutons partagent le nom accessible "Annuler" (le bouton du pied
    // de formulaire, texte "Annuler", et celui du haut d'écran, texte
    // "← Annuler" mais aria-label="Annuler") — celui du haut d'écran est le
    // premier dans l'ordre du DOM.
    const cancelButtons = screen.getAllByRole("button", { name: "Annuler" });
    const headerCancel = cancelButtons[0];
    expect(headerCancel).toHaveTextContent("← Annuler");
    expect(headerCancel).toBeDisabled();

    await user.click(headerCancel);

    // Toujours sur l'écran de création, formulaire intact, aucune
    // confirmation de perte de saisie ouverte.
    expect(screen.queryByText("Quitter sans enregistrer ?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nom *")).toBeInTheDocument();
    expect(mocks.rpcMock).toHaveBeenCalledTimes(1);
  });
});
