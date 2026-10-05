import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageBubbleMedia from "./MessageBubbleMedia";

// Carte "événement" partagée dans une conversation : pour un événement non
// public, la couverture (URL signée du bucket privé) n'est plus embarquée dans
// media_meta (voir lib/events/shareCard.js). La carte doit s'afficher
// proprement sans couverture : dégradé de repli, aucun <img> cassé, aucun crash.

vi.mock("../../hooks/useSignedMediaUrl", () => ({ useSignedMediaUrl: () => ({ url: null }) }));
vi.mock("../../lib/signedUrlCache", () => ({ getSignedUrl: vi.fn() }));
vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

const base = {
  kind: "event",
  media_meta: {
    event_id: "e1",
    title: "Soirée Baobab",
    cover_url: null,
    event_date: "2026-11-01T18:00:00Z",
    timezone: "America/Toronto",
    city: "Montréal",
  },
};

describe("MessageBubbleMedia — carte événement", () => {
  it("sans couverture : affiche titre/ville, bandeau sans url(), aucune image", () => {
    const { container } = render(<MessageBubbleMedia m={base} isMine={false} />);
    expect(screen.getByText("Soirée Baobab")).toBeInTheDocument();
    expect(screen.getByText(/Montréal/)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    const banner = container.querySelector(".h-20");
    // Pas de background-image: url(...) : rien à charger, donc rien de cassé.
    expect(banner.getAttribute("style") || "").not.toContain("url(");
  });

  it("media_meta partiel (sans cover_url ni date) : pas de crash", () => {
    const { container } = render(<MessageBubbleMedia m={{ kind: "event", media_meta: { title: "X" } }} isMine />);
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("media_meta absent : titre générique, pas de crash", () => {
    render(<MessageBubbleMedia m={{ kind: "event" }} isMine={false} />);
    expect(screen.getByText("Événement")).toBeInTheDocument();
  });

  it("événement public avec couverture : l'image de couverture est utilisée", () => {
    const m = { ...base, media_meta: { ...base.media_meta, cover_url: "https://example.com/c.jpg" } };
    const { container } = render(<MessageBubbleMedia m={m} isMine={false} />);
    expect(container.querySelector(".h-20").getAttribute("style")).toContain("https://example.com/c.jpg");
  });
});
