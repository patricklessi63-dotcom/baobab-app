import { describe, it, expect } from "vitest";
import { getMessageCheckState } from "./messageDeliveryState";

describe("getMessageCheckState", () => {
  it("« sent » : ni lu, ni destinataire en ligne", () => {
    expect(getMessageCheckState({ readAt: null, showReadReceipts: true, otherOnline: false })).toBe("sent");
  });

  it("« delivered » : pas lu mais destinataire actuellement en ligne", () => {
    expect(getMessageCheckState({ readAt: null, showReadReceipts: true, otherOnline: true })).toBe("delivered");
  });

  it("« read » : read_at posé et accusés de lecture actifs", () => {
    expect(getMessageCheckState({ readAt: "2026-09-15T12:00:00.000Z", showReadReceipts: true, otherOnline: false })).toBe("read");
  });

  it("« read » l'emporte sur « delivered » même si le destinataire est encore en ligne", () => {
    expect(getMessageCheckState({ readAt: "2026-09-15T12:00:00.000Z", showReadReceipts: true, otherOnline: true })).toBe("read");
  });

  it("réciprocité : l'expéditeur a désactivé show_read_receipts -> jamais « read » même si read_at est posé, retombe sur delivered/sent selon la présence", () => {
    expect(getMessageCheckState({ readAt: "2026-09-15T12:00:00.000Z", showReadReceipts: false, otherOnline: true })).toBe("delivered");
    expect(getMessageCheckState({ readAt: "2026-09-15T12:00:00.000Z", showReadReceipts: false, otherOnline: false })).toBe("sent");
  });

  it("showReadReceipts undefined (valeur par défaut, jamais explicitement désactivée) se comporte comme actif", () => {
    expect(getMessageCheckState({ readAt: "2026-09-15T12:00:00.000Z", showReadReceipts: undefined, otherOnline: false })).toBe("read");
  });
});
