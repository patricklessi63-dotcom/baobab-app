import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Étape 3b : partage natif sur les trois sites existants qui utilisaient navigator.share /
// presse-papiers (profil, invitation, communauté). En natif : feuille de partage système avec le
// lien PUBLIC ; sur le web : code d'origine, plugin jamais chargé. Les cartes d'événement
// (shareCard / buildEventShareMeta) sont des partages DANS l'app (conversation, fil) : non concernées.

const ORIGIN = "https://baobab-app-zeta.vercel.app";

const mocks = vi.hoisted(() => ({
  native: true,
  shareNative: vi.fn(),
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("../../lib/platform", () => ({ isNative: () => mocks.native, getPlatform: () => (mocks.native ? "android" : "web") }));
vi.mock("../../lib/nativeShare", () => ({ shareNative: (...a) => mocks.shareNative(...a) }));
vi.mock("../../lib/ImageLightboxContext", () => ({ useImageLightbox: () => ({ openLightbox: vi.fn() }) }));
vi.mock("../../lib/premium/usePremiumStatus", () => ({
  usePremiumStatus: () => ({ isPremium: false, subscription: null, loading: false, error: null, refresh: vi.fn() }),
}));
vi.mock("../../lib/locationApi", () => ({ fetchNearbyProfiles: vi.fn(async () => []) }));

function qb(result = { data: [], error: null, count: 0 }) {
  const b = {};
  ["select", "eq", "neq", "gt", "gte", "lte", "order", "limit", "is", "in", "ilike", "or", "match", "contains", "not", "delete"].forEach((m) => { b[m] = vi.fn(() => b); });
  b.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return b;
}
vi.mock("../../supabaseClient", () => ({
  supabase: {
    from: (...a) => mocks.fromMock(...a),
    rpc: (...a) => mocks.rpcMock(...a),
    storage: { from: vi.fn(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn() })) },
  },
}));

import ProfileTab from "./ProfileTab";
import DiscoverTab from "./DiscoverTab";
import CommunitiesTab from "./CommunitiesTab";

let writeText;
let webShare;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.native = true;
  mocks.shareNative.mockReset().mockResolvedValue({ ok: true });
  mocks.fromMock.mockImplementation(() => qb());
  mocks.rpcMock.mockResolvedValue({ data: null, error: null });
  writeText = vi.fn(() => Promise.resolve());
  webShare = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, "share", { value: webShare, configurable: true });
});
afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
});

// ---------- Profil ----------
function renderProfile() {
  return render(
    <ProfileTab
      currentUser={{ id: "u1", name: "Awa", is_founder: false, email_verified: false, phone_verified: false }}
      openEditProfile={vi.fn()} matches={[]} candidates={[]} profileTab="about" setProfileTab={vi.fn()} goTab={vi.fn()} blockedIds={new Set()}
    />
  );
}

describe("partage du profil", () => {
  it("natif : feuille de partage système, lien PUBLIC (jamais https://localhost), aucun navigator.share", async () => {
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: "Partager mon profil" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalledTimes(1));
    expect(mocks.shareNative).toHaveBeenCalledWith({
      title: "Baobab", text: "Découvre le profil de Awa sur Baobab", url: `${ORIGIN}/`, dialogTitle: "Partager mon profil",
    });
    expect(webShare).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("natif : annulation de la feuille = rien d'autre (pas de copie silencieuse)", async () => {
    mocks.shareNative.mockResolvedValue({ ok: false, cancelled: true });
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: "Partager mon profil" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalled());
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("natif : échec réel -> repli d'origine (copie du lien public)", async () => {
    mocks.shareNative.mockResolvedValue({ ok: false, error: true });
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: "Partager mon profil" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/`));
  });

  it("web : navigator.share d'origine (sans url), le module de partage natif n'est jamais appelé", async () => {
    mocks.native = false;
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: "Partager mon profil" }));
    expect(webShare).toHaveBeenCalledWith({ title: "Baobab", text: "Découvre le profil de Awa sur Baobab" });
    expect(mocks.shareNative).not.toHaveBeenCalled();
  });

  it("web sans navigator.share : copie de window.location.href comme avant", async () => {
    mocks.native = false;
    delete navigator.share;
    renderProfile();
    await userEvent.click(screen.getByRole("button", { name: "Partager mon profil" }));
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });
});

// ---------- Invitation (Découverte, pile vide) ----------
function renderDiscover() {
  return render(
    <DiscoverTab
      filteredPeople={[]} topPerson={null} topPhotos={[]} discoverPhotoIndex={0} setDiscoverPhotoIndex={vi.fn()}
      swipeX={0} swipeExit={null} swiping={false} onSwipeStart={vi.fn()} onSwipeMove={vi.fn()} onSwipeEnd={vi.fn()}
      decideSwipe={vi.fn()} currentUser={{ id: "u1", name: "Awa" }}
    />
  );
}

describe("invitation (Découverte)", () => {
  it("natif : feuille de partage système avec le lien public ; « Merci du partage »", async () => {
    renderDiscover();
    await userEvent.click(screen.getByRole("button", { name: "Inviter ma communauté" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalledTimes(1));
    expect(mocks.shareNative).toHaveBeenCalledWith({
      title: "Baobab", text: "Rejoins-moi sur Baobab — la communauté des immigrants au Canada.", url: `${ORIGIN}/`, dialogTitle: "Inviter ma communauté",
    });
    expect(await screen.findByRole("button", { name: "Merci du partage ✓" })).toBeInTheDocument();
    expect(webShare).not.toHaveBeenCalled();
  });

  it("natif : annulation = aucun message, le bouton garde son libellé", async () => {
    mocks.shareNative.mockResolvedValue({ ok: false, cancelled: true });
    renderDiscover();
    await userEvent.click(screen.getByRole("button", { name: "Inviter ma communauté" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Inviter ma communauté" })).toBeInTheDocument();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("natif : échec réel -> copie du lien public + « Lien copié »", async () => {
    mocks.shareNative.mockResolvedValue({ ok: false, error: true });
    renderDiscover();
    await userEvent.click(screen.getByRole("button", { name: "Inviter ma communauté" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${ORIGIN}/`));
    expect(await screen.findByRole("button", { name: "Lien copié ✓" })).toBeInTheDocument();
  });

  it("web : navigator.share d'origine avec le lien, module natif jamais appelé", async () => {
    mocks.native = false;
    renderDiscover();
    await userEvent.click(screen.getByRole("button", { name: "Inviter ma communauté" }));
    await waitFor(() => expect(webShare).toHaveBeenCalledTimes(1));
    expect(webShare.mock.calls[0][0]).toMatchObject({ title: "Baobab", url: `${window.location.origin}/` });
    expect(mocks.shareNative).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Merci du partage ✓" })).toBeInTheDocument();
  });
});

// ---------- Communautés ----------
function community(visibility) {
  return {
    id: "c1", name: "Les Baobabs de Laval", visibility, category: "general", city: "", description: "", rules: "",
    cover_url: null, created_by: "owner1", created_at: new Date().toISOString(),
  };
}
function mockCommunity(comm) {
  mocks.fromMock.mockImplementation((table) => {
    if (table === "communities") {
      const b = {};
      ["select", "eq", "or", "ilike", "order", "limit"].forEach((m) => { b[m] = vi.fn(() => b); });
      b.single = vi.fn(() => Promise.resolve({ data: comm, error: null }));
      b.then = (resolve, reject) => Promise.resolve({ data: [comm], error: null, count: 1 }).then(resolve, reject);
      return b;
    }
    if (table === "community_members") {
      const b = {};
      ["select", "eq", "order", "limit", "delete"].forEach((m) => { b[m] = vi.fn(() => b); });
      b.maybeSingle = vi.fn(() => Promise.resolve({ data: { role: "member" }, error: null }));
      b.then = (resolve, reject) => Promise.resolve({ data: [{ id: "m1", community_id: "c1", role: "member", profile_id: "u1" }], error: null, count: 1 }).then(resolve, reject);
      return b;
    }
    return qb();
  });
}
function renderCommunity() {
  return render(<CommunitiesTab currentUser={{ id: "u1", name: "Membre" }} onError={vi.fn()} initialCommunityId="c1" />);
}

describe("partage d'une communauté", () => {
  it("natif, communauté publique : nom + lien public", async () => {
    mockCommunity(community("public"));
    renderCommunity();
    await userEvent.click(await screen.findByRole("button", { name: "Partager" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalledTimes(1));
    expect(mocks.shareNative).toHaveBeenCalledWith({
      title: "Baobab", text: "Découvre Les Baobabs de Laval sur Baobab !", url: `${ORIGIN}/`, dialogTitle: "Partager",
    });
    expect(webShare).not.toHaveBeenCalled();
  });

  it.each(["private", "invite_only"])("natif, communauté %s : le NOM ne quitte pas l'app (texte générique)", async (visibility) => {
    mockCommunity(community(visibility));
    renderCommunity();
    await userEvent.click(await screen.findByRole("button", { name: "Partager" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalledTimes(1));
    const payload = mocks.shareNative.mock.calls[0][0];
    expect(payload.text).toBe("Rejoins-moi sur Baobab !");
    expect(JSON.stringify(payload)).not.toContain("Baobabs de Laval");
  });

  it("natif : annulation = rien ; échec réel = copie du texte et du lien", async () => {
    mockCommunity(community("public"));
    mocks.shareNative.mockResolvedValueOnce({ ok: false, cancelled: true });
    renderCommunity();
    await userEvent.click(await screen.findByRole("button", { name: "Partager" }));
    await waitFor(() => expect(mocks.shareNative).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    mocks.shareNative.mockResolvedValueOnce({ ok: false, error: true });
    await userEvent.click(screen.getByRole("button", { name: "Partager" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`Découvre Les Baobabs de Laval sur Baobab ! ${ORIGIN}/`));
  });

  it("web : navigator.share d'origine (texte seul, comme avant), module natif jamais appelé", async () => {
    mocks.native = false;
    mockCommunity(community("public"));
    renderCommunity();
    await userEvent.click(await screen.findByRole("button", { name: "Partager" }));
    await waitFor(() => expect(webShare).toHaveBeenCalledWith({ title: "Baobab", text: "Découvre Les Baobabs de Laval sur Baobab !" }));
    expect(mocks.shareNative).not.toHaveBeenCalled();
  });
});
