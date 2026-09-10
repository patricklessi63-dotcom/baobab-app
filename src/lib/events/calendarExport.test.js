import { describe, it, expect } from "vitest";
import { buildIcsBlob, googleCalendarUrl } from "./calendarExport.js";

const baseEvent = {
  id: "evt-1",
  title: "Café d'accueil",
  description: "Viens\nrencontrer du monde; apporte, un ami",
  location: "Café Central",
  city: "Montréal",
  event_date: "2025-07-15T18:00:00.000Z",
  duration_minutes: 90,
};

async function icsText(event) {
  return (await buildIcsBlob(event).text()).split("\r\n");
}

describe("buildIcsBlob", () => {
  it("produit un VCALENDAR/VEVENT bien formé", async () => {
    const lines = await icsText(baseEvent);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines).toContain("END:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
    expect(lines).toContain("UID:evt-1@baobab");
  });

  it("DTSTART/DTEND en UTC compact, fin = début + durée", async () => {
    const lines = await icsText(baseEvent);
    expect(lines).toContain("DTSTART:20250715T180000Z");
    expect(lines).toContain("DTEND:20250715T193000Z");
  });

  it("durée par défaut 60 min si duration_minutes absent", async () => {
    const lines = await icsText({ ...baseEvent, duration_minutes: undefined });
    expect(lines).toContain("DTEND:20250715T190000Z");
  });

  it("échappe , ; \\ et les retours à la ligne dans les champs texte", async () => {
    const lines = await icsText(baseEvent);
    const desc = lines.find((l) => l.startsWith("DESCRIPTION:"));
    expect(desc).toBe("DESCRIPTION:Viens\\nrencontrer du monde\\; apporte\\, un ami");
  });

  it("concatène location + city", async () => {
    const lines = await icsText(baseEvent);
    expect(lines).toContain("LOCATION:Café Central\\, Montréal");
  });

  it("omet DESCRIPTION et LOCATION quand vides ; titre de repli", async () => {
    const lines = await icsText({ id: "x", event_date: "2025-07-15T18:00:00.000Z" });
    expect(lines.some((l) => l.startsWith("DESCRIPTION:"))).toBe(false);
    expect(lines.some((l) => l.startsWith("LOCATION:"))).toBe(false);
    expect(lines).toContain("SUMMARY:Événement Baobab");
  });

  it("type MIME text/calendar", () => {
    expect(buildIcsBlob(baseEvent).type).toContain("text/calendar");
  });
});

describe("googleCalendarUrl", () => {
  it("pointe vers l'URL render officielle avec les bons paramètres", () => {
    const url = new URL(googleCalendarUrl(baseEvent));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Café d'accueil");
    expect(url.searchParams.get("dates")).toBe("20250715T180000Z/20250715T193000Z");
    expect(url.searchParams.get("location")).toBe("Café Central, Montréal");
  });

  it("gère un événement minimal sans lever", () => {
    const url = googleCalendarUrl({ id: "x", event_date: "2025-07-15T18:00:00.000Z" });
    expect(url).toContain("calendar.google.com");
  });
});
