import { describe, it, expect } from "vitest";
import { hasUsableSession } from "./sessionGuard";

describe("hasUsableSession", () => {
  it("session présente : rattrapage autorisé", async () => {
    const client = { auth: { getSession: async () => ({ data: { session: { access_token: "x" } } }) } };
    expect(await hasUsableSession(client)).toBe(true);
  });
  it("rafraîchissement impossible (session null) : on saute le rattrapage plutôt que de lire en anonyme", async () => {
    const client = { auth: { getSession: async () => ({ data: { session: null }, error: { message: "Failed to fetch" } }) } };
    expect(await hasUsableSession(client)).toBe(false);
  });
  it("client sans auth.getSession ou exception : comportement antérieur (autorisé)", async () => {
    expect(await hasUsableSession({})).toBe(true);
    expect(await hasUsableSession(undefined)).toBe(true);
    expect(await hasUsableSession({ auth: { getSession: async () => { throw new Error("boom"); } } })).toBe(true);
  });
});
