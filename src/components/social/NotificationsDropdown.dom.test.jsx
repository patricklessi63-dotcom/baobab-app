import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationsDropdown from "./NotificationsDropdown";

// Dropdown de la cloche du header de SocialShell.jsx, extrait tel quel (voir
// commentaire en tête de NotificationsDropdown.jsx) — pas de logique propre,
// seulement le câblage props → JSX. Les tests couvrent l'état vide, le rendu
// d'une ligne de notification, le clic dessus (marque comme lu + action +
// fermeture), les pastilles de catégorie et le bouton « Charger plus ».

function baseProps(overrides) {
  return {
    unreadCommunityCount: 0,
    markCommunityNotificationsRead: vi.fn(),
    notifCategory: "all",
    setNotifCategory: vi.fn(),
    notifPillRefs: { current: {} },
    incomingFavoritesCount: 0,
    visibleCommunityNotifications: [],
    onNotifTouchStart: vi.fn(),
    onNotifTouchEnd: vi.fn(),
    unreadDatingNotifications: [],
    unreadMessageNotifications: [],
    unreadFollowNotifications: [],
    unreadCommunityNotifications: [],
    unreadEventNotifications: [],
    unreadPostNotifications: [],
    markOneNotificationRead: vi.fn(),
    setViewedProfileId: vi.fn(),
    openChatWithProfileId: vi.fn(),
    setOpenCommunityId: vi.fn(),
    setOpenEventId: vi.fn(),
    goTab: vi.fn(),
    notifHasMore: false,
    setNotifLimit: vi.fn(),
    setNotificationsOpen: vi.fn(),
    ...overrides,
  };
}

function setup(overrides) {
  const props = baseProps(overrides);
  const utils = render(<NotificationsDropdown {...props} />);
  return { props, ...utils };
}

describe("NotificationsDropdown", () => {
  it("état vide : aucune notification, pas de bouton « Tout marquer comme lu »", () => {
    setup();
    expect(screen.getByText("Aucune notification pour l'instant.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tout marquer comme lu" })).toBeNull();
  });

  it("rend les pastilles de catégorie (NOTIF_CATEGORIES)", () => {
    setup();
    ["Tout", "Messages", "Rencontres", "Communautés", "Événements", "Abonnés"].forEach((label) => {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    });
  });

  it("clic sur une pastille appelle setNotifCategory", async () => {
    const user = userEvent.setup();
    const { props } = setup();
    await user.click(screen.getByRole("button", { name: "Messages" }));
    expect(props.setNotifCategory).toHaveBeenCalledWith("messages");
  });

  it("« Tout marquer comme lu » visible si unreadCommunityCount > 0, appelle markCommunityNotificationsRead", async () => {
    const user = userEvent.setup();
    const { props } = setup({ unreadCommunityCount: 2 });
    const btn = screen.getByRole("button", { name: "Tout marquer comme lu" });
    await user.click(btn);
    expect(props.markCommunityNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it("rend une notification de message et le clic marque comme lu, ouvre le chat, ferme le panneau", async () => {
    const user = userEvent.setup();
    const message = {
      id: "n1",
      type: "new_message",
      target_id: "profile-1",
      actor: { name: "Awa" },
      created_at: "2024-01-01T00:00:00Z",
    };
    const { props } = setup({
      unreadMessageNotifications: [message],
      visibleCommunityNotifications: [message],
    });
    const row = screen.getByRole("button", { name: /Nouveau message de Awa/ });
    await user.click(row);
    expect(props.markOneNotificationRead).toHaveBeenCalledWith("n1");
    expect(props.openChatWithProfileId).toHaveBeenCalledWith("profile-1");
    expect(props.setNotificationsOpen).toHaveBeenCalledWith(false);
  });

  it("notification communauté « premium_* » va vers l'onglet premium plutôt que communities", async () => {
    const user = userEvent.setup();
    const premiumNotif = {
      id: "n2",
      type: "premium_activated",
      created_at: "2024-01-01T00:00:00Z",
    };
    const { props } = setup({
      unreadCommunityNotifications: [premiumNotif],
      visibleCommunityNotifications: [premiumNotif],
    });
    const row = screen.getByRole("button", { name: /Ton abonnement Premium est actif/ });
    await user.click(row);
    expect(props.goTab).toHaveBeenCalledWith("premium");
    expect(props.setOpenCommunityId).not.toHaveBeenCalled();
  });

  it("bannière favoris affichée quand incomingFavoritesCount > 0", () => {
    setup({ incomingFavoritesCount: 3 });
    expect(screen.getByText(/3 personnes t'a ajouté en favori\./)).toBeInTheDocument();
  });

  it("« Charger plus » visible seulement si notifHasMore, appelle setNotifLimit", async () => {
    const user = userEvent.setup();
    const { props, rerender } = setup({ notifHasMore: false });
    expect(screen.queryByRole("button", { name: "Charger plus" })).toBeNull();
    rerender(<NotificationsDropdown {...baseProps({ notifHasMore: true, incomingFavoritesCount: 1, setNotifLimit: props.setNotifLimit })} />);
    const loadMore = screen.getByRole("button", { name: "Charger plus" });
    await user.click(loadMore);
    expect(props.setNotifLimit).toHaveBeenCalledTimes(1);
  });

  // Bug corrigé à l'audit (états vides) : sélectionner une catégorie sans
  // aucune notification de ce type, alors que d'autres catégories en ont,
  // rendait un panneau totalement vide (juste les pastilles au-dessus d'un
  // espace blanc) au lieu d'un message clair — l'état vide n'était calculé
  // qu'à partir de la liste globale, jamais par catégorie sélectionnée.
  it("catégorie sélectionnée sans notification : message dédié, pas un panneau vide", () => {
    const message = {
      id: "n1",
      type: "new_message",
      target_id: "profile-1",
      actor: { name: "Awa" },
      created_at: "2024-01-01T00:00:00Z",
    };
    setup({
      notifCategory: "follows",
      unreadMessageNotifications: [message],
      visibleCommunityNotifications: [message],
    });
    expect(screen.getByText("Aucune notification dans cette catégorie.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nouveau message de Awa/ })).toBeNull();
  });

  it("« Charger plus » reste disponible sur une catégorie vide s'il peut encore y avoir des résultats", async () => {
    const user = userEvent.setup();
    const message = {
      id: "n1",
      type: "new_message",
      target_id: "profile-1",
      actor: { name: "Awa" },
      created_at: "2024-01-01T00:00:00Z",
    };
    const { props } = setup({
      notifCategory: "follows",
      unreadMessageNotifications: [message],
      visibleCommunityNotifications: [message],
      notifHasMore: true,
    });
    expect(screen.getByText("Aucune notification dans cette catégorie.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Charger plus" }));
    expect(props.setNotifLimit).toHaveBeenCalledTimes(1);
  });
});
