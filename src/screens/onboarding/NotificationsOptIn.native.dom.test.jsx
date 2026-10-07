import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// App native : l'écran d'opt-in existant sert aussi de demande de permission
// (jamais au premier lancement : seulement au clic sur « Activer »). L'objet
// Notification du navigateur n'existe pas dans la WebView : l'écran ne doit pas s'y fier.

vi.mock("../../lib/platform", () => ({ isNative: () => true, getPlatform: () => "android" }));
const push = vi.hoisted(() => ({
  status: vi.fn(),
  enable: vi.fn(),
}));
vi.mock("../../lib/pushNotifications", () => ({
  isPushSupported: () => true,
  isIosNotInstalled: () => false,
  getPushSubscriptionStatus: (...a) => push.status(...a),
  enablePushNotifications: (...a) => push.enable(...a),
}));

import NotificationsOptIn from "./NotificationsOptIn";

let savedNotification;
beforeEach(() => {
  vi.clearAllMocks();
  savedNotification = global.Notification;
  delete global.Notification; // la WebView n'expose pas l'API Notification du navigateur
  push.status.mockResolvedValue({ supported: true, permission: "default", subscribed: false });
  push.enable.mockResolvedValue({});
});
afterEach(() => { if (savedNotification) global.Notification = savedNotification; });

describe("NotificationsOptIn — app native", () => {
  it("rien n'est demandé à l'affichage ; « Activer » déclenche la demande de permission puis termine l'écran", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<NotificationsOptIn onDone={onDone} />);
    expect(push.enable).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Activer les notifications" }));
    expect(push.enable).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("permission déjà refusée dans le téléphone : message honnête (réglages du téléphone), pas de bouton d'activation", async () => {
    push.status.mockResolvedValue({ supported: true, permission: "denied", subscribed: false });
    render(<NotificationsOptIn onDone={() => {}} />);
    expect(await screen.findByText(/réglages de ton téléphone/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Activer les notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeInTheDocument();
  });

  it("refus pendant la demande : le message d'erreur s'affiche et « Plus tard » reste disponible", async () => {
    push.enable.mockRejectedValue(new Error("Notifications bloquées. Tu peux les autoriser dans les réglages de ton téléphone."));
    const user = userEvent.setup();
    const onDone = vi.fn();
    render(<NotificationsOptIn onDone={onDone} />);
    await user.click(await screen.findByRole("button", { name: "Activer les notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("réglages de ton téléphone");
    await user.click(screen.getByRole("button", { name: "Plus tard" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
