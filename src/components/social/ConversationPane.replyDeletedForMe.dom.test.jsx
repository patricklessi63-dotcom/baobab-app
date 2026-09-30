import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConversationPane from "./ConversationPane";

// Bug corrigé à l'audit réponses : deleteMessageForMe (App.jsx) ne renseigne
// jamais `deleted_at` — seulement `deleted_for` (masquage propre à l'auteur
// de la suppression). Le message original disparaît bien de la liste
// principale (filtre visibleMessages), mais l'aperçu "↳ ..." d'une réponse
// qui le cite le cherchait dans `messages` (non filtré) et ne testait QUE
// `deleted_at` avant correctif — il réaffichait donc le texte d'origine à
// l'utilisateur qui vient pourtant de le supprimer "pour moi" sur son propre
// écran, contournant sa propre suppression.
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

describe("ConversationPane — aperçu de réponse et message cité supprimé « pour moi »", () => {
  it("affiche « Message supprimé » dans l'aperçu, jamais le texte original, quand le message cité a été supprimé pour moi seul", () => {
    const original = {
      id: 1,
      match_key: "m1_u1",
      from_id: "m1",
      kind: "text",
      text: "Mon numéro est le 0600000000",
      created_at: "2026-09-29T10:00:00.000Z",
      deleted_at: null,
      // Supprimé "pour moi" (deleteMessageForMe) par l'utilisateur courant u1
      // uniquement — jamais deleted_at, voir App.jsx deleteMessageForMe.
      deleted_for: ["u1"],
    };
    const reply = {
      id: 2,
      match_key: "m1_u1",
      from_id: "m1",
      kind: "text",
      text: "D'accord, je note",
      created_at: "2026-09-29T10:01:00.000Z",
      reply_to_id: 1,
      deleted_at: null,
      deleted_for: [],
    };

    renderPane({ messages: [original, reply] });

    // Le message original est bien masqué de la liste principale (filtre
    // visibleMessages sur deleted_for).
    expect(screen.queryByText("Mon numéro est le 0600000000")).not.toBeInTheDocument();
    // Et l'aperçu de citation dans la réponse ne le fait pas fuiter non plus.
    expect(screen.getByText("↳ Message supprimé")).toBeInTheDocument();
  });

  it("affiche toujours le texte original dans l'aperçu quand le message cité n'est pas supprimé", () => {
    const original = {
      id: 1,
      match_key: "m1_u1",
      from_id: "m1",
      kind: "text",
      text: "On se retrouve où ?",
      created_at: "2026-09-29T10:00:00.000Z",
      deleted_at: null,
      deleted_for: [],
    };
    const reply = {
      id: 2,
      match_key: "m1_u1",
      from_id: "u1",
      kind: "text",
      text: "Devant la gare",
      created_at: "2026-09-29T10:01:00.000Z",
      reply_to_id: 1,
      deleted_at: null,
      deleted_for: [],
    };

    renderPane({ messages: [original, reply] });

    expect(screen.getByText("↳ On se retrouve où ?")).toBeInTheDocument();
  });
});
