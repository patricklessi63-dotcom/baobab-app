import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_DELETE_WINDOW_MINUTES,
  canDeleteForEveryone,
  getMessageDeleteWindowMinutes,
  setMessageDeleteWindowMinutes,
  loadMessageDeleteWindow,
} from "./messageDeletion";

const NOW = Date.parse("2026-11-04T12:00:00.000Z");
const sentMinutesAgo = (m) => new Date(NOW - m * 60 * 1000).toISOString();
const msg = (extra = {}) => ({ id: 1, kind: "text", text: "salut", created_at: sentMinutesAgo(5), ...extra });

beforeEach(() => setMessageDeleteWindowMinutes(DEFAULT_DELETE_WINDOW_MINUTES));

describe("canDeleteForEveryone — affichage de l'option", () => {
  it("proposée à l'auteur dans le délai (15 min par défaut)", () => {
    expect(canDeleteForEveryone(msg(), { isMine: true, nowMs: NOW })).toBe(true);
    expect(canDeleteForEveryone(msg({ created_at: sentMinutesAgo(15) }), { isMine: true, nowMs: NOW })).toBe(true);
  });

  it("masquée après le délai", () => {
    expect(canDeleteForEveryone(msg({ created_at: sentMinutesAgo(16) }), { isMine: true, nowMs: NOW })).toBe(false);
  });

  it("jamais proposée au destinataire", () => {
    expect(canDeleteForEveryone(msg(), { isMine: false, nowMs: NOW })).toBe(false);
  });

  it("masquée si déjà supprimée pour tous", () => {
    expect(canDeleteForEveryone(msg({ deleted_at: "2026-11-04T11:58:00.000Z" }), { isMine: true, nowMs: NOW })).toBe(false);
  });

  it("masquée tant que le message n'est pas enregistré (envoi en cours ou échoué)", () => {
    for (const s of ["sending", "uploading", "failed"]) {
      expect(canDeleteForEveryone(msg({ _status: s }), { isMine: true, nowMs: NOW })).toBe(false);
    }
  });

  it("masquée si la date d'envoi est absente ou invalide", () => {
    expect(canDeleteForEveryone(msg({ created_at: undefined }), { isMine: true, nowMs: NOW })).toBe(false);
    expect(canDeleteForEveryone(msg({ created_at: "pas une date" }), { isMine: true, nowMs: NOW })).toBe(false);
    expect(canDeleteForEveryone(null, { isMine: true, nowMs: NOW })).toBe(false);
  });

  it("respecte le délai configuré côté serveur", () => {
    setMessageDeleteWindowMinutes(60);
    expect(canDeleteForEveryone(msg({ created_at: sentMinutesAgo(45) }), { isMine: true, nowMs: NOW })).toBe(true);
    setMessageDeleteWindowMinutes(2);
    expect(canDeleteForEveryone(msg(), { isMine: true, nowMs: NOW })).toBe(false);
  });
});

describe("délai lu côté serveur", () => {
  it("valeurs hors bornes ou invalides : retour au défaut", () => {
    for (const bad of [0, -5, 20000, "abc", null, undefined, NaN]) {
      expect(setMessageDeleteWindowMinutes(bad)).toBe(DEFAULT_DELETE_WINDOW_MINUTES);
    }
    expect(setMessageDeleteWindowMinutes(30)).toBe(30);
    expect(getMessageDeleteWindowMinutes()).toBe(30);
  });

  const clientWith = (result) => ({
    from: () => ({ select: () => ({ limit: () => ({ maybeSingle: async () => result }) }) }),
  });

  it("charge la valeur de app_config", async () => {
    expect(await loadMessageDeleteWindow(clientWith({ data: { message_delete_window_minutes: 45 }, error: null }))).toBe(45);
    expect(getMessageDeleteWindowMinutes()).toBe(45);
  });

  it("ne lève jamais : colonne absente (SQL-27 non exécuté), erreur réseau ou client incomplet", async () => {
    expect(await loadMessageDeleteWindow(clientWith({ data: null, error: { code: "42703" } }))).toBe(DEFAULT_DELETE_WINDOW_MINUTES);
    expect(await loadMessageDeleteWindow({ from: () => { throw new Error("réseau"); } })).toBe(DEFAULT_DELETE_WINDOW_MINUTES);
    expect(await loadMessageDeleteWindow({})).toBe(DEFAULT_DELETE_WINDOW_MINUTES);
  });
});
