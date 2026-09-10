import { describe, it, expect } from "vitest";
import {
  COMMUNITY_CATEGORIES,
  COMMUNITY_VISIBILITY,
  COMMUNITY_ROLES,
  categoryLabel,
  categoryIcon,
  categoryLabelForReport,
  roleLabel,
} from "./communityConfig.js";

describe("communityConfig", () => {
  it("categoryLabel / categoryIcon connus", () => {
    expect(categoryLabel("technologie")).toBe("Technologie");
    expect(categoryIcon("vie_au_canada")).toBe("🇨🇦");
  });

  it("categoryLabel inconnu -> valeur brute ; categoryIcon inconnu -> 🌍", () => {
    expect(categoryLabel("xyz")).toBe("xyz");
    expect(categoryIcon("xyz")).toBe("🌍");
  });

  it("categoryLabelForReport", () => {
    expect(categoryLabelForReport("usurpation")).toBe("Usurpation d'identité");
    expect(categoryLabelForReport("xyz")).toBe("xyz");
  });

  it("roleLabel connu et repli", () => {
    expect(roleLabel("owner")).toBe("Propriétaire");
    expect(roleLabel("moderator")).toBe("Modérateur");
    expect(roleLabel("xyz")).toBe("xyz");
  });

  it("structure des constantes", () => {
    expect(COMMUNITY_CATEGORIES.every((c) => c.value && c.label && c.icon)).toBe(true);
    expect(COMMUNITY_VISIBILITY.map((v) => v.value)).toEqual(["public", "private", "invite_only"]);
    expect(COMMUNITY_ROLES.map((r) => r.value)).toEqual(["owner", "admin", "moderator", "member"]);
  });
});
