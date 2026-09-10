import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock du client Supabase : on capture les insert dans `client_errors` et on
// simule un visiteur non authentifié (pas de résolution de profile_id).
const { insertMock, getUserMock } = vi.hoisted(() => ({
  insertMock: vi.fn(async () => ({ error: null })),
  getUserMock: vi.fn(async () => ({ data: { user: null } })),
}));

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: insertMock,
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    })),
    auth: { getUser: getUserMock },
  },
}));

import {
  reportError,
  setErrorReportingEnabled,
  __resetErrorReporterForTests,
} from "./errorReporter.js";

beforeEach(() => {
  __resetErrorReporterForTests();
  setErrorReportingEnabled(true); // actif par défaut seulement en prod
  insertMock.mockClear();
  getUserMock.mockClear();
});

describe("reportError — anti-flood", () => {
  it("déduplique : même signature envoyée 2× = 1 seul insert", async () => {
    await reportError({ message: "Boom", stack: "Error: Boom\n  at f (a.js:1:1)" });
    await reportError({ message: "Boom", stack: "Error: Boom\n  at f (a.js:1:1)" });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("messages différents = inserts distincts", async () => {
    await reportError({ message: "A", stack: "at a" });
    await reportError({ message: "B", stack: "at b" });
    expect(insertMock).toHaveBeenCalledTimes(2);
  });

  it("plafonne à 10 rapports par session : le 11e est ignoré", async () => {
    for (let i = 0; i < 15; i++) {
      await reportError({ message: `Erreur ${i}`, stack: `at frame ${i}` });
    }
    expect(insertMock).toHaveBeenCalledTimes(10);
  });
});

describe("reportError — filtrage du bruit", () => {
  it('ignore "Script error." sans pile (bruit CORS)', async () => {
    await reportError({ message: "Script error.", stack: undefined });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rapporte quand même "Script error." si une pile est présente', async () => {
    await reportError({ message: "Script error.", stack: "at real.js:2:2" });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('ignore "ResizeObserver loop ..." (bruit navigateur)', async () => {
    await reportError({
      message: "ResizeObserver loop completed with undelivered notifications.",
    });
    await reportError({ message: "ResizeObserver loop limit exceeded" });
    expect(insertMock).not.toHaveBeenCalled();
  });
});

describe("reportError — robustesse", () => {
  it("ne lève jamais, même si l'insert rejette", async () => {
    insertMock.mockRejectedValueOnce(new Error("réseau"));
    await expect(
      reportError({ message: "X", stack: "at x" })
    ).resolves.toBeUndefined();
  });

  it("n'écrit rien quand le rapport est désactivé (dev local)", async () => {
    setErrorReportingEnabled(false);
    await reportError({ message: "X", stack: "at x" });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("insère les métadonnées attendues (kind, app_version, url…)", async () => {
    await reportError({ message: "Crash", stack: "at c", kind: "react" });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0];
    expect(payload).toMatchObject({ message: "Crash", kind: "react" });
    expect(payload).toHaveProperty("app_version");
    expect(payload).toHaveProperty("url");
    expect(payload).toHaveProperty("user_agent");
    expect(payload.profile_id).toBeNull();
  });
});
