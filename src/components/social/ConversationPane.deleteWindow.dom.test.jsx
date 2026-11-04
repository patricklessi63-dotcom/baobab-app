import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConversationPane from "./ConversationPane";

// « Supprimer pour tout le monde » : proposée seulement à l'auteur ET pendant le délai (15 min par
// défaut, SQL-27) ; confirmation avant suppression ; message supprimé affiché « Ce message a été
// supprimé. ». Le serveur reste l'autorité (déclencheur) : voir src/native/messageDeleteWindow.test.js.
const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000).toISOString();

function renderPane(messages, overrides = {}) {
  const deleteMessageForEveryone = vi.fn();
  const utils = render(
    <ConversationPane
      activeMatch={{ id: "m1", name: "Awa", city: "Paris" }}
      currentUser={{ id: "u1", name: "Moi", city: "Paris" }}
      otherTyping={false}
      messages={messages}
      hasMoreHistory={false}
      loadingOlder={false}
      onLoadOlder={vi.fn()}
      messageDraft=""
      setMessageDraft={vi.fn()}
      broadcastTyping={vi.fn()}
      sendMessage={vi.fn()}
      sendStickerMessage={vi.fn()}
      sendMediaMessage={vi.fn()}
      retrySend={vi.fn()}
      onBack={vi.fn()}
      onOpenReport={vi.fn()}
      onOpenBlockConfirm={vi.fn()}
      onViewProfile={vi.fn()}
      replyingTo={null}
      setReplyingTo={vi.fn()}
      toggleReaction={vi.fn()}
      deleteMessageForMe={vi.fn()}
      deleteMessageForEveryone={deleteMessageForEveryone}
      {...overrides}
    />
  );
  return { ...utils, deleteMessageForEveryone };
}

const mine = (id, minutes, extra = {}) => ({ id, from_id: "u1", kind: "text", text: `msg ${id}`, created_at: minutesAgo(minutes), ...extra });
const theirs = (id, minutes) => ({ id, from_id: "other", kind: "text", text: `msg ${id}`, created_at: minutesAgo(minutes) });

describe("ConversationPane — suppression pour tout le monde (délai, confirmation)", () => {
  it("propose l'option à l'auteur dans le délai, avec « Supprimer pour moi » toujours disponible", () => {
    renderPane([mine(1, 5)]);
    fireEvent.click(screen.getByLabelText("Options du message"));
    expect(screen.getByRole("menuitem", { name: /Supprimer pour tout le monde/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Supprimer pour moi/ })).toBeInTheDocument();
  });

  it("n'affiche plus l'option une fois le délai expiré (« pour moi » reste possible)", () => {
    renderPane([mine(1, 30)]);
    fireEvent.click(screen.getByLabelText("Options du message"));
    expect(screen.queryByRole("menuitem", { name: /Supprimer pour tout le monde/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Supprimer pour moi/ })).toBeInTheDocument();
  });

  it("n'affiche jamais l'option pour le message de l'autre personne", () => {
    renderPane([theirs(2, 1)]);
    fireEvent.click(screen.getByLabelText("Options du message"));
    expect(screen.queryByRole("menuitem", { name: /Supprimer pour tout le monde/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Supprimer pour moi/ })).toBeInTheDocument();
  });

  it("demande confirmation avant de supprimer pour tous, et n'agit qu'après confirmation", () => {
    const { deleteMessageForEveryone } = renderPane([mine(1, 2)]);
    fireEvent.click(screen.getByLabelText("Options du message"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Supprimer pour tout le monde/ }));
    expect(screen.getByText(/Voulez-vous vraiment supprimer ce message pour tous les participants \?/)).toBeInTheDocument();
    expect(deleteMessageForEveryone).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(deleteMessageForEveryone).toHaveBeenCalledTimes(1);
    expect(deleteMessageForEveryone.mock.calls[0][0].id).toBe(1);
  });

  it("annuler la confirmation ne supprime rien", () => {
    const { deleteMessageForEveryone } = renderPane([mine(1, 2)]);
    fireEvent.click(screen.getByLabelText("Options du message"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Supprimer pour tout le monde/ }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(deleteMessageForEveryone).not.toHaveBeenCalled();
  });

  it("affiche « Ce message a été supprimé. » à la place du contenu, pour l'auteur comme pour l'autre", () => {
    renderPane([mine(1, 2, { deleted_at: minutesAgo(1), text: "Ce message a été supprimé." }), { ...theirs(2, 3), deleted_at: minutesAgo(1) }]);
    expect(screen.getAllByText("Ce message a été supprimé.")).toHaveLength(2);
    expect(screen.queryByText("msg 2")).not.toBeInTheDocument();
  });
});
