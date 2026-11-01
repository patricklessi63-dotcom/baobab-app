import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Bug corrigé : quitter la conversation pendant que le navigateur demande
// l'accès au micro, puis cliquer « Autoriser », résolvait getUserMedia()
// sur un composant démonté — beginRecording() démarrait alors un
// enregistrement fantôme (micro ouvert, minuteur sans fin).

class FakeMediaRecorder {
  constructor() { FakeMediaRecorder.instances.push(this); this.state = "recording"; }
  start() {}
  stop() { this.state = "inactive"; }
}
FakeMediaRecorder.instances = [];
FakeMediaRecorder.isTypeSupported = () => false;

let AudioRecorder;
let resolveStream;
const fakeTrack = { stop: vi.fn(), onended: null };
const fakeStream = { getTracks: () => [fakeTrack], getAudioTracks: () => [fakeTrack] };

beforeEach(async () => {
  vi.resetModules();
  FakeMediaRecorder.instances = [];
  fakeTrack.stop.mockClear();
  global.MediaRecorder = FakeMediaRecorder;
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn(() => new Promise((res) => { resolveStream = () => res(fakeStream); })),
  };
  global.navigator.permissions = undefined;
  ({ default: AudioRecorder } = await import("./AudioRecorder"));
});

afterEach(() => vi.restoreAllMocks());

describe("AudioRecorder — démonté pendant la demande d'accès au micro", () => {
  it("coupe le flux obtenu et ne démarre aucun enregistrement", async () => {
    const { unmount } = render(<AudioRecorder hasDraft={false} onSendText={() => {}} onSendAudio={() => {}} onActiveChange={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Message vocal" })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Autoriser le microphone" })); });

    unmount();
    await act(async () => { resolveStream(); });

    expect(fakeTrack.stop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });
});
