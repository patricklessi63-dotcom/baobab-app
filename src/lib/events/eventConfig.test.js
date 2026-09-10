import { describe, it, expect } from "vitest";
import {
  EVENT_CATEGORIES,
  CANADA_TIMEZONE_OPTIONS,
  timezoneLabel,
  closestCanadaTimezone,
  zonedInputsToUtc,
  utcToZonedInputs,
  categoryLabel,
  categoryIcon,
  staffRoleLabel,
  reportCategoryLabel,
} from "./eventConfig.js";

describe("eventConfig — labels", () => {
  it("categoryLabel / categoryIcon connus", () => {
    expect(categoryLabel("sport")).toBe("Sport");
    expect(categoryIcon("musique")).toBe("🎵");
  });

  it("categoryLabel inconnu -> renvoie la valeur brute", () => {
    expect(categoryLabel("inexistant")).toBe("inexistant");
  });

  it("categoryIcon inconnu -> icône de repli 🎉", () => {
    expect(categoryIcon("inexistant")).toBe("🎉");
  });

  it("staffRoleLabel / reportCategoryLabel", () => {
    expect(staffRoleLabel("co_organizer")).toBe("Co-organisateur");
    expect(staffRoleLabel("???")).toBe("???");
    expect(reportCategoryLabel("faux_evenement")).toBe("Faux événement");
    expect(reportCategoryLabel("???")).toBe("???");
  });

  it("chaque catégorie a value/label/icon", () => {
    for (const c of EVENT_CATEGORIES) {
      expect(c.value && c.label && c.icon).toBeTruthy();
    }
  });
});

describe("eventConfig — fuseaux horaires", () => {
  it("timezoneLabel connu et repli sur la valeur", () => {
    expect(timezoneLabel("America/Toronto")).toBe("Est (HNE)");
    expect(timezoneLabel("Europe/Paris")).toBe("Europe/Paris");
    expect(timezoneLabel(undefined)).toBe("");
  });

  it("closestCanadaTimezone garde un fuseau canadien valide", () => {
    expect(closestCanadaTimezone("America/Vancouver")).toBe("America/Vancouver");
  });

  it("closestCanadaTimezone se replie sur America/Toronto hors Canada", () => {
    expect(closestCanadaTimezone("Europe/Paris")).toBe("America/Toronto");
    expect(closestCanadaTimezone(undefined)).toBe("America/Toronto");
  });

  it("6 fuseaux canadiens officiels", () => {
    expect(CANADA_TIMEZONE_OPTIONS).toHaveLength(6);
  });
});

describe("eventConfig — conversion date/heure zonée <-> UTC", () => {
  it("interprète l'heure saisie dans le fuseau choisi (été, EDT = UTC-4)", () => {
    const utc = zonedInputsToUtc("2025-07-15", "20:00", "America/Toronto");
    expect(utc.toISOString()).toBe("2025-07-16T00:00:00.000Z");
  });

  it("interprète l'heure saisie dans le fuseau choisi (hiver, EST = UTC-5)", () => {
    const utc = zonedInputsToUtc("2025-01-15", "20:00", "America/Toronto");
    expect(utc.toISOString()).toBe("2025-01-16T01:00:00.000Z");
  });

  it("un même mur d'heure donne un instant différent selon le fuseau", () => {
    const tor = zonedInputsToUtc("2025-07-15", "20:00", "America/Toronto");
    const van = zonedInputsToUtc("2025-07-15", "20:00", "America/Vancouver");
    // Vancouver est 3h derrière Toronto -> instant UTC 3h plus tard
    expect(van.getTime() - tor.getTime()).toBe(3 * 60 * 60 * 1000);
  });

  it("sans fuseau : les composants sont pris comme UTC", () => {
    const utc = zonedInputsToUtc("2025-07-15", "20:00", "");
    expect(utc.toISOString()).toBe("2025-07-15T20:00:00.000Z");
  });

  it("entrée incomplète -> Date invalide", () => {
    expect(Number.isNaN(zonedInputsToUtc("", "20:00", "America/Toronto").getTime())).toBe(true);
    expect(Number.isNaN(zonedInputsToUtc("2025-07-15", "", "America/Toronto").getTime())).toBe(true);
  });

  it("utcToZonedInputs lit l'heure locale du fuseau de l'événement", () => {
    expect(utcToZonedInputs("2025-07-16T00:00:00.000Z", "America/Toronto")).toEqual({
      date: "2025-07-15",
      time: "20:00",
    });
  });

  it("aller-retour zonedInputsToUtc -> utcToZonedInputs", () => {
    const utc = zonedInputsToUtc("2025-03-20", "09:30", "America/Vancouver");
    expect(utcToZonedInputs(utc.toISOString(), "America/Vancouver")).toEqual({
      date: "2025-03-20",
      time: "09:30",
    });
  });

  it("utcToZonedInputs sur une date invalide -> champs vides", () => {
    expect(utcToZonedInputs("pas-une-date", "America/Toronto")).toEqual({ date: "", time: "" });
  });
});
