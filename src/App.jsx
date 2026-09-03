import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import { C, EDUCATION_LEVELS, HAS_CHILDREN_OPTIONS, MAX_PHOTOS } from "./constants";
import { matchKey } from "./utils/format";
import SocialShell from "./components/SocialShell";
import AppModals from "./components/AppModals";
import ConnectivityBanner from "./components/ConnectivityBanner";
import AccountDeletionBanner from "./components/AccountDeletionBanner";
import UpdateNotice from "./components/UpdateNotice";
import { checkForUpdate, wasRecentlyDismissed, dismissUpdate, CHECK_INTERVAL_MS } from "./lib/version";
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
import { disablePushNotifications } from "./lib/pushNotifications";
import { isLikelyInCanada, TRAVEL_GRACE_PERIOD_MS } from "./lib/canadaGate";
import { friendlyDbError } from "./lib/friendlyDbError";
import { usePathname } from "./hooks/usePathname";
import LandingPage from "./screens/public/LandingPage";
import AboutPage from "./screens/public/AboutPage";
import PrivacyPage from "./screens/public/PrivacyPage";
import TermsPage from "./screens/public/TermsPage";
import LocationRequiredGate from "./components/LocationRequiredGate";
import { useOnlineStatus } from "./hooks/useOnlineStatus";

const PUBLIC_ONLY_PATHS = new Set(["/connexion", "/inscription", "/a-propos", "/confidentialite", "/conditions"]);

export default function App() {
  // Réarme le filet anti-boucle de ChunkErrorBoundary.jsx une fois l'app
  // montée avec succès, pour qu'un futur déploiement (nouveaux hashs de
  // chunks) puisse à nouveau déclencher un rechargement automatique.
  useEffect(() => {
    const t = setTimeout(() => sessionStorage.removeItem("bb-chunk-reload"), 5000);
    return () => clearTimeout(t);
  }, []);

  const [session, setSession] = useState(undefined); // undefined = pas encore vérifié, null = pas connecté
  // Lu (et jamais utilisé pour déclencher un rendu) par le listener
  // onAuthStateChange ci-dessous pour comparer le TOKEN_REFRESHED entrant à
  // l'utilisateur déjà connu sans fermer sur une valeur figée de "session"
  // (l'effet qui installe ce listener a des deps [] pour ne s'abonner qu'une
  // fois). Voir le bug corrigé documenté plus bas.
  const sessionRef = useRef(undefined);
  const [view, setView] = useState("loading"); // loading | form | feed | discover | matches | stories
  const { isOnline } = useOnlineStatus();
  const { pathname, navigate } = usePathname();
  const [profiles, setProfiles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [likePairs, setLikePairs] = useState([]); // [{from_id, to_id}]
  const [passPairs, setPassPairs] = useState([]); // [{from_id, to_id}]
  // Profils complets de tout le monde qui m'a liké (jointure directe sur
  // "likes", to_id = moi), alimentant getMatches()/getAdmirers() ci-dessous.
  // Corrige le même bug de "disparition silencieuse" déjà corrigé pour
  // favorites/follows (voir favoriteProfilesRaw dans SocialShell.jsx) :
  // getMatches()/getAdmirers() filtraient auparavant le cache local
  // "profiles", plafonné à 500 lignes triées par ancienneté (loadAll
  // ci-dessous) — un match ou un·e admirateur·ice dont le profil a été créé
  // après ce plafond restait invisible dans "Qui m'a aimé" et dans l'onglet
  // Messages, alors que le like existait bel et bien en base.
  const [likerProfilesRaw, setLikerProfilesRaw] = useState([]);
  // Profils complets des comptes que j'ai bloqués (jointure directe sur
  // "blocks", from_id = moi) — voir le commentaire dans loadAll : alimente
  // la modale "Comptes bloqués" sans dépendre du cache "profiles" plafonné.
  const [blockedProfilesRaw, setBlockedProfilesRaw] = useState([]);
  const likeInFlightRef = useRef(new Set()); // to_id en cours d'envoi — évite un double clic = double insert
  const passInFlightRef = useRef(new Set());
  const likePairsRef = useRef(likePairs); // lu par l'abonnement realtime "likes" sans le forcer à se réabonner à chaque like
  const profilesRef = useRef(profiles); // idem, pour retrouver le profil qui vient de matcher
  const likerProfilesRawRef = useRef(likerProfilesRaw); // lu par l'abonnement realtime "likes" sans le forcer à se réabonner
  const blockPairsRef = useRef([]); // idem, pour ignorer un like venant d'une personne bloquée dans un sens ou l'autre
  const activeMatchRef = useRef(null); // lu par l'abonnement realtime "blocks-passes" sans le forcer à se réabonner à chaque changement de conversation ouverte
  const likesChannelRef = useRef(null);
  const [matchNotice, setMatchNotice] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const messagesRef = useRef(messages); // lu par l'effet d'inactivité sans le forcer à se réabonner à chaque message
  // Jeton anti-race pour refreshMessages : un clic rapide entre deux
  // conversations lance deux requêtes réseau qui peuvent revenir dans le
  // désordre ; sans ce garde, la réponse de la conversation A qui arrive
  // après celle de B écrasait les messages de B (déjà affichés sous le bon
  // en-tête) avec ceux de A.
  const chatLoadTokenRef = useRef(0);
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
  // Minuteur du bandeau de succès ci-dessus, voir showSuccessNotice().
  const successNoticeTimerRef = useRef(null);
  const [initialSocialTab, setInitialSocialTab] = useState(null); // onglet à ouvrir au premier montage de SocialShell (ex. retour de paiement Stripe)
  const [justSubscribed, setJustSubscribed] = useState(false); // vient de compléter un paiement Stripe Checkout — PremiumPage doit revérifier son statut (le webhook Stripe est asynchrone)
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
  // File d'attente des écritures d'ordre des photos (persistPhotoOrder) — bug
  // identifié à l'audit : moveExistingPhoto()/setPrimaryPhoto() ne s'attendent
  // jamais entre elles (mise à jour locale optimiste immédiate), donc deux
  // clics rapprochés (flèche haut/bas, ou "définir comme principale" juste
  // après un déplacement) déclenchaient deux requêtes upsert("profile_photos")
  // en parallèle. Rien ne garantit que leurs réponses réseau arrivent dans
  // l'ordre où elles ont été envoyées : si la première (ordre désormais
  // obsolète) répond APRÈS la seconde, elle écrasait en base l'ordre le plus
  // récent — la grille affichée localement restait correcte, mais la base
  // divergeait silencieusement jusqu'au prochain rechargement complet, qui
  // ramenait alors l'ancien ordre. Chaîner chaque appel sur le précédent
  // garantit que les écritures atteignent la base dans le même ordre que les
  // clics qui les ont déclenchées.
  const photoOrderChainRef = useRef(Promise.resolve());
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
      // Jointure directe sur "likes" (to_id = moi) pour récupérer le profil
      // complet de chaque personne qui m'a liké, sans dépendre du cache
      // "profiles" plafonné à 500 lignes — voir le commentaire sur
      // likerProfilesRaw plus haut. Alias explicite "from_id" nécessaire
      // car "likes" a deux FK vers profiles (from_id et to_id) ; sans lui
      // PostgREST ne peut pas savoir laquelle utiliser pour l'embed.
      const likerQuery = myProfileId
        ? supabase.from("likes").select("from_id, profile:from_id(*)").eq("to_id", myProfileId)
        : null;
      // Même correctif que likerQuery ci-dessus, appliqué à la modale "Comptes
      // bloqués" (AppModals.jsx) : elle filtrait jusqu'ici le cache "profiles"
      // plafonné à 500 lignes pour retrouver les profils bloqués, donc toute
      // personne bloquée mais absente de ces 500 premières lignes disparaissait
      // silencieusement de la liste — impossible de la débloquer depuis l'UI
      // bien que le blocage existait toujours en base. Jointure directe sur
      // "blocks" (from_id = moi) à la place.
      const blockedQuery = myProfileId
        ? supabase.from("blocks").select("to_id, profile:to_id(*)").eq("from_id", myProfileId)
        : null;

      const [likeRes, passRes, blockRes, likerRes, blockedProfRes] = await Promise.all([
        likeQuery,
        passQuery,
        blockQuery,
        likerQuery || Promise.resolve({ data: [], error: null }),
        blockedQuery || Promise.resolve({ data: [], error: null }),
      ]);
      if (likeRes.error) throw likeRes.error;
      if (passRes.error) throw passRes.error;
      if (blockRes.error) throw blockRes.error;
      if (likerRes.error) throw likerRes.error;
      if (blockedProfRes.error) throw blockedProfRes.error;
      setProfiles(profRes.data || []);
      setLikePairs(likeRes.data || []);
      setPassPairs(passRes.data || []);
      setBlockPairs(blockRes.data || []);
      setLikerProfilesRaw((likerRes.data || []).map((r) => r.profile).filter(Boolean));
      setBlockedProfilesRaw((blockedProfRes.data || []).map((r) => r.profile).filter(Boolean));
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

  // Affiche le bandeau de succès pendant durationMs puis l'efface. Annule
  // d'abord tout minuteur laissé par un appel précédent : avant ce correctif,
  // chaque site d'appel posait son propre setTimeout indépendant (comme pour
  // "error" ci-dessus, mais sans le nettoyage via useEffect) — si un second
  // bandeau s'affichait pendant que le minuteur du premier était encore en
  // vol (ex. retour de paiement Stripe suivi de près par un blocage), ce
  // minuteur obsolète effaçait le second message bien avant la durée prévue
  // pour lui, indépendamment de son propre contenu.
  function showSuccessNotice(text, durationMs) {
    if (successNoticeTimerRef.current) clearTimeout(successNoticeTimerRef.current);
    setSuccessNotice(text);
    successNoticeTimerRef.current = setTimeout(() => {
      setSuccessNotice("");
      successNoticeTimerRef.current = null;
    }, durationMs);
  }

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
    // Retour de Stripe Checkout (success_url/cancel_url — voir
    // create-checkout-session/index.ts) : aucun routeur ici, donc c'est le
    // seul endroit qui peut détecter ce retour. Avant ce correctif, ce
    // paramètre n'était lu nulle part : l'utilisateur revenait sur l'app
    // sans confirmation ni redirection vers l'onglet Premium.
    const premiumFlag = params.get("premium"); // "success" | "cancelled"
    let linkErrorCode = null;
    if (hash && hash.includes("error=")) {
      linkErrorCode = new URLSearchParams(hash.replace(/^#/, "")).get("error_code");
    }
    if (verifiedFlag) pendingVerifiedRef.current = true;
    if (linkErrorCode) setAuthLinkError(linkErrorCode);
    if (premiumFlag === "success") {
      setInitialSocialTab("premium");
      setJustSubscribed(true);
      showSuccessNotice("Paiement reçu ! Activation de Premium en cours (quelques secondes).", 6000);
    } else if (premiumFlag === "cancelled") {
      setInitialSocialTab("premium");
      showSuccessNotice("Paiement annulé, aucun montant n'a été prélevé.", 5000);
    }
    if (verifiedFlag || linkErrorCode || premiumFlag) {
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Bug corrigé : cet appel manuel à getSession() faisait doublon avec
    // l'évènement "INITIAL_SESSION" que supabase-js émet TOUJOURS de
    // lui-même juste après l'abonnement à onAuthStateChange ci-dessous (une
    // fois this.initializePromise résolu — comportement garanti par
    // GoTrueClient, pas une coïncidence). Les deux relisent le stockage
    // local séparément (__loadSession() ne met rien en cache mémoire) et
    // produisent donc deux objets session distincts en mémoire pour les
    // mêmes données — deux références différentes que React ne peut pas
    // dédupliquer. Résultat : à CHAQUE ouverture de l'app (pas seulement
    // après ~1h comme le bug TOKEN_REFRESHED ci-dessous), l'effet
    // [session, loadAll] plus bas se déclenchait deux fois de suite et
    // lançait deux loadAll() concurrents — jusqu'à 500 profils + 3200
    // photos + likes/passes/blocks chargés EN DOUBLE à chaque connexion,
    // sans aucun garde anti-course entre les deux appels. Laisser
    // onAuthStateChange seul gérer la session initiale via son évènement
    // "INITIAL_SESSION" (déjà traité par le bloc par défaut plus bas, qui
    // met sessionRef à jour et appelle setSession) suffit et supprime le
    // doublon.
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // Ne JAMAIS laisser une confirmation d'email connecter automatiquement
      // l'utilisateur : Supabase établit réellement une session (preuve que
      // le lien était valide), mais on la referme aussitôt et on affiche
      // "email vérifié, entre ton mot de passe" à la place.
      if (event === "SIGNED_IN" && pendingVerifiedRef.current) {
        pendingVerifiedRef.current = false;
        // supabase.auth.signOut() peut réellement rejeter (aléa réseau — voir
        // le même correctif sur handleSignOut plus bas) : sans ce .catch,
        // l'écran "email vérifié, entre ton mot de passe" ne s'affichait
        // alors jamais (setJustVerified jamais appelé), laissant la personne
        // sur l'écran de connexion sans aucune explication après avoir
        // cliqué le lien reçu par email.
        supabase.auth.signOut().then(() => setJustVerified(true)).catch((e) => { console.error(e); setJustVerified(true); });
        return;
      }
      // Bug corrigé : Supabase émet divers évènements sans aucune action de
      // l'utilisateur, pour le même compte déjà connu. TOKEN_REFRESHED
      // renouvelle le jeton en arrière-plan (~1h de durée de vie par
      // défaut). Et surtout, la reprise de visibilité de l'onglet
      // (changement d'onglet, verrouillage d'écran) déclenche en interne
      // GoTrueClient#_onVisibilityChanged -> #_recoverAndRefresh, qui —
      // quand le jeton n'est pas encore dans sa marge d'expiration —
      // ré-émet SIGNED_IN avec la MÊME session inchangée (voir
      // node_modules/@supabase/auth-js GoTrueClient.js, branche vers
      // "await this._notifyAllSubscribers('SIGNED_IN', currentSession)" en
      // fin de _recoverAndRefresh). setSession(newSession) alimente l'effet
      // [session, loadAll] plus bas, qui rechargerait ENTIÈREMENT l'app
      // (loadAll : jusqu'à 500 profils + 3200 photos + likes/passes/
      // blocks...) et forcerait setView("checking-profile") — un écran de
      // chargement plein écran qui remplacerait toute l'app en cours
      // d'utilisation (message en train d'être tapé, upload en cours,
      // modale ouverte...) pour retomber ensuite sur l'onglet Feed par
      // défaut. Un évènement silencieux pour le même utilisateur ne doit
      // jamais déclencher ça, quel que soit son nom : le client Supabase
      // gère déjà en interne le jeton pour toutes les requêtes, donc on
      // ignore l'évènement ici (tout en gardant sessionRef à jour, au cas
      // où un vrai changement d'utilisateur suit). PASSWORD_RECOVERY est
      // volontairement exclu de ce garde-fou : il doit toujours être traité
      // plus bas pour basculer la vue, même s'il vise le compte déjà
      // connecté.
      if (event !== "PASSWORD_RECOVERY" && newSession?.user?.id && newSession.user.id === sessionRef.current?.user?.id) {
        sessionRef.current = newSession;
        return;
      }
      sessionRef.current = newSession;
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

  useEffect(() => {
    likePairsRef.current = likePairs;
  }, [likePairs]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    likerProfilesRawRef.current = likerProfilesRaw;
  }, [likerProfilesRaw]);

  useEffect(() => {
    blockPairsRef.current = blockPairs;
  }, [blockPairs]);

  useEffect(() => {
    activeMatchRef.current = activeMatch;
  }, [activeMatch]);

  // Déconnexion automatique par inactivité : retirée définitivement sur
  // demande explicite (les sessions ne doivent plus jamais expirer par
  // simple inactivité).

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
      // Bug : la session de récupération de mot de passe (événement
      // PASSWORD_RECOVERY, voir plus haut) est une session Supabase valide
      // comme une autre — elle déclenche donc aussi cet effet. Sans cette
      // garde, loadAll() se terminait après le setView("update-password")
      // du listener onAuthStateChange et écrasait la vue : l'utilisateur
      // qui cliquait sur le lien "mot de passe oublié" reçu par email se
      // retrouvait directement connecté dans l'app, sans jamais passer par
      // l'écran de saisie du nouveau mot de passe. UpdatePasswordScreen
      // repasse lui-même à "checking-profile" une fois le mot de passe mis
      // à jour (onDone).
      setView((v) => (v === "update-password" ? v : "checking-profile"));
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
          // localStorage (voir Auth.jsx) : partagé entre onglets du même
          // navigateur, contrairement à sessionStorage — nécessaire car le
          // lien de confirmation par email s'ouvre typiquement dans un
          // nouvel onglet, différent de celui où le formulaire d'inscription
          // a été rempli. Expire après 24h pour ne jamais réutiliser une
          // position obsolète laissée par une inscription abandonnée.
          const pending = localStorage.getItem("bb-pending-location");
          if (pending) {
            const { latitude, longitude, savedAt } = JSON.parse(pending);
            if (typeof latitude === "number" && typeof longitude === "number" && Date.now() - (savedAt || 0) < 24 * 60 * 60 * 1000) {
              row = await upsertMyLocation({ location_enabled: true, latitude_approx: latitude, longitude_approx: longitude });
            }
          }
        } catch (_) {}
        finally {
          localStorage.removeItem("bb-pending-location");
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

  // Restriction géographique du module Rencontres au Canada (Baobab 3.0,
  // prompt-geolocalisation-et-ouverture-baobab.md, Partie A) — distincte du
  // garde-fou d'accès bêta ci-dessus (qui exige seulement une position, pas
  // une position canadienne). À chaque position confirmée au Canada, on
  // avance last_in_canada_at ; un compte déjà établi qui voyage
  // temporairement hors Canada garde l'accès pendant TRAVEL_GRACE_PERIOD_MS
  // plutôt que de le perdre au premier déplacement (voir canadaGate.js).
  const inCanada = myLocation
    ? isLikelyInCanada(myLocation.latitude_approx, myLocation.longitude_approx)
    : null;
  useEffect(() => {
    if (!currentUser?.id || inCanada !== true || !myLocation) return;
    const last = myLocation.last_in_canada_at ? new Date(myLocation.last_in_canada_at).getTime() : 0;
    if (Date.now() - last < 60 * 60 * 1000) return; // déjà à jour depuis moins d'une heure, évite un upsert à chaque rendu
    upsertMyLocation({ last_in_canada_at: new Date().toISOString() })
      .then((row) => setMyLocation(row))
      .catch((e) => console.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, inCanada, myLocation?.last_in_canada_at]);

  const discoverGateBlocked = Boolean(
    currentUser && myLocation && inCanada === false &&
    (!myLocation.last_in_canada_at || Date.now() - new Date(myLocation.last_in_canada_at).getTime() > TRAVEL_GRACE_PERIOD_MS)
  );

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

  // Applique le profil retrouvé (banni/suspendu/onboarding/feed) — factorisé
  // pour être appelé aussi bien depuis le cache local que depuis le filet de
  // secours réseau ci-dessous.
  function applyOwnProfile(own) {
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
  }

  useEffect(() => {
    if (view !== "checking-profile") return;
    if (!session) return;
    const own = profiles.find((p) => p.user_id === session.user.id);
    if (own) {
      applyOwnProfile(own);
      return;
    }
    // Bug corrigé : "profiles" (chargé par loadAll) est plafonné à 500 lignes
    // triées par ancienneté — tout compte créé après ce plafond n'y figure
    // jamais. Sans filet de secours, ce `.find` échouait silencieusement pour
    // ces comptes à CHAQUE connexion (et à chaque rechargement de page), et
    // l'app les renvoyait vers l'onboarding en les traitant comme s'ils
    // n'avaient jamais créé de profil — alors que le profil existe bien en
    // base. On retente donc une requête directe par user_id avant de conclure
    // à l'absence de profil (même filet que likerProfilesRaw/favoriteProfiles
    // ailleurs dans l'app pour ce même cache plafonné).
    let alive = true;
    supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) console.error(error.message, error.code, error.details, error.hint);
      if (data) {
        applyOwnProfile(data);
      } else {
        setCurrentUser(null);
        setView("onboarding");
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, profiles, session]);

  function handleAccountDeletionRequested() {
    setCurrentUser((u) => (u ? { ...u, deletion_requested_at: new Date().toISOString() } : u));
  }

  function handleCancelAccountDeletion() {
    setCurrentUser((u) => (u ? { ...u, deletion_requested_at: null } : u));
  }

  // Export des données personnelles (item audit Paramètres/confidentialité —
  // obligation légale, pas juste une bonne pratique). Portée volontairement
  // limitée à ce que l'utilisateur a lui-même créé/renseigné (profil,
  // publications, statuts, participations) — pas les messages d'autrui dans
  // une conversation partagée. Tout en lecture, RLS self-only déjà en place,
  // aucune nouvelle requête privilégiée nécessaire. Téléchargement direct
  // côté client, rien n'est envoyé à un tiers.
  // "Exporter mes données" doit couvrir tout le contenu que l'utilisateur a
  // lui-même créé, pas seulement le fil principal — audit du 2026-08-26 :
  // il manquait les photos de galerie (table profile_photos, distincte de
  // profile.avatar_url), les commentaires du fil (post_comments) et TOUTE
  // l'activité communautaire (community_posts, community_comments) alors
  // que ces tables existent depuis longtemps (supabase-feed-posts.sql,
  // supabase-communities.sql). De plus aucune requête ne vérifiait son
  // "error" : une ligne bloquée par une policy RLS ou une erreur réseau
  // partielle produisait un export tronqué que Promise.all laissait passer
  // sans jamais le signaler (le catch englobant n'attrape que les rejets,
  // pas un { data: null, error } résolu normalement par Supabase).
  async function handleExportData() {
    if (!currentUser) return;
    try {
      const queries = {
        posts: supabase.from("posts").select("*").eq("author_id", currentUser.id),
        photos: supabase.from("profile_photos").select("*").eq("profile_id", currentUser.id),
        stories: supabase.from("stories").select("*").eq("profile_id", currentUser.id),
        event_participations: supabase.from("event_attendees").select("event_id, status, created_at").eq("profile_id", currentUser.id),
        community_memberships: supabase.from("community_members").select("community_id, role, created_at").eq("profile_id", currentUser.id),
        messages_sent: supabase.from("messages").select("id, match_key, kind, text, created_at").eq("from_id", currentUser.id),
        post_comments: supabase.from("post_comments").select("id, post_id, body, created_at").eq("author_id", currentUser.id),
        community_posts: supabase.from("community_posts").select("id, community_id, body, created_at").eq("author_id", currentUser.id),
        community_comments: supabase.from("community_comments").select("id, post_id, body, created_at").eq("author_id", currentUser.id),
        // Bug corrigé (audit RGPD/LPRPDE) : cet export se présentait comme "mes
        // données" mais omettait plusieurs catégories de données personnelles
        // bel et bien générées par l'utilisateur — likes donnés/reçus, passes,
        // favoris, abonnements/abonnés, blocages et signalements déposés.
        // Toutes reposent sur le même schéma from_id/to_id que les tables déjà
        // exportées ci-dessus.
        likes_sent: supabase.from("likes").select("to_id, created_at").eq("from_id", currentUser.id),
        likes_received: supabase.from("likes").select("from_id, created_at").eq("to_id", currentUser.id),
        passes_sent: supabase.from("passes").select("to_id, created_at").eq("from_id", currentUser.id),
        favorites: supabase.from("favorites").select("to_id, created_at").eq("from_id", currentUser.id),
        following: supabase.from("follows").select("to_id, created_at").eq("from_id", currentUser.id),
        followers: supabase.from("follows").select("from_id, created_at").eq("to_id", currentUser.id),
        blocks: supabase.from("blocks").select("to_id, created_at").eq("from_id", currentUser.id),
        reports_submitted: supabase.from("reports").select("to_id, category, reason, created_at").eq("from_id", currentUser.id),
      };
      const keys = Object.keys(queries);
      const results = await Promise.all(keys.map((k) => queries[k]));

      const payload = { exported_at: new Date().toISOString(), profile: currentUser };
      const failedCategories = [];
      keys.forEach((key, i) => {
        const { data, error } = results[i];
        if (error) { console.error(key, error); failedCategories.push(key); }
        payload[key] = data || [];
      });

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `baobab-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Le fichier part quand même (mieux vaut un export partiel que rien),
      // mais l'utilisateur doit savoir qu'il est incomplet plutôt que de
      // croire à tort avoir la totalité de ses données.
      if (failedCategories.length > 0) {
        setError("Export téléchargé, mais incomplet : certaines données n'ont pas pu être récupérées. Réessaie plus tard ou contacte le support si le problème persiste.");
      }
    } catch (e) {
      console.error(e);
      setError("Impossible d'exporter tes données pour le moment. Réessaie.");
    }
  }

  async function handleSignOut() {
    // Bug corrigé : sur un appareil partagé (ordinateur familial/public), le
    // navigateur reste abonné aux notifications push de CE compte après la
    // déconnexion — rien ne désabonnait jamais push_subscriptions au moment
    // de "Déconnexion". Un compte B se connectant ensuite sur le même
    // appareil récupérait un getPushSubscriptionStatus().subscribed === true
    // hérité du compte A (la souscription PushManager du navigateur reste
    // active) sans jamais rappeler enablePushNotifications() — la ligne
    // push_subscriptions restait donc rattachée à A. Résultat : send-push
    // continuait de notifier A (nouveaux messages, matchs...) sur un
    // appareil qu'il n'utilise plus, pendant que B croit à tort avoir les
    // push activées alors qu'aucune notification ne lui parvient jamais.
    // Doit s'exécuter AVANT signOut() : la policy RLS "push_subscriptions_
    // delete_own" exige auth.uid() = user_id, donc la ligne ne peut plus
    // être supprimée une fois la session de A terminée. Best-effort : ne
    // doit jamais empêcher la déconnexion si le nettoyage échoue.
    try {
      await disablePushNotifications();
    } catch (e) {
      console.error(e);
    }
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // supabase.auth.signOut() peut réellement rejeter (AuthRetryableFetchError
      // d'auth-js sur un aléa réseau/CORS pendant l'appel serveur) — ce n'est
      // pas juste un { error } comme la plupart des appels Supabase. Sans ce
      // try/catch, le nettoyage de l'état local et la navigation ci-dessous
      // ne s'exécutaient jamais, et les deux appelants (App.jsx, tous deux
      // `handleSignOut().then(() => navigate("/connexion"))` sans .catch) ne
      // faisaient plus rien : le clic sur "Déconnexion" restait sans aucun
      // effet visible. On nettoie quand même l'état local et on laisse la
      // navigation se faire malgré l'échec réseau — rester affiché comme si
      // de rien n'était serait pire qu'une déconnexion traitée localement.
      console.error(e);
    }
    setCurrentUser(null);
    setProfiles([]);
    setLikePairs([]);
    setPassPairs([]);
    setLikerProfilesRaw([]);
    setBlockedProfilesRaw([]);
  }

  const hasLiked = (from, to) => likePairs.some((l) => l.from_id === from && l.to_id === to);
  const hasPassed = (from, to) => passPairs.some((p) => p.from_id === from && p.to_id === to);
  const hasBlocked = (from, to) => blockPairs.some((b) => b.from_id === from && b.to_id === to);

  // getMatches()/getAdmirers() ne filtraient auparavant que le cache local
  // "profiles" (plafonné à 500 lignes, triées par ancienneté — voir loadAll)
  // : un match ou un·e admirateur·ice créé·e après ce plafond disparaissait
  // silencieusement, alors que le like existait bel et bien en base (même
  // bug que favoriteProfiles/followedProfiles, déjà corrigé ailleurs). Les
  // deux fonctions ne retiennent que des profils qui m'ont liké — un
  // sous-ensemble exact de likerProfilesRaw (jointure directe, non plafonnée)
  // — donc partir de cette liste au lieu de "profiles" résout le problème
  // sans changer la logique de sélection.
  const getMatches = useCallback(() => {
    if (!currentUser) return [];
    return likerProfilesRaw.filter(
      (p) =>
        p.id !== currentUser.id &&
        hasLiked(currentUser.id, p.id) &&
        hasLiked(p.id, currentUser.id) &&
        !hasBlocked(currentUser.id, p.id) &&
        !hasBlocked(p.id, currentUser.id)
    );
  }, [likerProfilesRaw, likePairs, blockPairs, currentUser]);

  // "Qui m'a aimé" (avantage Premium) : m'a aimé, mais pas encore réciproque
  // — dès que handleLike() est appelé dessus, hasLiked() devient vrai des
  // deux côtés et le profil bascule naturellement dans getMatches() au
  // prochain rendu (aucune action "confirmer le match" séparée nécessaire).
  const getAdmirers = useCallback(() => {
    if (!currentUser) return [];
    return likerProfilesRaw.filter(
      (p) =>
        p.id !== currentUser.id &&
        hasLiked(p.id, currentUser.id) &&
        !hasLiked(currentUser.id, p.id) &&
        !hasBlocked(currentUser.id, p.id) &&
        !hasBlocked(p.id, currentUser.id)
    );
  }, [likerProfilesRaw, likePairs, blockPairs, currentUser]);

  async function performBlock(target) {
    if (!currentUser) return;
    try {
      const { error: blockError } = await supabase
        .from("blocks")
        .insert({ from_id: currentUser.id, to_id: target.id });
      if (blockError) throw blockError;
      setBlockPairs((b) => [...b, { from_id: currentUser.id, to_id: target.id }]);
      // Tient blockedProfilesRaw à jour immédiatement (sans attendre un
      // prochain loadAll) — même logique que setBlockPairs ci-dessus, pour
      // que la modale "Comptes bloqués" reflète ce blocage tout de suite.
      setBlockedProfilesRaw((b) => (b.some((p) => p.id === target.id) ? b : [...b, target]));
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
    showSuccessNotice("Cette personne ne pourra plus interagir avec toi sur Baobab.", 4000);
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
      setBlockedProfilesRaw((b) => b.filter((p) => p.id !== target.id));
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
    // Comme les autres bascules de profil (handleToggleField, notifications,
    // localisation) : mise à jour optimiste puis retour en arrière si
    // l'écriture Supabase échoue. Sans ce revert, un échec réseau/RLS
    // silencieux laissait l'utilisateur croire ses préférences enregistrées
    // (et le filtrage Découverte s'appliquait sur les valeurs jamais
    // persistées) alors que la base gardait les anciennes valeurs.
    const previousPrefs = {
      pref_age_min: currentUser.pref_age_min,
      pref_age_max: currentUser.pref_age_max,
      pref_distance: currentUser.pref_distance,
      pref_looking_for: currentUser.pref_looking_for,
    };
    setCurrentUser((u) => ({ ...u, ...prefs }));
    try {
      const { error: prefError } = await supabase
        .from("profiles")
        .update(prefs)
        .eq("id", currentUser.id);
      if (prefError) throw prefError;
    } catch (e) {
      console.error(e.message, e.code, e.details, e.hint);
      setCurrentUser((u) => (u ? { ...u, ...previousPrefs } : u));
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
      // Exclusion immédiate des suggestions futures pour la personne qui
      // signale (prompt-rencontres-matching-baobab.md, section Sécurité) —
      // sans attendre l'issue de la modération. Réutilise le mécanisme
      // "masquer une recommandation" déjà en place (hidden_recommendations),
      // même table que le bouton "Pas intéressé" du fil Découverte.
      await supabase.from("hidden_recommendations").insert({ profile_id: currentUser.id, target_type: "profile", target_id: reportTarget.id }).then(({ error: hideError }) => {
        if (hideError && hideError.code !== "23505") console.error(hideError.message, hideError.code, hideError.details, hideError.hint);
      });
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
    // Lues en parallèle mais réassemblées dans l'ordre de sélection : un
    // FileReader par fichier ne termine pas forcément dans l'ordre où les
    // fichiers ont été choisis (dépend de leur taille), ce qui désynchronisait
    // photoPreviews (affiché, avec le badge "Principale" sur l'index 0) de
    // photoFiles (réellement uploadé comme avatar_url[0]) — l'utilisateur
    // pouvait voir une photo comme principale alors qu'une autre était envoyée.
    const results = await Promise.all(validFiles.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setPhotoPreviews((prev) => [...prev, ...results].slice(0, MAX_PHOTOS));
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
    // Même correctif que handlePhotosSelected : on attend toutes les lectures
    // avant de les ajouter, dans l'ordre de sélection, pour que newPhotoPreviews
    // (affiché, bouton "Supprimer la nouvelle photo" par index) reste aligné
    // avec newPhotoFiles (réellement uploadé) — sinon le mauvais fichier
    // pouvait être supprimé ou envoyé à la mauvaise position.
    const results = await Promise.all(validFiles.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setNewPhotoPreviews((prev) => [...prev, ...results]);
  }

  function removeNewPhotoFile(idx) {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setNewPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  }

  async function removeExistingPhoto(photo) {
    try {
      const { error: delError } = await supabase.from("profile_photos").delete().eq("id", photo.id);
      if (delError) throw delError;
      const remaining = existingPhotos.filter((p) => p.id !== photo.id);
      setExistingPhotos(remaining);
      // Nettoyage réel du fichier Storage — sans ça, chaque suppression de
      // photo laissait un fichier orphelin permanent dans le bucket public.
      const marker = "/avatars/";
      const idx = photo.url?.indexOf(marker);
      if (idx !== -1 && idx !== undefined) {
        const storagePath = decodeURIComponent(photo.url.slice(idx + marker.length));
        supabase.storage.from("avatars").remove([storagePath]).catch(() => {});
      }
      // Si la photo supprimée était la photo principale (avatar_url) : cette
      // suppression est immédiate (indépendante du bouton "Enregistrer" du
      // formulaire), donc sans cette mise à jour le profil continuait de
      // pointer vers un fichier Storage tout juste effacé — avatar cassé
      // partout dans l'app (en-tête, cartes, messages...), pour soi comme
      // pour les autres utilisateurs, jusqu'au prochain enregistrement
      // complet du profil.
      if (currentUser && photo.url === currentUser.avatar_url) {
        const newAvatarUrl = remaining[0]?.url || null;
        const { error: avatarError } = await supabase
          .from("profiles")
          .update({ avatar_url: newAvatarUrl })
          .eq("id", currentUser.id);
        if (!avatarError) {
          setCurrentUser((u) => (u ? { ...u, avatar_url: newAvatarUrl } : u));
        }
      }
    } catch (e) {
      console.error(e);
      setError("Impossible de supprimer cette photo.");
    }
  }

  function persistPhotoOrder(reordered) {
    // Chaîné sur photoOrderChainRef (voir sa déclaration) plutôt qu'exécuté
    // immédiatement : garantit que cet upsert n'atteint le réseau qu'une fois
    // le précédent réellement résolu, donc que les écritures arrivent en base
    // dans le même ordre que les actions qui les ont déclenchées.
    const run = async () => {
      try {
        const { error: reorderError } = await supabase
          .from("profile_photos")
          .upsert(reordered.map((p, i) => ({ id: p.id, profile_id: p.profile_id, url: p.url, position: i })));
        if (reorderError) throw reorderError;
        return true;
      } catch (e) {
        console.error(e);
        setError("Impossible de réorganiser les photos.");
        return false;
      }
    };
    const next = photoOrderChainRef.current.then(run, run);
    // La suite de la chaîne ne doit jamais s'interrompre à cause d'un échec
    // individuel (déjà géré/affiché ci-dessus) — sinon toute réorganisation
    // suivante resterait bloquée indéfiniment après un seul échec réseau.
    photoOrderChainRef.current = next.catch(() => {});
    return next;
  }

  function moveExistingPhoto(photoId, direction) {
    const idx = existingPhotos.findIndex((p) => p.id === photoId);
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || newIdx < 0 || newIdx >= existingPhotos.length) return;
    // Ordre appliqué de façon optimiste — s'il échoue côté serveur (réseau,
    // RLS...), on revient à l'ordre précédent : sinon la grille restait
    // affichée dans un ordre qui ne correspondait plus à ce qui est en base,
    // jusqu'au prochain rechargement complet.
    const previous = existingPhotos;
    const reordered = [...existingPhotos];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    setExistingPhotos(reordered);
    persistPhotoOrder(reordered).then((ok) => { if (!ok) setExistingPhotos(previous); });
  }

  async function setPrimaryPhoto(photoId) {
    const idx = existingPhotos.findIndex((p) => p.id === photoId);
    if (idx <= 0) return;
    const previous = existingPhotos;
    const reordered = [existingPhotos[idx], ...existingPhotos.filter((_, i) => i !== idx)];
    setExistingPhotos(reordered);
    const orderOk = await persistPhotoOrder(reordered);
    if (!orderOk) { setExistingPhotos(previous); return; }
    try {
      const { error: avatarError } = await supabase.from("profiles").update({ avatar_url: reordered[0].url }).eq("id", currentUser.id);
      if (avatarError) throw avatarError;
      setCurrentUser((u) => (u ? { ...u, avatar_url: reordered[0].url } : u));
    } catch (e) {
      console.error(e);
      setError("Impossible de définir cette photo comme principale.");
      // L'ordre (position) avait déjà été persisté en base par
      // persistPhotoOrder ci-dessus avant que la mise à jour d'avatar_url
      // n'échoue : revenir seulement à l'état local sans annuler aussi
      // l'ordre côté serveur laissait la grille affichée dans l'ancien
      // ordre alors que la base contenait déjà le nouveau, jusqu'au
      // prochain rechargement complet (incohérence silencieuse).
      persistPhotoOrder(previous);
      setExistingPhotos(previous);
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (!editForm.name || !currentUser) { setError("Le nom est requis."); return; }
    const editAgeNum = editForm.birthDate ? computeAge(editForm.birthDate) : Number(editForm.age);
    if (editAgeNum === null || Number.isNaN(editAgeNum) || editAgeNum < 18) { setError("Tu dois avoir au moins 18 ans."); return; }
    // Même borne haute que l'onboarding (isStep1Valid) : sans elle, une date
    // de naissance très ancienne saisie ici (le champ n'a pas de min/max)
    // passait sans erreur alors qu'elle aurait été rejetée à l'inscription.
    if (editAgeNum > 100) { setError("Vérifie ta date de naissance."); return; }
    setSavingProfile(true);
    // Chemins Storage (bucket "avatars") tout juste uploadés dans cette
    // tentative — si une étape suivante échoue, on les nettoie dans le catch
    // pour ne jamais laisser de fichier orphelin (même logique que
    // sendMediaMessage/uploadOneMedia ailleurs dans l'app).
    const freshlyUploadedPaths = [];
    // Lignes profile_photos tout juste insérées dans cette tentative — si une
    // étape suivante (upload de couverture ou update du profil) échoue après
    // cet insert, il faut aussi les supprimer en base : sinon on nettoie les
    // fichiers Storage (freshlyUploadedPaths ci-dessous) sans supprimer les
    // lignes qui les référencent, ce qui laisse des photos "fantômes" (lignes
    // pointant vers des fichiers supprimés) affichées comme images cassées
    // au prochain chargement du profil.
    let insertedPhotoRowIds = [];
    const urlToStoragePath = (url) => {
      const marker = "/avatars/";
      const idx = url?.indexOf(marker);
      return idx !== -1 && idx !== undefined ? decodeURIComponent(url.slice(idx + marker.length)) : null;
    };
    try {
      const uploadedUrls = [];
      for (let i = 0; i < newPhotoFiles.length; i++) {
        const url = await uploadPhoto(session.user.id, newPhotoFiles[i], existingPhotos.length + i);
        uploadedUrls.push(url);
        const p = urlToStoragePath(url);
        if (p) freshlyUploadedPaths.push(p);
      }

      let newPhotoRows = [];
      if (uploadedUrls.length > 0) {
        // Dérivé du plus grand "position" existant, pas de la longueur du
        // tableau : après une suppression de photo pendant cette même
        // session d'édition, existingPhotos.length ne correspond plus au
        // position max (ex. positions restantes 0 et 2 -> length vaut 2),
        // ce qui créait une position dupliquée avec une photo existante et
        // rendait l'ordre d'affichage (et la photo principale) imprévisible
        // après rechargement.
        const startPos = existingPhotos.length
          ? Math.max(...existingPhotos.map((p) => p.position ?? 0)) + 1
          : 0;
        const rows = uploadedUrls.map((url, idx) => ({
          profile_id: currentUser.id, url, position: startPos + idx,
        }));
        const { data: inserted, error: photoError } = await supabase
          .from("profile_photos")
          .insert(rows)
          .select();
        if (photoError) throw photoError;
        newPhotoRows = inserted || [];
        insertedPhotoRowIds = newPhotoRows.map((p) => p.id).filter(Boolean);
      }

      const allPhotos = [...existingPhotos, ...newPhotoRows];
      const newAvatarUrl = allPhotos[0]?.url || null;

      let coverUrl = currentUser.cover_url || null;
      // Bug corrigé : la suppression du fichier Storage de l'ancienne
      // couverture se faisait ICI, avant l'UPDATE du profil plus bas — si cet
      // UPDATE échouait ensuite (réseau, RLS, contrainte...), le fichier
      // était déjà supprimé de façon définitive alors que la ligne
      // "profiles" en base pointait toujours vers lui : cover_url cassé de
      // façon permanente, contrairement à toutes les autres étapes de cette
      // fonction qui ne nettoient le Storage qu'APRÈS un succès confirmé
      // (freshlyUploadedPaths/insertedPhotoRowIds ci-dessus, et
      // removeExistingPhoto qui supprime d'abord en base puis dans Storage).
      // On se contente donc de retenir le chemin ici, et on ne le supprime
      // qu'une fois l'UPDATE réellement réussi (voir plus bas).
      let coverPathToDeleteOnSuccess = null;
      if (coverRemoved) {
        coverPathToDeleteOnSuccess = urlToStoragePath(currentUser.cover_url);
        coverUrl = null;
      } else if (coverFile) {
        coverUrl = await uploadPhoto(session.user.id, coverFile, "cover");
        const p = urlToStoragePath(coverUrl);
        if (p) freshlyUploadedPaths.push(p);
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

      // Nettoyage Storage de l'ancienne couverture désormais sûr : l'UPDATE
      // ci-dessus a réussi, donc plus aucun risque de laisser la base
      // pointer vers un fichier qu'on vient de supprimer (voir commentaire
      // plus haut).
      if (coverPathToDeleteOnSuccess) {
        supabase.storage.from("avatars").remove([coverPathToDeleteOnSuccess]).catch(() => {});
      }

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
      // Upload(s) Storage réussi(s) mais une étape suivante (insertion
      // profile_photos ou mise à jour du profil) a échoué : sans ce
      // nettoyage, les photos/couverture fraîchement envoyées restaient
      // orphelines dans le bucket "avatars" pour toujours.
      if (freshlyUploadedPaths.length > 0) {
        supabase.storage.from("avatars").remove(freshlyUploadedPaths).catch(() => {});
      }
      if (insertedPhotoRowIds.length > 0) {
        supabase.from("profile_photos").delete().in("id", insertedPhotoRowIds).then(() => {}).catch(() => {});
      }
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

  // Bug corrigé : filtrait auparavant le cache local "profiles" plafonné à
  // 500 lignes (voir loadAll) — une personne bloquée mais absente de ces 500
  // premières lignes restait invisible dans la modale "Comptes bloqués",
  // donc impossible à débloquer. Part maintenant de blockedProfilesRaw
  // (jointure directe sur "blocks", non plafonnée — voir loadAll).
  const blockedProfiles = currentUser ? blockedProfilesRaw : [];

  // Les deux sens du blocage — utilisé pour filtrer toute liste montrant des
  // profils (suivis/abonnés inclus), pas seulement le blocage que j'ai fait.
  // useMemo (et non un simple const recalculé à chaque rendu) : ce Set était
  // recréé à chaque re-rendu de App — quelle qu'en soit la cause, y compris
  // sans rapport avec les blocages — et redescendait donc en prop avec une
  // nouvelle référence à chaque fois. PostsFeed.jsx inclut blockedIds dans
  // les dépendances de son effet d'abonnement Realtime ("posts-feed:..."),
  // ce qui provoquait un désabonnement/réabonnement du canal à chaque rendu
  // de toute l'appli (bug confirmé à l'audit) au lieu de seulement quand les
  // blocages changent réellement.
  const blockedIds = useMemo(
    () =>
      new Set(
        currentUser
          ? blockPairs
              .filter((b) => b.from_id === currentUser.id || b.to_id === currentUser.id)
              .map((b) => (b.from_id === currentUser.id ? b.to_id : b.from_id))
          : []
      ),
    [blockPairs, currentUser?.id]
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
      // Vérifié en base plutôt que via hasLiked()/le cache local likePairs :
      // ce cache n'est chargé qu'une fois par session (loadAll) et n'est
      // jamais rafraîchi en temps réel. Si l'autre personne a liké pendant
      // que cette session était déjà ouverte (deux personnes qui se likent
      // en quasi-simultané), le like reçu n'apparaît pas encore dans
      // likePairs et le match — bien réel côté serveur — ne déclenchait
      // jamais la modale de célébration ici.
      const { data: reciprocal } = await supabase
        .from("likes")
        .select("from_id")
        .eq("from_id", target.id)
        .eq("to_id", currentUser.id)
        .maybeSingle();
      if (reciprocal) {
        setMatchNotice(target);
        trackActivation(currentUser.id, "first_match");
      }
      return true;
    } catch (e) {
      console.error(e);
      setError(friendlyDbError(e) || "Impossible d'enregistrer ce like.");
      return false;
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
      return true;
    } catch (e) {
      console.error(e);
      setError("Une erreur est survenue.");
      return false;
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
    // Invalide toute requête refreshMessages encore en vol pour la
    // conversation qu'on quitte (voir chatLoadTokenRef) : sinon une réponse
    // tardive pouvait repeupler `messages` après que l'utilisateur soit déjà
    // revenu à la liste des conversations.
    chatLoadTokenRef.current++;
    setActiveMatch(null);
    setReplyingTo(null);
  }

  async function markConversationRead(match) {
    if (!currentUser || !match) return;
    // Réglage de confidentialité (Confidentialité → Indicateurs de lecture) :
    // si désactivé, ne jamais écrire read_at — l'expéditeur ne voit donc pas
    // de coche "lu" pour ce lecteur (voir supabase-messaging-read-receipts-
    // privacy.sql pour la réciprocité côté affichage).
    if (currentUser.show_read_receipts === false) return;
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
    const token = ++chatLoadTokenRef.current;
    try {
      const { data, error: msgError } = await supabase
        .from("messages")
        .select("*")
        .eq("match_key", matchKey(currentUser.id, match.id))
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);
      if (msgError) throw msgError;
      // Une conversation plus récemment ouverte a déjà émis un jeton plus
      // grand pendant cette requête : cette réponse est périmée, on l'ignore
      // pour ne pas écraser les messages de la conversation actuellement affichée.
      if (chatLoadTokenRef.current !== token) return;
      const chronological = (data || []).slice().reverse();
      setMessages(chronological);
      setHasMoreHistory((data || []).length === MESSAGES_PAGE_SIZE);
      markConversationRead(match);
      loadReactionsFor(chronological.map((m) => m.id));
    } catch (e) {
      console.error(e);
      if (chatLoadTokenRef.current !== token) return;
      setMessages([]);
      setHasMoreHistory(false);
    }
  }

  async function loadOlderMessages() {
    if (!currentUser || !activeMatch || messages.length === 0 || loadingOlder) return;
    // Capture le jeton de chargement courant (voir chatLoadTokenRef) : si
    // l'utilisateur change de conversation pendant que cette page d'historique
    // est en vol, refreshMessages()/closeChat() l'incrémentent. Sans ce
    // contrôle, la réponse tardive de CETTE conversation venait s'insérer en
    // tête des messages de la conversation désormais affichée (mélange de
    // deux discussions différentes).
    const token = chatLoadTokenRef.current;
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
      if (chatLoadTokenRef.current !== token) return;
      const older = (data || []).slice().reverse();
      setMessages((m) => [...older, ...m]);
      setHasMoreHistory((data || []).length === MESSAGES_PAGE_SIZE);
      loadReactionsFor(older.map((m) => m.id));
    } catch (e) {
      console.error(e);
    } finally {
      // Toujours relâcher le spinner du bouton, même pour une réponse
      // devenue périmée (jeton différent) : sinon "Charger les messages
      // précédents" resterait désactivé indéfiniment dans la conversation
      // ouverte ensuite, faute d'un autre endroit qui remette loadingOlder
      // à false au changement de discussion.
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
      setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, _status: "failed", _error: friendlyDbError(e) } : msg)));
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
    // Bug corrigé : un sticker envoyé pendant qu'on répond à un message
    // perdait silencieusement le reply_to_id (jamais transmis à l'insert) et
    // le bandeau "Réponse à…" restait affiché comme si de rien n'était.
    const replyToId = replyingTo?.id || null;
    setMessages((m) => [...m, {
      id: tempId,
      match_key: key,
      from_id: currentUser.id,
      kind: "sticker",
      text: null,
      media_path: null,
      media_meta,
      reply_to_id: replyToId,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: "sending",
    }]);
    setReplyingTo(null);
    await insertMessageRow(
      { match_key: key, from_id: currentUser.id, kind: "sticker", text: null, media_path: null, media_meta, reply_to_id: replyToId },
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
    // Bug corrigé (même cause que sendStickerMessage) : un média envoyé en
    // réponse à un message perdait le reply_to_id. Pour un "Réessayer"
    // (tempIdOverride fourni), le message optimiste existe déjà — on reprend
    // son reply_to_id au lieu de le recalculer depuis replyingTo (qui a pu
    // changer ou être vidé entre-temps).
    const replyToId = tempIdOverride
      ? messagesRef.current.find((msg) => msg.id === tempId)?.reply_to_id || null
      : replyingTo?.id || null;

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
        reply_to_id: replyToId,
        created_at: new Date().toISOString(),
        read_at: null,
        _status: "uploading",
        _progress: 0,
        _file: file, // local uniquement — jamais envoyé à Supabase (voir insertMessageRow)
      }]);
      setReplyingTo(null);
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
      { match_key: key, from_id: currentUser.id, kind, text: null, media_path: path, media_meta, reply_to_id: replyToId },
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
        { match_key: msg.match_key, from_id: currentUser.id, kind: "sticker", text: null, media_path: null, media_meta: msg.media_meta, reply_to_id: msg.reply_to_id || null },
        msg.id
      );
      return;
    }
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, _status: "sending" } : x)));
    // Bug corrigé : le reply_to_id du message optimiste n'était jamais
    // repassé ici — réessayer un message-réponse en échec le renvoyait
    // comme un message normal, sans lien vers le message cité.
    sendMessageText(msg.text, msg.id, msg.reply_to_id);
  }

  // Dégradation propre en cas de connexion instable (Baobab 3.0) : un message
  // resté en "failed" attendait jusqu'ici que l'utilisateur remarque le
  // bouton "Réessayer" et tape dessus. Dès que le navigateur signale un
  // retour en ligne (useOnlineStatus, déjà utilisé par ConnectivityBanner),
  // on relance automatiquement les messages en échec de la conversation
  // ouverte — même mécanisme que retrySend(), juste déclenché tout seul.
  useEffect(() => {
    if (!isOnline) return;
    const failed = messagesRef.current.filter((msg) => msg._status === "failed");
    failed.forEach((msg) => retrySend(msg));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

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

  // Détection en direct d'un match "passif" : je t'ai déjà liké, et c'est toi
  // qui viens de me liker en retour pendant que ma session est restée
  // ouverte. handleLike() ne couvre que l'autre sens (je te like alors que tu
  // m'avais déjà liké avant), via une lecture directe en base — voir le
  // commentaire dans handleLike(). Sans cet abonnement, ce match bien réel
  // côté serveur ne se reflétait jamais dans l'UI (ni modale de célébration,
  // ni liste des matches à jour) avant un rechargement complet de la page.
  useEffect(() => {
    if (likesChannelRef.current) {
      supabase.removeChannel(likesChannelRef.current);
      likesChannelRef.current = null;
    }
    if (!currentUser) return;

    const channel = supabase
      .channel(`likes-received:${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "likes", filter: `to_id=eq.${currentUser.id}` },
        (payload) => {
          const fromId = payload.new.from_id;
          const isBlocked = blockPairsRef.current.some(
            (b) => (b.from_id === currentUser.id && b.to_id === fromId) || (b.from_id === fromId && b.to_id === currentUser.id)
          );
          if (isBlocked) return; // même logique que getMatches() : un match avec une personne bloquée ne doit pas apparaître
          const alreadyMutual = likePairsRef.current.some((l) => l.from_id === currentUser.id && l.to_id === fromId);
          setLikePairs((prev) =>
            prev.some((l) => l.from_id === fromId && l.to_id === currentUser.id) ? prev : [...prev, { from_id: fromId, to_id: currentUser.id }]
          );
          // Le profil complet de qui vient de me liker doit rejoindre
          // likerProfilesRaw (liste "Qui m'a aimé"/matches, voir sa
          // déclaration plus haut) — sans ça, un like reçu en direct d'une
          // personne absente du cache "profiles" plafonné à 500 lignes ne
          // serait jamais visible, ni dans la modale Admirateurs ni comme
          // match, avant un rechargement complet de la page.
          (async () => {
            let fromProfile =
              likerProfilesRawRef.current.find((p) => p.id === fromId) || profilesRef.current.find((p) => p.id === fromId);
            if (!fromProfile) {
              const { data } = await supabase.from("profiles").select("*").eq("id", fromId).maybeSingle();
              fromProfile = data || null;
            }
            if (!fromProfile) return;
            setLikerProfilesRaw((prev) => (prev.some((p) => p.id === fromId) ? prev : [fromProfile, ...prev]));
            if (alreadyMutual) {
              setMatchNotice(fromProfile);
              trackActivation(currentUser.id, "first_match");
            }
          })();
        }
      )
      // Bug corrigé (audit sessions multiples) : un like ENVOYÉ (handleLike)
      // ou retiré (handleUnlike) ne met à jour likePairs que localement, sur
      // l'onglet/appareil qui a fait l'action — jamais rediffusé. Un même
      // compte ouvert sur deux appareils (ou deux onglets) voyait donc encore
      // un profil déjà liké depuis l'autre appareil comme "pas encore liké"
      // (hasLiked() stale) : il restait proposé dans la pile Découvrir, et un
      // second like dessus échouait silencieusement côté serveur (contrainte
      // unique from_id/to_id) avec juste un message d'erreur générique,
      // laissant l'appareil B durablement désynchronisé sans jamais se
      // corriger avant un rechargement complet. idempotent via les mêmes
      // gardes `.some()`/`.filter()` que handleLike/handleUnlike : sans effet
      // si l'événement provient de CETTE session (déjà appliqué localement).
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "likes", filter: `from_id=eq.${currentUser.id}` },
        (payload) => {
          const toId = payload.new.to_id;
          setLikePairs((prev) =>
            prev.some((l) => l.from_id === currentUser.id && l.to_id === toId) ? prev : [...prev, { from_id: currentUser.id, to_id: toId }]
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "likes", filter: `from_id=eq.${currentUser.id}` },
        (payload) => {
          const toId = payload.old.to_id;
          setLikePairs((prev) => prev.filter((l) => !(l.from_id === currentUser.id && l.to_id === toId)));
        }
      )
      .subscribe();
    likesChannelRef.current = channel;

    return () => {
      if (likesChannelRef.current) {
        supabase.removeChannel(likesChannelRef.current);
        likesChannelRef.current = null;
      }
    };
  }, [currentUser?.id]);

  // Même famille de bug que le canal "likes" ci-dessus (audit sessions
  // multiples), appliquée à "blocks" et "passes" : un blocage/passe fait sur
  // un autre appareil/onglet du même compte ne se répercutait jamais ici —
  // blockPairs/passPairs (et hasBlocked/hasPassed qui en dépendent) ne
  // provenaient que du chargement initial (loadAll) et des mises à jour
  // locales de performBlock/handleUnblock/handlePass. Le blocage est le cas
  // le plus sensible : tant que l'autre session n'était pas rechargée, une
  // personne bloquée depuis l'appareil A restait affichée comme non bloquée
  // sur l'appareil B (toujours proposée dans Découvrir, bouton "Bloquer" au
  // lieu de "Débloquer" dans son profil). Écouteurs idempotents (mêmes
  // gardes `.some()`/suppression que les fonctions locales) : sans effet si
  // l'événement provient de CETTE session.
  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`blocks-passes-own:${currentUser.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "blocks", filter: `from_id=eq.${currentUser.id}` },
        (payload) => {
          const toId = payload.new.to_id;
          setBlockPairs((prev) => (prev.some((b) => b.from_id === currentUser.id && b.to_id === toId) ? prev : [...prev, { from_id: currentUser.id, to_id: toId }]));
          if (activeMatchRef.current?.id === toId) setActiveMatch(null);
          (async () => {
            const { data } = await supabase.from("profiles").select("*").eq("id", toId).maybeSingle();
            if (!data) return;
            setBlockedProfilesRaw((prev) => (prev.some((p) => p.id === toId) ? prev : [...prev, data]));
          })();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "blocks", filter: `from_id=eq.${currentUser.id}` },
        (payload) => {
          const toId = payload.old.to_id;
          setBlockPairs((prev) => prev.filter((pair) => !(pair.from_id === currentUser.id && pair.to_id === toId)));
          setBlockedProfilesRaw((prev) => prev.filter((p) => p.id !== toId));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "passes", filter: `from_id=eq.${currentUser.id}` },
        (payload) => {
          const toId = payload.new.to_id;
          setPassPairs((prev) => (prev.some((p) => p.from_id === currentUser.id && p.to_id === toId) ? prev : [...prev, { from_id: currentUser.id, to_id: toId }]));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [currentUser?.id]);

  function broadcastTyping() {
    if (!currentUser || !typingChannelRef.current) return;
    if (currentUser.show_read_receipts === false) return; // même réglage que les indicateurs de lecture
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
    // On garde les valeurs précédentes pour pouvoir annuler la mise à jour
    // optimiste si le trigger DB rejette l'UPDATE (sinon le message reste
    // affiché "supprimé" localement alors qu'il ne l'est pas vraiment côté
    // serveur, et l'autre participant continue de le voir intact).
    const prevDeletedAt = message.deleted_at;
    const prevDeletedBy = message.deleted_by;
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, deleted_at: new Date().toISOString(), deleted_by: currentUser.id } : x)));
    try {
      const { error: delError } = await supabase
        .from("messages")
        .update({ deleted_at: new Date().toISOString(), deleted_by: currentUser.id })
        .eq("id", message.id);
      if (delError) throw delError;
    } catch (e) {
      console.error(e);
      setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, deleted_at: prevDeletedAt, deleted_by: prevDeletedBy } : x)));
      setError("Impossible de supprimer ce message.");
    }
  }

  // "Pour moi" : ajoute mon id à deleted_for, masqué uniquement de mon côté.
  async function deleteMessageForMe(message) {
    if (!currentUser) return;
    const prevDeletedFor = message.deleted_for || [];
    const nextDeletedFor = [...prevDeletedFor, currentUser.id];
    setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, deleted_for: nextDeletedFor } : x)));
    try {
      const { error: delError } = await supabase
        .from("messages")
        .update({ deleted_for: nextDeletedFor })
        .eq("id", message.id);
      if (delError) throw delError;
    } catch (e) {
      console.error(e);
      setMessages((m) => m.map((x) => (x.id === message.id ? { ...x, deleted_for: prevDeletedFor } : x)));
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
        <div className="sticky top-0 z-[95] flex flex-col">
          <ConnectivityBanner />
          <AccountDeletionBanner currentUser={currentUser} onCancelled={handleCancelAccountDeletion} />
        </div>
        <UpdateNotice recommended={updateState.recommended} info={updateState.info} onReload={handleUpdateReload} onDismiss={handleUpdateDismiss} />
        <SocialShell
          updateAvailable={updateState.mandatory || updateState.recommended}
          initialTab={initialSocialTab}
          justSubscribed={justSubscribed}
          onJustSubscribedHandled={() => setJustSubscribed(false)}
          currentUser={currentUser}
          setView={setView}
          handleSignOut={handleSignOut}
          onError={setError}
          myLocation={myLocation}
          discoverGateBlocked={discoverGateBlocked}
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
          <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-xl max-w-[92vw]" style={{ background: "var(--bb-surface-2)", border: "1px solid var(--bb-border)", color: C.clay }}>
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
          onExportData={handleExportData}
        />
      </>
    );
  }

  return (
    <div className="bb-app min-h-screen flex flex-col relative" style={{ fontFamily: "'Manrope', system-ui, sans-serif", color: C.ink }}>
      <div className="sticky top-0 z-[95] flex flex-col">
        <ConnectivityBanner />
        <AccountDeletionBanner currentUser={currentUser} onCancelled={handleCancelAccountDeletion} />
      </div>
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
        myLocation={myLocation}
        onEnableLocation={handleEnableLocation}
        onDisableLocation={handleDisableLocation}
        onUpdateLocationPref={handleUpdateLocationPref}
        onAccountDeletionRequested={handleAccountDeletionRequested}
        onExportData={handleExportData}
      />
      {/* Bug corrigé ci-dessus : cette deuxième instance d'AppModals (rendue pour
          les écrans Onboarding/Édition de profil) ne recevait pas myLocation/
          onEnableLocation/onDisableLocation/onUpdateLocationPref, contrairement à
          l'instance principale plus haut. Sans elles, LocationSettingsModal recevait
          location=undefined et des callbacks undefined : les cases à cocher restaient
          figées et les changements n'étaient jamais persistés si cette modale
          s'affichait depuis ces écrans. */}

    </div>
  );
}
