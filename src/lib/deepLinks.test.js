import { describe, it, expect } from "vitest";
import { parseDeepLink, parseAuthLink } from "./deepLinks";

const ORIGIN = "https://baobab-app-zeta.vercel.app";
const UUID = "123e4567-e89b-42d3-a456-426614174000";

describe("parseDeepLink — liens valides", () => {
  it.each(["event", "community", "profile", "messages"])("accepte /%s/<uuid> (URL absolue du domaine public)", (kind) => {
    expect(parseDeepLink(`${ORIGIN}/${kind}/${UUID}`, ORIGIN)).toEqual({ kind, id: UUID });
  });

  it("accepte le chemin relatif posé par send-push dans data.url", () => {
    expect(parseDeepLink(`/messages/${UUID}`, ORIGIN)).toEqual({ kind: "messages", id: UUID });
    expect(parseDeepLink(`/profile/${UUID}`, ORIGIN)).toEqual({ kind: "profile", id: UUID });
  });

  it("normalise l'uuid en minuscules, tolère le « / » final, ignore requête et fragment", () => {
    expect(parseDeepLink(`${ORIGIN}/event/${UUID.toUpperCase()}/?utm=1#x`, ORIGIN)).toEqual({ kind: "event", id: UUID });
  });
});

describe("parseDeepLink — refus (liste blanche stricte)", () => {
  const refused = {
    "autre domaine": `https://evil.example/event/${UUID}`,
    "sous-domaine": `https://x.baobab-app-zeta.vercel.app/event/${UUID}`,
    "domaine préfixé": `https://baobab-app-zeta.vercel.app.evil.example/event/${UUID}`,
    "schéma http": `http://baobab-app-zeta.vercel.app/event/${UUID}`,
    "schéma personnalisé": `baobab://event/${UUID}`,
    "javascript:": "javascript:alert(1)",
    "data:": "data:text/html,<script>alert(1)</script>",
    "nom d'utilisateur dans l'URL": `https://baobab-app-zeta.vercel.app@evil.example/event/${UUID}`,
    "identifiant d'utilisateur + mot de passe": `https://a:b@baobab-app-zeta.vercel.app/event/${UUID}`,
    "relatif protocole (//)": `//evil.example/event/${UUID}`,
    "relatif avec antislash": `/\\evil.example/event/${UUID}`,
    "id non uuid": `${ORIGIN}/event/42`,
    "id injection SQL": `${ORIGIN}/event/${encodeURIComponent("1' or '1'='1")}`,
    "id avec chemin": `${ORIGIN}/event/${UUID}/../../admin`,
    "id encodé": `${ORIGIN}/event/${encodeURIComponent(UUID + "%2e")}`,
    "chemin inconnu": `${ORIGIN}/admin/${UUID}`,
    "chemin sans id": `${ORIGIN}/event/`,
    "chemin trop profond": `${ORIGIN}/event/${UUID}/edit`,
    "racine": `${ORIGIN}/`,
    "page publique": `${ORIGIN}/a-propos`,
    "chaîne vide": "",
    "trop long": `${ORIGIN}/event/${UUID}?x=${"a".repeat(3000)}`,
    "pas une chaîne (objet)": { url: "x" },
    "pas une chaîne (null)": null,
    "pas une chaîne (undefined)": undefined,
    "pas une chaîne (nombre)": 5,
  };
  it.each(Object.entries(refused))("refuse : %s", (_label, input) => {
    expect(parseDeepLink(input, ORIGIN)).toBeNull();
  });

  it("suit l'origine configurée (un seul endroit pour changer de domaine)", () => {
    expect(parseDeepLink(`https://autre-domaine.ca/event/${UUID}`, "https://autre-domaine.ca")).toEqual({ kind: "event", id: UUID });
    expect(parseDeepLink(`${ORIGIN}/event/${UUID}`, "https://autre-domaine.ca")).toBeNull();
  });
});

describe("parseAuthLink", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJl";

  it("lien de réinitialisation : jetons du fragment", () => {
    const url = `${ORIGIN}/update-password#access_token=${jwt}&expires_in=3600&refresh_token=abcdef123456&token_type=bearer&type=recovery`;
    expect(parseAuthLink(url, ORIGIN)).toEqual({ type: "recovery", accessToken: jwt, refreshToken: "abcdef123456" });
  });

  it("refuse un lien de réinitialisation incomplet, d'un autre type, ou d'un autre domaine", () => {
    expect(parseAuthLink(`${ORIGIN}/update-password#access_token=${jwt}&type=recovery`, ORIGIN)).toBeNull();
    expect(parseAuthLink(`${ORIGIN}/update-password#access_token=${jwt}&refresh_token=r&type=signup`, ORIGIN)).toBeNull();
    expect(parseAuthLink(`${ORIGIN}/update-password`, ORIGIN)).toBeNull();
    expect(parseAuthLink(`https://evil.example/update-password#access_token=${jwt}&refresh_token=r&type=recovery`, ORIGIN)).toBeNull();
    expect(parseAuthLink(`${ORIGIN}/other#access_token=${jwt}&refresh_token=r&type=recovery`, ORIGIN)).toBeNull();
  });

  it("refuse des jetons contenant des caractères suspects", () => {
    expect(parseAuthLink(`${ORIGIN}/update-password#access_token=${encodeURIComponent("a b<script>")}&refresh_token=r&type=recovery`, ORIGIN)).toBeNull();
  });

  it("confirmation d'e-mail et lien expiré", () => {
    expect(parseAuthLink(`${ORIGIN}/?verified=1`, ORIGIN)).toEqual({ type: "verified" });
    expect(parseAuthLink(`${ORIGIN}/?verified=1#access_token=${jwt}&refresh_token=r&type=signup`, ORIGIN)).toEqual({ type: "verified" });
    expect(parseAuthLink(`${ORIGIN}/#error=access_denied&error_code=otp_expired&error_description=x`, ORIGIN)).toEqual({ type: "error", code: "otp_expired" });
    expect(parseAuthLink(`${ORIGIN}/#error=access_denied&error_code=<script>`, ORIGIN)).toEqual({ type: "error", code: "invalid_link" });
  });

  it("un lien d'entité n'est pas un lien d'authentification et inversement", () => {
    expect(parseAuthLink(`${ORIGIN}/event/${UUID}`, ORIGIN)).toBeNull();
    expect(parseDeepLink(`${ORIGIN}/update-password#access_token=${jwt}&refresh_token=r&type=recovery`, ORIGIN)).toBeNull();
  });

  it("n'accepte que le domaine public (https://domaine@evil et autres)", () => {
    expect(parseAuthLink(`https://baobab-app-zeta.vercel.app@evil.example/?verified=1`, ORIGIN)).toBeNull();
    expect(parseAuthLink(null, ORIGIN)).toBeNull();
    expect(parseAuthLink("x".repeat(9000), ORIGIN)).toBeNull();
  });
});
