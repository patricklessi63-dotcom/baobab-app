import { describe, it, expect } from "vitest";
import { isHiddenByDeclinedInvite } from "./invitations";

const priv = { id: "e1", visibility: "private", created_by: "org" };
const base = { declinedIds: new Set(["e1"]), myStatuses: {}, currentUserId: "me" };

describe("isHiddenByDeclinedInvite", () => {
  it("masque un événement privé dont l'invitation a été refusée/révoquée", () => {
    expect(isHiddenByDeclinedInvite(priv, base)).toBe(true);
  });
  it("ne masque pas un événement non refusé", () => {
    expect(isHiddenByDeclinedInvite(priv, { ...base, declinedIds: new Set() })).toBe(false);
  });
  it("ne masque jamais un événement public ou de communauté", () => {
    expect(isHiddenByDeclinedInvite({ ...priv, visibility: "public" }, base)).toBe(false);
    expect(isHiddenByDeclinedInvite({ ...priv, visibility: "community" }, base)).toBe(false);
  });
  it("ne masque pas si la personne y participe malgré tout", () => {
    expect(isHiddenByDeclinedInvite(priv, { ...base, myStatuses: { e1: "going" } })).toBe(false);
    expect(isHiddenByDeclinedInvite(priv, { ...base, myStatuses: { e1: "waitlisted" } })).toBe(false);
  });
  it("masque si le statut de participation est not_going", () => {
    expect(isHiddenByDeclinedInvite(priv, { ...base, myStatuses: { e1: "not_going" } })).toBe(true);
  });
  it("ne masque jamais l'événement de son propre créateur", () => {
    expect(isHiddenByDeclinedInvite({ ...priv, created_by: "me" }, base)).toBe(false);
  });
  it("tolère des entrées absentes", () => {
    expect(isHiddenByDeclinedInvite(null, base)).toBe(false);
    expect(isHiddenByDeclinedInvite(priv, { currentUserId: "me" })).toBe(false);
  });
});
