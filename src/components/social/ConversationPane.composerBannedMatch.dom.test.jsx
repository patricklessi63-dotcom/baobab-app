import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConversationPane from "./ConversationPane";

// Bug corrigé à l'audit (même famille que le correctif ConversationStarters.jsx
// pour un match banni/suspendu, commit "Masque les questions brise-glace...") :
// la barre de composition (emoji, sticker/photo/vidéo, suggestions IA, champ de
// texte, micro/envoi) restait pleinement active pour une conversation dont
// l'autre personne n'est plus disponible (otherUnavailable, déjà affiché dans
// l'en-tête), alors que tout envoi y échouerait de toute façon : la policy RLS
// INSERT de "messages" (supabase-target-account-state-guards-CONSOLIDATED-
// fix.sql) vérifie banned_at/suspended_until des DEUX participants, pas
// seulement de l'expéditeur. Le "Réessayer" qui en résulterait retomberait en
// plus sur le message générique "Impossible d'envoyer le message." (un rejet
// RLS, code Postgres 42501, n'est jamais traduit par friendlyDbError, qui ne
// reconnaît que le code P0001 des exceptions applicatives) et échouerait
// indéfiniment à l'identique.
// Le bouton "Répondre" du menu d'actions d'un message est également retiré
// pour la même raison (il configure un bandeau au-dessus d'une barre de
// saisie elle-même masquée), mais PAS "Réagir" : message_reactions_insert_own
// (supabase-content-account-state-block-guards-remaining-fix.sql) ne vérifie
// que l'état de compte de l'ACTEUR et un blocage mutuel, jamais l'état banni/
// suspendu de l'autre participant — une réaction aboutit donc réellement.
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
      toggleReaction={vi.fn()}
      {...overrides}
    />
  );
}

describe("ConversationPane — barre de composition vs compte banni/suspendu", () => {
  it("masque la barre de composition et affiche une explication pour un match banni", () => {
    renderPane({ activeMatch: { id: "m1", name: "Awa", city: "Paris", banned_at: "2026-10-01T00:00:00.000Z" } });

    expect(screen.getByText("Ce compte n'est plus disponible : tu ne peux plus lui écrire.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Écrire un message")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message vocal")).not.toBeInTheDocument();
  });

  it("masque la barre de composition pour un match suspendu (suspension en cours)", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    renderPane({ activeMatch: { id: "m1", name: "Awa", city: "Paris", suspended_until: future } });

    expect(screen.getByText("Ce compte n'est plus disponible : tu ne peux plus lui écrire.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Écrire un message")).not.toBeInTheDocument();
  });

  it("garde la barre de composition active pour un match disponible", () => {
    renderPane();

    expect(screen.getByLabelText("Écrire un message")).toBeInTheDocument();
    expect(screen.queryByText("Ce compte n'est plus disponible : tu ne peux plus lui écrire.")).not.toBeInTheDocument();
  });

  it("retire \"Répondre\" du menu d'actions d'un message pour un match banni, mais garde les réactions rapides", () => {
    const message = { id: 5, from_id: "other", kind: "text", text: "Salut", created_at: new Date().toISOString() };
    renderPane({
      activeMatch: { id: "m1", name: "Awa", city: "Paris", banned_at: "2026-10-01T00:00:00.000Z" },
      messages: [message],
    });

    fireEvent.click(screen.getByLabelText("Options du message"));

    expect(screen.queryByRole("menuitem", { name: /Répondre/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Réagir avec ❤️")).toBeInTheDocument();
  });

  it("garde \"Répondre\" dans le menu d'actions d'un message pour un match disponible", () => {
    const message = { id: 5, from_id: "other", kind: "text", text: "Salut", created_at: new Date().toISOString() };
    renderPane({ messages: [message] });

    fireEvent.click(screen.getByLabelText("Options du message"));

    expect(screen.getByRole("menuitem", { name: /Répondre/ })).toBeInTheDocument();
  });
});
