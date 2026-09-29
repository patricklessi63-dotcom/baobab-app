import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConversationPane from "./ConversationPane";

// Bug corrigé à l'audit clavier/focus trap (focus trap 7064f60) : la barre de
// recherche EN CONVERSATION (bouton loupe dans l'en-tête) démonte tout son
// bloc — <input autoFocus> compris — quand on la referme, contrairement à la
// recherche équivalente de SocialShell.jsx dont le <input> reste monté en
// permanence. Fermer via Échap pendant que le focus est sur ce champ (ou sur
// son bouton "Fermer la recherche") laissait donc le focus retomber sur
// <body> — l'utilisateur clavier/lecteur d'écran perdait sa position dans la
// conversation et devait retabuler depuis le début de l'en-tête. Même bug
// que celui déjà identifié et corrigé pour "Options de la conversation"
// (menuOpen) et MessageActionsMenu (openActionsFor) dans ce même fichier via
// useFocusReturn — juste oublié pour cette barre de recherche.
function renderPane(overrides = {}) {
  const activeMatch = { id: "m1", name: "Awa" };
  const currentUser = { id: "u1", name: "Moi" };
  return render(
    <ConversationPane
      activeMatch={activeMatch}
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

describe("ConversationPane — recherche en conversation restaure le focus à la fermeture", () => {
  it("Échap depuis le champ de recherche rend le focus au bouton loupe, jamais à <body>", async () => {
    const user = userEvent.setup();
    renderPane();

    const searchButton = screen.getByRole("button", { name: "Rechercher dans la conversation" });
    await user.click(searchButton);

    const searchInput = await screen.findByPlaceholderText("Rechercher dans cette conversation...");
    // autoFocus déplace déjà le focus ici à l'ouverture ; on tape pour se
    // rapprocher du scénario réel (recherche effectuée) avant de fermer.
    await waitFor(() => expect(searchInput).toHaveFocus());
    await user.type(searchInput, "café");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Rechercher dans cette conversation...")).not.toBeInTheDocument();
    });
    // Avant le correctif, activeElement retombait sur document.body ici —
    // la restauration passe par un requestAnimationFrame (useFocusReturn),
    // d'où le waitFor plutôt qu'une assertion synchrone.
    await waitFor(() => expect(searchButton).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });
});
