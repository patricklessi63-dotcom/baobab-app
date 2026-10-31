import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EventCommentsSection from "./EventCommentsSection";

vi.mock("../../supabaseClient", () => ({ supabase: {} }));

// Clavier IME (chinois, japonais, coréen…) : Entrée valide le candidat en
// cours de composition, elle ne doit pas envoyer le message à moitié écrit.
describe("Commentaires d'événement — Entrée pendant une composition IME", () => {
  const setup = () => {
    const onSubmit = vi.fn();
    render(<EventCommentsSection canPost draft="你好" setDraft={() => {}} onSubmit={onSubmit} comments={[]} currentUserId="me" />);
    return { onSubmit, input: screen.getByPlaceholderText(/Écris un message/) };
  };

  it("n'envoie pas quand Entrée valide une composition", () => {
    const { onSubmit, input } = setup();
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("envoie sur une Entrée normale", () => {
    const { onSubmit, input } = setup();
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
