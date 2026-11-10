import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../supabaseClient", () => ({ supabase: {} }));
const usePremiumStatusMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: (...a) => usePremiumStatusMock(...a) }));

const api = vi.hoisted(() => ({
  listCollections: vi.fn(),
  createCollection: vi.fn(),
  deleteCollection: vi.fn(),
  addToCollection: vi.fn(),
  removeFromCollection: vi.fn(),
  loadCollectionPosts: vi.fn(),
}));
vi.mock("../../lib/premium/collections", async () => {
  const real = await vi.importActual("../../lib/premium/collections");
  return { ...real, ...Object.fromEntries(Object.keys(api).map((k) => [k, (...a) => api[k](...a)])) };
});

import CollectionsModal from "./CollectionsModal";

const user = { id: "u1" };
const post = { id: "p1", body: "Bonjour" };

function setup(props = {}) {
  const onClose = vi.fn();
  const onOpenPremium = vi.fn();
  render(<CollectionsModal open onClose={onClose} currentUser={user} onOpenPremium={onOpenPremium} {...props} />);
  return { onClose, onOpenPremium };
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  usePremiumStatusMock.mockReturnValue({ isPremium: true, loading: false });
  api.listCollections.mockResolvedValue([{ id: "c1", name: "À relire", postIds: [] }, { id: "c2", name: "Recettes", postIds: ["p1"] }]);
});

describe("CollectionsModal — Premium, enregistrer une publication", () => {
  it("affiche les collections avec leur état coché pour la publication", async () => {
    setup({ post });
    expect(await screen.findByRole("checkbox", { name: /à relire/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /recettes/i })).toBeChecked();
  });

  it("cocher range la publication, décocher la retire", async () => {
    api.addToCollection.mockResolvedValue();
    api.removeFromCollection.mockResolvedValue();
    setup({ post });
    fireEvent.click(await screen.findByRole("checkbox", { name: /à relire/i }));
    await waitFor(() => expect(api.addToCollection).toHaveBeenCalledWith("u1", "c1", "p1"));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /à relire/i })).toBeChecked());
    fireEvent.click(screen.getByRole("checkbox", { name: /recettes/i }));
    await waitFor(() => expect(api.removeFromCollection).toHaveBeenCalledWith("c2", "p1"));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /recettes/i })).not.toBeChecked());
  });

  it("créer une collection y range aussitôt la publication", async () => {
    api.createCollection.mockResolvedValue({ id: "c3", name: "Voyage", postIds: [] });
    api.addToCollection.mockResolvedValue();
    setup({ post });
    await screen.findByRole("checkbox", { name: /à relire/i });
    fireEvent.change(screen.getByLabelText(/nom de la nouvelle collection/i), { target: { value: "Voyage" } });
    fireEvent.click(screen.getByRole("button", { name: /^créer$/i }));
    await waitFor(() => expect(api.createCollection).toHaveBeenCalledWith("u1", "Voyage"));
    await waitFor(() => expect(api.addToCollection).toHaveBeenCalledWith("u1", "c3", "p1"));
    expect(await screen.findByRole("checkbox", { name: /voyage/i })).toBeChecked();
  });

  it("affiche le message de la base (limite de collections) au lieu d'un échec silencieux", async () => {
    api.createCollection.mockRejectedValue({ message: "COLLECTION_LIMIT: 20 collections au maximum." });
    setup({ post });
    await screen.findByRole("checkbox", { name: /à relire/i });
    fireEvent.change(screen.getByLabelText(/nom de la nouvelle collection/i), { target: { value: "Une de plus" } });
    fireEvent.click(screen.getByRole("button", { name: /^créer$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/limite de 20 collections/i);
  });

  it("un échec réseau d'un ajout laisse la case dans son état réel et le dit", async () => {
    api.addToCollection.mockRejectedValue(new Error("Failed to fetch"));
    setup({ post });
    fireEvent.click(await screen.findByRole("checkbox", { name: /à relire/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/une erreur est survenue/i);
    expect(screen.getByRole("checkbox", { name: /à relire/i })).not.toBeChecked();
  });
});

describe("CollectionsModal — consulter (Mes collections)", () => {
  it("déplie une collection, montre ses publications et permet d'en retirer une", async () => {
    api.loadCollectionPosts.mockResolvedValue([{ id: "p1", body: "Gâteau au gingembre", profiles: { name: "Awa" } }]);
    api.removeFromCollection.mockResolvedValue();
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /^recettes/i }));
    expect(await screen.findByText("Gâteau au gingembre")).toBeInTheDocument();
    expect(screen.getByText("Awa")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retirer de la collection/i }));
    await waitFor(() => expect(api.removeFromCollection).toHaveBeenCalledWith("c2", "p1"));
    await waitFor(() => expect(screen.queryByText("Gâteau au gingembre")).toBeNull());
  });

  it("supprimer une collection la retire de la liste", async () => {
    api.deleteCollection.mockResolvedValue();
    setup();
    fireEvent.click(await screen.findByRole("button", { name: /supprimer la collection à relire/i }));
    await waitFor(() => expect(api.deleteCollection).toHaveBeenCalledWith("c1"));
    await waitFor(() => expect(screen.queryByText("À relire")).toBeNull());
  });
});

describe("CollectionsModal — compte gratuit", () => {
  beforeEach(() => usePremiumStatusMock.mockReturnValue({ isPremium: false, loading: false }));

  it("sans collection : fiche Premium avec les deux boutons, aucun formulaire de création", async () => {
    api.listCollections.mockResolvedValue([]);
    const { onClose, onOpenPremium } = setup({ post });
    expect(await screen.findByText(/jusqu'à 20 collections/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nom de la nouvelle collection/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^passer à premium$/i }));
    expect(onOpenPremium).toHaveBeenCalledWith("plans");
    expect(onClose).toHaveBeenCalled();
  });

  it("'Découvrir Premium' passe l'intention 'discover'", async () => {
    api.listCollections.mockResolvedValue([]);
    const { onOpenPremium } = setup({ post });
    fireEvent.click(await screen.findByRole("button", { name: /^découvrir premium$/i }));
    expect(onOpenPremium).toHaveBeenCalledWith("discover");
  });

  it("abonnement échu avec des collections existantes : consultation et retrait possibles, ajout désactivé", async () => {
    setup({ post });
    expect(await screen.findByText(/ton abonnement premium n'est pas actif/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /à relire/i })).toBeDisabled(); // pas cochée : ajout impossible
    expect(screen.getByRole("checkbox", { name: /recettes/i })).not.toBeDisabled(); // cochée : on peut la retirer
    expect(screen.queryByLabelText(/nom de la nouvelle collection/i)).toBeNull();
  });
});

describe("CollectionsModal — chargement en échec", () => {
  it("dit que les collections ne sont pas disponibles (migration non passée) sans planter", async () => {
    api.listCollections.mockRejectedValue({ code: "42P01", message: "relation does not exist" });
    setup({ post });
    expect(await screen.findByRole("alert")).toHaveTextContent(/pas encore disponibles/i);
  });
});
