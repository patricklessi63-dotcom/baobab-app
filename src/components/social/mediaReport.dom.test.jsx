import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
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

import CommunityPostCard from "./CommunityPostCard";
import PublicProfileModal from "./PublicProfileModal";

vi.mock("../../lib/moderationApi", () => ({
  fetchHiddenMedia: vi.fn().mockResolvedValue(new Set(["ph2"])),
  reportMedia: vi.fn(),
  isModerationMissing: () => false,
}));

const cpost = { id: "c1", body: "Ma sortie", author_id: "author-1", created_at: "2026-11-01T12:00:00Z", media_url: "https://x/c.jpg", media_kind: "photo", profiles: { name: "Awa" } };
const renderCommunity = (props) => render(
  <CommunityPostCard post={cpost} currentUserId="viewer-1" reactionCounts={{}} myReaction={null} commentCount={0} comments={[]} commentsLoaded={false}
    onReact={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()} onEditComment={vi.fn()} onReport={vi.fn()} onReportComment={vi.fn()} onDelete={vi.fn()} onDeleteComment={vi.fn()} {...props} />
);

describe("CommunityPostCard — signalement et masquage d'une image", () => {
  it("signale la publication de communauté (kind community_post)", () => {
    const onReportMedia = vi.fn();
    renderCommunity({ onReportMedia });
    fireEvent.click(screen.getByRole("button", { name: "Signaler l'image" }));
    expect(onReportMedia).toHaveBeenCalledWith({ kind: "community_post", id: "c1" });
  });
  it("pas de bouton sur sa propre publication ; image masquée remplacée par un message", () => {
    renderCommunity({ onReportMedia: vi.fn(), currentUserId: "author-1" });
    expect(screen.queryByRole("button", { name: "Signaler l'image" })).not.toBeInTheDocument();
    cleanup();
    const { container } = renderCommunity({ onReportMedia: vi.fn(), mediaHidden: true });
    expect(screen.getByRole("status")).toHaveTextContent("Image masquée en attendant l'examen d'un modérateur.");
    expect(container.querySelector("img[src='https://x/c.jpg']")).toBeNull();
  });
});

describe("PublicProfileModal — photos signalées", () => {
  const photos = [{ id: "ph1", url: "https://x/1.jpg" }, { id: "ph2", url: "https://x/2.jpg" }];
  it("une photo masquée par la modération disparaît de la galerie ; les autres restent", async () => {
    const { container } = render(<PublicProfileModal profile={{ id: "u1", name: "Awa", age: 29 }} photos={photos} onClose={vi.fn()} onReport={vi.fn()} />);
    await waitFor(() => expect(container.querySelector("img[src='https://x/1.jpg']")).not.toBeNull());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Photo suivante" })).not.toBeInTheDocument());
    expect(container.querySelector("img[src='https://x/2.jpg']")).toBeNull();
  });
  it("« Signaler cette photo » vise la photo affichée (profile_photo) ; sans identifiant, l'avatar", async () => {
    render(<PublicProfileModal profile={{ id: "u1", name: "Awa", age: 29 }} photos={[{ id: "ph1", url: "https://x/1.jpg" }]} onClose={vi.fn()} onReport={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Signaler cette photo" }));
    expect(await screen.findByRole("dialog", { name: "Signaler cette image" })).toBeInTheDocument();
    cleanup();
    render(<PublicProfileModal profile={{ id: "u1", name: "Awa", age: 29, avatar_url: "https://x/av.jpg" }} photos={[]} onClose={vi.fn()} onReport={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Signaler cette photo" })).toBeInTheDocument();
  });
  it("pas de bouton sans fonction de signalement (son propre profil)", () => {
    render(<PublicProfileModal profile={{ id: "u1", name: "Awa", age: 29 }} photos={photos} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Signaler cette photo" })).not.toBeInTheDocument();
  });
});
