import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  isPushSupported: vi.fn(),
  isIosNotInstalled: vi.fn(),
  enablePushNotifications: vi.fn(),
}));
vi.mock("../../lib/pushNotifications", () => mocks);

import NotificationsOptIn from "./NotificationsOptIn";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPushSupported.mockReturnValue(true);
  mocks.isIosNotInstalled.mockReturnValue(false);
  global.Notification = { permission: "default" };
});
afterEach(() => {
  delete global.Notification;
});

describe("NotificationsOptIn", () => {
  it("succès : termine l'onboarding une seule fois", async () => {
    mocks.enablePushNotifications.mockResolvedValue({});
    const onDone = vi.fn();
    render(<NotificationsOptIn onDone={onDone} />);
    fireEvent.click(screen.getByText("Activer les notifications"));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("double-clic sur « Activer » : une seule demande de permission", async () => {
    mocks.enablePushNotifications.mockImplementation(() => new Promise(() => {}));
    render(<NotificationsOptIn onDone={vi.fn()} />);
    const btn = screen.getByText("Activer les notifications");
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mocks.enablePushNotifications).toHaveBeenCalledTimes(1);
  });

  it("échec : affiche l'erreur, « Plus tard » reste disponible et termine", async () => {
    mocks.enablePushNotifications.mockRejectedValue(new Error("réseau"));
    const onDone = vi.fn();
    render(<NotificationsOptIn onDone={onDone} />);
    fireEvent.click(screen.getByText("Activer les notifications"));
    expect(await screen.findByRole("alert")).toHaveTextContent("réseau");
    fireEvent.click(screen.getByText("Plus tard"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("« Plus tard » pendant la fenêtre de permission : la réponse tardive ne rappelle pas onDone", async () => {
    let resolve;
    mocks.enablePushNotifications.mockImplementation(() => new Promise((r) => { resolve = r; }));
    const onDone = vi.fn();
    render(<NotificationsOptIn onDone={onDone} />);
    fireEvent.click(screen.getByText("Activer les notifications"));
    fireEvent.click(screen.getByText("Plus tard"));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({}); });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("navigateur sans push : message honnête + « Continuer », pas de bouton « Activer »", () => {
    mocks.isPushSupported.mockReturnValue(false);
    const onDone = vi.fn();
    render(<NotificationsOptIn onDone={onDone} />);
    expect(screen.queryByText("Activer les notifications")).toBeNull();
    expect(screen.getByText(/ne prend pas en charge/)).toBeTruthy();
    fireEvent.click(screen.getByText("Continuer"));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("iPhone hors écran d'accueil : explique comment installer l'app", () => {
    mocks.isPushSupported.mockReturnValue(false);
    mocks.isIosNotInstalled.mockReturnValue(true);
    render(<NotificationsOptIn onDone={vi.fn()} />);
    expect(screen.getByText(/écran d'accueil/)).toBeTruthy();
  });

  it("permission déjà bloquée : message explicite + « Continuer » au lieu d'un bouton muet", () => {
    global.Notification = { permission: "denied" };
    render(<NotificationsOptIn onDone={vi.fn()} />);
    expect(screen.queryByText("Activer les notifications")).toBeNull();
    expect(screen.getByText(/bloquées dans les réglages/)).toBeTruthy();
    expect(screen.getByText("Continuer")).toBeTruthy();
  });
});
