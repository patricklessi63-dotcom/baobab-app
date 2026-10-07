import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Audit médias mobiles (6 oct. 2026) : sur Android/Windows, une photo peut
// arriver avec un file.type VIDE. Le sélecteur de photos du composeur filtrait
// avec f.type.startsWith("image/") : le fichier était écarté SANS AUCUN message
// (la sélection « ne faisait rien »). Il doit maintenant être reconnu par son
// extension, nettoyé (EXIF/GPS retirés par le canvas) et ajouté au post avec
// un type image/jpeg ; un fichier qui n'est pas une photo doit être signalé.

vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));
vi.mock("../../lib/uploadWithProgress", () => ({ uploadWithProgress: () => Promise.resolve() }));

function makeQueryBuilder(result) {
  const builder = {};
  ["select", "eq", "neq", "gt", "gte", "lt", "lte", "order", "range", "limit", "is", "in", "ilike", "or", "match", "contains", "not"].forEach((m) => {
    builder[m] = vi.fn(() => builder);
  });
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: vi.fn(() => makeQueryBuilder({ data: [], error: null })),
    channel: vi.fn(() => { const ch = {}; ch.on = vi.fn(() => ch); ch.subscribe = vi.fn(() => ch); return ch; }),
    removeChannel: vi.fn(),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: "" } })) })) },
  },
}));

import PostsFeed from "./PostsFeed";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  globalThis.createImageBitmap = vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() }));
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toBlob = vi.fn((cb, type) => cb(new Blob([new Uint8Array(100)], { type })));
});

async function openComposer(onError) {
  const user = userEvent.setup();
  await act(async () => { render(<PostsFeed currentUser={{ id: "u1", user_id: "a1", name: "Moi" }} onError={onError} />); });
  await user.click(await screen.findByText("Partage quelque chose avec la communauté..."));
  await screen.findByPlaceholderText("Écris ton message...");
  return document.querySelector('input[type="file"][accept="image/*"]');
}

describe("PostsFeed — photo sans type MIME déclaré", () => {
  it("une photo IMG_0001.JPG à file.type vide est acceptée, nettoyée et ajoutée en image/jpeg", async () => {
    const onError = vi.fn();
    const input = await openComposer(onError);
    const file = new File([JPEG_BYTES], "IMG_0001.JPG", { type: "" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const preview = URL.createObjectURL.mock.calls[0][0];
    expect(preview.type).toBe("image/jpeg");
    expect(preview.name).toBe("IMG_0001.jpg");
    expect(onError).not.toHaveBeenCalled();
  });

  it("un fichier qui n'est pas une photo est signalé au lieu d'être écarté en silence", async () => {
    const onError = vi.fn();
    const input = await openComposer(onError);
    const file = new File(["hello"], "notes.txt", { type: "" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Seules les photos peuvent être ajoutées ici.");
  });
});
