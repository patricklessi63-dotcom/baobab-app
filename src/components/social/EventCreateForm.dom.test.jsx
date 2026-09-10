import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// EventCreateForm — formulaire de création d'événement. Zones sensibles
// couvertes ici (de VRAIS bugs y ont été corrigés) :
//  - détection de saisie non enregistrée `onDirtyChange` : régression
//    corrigée au commit a91b48a — `durationMinutes` et `maxParticipants`
//    étaient absents du calcul `isDirty` alors que `location` y était ;
//  - champs volontairement exclus du « dirty » (préremplis : city,
//    visibility, timezone, communityId) ;
//  - anti-double-submit (canSubmit inclut `!submitting`, bouton `disabled`) ;
//  - validation : titre requis + date future.

const rpc = vi.fn();
const single = vi.fn();
const chain = {
  select: vi.fn(() => chain),
  update: vi.fn(() => chain),
  insert: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  single,
  // useEffect de chargement des communautés : .select().eq().then(...)
  then: (resolve) => resolve({ data: [], error: null }),
};
vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => chain),
    rpc: (...args) => rpc(...args),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import EventCreateForm from "./EventCreateForm";

const currentUser = { id: "u1", city: "Montréal" };

function setup(props = {}) {
  const onDirtyChange = vi.fn();
  const onCreated = vi.fn();
  const onError = vi.fn();
  const utils = render(
    <EventCreateForm
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
const futureDate = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

async function fillRequired(user) {
  await user.type(screen.getByLabelText("Titre *"), "Brunch Baobab");
  await user.click(screen.getByRole("button", { name: "❤️ Rencontres" }));
  fireEvent.change(screen.getByLabelText("Date *"), { target: { value: futureDate() } });
  fireEvent.change(screen.getByLabelText("Heure *"), { target: { value: "18:00" } });
  // city est préremplie depuis currentUser.city
}

beforeEach(() => {
  vi.clearAllMocks();
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
});

describe("EventCreateForm — onDirtyChange", () => {
  it("signale non-dirty au montage (aucune saisie)", () => {
    const { onDirtyChange } = setup();
    expect(dirtyValues(onDirtyChange)).toEqual([false]);
  });

  it("titre saisi → onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByLabelText("Titre *"), "A");
    expect(dirtyValues(onDirtyChange)).toContain(true);
  });

  it("durée saisie → onDirtyChange(true) [régression a91b48a]", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByLabelText("Durée (minutes, optionnel)"), "90");
    expect(dirtyValues(onDirtyChange)).toContain(true);
  });

  it("nombre max de participants saisi → onDirtyChange(true) [régression a91b48a]", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByLabelText("Nombre maximum de participants (optionnel)"), "20");
    expect(dirtyValues(onDirtyChange)).toContain(true);
  });

  it("tout revidé → onDirtyChange(false) en dernier", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    const title = screen.getByLabelText("Titre *");
    await user.type(title, "Test");
    await user.clear(title);
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(false);
  });

  it("ville seule (préremplie) ne déclenche pas onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.type(screen.getByLabelText("Ville *"), " suite");
    expect(dirtyValues(onDirtyChange)).not.toContain(true);
  });

  it("changer fuseau ou visibilité seuls ne déclenche pas onDirtyChange(true)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    await user.selectOptions(screen.getByLabelText("Fuseau horaire"), "America/Vancouver");
    await user.click(screen.getByRole("button", { name: /Privé/ }));
    expect(dirtyValues(onDirtyChange)).not.toContain(true);
  });
});

describe("EventCreateForm — anti-double-submit & validation", () => {
  it("deux clics synchrones sur « Créer l'événement » ne déclenchent qu'un seul create_event", async () => {
    const user = userEvent.setup();
    let resolveRpc;
    rpc.mockImplementation(() => new Promise((r) => { resolveRpc = r; }));
    setup();
    await fillRequired(user);

    const submit = screen.getByRole("button", { name: "Créer l'événement" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_event", expect.objectContaining({ p_title: "Brunch Baobab" }));
    resolveRpc({ data: { id: "e1" }, error: null });
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  });

  it("bouton « Créer l'événement » désactivé tant que le titre est vide", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "❤️ Rencontres" }));
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value: futureDate() } });
    fireEvent.change(screen.getByLabelText("Heure *"), { target: { value: "18:00" } });
    expect(screen.getByRole("button", { name: "Créer l'événement" })).toBeDisabled();
    await user.type(screen.getByLabelText("Titre *"), "Ok");
    expect(screen.getByRole("button", { name: "Créer l'événement" })).toBeEnabled();
  });

  it("date dans le passé → message d'erreur, create_event non appelé", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("Titre *"), "Rétro");
    await user.click(screen.getByRole("button", { name: "❤️ Rencontres" }));
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("Heure *"), { target: { value: "10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer l'événement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/date et une heure dans le futur/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
