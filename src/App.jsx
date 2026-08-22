import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import { C, EDUCATION_LEVELS, HAS_CHILDREN_OPTIONS, MAX_PHOTOS } from "./constants";
import { matchKey } from "./utils/format";
import SocialShell from "./components/SocialShell";
import AppModals from "./components/AppModals";
import ConnectivityBanner from "./components/ConnectivityBanner";
import AccountDeletionBanner from "./components/AccountDeletionBanner";
import SessionExpiryBanner from "./components/SessionExpiryBanner";
import UpdateNotice from "./components/UpdateNotice";
import { checkForUpdate, wasRecentlyDismissed, dismissUpdate, CHECK_INTERVAL_MS } from "./lib/version";
import { isCriticalOperationActive } from "./lib/criticalOperationGuard";
import EditProfileForm from "./screens/EditProfileForm";
import UpdatePasswordScreen from "./screens/UpdatePasswordScreen";
import OnboardingWizard from "./screens/onboarding/OnboardingWizard";
import { computeAge } from "./screens/onboarding/steps/Step1Identity";
import MatchCelebrationModal from "./components/social/MatchCelebrationModal";
import { filterCandidatesByPreferences } from "./lib/matching/matchingService";
import { validateMediaFile } from "./lib/mediaValidation";
import { uploadWithProgress } from "./lib/uploadWithProgress";
import { MEDIA_BUCKET, extFromMime } from "./lib/mediaConstants";
import { trackActivation } from "./lib/trackActivation";
import { fetchMyLocation, upsertMyLocation, disableMyLocation } from "./lib/locationApi";
import { getCurrentPositionSafe, LOCATION_ERROR_MESSAGES } from "./lib/geolocation";
import { usePathname } from "./hooks/usePathname";
import LandingPage from "./screens/public/LandingPage";
import AboutPage from "./screens/public/AboutPage";
import PrivacyPage from "./screens/public/PrivacyPage";
import TermsPage from "./screens/public/TermsPage";
import LocationRequiredGate from "./components/LocationRequiredGate";

const PUBLIC_ONLY_PATHS = new Set(["/connexion", "/inscription", "/a-propos", "/confidentialite", "/conditions"]);

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore vérifié, null = pas connecté
  const [view, setView] = useState("loading"); // loading | form | feed | discover | matches | stories
  const { pathname, navigate } = usePathname();
  const [profiles, setProfiles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [likePairs, setLikePairs] = useState([]); // [{from_id, to_id}]
  const [passPairs, setPassPairs] = useState([]); // [{from_id, to_id}]
  const likeInFlightRef = useRef(new Set()); // to_id en cours d'envoi — évite un double clic = double insert
  const passInFlightRef = useRef(new Set());
  const [sessionExpiryWarning, setSessionExpiryWarning] = useState(false);
  const [matchNotice, setMatchNotice] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(messages); // lu par l'effet d'inactivité sans le forcer à se réabonner à chaque message
  const [messageDraft, setMessageDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [reactionsByMessageId, setReactionsByMessageId] = useState({}); // { [messageId]: [{profile_id, emoji}] }
  const reactionsChannelRef = useRef(null);
  const [error, setError] = useState("");
  const [blockPairs, setBlockPairs] = useState([]); // [{from_id, to_id}] — blocages faits par moi
  const [reportTarget, setReportTarget] = useState(null); // profil en cours de signalement
  const [reportReason, setReportReason] = useState("");
  const [reportCategory, setReportCategory] = useState("");
  const [reportSending, setReportSending] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [blockTarget, setBlockTarget] = useState(null); // profil en attente de confirmation de blocage
  const [successNotice, setSuccessNotice] = useState("");
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [myLocation, setMyLocation] = useState(null);
  const [locationChecked, setLocationChecked] = useState(false);
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [coverRemoved, setCoverRemoved] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const typingChannelRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const messagesChannelRef = useRef(null);

  // Photos multiples — création de profil
  const [photoFiles, setPhotoFiles] = useState([]); // File[]
  const [photoPreviews, setPhotoPreviews] = useState([]); // dataURL[]

  // Photos multiples — indexées par profil, pour l'affichage (discover, etc.)
  const [profilePhotos, setProfilePhotos] = useState({}); // { [profileId]: [{id, url, position}] }

  // Édition de profil existant
  const [editForm, setEditForm] = useState(null);
  const [existingPhotos, setExistingPhotos] = useState([]); // photos déjà enregistrées, en édition
  const [newPhotoFiles, setNewPhotoFiles] = useState([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState([]);
  const [savingProfile, setSavingProfile] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      // Phase 1 : session + profiles + photos en parallèle. getSession() est
      // relu ici (plutôt que de fermer sur le state "session" du composant)
      // car loadAll a des deps [] pour rester une référence stable — fermer
      // sur "session" produirait un closure figé sur sa toute première valeur.
      const [sessionRes, profRes, photoRes] = await Promise.all([
        supabase.auth.getSession(),
        // Plafonné (item 12/13 de l'audit Phase 10) : charger la table
        // "profiles" en entier sans limite était le plus gros risque de
        // scalabilité identifié — un vrai tri/pagination côté serveur
        // demanderait de déplacer rankCandidates() côté serveur (hors
        // périmètre de cette phase), donc ce plafond borne le pire cas
        // sans changer le comportement de classement actuel.
        supabase.from("profiles").select("*").order("created_at", { ascending: true }).limit(500),
        // Plafonné pour la même raison que "profiles" (borne le pire cas
        // sans dépendre des 500 profils déjà résolus, chargés en parallèle).
        // Trié par profile_id d'abord : 500 profils × MAX_PHOTOS(6) = 3000
        // au maximum théorique, donc une troncature reste possible en
        // bordure — trier uniquement par "position" rendrait alors la coupe
        // arbitraire (un sous-ensemble différent de photos à chaque reload) ;
        // trier par profile_id la rend déterministe (toujours les mêmes
        // profils tronqués, jamais un mélange aléatoire de photos).
        supabase.from("profile_photos").select("*").order("profile_id", { ascending: true }).order("position", { ascending: true }).limit(3200),
      ]);
      if (profRes.error) throw profRes.error;
      if (photoRes.error) throw photoRes.error;

      // likes/passes/blocks n'étaient filtrés par personne (audit complémentaire
      // post-palette) : contrairement à "profiles" déjà plafonné ci-dessus,
      // ces 3 tables croissent indéfiniment avec l'activité de TOUS les
      // utilisateurs, pas seulement la sienne. hasLiked/hasPassed/hasBlocked
      // (plus bas) ne sont jamais appelées qu'avec currentUser.id comme l'une
      // des deux extrémités — donc ne charger que les lignes qui l'impliquent,
      // via son profile.id. Dérivé du lot déjà chargé (profRes) au lieu d'une
      // requête dédiée : le cas courant (compte parmi les 500 premiers
      // profils) ne coûte alors aucun aller-retour réseau supplémentaire.
      const authUserId = sessionRes.data?.session?.user?.id;
      let myProfileId = authUserId ? (profRes.data || []).find((p) => p.user_id === authUserId)?.id || null : null;
      if (authUserId && !myProfileId) {
        const { data: ownProfile } = await supabase.from("profiles").select("id").eq("user_id", authUserId).maybeSingle();
        myProfileId = ownProfile?.id || null;
      }
      const relFilter = myProfileId ? `from_id.eq.${myProfileId},to_id.eq.${myProfileId}` : null;
      let likeQuery = supabase.from("likes").select("from_id,to_id");
      let passQuery = supabase.from("passes").select("from_id,to_id");
      let blockQuery = supabase.from("blocks").select("from_id,to_id");
      if (relFilter) {
        likeQuery = likeQuery.or(relFilter);
        passQuery = passQuery.or(relFilter);
        blockQuery = blockQuery.or(relFilter);
      }

      const [likeRes, passRes, blockRes] = await Promise.all([likeQuery, passQuery, blockQuery]);
      if (likeRes.error) throw likeRes.error;
      if (passRes.error) throw passRes.error;
      if (blockRes.error) throw blockRes.error;
      setProfiles(profRes.data || []);
      setLikePairs(likeRes.data || []);
      setPassPairs(passRes.data || []);
      setBlockPairs(blockRes.data || []);
      const grouped = {};
      (photoRes.data || []).forEach((ph) => {
        if (!grouped[ph.profile_id]) grouped[ph.profile_id] = [];
        grouped[ph.profile_id].push(ph);
      });
      setProfilePhotos(grouped);
    } catch (e) {
      console.error(e);
      setError("Impossible de charger les données. Réessaie.");
    }
  }, []);

  // Suivre l'état de connexion
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 8000);
    return () => clearTimeout(timer);
  }, [error]);

  // Détecte le retour d'un lien de confirmation d'email ou d'un lien mort
  // (Phase 7.5). Pas de routeur dans ce projet : le seul canal disponible
  // est l'URL elle-même. "verified=1" (ajouté via emailRedirectTo dans
  // Auth.jsx) reste dans le query string ; le token Supabase arrive
  // séparément en #hash. Un lien mort (expiré/invalide) fait que Supabase
  // ajoute #error=...&error_code=... au lieu d'établir une session.
  const pendingVerifiedRef = useRef(false);
  const [justVerified, setJustVerified] = useState(false);
  const [authLinkError, setAuthLinkError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const verifiedFlag = params.get("verified") === "1";
    let linkErrorCode = null;
    if (hash && hash.includes("error=")) {
      linkErrorCode = new URLSearchParams(hash.replace(/^#/, "")).get("error_code");
    }
    if (verifiedFlag) pendingVerifiedRef.current = true;
    if (linkErrorCode) setAuthLinkError(linkErrorCode);
    if (verifiedFlag || linkErrorCode) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch(() => setSession(null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Ne JAMAIS laisser une confirmation d'email connecter automatiquement
      // l'utilisateur : Supabase établit réellement une session (preuve que
      // le lien était valide), mais on la referme aussitôt et on affiche
      // "email vérifié, entre ton mot de passe" à la place.
      if (event === "SIGNED_IN" && pendingVerifiedRef.current) {
        pendingVerifiedRef.current = false;
        supabase.auth.signOut().then(() => setJustVerified(true));
        return;
      }
      setSession(newSession);
      // Lien "mot de passe oublié" cliqué depuis l'email : Supabase authentifie
      // la session de récupération et émet cet événement.
      if (event === "PASSWORD_RECOVERY") setView("update-password");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Système de mise à jour (voir src/lib/version.js, public/app-version.json)
  // — au démarrage, périodiquement (toutes les 30 min, jamais plus agressif
  // pour ne pas multiplier les requêtes), et quand l'utilisateur revient sur
  // l'onglet après l'avoir quitté. N'exige pas de session : une mise à jour
  // obligatoire doit pouvoir bloquer même l'écran de connexion.
  const [updateState, setUpdateState] = useState({ mandatory: false, recommended: false, info: null });
  useEffect(() => {
    let cancelled = false;
    const runCheck = async () => {
      const result = await checkForUpdate();
      if (cancelled || !result.ok) return;
      const recommended = result.recommended && !wasRecentlyDismissed(result.info.latestVersion);
      setUpdateState({ mandatory: result.mandatory, recommended, info: result.info });
    };
    runCheck();
    const interval = setInterval(runCheck, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") runCheck(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const handleUpdateReload = () => window.location.reload();
  const handleUpdateDismiss = () => {
    if (updateState.info) dismissUpdate(updateState.info.latestVersion);
    setUpdateState((s) => ({ ...s, recommended: false }));
  };

  // Présence en ligne : heartbeat léger. Si les colonnes presence/last_seen
  // n'existent pas encore en base, l'interface continue simplement à fonctionner.
  // Respecte le paramètre de confidentialité "Statut en ligne visible" :
  // si désactivé, on écrit is_online=false une fois puis on arrête d'émettre.
  useEffect(() => {
    if (!session?.user?.id) return;
    let alive = true;

    if (currentUser && currentUser.show_online_status === false) {
      (async () => {
        try {
          await supabase.from("profiles").update({
            is_online: false,
            last_seen: new Date().toISOString(),
          }).eq("user_id", session.user.id);
        } catch (_) {}
      })();
      return;
    }

    const heartbeat = async () => {
      const now = new Date().toISOString();
      try {
        const { error: heartbeatError } = await supabase.from("profiles").update({
          is_online: true,
          last_seen: now
        }).eq("user_id", session.user.id);
        if (heartbeatError) console.error("heartbeat error:", heartbeatError.message, "| code:", heartbeatError.code, "| details:", heartbeatError.details, "| hint:", heartbeatError.hint);
      } catch (_) {}
    };

    heartbeat();
    const timer = setInterval(heartbeat, 30000);

    const handleVisibility = async () => {
      if (document.visibilityState === "visible") heartbeat();
      else {
        try {
          await supabase.from("profiles").update({
            is_online: false,
            last_seen: new Date().toISOString()
          }).eq("user_id", session.user.id);
        } catch (_) {}
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session?.user?.id, currentUser?.show_online_status]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Déconnexion automatique par inactivité — 30 min. Reconstruite proprement
  // après un premier essai qui se déclenchait après ~2 min d'usage actif :
  // ici on ne réagit qu'à une vraie activité utilisateur (souris/clavier/
  // toucher/scroll), jamais à visibilitychange/changement d'onglet, et les
  // deux minuteurs (avertissement + déconnexion) sont réarmés ensemble à
  // chaque activité pour éviter tout décalage entre les deux.
  useEffect(() => {
    if (!session?.user?.id) return;
    const WARNING_MS = 25 * 60 * 1000; // avertit 5 min avant la déconnexion
    const LOGOUT_MS = 30 * 60 * 1000;
    let warningTimer;
    let logoutTimer;

    const clearTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
    };

    const scheduleTimers = () => {
      clearTimers();
      warningTimer = setTimeout(() => setSessionExpiryWarning(true), WARNING_MS);
      // Ne jamais couper un upload/publication en cours (PostsFeed,
      // CommunityCreateForm, uploadWithProgress) — on réessaie plutôt
      // toutes les 10s tant que l'opération critique est active.
      const attemptLogout = () => {
        if (isCriticalOperationActive()) {
          logoutTimer = setTimeout(attemptLogout, 10000);
          return;
        }
        handleSignOut().then(() => navigate("/connexion"));
      };
      logoutTimer = setTimeout(attemptLogout, LOGOUT_MS);
    };

    const handleActivity = () => {
      setSessionExpiryWarning(false);
      scheduleTimers();
    };

    const activityEvents = ["mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((evt) => document.addEventListener(evt, handleActivity, { passive: true }));
    scheduleTimers();

    return () => {
      clearTimers();
      activityEvents.forEach((evt) => document.removeEventListener(evt, handleActivity));
    };
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Partagé par les deux rendus de <SessionExpiryBanner> plus bas (vue
  // "checking-profile" et vue normale) — un simple événement "mousedown"
  // suffit, capté par le même listener que l'activité réelle de l'effet
  // ci-dessus.
  const handleStayConnected = () => {
    setSessionExpiryWarning(false);
    document.dispatchEvent(new Event("mousedown"));
  };

  // Une fois connecté, charger les données et retrouver (ou non) son propre profil
  useEffect(() => {
    if (session === undefined) return; // vérification en cours
    if (session === null) {
      setView("auth");
      setCurrentUser(null);
      return;
    }
    if (PUBLIC_ONLY_PATHS.has(window.location.pathname)) navigate("/");
    loadAll().then(() => {
      setView("checking-profile");
    });
  }, [session, loadAll]); // eslint-disable-line react-hooks/exhaustive-deps

  // La demande de localisation ne se fait plus qu'une fois, pendant
  // l'inscription (voir Auth.jsx) — plus de popup à chaque lancement (item 2
  // des specs navigation/auth, révisé). Ici on charge la ligne existante et,
  // si Auth.jsx a laissé des coordonnées en attente (compte tout juste créé,
  // pas encore de session au moment où la permission a été accordée), on les
  // persiste dès qu'on a un currentUser.id.
  useEffect(() => {
    if (!currentUser?.id) return;
    fetchMyLocation().then(async (row) => {
      if (!row) {
        try {
          const pending = sessionStorage.getItem("bb-pending-location");
          if (pending) {
            const { latitude, longitude } = JSON.parse(pending);
            row = await upsertMyLocation({ location_enabled: true, latitude_approx: latitude, longitude_approx: longitude });
          }
        } catch (_) {}
        finally {
          sessionStorage.removeItem("bb-pending-location");
        }
      }
      setMyLocation(row);
      setLocationChecked(true);
    }).catch((e) => { console.error(e); setLocationChecked(true); });
  }, [currentUser?.id]);

  // Garde-fou d'accès bêta (item 2 des specs navigation/auth) : la
  // localisation reste une condition d'accès continue, pas seulement à
  // l'inscription. On surveille l'état de la permission navigateur en
  // continu (onchange, quand disponible) plutôt qu'à chaque lancement
  // uniquement, pour restaurer l'accès automatiquement dès la réactivation.
  const [geoPermissionState, setGeoPermissionState] = useState(null);
  useEffect(() => {
    if (!currentUser?.id || !navigator.permissions?.query) return;
    let status;
    let cancelled = false;
    navigator.permissions.query({ name: "geolocation" }).then((s) => {
      if (cancelled) return;
      status = s;
      setGeoPermissionState(s.state);
      s.onchange = () => setGeoPermissionState(s.state);
    }).catch(() => {});
    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, [currentUser?.id]);

  const [locationGateRetrying, setLocationGateRetrying] = useState(false);
  const [locationGateError, setLocationGateError] = useState(null);
  const locationGateBlocked =
    !!currentUser && locationChecked &&
    (geoPermissionState === "denied" || myLocation?.location_enabled === false);

  // Auparavant, ce bouton se contentait de relire navigator.permissions.query()
  // (un état parfois en cache, qui ne se met pas forcément à jour tant qu'une
  // vraie tentative de géolocalisation n'a pas été faite) et avalait toute
  // erreur en silence — le bouton semblait "ne rien faire" quand la
  // permission était encore refusée. Il déclenche maintenant une vraie
  // demande (getCurrentPositionSafe, même chemin que l'activation initiale)
  // et affiche clairement le résultat, succès ou échec.
  async function handleRetryLocationGate() {
    setLocationGateRetrying(true);
    setLocationGateError(null);
    try {
      const result = await getCurrentPositionSafe();
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: "geolocation" });
        setGeoPermissionState(status.state);
      }
      if (result.ok) {
        await handleEnableLocation(result.latitude, result.longitude);
      } else if (result.code === "PERMISSION_DENIED") {
        // Le message générique de geolocation.js ("tu peux l'activer plus
        // tard") est pensé pour un contexte facultatif — trompeur ici où
        // l'accès reste bloqué tant que ce n'est pas réglé.
        setLocationGateError("Toujours refusée par ton navigateur ou ton appareil. Vérifie les réglages de localisation du site dans ton navigateur (souvent une icône près de la barre d'adresse), puis réessaie.");
      } else {
        setLocationGateError(result.message);
      }
    } catch (_) {
      setLocationGateError(LOCATION_ERROR_MESSAGES.UNKNOWN);
    } finally {
      setLocationGateRetrying(false);
    }
  }

  // Rôle plateforme (moderator/admin/super_admin) — table dédiée
  // platform_roles, RLS restreinte à sa propre ligne. N'affiche jamais
  // rien de plus qu'un bouton "Admin" conditionnel : la protection réelle
  // vit dans les RPC admin_* (vérification côté base à chaque appel).
  const [myPlatformRole, setMyPlatformRole] = useState(null);
  useEffect(() => {
    if (!currentUser?.id) { setMyPlatformRole(null); return; }
    supabase.from("platform_roles").select("role").eq("profile_id", currentUser.id).maybeSingle()
      .then(({ data }) => setMyPlatformRole(data?.role || null))
      .catch(() => setMyPlatformRole(null));
  }, [currentUser?.id]);

  useEffect(() => {
    if (view !== "checking-profile") return;
    if (!session) return;
    const own = profiles.find((p) => p.user_id === session.user.id);
    if (own) {
      setCurrentUser(own);
      // Suspension/bannissement réellement appliqués ici (pas seulement un
      // bouton caché côté UI) — un compte banni ou suspendu n'atteint
      // jamais l'application, quelle que soit la façon dont il y accède.
      if (own.banned_at) {
        setView("banned");
      } else if (own.suspended_until && new Date(own.suspended_until) > new Date()) {
        setView("suspended");
      } else if (!own.onboarding_completed_at) {
        setView("onboarding");
      } else {
        setView("feed");
      }
    } else {
      setCurrentUser(null);
      setView("onboarding");
    }
  }, [view, profiles, session]);

  function handleAccountDeletionRequested() {
    setCurrentUser((u) => (u ? { ...u, deletion_requested_at: new Date().toISOString() } : u));
  }

  function handleCancelAccountDeletion() {
    setCurrentUser((u) => (u ? { ...u, deletion_requested_at: null } : u));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setProfiles([]);
    setLikePairs([]);
    setPassPairs([]);
  }

  const hasLiked = (from, to) => likePairs.some((l) => l.from_id === from && l.to_id === to);
  const hasPassed = (from, to) => passPairs.some((p) => p.from_id === from && p.to_id === to);
  const hasBlocked = (from, to) => blockPairs.some((b) => b.from_id === from && b.to_id === to);

  const getMatches = useCallback(() => {
    if (!currentUser) return [];
    return profiles.filter(
      (p) =>
        p.id !== currentUser.id &&
        hasLiked(currentUser.id, p.id) &&
        hasLiked(p.id, currentUser.id) &&
        !hasBlocked(currentUser.id, p.id) &&
        !hasBlocked(p.id, currentUser.id)
    );
  }, [profiles, likePairs, blockPairs, currentUser]);

  // "Qui m'a aimé" (avantage Premium) : m'a aimé, mais pas encore réciproque
  // — dès que handleLike() est appelé dessus, hasLiked() devient vrai des
  // deux côtés et le profil bascule naturellement dans getMatches() au
  // prochain rendu (aucune action "confirmer le match" séparée nécessaire).
  const getAdmirers = useCallback(() => {
    if (!currentUser) return [];
    return profiles.filter(
      (p) =>
        p.id !== currentUser.id &&
        hasLiked(p.id, currentUser.id) &&
        !hasLiked(currentUser.id, p.id) &&
        !hasBlocked(currentUser.id, p.id) &&
        !hasBlocked(p.id, currentUser.id)
    );
  }, [profiles, likePairs, blockPairs, currentUser]);

  async function performBlock(target) {
    if (!currentUser) return;
    try {
      const { error: blockError } = await supabase
        .from("blocks")
        .insert({ from_id: currentUser.id, to_id: target.id });
      if (blockError) throw blockError;
      setBlockPairs((b) => [...b, { from_id: currentUser.id, to_id: target.id }]);
      if (activeMatch?.id === target.id) {
        setActiveMatch(null);
      }
    } catch (e) {
      console.error(e);
      setError("Impossible de bloquer ce profil.");
    }
  }

  // Ouvre la confirmation de blocage — ne bloque jamais immédiatement.
  function requestBlock(target) {
    setBlockTarget(target);
  }

  async function confirmBlock(target) {
    await performBlock(target);
    setBlockTarget(null);
    setSuccessNotice("Cette personne ne pourra plus interagir avec toi sur Baobab.");
    setTimeout(() => setSuccessNotice(""), 4000);
  }

  async function handleUnblock(target) {
    if (!currentUser) return;
    try {
      const { error: unblockError } = await supabase
        .from("blocks")
        .delete()
        .eq("from_id", currentUser.id)
        .eq("to_id", target.id);
      if (unblockError) throw unblockError;
      setBlockPairs((b) => b.filter((pair) => !(pair.from_id === currentUser.id && pair.to_id === target.id)));
    } catch (e) {
      console.error(e);
      setError("Impossible de débloquer ce profil.");
    }
  }

  async function handleToggleOnlineStatus(checked) {
    if (!currentUser) return;
    setCurrentUser((u) => ({ ...u, show_online_status: checked }));
    try {
      const { error: toggleError } = await supabase
        .from("profiles")
        .update({ show_online_status: checked })
        .eq("id", currentUser.id);
      if (toggleError) throw toggleError;
    } catch (e) {
      console.error(e);
      setCurrentUser((u) => ({ ...u, show_online_status: !checked }));
      setError("Impossible de mettre à jour ce paramètre.");
    }
  }

  async function handleToggleDating(checked) {
    if (!currentUser) return;
    setCurrentUser((u) => ({ ...u, dating_enabled: checked }));
    try {
      const { error: toggleError } = await supabase
        .from("profiles")
        .update({ dating_enabled: checked })
        .eq("id", currentUser.id);
      if (toggleError) throw toggleError;
    } catch (e) {
      console.error(e);
      setCurrentUser((u) => ({ ...u, dating_enabled: !checked }));
      setError("Impossible de mettre à jour ce paramètre.");
    }
  }

  // Un match n'est pas une table à part : c'est deux lignes "likes"
  // mutuelles (getMatches()). L'utilisateur ne peut supprimer QUE sa propre
  // ligne via RLS — unmatch_profile() est une RPC security definer qui
  // supprime les deux côtés de façon atomique (voir supabase-dating-2.sql).
  async function handleUnmatch(target) {
    if (!currentUser || !target) return;
    if (!window.confirm(`Supprimer ton match avec ${target.name} ? Vous ne pourrez plus vous écrire, et vous ne vous reproposerez plus en Découverte.`)) return;
    try {
      const { error: unmatchError } = await supabase.rpc("unmatch_profile", { target_id: target.id });
      if (unmatchError) throw unmatchError;
      setLikePairs((k) =>
        k.filter((l) => !((l.from_id === currentUser.id && l.to_id === target.id) || (l.from_id === target.id && l.to_id === currentUser.id)))
      );
      setPassPairs((k) => [...k, { from_id: currentUser.id, to_id: target.id }, { from_id: target.id, to_id: currentUser.id }]);
      if (activeMatch?.id === target.id) closeChat();
    } catch (e) {
      console.error(e);
      setError("Impossible de supprimer ce match.");
    }
  }

  async function handleToggleField(field, checked) {
    if (!currentUser) return;
    setCurrentUser((u) => ({ ...u, [field]: checked }));
    try {
      const { error: toggleError } = await supabase
        .from("profiles")
        .update({ [field]: checked })
        .eq("id", currentUser.id);
      if (toggleError) throw toggleError;
    } catch (e) {
      console.error(e);
      setCurrentUser((u) => ({ ...u, [field]: !checked }));
      setError("Impossible de mettre à jour ce paramètre.");
    }
  }

  async function handleEnableLocation(latitude, longitude) {
    try {
      const row = await upsertMyLocation({ location_enabled: true, latitude_approx: latitude, longitude_approx: longitude });
      setMyLocation(row);
    } catch (e) {
      console.error(e);
      setError("Impossible d'activer la localisation.");
    }
  }

  async function handleDisableLocation() {
    const previous = myLocation;
    setMyLocation((l) => (l ? { ...l, location_enabled: false } : l));
    try {
      const row = await disableMyLocation();
      setMyLocation(row);
    } catch (e) {
      console.error(e);
      setMyLocation(previous);
      setError("Impossible de désactiver la localisation.");
    }
  }

  async function handleUpdateLocationPref(field, value) {
    const previous = myLocation;
    setMyLocation((l) => (l ? { ...l, [field]: value } : l));
    try {
      const row = await upsertMyLocation({ [field]: value });
      setMyLocation(row);
    } catch (e) {
      console.error(e);
      setMyLocation(previous);
      setError("Impossible de mettre à jour ce paramètre.");
    }
  }

  async function handleUpdateNotificationPreference(category, enabled) {
    if (!currentUser) return;
    const previousPrefs = currentUser.notification_preferences || {};
    const nextPrefs = { ...previousPrefs, [category]: enabled };
    setCurrentUser((u) => (u ? { ...u, notification_preferences: nextPrefs } : u));
    try {
      const { error: prefError } = await supabase
        .from("profiles")
        .update({ notification_preferences: nextPrefs })
        .eq("id", currentUser.id);
      if (prefError) throw prefError;
    } catch (e) {
      console.error(e.message, e.code, e.details, e.hint);
      setCurrentUser((u) => (u ? { ...u, notification_preferences: previousPrefs } : u));
      setError("Impossible de mettre à jour ce paramètre.");
    }
  }

  async function handleSavePreferences(prefs) {
    if (!currentUser) return;
    setCurrentUser((u) => ({ ...u, ...prefs }));
    try {
      const { error: prefError } = await supabase
        .from("profiles")
        .update(prefs)
        .eq("id", currentUser.id);
      if (prefError) throw prefError;
    } catch (e) {
      console.error(e.message, e.code, e.details, e.hint);
      setError("Impossible d'enregistrer tes préférences.");
    }
  }

  async function submitReport() {
    if (!currentUser || !reportTarget || !reportCategory) return;
    if (reportCategory === "autre" && !reportReason.trim()) return;
    setReportSending(true);
    try {
      const { error: reportError } = await supabase
        .from("reports")
        .insert({ from_id: currentUser.id, to_id: reportTarget.id, reason: reportReason.trim() || null, category: reportCategory });
      if (reportError) throw reportError;
      setReportSubmitted(true);
    } catch (e) {
      console.error(e);
      setError("Échec de l'envoi du signalement.");
    } finally {
      setReportSending(false);
    }
  }

  function cancelReport() {
    setReportTarget(null);
    setReportReason("");
    setReportCategory("");
    setReportSubmitted(false);
  }

  function dismissReportAfterSubmit() {
    setReportTarget(null);
    setReportReason("");
    setReportCategory("");
    setReportSubmitted(false);
  }

  async function uploadPhoto(userId, file, idx = 0) {
    const ext = file.name.split(".").pop();
    const path = `${userId}/photo-${Date.now()}-${idx}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  // ---- Sélection de photos pendant la création du profil ----
  // Même validation réelle (MIME déclaré + signature binaire + taille) que
  // la messagerie riche — auparavant seul l'allowlist du bucket Storage
  // protégeait ce chemin, sans retour clair à l'utilisateur en cas de rejet.
  async function handlePhotosSelected(e) {
    const room = MAX_PHOTOS - photoFiles.length;
    const files = Array.from(e.target.files || []).slice(0, Math.max(room, 0));
    e.target.value = "";
    if (files.length === 0) return;
    const validFiles = [];
    for (const file of files) {
      const { ok, error } = await validateMediaFile(file, "image");
      if (ok) validFiles.push(file);
      else setError(error);
    }
    if (validFiles.length === 0) return;
    setPhotoFiles((prev) => [...prev, ...validFiles].slice(0, MAX_PHOTOS));
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreviews((prev) => [...prev, reader.result].slice(0, MAX_PHOTOS));
      reader.readAsDataURL(file);
    });
  }

  function removePhotoFile(idx) {
    setPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---- Édition de profil existant ----
  function openEditProfile() {
    if (!currentUser) return;
    setEditForm({
      name: currentUser.name || "",
      lastName: currentUser.last_name || "",
      age: String(currentUser.age || ""),
      birthDate: currentUser.birth_date || "",
      country: currentUser.country || "",
      province: currentUser.province || "",
      languages: currentUser.languages || "",
      languagesDetail: Array.isArray(currentUser.languages_detail) ? currentUser.languages_detail : [],
      city: currentUser.city || "",
      arrivedSince: currentUser.arrived_since || "",
      immigrationStatus: currentUser.immigration_status || "",
      arrivalCity: currentUser.arrival_city || "",
      lookingFor: (currentUser.looking_for || "").split(",").map((s) => s.trim()).filter(Boolean),
      relationshipValues: (currentUser.relationship_values || "").split(",").map((s) => s.trim()).filter(Boolean),
      bio: currentUser.bio || "",
      occupation: currentUser.occupation || "",
      interests: (currentUser.interests || "").split(",").map((s) => s.trim()).filter(Boolean),
      educationLevel: currentUser.education_level || EDUCATION_LEVELS[0],
      hasChildren: currentUser.has_children || HAS_CHILDREN_OPTIONS[1],
      wantsChildren: currentUser.wants_children || "",
      familyImportance: currentUser.family_importance || "",
      careerGoal: currentUser.career_goal || "",
      geographicOpenness: currentUser.geographic_openness || "",
      personalityEvening: currentUser.personality_evening || "",
      personalityTravel: currentUser.personality_travel || "",
      relationshipNeeds: (currentUser.relationship_needs || "").split(",").map((s) => s.trim()).filter(Boolean),
    });
    setExistingPhotos(profilePhotos[currentUser.id] || []);
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
    setCoverFile(null);
    setCoverPreview("");
    setCoverRemoved(false);
    setView("editProfile");
  }

  async function handleNewPhotosSelected(e) {
    const total = existingPhotos.length + newPhotoFiles.length;
    const room = MAX_PHOTOS - total;
    const files = Array.from(e.target.files || []).slice(0, Math.max(room, 0));
    e.target.value = "";
    if (files.length === 0) return;
    const validFiles = [];
    for (const file of files) {
      const { ok, error } = await validateMediaFile(file, "image");
      if (ok) validFiles.push(file);
      else setError(error);
    }
    if (validFiles.length === 0) return;
    setNewPhotoFiles((prev) => [...prev, ...validFiles]);
    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setNewPhotoPreviews((prev) => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
  }

  function removeNewPhotoFile(idx) {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function removeExistingPhoto(photo) {
    try {
      const { error: delError } = await supabase.from("profile_photos").delete().eq("id", photo.id);
      if (delError) throw delError;
      setExistingPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      // Nettoyage réel du fichier Storage — sans ça, chaque suppression de
      // photo laissait un fichier orphelin permanent dans le bucket public.
      const marker = "/avatars/";
      const idx = photo.url?.indexOf(marker);
      if (idx !== -1 && idx !== undefined) {
        const storagePath = decodeURIComponent(photo.url.slice(idx + marker.length));
        supabase.storage.from("avatars").remove([storagePath]).catch(() => {});
      }
    } catch (e) {
      console.error(e);
      setError("Impossible de supprimer cette photo.");
    }
  }

  async function persistPhotoOrder(reordered) {
    try {
      const { error: reorderError } = await supabase
        .from("profile_photos")
        .upsert(reordered.map((p, i) => ({ id: p.id, profile_id: p.profile_id, url: p.url, position: i })));
      if (reorderError) throw reorderError;
    } catch (e) {
      console.error(e);
      setError("Impossible de réorganiser les photos.");
    }
  }

  function moveExistingPhoto(photoId, direction) {
    const idx = existingPhotos.findIndex((p) => p.id === photoId);
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || newIdx < 0 || newIdx >= existingPhotos.length) return;
    const reordered = [...existingPhotos];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setExistingPhotos(reordered);
    persistPhotoOrder(reordered);
  }

  async function setPrimaryPhoto(photoId) {
    const idx = existingPhotos.findIndex((p) => p.id === photoId);
    if (idx <= 0) return;
    const reordered = [existingPhotos[idx], ...existingPhotos.filter((_, i) => i !== idx)];
    setExistingPhotos(reordered);
    await persistPhotoOrder(reordered);
    try {
      const { error: avatarError } = await supabase.from("profiles").update({ avatar_url: reordered[0].url }).eq("id", currentUser.id);
      if (avatarError) throw avatarError;
      setCurrentUser((u) => (u ? { ...u, avatar_url: reordered[0].url } : u));
    } catch (e) {
      console.error(e);
      setError("Impossible de définir cette photo comme principale.");
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!editForm.name || !currentUser) { setError("Le nom est requis."); return; }
    const editAgeNum = editForm.birthDate ? computeAge(editForm.birthDate) : Number(editForm.age);
    if (editAgeNum === null || Number.isNaN(editAgeNum) || editAgeNum < 18) { setError("Tu dois avoir au moins 18 ans."); return; }
    setSavingProfile(true);
    try {
      const uploadedUrls = [];
      for (let i = 0; i < newPhotoFiles.length; i++) {
        const url = await uploadPhoto(session.user.id, newPhotoFiles[i], existingPhotos.length + i);
        uploadedUrls.push(url);
      }

      let newPhotoRows = [];
      if (uploadedUrls.length > 0) {
        const startPos = existingPhotos.length;
        const rows = uploadedUrls.map((url, idx) => ({
          profile_id: currentUser.id, url, position: startPos + idx,
        }));
        const { data: inserted, error: photoError } = await supabase
          .from("profile_photos")
          .insert(rows)
          .select();
        if (photoError) throw photoError;
        newPhotoRows = inserted || [];
      }

      const allPhotos = [...existingPhotos, ...newPhotoRows];
      const newAvatarUrl = allPhotos[0]?.url || null;

      let coverUrl = currentUser.cover_url || null;
      if (coverRemoved) {
        // Même nettoyage Storage que removeExistingPhoto — sans ça, le
        // fichier de couverture restait orphelin dans le bucket public.
        const marker = "/avatars/";
        const idx = currentUser.cover_url?.indexOf(marker);
        if (idx !== -1 && idx !== undefined) {
          const storagePath = decodeURIComponent(currentUser.cover_url.slice(idx + marker.length));
          supabase.storage.from("avatars").remove([storagePath]).catch(() => {});
        }
        coverUrl = null;
      } else if (coverFile) {
        coverUrl = await uploadPhoto(session.user.id, coverFile, "cover");
      }

      const payload = {
        name: editForm.name,
        last_name: editForm.lastName?.trim() || null,
        cover_url: coverUrl,
        age: editAgeNum,
        birth_date: editForm.birthDate || null,
        country: editForm.country,
        province: editForm.province,
        languages: editForm.languagesDetail?.length ? editForm.languagesDetail.map((l) => l.language).join(", ") : editForm.languages,
        languages_detail: editForm.languagesDetail || [],
        city: editForm.city,
        arrived_since: editForm.arrivedSince,
        immigration_status: editForm.immigrationStatus,
        arrival_city: editForm.arrivalCity,
        looking_for: (editForm.lookingFor || []).join(", "),
        relationship_values: (editForm.relationshipValues || []).join(", "),
        bio: editForm.bio,
        occupation: editForm.occupation,
        interests: (editForm.interests || []).join(", "),
        education_level: editForm.educationLevel,
        has_children: editForm.hasChildren,
        wants_children: editForm.wantsChildren,
        family_importance: editForm.familyImportance,
        career_goal: editForm.careerGoal,
        geographic_openness: editForm.geographicOpenness,
        personality_evening: editForm.personalityEvening,
        personality_travel: editForm.personalityTravel,
        relationship_needs: (editForm.relationshipNeeds || []).join(", "),
        avatar_url: newAvatarUrl,
      };
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", currentUser.id)
        .select()
        .single();
      if (updateError) throw updateError;

      setCurrentUser(data);
      setProfiles((ps) => ps.map((p) => (p.id === data.id ? data : p)));
      setProfilePhotos((pp) => ({ ...pp, [data.id]: allPhotos }));
      setCoverFile(null);
      setCoverPreview("");
      setCoverRemoved(false);
      setError("");
      trackActivation(data.id, "profile_completed");
      setView("feed");
    } catch (e) {
      console.error("handleSaveProfile error:", e?.message, "| code:", e?.code, "| details:", e?.details, "| hint:", e?.hint);
      setError("Erreur lors de la mise à jour du profil.");
    } finally {
      setSavingProfile(false);
    }
  }

  const candidates = currentUser
    ? filterCandidatesByPreferences(
        currentUser,
        profiles.filter(
          (p) =>
            p.id !== currentUser.id &&
            p.dating_enabled !== false &&
            !hasLiked(currentUser.id, p.id) &&
            !hasPassed(currentUser.id, p.id) &&
            !hasBlocked(currentUser.id, p.id) &&
            !hasBlocked(p.id, currentUser.id)
        )
      )
    : [];

  const blockedProfiles = currentUser
    ? profiles.filter((p) => blockPairs.some((b) => b.from_id === currentUser.id && b.to_id === p.id))
    : [];

  // Les deux sens du blocage — utilisé pour filtrer toute liste montrant des
  // profils (suivis/abonnés inclus), pas seulement le blocage que j'ai fait.
  const blockedIds = new Set(
    currentUser
      ? blockPairs
          .filter((b) => b.from_id === currentUser.id || b.to_id === currentUser.id)
          .map((b) => (b.from_id === currentUser.id ? b.to_id : b.from_id))
      : []
  );

  async function handleLike(target) {
    if (!currentUser) return;
    if (hasLiked(currentUser.id, target.id) || likeInFlightRef.current.has(target.id)) return;
    likeInFlightRef.current.add(target.id);
    try {
      const { error: likeError } = await supabase
        .from("likes")
        .insert({ from_id: currentUser.id, to_id: target.id });
      if (likeError) throw likeError;
      setLikePairs((k) => [...k, { from_id: currentUser.id, to_id: target.id }]);
      trackActivation(currentUser.id, "first_like");
      if (hasLiked(target.id, currentUser.id)) {
        setMatchNotice(target);
        trackActivation(currentUser.id, "first_match");
      }
    } catch (e) {
      console.error(e);
      setError("Impossible d'enregistrer ce like.");
    } finally {
      likeInFlightRef.current.delete(target.id);
    }
  }

  async function handleUnlike(target) {
    if (!currentUser) return;
    if (!hasLiked(currentUser.id, target.id) || likeInFlightRef.current.has(target.id)) return;
    if (hasLiked(target.id, currentUser.id)) return; // déjà matché : le unlike n'est pas proposé ici
    likeInFlightRef.current.add(target.id);
    try {
      const { error: unlikeError } = await supabase
        .from("likes")
        .delete()
        .eq("from_id", currentUser.id)
        .eq("to_id", target.id);
      if (unlikeError) throw unlikeError;
      setLikePairs((k) => k.filter((l) => !(l.from_id === currentUser.id && l.to_id === target.id)));
    } catch (e) {
      console.error(e);
      setError("Impossible de retirer ce like.");
    } finally {
      likeInFlightRef.current.delete(target.id);
    }
  }

  async function handlePass(target) {
    if (!currentUser) return;
    if (passInFlightRef.current.has(target.id)) return;
    passInFlightRef.current.add(target.id);
    try {
      const { error: passError } = await supabase
        .from("passes")
        .insert({ from_id: currentUser.id, to_id: target.id });
      if (passError) throw passError;
      setPassPairs((k) => [...k, { from_id: currentUser.id, to_id: target.id }]);
    } catch (e) {
      console.error(e);
      setError("Une erreur est survenue.");
    } finally {
      passInFlightRef.current.delete(target.id);
    }
  }

  const MESSAGES_PAGE_SIZE = 30;

  async function openChat(match) {
    setActiveMatch(match);
    setView("matches");
    setReplyingTo(null);
    await refreshMessages(match);
  }

  function closeChat() {
    setActiveMatch(null);
    setReplyingTo(null);
  }

  async function markConversationRead(match) {
    if (!currentUser || !match) return;
    try {
      const { error: readError } = await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("match_key", matchKey(currentUser.id, match.id))
        .is("read_at", null)
        .neq("from_id", currentUser.id);
      if (readError) throw readError;
    } catch (e) {
      console.error(e.message, e.code, e.details, e.hint);
    }
  }

  async function loadReactionsFor(messageIds) {
    if (!messageIds || messageIds.length === 0) return;
    try {
      const { data, error: reactError } = await supabase
        .from("message_reactions")
        .select("message_id,profile_id,emoji")
        .in("message_id", messageIds);
      if (reactError) throw reactError;
      setReactionsByMessageId((prev) => {
        const next = { ...prev };
        for (const id of messageIds) next[id] = [];
        for (const r of data || []) next[r.message_id] = [...(next[r.message_id] || []), r];
        return next;
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function refreshMessages(match) {
    if (!currentUser || !match) return;
    try {
      const { data, error: msgError } = await supabase
        .from("messages")
        .select("*")
        .eq("match_key", matchKey(currentUser.id, match.id))
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);
      if (msgError) throw msgError;
      const chronological = (data || []).slice().reverse();
      setMessages(chronological);
      setHasMoreHistory((data || []).length === MESSAGES_PAGE_SIZE);
      markConversationRead(match);
      loadReactionsFor(chronological.map((m) => m.id));
    } catch (e) {
      console.error(e);
      setMessages([]);
      setHasMoreHistory(false);
    }
  }

  async function loadOlderMessages() {
    if (!currentUser || !activeMatch || messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0]?.created_at;
      const { data, error: olderError } = await supabase
        .from("messages")
        .select("*")
        .eq("match_key", matchKey(currentUser.id, activeMatch.id))
        .lt("created_at", oldest)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);
      if (olderError) throw olderError;
      const older = (data || []).slice().reverse();
      setMessages((m) => [...older, ...m]);
      setHasMoreHistory((data || []).length === MESSAGES_PAGE_SIZE);
      loadReactionsFor(older.map((m) => m.id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOlder(false);
    }
  }

  // Réconciliation partagée par tous les chemins d'envoi (texte/sticker/
  // média/réessai) : dédoublonnage contre l'écho Realtime, _status:"failed"
  // en cas d'erreur. "row" est un objet explicite — jamais les champs
  // locaux (_file/_progress/_status) d'un message optimiste.
  async function insertMessageRow(row, tempId) {
    try {
      const { data, error: sendError } = await supabase
        .from("messages")
        .insert(row)
        .select()
        .single();
      if (sendError) throw sendError;
      setMessages((m) => {
        const withoutRealtimeDupe = m.filter((msg) => msg.id !== data.id);
        return withoutRealtimeDupe.map((msg) => (msg.id === tempId ? data : msg));
      });
      trackActivation(currentUser.id, "first_message");
      return true;
    } catch (e) {
      console.error(e);
      setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, _status: "failed" } : msg)));
      return false;
    }
  }

  async function sendMessageText(text, tempId, replyToId) {
    await insertMessageRow(
      { match_key: matchKey(currentUser.id, activeMatch.id), from_id: currentUser.id, kind: "text", text, reply_to_id: replyToId || null },
      tempId
    );
  }

  function sendMessage() {
    if (!messageDraft.trim() || !currentUser || !activeMatch) return;
    const text = messageDraft.trim();
    const replyToId = replyingTo?.id || null;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((m) => [...m, {
      id: tempId,
      match_key: matchKey(currentUser.id, activeMatch.id),
      from_id: currentUser.id,
      kind: "text",
      text,
      media_path: null,
      media_meta: null,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: "sending",
    }]);
    setMessageDraft("");
    setReplyingTo(null);
    sendMessageText(text, tempId, replyToId);
  }

  // Utilisé pour répondre à une story (SocialShell) : contrairement à
  // sendMessage() ci-dessus, ne dépend pas de l'état activeMatch déjà à jour
  // (setActiveMatch est asynchrone — le lire juste après l'avoir appelé
  // donnerait l'ancienne valeur). openChat() charge d'abord la conversation
  // cible avant qu'on y ajoute le message.
  async function sendMessageTo(targetProfile, text) {
    const trimmed = text.trim();
    if (!currentUser || !targetProfile || !trimmed) return;
    await openChat(targetProfile);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((m) => [...m, {
      id: tempId,
      match_key: matchKey(currentUser.id, targetProfile.id),
      from_id: currentUser.id,
      kind: "text",
      text: trimmed,
      media_path: null,
      media_meta: null,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: "sending",
    }]);
    await insertMessageRow(
      { match_key: matchKey(currentUser.id, targetProfile.id), from_id: currentUser.id, kind: "text", text: trimmed },
      tempId
    );
  }

  // Un sticker n'implique jamais d'upload — la carte affichée dans le
  // sélecteur EST déjà l'aperçu, donc l'envoi est instantané.
  async function sendStickerMessage(sticker) {
    if (!currentUser || !activeMatch) return;
    const key = matchKey(currentUser.id, activeMatch.id);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const media_meta = { emoji: sticker.emoji, caption: sticker.caption || null, gradient: sticker.gradient };
    setMessages((m) => [...m, {
      id: tempId,
      match_key: key,
      from_id: currentUser.id,
      kind: "sticker",
      text: null,
      media_path: null,
      media_meta,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: "sending",
    }]);
    await insertMessageRow(
      { match_key: key, from_id: currentUser.id, kind: "sticker", text: null, media_path: null, media_meta },
      tempId
    );
  }

  // Envoie une photo/vidéo/audio/fichier avec progression réelle.
  // tempIdOverride est fourni lors d'un "Réessayer" — dans ce cas le
  // message optimiste existe déjà (avec _file), on ne le recrée pas.
  async function sendMediaMessage(file, kind, tempIdOverride) {
    if (!currentUser || !activeMatch) return;
    const validation = await validateMediaFile(file, kind);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    const key = matchKey(currentUser.id, activeMatch.id);
    const tempId = tempIdOverride || `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const media_meta = { original_name: file.name, mime: file.type, size: file.size };

    if (tempIdOverride) {
      setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, _status: "uploading", _progress: 0 } : msg)));
    } else {
      setMessages((m) => [...m, {
        id: tempId,
        match_key: key,
        from_id: currentUser.id,
        kind,
        text: null,
        media_path: null,
        media_meta,
        created_at: new Date().toISOString(),
        read_at: null,
        _status: "uploading",
        _progress: 0,
        _file: file, // local uniquement — jamais envoyé à Supabase (voir insertMessageRow)
      }]);
    }

    const path = `${key}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extFromMime(file.type)}`;
    try {
      await uploadWithProgress({
        bucket: MEDIA_BUCKET,
        path,
        file,
        onProgress: (pct) => setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, _progress: pct } : msg))),
      });
    } catch (e) {
      console.error(e);
      setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, _status: "failed" } : msg)));
      return;
    }

    const inserted = await insertMessageRow(
      { match_key: key, from_id: currentUser.id, kind, text: null, media_path: path, media_meta },
      tempId
    );
    if (!inserted) {
      // Upload Storage réussi mais INSERT échoué : jamais de fichier orphelin.
      supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => {});
    }
  }

  function retrySend(msg) {
    if (msg._file) {
      sendMediaMessage(msg._file, msg.kind, msg.id);
      return;
    }
    if (msg.kind === "sticker") {
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, _status: "sending" } : x)));
      insertMessageRow(
        { match_key: msg.match_key, from_id: currentUser.id, kind: "sticker", text: null, media_path: null, media_meta: msg.media_meta },
        msg.id
      );
      return;
    }
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, _status: "sending" } : x)));
    sendMessageText(msg.text, msg.id);
  }

  // Messages en direct + indicateur "en train d'écrire" pour la conversation active
  useEffect(() => {
    // on quitte une conversation : nettoyer les anciens canaux
    if (messagesChannelRef.current) {
      supabase.removeChannel(messagesChannelRef.current);
      messagesChannelRef.current = null;
    }
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
    if (reactionsChannelRef.current) {
      supabase.removeChannel(reactionsChannelRef.current);
      reactionsChannelRef.current = null;
    }
    setOtherTyping(false);
    if (!currentUser || !activeMatch) return;

    const key = matchKey(currentUser.id, activeMatch.id);

    const msgChannel = supabase
      .channel(`messages:${key}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_key=eq.${key}` },
        (payload) => {
          setMessages((prev) => (prev.some((m) => m.id === payload.new.id) ? prev : [...prev, payload.new]));
          if (payload.new.from_id !== currentUser.id) markConversationRead(activeMatch);
        }
      )
      .on(
        // Propage en direct read_at (coche "Lu") et deleted_at/deleted_for
        // (suppression) — sans ça, ces changements n'apparaissaient qu'après
        // avoir rouvert la conversation.
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `match_key=eq.${key}` },
        (payload) => {
          setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)));
        }
      )
      .subscribe();
    messagesChannelRef.current = msgChannel;

    const typingChannel = supabase.channel(`typing:${key}`);
    typingChannel
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id === currentUser.id) return; // ignorer sa propre frappe
        setOtherTyping(true);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    // Pas de filtre serveur possible sur message_reactions (pas de colonne
    // match_key) : RLS (message_reactions_select) restreint déjà ce qui est
    // livré à ce qui appartient à mes propres conversations, donc on filtre
    // juste ici sur les messages actuellement chargés.
    const reactionsChannel = supabase
      .channel(`reactions:${key}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload) => {
          setMessages((prevMessages) => {
            if (!prevMessages.some((m) => m.id === payload.new.message_id)) return prevMessages;
            setReactionsByMessageId((prev) => {
              const list = prev[payload.new.message_id] || [];
              if (list.some((r) => r.profile_id === payload.new.profile_id && r.emoji === payload.new.emoji)) return prev;
              return { ...prev, [payload.new.message_id]: [...list, payload.new] };
            });
            return prevMessages;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload) => {
          setReactionsByMessageId((prev) => {
            const list = prev[payload.old.message_id];
            if (!list) return prev;
            return { ...prev, [payload.old.message_id]: list.filter((r) => !(r.profile_id === payload.old.profile_id && r.emoji === payload.old.emoji)) };
          });
        }
      )
      .subscribe();
    reactionsChannelRef.current = reactionsChannel;

    return () => {
      if (messagesChannelRef.current) supabase.removeChannel(messagesChannelRef.current);
      if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
      if (reactionsChannelRef.current) supabase.removeChannel(reactionsChannelRef.current);
      clearTimeout(typingTimeoutRef.current);
    };
  }, [currentUser, activeMatch]);

  function broadcastTyping() {
    if (!currentUser || !typingChannelRef.current) return;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: currentUser.id },
    });
  }

  // Toggle : si je réagis déjà avec cet emoji sur ce message, je le retire.
  async function toggleReaction(message, emoji) {
    if (!currentUser) return;
    const existing = (reactionsByMessageId[message.id] || []).some(
      (r) => r.profile_id === currentUser.id && r.emoji === emoji
    );
    try {
      if (existing) {
        setReactionsByMessageId((prev) => ({
          ...prev,
          [message.id]: (prev[message.id] || []).filter((r) => !(r.profile_id === currentUser.id && r.emoji === emoji)),
        }));
        const { error: delError } = await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", message.id)
          .eq("profile_id", currentUser.id)
          .eq("emoji", emoji);
        if (delError) throw delError;
      } else {
        setReactionsByMessageId((prev) => ({
          ...prev,
          [message.id]: [...(prev[message.id] || []), { message_id: message.id, profile_id: currentUser.id, emoji }],
        }));
        const { error: insError } = await supabase
          .from("message_reactions")
          .insert({ message_id: message.id, profile_id: currentUser.id, emoji });
        if (insError) throw insError;
      }
    } catch (e) {
      console.error(e);
      // Resynchronise depuis la source de vérité en cas d'échec.
      loadReactionsFor([message.id]);
    }
  }

  // "Pour tout le monde" : soft delete, la ligne reste (audit) mais le
  // contenu est masqué à l'affichage pour tous via deleted_at (voir trigger
  // enforce_message_update_rules côté DB — seul l'auteur peut y toucher).
  async function deleteMessageForEveryone(message) {
    if (!currentUser) return;
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, deleted_at: new Date().toISOString(), deleted_by: currentUser.id } : x)));
    try {
      const { error: delError } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString(), deleted_by: currentUser.id })
        .eq("id", message.id);
      if (delError) throw delError;
    } catch (e) {
      console.error(e);
      setError("Impossible de supprimer ce message.");
    }
  }

  // "Pour moi" : ajoute mon id à deleted_for, masqué uniquement de mon côté.
  async function deleteMessageForMe(message) {
    if (!currentUser) return;
    const nextDeletedFor = [...(message.deleted_for || []), currentUser.id];
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, deleted_for: nextDeletedFor } : x)));
    try {
      const { error: delError } = await supabase
        .from("messages")
        .update({ deleted_for: nextDeletedFor })
        .eq("id", message.id);
      if (delError) throw delError;
    } catch (e) {
      console.error(e);
      setError("Impossible de masquer ce message.");
    }
  }

  // ---------------- RENDER ----------------

  if (updateState.mandatory) {
    return <UpdateNotice mandatory info={updateState.info} onReload={handleUpdateReload} />;
  }

  if (view === "loading" || view === "checking-profile" || session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.sand }}>
        <Loader2 className="animate-spin" color={C.indigo} size={32} />
      </div>
    );
  }

  if (view === "auth") {
    const showAuthForm = justVerified || authLinkError || pathname === "/connexion" || pathname === "/inscription";
    if (!showAuthForm) {
      if (pathname === "/a-propos") return <AboutPage navigate={navigate} />;
      if (pathname === "/confidentialite") return <PrivacyPage navigate={navigate} />;
      if (pathname === "/conditions") return <TermsPage navigate={navigate} />;
      return <LandingPage onLogin={() => navigate("/connexion")} onSignup={() => navigate("/inscription")} navigate={navigate} />;
    }
    return (
      <Auth
        initialMode={pathname === "/inscription" ? "signup" : "signin"}
        onGoHome={() => navigate("/")}
        justVerified={justVerified}
        onAcknowledgeVerified={() => setJustVerified(false)}
        authLinkError={authLinkError}
        onDismissLinkError={() => setAuthLinkError(null)}
      />
    );
  }

  if (view === "update-password") {
    return <UpdatePasswordScreen onDone={() => setView("checking-profile")} />;
  }

  if (view === "banned" || view === "suspended") {
    const isBanned = view === "banned";
    const reason = isBanned ? currentUser?.ban_reason : currentUser?.suspend_reason;
    const until = currentUser?.suspended_until ? new Date(currentUser.suspended_until) : null;
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: C.sand }}>
        <div className="bb-card p-8 max-w-sm w-full text-center">
          <div className="text-4xl mb-3">{isBanned ? "🚫" : "⏸️"}</div>
          <h1 className="text-lg font-black" style={{ color: "var(--bb-text)" }}>
            {isBanned ? "Compte banni" : "Compte suspendu"}
          </h1>
          <p className="text-sm mt-3" style={{ color: "rgba(var(--bb-text-rgb),0.7)" }}>
            {isBanned
              ? "Ton compte a été banni de Baobab suite à une violation des règles de la communauté."
              : `Ton compte est temporairement suspendu${until ? ` jusqu'au ${until.toLocaleDateString("fr-CA")} à ${until.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}` : ""}.`}
          </p>
          {reason && (
            <p className="text-sm mt-2 rounded-xl p-3" style={{ background: "rgba(var(--bb-text-rgb),0.05)", color: "rgba(var(--bb-text-rgb),0.6)" }}>
              Motif : {reason}
            </p>
          )}
          <button onClick={() => handleSignOut().then(() => navigate("/connexion"))} className="w-full mt-6 py-3 rounded-full text-sm font-bold text-white" style={{ background: C.navy }}>
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  if (locationGateBlocked) {
    return (
      <LocationRequiredGate
        onRetry={handleRetryLocationGate}
        retrying={locationGateRetrying}
        error={locationGateError}
        onSignOut={() => handleSignOut().then(() => navigate("/connexion"))}
      />
    );
  }

  if (currentUser && ["feed", "stories", "profile", "discover", "matches"].includes(view)) {
    return (
      <>
        <ConnectivityBanner />
        <AccountDeletionBanner currentUser={currentUser} onCancelled={handleCancelAccountDeletion} />
        <SessionExpiryBanner
          visible={sessionExpiryWarning}
          onStayConnected={handleStayConnected}
        />
        <UpdateNotice recommended={updateState.recommended} info={updateState.info} onReload={handleUpdateReload} onDismiss={handleUpdateDismiss} />
        <SocialShell
          updateAvailable={updateState.mandatory || updateState.recommended}
          currentUser={currentUser}
          setView={setView}
          handleSignOut={handleSignOut}
          onError={setError}
          myLocation={myLocation}
          myPlatformRole={myPlatformRole}
          candidates={candidates}
          getMatches={getMatches}
          getAdmirers={getAdmirers}
          openChat={openChat}
          closeChat={closeChat}
          handleLike={handleLike}
          handleUnlike={handleUnlike}
          hasLiked={hasLiked}
          handlePass={handlePass}
          profilePhotos={profilePhotos}
          openEditProfile={openEditProfile}
          setReportTarget={setReportTarget}
          handleBlock={requestBlock}
          handleUnmatch={handleUnmatch}
          blockedIds={blockedIds}
          profiles={profiles}
          handleSavePreferences={handleSavePreferences}
          activeMatch={activeMatch}
          messages={messages}
          hasMoreHistory={hasMoreHistory}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlderMessages}
          messageDraft={messageDraft}
          setMessageDraft={setMessageDraft}
          broadcastTyping={broadcastTyping}
          sendMessage={sendMessage}
          sendMessageTo={sendMessageTo}
          sendStickerMessage={sendStickerMessage}
          sendMediaMessage={sendMediaMessage}
          retrySend={retrySend}
          otherTyping={otherTyping}
          setSettingsOpen={setSettingsOpen}
          replyingTo={replyingTo}
          setReplyingTo={setReplyingTo}
          reactionsByMessageId={reactionsByMessageId}
          toggleReaction={toggleReaction}
          deleteMessageForMe={deleteMessageForMe}
          deleteMessageForEveryone={deleteMessageForEveryone}
        />
        {matchNotice && (
          <MatchCelebrationModal
            match={matchNotice}
            currentUser={currentUser}
            onStartChat={() => { const m = matchNotice; setMatchNotice(null); openChat(m); }}
            onDismiss={() => setMatchNotice(null)}
          />
        )}
        {successNotice && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[95] px-4 py-3 rounded-2xl text-sm font-semibold text-white shadow-xl" style={{ background: C.primary }}>
            {successNotice}
          </div>
        )}
        {error && (
          <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-xl max-w-[92vw]" style={{ background: C.dangerBg, color: C.clay }}>
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Fermer le message d'erreur" className="text-xs font-bold underline flex-shrink-0">Fermer</button>
          </div>
        )}
        <AppModals
          reportTarget={reportTarget}
          setReportTarget={setReportTarget}
          reportReason={reportReason}
          setReportReason={setReportReason}
          reportCategory={reportCategory}
          setReportCategory={setReportCategory}
          reportSending={reportSending}
          reportSubmitted={reportSubmitted}
          submitReport={submitReport}
          cancelReport={cancelReport}
          dismissReportAfterSubmit={dismissReportAfterSubmit}
          blockTarget={blockTarget}
          setBlockTarget={setBlockTarget}
          confirmBlock={confirmBlock}
          settingsOpen={settingsOpen}
          setSettingsOpen={setSettingsOpen}
          currentUser={currentUser}
          onToggleOnlineStatus={handleToggleOnlineStatus}
          onToggleDating={handleToggleDating}
          onToggleField={handleToggleField}
          onUpdateNotificationPreference={handleUpdateNotificationPreference}
          blockedProfiles={blockedProfiles}
          onUnblock={handleUnblock}
          privacyOpen={privacyOpen}
          setPrivacyOpen={setPrivacyOpen}
          termsOpen={termsOpen}
          setTermsOpen={setTermsOpen}
          aboutOpen={aboutOpen}
          setAboutOpen={setAboutOpen}
          myLocation={myLocation}
          onEnableLocation={handleEnableLocation}
          onDisableLocation={handleDisableLocation}
          onUpdateLocationPref={handleUpdateLocationPref}
          onAccountDeletionRequested={handleAccountDeletionRequested}
        />
      </>
    );
  }

  return (
    <div className="bb-app min-h-screen flex flex-col relative" style={{ fontFamily: "'Manrope', system-ui, sans-serif", color: C.ink }}>
      <ConnectivityBanner />
      <AccountDeletionBanner currentUser={currentUser} onCancelled={handleCancelAccountDeletion} />
      <SessionExpiryBanner
        visible={sessionExpiryWarning}
        onStayConnected={handleStayConnected}
      />
      <UpdateNotice recommended={updateState.recommended} info={updateState.info} onReload={handleUpdateReload} onDismiss={handleUpdateDismiss} />
      <style>{`
        @keyframes bbGenericDrift { from { transform: scale(1.02); } to { transform: scale(1.06) translate3d(-1%, -1%, 0); } }
        .bb-generic-bg { animation: bbGenericDrift 26s ease-in-out alternate infinite; }
        .bb-generic-glass { background: rgba(255,255,255,.82) !important; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        @media (prefers-reduced-motion: reduce) { .bb-app * { animation: none !important; transition: none !important; } }
      `}</style>
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none" style={{ background: C.sand }} />
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-5 py-4 bb-generic-glass" style={{ borderBottom: `1px solid rgba(var(--bb-ink-rgb-static),0.08)`, boxShadow: "0 1px 0 rgba(8,20,14,0.06)", position: "sticky", top: 0, zIndex: 10 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 600, fontSize: 20, color: C.indigo }}>
            Baobab
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: C.ochre, color: C.indigoDeep, fontWeight: 700 }}>
            prototype
          </span>
        </div>
      </div>

      {error && (
        <div className="relative z-20 mx-5 mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: C.dangerBg, color: C.clay }}>
          {error}
        </div>
      )}

      <div className="relative z-10 flex-1 flex flex-col">
        {/* ---------- ONBOARDING (Phase 3) — remplace l'ancien formulaire unique ---------- */}
        {view === "onboarding" && (
          <OnboardingWizard
            session={session}
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            setProfiles={setProfiles}
            setProfilePhotos={setProfilePhotos}
            photoFiles={photoFiles}
            photoPreviews={photoPreviews}
            handlePhotosSelected={handlePhotosSelected}
            removePhotoFile={removePhotoFile}
            setPhotoFiles={setPhotoFiles}
            setPhotoPreviews={setPhotoPreviews}
            uploadPhoto={uploadPhoto}
            setView={setView}
          />
        )}

        {/* ---------- ÉDITION DE PROFIL ---------- */}
        {view === "editProfile" && editForm && (
          <EditProfileForm
            setView={setView}
            editForm={editForm}
            setEditForm={setEditForm}
            coverPreview={coverPreview}
            currentUser={currentUser}
            setCoverFile={setCoverFile}
            setCoverPreview={setCoverPreview}
            coverRemoved={coverRemoved}
            setCoverRemoved={setCoverRemoved}
            existingPhotos={existingPhotos}
            removeExistingPhoto={removeExistingPhoto}
            moveExistingPhoto={moveExistingPhoto}
            setPrimaryPhoto={setPrimaryPhoto}
            newPhotoPreviews={newPhotoPreviews}
            removeNewPhotoFile={removeNewPhotoFile}
            handleNewPhotosSelected={handleNewPhotosSelected}
            savingProfile={savingProfile}
            handleSaveProfile={handleSaveProfile}
            onError={setError}
          />
        )}

      </div>

      <AppModals
        reportTarget={reportTarget}
        setReportTarget={setReportTarget}
        reportReason={reportReason}
        setReportReason={setReportReason}
        reportCategory={reportCategory}
        setReportCategory={setReportCategory}
        reportSending={reportSending}
        reportSubmitted={reportSubmitted}
        submitReport={submitReport}
        cancelReport={cancelReport}
        dismissReportAfterSubmit={dismissReportAfterSubmit}
        blockTarget={blockTarget}
        setBlockTarget={setBlockTarget}
        confirmBlock={confirmBlock}
        settingsOpen={settingsOpen}
        setSettingsOpen={setSettingsOpen}
        currentUser={currentUser}
        onToggleOnlineStatus={handleToggleOnlineStatus}
        onToggleDating={handleToggleDating}
        onToggleField={handleToggleField}
        onUpdateNotificationPreference={handleUpdateNotificationPreference}
        blockedProfiles={blockedProfiles}
        onUnblock={handleUnblock}
        privacyOpen={privacyOpen}
        setPrivacyOpen={setPrivacyOpen}
        termsOpen={termsOpen}
        setTermsOpen={setTermsOpen}
        aboutOpen={aboutOpen}
        setAboutOpen={setAboutOpen}
        onAccountDeletionRequested={handleAccountDeletionRequested}
      />

    </div>
  );
}
