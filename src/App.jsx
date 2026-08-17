import React, { useState, useEffect, useCallback, useRef } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import { C, EDUCATION_LEVELS, HAS_CHILDREN_OPTIONS, MAX_PHOTOS } from "./constants";
import { matchKey } from "./utils/format";
import SocialShell from "./components/SocialShell";
import AppModals from "./components/AppModals";
import EditProfileForm from "./screens/EditProfileForm";
import UpdatePasswordScreen from "./screens/UpdatePasswordScreen";
import OnboardingWizard from "./screens/onboarding/OnboardingWizard";
import { computeAge } from "./screens/onboarding/steps/Step1Identity";
import MatchCelebrationModal from "./components/social/MatchCelebrationModal";
import { filterCandidatesByPreferences } from "./lib/matching/matchingService";
import { validateMediaFile } from "./lib/mediaValidation";
import { uploadWithProgress } from "./lib/uploadWithProgress";
import { MEDIA_BUCKET, extFromMime } from "./lib/mediaConstants";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore vérifié, null = pas connecté
  const [view, setView] = useState("loading"); // loading | form | feed | discover | matches | stories
  const [profiles, setProfiles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [likePairs, setLikePairs] = useState([]); // [{from_id, to_id}]
  const [passPairs, setPassPairs] = useState([]); // [{from_id, to_id}]
  const likeInFlightRef = useRef(new Set()); // to_id en cours d'envoi — évite un double clic = double insert
  const passInFlightRef = useRef(new Set());
  const [matchNotice, setMatchNotice] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState("");
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
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
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
      const [profRes, likeRes, passRes, blockRes, photoRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        supabase.from("likes").select("from_id,to_id"),
        supabase.from("passes").select("from_id,to_id"),
        supabase.from("blocks").select("from_id,to_id"),
        supabase.from("profile_photos").select("*").order("position", { ascending: true }),
      ]);
      if (profRes.error) throw profRes.error;
      if (likeRes.error) throw likeRes.error;
      if (passRes.error) throw passRes.error;
      if (blockRes.error) throw blockRes.error;
      if (photoRes.error) throw photoRes.error;
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

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch(() => setSession(null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      // Lien "mot de passe oublié" cliqué depuis l'email : Supabase authentifie
      // la session de récupération et émet cet événement.
      if (event === "PASSWORD_RECOVERY") setView("update-password");
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Présence en ligne : heartbeat léger. Si les colonnes presence/last_seen
  // n'existent pas encore en base, l'interface continue simplement à fonctionner.
  // Respecte le paramètre de confidentialité "Statut en ligne visible" :
  // si désactivé, on écrit is_online=false une fois puis on arrête d'émettre.
  useEffect(() => {
    if (!session?.user?.id) return;
    let alive = true;

    if (currentUser && currentUser.show_online_status === false) {
      supabase.from("profiles").update({
        is_online: false,
        last_seen: new Date().toISOString(),
      }).eq("user_id", session.user.id).catch(() => {});
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

  // Une fois connecté, charger les données et retrouver (ou non) son propre profil
  useEffect(() => {
    if (session === undefined) return; // vérification en cours
    if (session === null) {
      setView("auth");
      setCurrentUser(null);
      return;
    }
    loadAll().then(() => {
      setView("checking-profile");
    });
  }, [session, loadAll]);

  useEffect(() => {
    if (view !== "checking-profile") return;
    if (!session) return;
    const own = profiles.find((p) => p.user_id === session.user.id);
    if (own) {
      setCurrentUser(own);
      if (!own.onboarding_completed_at) {
        setView("onboarding");
      } else {
        setView("feed");
      }
    } else {
      setCurrentUser(null);
      setView("onboarding");
    }
  }, [view, profiles, session]);

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
  function handlePhotosSelected(e) {
    const room = MAX_PHOTOS - photoFiles.length;
    const files = Array.from(e.target.files || []).slice(0, Math.max(room, 0));
    if (files.length === 0) return;
    setPhotoFiles((prev) => [...prev, ...files].slice(0, MAX_PHOTOS));
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setPhotoPreviews((prev) => [...prev, reader.result].slice(0, MAX_PHOTOS));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
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
    setView("editProfile");
  }

  function handleNewPhotosSelected(e) {
    const total = existingPhotos.length + newPhotoFiles.length;
    const room = MAX_PHOTOS - total;
    const files = Array.from(e.target.files || []).slice(0, Math.max(room, 0));
    if (files.length === 0) return;
    setNewPhotoFiles((prev) => [...prev, ...files]);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setNewPhotoPreviews((prev) => [...prev, reader.result]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
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
    } catch (e) {
      console.error(e);
      setError("Impossible de supprimer cette photo.");
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
      if (coverFile) {
        coverUrl = await uploadPhoto(session.user.id, coverFile, "cover");
      }

      const payload = {
        name: editForm.name,
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
      setError("");
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
      if (hasLiked(target.id, currentUser.id)) {
        setMatchNotice(target);
      }
    } catch (e) {
      console.error(e);
      setError("Impossible d'enregistrer ce like.");
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
    await refreshMessages(match);
  }

  function closeChat() {
    setActiveMatch(null);
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
      return true;
    } catch (e) {
      console.error(e);
      setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, _status: "failed" } : msg)));
      return false;
    }
  }

  async function sendMessageText(text, tempId) {
    await insertMessageRow(
      { match_key: matchKey(currentUser.id, activeMatch.id), from_id: currentUser.id, kind: "text", text },
      tempId
    );
  }

  function sendMessage() {
    if (!messageDraft.trim() || !currentUser || !activeMatch) return;
    const text = messageDraft.trim();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((m) => [...m, {
      id: tempId,
      match_key: matchKey(currentUser.id, activeMatch.id),
      from_id: currentUser.id,
      kind: "text",
      text,
      media_path: null,
      media_meta: null,
      created_at: new Date().toISOString(),
      read_at: null,
      _status: "sending",
    }]);
    setMessageDraft("");
    sendMessageText(text, tempId);
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

    return () => {
      if (messagesChannelRef.current) supabase.removeChannel(messagesChannelRef.current);
      if (typingChannelRef.current) supabase.removeChannel(typingChannelRef.current);
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

  // ---------------- RENDER ----------------

  if (view === "loading" || view === "checking-profile" || session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.sand }}>
        <Loader2 className="animate-spin" color={C.indigo} size={32} />
      </div>
    );
  }

  if (view === "auth") {
    return <Auth />;
  }

  if (view === "update-password") {
    return <UpdatePasswordScreen onDone={() => setView("checking-profile")} />;
  }

  if (currentUser && ["feed", "stories", "profile", "discover", "matches"].includes(view)) {
    return (
      <>
        <SocialShell
          currentUser={currentUser}
          setView={setView}
          handleSignOut={handleSignOut}
          onError={setError}
          candidates={candidates}
          getMatches={getMatches}
          openChat={openChat}
          closeChat={closeChat}
          handleLike={handleLike}
          handlePass={handlePass}
          profilePhotos={profilePhotos}
          openEditProfile={openEditProfile}
          setReportTarget={setReportTarget}
          handleBlock={requestBlock}
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
          sendStickerMessage={sendStickerMessage}
          sendMediaMessage={sendMediaMessage}
          retrySend={retrySend}
          otherTyping={otherTyping}
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
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[95] px-4 py-3 rounded-2xl text-sm font-semibold text-white shadow-xl" style={{ background: "#151B3D" }}>
            {successNotice}
          </div>
        )}
        {error && (
          <div role="alert" className="fixed top-4 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold shadow-xl max-w-[92vw]" style={{ background: "#fce8e0", color: C.clay }}>
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
          onToggleField={handleToggleField}
          blockedProfiles={blockedProfiles}
          onUnblock={handleUnblock}
          privacyOpen={privacyOpen}
          setPrivacyOpen={setPrivacyOpen}
          termsOpen={termsOpen}
          setTermsOpen={setTermsOpen}
          aboutOpen={aboutOpen}
          setAboutOpen={setAboutOpen}
        />
      </>
    );
  }

  return (
    <div className="bb-app min-h-screen flex flex-col relative overflow-x-hidden" style={{ fontFamily: "'Manrope', system-ui, sans-serif", color: C.ink }}>
      <style>{`
        @keyframes bbGenericDrift { from { transform: scale(1.02); } to { transform: scale(1.06) translate3d(-1%, -1%, 0); } }
        .bb-generic-bg { animation: bbGenericDrift 26s ease-in-out alternate infinite; }
        .bb-generic-glass { background: rgba(255,255,255,.82) !important; backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        @media (prefers-reduced-motion: reduce) { .bb-app * { animation: none !important; transition: none !important; } }
      `}</style>
      <div aria-hidden="true" className="fixed inset-0 z-0 pointer-events-none" style={{ background: "#F7F8FA" }} />
      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-5 py-4 bb-generic-glass" style={{ borderBottom: `1px solid rgba(43,36,32,0.08)`, boxShadow: "0 1px 0 rgba(20,29,56,0.02)", position: "sticky", top: 0, zIndex: 10 }}>
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
        <div className="relative z-20 mx-5 mt-3 text-sm px-3 py-2 rounded-lg" style={{ background: "#fce8e0", color: C.clay }}>
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
            existingPhotos={existingPhotos}
            removeExistingPhoto={removeExistingPhoto}
            newPhotoPreviews={newPhotoPreviews}
            removeNewPhotoFile={removeNewPhotoFile}
            handleNewPhotosSelected={handleNewPhotosSelected}
            savingProfile={savingProfile}
            handleSaveProfile={handleSaveProfile}
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
        onToggleField={handleToggleField}
        blockedProfiles={blockedProfiles}
        onUnblock={handleUnblock}
        privacyOpen={privacyOpen}
        setPrivacyOpen={setPrivacyOpen}
        termsOpen={termsOpen}
        setTermsOpen={setTermsOpen}
        aboutOpen={aboutOpen}
        setAboutOpen={setAboutOpen}
      />

    </div>
  );
}
