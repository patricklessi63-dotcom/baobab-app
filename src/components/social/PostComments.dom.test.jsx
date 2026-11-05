import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import PostComments from "./PostComments";

afterEach(cleanup);

const c = (id, name, body, extra = {}) => ({ id, author_id: `a-${id}`, body, created_at: `2026-11-0${Number(String(id).replace(/\D/g, "") || 1) % 9 + 1}T10:00:00Z`, profiles: { name }, ...extra });
const setup = (props = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(true);
  const utils = render(<PostComments comments={[]} currentUserId="me" onSubmit={onSubmit} {...props} />);
  return { onSubmit, ...utils };
};
const texts = (container) => [...container.querySelectorAll("p")].map((p) => p.textContent);

describe("PostComments — fil de discussion", () => {
  it("les réponses s'affichent sous leur commentaire, décalées ; une réponse orpheline devient un commentaire", () => {
    const { container } = setup({ comments: [
      c("c1", "Awa", "Question"), c("c2", "Zoe", "Réponse", { parent_id: "c1" }), c("c3", "Max", "Autre", {}), c("c4", "Lea", "Orpheline", { parent_id: "inconnu" }),
    ] });
    expect(texts(container)).toEqual(["Question", "Réponse", "Autre", "Orpheline"]);
  });

  it("répondre : le champ propose « Répondre à … », préremplit « @Nom » et envoie parentId + mention", async () => {
    const { onSubmit } = setup({ comments: [c("c1", "Awa", "Question")] });
    fireEvent.click(screen.getByRole("button", { name: "Répondre à Awa" }));
    expect(screen.getByText(/Réponse à Awa/)).toBeInTheDocument();
    const input = screen.getByLabelText("Écrire un commentaire");
    expect(input.value).toBe("@Awa ");
    fireEvent.change(input, { target: { value: "@Awa merci beaucoup" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("@Awa merci beaucoup", { parentId: "c1", mentions: [{ id: "a-c1", name: "Awa" }] }));
    expect(screen.queryByText(/Réponse à Awa/)).not.toBeInTheDocument();
  });

  it("répondre à une RÉPONSE rattache au commentaire racine", async () => {
    const { onSubmit } = setup({ comments: [c("c1", "Awa", "Question"), c("c2", "Zoe", "Réponse", { parent_id: "c1" })] });
    fireEvent.click(screen.getByRole("button", { name: "Répondre à Zoe" }));
    fireEvent.change(screen.getByLabelText("Écrire un commentaire"), { target: { value: "@Zoe d'accord" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("@Zoe d'accord", expect.objectContaining({ parentId: "c1" })));
  });

  it("annuler la réponse retire le « @Nom » préparé", () => {
    setup({ comments: [c("c1", "Awa", "Question")] });
    fireEvent.click(screen.getByRole("button", { name: "Répondre à Awa" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler la réponse" }));
    expect(screen.getByLabelText("Écrire un commentaire").value).toBe("");
  });

  it("commentaire simple : appel à UN argument, comme avant (contrat historique)", async () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText("Écrire un commentaire"), { target: { value: "Bravo" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]).toEqual(["Bravo"]);
  });

  it("échec d'envoi : le texte et la réponse en cours sont restitués", async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    setup({ onSubmit, comments: [c("c1", "Awa", "Question")] });
    fireEvent.click(screen.getByRole("button", { name: "Répondre à Awa" }));
    fireEvent.change(screen.getByLabelText("Écrire un commentaire"), { target: { value: "@Awa texte important" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(screen.getByLabelText("Écrire un commentaire").value).toBe("@Awa texte important"));
    expect(screen.getByText(/Réponse à Awa/)).toBeInTheDocument();
  });

  it("pas de bouton « Répondre » sur ses propres commentaires", () => {
    setup({ currentUserId: "a-c1", comments: [c("c1", "Moi", "Mon commentaire")] });
    expect(screen.queryByRole("button", { name: /Répondre à/ })).not.toBeInTheDocument();
  });

  it("pagination : cinq commentaires d'abord, puis « Voir plus »", () => {
    const many = Array.from({ length: 8 }, (_, i) => c(`c${i + 1}`, "Awa", `Texte ${i + 1}`, { created_at: `2026-11-01T10:0${i}:00Z` }));
    const { container } = setup({ comments: many });
    expect(texts(container)).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /Voir plus de commentaires \(3\)/ }));
    expect(texts(container)).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /Voir plus de commentaires/ })).not.toBeInTheDocument();
  });

  it("réponses : deux visibles, le reste derrière « Voir les N réponses »", () => {
    const comments = [c("c1", "Awa", "Racine"), ...[2, 3, 4, 5].map((n) => c(`c${n}`, `R${n}`, `Rep ${n}`, { parent_id: "c1", created_at: `2026-11-01T10:0${n}:00Z` }))];
    const { container } = setup({ comments });
    expect(texts(container)).toEqual(["Racine", "Rep 2", "Rep 3"]);
    fireEvent.click(screen.getByRole("button", { name: "Voir les 4 réponses" }));
    expect(texts(container)).toEqual(["Racine", "Rep 2", "Rep 3", "Rep 4", "Rep 5"]);
  });

  it("tri : récents d'abord, plus anciens d'abord, plus pertinents (le plus de réponses) d'abord", () => {
    const comments = [
      c("c1", "A", "Ancien", { created_at: "2026-11-01T10:00:00Z" }),
      c("c2", "B", "Récent", { created_at: "2026-11-03T10:00:00Z" }),
      c("c3", "C", "Populaire", { created_at: "2026-11-02T10:00:00Z" }),
      c("c4", "D", "rep", { parent_id: "c3", created_at: "2026-11-04T10:00:00Z" }),
    ];
    const { container } = setup({ comments });
    const sort = screen.getByLabelText("Trier les commentaires");
    expect(texts(container)).toEqual(["Ancien", "Populaire", "rep", "Récent"]);
    fireEvent.change(sort, { target: { value: "recent" } });
    expect(texts(container)).toEqual(["Récent", "Populaire", "rep", "Ancien"]);
    fireEvent.change(sort, { target: { value: "relevant" } });
    expect(texts(container)).toEqual(["Populaire", "rep", "Récent", "Ancien"]);
  });

  it("pas de sélecteur de tri avec un seul commentaire", () => {
    setup({ comments: [c("c1", "A", "Seul")] });
    expect(screen.queryByLabelText("Trier les commentaires")).not.toBeInTheDocument();
  });

  it("signaler et bloquer l'auteur d'un commentaire restent disponibles", () => {
    const onReportComment = vi.fn(); const onBlockAuthor = vi.fn();
    setup({ comments: [c("c1", "Awa", "Texte")], onReportComment, onBlockAuthor });
    fireEvent.click(screen.getByRole("button", { name: "Signaler ce commentaire" }));
    expect(onReportComment).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));
    fireEvent.click(screen.getByRole("button", { name: "Bloquer l'auteur de ce commentaire" }));
    expect(onBlockAuthor).toHaveBeenCalledWith({ id: "a-c1", name: "Awa" });
  });

  it("les mentions enregistrées sont surlignées et ouvrent la fiche", () => {
    const onOpenProfile = vi.fn();
    setup({ onOpenProfile, comments: [c("c1", "Zoe", "Salut @Awa !", { mentions: [{ id: "u-awa", name: "Awa" }] })] });
    fireEvent.click(screen.getByRole("button", { name: "@Awa" }));
    expect(onOpenProfile).toHaveBeenCalledWith("u-awa");
  });
});

describe("PostComments — saisie avec mentions", () => {
  const people = [{ id: "u1", name: "Awa Diop", avatar_url: null }, { id: "u2", name: "Awa Sy", avatar_url: null }];

  it("« @aw » propose des personnes ; en choisir une insère « @Nom » et l'envoie comme mention", async () => {
    const search = vi.fn().mockResolvedValue(people);
    const { onSubmit } = setup({ onSearchMentions: search });
    const input = screen.getByLabelText("Écrire un commentaire");
    fireEvent.change(input, { target: { value: "Salut @aw", selectionStart: 9 } });
    input.setSelectionRange(9, 9);
    fireEvent.change(input, { target: { value: "Salut @aw" } });
    const list = await screen.findByRole("listbox", { name: "Personnes à mentionner" });
    expect(search).toHaveBeenCalledWith("aw");
    fireEvent.click(within(list).getByRole("button", { name: /Awa Sy/ }));
    expect(input.value).toBe("Salut @Awa Sy ");
    fireEvent.change(input, { target: { value: "Salut @Awa Sy bienvenue" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Salut @Awa Sy bienvenue", { mentions: [{ id: "u2", name: "Awa Sy" }] }));
  });

  it("taper « @nom » sans choisir dans la liste n'envoie AUCUNE mention", async () => {
    const { onSubmit } = setup({ onSearchMentions: vi.fn().mockResolvedValue([]) });
    fireEvent.change(screen.getByLabelText("Écrire un commentaire"), { target: { value: "Hello @quelquun" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Hello @quelquun"));
  });

  it("effacer le « @Nom » après l'avoir choisi retire la mention", async () => {
    const { onSubmit } = setup({ onSearchMentions: vi.fn().mockResolvedValue(people) });
    const input = screen.getByLabelText("Écrire un commentaire");
    fireEvent.change(input, { target: { value: "@aw" } });
    input.setSelectionRange(3, 3);
    fireEvent.change(input, { target: { value: "@aw" } });
    fireEvent.click(await screen.findByRole("button", { name: /Awa Diop/ }));
    fireEvent.change(input, { target: { value: "finalement rien" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("finalement rien"));
  });

  it("Échap ferme la liste sans envoyer ; la flèche et Entrée choisissent au clavier", async () => {
    const { onSubmit } = setup({ onSearchMentions: vi.fn().mockResolvedValue(people) });
    const input = screen.getByLabelText("Écrire un commentaire");
    fireEvent.change(input, { target: { value: "@aw" } });
    input.setSelectionRange(3, 3);
    fireEvent.change(input, { target: { value: "@aw" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    input.setSelectionRange(4, 4);
    fireEvent.change(input, { target: { value: "@awa" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("@Awa Sy ");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sans fonction de recherche : champ ordinaire, aucune liste", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Écrire un commentaire"), { target: { value: "@aw" } });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

describe("PostComments — j'aime sur les commentaires (SQL-35)", () => {
  it("bouton cœur avec compteur ; touche = bascule ; pressed reflète MES j'aime", () => {
    const onToggleLike = vi.fn();
    setup({ comments: [c("c1", "Awa", "A"), c("c2", "Zoe", "B")], likeCounts: { c1: 3, c2: 0 }, myLikes: new Set(["c1"]), onToggleLike });
    const mine = screen.getByRole("button", { name: "Retirer mon j'aime" });
    expect(mine).toHaveAttribute("aria-pressed", "true");
    expect(mine.textContent).toContain("3");
    const other = screen.getByRole("button", { name: "Aimer ce commentaire" });
    expect(other).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(other);
    expect(onToggleLike).toHaveBeenCalledWith(expect.objectContaining({ id: "c2" }));
  });

  it("sans compteurs (table absente) ou sans fonction : aucun bouton", () => {
    setup({ comments: [c("c1", "Awa", "A")], likeCounts: null, onToggleLike: vi.fn() });
    expect(screen.queryByRole("button", { name: /j'aime|Aimer ce commentaire/ })).not.toBeInTheDocument();
    cleanup();
    setup({ comments: [c("c1", "Awa", "A")], likeCounts: { c1: 1 } });
    expect(screen.queryByRole("button", { name: /j'aime|Aimer ce commentaire/ })).not.toBeInTheDocument();
  });

  it("« Plus pertinents » : les j'aime comptent, une réponse vaut deux j'aime", () => {
    const comments = [
      c("c1", "A", "Peu aimé", { created_at: "2026-11-03T10:00:00Z" }),
      c("c2", "B", "Très aimé", { created_at: "2026-11-01T10:00:00Z" }),
      c("c3", "C", "Une réponse", { created_at: "2026-11-02T10:00:00Z" }),
      c("c4", "D", "rep", { parent_id: "c3", created_at: "2026-11-04T10:00:00Z" }),
    ];
    const { container } = setup({ comments, likeCounts: { c1: 1, c2: 5, c3: 0, c4: 0 }, myLikes: new Set(), onToggleLike: vi.fn() });
    fireEvent.change(screen.getByLabelText("Trier les commentaires"), { target: { value: "relevant" } });
    expect(texts(container)).toEqual(["Très aimé", "Une réponse", "rep", "Peu aimé"]);
  });
});
