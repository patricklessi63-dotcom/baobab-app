import { describe, it, expect } from "vitest";
import { detectMeetingIntent, MEETING_TIP_MESSAGE } from "./meetingTips";

describe("detectMeetingIntent — conseils avant une première rencontre", () => {
  it.each([
    "On se voit samedi ?",
    "J'aimerais te rencontrer en vrai",
    "On pourrait se rencontrer au centre-ville",
    "C'est notre premier rendez-vous !",
    "Viens chez moi ce soir",
    "On se prend un café ? Je te propose de prendre un cafe ensemble",
    "Let's meet in person this weekend",
    "Want to grab a coffee?",
    "our first date",
  ])("détecte : %s", (text) => {
    expect(detectMeetingIntent(text)).toBe(true);
  });

  it("ignore les accents, la casse et les apostrophes (droite, courbe ou absente)", () => {
    expect(detectMeetingIntent("ON SE VOIT DEMAIN")).toBe(true);
    expect(detectMeetingIntent("Premiere rencontre demain")).toBe(true);
    expect(detectMeetingIntent("première rencontre demain")).toBe(true);
    expect(detectMeetingIntent("je viens chez toi")).toBe(true);
    expect(detectMeetingIntent("j’aimerais te rencontrer")).toBe(true);
  });

  it.each([
    "",
    "   ",
    null,
    undefined,
    "Salut, ça va ?",
    "J'ai un rendez-vous chez le médecin demain",
    "Je cherche un café tranquille pour travailler",
    "Merci pour ton message",
    "Je viens de Dakar",
  ])("ne déclenche pas pour : %s", (text) => {
    expect(detectMeetingIntent(text)).toBe(false);
  });

  it("le conseil reste court, sans accusation, et rappelle les 3 gestes clés", () => {
    expect(MEETING_TIP_MESSAGE).toMatch(/lieu public/);
    expect(MEETING_TIP_MESSAGE).toMatch(/proche/);
    expect(MEETING_TIP_MESSAGE).toMatch(/trajet/);
    expect(MEETING_TIP_MESSAGE.length).toBeLessThan(260);
  });
});
