import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PostCard from "./PostCard";
import StoryViewerModal from "./StoryViewerModal";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

afterEach(cleanup);

const post = { id: "p1", body: "Ma photo", author_id: "author-1", created_at: "2026-11-01T12:00:00Z", profiles: { name: "Awa" }, post_media: [{ url: "https://x/a.jpg", kind: "photo" }] };
const renderPost = (props) => render(
  <PostCard post={post} currentUserId="viewer-1" liked={false} likeCount={0} onToggleLike={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()} onReport={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} {...props} />
);

describe("PostCard — signalement et masquage d'une image", () => {
  it("le bouton « Signaler l'image » signale la publication", () => {
    const onReportMedia = vi.fn();
    renderPost({ onReportMedia });
    fireEvent.click(screen.getByRole("button", { name: "Signaler l'image" }));
    expect(onReportMedia).toHaveBeenCalledWith({ kind: "post", id: "p1" });
  });
  it("pas de bouton sur sa propre publication ni sans image", () => {
    renderPost({ onReportMedia: vi.fn(), currentUserId: "author-1" });
    expect(screen.queryByRole("button", { name: "Signaler l'image" })).not.toBeInTheDocument();
    cleanup();
    render(<PostCard post={{ ...post, post_media: [] }} currentUserId="viewer-1" liked={false} likeCount={0} onToggleLike={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()} onReport={vi.fn()} onReportMedia={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Signaler l'image" })).not.toBeInTheDocument();
  });
  it("image masquée par la modération : remplacée par un message, aucune balise image", () => {
    const { container } = renderPost({ onReportMedia: vi.fn(), mediaHidden: true });
    expect(screen.getByRole("status")).toHaveTextContent("Image masquée en attendant l'examen d'un modérateur.");
    expect(container.querySelector("img[src='https://x/a.jpg']")).toBeNull();
  });
  it("image visible : affichée normalement", () => {
    const { container } = renderPost({ onReportMedia: vi.fn(), mediaHidden: false });
    expect(container.querySelector("img[src='https://x/a.jpg']")).not.toBeNull();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

const story = { id: "s1", profile_id: "author-1", name: "Awa", initial: "A", text: "", media_url: "https://x/s.jpg", media_kind: "photo", own: false, created_at: "2026-11-04T12:00:00Z" };
const renderStory = (storyProps, extra) => render(
  <StoryViewerModal storyViewerIndex={0} stories={[{ ...story, ...storyProps }]} storyReply="" storyViewersOpen={false} storyViewers={[]} storyViewersLoading={false} storyViewCount={0} myStoryReaction={null}
    closeStoryViewer={vi.fn()} prevStory={vi.fn()} nextStory={vi.fn()} deleteOwnStory={vi.fn()} setStoryReply={vi.fn()} sendStoryReply={vi.fn()} openStoryViewers={vi.fn()} closeStoryViewers={vi.fn()}
    sendStoryReaction={vi.fn()} onOpenProfile={vi.fn()} onReport={vi.fn()} onBlock={vi.fn()} {...extra} />
);

describe("StoryViewerModal — « Signaler cette image »", () => {
  it("le menu propose de signaler l'image d'un statut photo et ferme la visionneuse", () => {
    const onReportMedia = vi.fn();
    const closeStoryViewer = vi.fn();
    renderStory({}, { onReportMedia, closeStoryViewer });
    fireEvent.click(screen.getByRole("button", { name: "Signaler ou bloquer" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Signaler cette image/ }));
    expect(onReportMedia).toHaveBeenCalledWith({ kind: "story", id: "s1" });
    expect(closeStoryViewer).toHaveBeenCalled();
  });
  it("absent pour un statut texte seul", () => {
    renderStory({ media_url: null, media_kind: null, text: "Salut" }, { onReportMedia: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: "Signaler ou bloquer" }));
    expect(screen.queryByRole("menuitem", { name: /Signaler cette image/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Signaler/ })).toBeInTheDocument();
  });
});
