import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    auth: { getUser: mocks.getUser, signInWithPassword: mocks.signInWithPassword },
    from: () => ({ update: (...a) => ({ eq: () => mocks.update(...a) }) }),
  },
}));

import DeleteAccountModal from "./DeleteAccountModal";
import { verifyPasswordForDeletion } from "../lib/deleteAccount";

const user = { id: "p1" };
const setup = () => {
  const onRequested = vi.fn();
  render(<DeleteAccountModal open onClose={() => {}} currentUser={user} onRequested={onRequested} />);
  return { onRequested };
};
const button = () => screen.getByRole("button", { name: /Programmer la suppression/ });
const fill = (word, pwd) => {
  fireEvent.change(screen.getByPlaceholderText("SUPPRIMER"), { target: { value: word } });
  if (pwd !== undefined) fireEvent.change(screen.getByLabelText("Ton mot de passe"), { target: { value: pwd } });
};

describe("DeleteAccountModal — confirmation par mot de passe", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "a@b.ca" } } });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.update.mockResolvedValue({ error: null });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("le bouton reste inactif sans SUPPRIMER ou sans mot de passe", () => {
    setup();
    expect(button()).toBeDisabled();
    fill("SUPPRIMER");
    expect(button()).toBeDisabled();
    fill("SUPPRIMER", "secret");
    expect(button()).not.toBeDisabled();
    fill("non", "secret");
    expect(button()).toBeDisabled();
  });

  it("bon mot de passe : vérifié avec l'adresse de la session, puis suppression programmée", async () => {
    const { onRequested } = setup();
    fill("SUPPRIMER", "secret");
    fireEvent.click(button());
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.ca", password: "secret" });
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("mauvais mot de passe : message clair, RIEN n'est programmé", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status: 400, message: "Invalid login credentials" } });
    const { onRequested } = setup();
    fill("SUPPRIMER", "faux");
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent("Mot de passe incorrect.");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(onRequested).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Ton mot de passe")).toHaveValue("");
  });
});

describe("verifyPasswordForDeletion", () => {
  beforeEach(() => { mocks.getUser.mockResolvedValue({ data: { user: { email: "a@b.ca" } } }); });
  afterEach(() => vi.clearAllMocks());

  it("mot de passe vide : refusé sans appel réseau", async () => {
    await expect(verifyPasswordForDeletion("")).rejects.toThrow("Saisis ton mot de passe");
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });
  it("session sans adresse : demande de se reconnecter", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(verifyPasswordForDeletion("x")).rejects.toThrow("Reconnecte-toi");
  });
  it("trop de tentatives : message dédié", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status: 429, message: "rate limit" } });
    await expect(verifyPasswordForDeletion("x")).rejects.toThrow("Trop de tentatives");
  });
  it("panne réseau : ne dit pas « mot de passe incorrect »", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { status: 0, message: "Failed to fetch" } });
    await expect(verifyPasswordForDeletion("x")).rejects.toThrow("Vérifie ta connexion");
  });
});
