import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConversationPane from "./ConversationPane";

// Bug corrigé à l'audit de ConversationStarters.jsx : ce composant (questions
// brise-glace affichées quand la conversation est vide) ne consultait pas
// banned_at/suspended_until, pourtant déjà vérifiés juste au-dessus pour le
// statut "En ligne"/"Vu il y a X" (otherUnavailable) et dans MessagesTab.jsx.
// Pour un match mutuel tout juste créé (aucun message échangé) dont l'autre
// personne est bannie ou suspendue entre-temps, l'en-tête affichait déjà
// "Ce compte n'est plus disponible" pendant que cette zone proposait quand
// même des questions pour engager une conversation avec un compte qui ne
// répondra jamais.
function renderPane(overrides = {}) {
  const currentUser = { id: "u1", name: "Moi", city: "Paris" };
  return render(
    <ConversationPane
      activeMatch={{ id: "m1", name: "Awa", city: "Paris" }}
      currentUser={currentUser}
      otherTyping={false}
      messages={[]}
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
      {...overrides}
    />
  );
}

describe("ConversationPane — questions brise-glace vs compte banni/suspendu", () => {
  it("n'affiche pas de question brise-glace pour un match banni, même sans aucun message échangé", () => {
    renderPane({ activeMatch: { id: "m1", name: "Awa", city: "Paris", banned_at: "2026-10-01T00:00:00.000Z" } });

    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
    expect(screen.queryByText("Question pour briser la glace")).not.toBeInTheDocument();
    expect(screen.queryByText(/Vous êtes tous les deux à Paris/)).not.toBeInTheDocument();
  });

  it("n'affiche pas de question brise-glace pour un match suspendu (suspension en cours)", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderPane({ activeMatch: { id: "m1", name: "Awa", city: "Paris", suspended_until: future } });

    expect(screen.getByText("Ce compte n'est plus disponible")).toBeInTheDocument();
    expect(screen.queryByText("Question pour briser la glace")).not.toBeInTheDocument();
  });

  it("affiche toujours la question brise-glace pour un match disponible sans message échangé", () => {
    renderPane();

    expect(screen.getByText("Question pour briser la glace")).toBeInTheDocument();
    expect(screen.getByText(/Vous êtes tous les deux à Paris/)).toBeInTheDocument();
  });
});
