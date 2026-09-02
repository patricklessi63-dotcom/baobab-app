import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../supabaseClient";
import { C, EDUCATION_LEVELS } from "../../constants";
import OnboardingProgress from "./OnboardingProgress";
import Step0Welcome, { isStep0Valid } from "./steps/Step0Welcome";
import Step1Identity, { isStep1Valid, computeAge } from "./steps/Step1Identity";
import Step2Photo, { isStep2Valid } from "./steps/Step2Photo";
import Step3Location, { isStep3Valid } from "./steps/Step3Location";
import Step4CanadaJourney, { isStep4Valid } from "./steps/Step4CanadaJourney";
import Step5Languages, { isStep5Valid } from "./steps/Step5Languages";
import Step6LookingFor, { isStep6Valid } from "./steps/Step6LookingFor";
import Step7LifeProject, { isStep7Valid } from "./steps/Step7LifeProject";
import Step8Interests, { isStep8Valid } from "./steps/Step8Interests";
import Step9PersonalityBio, { isStep9Valid } from "./steps/Step9PersonalityBio";
import NotificationsOptIn from "./NotificationsOptIn";

const STEP_COUNT = 10;

function parseList(text) {
  return (text || "").split(",").map((t) => t.trim()).filter(Boolean);
}

function draftFromUser(user) {
  return {
    usageGoals: parseList(user?.usage_goals),
    name: user?.name || "",
    lastName: user?.last_name || "",
    birthDate: user?.birth_date || "",
    country: user?.country || "",
    province: user?.province || "",
    city: user?.city || "",
    arrivedSince: user?.arrived_since || "",
    immigrationStatus: user?.immigration_status || "",
    occupation: user?.occupation || "",
    educationLevel: user?.education_level || EDUCATION_LEVELS[0],
    arrivalCity: user?.arrival_city || "",
    languagesDetail: Array.isArray(user?.languages_detail) ? user.languages_detail : [],
    lookingFor: parseList(user?.looking_for),
    relationshipValues: parseList(user?.relationship_values),
    wantsChildren: user?.wants_children || "",
    familyImportance: user?.family_importance || "",
    careerGoal: user?.career_goal || "",
    geographicOpenness: user?.geographic_openness || "",
    personalityEvening: user?.personality_evening || "",
    personalityTravel: user?.personality_travel || "",
    relationshipNeeds: parseList(user?.relationship_needs),
    bio: user?.bio || "",
    interests: parseList(user?.interests),
  };
}

export default function OnboardingWizard({
  session,
  currentUser,
  setCurrentUser,
  setProfiles,
  setProfilePhotos,
  photoFiles,
  photoPreviews,
  handlePhotosSelected,
  removePhotoFile,
  setPhotoFiles,
  setPhotoPreviews,
  uploadPhoto,
  setView,
}) {
  const [step, setStep] = useState(() => Math.min(STEP_COUNT, (currentUser?.onboarding_step || 0) + 1));
  const [draft, setDraft] = useState(() => draftFromUser(currentUser));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Écran de consentement push affiché une seule fois, juste après la
  // dernière étape — ne fait pas partie du compteur STEP_COUNT (pas de
  // colonne onboarding_step dédiée, ni d'entrée dans OnboardingProgress).
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const currentValid = (() => {
    switch (step) {
      case 1: return isStep0Valid(draft);
      case 2: return isStep1Valid(draft);
      case 3: return isStep2Valid(photoPreviews, !!currentUser?.avatar_url);
      case 4: return isStep3Valid(draft);
      case 5: return isStep4Valid(draft);
      case 6: return isStep5Valid(draft);
      case 7: return isStep6Valid(draft);
      case 8: return isStep7Valid();
      case 9: return isStep8Valid(draft);
      case 10: return isStep9Valid();
      default: return false;
    }
  })();

  async function saveStep() {
    setError("");
    setSaving(true);
    // Bug corrigé : à l'étape 3 (photo), un upload Storage pouvait réussir puis
    // l'insertion profile_photos ou l'update du profil échouer juste après —
    // sans nettoyage, les fichiers restaient orphelins dans le bucket
    // "avatars" pour toujours (même pattern que freshlyUploadedPaths/
    // insertedPhotoRowIds dans handleSaveProfile, App.jsx). Déclarés ici (hors
    // du bloc step===3) pour rester accessibles dans le catch, mais ne sont
    // jamais peuplés pour les autres étapes donc le nettoyage y est un no-op.
    const freshlyUploadedPaths = [];
    let insertedPhotoRowIds = [];
    try {
      if (step === 1) {
        // Bienvenue + objectif d'usage — crée désormais la ligne profils
        // (déplacé depuis l'ancienne étape 1 "Identité", repoussée à
        // l'étape 2) pour que la toute première question posée à un
        // nouvel utilisateur soit "qu'est-ce que tu recherches ?", pas
        // son prénom.
        //
        // Si la ligne existe déjà (l'utilisateur est revenu en arrière
        // jusqu'à cette étape après l'avoir validée une première fois),
        // il faut la mettre à jour et non la recréer : un second INSERT
        // viole la contrainte unique profiles_user_id_unique et bloquait
        // définitivement l'onboarding avec une erreur générique.
        if (currentUser?.id) {
          const { data, error: updateError } = await supabase
            .from("profiles")
            .update({ usage_goals: draft.usageGoals.join(", "), onboarding_step: 1 })
            .eq("id", currentUser.id)
            .select()
            .single();
          if (updateError) throw updateError;
          setCurrentUser(data);
          setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
          return data;
        }
        const payload = {
          user_id: session.user.id,
          usage_goals: draft.usageGoals.join(", "),
          onboarding_step: 1,
        };
        const { data, error: insertError } = await supabase.from("profiles").insert(payload).select().single();
        if (insertError) throw insertError;
        setCurrentUser(data);
        setProfiles((prev) => [...prev, data]);
        return data;
      }

      if (step === 2) {
        const payload = {
          name: draft.name.trim(),
          last_name: draft.lastName.trim() || null,
          birth_date: draft.birthDate,
          age: computeAge(draft.birthDate),
          onboarding_step: 2,
        };
        const { data, error: updateError } = await supabase.from("profiles").update(payload).eq("id", currentUser.id).select().single();
        if (updateError) throw updateError;
        setCurrentUser(data);
        setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        return data;
      }

      if (step === 3) {
        const uploadedUrls = [];
        for (let i = 0; i < photoFiles.length; i++) {
          const url = await uploadPhoto(session.user.id, photoFiles[i], i);
          uploadedUrls.push(url);
          const marker = "/avatars/";
          const mIdx = url?.indexOf(marker);
          if (mIdx !== -1 && mIdx !== undefined) {
            freshlyUploadedPaths.push(decodeURIComponent(url.slice(mIdx + marker.length)));
          }
        }
        // Bug corrigé : cette étape est atteignable plus d'une fois (retour en
        // arrière depuis l'étape 4 puis "Continuer" à nouveau après avoir
        // ajouté une photo supplémentaire) — insérer les nouvelles lignes à
        // des positions 0,1,2... fixes, sans tenir compte des lignes
        // profile_photos déjà enregistrées lors d'un premier passage, créait
        // des positions en double en base (même défaut que celui déjà corrigé
        // dans handleSaveProfile/App.jsx pour l'édition de profil). On relit
        // donc les photos déjà existantes pour dériver la position de départ
        // ET les fusionner dans l'état local, plutôt que d'écraser
        // profilePhotos avec les seules lignes tout juste insérées (qui
        // faisait localement "disparaître" les photos d'un premier passage
        // jusqu'au prochain rechargement complet).
        const { data: existingRows, error: existingError } = await supabase
          .from("profile_photos")
          .select("*")
          .eq("profile_id", currentUser.id);
        if (existingError) throw existingError;
        const existingPhotoRows = existingRows || [];
        let photoRows = [];
        if (uploadedUrls.length > 0) {
          const startPos = existingPhotoRows.length
            ? Math.max(...existingPhotoRows.map((p) => p.position ?? 0)) + 1
            : 0;
          const rows = uploadedUrls.map((url, idx) => ({ profile_id: currentUser.id, url, position: startPos + idx }));
          const { data: inserted, error: photoError } = await supabase.from("profile_photos").insert(rows).select();
          if (photoError) throw photoError;
          photoRows = inserted || [];
          insertedPhotoRowIds = photoRows.map((p) => p.id).filter(Boolean);
        }
        const payload = { avatar_url: uploadedUrls[0] || currentUser.avatar_url || null, onboarding_step: 3 };
        const { data, error: updateError } = await supabase.from("profiles").update(payload).eq("id", currentUser.id).select().single();
        if (updateError) throw updateError;
        setCurrentUser(data);
        setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        setProfilePhotos((pp) => ({ ...pp, [data.id]: [...existingPhotoRows, ...photoRows] }));
        setPhotoFiles([]);
        setPhotoPreviews([]);
        return data;
      }

      let payload = null;
      if (step === 4) {
        payload = { country: draft.country.trim(), province: draft.province.trim(), city: draft.city.trim(), onboarding_step: 4 };
      } else if (step === 5) {
        payload = {
          arrived_since: draft.arrivedSince.trim(),
          immigration_status: draft.immigrationStatus,
          occupation: draft.occupation.trim(),
          education_level: draft.educationLevel,
          arrival_city: draft.arrivalCity.trim(),
          onboarding_step: 5,
        };
      } else if (step === 6) {
        payload = {
          languages_detail: draft.languagesDetail,
          languages: draft.languagesDetail.map((l) => l.language).join(", "),
          onboarding_step: 6,
        };
      } else if (step === 7) {
        payload = {
          looking_for: draft.lookingFor.join(", "),
          relationship_values: draft.relationshipValues.join(", "),
          onboarding_step: 7,
        };
      } else if (step === 8) {
        payload = {
          wants_children: draft.wantsChildren,
          family_importance: draft.familyImportance,
          career_goal: draft.careerGoal,
          geographic_openness: draft.geographicOpenness,
          onboarding_step: 8,
        };
      } else if (step === 9) {
        payload = { interests: draft.interests.join(", "), onboarding_step: 9 };
      } else if (step === 10) {
        payload = {
          personality_evening: draft.personalityEvening,
          personality_travel: draft.personalityTravel,
          relationship_needs: draft.relationshipNeeds.join(", "),
          bio: draft.bio.trim(),
          onboarding_step: 10,
          onboarding_completed_at: new Date().toISOString(),
        };
      }

      const { data, error: updateError } = await supabase.from("profiles").update(payload).eq("id", currentUser.id).select().single();
      if (updateError) throw updateError;
      setCurrentUser(data);
      setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      return data;
    } catch (e) {
      console.error("onboarding save error:", e?.message, "| code:", e?.code, "| details:", e?.details, "| hint:", e?.hint);
      setError("Une erreur est survenue lors de l'enregistrement. Réessaie.");
      // Voir commentaire au début de saveStep : nettoyage des photos
      // fraîchement uploadées (Storage) et/ou insérées (profile_photos) si
      // une étape suivante de l'étape 3 a échoué avant la fin.
      if (freshlyUploadedPaths.length > 0) {
        supabase.storage.from("avatars").remove(freshlyUploadedPaths).catch(() => {});
      }
      if (insertedPhotoRowIds.length > 0) {
        supabase.from("profile_photos").delete().in("id", insertedPhotoRowIds).then(() => {}).catch(() => {});
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function goNext() {
    if (!currentValid) return;
    const result = await saveStep();
    if (!result) return;
    if (step >= STEP_COUNT) {
      setShowNotifPrompt(true);
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    if (step <= 1) return;
    setError("");
    setStep((s) => s - 1);
  }

  // "Profil complétable plus tard sans bloquer l'accès" (item audit
  // onboarding) — à partir de l'étape 5 (identité/photo/localisation déjà
  // acquises, le minimum pour être un profil utilisable), termine
  // l'inscription immédiatement avec les données déjà saisies ; le reste
  // (langues, intentions, projet de vie, centres d'intérêt, bio) reste
  // complétable après coup depuis Modifier mon profil, comme n'importe quel
  // autre réglage — jamais reproposé de force au prochain lancement.
  async function finishLater() {
    if (!currentUser || saving) return;
    setSaving(true);
    setError("");
    try {
      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", currentUser.id)
        .select()
        .single();
      if (updateError) throw updateError;
      setCurrentUser(data);
      setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setShowNotifPrompt(true);
    } catch (e) {
      console.error("onboarding finishLater error:", e?.message, "| code:", e?.code, "| details:", e?.details, "| hint:", e?.hint);
      setError("Une erreur est survenue. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  const StepComponent = {
    1: Step0Welcome, 2: Step1Identity, 3: Step2Photo, 4: Step3Location, 5: Step4CanadaJourney,
    6: Step5Languages, 7: Step6LookingFor, 8: Step7LifeProject, 9: Step8Interests, 10: Step9PersonalityBio,
  }[step];

  if (showNotifPrompt) {
    return <NotificationsOptIn onDone={() => setView("feed")} />;
  }

  return (
    <div className="p-6 max-w-md mx-auto w-full">
      {step > 1 && (
        // disabled={saving} : sinon un clic pendant l'enregistrement de
        // l'étape courante (goNext en vol) déplaçait bien l'affichage vers
        // l'étape précédente, mais goNext (fermeture stale sur `step`)
        // rappelait ensuite setStep((s) => s + 1) une fois la sauvegarde
        // résolue — annulant silencieusement ce retour et renvoyant
        // l'utilisateur vers l'étape qu'il venait de quitter.
        <button onClick={goBack} disabled={saving} className="flex items-center gap-1 text-sm mb-4 disabled:opacity-40" style={{ color: C.indigo }}>
          <ArrowLeft size={16} /> Retour
        </button>
      )}

      <OnboardingProgress step={step} />

      <div key={step} className="bb-fade-in">
        {step === 3 ? (
          <StepComponent photoPreviews={photoPreviews} handlePhotosSelected={handlePhotosSelected} removePhotoFile={removePhotoFile} existingAvatarUrl={currentUser?.avatar_url} />
        ) : (
          <StepComponent draft={draft} update={update} />
        )}
      </div>

      {error && (
        <p className="text-sm mt-3 px-3 py-2 rounded-lg" style={{ background: C.dangerBg, color: C.clay }}>{error}</p>
      )}

      <button
        onClick={goNext}
        disabled={!currentValid || saving}
        className="bb-btn bb-btn-primary w-full mt-5 py-3 rounded-full font-semibold text-sm"
      >
        {saving ? "Enregistrement..." : step === 8 ? "Continuer" : step === STEP_COUNT ? "Terminer" : "Continuer"}
      </button>
      {step === 8 && (
        <button
          onClick={goNext}
          disabled={saving}
          className="w-full mt-2 py-2.5 text-sm font-semibold"
          style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}
        >
          Passer cette étape
        </button>
      )}
      {step >= 5 && step < STEP_COUNT && (
        <button
          onClick={finishLater}
          disabled={saving}
          className="w-full mt-2 py-2.5 text-sm font-semibold"
          style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}
        >
          Terminer plus tard — accéder à Baobab maintenant
        </button>
      )}
    </div>
  );
}
