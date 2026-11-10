import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PostCard from "./PostCard";

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));

const post = { id: "p1", body: "Bonjour la diaspora", author_id: "author-1", created_at: "2024-01-01T12:00:00Z", profiles: { name: "Awa" } };

function setup(props) {
  return render(
    <PostCard post={post} currentUserId="viewer-1" liked={false} likeCount={0} onToggleLike={vi.fn()} onLoadComments={vi.fn()} onSubmitComment={vi.fn()} onReport={vi.fn()} onDelete={vi.fn()} onEdit={vi.fn()} {...props} />
  );
}

describe("PostCard — enregistrer dans une collection (Premium)", () => {
  it("sans onSave (Premium non ouvert), aucun bouton d'enregistrement n'apparaît", () => {
    setup();
    expect(screen.queryByRole("button", { name: /enregistrer dans une collection/i })).toBeNull();
  });

  it("avec onSave, le bouton appelle onSave avec la publication", () => {
    const onSave = vi.fn();
    setup({ onSave });
    fireEvent.click(screen.getByRole("button", { name: /enregistrer dans une collection/i }));
    expect(onSave).toHaveBeenCalledWith(post);
  });
});
