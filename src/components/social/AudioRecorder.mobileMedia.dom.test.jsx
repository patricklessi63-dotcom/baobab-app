import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Audit médias mobiles (6 oct. 2026), messages vocaux :
//  - démontage en plein enregistrement (changement de conversation/d'onglet) :
//    le MediaRecorder doit être arrêté et son onstop désarmé, sinon l'arrêt
//    des pistes déclenchait un onstop tardif qui fabriquait un Blob et un
//    URL.createObjectURL jamais révoqué (fuite) ; le voyant micro doit
//    s'éteindre (track.stop()) ;
//  - format : « audio/mp4 » choisi en premier (seul format que Safari/iOS sait
//    enregistrer ET lire), et nom/type du fichier envoyé cohérents ;
//  - permission refusée / contexte non sécurisé : message clair.

class FakeMediaRecorder {
  constructor(stream, options) {
    this.stream = stream;
    this.options = options;
    this.state = "recording";
    this.mimeType = options?.mimeType || "audio/webm";
    this.ondataavailable = null;
    this.onstop = null;
    this.onerror = null;
    FakeMediaRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  stop() {
    if (this.state === "inactive") throw new DOMException("already inactive", "InvalidStateError");
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["x"], { type: this.mimeType }) });
    this.onstop?.();
  }
}
FakeMediaRecorder.instances = [];
FakeMediaRecorder.isTypeSupported = () => false;

let AudioRecorder;
let fakeTrack;

beforeEach(async () => {
  vi.resetModules();
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.isTypeSupported = () => false;
  global.MediaRecorder = FakeMediaRecorder;
  fakeTrack = { stop: vi.fn(), onended: null };
  const fakeStream = { getTracks: () => [fakeTrack], getAudioTracks: () => [fakeTrack] };
  global.navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(fakeStream) };
  global.navigator.permissions = undefined;
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
  ({ default: AudioRecorder } = await import("./AudioRecorder"));
});

afterEach(() => { vi.restoreAllMocks(); });

async function startRecording(props = {}) {
  const utils = render(<AudioRecorder hasDraft={false} onSendText={() => {}} onSendAudio={() => {}} onActiveChange={() => {}} {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Message vocal" })); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Autoriser le microphone" })); });
  expect(screen.getByRole("button", { name: "Arrêter l'enregistrement" })).toBeInTheDocument();
  return utils;
}

describe("AudioRecorder — démontage en plein enregistrement", () => {
  it("arrête le MediaRecorder, coupe le micro et ne fabrique aucun Blob/URL après coup", async () => {
    const { unmount } = await startRecording();
    const recorder = FakeMediaRecorder.instances[0];
    expect(recorder.state).toBe("recording");
    unmount();
    expect(fakeTrack.stop).toHaveBeenCalled(); // voyant micro éteint
    expect(recorder.state).toBe("inactive"); // enregistreur arrêté
    expect(recorder.onstop).toBeNull(); // plus de rappel tardif
    expect(URL.createObjectURL).not.toHaveBeenCalled(); // aucune URL blob orpheline
  });

  it("annuler l'enregistrement coupe aussi le micro", async () => {
    await startRecording();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Annuler l'enregistrement" })); });
    expect(fakeTrack.stop).toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("AudioRecorder — format selon la plateforme", () => {
  it("iPhone/Safari (seul audio/mp4 supporté) : enregistre en audio/mp4 et envoie un .m4a typé audio/mp4", async () => {
    FakeMediaRecorder.isTypeSupported = (t) => t === "audio/mp4";
    const onSendAudio = vi.fn();
    await startRecording({ onSendAudio });
    expect(FakeMediaRecorder.instances[0].options).toEqual({ mimeType: "audio/mp4" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Arrêter l'enregistrement" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Envoyer le message vocal" })); });
    const file = onSendAudio.mock.calls[0][0];
    expect(file.type).toBe("audio/mp4");
    // Avant le correctif le nom finissait toujours par .webm, même pour du mp4.
    expect(file.name).toMatch(/^voice-\d+\.m4a$/);
  });

  it("Android/Chrome ancien (webm seulement) : audio/webm;codecs=opus, fichier .webm typé audio/webm (codec retiré)", async () => {
    FakeMediaRecorder.isTypeSupported = (t) => t === "audio/webm;codecs=opus";
    const onSendAudio = vi.fn();
    await startRecording({ onSendAudio });
    expect(FakeMediaRecorder.instances[0].options).toEqual({ mimeType: "audio/webm;codecs=opus" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Arrêter l'enregistrement" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Envoyer le message vocal" })); });
    const file = onSendAudio.mock.calls[0][0];
    expect(file.type).toBe("audio/webm");
    expect(file.name).toMatch(/\.webm$/);
  });
});

describe("AudioRecorder — micro refusé / indisponible", () => {
  it("permission refusée : popup « Microphone bloqué » (aide), aucun enregistrement démarré", async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    render(<AudioRecorder hasDraft={false} onSendText={() => {}} onSendAudio={() => {}} onActiveChange={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Message vocal" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Autoriser le microphone" })); });
    expect(await screen.findByText("Microphone bloqué")).toBeInTheDocument();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("contexte non sécurisé (HTTP) ou Safari ancien : message clair, pas d'erreur silencieuse", async () => {
    global.navigator.mediaDevices = undefined;
    render(<AudioRecorder hasDraft={false} onSendText={() => {}} onSendAudio={() => {}} onActiveChange={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Message vocal" })); });
    expect(screen.getByText("Ton navigateur ne prend pas en charge l'enregistrement audio.")).toBeInTheDocument();
  });

  it("aucun micro détecté : message dédié", async () => {
    navigator.mediaDevices.getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error("nf"), { name: "NotFoundError" }));
    render(<AudioRecorder hasDraft={false} onSendText={() => {}} onSendAudio={() => {}} onActiveChange={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Message vocal" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Autoriser le microphone" })); });
    expect(await screen.findByText("Aucun microphone n'a été détecté.")).toBeInTheDocument();
  });
});
