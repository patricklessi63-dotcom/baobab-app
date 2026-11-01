import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(), eq: vi.fn(), then: (r) => r({ data: [], error: null }) })),
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import CommunityCreateForm from "./CommunityCreateForm";

afterEach(() => { cleanup(); });

const renderForm = (aiEnabled) => render(
  <CommunityCreateForm aiEnabled={aiEnabled} currentUser={{ id: "u1", user_id: "au1", city: "Montréal" }} onCreated={() => {}} onCancel={() => {}} onError={() => {}} onDirtyChange={() => {}} />
);

describe("CommunityCreateForm — drapeau IA de lancement", () => {
  it("drapeau éteint : aucun bloc « Suggestion IA », le formulaire reste complet", () => {
    renderForm(false);
    expect(screen.queryByText(/Suggestion IA/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Suggérer" })).toBeNull();
    expect(screen.getByText("Image de couverture")).toBeTruthy();
  });

  it("drapeau allumé : le bloc apparaît", () => {
    renderForm(true);
    expect(screen.getByText(/Suggestion IA/)).toBeTruthy();
  });
});
