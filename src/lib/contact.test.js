import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cleanSupportEmail, cleanOperatorName, SUPPORT_EMAIL, OPERATOR_NAME } from "./contact";

describe("coordonnées publiques (src/config/contact.json)", () => {
  it("accepte une adresse valide et la nettoie", () => {
    expect(cleanSupportEmail("  aide@example.org ")).toBe("aide@example.org");
  });

  it("rejette tout ce qui n'est pas une adresse simple (jamais d'injection dans un lien mailto)", () => {
    for (const bad of ["", "   ", "pas-une-adresse", "a@b", "a b@c.d", "x@y.z,evil@e.f", "<a@b.c>", "a@b.co?cc=x", "a@b.co?subject=x&bcc=y", "a@b.co#x", "a@b.co/x", 42, null, undefined]) {
      expect(cleanSupportEmail(bad)).toBe("");
    }
  });

  it("nettoie le nom d'exploitant", () => {
    expect(cleanOperatorName("  Exemple Inc. ")).toBe("Exemple Inc.");
    expect(cleanOperatorName(undefined)).toBe("");
    expect(cleanOperatorName("x".repeat(500))).toHaveLength(200);
  });

  it("le fichier de config ne contient que supportEmail et operatorName (chaînes) ; le propriétaire les remplit", () => {
    const raw = JSON.parse(readFileSync(new URL("../config/contact.json", import.meta.url), "utf8"));
    expect(Object.keys(raw).sort()).toEqual(["operatorName", "supportEmail"]);
    expect(typeof raw.supportEmail).toBe("string");
    expect(typeof raw.operatorName).toBe("string");
    // Valeurs effectives = valeurs du fichier, nettoyées (vide si invalide).
    expect(SUPPORT_EMAIL).toBe(cleanSupportEmail(raw.supportEmail));
    expect(OPERATOR_NAME).toBe(cleanOperatorName(raw.operatorName));
  });
});
