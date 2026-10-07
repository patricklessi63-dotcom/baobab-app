import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { startPresence } from "./presenceHeartbeat";

// Présence (heartbeat 60 s) : web inchangé ; app native pilotée par
// appStateChange (@capacitor/app) — premier plan => heartbeat immédiat + minuteur,
// arrière-plan => minuteur arrêté + dernier "hors ligne".

let visibility;
beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
});
afterEach(() => {
  vi.useRealTimers();
  delete document.visibilityState;
});

function setVisibility(v) {
  visibility = v;
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("startPresence — web (comportement inchangé)", () => {
  it("heartbeat immédiat, tick toutes les 60 s, retour visible => heartbeat, masqué => hors ligne et plus de tick", () => {
    const heartbeat = vi.fn();
    const goOffline = vi.fn();
    const onAppStateChange = vi.fn();
    const stop = startPresence({ heartbeat, goOffline, native: false, onAppStateChange });
    expect(heartbeat).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(2);

    setVisibility("hidden");
    expect(goOffline).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5 * 60_000);
    expect(heartbeat).toHaveBeenCalledTimes(2); // tick filtré par la visibilité

    setVisibility("visible");
    expect(heartbeat).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(120_000);
    expect(heartbeat).toHaveBeenCalledTimes(3);
    // Le web ne touche JAMAIS au plugin natif.
    expect(onAppStateChange).not.toHaveBeenCalled();
  });
});

describe("startPresence — app native", () => {
  async function setup() {
    const heartbeat = vi.fn();
    const goOffline = vi.fn();
    let cb;
    const remove = vi.fn();
    const onAppStateChange = vi.fn(async (fn) => { cb = fn; return remove; });
    const stop = startPresence({ heartbeat, goOffline, native: true, onAppStateChange });
    await vi.advanceTimersByTimeAsync(0); // laisse la promesse d'enregistrement se résoudre
    return { heartbeat, goOffline, emit: (isActive) => cb({ isActive }), remove, stop };
  }

  it("arrière-plan : minuteur ARRÊTÉ (aucun heartbeat pendant 10 min) et un dernier hors ligne", async () => {
    const { heartbeat, goOffline, emit } = await setup();
    expect(heartbeat).toHaveBeenCalledTimes(1);
    emit(false);
    expect(goOffline).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it("premier plan : heartbeat IMMÉDIAT puis toutes les 60 s", async () => {
    const { heartbeat, emit } = await setup();
    emit(false);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    emit(true);
    expect(heartbeat).toHaveBeenCalledTimes(2); // 1 initial + 1 immédiat au retour
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat).toHaveBeenCalledTimes(4);
  });

  it("passages rapides premier plan <-> arrière-plan : jamais deux minuteurs en parallèle", async () => {
    const { heartbeat, emit } = await setup();
    emit(true); emit(true); emit(false); emit(true);
    const before = heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(heartbeat.mock.calls.length).toBe(before + 1);
  });

  it("une fois appStateChange actif, visibilitychange n'est plus écouté (pas de double heartbeat au retour)", async () => {
    const { heartbeat, goOffline, emit } = await setup();
    emit(false);
    emit(true);
    const calls = heartbeat.mock.calls.length;
    setVisibility("hidden");
    setVisibility("visible");
    expect(heartbeat.mock.calls.length).toBe(calls);
    expect(goOffline).toHaveBeenCalledTimes(1); // celui d'appStateChange seulement
  });

  it("plugin indisponible (promesse rejetée) : repli sur visibilitychange comme sur le web", async () => {
    const heartbeat = vi.fn();
    const goOffline = vi.fn();
    startPresence({ heartbeat, goOffline, native: true, onAppStateChange: async () => { throw new Error("pas de plugin"); } });
    await vi.advanceTimersByTimeAsync(0);
    setVisibility("hidden");
    expect(goOffline).toHaveBeenCalledTimes(1);
    setVisibility("visible");
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it("nettoyage : minuteur arrêté, écouteur natif retiré, plus aucun heartbeat", async () => {
    const { heartbeat, remove, stop, emit } = await setup();
    stop();
    expect(remove).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(heartbeat).toHaveBeenCalledTimes(1);
    emit(true); // un évènement tardif après le nettoyage est ignoré
    expect(heartbeat).toHaveBeenCalledTimes(1);
  });

  it("nettoyage avant que le plugin soit chargé : l'écouteur est retiré dès qu'il arrive", async () => {
    const remove = vi.fn();
    let resolve;
    const onAppStateChange = () => new Promise((r) => { resolve = r; });
    const stop = startPresence({ heartbeat: vi.fn(), goOffline: vi.fn(), native: true, onAppStateChange });
    stop();
    resolve(remove);
    await vi.advanceTimersByTimeAsync(0);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
