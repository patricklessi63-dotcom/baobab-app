// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { handleStripeEvent, type WebhookEvent } from "./stripeWebhookCore";

// Base factice en mémoire qui imite ce que le webhook utilise du client Supabase (insert / update / upsert /
// delete / select + eq / or / order / limit / maybeSingle), avec la contrainte UNIQUE de stripe_event_id et
// la possibilité de faire échouer une écriture précise. Honnêteté : ce n'est pas Supabase ; la vraie base
// n'est atteignable qu'avec les secrets Stripe, absents en production à ce jour.

type Row = Record<string, any>;
type Fail = (table: string, op: string) => { message: string; code?: string } | null;

function fakeAdmin(initial: Partial<Record<string, Row[]>> = {}, fail: Fail = () => null) {
  const tables: Record<string, Row[]> = {
    subscription_events: [], subscriptions: [], notifications: [],
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [...(v || [])]])),
  };
  const calls: string[] = [];
  const from = (table: string) => {
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: any; let opts: any;
    const filters: Array<[string, any]> = []; let orStr: string | null = null; let single = false; let desc = false;
    const matches = (r: Row) => filters.every(([c, v]) => r[c] === v) && passOr(r);
    const passOr = (r: Row) => {
      if (!orStr) return true;
      const m = /^stripe_event_created_at\.is\.null,stripe_event_created_at\.lt\.(.+)$/.exec(orStr);
      if (!m) throw new Error("filtre .or non géré par la base factice : " + orStr);
      return r.stripe_event_created_at == null || r.stripe_event_created_at < m[1];
    };
    const run = () => {
      calls.push(`${op}:${table}`);
      const err = fail(table, op);
      if (err) return { data: null, error: err };
      const rows = tables[table];
      if (op === "insert") {
        if (table === "subscription_events" && rows.some((r) => r.stripe_event_id === payload.stripe_event_id)) {
          return { data: null, error: { message: "duplicate key", code: "23505" } };
        }
        rows.push({ ...payload, created_at: rows.length }); return { data: null, error: null };
      }
      if (op === "update") { rows.filter(matches).forEach((r) => Object.assign(r, payload)); return { data: null, error: null }; }
      if (op === "delete") { tables[table] = rows.filter((r) => !matches(r)); return { data: null, error: null }; }
      if (op === "upsert") {
        const key = opts.onConflict; const i = rows.findIndex((r) => r[key] === payload[key]);
        if (i >= 0) Object.assign(rows[i], payload); else rows.push({ ...payload, created_at: rows.length });
        return { data: null, error: null };
      }
      let found = rows.filter(matches); if (desc) found = [...found].reverse();
      return { data: single ? (found[0] ?? null) : found, error: null };
    };
    const b: any = {
      insert(p: Row) { op = "insert"; payload = p; return b; },
      update(p: Row) { op = "update"; payload = p; return b; },
      upsert(p: Row, o: any) { op = "upsert"; payload = p; opts = o; return b; },
      delete() { op = "delete"; return b; },
      select() { return b; },
      eq(c: string, v: any) { filters.push([c, v]); return b; },
      or(s: string) { orStr = s; return b; },
      order(_c: string, o?: { ascending?: boolean }) { desc = o?.ascending === false; return b; },
      limit() { return b; },
      maybeSingle() { single = true; return Promise.resolve(run()); },
      then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
    };
    return b;
  };
  return { from, tables, calls };
}

const PROFILE = "00000000-0000-0000-0000-000000000001";
const sub = (over: Row = {}) => ({
  id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false,
  current_period_end: 1893456000, metadata: { profile_id: PROFILE },
  items: { data: [{ price: { id: "price_y", recurring: { interval: "year" } } }] }, ...over,
});
const evt = (id: string, type: string, object: any, created = 1000): WebhookEvent => ({ id, type, created, data: { object } });
const quiet = { error: vi.fn(), warn: vi.fn() };
const make = (admin: any, retrieve = vi.fn(async () => sub())) => ({ admin, retrieveSubscription: retrieve, log: quiet });

const checkout = (id = "evt_1", created = 1000) =>
  evt(id, "checkout.session.completed", { customer: "cus_1", subscription: "sub_1", metadata: { profile_id: PROFILE } }, created);

describe("stripe-webhook — traitement normal", () => {
  it("un paiement enregistre l'abonnement, journalise l'événement et notifie une fois", async () => {
    const admin = fakeAdmin();
    const r = await handleStripeEvent(checkout(), make(admin));
    expect(r).toEqual({ status: 200, body: "ok" });
    expect(admin.tables.subscriptions).toHaveLength(1);
    expect(admin.tables.subscriptions[0]).toMatchObject({ profile_id: PROFILE, plan: "yearly", status: "active", stripe_subscription_id: "sub_1", cancel_at_period_end: false });
    expect(admin.tables.subscription_events[0]).toMatchObject({ stripe_event_id: "evt_1", profile_id: PROFILE });
    expect(admin.tables.notifications).toEqual([expect.objectContaining({ recipient_id: PROFILE, type: "premium_activated" })]);
  });

  it("une livraison en double n'a aucun effet de plus (pas de seconde relecture ni notification)", async () => {
    const admin = fakeAdmin(); const retrieve = vi.fn(async () => sub());
    await handleStripeEvent(checkout(), make(admin, retrieve));
    const second = await handleStripeEvent(checkout(), make(admin, retrieve));
    expect(second).toEqual({ status: 200, body: "ok (déjà traité)" });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(admin.tables.notifications).toHaveLength(1);
  });

  it("un type d'événement inconnu est réservé et accepté, sans rien modifier", async () => {
    const admin = fakeAdmin();
    const r = await handleStripeEvent(evt("evt_x", "charge.refunded", {}), make(admin));
    expect(r.status).toBe(200);
    expect(admin.tables.subscriptions).toHaveLength(0);
    expect(admin.tables.notifications).toHaveLength(0);
  });
});

describe("stripe-webhook — un échec ne doit jamais ressembler à un succès", () => {
  it("échec d'écriture de l'abonnement : 500, réservation libérée, puis le retry de Stripe aboutit", async () => {
    let broken = true;
    const admin = fakeAdmin({}, (t, op) => (broken && t === "subscriptions" && op === "upsert" ? { message: "boom" } : null));
    const first = await handleStripeEvent(checkout(), make(admin));
    expect(first.status).toBe(500);
    expect(admin.tables.subscription_events).toHaveLength(0);     // réservation libérée
    expect(admin.tables.subscriptions).toHaveLength(0);
    expect(admin.tables.notifications).toHaveLength(0);           // jamais « Premium activé » sans Premium

    broken = false;                                               // Stripe renvoie le même événement
    const retry = await handleStripeEvent(checkout(), make(admin));
    expect(retry).toEqual({ status: 200, body: "ok" });
    expect(admin.tables.subscriptions).toHaveLength(1);           // la personne qui a payé devient Premium
    expect(admin.tables.notifications).toHaveLength(1);
  });

  it("Stripe injoignable pour relire l'abonnement : 500 et réservation libérée", async () => {
    const admin = fakeAdmin();
    const r = await handleStripeEvent(checkout(), make(admin, vi.fn(async () => { throw new Error("réseau"); })));
    expect(r.status).toBe(500);
    expect(admin.tables.subscription_events).toHaveLength(0);
  });

  it("échec de lecture de l'abonnement existant : 500 (pas de succès silencieux)", async () => {
    const admin = fakeAdmin({}, (t, op) => (t === "subscriptions" && op === "select" ? { message: "lecture impossible" } : null));
    expect((await handleStripeEvent(checkout(), make(admin))).status).toBe(500);
  });

  it("échec de la mise à jour d'une résiliation : 500 et réservation libérée", async () => {
    const admin = fakeAdmin({ subscriptions: [{ stripe_subscription_id: "sub_1", profile_id: PROFILE, status: "active", stripe_event_created_at: null }] },
      (t, op) => (t === "subscriptions" && op === "update" ? { message: "boom" } : null));
    const r = await handleStripeEvent(evt("evt_d", "customer.subscription.deleted", sub()), make(admin));
    expect(r.status).toBe(500);
    expect(admin.tables.subscription_events).toHaveLength(0);
    expect(admin.tables.subscriptions[0].status).toBe("active");
  });

  it("si la libération échoue aussi, répond quand même 500 et le dit dans les journaux", async () => {
    const log = { error: vi.fn(), warn: vi.fn() };
    const admin = fakeAdmin({}, (t, op) => ((t === "subscriptions" && op === "upsert") || (t === "subscription_events" && op === "delete") ? { message: "boom" } : null));
    const r = await handleStripeEvent(checkout(), { admin, retrieveSubscription: async () => sub(), log });
    expect(r.status).toBe(500);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("non libérée"), expect.anything());
  });

  it("échec de la réservation (autre que doublon) : 500", async () => {
    const admin = fakeAdmin({}, (t, op) => (t === "subscription_events" && op === "insert" ? { message: "boom", code: "XX000" } : null));
    expect((await handleStripeEvent(checkout(), make(admin))).status).toBe(500);
  });
});

describe("stripe-webhook — le reste est « au mieux »", () => {
  it("une notification qui échoue ne défait pas l'abonnement enregistré (200)", async () => {
    const admin = fakeAdmin({}, (t, op) => (t === "notifications" && op === "insert" ? { message: "boom" } : null));
    const r = await handleStripeEvent(checkout(), make(admin));
    expect(r.status).toBe(200);
    expect(admin.tables.subscriptions).toHaveLength(1);
  });
});

describe("stripe-webhook — ordre des événements", () => {
  it("un événement plus ancien livré après un plus récent n'écrase pas l'état", async () => {
    const admin = fakeAdmin();
    await handleStripeEvent(evt("e2", "customer.subscription.updated", sub({ cancel_at_period_end: true }), 200), make(admin));
    await handleStripeEvent(evt("e1", "customer.subscription.updated", sub({ cancel_at_period_end: false }), 100), make(admin));
    expect(admin.tables.subscriptions[0].cancel_at_period_end).toBe(true);
  });

  it("une résiliation plus ancienne que l'état enregistré est ignorée ; une plus récente s'applique et notifie", async () => {
    const admin = fakeAdmin();
    await handleStripeEvent(evt("e1", "customer.subscription.updated", sub(), 200), make(admin));
    await handleStripeEvent(evt("old", "customer.subscription.deleted", sub(), 100), make(admin));
    expect(admin.tables.subscriptions[0].status).toBe("active");
    await handleStripeEvent(evt("new", "customer.subscription.deleted", sub(), 300), make(admin));
    expect(admin.tables.subscriptions[0].status).toBe("canceled");
    expect(admin.tables.notifications.map((n) => n.type)).toContain("premium_cancelled");
  });

  it("un paiement refusé passe l'abonnement en impayé et prévient la personne (profil retrouvé par le client Stripe)", async () => {
    const admin = fakeAdmin();
    await handleStripeEvent(evt("e1", "customer.subscription.updated", sub(), 100), make(admin));
    const r = await handleStripeEvent(evt("e2", "invoice.payment_failed", { customer: "cus_1", subscription: "sub_1" }, 200), make(admin));
    expect(r.status).toBe(200);
    expect(admin.tables.subscriptions[0].status).toBe("past_due");
    expect(admin.tables.notifications.at(-1)).toMatchObject({ recipient_id: PROFILE, type: "premium_payment_failed" });
  });
});
