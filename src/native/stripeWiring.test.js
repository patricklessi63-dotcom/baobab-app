// @vitest-environment node
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Garde-fous de câblage (sources lues telles quelles, aucun appel Stripe) : la logique d'argent doit rester dans
// _shared/stripeWebhookCore.ts (testée), et l'essai gratuit ne doit pas être rejouable par résiliation/réabonnement.
const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("stripe-webhook — câblage", () => {
  const index = read("supabase/functions/stripe-webhook/index.ts");
  it("l'index vérifie la signature puis délègue au cœur testé, sans écrire lui-même en base", () => {
    expect(index).toContain("constructEventAsync(body, signature, webhookSecret)");
    expect(index).toContain('from "../_shared/stripeWebhookCore.ts"');
    expect(index).toContain("handleStripeEvent(event");
    for (const forbidden of [".upsert(", ".insert(", ".update(", ".delete("]) expect(index).not.toContain(forbidden);
  });
  it("la signature est vérifiée AVANT tout traitement, sur le corps brut", () => {
    expect(index.indexOf("req.text()")).toBeGreaterThan(-1);
    expect(index.indexOf("constructEventAsync")).toBeLessThan(index.indexOf("handleStripeEvent(event"));
  });
  it("le cœur vérifie l'erreur de chaque écriture et libère la réservation en cas d'échec", () => {
    const core = read("supabase/functions/_shared/stripeWebhookCore.ts");
    expect(core).toContain("function must");
    expect(core).toContain('.from("subscription_events").delete().eq("stripe_event_id", event.id)');
    // Chaque `await admin.from("subscriptions")` d'écriture est enveloppé : `must(` sur la ligne ou la précédente.
    const lines = core.split(/\r?\n/);
    const writeLines = lines.map((l, i) => i).filter((i) => /await admin\.from\("subscriptions"\)/.test(lines[i]) && !/\.select\(/.test(lines[i]) && !/\.select\(/.test(lines[i + 1] ?? ""));
    expect(writeLines.length).toBeGreaterThanOrEqual(3);
    const bare = writeLines.filter((i) => !/must\(/.test(lines[i]) && !/must\(/.test(lines[i - 1] ?? ""));
    expect(bare).toEqual([]);
  });
});

describe("create-checkout-session — essai gratuit", () => {
  it("n'offre l'essai qu'à un profil qui n'a jamais eu d'abonnement", () => {
    expect(read("supabase/functions/create-checkout-session/index.ts")).toContain("TRIAL_DAYS > 0 && !existing");
  });
});
