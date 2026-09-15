import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pushBackEntry } from "../../hooks/useEscapeKey";

// On isole le wizard de Supabase : chaque étape enregistre via
// supabase.from("profiles").update(...).eq(...).select().single().
const single = vi.fn();
const chain = {
  update: vi.fn(() => chain),
  insert: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  select: vi.fn(() => chain),
  single,
};
vi.mock("../../supabaseClient", () => ({
  supabase: { from: vi.fn(() => chain), storage: { from: vi.fn() } },
}));

import OnboardingWizard from "./OnboardingWizard";

function renderWizard(overrides = {}) {
  const props = {
    session: { user: { id: "sess-1" } },
    currentUser: { id: "u1", onboarding_step: 0, usage_goals: "❤️ Rencontre" },
    setCurrentUser: vi.fn(),
    setProfiles: vi.fn(),
    setProfilePhotos: vi.fn(),
    photoFiles: [],
    photoPreviews: [],
    handlePhotosSelected: vi.fn(),
    removePhotoFile: vi.fn(),
    setPhotoFiles: vi.fn(),
    setPhotoPreviews: vi.fn(),
    uploadPhoto: vi.fn(),
    setView: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<OnboardingWizard {...props} />) };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Repart d'un historique propre à chaque test — pushBackEntry (module-scope,
  // voir useEscapeKey.js, déjà utilisé par SocialShell.jsx pour goTab/goBack)
  // pousse de vraies entrées d'historique ; sans ce nettoyage, les entrées
  // poussées par un test précédent resteraient dans l'historique jsdom réel
  // et pourraient décaler les popstate simulés suivants.
  window.history.replaceState(null, "");
});

describe("OnboardingWizard — garde anti-double-submit", () => {
  it("deux clics synchrones sur « Continuer » ne déclenchent qu'un seul saveStep", async () => {
    // single() ne résout pas tout de suite : la garde submitInFlightRef doit
    // tenir pendant que le 1er appel est en vol.
    let resolveSingle;
    single.mockImplementation(() => new Promise((r) => { resolveSingle = r; }));

    renderWizard();
    // étape 1 (Bienvenue) : usage_goals pré-rempli -> bouton actif
    const next = screen.getByRole("button", { name: "Continuer" });
    fireEvent.click(next);
    fireEvent.click(next); // 2e tap immédiat, avant tout re-render

    expect(single).toHaveBeenCalledTimes(1);

    resolveSingle({ data: { id: "u1", onboarding_step: 1 }, error: null });
    await waitFor(() => {
      // on est passé à l'étape 2 (Identité) : le titre « Retour » apparaît
      expect(screen.getByRole("button", { name: /Retour/ })).toBeInTheDocument();
    });
    expect(single).toHaveBeenCalledTimes(1);
  });

  it("navigation avant puis arrière conserve le brouillon (usage_goals coché)", async () => {
    const user = userEvent.setup();
    single.mockResolvedValue({ data: { id: "u1", onboarding_step: 1 }, error: null });

    renderWizard();
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // étape 2
    await screen.findByRole("button", { name: /Retour/ });
    await user.click(screen.getByRole("button", { name: /Retour/ }));

    // de retour à l'étape 1 : le bouton Continuer est toujours actif, ce qui
    // n'est vrai que si draft.usageGoals a été préservé (isStep0Valid).
    const next = screen.getByRole("button", { name: "Continuer" });
    expect(next).toBeEnabled();
  });
});

describe("OnboardingWizard — navigation par historique (retour navigateur/mobile)", () => {
  it("un popstate simulé (bouton/geste retour) après avoir avancé à l'étape 2 restaure l'étape 1 avec le brouillon intact", async () => {
    // Bug corrigé à l'audit résilience onboarding : avant le correctif,
    // goNext()/goBack() ne manipulaient qu'un état React local (`step`),
    // sans jamais pousser d'entrée d'historique (contrairement à
    // SocialShell.jsx/goTab qui traite déjà ce cas pour les onglets). Un
    // popstate (bouton retour matériel Android, geste retour iOS/Android, ou
    // bouton retour du navigateur desktop) n'avait donc RIEN à consommer ici
    // et remontait directement à l'écran réellement précédent dans
    // l'historique du navigateur — souvent l'écran de connexion — au lieu de
    // revenir à l'étape précédente de l'assistant.
    const user = userEvent.setup();
    single.mockResolvedValue({ data: { id: "u1", onboarding_step: 1 }, error: null });

    renderWizard();
    await user.click(screen.getByRole("button", { name: "Continuer" }));

    // étape 2 (Identité)
    await screen.findByRole("button", { name: /Retour/ });

    // Bouton/geste "retour" mobile : popstate simulé (sans cliquer sur le
    // bouton "Retour" affiché à l'écran, déjà couvert par le test
    // précédent).
    window.dispatchEvent(new PopStateEvent("popstate"));

    // De retour à l'étape 1 (le bouton "Retour" n'est affiché qu'à partir de
    // l'étape 2) avec le brouillon préservé (usageGoals coché -> Continuer
    // actif).
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Retour/ })).not.toBeInTheDocument();
    });
    const next = screen.getByRole("button", { name: "Continuer" });
    expect(next).toBeEnabled();
  });

  it("le démontage du wizard (ex. compte banni détecté en cours d'onboarding) purge les entrées en attente, pour ne pas avaler un futur retour ailleurs dans l'app", async () => {
    // Bug qu'aurait introduit un correctif incomplet du point précédent :
    // goNext() pousse une entrée d'historique à CHAQUE étape franchie sans
    // jamais revenir en arrière — si OnboardingWizard disparaît (compte
    // banni/suspendu détecté par App.jsx, ou tout autre démontage qui ne
    // passe pas par "Terminer"/"Terminer plus tard") avant que l'utilisateur
    // ait consommé ces entrées, elles resteraient fantômes sur la pile
    // PARTAGÉE (useEscapeKey.js) avec SocialShell/les modales. Le tout
    // premier retour navigateur/mobile une fois ailleurs dans l'app serait
    // alors avalé silencieusement par cette entrée d'un composant déjà
    // démonté (setStep sur un wizard qui n'existe plus, aucun effet visible)
    // au lieu de fermer ce qui est réellement ouvert.
    const user = userEvent.setup();
    single.mockResolvedValue({ data: { id: "u1", onboarding_step: 1 }, error: null });

    const { unmount } = renderWizard();
    await user.click(screen.getByRole("button", { name: "Continuer" })); // pousse une entrée (étape 1 -> 2)
    await screen.findByRole("button", { name: /Retour/ });

    // La purge à l'unmount retire l'entrée de la pile via discard() —
    // PAS release() (voir useEscapeKey.js) : contrairement à release(),
    // discard() ne déclenche AUCUNE vraie navigation, donc rien à attendre
    // ici (bug corrigé en review : release() en boucle sur N entrées
    // aurait fait naviguer le navigateur en arrière N fois pour de vrai
    // d'un coup en fin d'inscription).
    unmount();

    // Écran réellement affiché ensuite (ex. SocialShell) : pousse sa propre
    // entrée sur la même pile partagée. Un seul popstate doit suffire à la
    // consommer — si l'entrée du wizard démonté n'avait pas été purgée
    // correctement, elle serait encore au-dessus et avalerait ce popstate
    // sans jamais appeler onCloseAfter.
    const onCloseAfter = vi.fn();
    let release;
    release = pushBackEntry(() => { release(); onCloseAfter(); });

    window.dispatchEvent(new PopStateEvent("popstate"));

    expect(onCloseAfter).toHaveBeenCalledTimes(1);
  });
});
