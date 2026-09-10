import { describe, it, expect } from "vitest";
import {
  isStaff,
  isMod,
  isMember,
  canManageMembers,
  canModerate,
  canPost,
  canCreateCommunity,
  canSetRole,
  canRemoveMember,
} from "./permissions.js";

describe("communities/permissions", () => {
  it("isStaff : owner / admin", () => {
    expect(isStaff("owner")).toBe(true);
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("moderator")).toBe(false);
  });

  it("isMod : owner / admin / moderator", () => {
    expect(isMod("moderator")).toBe(true);
    expect(isMod("member")).toBe(false);
  });

  it("isMember : n'importe quel rôle truthy", () => {
    expect(isMember("member")).toBe(true);
    expect(isMember(null)).toBe(false);
    expect(isMember(undefined)).toBe(false);
    expect(isMember("")).toBe(false);
  });

  it("canManageMembers = staff, canModerate = mod, canPost = membre", () => {
    expect(canManageMembers("admin")).toBe(true);
    expect(canManageMembers("moderator")).toBe(false);
    expect(canModerate("moderator")).toBe(true);
    expect(canPost("member")).toBe(true);
    expect(canPost(null)).toBe(false);
  });

  it("canCreateCommunity : toujours vrai (utilisateur authentifié)", () => {
    expect(canCreateCommunity()).toBe(true);
  });

  describe("canSetRole", () => {
    it("owner peut tout", () => {
      expect(canSetRole("owner", "admin", "owner")).toBe(true);
      expect(canSetRole("owner", "member", "admin")).toBe(true);
    });
    it("admin : uniquement moderator/member vers moderator/member", () => {
      expect(canSetRole("admin", "member", "moderator")).toBe(true);
      expect(canSetRole("admin", "moderator", "member")).toBe(true);
      expect(canSetRole("admin", "admin", "member")).toBe(false);
      expect(canSetRole("admin", "member", "admin")).toBe(false);
    });
    it("moderator : rien", () => {
      expect(canSetRole("moderator", "member", "member")).toBe(false);
    });
  });

  describe("canRemoveMember", () => {
    it("quitter soi-même : toujours permis", () => {
      expect(canRemoveMember("member", "member", true)).toBe(true);
      expect(canRemoveMember("owner", "owner", true)).toBe(true);
    });
    it("owner retire n'importe qui", () => {
      expect(canRemoveMember("owner", "admin", false)).toBe(true);
    });
    it("admin retire moderator/member seulement", () => {
      expect(canRemoveMember("admin", "member", false)).toBe(true);
      expect(canRemoveMember("admin", "moderator", false)).toBe(true);
      expect(canRemoveMember("admin", "admin", false)).toBe(false);
      expect(canRemoveMember("admin", "owner", false)).toBe(false);
    });
    it("moderator ne retire personne d'autre", () => {
      expect(canRemoveMember("moderator", "member", false)).toBe(false);
    });
  });
});
