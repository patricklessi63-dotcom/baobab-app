import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Bug corrigé : atteindre la limite de durée max (AUDIO_MAX_DURATION_MS,
// 2 minutes) pendant un enregistrement appelait recorder.stop() une
// première fois via le setInterval du chronomètre, mais ne l'arrêtait
// jamais (clearInterval manquant) — voir AudioRecorder.jsx. Résultat :
// chaque tick suivant (toutes les 200ms, pour toujours) rappelait
// recorder.stop() sur un MediaRecorder déjà "inactive" (InvalidStateError
// non interceptée) ET continuait à faire avancer le chronomètre affiché
// dans l'aperçu ("preview"), qui n'était donc jamais figé sur la vraie
// durée du message vocal.

class FakeMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = "recording";
    this.mimeType = "audio/webm";
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    // Reproduit fidèlement le comportement natif utilisé par le composant :
    // lever si déjà inactif (voir spec MediaRecorder.stop()).
    if (this.state === "inactive") {
      throw new DOMException("MediaRecorder is already inactive", "InvalidStateError");
    }
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}
FakeMediaRecorder.instances = [];
FakeMediaRecorder.isTypeSupported = () => false; // pousse le composant vers le mimeType par défaut du navigateur

let AudioRecorder;

beforeEach(async () => {
  vi.resetModules();
  FakeMediaRecorder.instances = [];
  global.MediaRecorder = FakeMediaRecorder;

  const fakeTrack = { stop: vi.fn(), onended: null };
  const fakeStream = {
    getTracks: () => [fakeTrack],
    getAudioTracks: () => [fakeTrack],
  };
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn().mockResolvedValue(fakeStream),
  };
  // best-effort seulement dans le composant — absent ici, il retombe sur "prompt"
  global.navigator.permissions = undefined;

  if (!global.URL.createObjectURL) global.URL.createObjectURL = () => "blob:fake";
  else vi.spyOn(global.URL, "createObjectURL").mockReturnValue("blob:fake");
  if (!global.URL.revokeObjectURL) global.URL.revokeObjectURL = () => {};
  else vi.spyOn(global.URL, "revokeObjectURL").mockImplementation(() => {});

  ({ default: AudioRecorder } = await import("./AudioRecorder"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function startRecording() {
  render(
    <AudioRecorder
      hasDraft={false}
      onSendText={() => {}}
      onSendAudio={() => {}}
      onActiveChange={() => {}}
    />
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Message vocal" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Autoriser le microphone" }));
  });
  // L'enregistrement est démarré (bouton "Arrêter l'enregistrement" visible).
  expect(screen.getByRole("button", { name: "Arrêter l'enregistrement" })).toBeInTheDocument();
}

// Les timers factices doivent être en place AVANT que beginRecording() ne
// pose son setInterval (sinon celui-ci reste un vrai setInterval, hors de
// portée de vi.advanceTimersByTimeAsync).
describe("AudioRecorder — chronomètre à la durée maximale", () => {
  it("arrête le minuteur une fois la limite atteinte (pas de recorder.stop() en boucle)", async () => {
    vi.useFakeTimers();
    await startRecording();
    const recorder = FakeMediaRecorder.instances[0];
    const stopSpy = vi.spyOn(recorder, "stop");

    // 2 minutes exactement (AUDIO_MAX_DURATION_MS) + plusieurs ticks de marge.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120200);
    });
    expect(stopSpy).toHaveBeenCalledTimes(1);

    // Sans le correctif, chaque tick suivant du setInterval (toujours actif)
    // rappelait recorder.stop() sur un MediaRecorder déjà "inactive" et
    // levait une InvalidStateError nonstop toutes les 200ms.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(stopSpy).toHaveBeenCalledTimes(1);
    // Confirme que le MediaRecorder est bel et bien resté "inactive" (donc
    // qu'un appel manuel de stop() lèverait) — le point important est que
    // le composant, lui, ne le rappelle plus (voir assertion précédente).
    expect(() => recorder.stop()).toThrowError(expect.objectContaining({ name: "InvalidStateError" }));
  });

  it("figeage du chronomètre affiché dans l'aperçu à la durée réelle du message vocal", async () => {
    vi.useFakeTimers();
    await startRecording();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120200);
    });

    // Aperçu affiché avec le minuteur figé à ~2:00.
    const durationBefore = screen.getByText(/^\d:\d\d$/).textContent;
    expect(durationBefore).toBe("2:00");

    // Sans le correctif, le chronomètre continuait de défiler indéfiniment
    // pendant que l'aperçu reste ouvert (l'utilisateur n'a pas encore
    // envoyé/supprimé le message vocal).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    const durationAfter = screen.getByText(/^\d:\d\d$/).textContent;
    expect(durationAfter).toBe("2:00");
  });
});
