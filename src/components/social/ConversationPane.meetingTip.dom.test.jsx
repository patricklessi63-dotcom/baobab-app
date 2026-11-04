import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConversationPane from "./ConversationPane";
import { MEETING_TIP_MESSAGE } from "../../lib/meetingTips";

// Conseils de sécurité avant une première rencontre (prompt 05, point 4) : rappel non bloquant,
// calculé localement sur le brouillon, masquable, jamais en même temps que le rappel des
// coordonnées (qui parle déjà de lieu public).
function renderPane(messageDraft, overrides = {}) {
  return render(
    <ConversationPane
      activeMatch={{ id: "m1", name: "Awa", city: "Paris" }}
      currentUser={{ id: "u1", name: "Moi", city: "Paris" }}
      otherTyping={false}
      messages={[]}
      hasMoreHistory={false}
      loadingOlder={false}
      onLoadOlder={vi.fn()}
      messageDraft={messageDraft}
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
      {...overrides}
    />
  );
}

describe("ConversationPane — conseil avant une première rencontre", () => {
  it("affiche le conseil quand le brouillon exprime une intention de rencontre", () => {
    renderPane("On se voit samedi ?");
    expect(screen.getByRole("note")).toHaveTextContent(MEETING_TIP_MESSAGE);
  });

  it("n'affiche rien pour un brouillon ordinaire ou vide", () => {
    const { unmount } = renderPane("Salut, ça va ?");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    unmount();
    renderPane("");
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("peut être ignoré, sans bloquer l'écriture du message", () => {
    renderPane("On se voit samedi ?");
    fireEvent.click(screen.getByLabelText("Ignorer ce conseil de sécurité"));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Écrire un message")).toBeInTheDocument();
  });

  it("cède la place au rappel des coordonnées (un seul rappel à la fois)", () => {
    renderPane("On se voit samedi ? Mon numéro : 514-555-0199");
    expect(screen.getByText(/Sur le point de partager tes coordonnées/)).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it("n'apparaît pas pour un compte indisponible (pas de barre de saisie)", () => {
    renderPane("On se voit samedi ?", { activeMatch: { id: "m1", name: "Awa", city: "Paris", banned_at: "2026-10-01T00:00:00.000Z" } });
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});
