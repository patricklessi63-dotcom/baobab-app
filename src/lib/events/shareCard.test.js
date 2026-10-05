import { describe, it, expect } from "vitest";
import { buildEventShareMeta } from "./shareCard";

const SIGNED = "https://x.supabase.co/storage/v1/object/sign/event-covers/e1.jpg?token=abc";
const ev = (visibility) => ({
  id: "e1",
  title: "Soirée Baobab",
  cover_url: SIGNED,
  event_date: "2026-11-01T18:00:00Z",
  timezone: "America/Toronto",
  city: "Montréal",
  visibility,
});

describe("buildEventShareMeta", () => {
  it("événement public : comportement inchangé, la couverture est incluse", () => {
    expect(buildEventShareMeta(ev("public"))).toEqual({
      event_id: "e1",
      title: "Soirée Baobab",
      cover_url: SIGNED,
      event_date: "2026-11-01T18:00:00Z",
      timezone: "America/Toronto",
      city: "Montréal",
    });
  });

  it("événement public sans couverture : cover_url = null", () => {
    expect(buildEventShareMeta({ ...ev("public"), cover_url: undefined }).cover_url).toBeNull();
  });

  it("événement community : pas d'URL signée, titre/date/ville inchangés", () => {
    const meta = buildEventShareMeta(ev("community"));
    expect(meta.cover_url).toBeNull();
    expect(JSON.stringify(meta)).not.toContain("token=");
    expect(meta).toMatchObject({ event_id: "e1", title: "Soirée Baobab", event_date: "2026-11-01T18:00:00Z", timezone: "America/Toronto", city: "Montréal" });
  });

  it("visibilité inconnue ou absente : prudence, pas de couverture", () => {
    expect(buildEventShareMeta(ev("private")).cover_url).toBeNull();
    expect(buildEventShareMeta(ev(undefined)).cover_url).toBeNull();
  });

  it("timezone absente : null", () => {
    expect(buildEventShareMeta({ ...ev("community"), timezone: undefined }).timezone).toBeNull();
  });
});
