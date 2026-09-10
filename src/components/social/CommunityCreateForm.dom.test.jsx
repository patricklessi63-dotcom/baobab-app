import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// CommunityCreateForm — doit rester cohérent avec EventCreateForm :
//  - `isDirty` = un champ libre est rempli (name / description / category /
//    rules / coverFile) ; champs préremplis exclus (city, visibility) ;
//  - anti-double-submit (canSubmit inclut `!submitting`, bouton `disabled`) ;
//  - validation : nom + catégorie requis (bouton désactivé sinon).

const rpc = vi.fn();
vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(), eq: vi.fn(), then: (r) => r({ data: [], error: null }) })),
    rpc: (...args) => rpc(...args),
    storage: { from: vi.fn(() => ({ upload: vi.fn(() => Promise.resolve({ error: null })), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import CommunityCreateForm from "./CommunityCreateForm";

const currentUser = { id: "u1", user_id: "au1", city: "Montréal", ai_suggestions_enabled: false };

function setup(props = {}) {
  const onDirtyChange = vi.fn();
  const onCreated = vi.fn();
  const onError = vi.fn();
  const utils = render(
    <CommunityCreateForm
      currentUser={currentUser}
      onCreated={onCreated}
      onCancel={() => {}}
      onError={onError}
      onDirtyChange={onDirtyChange}
      {...props}
    />
  );
  return { onDirtyChange, onCreated, onError, ...utils };
}

const dirtyValues = (fn) => fn.mock.calls.map((c) => c[0]);

beforeEach(() => vi.clearAllMocks());

describe("CommunityCreateForm — onDirtyChange", () => {
  it("signale non-dirty au montage", () => {
    const { onDirtyChange } = setup();
    expect(dirtyValues(onDirtyChange)).toEqual([false]);
  });

  it("nom saisi → onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByLabelText("Nom *"), "Club");
    expect(dirtyValues(onDirtyChange)).toContain(true);
  });

  it("règles saisies → onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByPlaceholderText(/Respect des membres/), "Sois sympa");
    expect(dirtyValues(onDirtyChange)).toContain(true);
  });

  it("catégorie choisie → onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.click(screen.getByRole("button", { name: "🎓 Études" }));
    expect(dirtyValues(onDirtyChange)).toContain(true);
  });

  it("tout revidé → onDirtyChange(false) en dernier", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    const name = screen.getByLabelText("Nom *");
    await user.type(name, "Club");
    await user.clear(name);
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(false);
  });

  it("ville seule (préremplie) ou type ne déclenchent pas onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByLabelText("Ville"), " Nord");
    await user.click(screen.getByRole("button", { name: /Sur invitation/ }));
    expect(dirtyValues(onDirtyChange)).not.toContain(true);
  });
});

describe("CommunityCreateForm — anti-double-submit & validation", () => {
  it("nom + catégorie requis : bouton désactivé sinon", async () => {
    const user = userEvent.setup();
    setup();
    const submit = screen.getByRole("button", { name: "Créer la communauté" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText("Nom *"), "Club");
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "🎓 Études" }));
    expect(submit).toBeEnabled();
  });

  it("deux clics synchrones sur « Créer la communauté » ne déclenchent qu'un seul create_community", async () => {
    const user = userEvent.setup();
    let resolveRpc;
    rpc.mockImplementation(() => new Promise((r) => { resolveRpc = r; }));
    setup();
    await user.type(screen.getByLabelText("Nom *"), "Montréal Running Club");
    await user.click(screen.getByRole("button", { name: "🏃 Sport" }));

    const submit = screen.getByRole("button", { name: "Créer la communauté" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_community", expect.objectContaining({ p_name: "Montréal Running Club" }));
    resolveRpc({ data: { id: "c1" }, error: null });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  });
});
