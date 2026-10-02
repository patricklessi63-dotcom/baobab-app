import { describe, it, expect, vi } from "vitest";
import { createFieldWriteQueue } from "./fieldWriteQueue";

// Contexte : handleToggleField (App.jsx) bascule n'importe quel champ
// "profiles" (show_city, show_country, personalization_enabled...) via un
// UPDATE réseau indépendant par clic. Sans cette queue, deux clics rapprochés
// sur le MÊME champ (ex. désactiver puis réactiver show_city) pouvaient voir
// leurs réponses réseau arriver dans le désordre, laissant la base avec la
// valeur du PREMIER clic alors que l'UI affichait déjà le second — une
// incohérence silencieuse invisible jusqu'au rechargement suivant.

describe("createFieldWriteQueue", () => {
  it("exécute les tâches d'une même clé dans l'ordre d'appel, même si la première est plus lente", async () => {
    const order = [];
    const queue = createFieldWriteQueue();

    // Simule : clic 1 (désactiver) parti en premier mais réseau lent.
    const first = queue.enqueue("show_city", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("desactiver");
    });
    // Simule : clic 2 (réactiver), juste après, réseau rapide.
    const second = queue.enqueue("show_city", async () => {
      order.push("reactiver");
    });

    await Promise.all([first, second]);

    // Sans la queue, "reactiver" (plus rapide) s'exécuterait avant
    // "desactiver" (plus lent) malgré avoir été cliqué après — la base
    // finirait sur "desactiver", contredisant le dernier choix réel de
    // l'utilisateur. Avec la queue, l'ordre des clics est préservé.
    expect(order).toEqual(["desactiver", "reactiver"]);
  });

  it("ne bloque pas les écritures sur des clés différentes entre elles", async () => {
    const order = [];
    const queue = createFieldWriteQueue();

    const slowOtherField = queue.enqueue("show_country", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push("show_country");
    });
    const fastSameTurnDifferentField = queue.enqueue("show_city", async () => {
      order.push("show_city");
    });

    await Promise.all([slowOtherField, fastSameTurnDifferentField]);

    // show_city n'a pas à attendre que show_country (clé différente) se
    // termine : les deux réglages sont indépendants l'un de l'autre.
    expect(order).toEqual(["show_city", "show_country"]);
  });

  it("un échec sur une tâche n'empêche pas l'exécution des tâches suivantes pour la même clé", async () => {
    const order = [];
    const queue = createFieldWriteQueue();

    const failing = queue.enqueue("show_city", async () => {
      order.push("tentative-1-echoue");
      throw new Error("network error");
    });
    const after = queue.enqueue("show_city", async () => {
      order.push("tentative-2-ok");
    });

    await expect(failing).rejects.toThrow("network error");
    await after;

    expect(order).toEqual(["tentative-1-echoue", "tentative-2-ok"]);
  });

  it("propage le résultat (ou l'erreur) de SA propre tâche à l'appelant, pas celui d'une autre", async () => {
    const queue = createFieldWriteQueue();
    const onError = vi.fn();

    const first = queue.enqueue("show_city", async () => "valeur-1").catch(onError);
    const second = queue.enqueue("show_city", async () => "valeur-2");

    await expect(first).resolves.toBe("valeur-1");
    await expect(second).resolves.toBe("valeur-2");
    expect(onError).not.toHaveBeenCalled();
  });
});
