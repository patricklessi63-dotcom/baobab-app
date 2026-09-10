import { describe, it, expect } from "vitest";
import {
  isEventStaff,
  isEventMod,
  canEditEvent,
  canManageEventStaff,
  canCancelEvent,
  canSetEventRole,
  canRemoveEventStaff,
} from "./permissions.js";

describe("events/permissions", () => {
  it("isEventStaff : organizer et co_organizer uniquement", () => {
    expect(isEventStaff("organizer")).toBe(true);
    expect(isEventStaff("co_organizer")).toBe(true);
    expect(isEventStaff("moderator")).toBe(false);
    expect(isEventStaff(null)).toBe(false);
  });

  it("isEventMod : organizer, co_organizer, moderator", () => {
    expect(isEventMod("moderator")).toBe(true);
    expect(isEventMod("organizer")).toBe(true);
    expect(isEventMod("participant")).toBe(false);
    expect(isEventMod(undefined)).toBe(false);
  });

  it("canEditEvent / canCancelEvent = staff", () => {
    expect(canEditEvent("co_organizer")).toBe(true);
    expect(canEditEvent("moderator")).toBe(false);
    expect(canCancelEvent("organizer")).toBe(true);
    expect(canCancelEvent("moderator")).toBe(false);
  });

  it("canManageEventStaff : organizer seul", () => {
    expect(canManageEventStaff("organizer")).toBe(true);
    expect(canManageEventStaff("co_organizer")).toBe(false);
  });

  describe("canSetEventRole", () => {
    it("organizer peut tout attribuer", () => {
      expect(canSetEventRole("organizer", "organizer")).toBe(true);
      expect(canSetEventRole("organizer", "moderator")).toBe(true);
    });
    it("co_organizer ne peut attribuer que moderator", () => {
      expect(canSetEventRole("co_organizer", "moderator")).toBe(true);
      expect(canSetEventRole("co_organizer", "co_organizer")).toBe(false);
      expect(canSetEventRole("co_organizer", "organizer")).toBe(false);
    });
    it("moderator ne peut rien attribuer", () => {
      expect(canSetEventRole("moderator", "moderator")).toBe(false);
    });
  });

  describe("canRemoveEventStaff", () => {
    it("se retirer soi-même : permis sauf si organizer", () => {
      expect(canRemoveEventStaff("moderator", "moderator", true)).toBe(true);
      expect(canRemoveEventStaff("organizer", "organizer", true)).toBe(false);
    });
    it("retirer autrui : réservé à l'organizer", () => {
      expect(canRemoveEventStaff("organizer", "co_organizer", false)).toBe(true);
      expect(canRemoveEventStaff("co_organizer", "moderator", false)).toBe(false);
      expect(canRemoveEventStaff("moderator", "moderator", false)).toBe(false);
    });
  });
});
