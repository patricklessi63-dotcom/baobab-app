import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../supabaseClient", () => ({ supabase: {} }));
const usePremiumStatusMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: (...a) => usePremiumStatusMock(...a) }));
const invokeAIMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/ai/aiClient", () => ({ invokeAI: (...a) => invokeAIMock(...a) }));

import AiWritingTools, { POST_DRAFT_KEY_PREFIX } from "./AiWritingTools";
import { setPremiumNavigator, consumePremiumIntent, setPremiumIntent } from "../../lib/premium/premiumIntent";

const user = { id: "u1" };

beforeEach(() => {
  invokeAIMock.mockReset();
  usePremiumStatusMock.mockReturnValue({ isPremium: true, loading: false });
  setPremiumNavigator(null);
  setPremiumIntent(null);
  try { localStorage.clear(); } catch (_) { /* ignore */ }
});

describe("AiWritingTools — abonné", () => {
  it("propose les deux outils, désactivés tant que le texte est vide", () => {
    render(<AiWritingTools currentUser={user} draft="" onApply={vi.fn()} />);
    expect(screen.getByRole("button", { name: /corriger mon texte/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /rédiger à partir de mon idée/i })).toBeDisabled();
  });

  it("'Corriger' envoie l'action correct_text avec le texte, et n'applique qu'après 'Utiliser'", async () => {
    invokeAIMock.mockResolvedValue({ data: { text: "Texte corrigé." }, error: null });
    const onApply = vi.fn();
    render(<AiWritingTools currentUser={user} draft="texte corige" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /corriger mon texte/i }));
    await waitFor(() => expect(invokeAIMock).toHaveBeenCalledWith("correct_text", { text: "texte corige" }));
    expect(await screen.findByText("Texte corrigé.")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled(); // jamais appliqué automatiquement
    fireEvent.click(screen.getByRole("button", { name: /^utiliser$/i }));
    expect(onApply).toHaveBeenCalledWith("Texte corrigé.");
  });

  it("'Rédiger' envoie l'action draft_post", async () => {
    invokeAIMock.mockResolvedValue({ data: { text: "Une publication." }, error: null });
    render(<AiWritingTools currentUser={user} draft="idée de sortie au parc" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /rédiger à partir de mon idée/i }));
    await waitFor(() => expect(invokeAIMock).toHaveBeenCalledWith("draft_post", { text: "idée de sortie au parc" }));
  });

  it("affiche le message du serveur (limite quotidienne) sans rien appliquer", async () => {
    invokeAIMock.mockResolvedValue({ data: null, error: "Tu as utilisé tes 100 suggestions IA des dernières 24 h. Réessaie plus tard.", code: "daily_limit" });
    const onApply = vi.fn();
    render(<AiWritingTools currentUser={user} draft="bonjour" onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /corriger mon texte/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/100 suggestions IA/);
    expect(onApply).not.toHaveBeenCalled();
  });
});

describe("AiWritingTools — compte gratuit", () => {
  beforeEach(() => usePremiumStatusMock.mockReturnValue({ isPremium: false, loading: false }));

  it("un clic n'appelle JAMAIS le service IA : il ouvre la fiche Premium", () => {
    render(<AiWritingTools currentUser={user} draft="bonjour" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /corriger mon texte/i }));
    expect(invokeAIMock).not.toHaveBeenCalled();
    expect(screen.getByText(/corriger l'orthographe et la grammaire/i)).toBeInTheDocument();
    expect(screen.getByText(/améliorer mon texte » reste gratuit/i)).toBeInTheDocument();
  });

  it("'Passer à Premium' garde le texte en brouillon, puis ouvre Premium avec l'intention 'formules'", () => {
    const go = vi.fn();
    setPremiumNavigator(go);
    render(<AiWritingTools currentUser={user} draft="  mon idée à garder  " onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /rédiger à partir de mon idée/i }));
    fireEvent.click(screen.getByRole("button", { name: /^passer à premium$/i }));
    expect(localStorage.getItem(`${POST_DRAFT_KEY_PREFIX}u1`)).toBe("mon idée à garder");
    expect(go).toHaveBeenCalledTimes(1);
    expect(consumePremiumIntent()).toBe("plans");
  });

  it("'Découvrir Premium' ouvre Premium sans intention de défilement", () => {
    const go = vi.fn();
    setPremiumNavigator(go);
    render(<AiWritingTools currentUser={user} draft="idée" onApply={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /corriger mon texte/i }));
    fireEvent.click(screen.getByRole("button", { name: /^découvrir premium$/i }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(consumePremiumIntent()).toBeNull();
  });
});

describe("AiWritingTools — chargement et cohérence", () => {
  it("n'affiche rien pendant la vérification du statut (pas de faux verrou)", () => {
    usePremiumStatusMock.mockReturnValue({ isPremium: false, loading: true });
    const { container } = render(<AiWritingTools currentUser={user} draft="x" onApply={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("la clé de brouillon est la même que celle du composeur (PostsFeed.jsx)", () => {
    const feed = fs.readFileSync(path.join(process.cwd(), "src/components/social/PostsFeed.jsx"), "utf8");
    expect(feed).toContain("`" + POST_DRAFT_KEY_PREFIX + "${currentUser.id}`");
  });
});
