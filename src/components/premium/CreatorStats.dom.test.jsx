import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../supabaseClient", () => ({ supabase: {} }));
const usePremiumStatusMock = vi.hoisted(() => vi.fn());
vi.mock("../../lib/premium/usePremiumStatus", () => ({ usePremiumStatus: (...a) => usePremiumStatusMock(...a) }));
const rpcStats = vi.hoisted(() => vi.fn());
vi.mock("../../lib/premium/creatorStats", async (importActual) => {
  const actual = await importActual();
  return { ...actual, loadCreatorStats: (...a) => rpcStats(...a) };
});

import CreatorStats from "./CreatorStats";
import { normalizeStats } from "../../lib/premium/creatorStats";
import { setPremiumNavigator, consumePremiumIntent, setPremiumIntent } from "../../lib/premium/premiumIntent";

const user = { id: "u1" };
const FULL = normalizeStats({
  period_days: 30, posts_total: 4, posts_period: 2, likes_total: 12, likes_period: 5,
  comments_total: 3, comments_period: 1, followers_total: 9, followers_period: 2,
  top_posts: [
    { id: "p1", excerpt: "Notre sortie au parc Jean-Drapeau", likes: 6, comments: 2 },
    { id: "p2", excerpt: "Une recette de mafé", likes: 1, comments: 1 },
  ],
  weekly: [
    { week: "2026-10-26", posts: 1, likes: 2, comments: 0 },
    { week: "2026-11-02", posts: 1, likes: 3, comments: 1 },
  ],
});

beforeEach(() => {
  rpcStats.mockReset();
  usePremiumStatusMock.mockReturnValue({ isPremium: true, loading: false });
  setPremiumNavigator(null);
  setPremiumIntent(null);
});

describe("CreatorStats — abonné", () => {
  it("affiche les vrais chiffres, les meilleures publications et l'évolution", async () => {
    rpcStats.mockResolvedValue(FULL);
    render(<CreatorStats currentUser={user} />);
    expect(await screen.findByText("12")).toBeInTheDocument();           // j'aime reçus
    expect(screen.getByText("9")).toBeInTheDocument();                    // abonnés
    expect(screen.getByText(/5 sur 30 jours/)).toBeInTheDocument();
    expect(screen.getByText(/2 de plus sur 30 jours/)).toBeInTheDocument();
    expect(screen.getByText(/notre sortie au parc jean-drapeau/i)).toBeInTheDocument();
    expect(screen.getByText(/6 j'aime · 2 commentaires/)).toBeInTheDocument();
    expect(screen.getByText(/1 j'aime · 1 commentaire$/)).toBeInTheDocument();
    expect(screen.getByLabelText(/interactions reçues par semaine/i)).toBeInTheDocument();
    expect(screen.getByText(/4 interactions/)).toBeInTheDocument();      // 3 j'aime + 1 commentaire
    expect(rpcStats).toHaveBeenCalledWith(30);
  });

  it("dit que Baobab ne suit pas les visites, au lieu d'afficher un compteur de vues", async () => {
    rpcStats.mockResolvedValue(FULL);
    render(<CreatorStats currentUser={user} />);
    expect(await screen.findByText(/ne suit pas qui consulte ton profil/i)).toBeInTheDocument();
    expect(screen.queryByText(/visites|vues\b|impressions/i)).toBeNull();
  });

  it("changer de période relance le calcul avec la bonne durée", async () => {
    rpcStats.mockResolvedValue(FULL);
    render(<CreatorStats currentUser={user} />);
    await screen.findByText("12");
    fireEvent.click(screen.getByRole("button", { name: "90 jours" }));
    await waitFor(() => expect(rpcStats).toHaveBeenLastCalledWith(90));
    expect(screen.getByRole("button", { name: "90 jours" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 jours" })).toHaveAttribute("aria-pressed", "false");
  });

  it("compte vide : le dit clairement", async () => {
    rpcStats.mockResolvedValue(normalizeStats({}));
    render(<CreatorStats currentUser={user} />);
    expect(await screen.findByText(/rien à mesurer pour l'instant/i)).toBeInTheDocument();
  });

  it("erreur : message lisible et bouton Réessayer qui relance", async () => {
    rpcStats.mockRejectedValueOnce({ message: "network" });
    render(<CreatorStats currentUser={user} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/impossible de charger/i);
    rpcStats.mockResolvedValueOnce(FULL);
    fireEvent.click(screen.getByRole("button", { name: /réessayer/i }));
    expect(await screen.findByText("12")).toBeInTheDocument();
  });

  it("fonction pas encore déployée côté base : message dédié", async () => {
    rpcStats.mockRejectedValueOnce({ code: "PGRST202", message: "Could not find the function" });
    render(<CreatorStats currentUser={user} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/pas encore disponibles/i);
  });
});

describe("CreatorStats — compte gratuit", () => {
  beforeEach(() => usePremiumStatusMock.mockReturnValue({ isPremium: false, loading: false }));

  it("montre la fiche Premium, sans aucun chiffre ni appel au serveur", () => {
    render(<CreatorStats currentUser={user} />);
    expect(screen.getByText(/comprendre ce qui plaît dans ce que tu partages/i)).toBeInTheDocument();
    expect(rpcStats).not.toHaveBeenCalled();
    expect(screen.queryByText("12")).toBeNull();
  });

  it("'Passer à Premium' ouvre les formules ; 'Découvrir Premium' n'ajoute aucune intention", () => {
    const go = vi.fn();
    setPremiumNavigator(go);
    render(<CreatorStats currentUser={user} />);
    fireEvent.click(screen.getByRole("button", { name: /^passer à premium$/i }));
    expect(go).toHaveBeenCalledTimes(1);
    expect(consumePremiumIntent()).toBe("plans");
    fireEvent.click(screen.getByRole("button", { name: /^découvrir premium$/i }));
    expect(go).toHaveBeenCalledTimes(2);
    expect(consumePremiumIntent()).toBeNull();
  });
});

describe("CreatorStats — chargement du statut", () => {
  it("n'affiche pas de faux verrou pendant la vérification", () => {
    usePremiumStatusMock.mockReturnValue({ isPremium: false, loading: true });
    render(<CreatorStats currentUser={user} />);
    expect(screen.getByRole("status")).toHaveTextContent(/chargement/i);
    expect(screen.queryByText(/passer à premium/i)).toBeNull();
    expect(rpcStats).not.toHaveBeenCalled();
  });
});
