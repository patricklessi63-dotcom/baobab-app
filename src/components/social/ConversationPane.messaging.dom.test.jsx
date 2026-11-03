import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

// Messagerie — fonctions ajoutées à l'audit du 1er nov. 2026 :
// indicateur « enregistre un message vocal », séparateurs de jour fiables,
// aperçus de réponse lisibles (Photo / Message vocal…) et cliquables, appui
// long (tactile), mode sélection multiple, transfert, galerie de photos,
// chargement automatique de l'historique en remontant.

vi.mock("../../hooks/useSignedMediaUrl", () => ({
  useSignedMediaUrl: (path) => ({ url: path ? `https://signed.test/${path}` : null, refresh: () => false }),
}));
vi.mock("../../lib/signedUrlCache", () => ({
  getSignedUrl: vi.fn(async (path) => `https://signed.test/${path}`),
  getSignedUrls: vi.fn(),
}));

import ConversationPane from "./ConversationPane";

// Rendu lourd : sous charge (suite complète + build en parallèle) le délai par défaut de 5 s est
// dépassé par intermittence. Les attentes passent par findBy* plutôt que par un rendu synchrone.
vi.setConfig({ testTimeout: 30000 });
import { ImageLightboxProvider } from "../../lib/ImageLightboxContext";

const me = { id: "u1", name: "Moi" };
const other = { id: "m1", name: "Awa" };
const base = { match_key: "m1__u1", deleted_at: null, deleted_for: [] };
const text = (id, from, t, iso = "2026-10-29T10:00:00.000Z", extra = {}) => ({ ...base, id, from_id: from, kind: "text", text: t, created_at: iso, ...extra });

function renderPane(overrides = {}) {
  const props = {
    activeMatch: other,
    currentUser: me,
    otherTyping: false,
    messages: [],
    hasMoreHistory: false,
    loadingOlder: false,
    onLoadOlder: vi.fn(),
    messageDraft: "",
    setMessageDraft: vi.fn(),
    broadcastTyping: vi.fn(),
    sendMessage: vi.fn(),
    sendStickerMessage: vi.fn(),
    sendMediaMessage: vi.fn(),
    retrySend: vi.fn(),
    onBack: vi.fn(),
    onOpenReport: vi.fn(),
    onOpenBlockConfirm: vi.fn(),
    onViewProfile: vi.fn(),
    replyingTo: null,
    setReplyingTo: vi.fn(),
    deleteMessageForMe: vi.fn(),
    forwardTargets: [other, { id: "m2", name: "Binta" }, { id: "m3", name: "Cheikh", banned_at: "2026-10-01T00:00:00Z" }],
    forwardMessages: vi.fn(async () => ({ sent: 1, failed: 0 })),
    showSuccessNotice: vi.fn(),
    ...overrides,
  };
  const utils = render(<ImageLightboxProvider><ConversationPane {...props} /></ImageLightboxProvider>);
  return { ...utils, props };
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => { vi.useRealTimers(); });

describe("ConversationPane — présence", () => {
  it("affiche « enregistre un message vocal » quand l'autre personne enregistre", () => {
    renderPane({ otherTyping: "recording" });
    expect(screen.getByText(/enregistre un message vocal/)).toBeInTheDocument();
    expect(screen.queryByText(/en train d'écrire/)).toBeNull();
  });
  it("affiche « en train d'écrire » pour la frappe", () => {
    renderPane({ otherTyping: "typing" });
    expect(screen.getByText(/en train d'écrire/)).toBeInTheDocument();
  });
});

describe("ConversationPane — séparateurs de jour", () => {
  it("sépare le 3 mars 2025 du 3 mars 2026 (même libellé sans l'année)", () => {
    renderPane({ messages: [text(1, "m1", "a", "2025-03-03T12:00:00.000Z"), text(2, "m1", "b", "2026-03-03T12:00:00.000Z")] });
    expect(screen.getByText(/3 mars 2025/)).toBeInTheDocument();
    expect(screen.getByText(/3 mars 2026|^3 mars$/)).toBeInTheDocument();
  });
  it("un seul séparateur pour deux messages du même jour", () => {
    renderPane({ messages: [text(1, "m1", "a", "2026-03-03T09:00:00.000Z"), text(2, "u1", "b", "2026-03-03T09:05:00.000Z")] });
    expect(screen.getAllByText(/3 mars/)).toHaveLength(1);
  });
});

describe("ConversationPane — réponses", () => {
  it("l'aperçu d'un message vocal cité est lisible (« 🎤 Message vocal ») et non « Média »", () => {
    const voice = { ...base, id: 1, from_id: "m1", kind: "audio", media_path: "k/v.m4a", media_meta: { duration: 5 }, created_at: "2026-10-29T10:00:00.000Z" };
    const reply = text(2, "u1", "Reçu", "2026-10-29T10:01:00.000Z", { reply_to_id: 1 });
    renderPane({ messages: [voice, reply] });
    expect(screen.getByText("↳ 🎤 Message vocal")).toBeInTheDocument();
    expect(screen.queryByText(/Média/)).toBeNull();
  });
  it("toucher l'aperçu saute au message cité et le met en évidence", () => {
    const original = text(1, "m1", "Le message d'origine");
    const reply = text(2, "u1", "Ma réponse", "2026-10-29T10:01:00.000Z", { reply_to_id: 1 });
    renderPane({ messages: [original, reply] });
    fireEvent.click(screen.getByRole("button", { name: "Aller au message cité" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const target = document.querySelector('[data-message-id="1"]');
    expect(target.style.outline).toContain("2px solid");
  });
});

describe("ConversationPane — menu d'un message tout en bas", () => {
  // Régression : le menu (position absolue sous le message) dépassait de la zone
  // visible et rien ne le faisait défiler, car on visait son enveloppe sans hauteur.
  it("ouvrir « Options du message » fait défiler le MENU dans la vue (pas son enveloppe vide)", async () => {
    renderPane({ messages: [text(1, "m1", "Dernier message")] });
    fireEvent.click(screen.getByRole("button", { name: "Options du message" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await vi.waitFor(() => {
      const targets = Element.prototype.scrollIntoView.mock.contexts;
      expect(targets.some((el) => el?.getAttribute?.("role") === "menu")).toBe(true);
    });
  });
});

describe("ConversationPane — réactions", () => {
  it("les pastilles sont étiquetées (emoji, nombre, la mienne) et regroupent les identiques", () => {
    const msg = text(1, "m1", "Salut");
    renderPane({
      messages: [msg],
      reactionsByMessageId: { 1: [{ message_id: 1, profile_id: "m1", emoji: "❤️" }, { message_id: 1, profile_id: "u1", emoji: "❤️" }] },
    });
    const chip = screen.getByRole("button", { name: /Réaction ❤️ ×2, la tienne/ });
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("ConversationPane — appui long (tactile)", () => {
  it("un appui de 450 ms ouvre le menu du message ; un doigt qui bouge l'annule", () => {
    vi.useFakeTimers();
    renderPane({ messages: [text(1, "m1", "Salut")] });
    const row = document.querySelector('[data-message-id="1"]');
    fireEvent.touchStart(row);
    fireEvent.touchMove(row);
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.touchStart(row);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getByRole("menuitem", { name: /Répondre/ })).toBeInTheDocument();
  });
});

describe("ConversationPane — sélection multiple", () => {
  async function openMenu(index) {
    fireEvent.click((await screen.findAllByRole("button", { name: "Options du message" }))[index]);
  }
  it("Sélectionner → barre « N sélectionnés », bascule au toucher, suppression pour moi après confirmation", async () => {
    const { props } = renderPane({ messages: [text(1, "m1", "Un"), text(2, "u1", "Deux", "2026-10-29T10:01:00.000Z"), text(3, "m1", "Trois", "2026-10-29T10:02:00.000Z")] });
    await openMenu(0);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Sélectionner/ }));
    expect(screen.getByText("1 sélectionné")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-message-id="2"]'));
    expect(screen.getByText("2 sélectionnés")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-message-id="2"]')); // retire
    expect(screen.getByText("1 sélectionné")).toBeInTheDocument();
    fireEvent.click(document.querySelector('[data-message-id="3"]'));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer pour moi les messages sélectionnés" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Supprimer 2 messages pour toi/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Supprimer" })); });
    expect(props.deleteMessageForMe).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/sélectionné/)).toBeNull(); // mode quitté
  });
  it("désélectionner le dernier message quitte le mode ; Annuler aussi", async () => {
    renderPane({ messages: [text(1, "m1", "Un")] });
    await openMenu(0);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Sélectionner/ }));
    fireEvent.click(document.querySelector('[data-message-id="1"]'));
    expect(screen.queryByText(/sélectionné/)).toBeNull();
  });
  it("Copier réunit les textes sélectionnés", async () => {
    const writeText = vi.fn();
    Object.assign(navigator, { clipboard: { writeText } });
    renderPane({ messages: [text(1, "m1", "Un"), text(2, "u1", "Deux", "2026-10-29T10:01:00.000Z")] });
    await openMenu(0);
    fireEvent.click(await screen.findByRole("menuitem", { name: /Sélectionner/ }));
    fireEvent.click(document.querySelector('[data-message-id="2"]'));
    fireEvent.click(screen.getByRole("button", { name: "Copier les messages sélectionnés" }));
    expect(writeText).toHaveBeenCalledWith("Un\nDeux");
  });
});

describe("ConversationPane — transfert", () => {
  it("liste les autres conversations disponibles (ni l'actuelle, ni un compte banni) et transfère", async () => {
    const msg = text(1, "m1", "À transférer");
    const { props } = renderPane({ messages: [msg] });
    fireEvent.click(screen.getByRole("button", { name: "Options du message" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Transférer/ }));
    const dialog = screen.getByRole("dialog", { name: /Transférer le message/ });
    expect(within(dialog).getByRole("listitem", { name: "Transférer à Binta" })).toBeInTheDocument();
    expect(within(dialog).queryByText("Awa")).toBeNull(); // conversation actuelle exclue
    expect(within(dialog).queryByText("Cheikh")).toBeNull(); // banni exclu
    await act(async () => { fireEvent.click(within(dialog).getByRole("listitem", { name: "Transférer à Binta" })); });
    expect(props.forwardMessages).toHaveBeenCalledWith({ id: "m2", name: "Binta" }, [msg]);
    expect(props.showSuccessNotice).toHaveBeenCalledWith("Message transféré à Binta.", 4000);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("un transfert entièrement échoué laisse la modale ouverte pour réessayer", async () => {
    const { props } = renderPane({ messages: [text(1, "m1", "x")], forwardMessages: vi.fn(async () => ({ sent: 0, failed: 1 })) });
    fireEvent.click(screen.getByRole("button", { name: "Options du message" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /Transférer/ }));
    await act(async () => { fireEvent.click(screen.getByRole("listitem", { name: "Transférer à Binta" })); });
    expect(props.showSuccessNotice).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /Transférer/ })).toBeInTheDocument();
  });
  it("affiche « Transféré » sur un message transféré", () => {
    renderPane({ messages: [text(1, "u1", "Info", "2026-10-29T10:00:00.000Z", { media_meta: { forwarded: true } })] });
    expect(screen.getByText("Transféré")).toBeInTheDocument();
  });
});

describe("ConversationPane — photos : galerie", () => {
  it("toucher une photo ouvre la visionneuse sur TOUTES les photos de la conversation", async () => {
    const photo = (id, iso) => ({ ...base, id, from_id: "m1", kind: "image", media_path: `k/p${id}.jpg`, media_meta: { width: 800, height: 600, original_name: `p${id}.jpg` }, created_at: iso });
    renderPane({ messages: [photo(1, "2026-10-29T10:00:00.000Z"), text(2, "u1", "au milieu", "2026-10-29T10:01:00.000Z"), photo(3, "2026-10-29T10:02:00.000Z"), photo(4, "2026-10-29T10:03:00.000Z")] });
    const imgs = screen.getAllByRole("button", { name: "Agrandir la photo" });
    expect(imgs).toHaveLength(3);
    await act(async () => { fireEvent.click(imgs[1]); });
    const viewer = await screen.findByRole("dialog", { name: /p3\.jpg/ });
    expect(within(viewer).getByText("2 / 3")).toBeInTheDocument();
  });
});

describe("ConversationPane — historique", () => {
  it("charge automatiquement les messages précédents en remontant en haut du fil", () => {
    const { props } = renderPane({ hasMoreHistory: true, messages: [text(1, "m1", "a")] });
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
    log.scrollTop = 40;
    fireEvent.scroll(log);
    expect(props.onLoadOlder).toHaveBeenCalledTimes(1);
  });
  it("ne recharge pas si un chargement est déjà en cours", () => {
    const { props } = renderPane({ hasMoreHistory: true, loadingOlder: true, messages: [text(1, "m1", "a")] });
    const log = screen.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 400 });
    log.scrollTop = 0;
    fireEvent.scroll(log);
    expect(props.onLoadOlder).not.toHaveBeenCalled();
  });
});

describe("ConversationPane — recherche : surlignage", () => {
  it("surligne les occurrences (sans tenir compte des accents) et ne garde que les messages correspondants", () => {
    renderPane({ messages: [text(1, "m1", "Un bon Café ce matin"), text(2, "u1", "Rien à voir", "2026-10-29T10:01:00.000Z")] });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher dans la conversation" }));
    fireEvent.change(screen.getByLabelText("Rechercher dans cette conversation"), { target: { value: "cafe" } });
    const marks = document.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe("Café");
    expect(screen.queryByText("Rien à voir")).toBeNull();
    expect(screen.getByText("1 résultat")).toBeInTheDocument();
  });
  it("ne surligne plus rien une fois la recherche fermée", () => {
    renderPane({ messages: [text(1, "m1", "Un bon Café")] });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher dans la conversation" }));
    fireEvent.change(screen.getByLabelText("Rechercher dans cette conversation"), { target: { value: "bon" } });
    expect(document.querySelectorAll("mark")).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button", { name: "Fermer la recherche" })[0]);
    expect(document.querySelectorAll("mark")).toHaveLength(0);
  });
});
