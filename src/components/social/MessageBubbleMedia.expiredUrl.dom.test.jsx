import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

// Audit médias mobiles (6 oct. 2026) : une URL signée de chat-media vit 1 h. Une
// conversation laissée ouverte (ou un téléphone qui sort de veille) affichait
// alors une image cassée définitive, une vidéo muette, et pour l'audio le
// message trompeur « ne peut pas être lu sur cet appareil ». Au premier échec de
// chargement, la bulle redemande UNE URL neuve (cache invalidé) ; si le fichier
// est vraiment inaccessible, elle affiche un repli explicite au lieu d'une
// image cassée.

const mocks = vi.hoisted(() => ({ getSignedUrl: vi.fn(), invalidateSignedUrl: vi.fn() }));
vi.mock("../../lib/signedUrlCache", () => ({
  getSignedUrl: (...a) => mocks.getSignedUrl(...a),
  invalidateSignedUrl: (...a) => mocks.invalidateSignedUrl(...a),
}));
vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

import MessageBubbleMedia from "./MessageBubbleMedia";

let n;
beforeEach(() => {
  n = 0;
  mocks.getSignedUrl.mockReset().mockImplementation(async () => `https://signed.test/u${++n}`);
  mocks.invalidateSignedUrl.mockReset();
});

const imageMsg = (meta = {}) => ({ id: "m1", kind: "image", media_path: "k/a.jpg", media_meta: { original_name: "a.jpg", ...meta } });

describe("MessageBubbleMedia — URL signée expirée", () => {
  it("image : au premier échec, redemande une URL neuve (cache invalidé) et réaffiche", async () => {
    const { container } = render(<MessageBubbleMedia m={imageMsg()} isMine={false} />);
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/u1"));
    await act(async () => { fireEvent.error(container.querySelector("img")); });
    expect(mocks.invalidateSignedUrl).toHaveBeenCalledWith("k/a.jpg");
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/u2"));
    expect(screen.queryByText("Photo indisponible")).toBeNull();
  });

  it("image : si la 2e URL échoue aussi, repli « Photo indisponible » (une seule re-signature, pas de boucle)", async () => {
    const { container } = render(<MessageBubbleMedia m={imageMsg()} isMine={false} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    await act(async () => { fireEvent.error(container.querySelector("img")); });
    await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("https://signed.test/u2"));
    await act(async () => { fireEvent.error(container.querySelector("img")); });
    expect(await screen.findByText("Photo indisponible")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(mocks.invalidateSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("vidéo : même re-signature, puis repli « Vidéo indisponible »", async () => {
    const m = { id: "m2", kind: "video", media_path: "k/v.mp4", media_meta: {} };
    const { container } = render(<MessageBubbleMedia m={m} isMine={false} />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    await act(async () => { fireEvent.error(container.querySelector("video")); });
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toBe("https://signed.test/u2"));
    await act(async () => { fireEvent.error(container.querySelector("video")); });
    expect(await screen.findByText("Vidéo indisponible")).toBeInTheDocument();
  });

  it("vidéo : lecture en ligne sur iPhone (playsInline) et métadonnées seulement (data limitée)", async () => {
    const m = { id: "m2", kind: "video", media_path: "k/v.mp4", media_meta: {} };
    const { container } = render(<MessageBubbleMedia m={m} isMine={false} />);
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const video = container.querySelector("video");
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    expect(video.autoplay).toBe(false);
  });

  it("audio : une erreur de chargement tente d'abord une URL neuve avant de conclure « illisible »", async () => {
    const m = { id: "m3", kind: "audio", media_path: "k/v.m4a", media_meta: {} };
    const { container } = render(<MessageBubbleMedia m={m} isMine={false} />);
    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://signed.test/u1"));
    await act(async () => { fireEvent.error(container.querySelector("audio")); });
    await waitFor(() => expect(container.querySelector("audio")?.getAttribute("src")).toBe("https://signed.test/u2"));
    expect(screen.queryByText(/ne peut pas être lu/)).toBeNull();
    await act(async () => { fireEvent.error(container.querySelector("audio")); });
    expect(await screen.findByText(/ne peut pas être lu/)).toBeInTheDocument();
  });

  it("image : réserve la place avant chargement quand les dimensions sont connues (aspect-ratio)", async () => {
    const { container } = render(<MessageBubbleMedia m={imageMsg({ width: 1600, height: 1200 })} isMine={false} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img").style.aspectRatio).toBe("1600 / 1200");
  });

  it("image sans dimensions connues (anciens messages) : pas d'aspect-ratio forcé", async () => {
    const { container } = render(<MessageBubbleMedia m={imageMsg()} isMine={false} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img").style.aspectRatio).toBe("");
  });

  it("image : chargement paresseux et décodage asynchrone", async () => {
    const { container } = render(<MessageBubbleMedia m={imageMsg()} isMine={false} />);
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    const img = container.querySelector("img");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });
});
