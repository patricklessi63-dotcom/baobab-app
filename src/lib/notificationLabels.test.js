import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_LABELS,
  NOTIF_CATEGORIES,
  groupNotificationRows,
  reminderStaleness,
} from "./notificationLabels.js";

const row = (type, name, id, created_at, category = "communities") => ({
  category,
  n: { type, id, created_at, actor: name ? { name } : null },
});

describe("NOTIFICATION_LABELS", () => {
  it("couvre les types connus principaux", () => {
    for (const t of [
      "join_request_received",
      "event_cancelled",
      "new_match",
      "new_message",
      "post_liked",
      "premium_activated",
      "premium_payment_failed",
    ]) {
      expect(typeof NOTIFICATION_LABELS[t]).toBe("string");
      expect(NOTIFICATION_LABELS[t].length).toBeGreaterThan(0);
    }
  });

  it("type inconnu -> undefined (le fallback est géré par l'appelant)", () => {
    expect(NOTIFICATION_LABELS.type_inexistant).toBeUndefined();
  });

  it("NOTIF_CATEGORIES commence par 'all' / 'Tout'", () => {
    expect(NOTIF_CATEGORIES[0]).toEqual(["all", "Tout"]);
    expect(NOTIF_CATEGORIES.every((c) => Array.isArray(c) && c.length === 2)).toBe(true);
  });
});

describe("groupNotificationRows", () => {
  it("laisse passer telles quelles les lignes uniques", () => {
    const rows = [row("new_like", "Ada", "1", "2024-01-01")];
    expect(groupNotificationRows(rows)).toEqual(rows);
  });

  it("regroupe les lignes de même (catégorie, type) avec résumé de noms", () => {
    const rows = [
      row("new_like", "Ada", "3", "2024-01-03"),
      row("new_like", "Bea", "2", "2024-01-02"),
      row("new_like", "Cid", "1", "2024-01-01"),
    ];
    const [grouped] = groupNotificationRows(rows);
    expect(grouped.label).toBe("Ada, Bea +1 — T'a aimé(e)");
    expect(grouped.groupCount).toBe(3);
    expect(grouped.groupIds).toEqual(["3", "2", "1"]);
    // la représentante est la plus récente (première du groupe)
    expect(grouped.n.id).toBe("3");
  });

  it("deux noms exactement -> pas de suffixe +N", () => {
    const rows = [
      row("new_like", "Ada", "2", "2024-01-02"),
      row("new_like", "Bea", "1", "2024-01-01"),
    ];
    expect(groupNotificationRows(rows)[0].label).toBe("Ada, Bea — T'a aimé(e)");
  });

  it("groupe sans aucun nom d'acteur -> compte × libellé", () => {
    const rows = [
      row("new_like", null, "2", "2024-01-02"),
      row("new_like", null, "1", "2024-01-01"),
    ];
    expect(groupNotificationRows(rows)[0].label).toBe("2 × T'a aimé(e)");
  });

  it("noms en double dédupliqués", () => {
    const rows = [
      row("new_like", "Ada", "3", "2024-01-03"),
      row("new_like", "Ada", "2", "2024-01-02"),
      row("new_like", "Ada", "1", "2024-01-01"),
    ];
    expect(groupNotificationRows(rows)[0].label).toBe("Ada — T'a aimé(e)");
  });

  it("type inconnu dans un groupe -> libellé de repli 'Nouvelle activité'", () => {
    const rows = [
      row("type_x", "Ada", "2", "2024-01-02"),
      row("type_x", "Bea", "1", "2024-01-01"),
    ];
    expect(groupNotificationRows(rows)[0].label).toBe("Ada, Bea — Nouvelle activité");
  });

  it("ne fusionne pas des catégories différentes pour un même type", () => {
    const rows = [
      row("new_like", "Ada", "2", "2024-01-02", "dating"),
      row("new_like", "Bea", "1", "2024-01-01", "communities"),
    ];
    const res = groupNotificationRows(rows);
    expect(res).toHaveLength(2);
  });

  it("trie le résultat par date décroissante", () => {
    const rows = [
      row("new_message", "X", "a", "2024-01-01", "messages"),
      row("new_like", "Y", "b", "2024-06-01", "dating"),
    ];
    const res = groupNotificationRows(rows);
    expect(new Date(res[0].n.created_at) >= new Date(res[1].n.created_at)).toBe(true);
    expect(res[0].n.id).toBe("b");
  });
});

// Bug identifié à l'audit "clic sur un rappel d'événement plusieurs jours
// après" : event_reminder_24h/1h affichent un délai fixe qui devient faux
// avec le temps, sans aucun horodatage ailleurs dans le menu pour l'indiquer
// (voir commentaire sur reminderStaleness dans notificationLabels.js).
// Même convention que utils/format.test.js (formatLastSeen) : décalages
// relatifs à Date.now() réel, pas de fake timers (évite toute fuite de
// timer sur les autres fichiers de test qui utilisent userEvent).
describe("reminderStaleness", () => {
  const ago = (ms) => new Date(Date.now() - ms).toISOString();

  it("type non concerné -> pas de mention, même très ancien", () => {
    expect(reminderStaleness("new_message", ago(30 * 24 * 60 * 60 * 1000))).toBe("");
  });

  it("rappel envoyé il y a moins d'1h -> le texte fixe est encore fiable, pas de mention", () => {
    expect(reminderStaleness("event_reminder_24h", ago(30 * 60 * 1000))).toBe("");
  });

  it("rappel 1h envoyé il y a 5h -> mention en heures", () => {
    expect(reminderStaleness("event_reminder_1h", ago(5 * 60 * 60 * 1000))).toBe("(envoyé il y a 5 h)");
  });

  it("rappel 24h ouvert 3 jours après -> mention en jours (le cas signalé)", () => {
    expect(reminderStaleness("event_reminder_24h", ago(3 * 24 * 60 * 60 * 1000))).toBe("(envoyé il y a 3 j)");
  });

  it("groupNotificationRows ajoute la mention sur une ligne de rappel isolée", () => {
    const rows = [{
      category: "events",
      label: NOTIFICATION_LABELS.event_reminder_24h,
      n: { type: "event_reminder_24h", id: "1", created_at: ago(3 * 24 * 60 * 60 * 1000) },
    }];
    expect(groupNotificationRows(rows)[0].label).toBe("Un événement commence dans 24h (envoyé il y a 3 j)");
  });

  it("groupNotificationRows ne casse pas si le label est absent (garde défensive)", () => {
    const rows = [row("event_reminder_24h", null, "1", ago(3 * 24 * 60 * 60 * 1000), "events")];
    expect(groupNotificationRows(rows)).toEqual(rows);
  });
});
