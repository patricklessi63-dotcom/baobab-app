import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// EventEditForm — `isDirty` compare CHAQUE champ éditable à sa valeur
// d'origine figée (initialRef), y compris `durationMinutes` et
// `maxParticipants` (comparaison via String() pour absorber number/string).
// On vérifie : non-dirty au montage, dirty à la moindre modification réelle,
// retour à non-dirty quand on rétablit les valeurs d'origine, et
// anti-double-submit.

const single = vi.fn();
const chain = {
  update: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  select: vi.fn(() => chain),
  single,
};
vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => chain),
    storage: { from: vi.fn(() => ({ createSignedUrl: vi.fn(), remove: vi.fn() })) },
  },
}));

import EventEditForm from "./EventEditForm";

const event = {
  id: "e1",
  title: "Brunch Baobab",
  description: "Un bon moment",
  category: "rencontres",
  cover_url: null,
  event_date: new Date(Date.now() + 30 * 864e5).toISOString(),
  duration_minutes: 90,
  city: "Montréal",
  location: "Plateau",
  max_participants: 20,
  timezone: "America/Toronto",
};

function setup(props = {}) {
  const onDirtyChange = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <EventEditForm event={event} onSaved={onSaved} onCancel={() => {}} onError={() => {}} onDirtyChange={onDirtyChange} {...props} />
  );
  return { onDirtyChange, onSaved, ...utils };
}

const dirtyValues = (fn) => fn.mock.calls.map((c) => c[0]);

beforeEach(() => {
  vi.clearAllMocks();
  chain.update.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
});

describe("EventEditForm — onDirtyChange", () => {
  it("non-dirty au montage (champs identiques à l'événement d'origine)", () => {
    const { onDirtyChange } = setup();
    expect(dirtyValues(onDirtyChange)).toEqual([false]);
  });

  it("titre modifié → true, puis rétabli → false", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    const title = screen.getByLabelText("Titre *");
    await user.type(title, " MTL");
    expect(dirtyValues(onDirtyChange)).toContain(true);
    await user.clear(title);
    await user.type(title, "Brunch Baobab");
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(false);
  });

  it("durée modifiée → true (durationMinutes comparé à l'origine)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    const duration = screen.getByLabelText("Durée (minutes, optionnel)");
    await user.clear(duration);
    await user.type(duration, "120");
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(true);
  });

  it("nombre max de participants modifié → true", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    const max = screen.getByLabelText("Nombre maximum de participants (optionnel)");
    await user.clear(max);
    await user.type(max, "5");
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(true);
  });

  it("rétablir durée + max à leur valeur d'origine → onDirtyChange(false)", async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = setup();
    const duration = screen.getByLabelText("Durée (minutes, optionnel)");
    const max = screen.getByLabelText("Nombre maximum de participants (optionnel)");
    await user.clear(duration);
    await user.type(duration, "45");
    await user.clear(max);
    await user.type(max, "8");
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(true);
    await user.clear(duration);
    await user.type(duration, "90");
    await user.clear(max);
    await user.type(max, "20");
    expect(dirtyValues(onDirtyChange).at(-1)).toBe(false);
  });
});

describe("EventEditForm — anti-double-submit", () => {
  it("deux clics synchrones sur « Enregistrer » ne déclenchent qu'un seul update", async () => {
    let resolveSingle;
    single.mockImplementation(() => new Promise((r) => { resolveSingle = r; }));
    setup();
    const save = screen.getByRole("button", { name: "Enregistrer" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(chain.update).toHaveBeenCalledTimes(1);
    resolveSingle({ data: { ...event }, error: null });
    await waitFor(() => expect(chain.update).toHaveBeenCalledTimes(1));
  });
});
