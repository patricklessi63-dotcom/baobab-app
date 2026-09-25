import { describe, it, expect, vi, afterEach } from "vitest";
import { startHeartbeatInterval } from "./presenceHeartbeat";

describe("startHeartbeatInterval", () => {
  afterEach(() => vi.useRealTimers());

  it("appelle heartbeat() à chaque tick tant que l'onglet est visible", () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn();
    const stop = startHeartbeatInterval(heartbeat, { intervalMs: 30000, getVisibility: () => "visible" });

    vi.advanceTimersByTime(30000);
    vi.advanceTimersByTime(30000);
    expect(heartbeat).toHaveBeenCalledTimes(2);

    stop();
    vi.advanceTimersByTime(60000);
    expect(heartbeat).toHaveBeenCalledTimes(2); // plus aucun appel après stop()
  });

  it("bug corrigé : ne réécrit plus is_online=true sur le tick périodique si l'onglet est en arrière-plan (le setInterval tournait auparavant sans condition, annulant le is_online=false posé par 'visibilitychange' dès le tick suivant)", () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn();
    let visibility = "visible";
    startHeartbeatInterval(heartbeat, { intervalMs: 30000, getVisibility: () => visibility });

    // L'utilisateur change d'onglet juste avant le prochain tick.
    visibility = "hidden";
    vi.advanceTimersByTime(30000);
    expect(heartbeat).not.toHaveBeenCalled();

    // Reste en arrière-plan plusieurs ticks de suite : toujours aucun appel.
    vi.advanceTimersByTime(30000 * 5);
    expect(heartbeat).not.toHaveBeenCalled();

    // Revient sur l'onglet : le tick suivant redevient actif (le retour
    // immédiat au premier plan est de toute façon couvert séparément par le
    // listener "visibilitychange" dans App.jsx, qui appelle heartbeat()
    // directement — ceci ne teste que le comportement du minuteur lui-même).
    visibility = "visible";
    vi.advanceTimersByTime(30000);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it("stop() coupe le minuteur (nettoyage à la fermeture/changement de dépendances de l'effet)", () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn();
    const stop = startHeartbeatInterval(heartbeat, { intervalMs: 1000, getVisibility: () => "visible" });
    stop();
    vi.advanceTimersByTime(10000);
    expect(heartbeat).not.toHaveBeenCalled();
  });
});
