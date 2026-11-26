import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MODERATION_REFUSAL } from "../../lib/contentModeration";
import { resetModerationTermsLoad } from "../../lib/contentGate";

// Défaut corrigé (audit du 26/11/2026) : les textes publics des événements (titre, description,
// ville, lieu) et des communautés (nom, description, ville, règles) ne passaient par AUCUNE
// modération, ni dans l'application ni sur le serveur. Ces tests montent les VRAIS formulaires avec la
// VRAIE porte (contentGate.screenText, liste de départ du dépôt) et vérifient :
//  - un texte injurieux est refusé AVANT toute écriture (aucun create_event / UPDATE / create_community,
//    aucun fichier envoyé) et le message de refus s'affiche ;
//  - un refus du SERVEUR (déclencheur SQL-45, P0001 « MODERATION_REFUSED: … ») s'affiche proprement ;
//  - à la modification, un texte INCHANGÉ n'est pas recontrôlé (comme le déclencheur serveur).

const BAD = "sale connard";
const SERVER_REFUSAL = {
  code: "P0001",
  message: "MODERATION_REFUSED: Ce contenu contient des propos non autorisés. Les récidives entraînent une suspension.",
};

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
  maybeSingle: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("../../supabaseClient", () => {
  const builder = () => {
    const b = {};
    ["select", "eq", "is", "ilike", "order", "in"].forEach((m) => { b[m] = vi.fn(() => b); });
    b.update = vi.fn((...args) => { mocks.update(...args); return b; });
    // moderation_terms / moderation_exceptions illisibles ici : la liste de départ du dépôt s'applique.
    b.limit = vi.fn(() => Promise.resolve({ data: [], error: null }));
    b.maybeSingle = (...args) => mocks.maybeSingle(...args);
    b.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
    b.then = (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject);
    return b;
  };
  return {
    supabase: {
      from: vi.fn(() => builder()),
      rpc: (...args) => mocks.rpc(...args),
      storage: {
        from: vi.fn(() => ({
          upload: (...args) => { mocks.upload(...args); return Promise.resolve({ error: null }); },
          remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
          createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: "" } })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })),
        })),
      },
    },
  };
});

import EventCreateForm from "./EventCreateForm";
import EventEditForm from "./EventEditForm";
import CommunityCreateForm from "./CommunityCreateForm";

const rpcNames = () => mocks.rpc.mock.calls.map((c) => c[0]);
const futureDate = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

const event = {
  id: "e1", title: "Brunch Baobab", description: "Un bon moment", category: "rencontres", cover_url: null,
  event_date: new Date(Date.now() + 30 * 864e5).toISOString(), duration_minutes: 90, city: "Montréal",
  location: "Plateau", max_participants: 20, timezone: "America/Toronto", updated_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetModerationTermsLoad();
  mocks.rpc.mockImplementation((name) => Promise.resolve(
    name === "moderation_screen" ? { data: { allowed: false }, error: null } : { data: { id: "new1" }, error: null }
  ));
  mocks.maybeSingle.mockImplementation(() => Promise.resolve({ data: { ...event }, error: null }));
});

async function fillEvent(user, { title = "Brunch Baobab", location = "" } = {}) {
  render(<EventCreateForm currentUser={{ id: "u1", city: "Montréal" }} onCreated={() => {}} onCancel={() => {}} onError={() => {}} />);
  await user.type(screen.getByLabelText("Titre *"), title);
  await user.click(screen.getByRole("button", { name: "❤️ Rencontres" }));
  fireEvent.change(screen.getByLabelText("Date *"), { target: { value: futureDate() } });
  fireEvent.change(screen.getByLabelText("Heure *"), { target: { value: "18:00" } });
  if (location) await user.type(screen.getByLabelText(/^Lieu public/), location);
}

describe("EventCreateForm : textes de l'événement modérés", () => {
  it("titre injurieux : refusé avant create_event, message de refus affiché", async () => {
    const user = userEvent.setup();
    await fillEvent(user, { title: BAD });
    await user.click(screen.getByRole("button", { name: "Créer l'événement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(MODERATION_REFUSAL);
    expect(rpcNames()).toContain("moderation_screen");
    expect(rpcNames()).not.toContain("create_event");
  });

  it("lieu injurieux : refusé aussi (pas seulement le titre)", async () => {
    const user = userEvent.setup();
    await fillEvent(user, { location: BAD });
    await user.click(screen.getByRole("button", { name: "Créer l'événement" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(MODERATION_REFUSAL);
    expect(rpcNames()).not.toContain("create_event");
  });

  it("refus du serveur (déclencheur SQL-45) : message lisible, sans le code technique", async () => {
    mocks.rpc.mockImplementation((name) => Promise.resolve(name === "create_event" ? { data: null, error: SERVER_REFUSAL } : { data: null, error: null }));
    const user = userEvent.setup();
    await fillEvent(user);
    await user.click(screen.getByRole("button", { name: "Créer l'événement" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ce contenu contient des propos non autorisés.");
    expect(alert.textContent).not.toContain("MODERATION_REFUSED");
  });
});

describe("EventEditForm : seuls les textes modifiés sont modérés", () => {
  const renderEdit = (ev = event) =>
    render(<EventEditForm event={ev} onSaved={() => {}} onCancel={() => {}} onError={() => {}} />);

  it("description modifiée en texte injurieux : refusée, aucun UPDATE", async () => {
    const user = userEvent.setup();
    renderEdit();
    const desc = screen.getByLabelText("Description");
    await user.clear(desc);
    await user.type(desc, BAD);
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(MODERATION_REFUSAL);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("ancien titre injurieux INCHANGÉ : corriger la durée reste possible (pas de recontrôle)", async () => {
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EventEditForm event={{ ...event, title: BAD }} onSaved={onSaved} onCancel={() => {}} onError={() => {}} />);
    const duration = screen.getByLabelText("Durée (minutes, facultatif)");
    await user.clear(duration);
    await user.type(duration, "120");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(rpcNames()).not.toContain("moderation_screen");
  });

  it("refus du serveur : message lisible au lieu de « Réessaie »", async () => {
    mocks.maybeSingle.mockImplementation(() => Promise.resolve({ data: null, error: SERVER_REFUSAL }));
    const user = userEvent.setup();
    renderEdit();
    await user.type(screen.getByLabelText("Titre *"), " MTL");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Ce contenu contient des propos non autorisés.");
    expect(alert.textContent).not.toContain("Réessaie");
  });
});

describe("CommunityCreateForm : textes de la communauté modérés", () => {
  it("règles injurieuses : refusées avant create_community et avant l'envoi de la couverture", async () => {
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<CommunityCreateForm currentUser={{ id: "u1", user_id: "au1", city: "Montréal", ai_suggestions_enabled: false }} onCreated={() => {}} onCancel={() => {}} onError={onError} />);
    await user.type(screen.getByLabelText("Nom *"), "Entraide Québec");
    await user.click(screen.getByRole("button", { name: "🎓 Études" }));
    await user.type(screen.getByLabelText(/^Règles/), BAD);
    await user.click(screen.getByRole("button", { name: "Créer la communauté" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(MODERATION_REFUSAL));
    expect(rpcNames()).not.toContain("create_community");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("communauté normale : créée", async () => {
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(<CommunityCreateForm currentUser={{ id: "u1", user_id: "au1", city: "Montréal", ai_suggestions_enabled: false }} onCreated={onCreated} onCancel={() => {}} onError={() => {}} />);
    await user.type(screen.getByLabelText("Nom *"), "Entraide Québec");
    await user.click(screen.getByRole("button", { name: "🎓 Études" }));
    await user.click(screen.getByRole("button", { name: "Créer la communauté" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(rpcNames()).toEqual(["create_community"]);
  });
});
