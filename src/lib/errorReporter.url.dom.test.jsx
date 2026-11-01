import { describe, it, expect, beforeEach, vi } from "vitest";

const { insertMock } = vi.hoisted(() => ({ insertMock: vi.fn(async () => ({ error: null })) }));

vi.mock("../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => ({ insert: insertMock, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) })),
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  },
}));

import { reportError, setErrorReportingEnabled, __resetErrorReporterForTests } from "./errorReporter.js";

beforeEach(() => {
  __resetErrorReporterForTests();
  setErrorReportingEnabled(true);
  insertMock.mockClear();
});

// Le lien de réinitialisation de mot de passe porte #access_token=… : il ne doit jamais
// être écrit dans client_errors (table lisible par les modérateurs).
describe("reportError — URL rapportée", () => {
  it("n'envoie ni fragment (#access_token) ni paramètres (?code)", async () => {
    window.history.pushState({}, "", "/nouveau-mot-de-passe?code=abc123#access_token=SECRET&type=recovery");
    await reportError({ message: "Crash", stack: "at c" });
    const { url } = insertMock.mock.calls[0][0];
    expect(url).toMatch(/\/nouveau-mot-de-passe$/);
    expect(url).not.toMatch(/SECRET|access_token|code=|abc123|#|\?/);
  });
});
