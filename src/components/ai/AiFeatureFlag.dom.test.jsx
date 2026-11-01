import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../lib/ai/aiClient", () => ({ invokeAI: vi.fn() }));
vi.mock("../../supabaseClient", () => ({ supabase: {} }));

import AiSuggestButton from "./AiSuggestButton";
import AiConversationSuggestions from "./AiConversationSuggestions";

afterEach(() => vi.unstubAllEnvs());

// Drapeau de lancement : sans clé IA côté serveur, aucun bouton IA n'est proposé.
describe("Suggestions IA — drapeau VITE_FEATURE_AI", () => {
  it("n'affiche rien quand le drapeau est désactivé", () => {
    vi.stubEnv("VITE_FEATURE_AI", "");
    const a = render(<AiSuggestButton action="improve_post" buildPayload={() => ({})} onApply={() => {}} />);
    const b = render(<AiConversationSuggestions currentUser={{ name: "A" }} match={{ name: "B" }} onPick={() => {}} />);
    expect(a.container).toBeEmptyDOMElement();
    expect(b.container).toBeEmptyDOMElement();
  });

  it("affiche le bouton quand le drapeau est activé", () => {
    vi.stubEnv("VITE_FEATURE_AI", "true");
    const a = render(<AiSuggestButton action="improve_post" buildPayload={() => ({})} onApply={() => {}} />);
    expect(a.container).not.toBeEmptyDOMElement();
  });
});
