// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MEMBER_MEDIA_URL_TTL } from "./mediaUrlTtl";

// Garde-fou : un lien signé vers un média réservé aux membres ne se révoque pas ; sa durée est le
// temps d'accès d'une personne retirée. Aucun appel de signature des buckets community-media et
// event-media ne doit revenir à une durée longue (5 ans / 30 jours avant l'audit du 25 nov. 2026).
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("durée des liens signés des médias réservés aux membres", () => {
  it("vaut 24 h au plus", () => {
    expect(MEMBER_MEDIA_URL_TTL).toBeLessThanOrEqual(24 * 3600);
    expect(MEMBER_MEDIA_URL_TTL).toBeGreaterThan(0);
  });

  it("les photos d'événements et les médias de communauté utilisent cette durée", () => {
    expect(read("src/components/social/EventsTab.jsx")).toMatch(/const PHOTO_URL_EXPIRY = MEMBER_MEDIA_URL_TTL;/);
    expect(read("src/lib/communities/communityMedia.js")).toMatch(/COMMUNITY_MEDIA_URL_TTL = MEMBER_MEDIA_URL_TTL/);
  });

  it("aucune signature community-media / event-media avec une durée écrite en dur", () => {
    for (const f of ["src/components/social/EventsTab.jsx", "src/components/social/CommunitiesTab.jsx"]) {
      const src = read(f);
      const calls = src.match(/from\((?:"event-media"|COMMUNITY_MEDIA_BUCKET)\)\.createSignedUrls?\([^;]*\)/g) || [];
      expect(calls.length).toBeGreaterThan(0);
      for (const c of calls) expect(c).not.toMatch(/\d\s*\*\s*\d/);
    }
  });
});
