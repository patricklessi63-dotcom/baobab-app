import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MediaViewerModal from "./MediaViewerModal";

// Visualiseur plein écran (galerie profil/publications/messagerie, via
// ImageLightboxContext) : ce test couvre directement les cas limites de
// navigation jamais audités jusqu'ici — une seule photo, les bornes de la
// galerie, une image qui échoue à charger, et la réinitialisation de l'état
// (zoom/erreur) au changement de photo.

const photos = [
  { url: "https://example.com/a.jpg", alt: "Photo A" },
  { url: "https://example.com/b.jpg", alt: "Photo B" },
  { url: "https://example.com/c.jpg", alt: "Photo C" },
];

describe("MediaViewerModal", () => {
  it("une seule photo : ni flèches ni compteur, juste la photo et le bouton fermer", () => {
    render(
      <MediaViewerModal images={[photos[0]]} index={0} onNavigate={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.queryByRole("button", { name: "Image précédente" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Image suivante" })).toBeNull();
    expect(screen.queryByText("1 / 1")).toBeNull();
    expect(screen.getByRole("button", { name: "Fermer l'image" })).toBeInTheDocument();
  });

  it("plusieurs photos : le compteur s'affiche et les flèches sont désactivées aux bornes", () => {
    const { rerender } = render(
      <MediaViewerModal images={photos} index={0} onNavigate={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Image précédente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Image suivante" })).not.toBeDisabled();

    rerender(<MediaViewerModal images={photos} index={2} onNavigate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Image suivante" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Image précédente" })).not.toBeDisabled();
  });

  it("cliquer sur suivante/précédente appelle onNavigate avec l'index voisin, jamais hors bornes", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<MediaViewerModal images={photos} index={1} onNavigate={onNavigate} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Image suivante" }));
    expect(onNavigate).toHaveBeenCalledWith(2);
    await user.click(screen.getByRole("button", { name: "Image précédente" }));
    expect(onNavigate).toHaveBeenCalledWith(0);
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("flèche désactivée en bout de galerie : le clic ne déclenche pas onNavigate (pas de boucle, pas d'index invalide)", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<MediaViewerModal images={photos} index={2} onNavigate={onNavigate} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Image suivante" }));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("les flèches clavier respectent aussi les bornes de la galerie", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<MediaViewerModal images={photos} index={0} onNavigate={onNavigate} onClose={vi.fn()} />);
    await user.keyboard("{ArrowLeft}");
    expect(onNavigate).not.toHaveBeenCalled();
    await user.keyboard("{ArrowRight}");
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it("une image qui échoue à charger affiche un état d'erreur visible plutôt qu'une case vide", () => {
    render(<MediaViewerModal images={[photos[0]]} index={0} onNavigate={vi.fn()} onClose={vi.fn()} />);
    expect(document.querySelector("img")).toHaveAttribute("src", photos[0].url);
    fireEvent.error(document.querySelector("img"));
    expect(screen.getByText("Image indisponible.")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("changer de photo après une erreur réinitialise l'état : la photo suivante (valide) ne reste pas bloquée sur le message d'erreur précédent", () => {
    const { rerender } = render(
      <MediaViewerModal images={photos} index={0} onNavigate={vi.fn()} onClose={vi.fn()} />
    );
    fireEvent.error(document.querySelector("img"));
    expect(screen.getByText("Image indisponible.")).toBeInTheDocument();

    // Navigue vers la photo suivante (valide) — même famille de scénario que
    // la navigation via la flèche : le composant reçoit un nouvel `index`.
    rerender(<MediaViewerModal images={photos} index={1} onNavigate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText("Image indisponible.")).toBeNull();
    expect(document.querySelector("img")).toHaveAttribute("src", photos[1].url);
  });

  it("changer de photo pendant un zoom actif réinitialise le zoom/pan (pas de recadrage hérité de la photo précédente)", () => {
    const { rerender } = render(
      <MediaViewerModal images={photos} index={0} onNavigate={vi.fn()} onClose={vi.fn()} />
    );
    // Zoom avant via le raccourci clavier "+"
    fireEvent.keyDown(window, { key: "+" });
    let img = document.querySelector("img");
    expect(img.style.transform).toContain("scale(1.5)");

    rerender(<MediaViewerModal images={photos} index={1} onNavigate={vi.fn()} onClose={vi.fn()} />);
    img = document.querySelector("img");
    expect(img.style.transform).toContain("scale(1)");
    expect(img.style.transform).toContain("translate(0px, 0px)");
  });
});
