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

  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const currentValid = (() => {
    switch (step) {
      case 1: return isStep0Valid(draft);
      case 2: return isStep1Valid(draft);
      case 3: return isStep2Valid(photoPreviews);
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
    try {
      if (step === 1) {
        // Bienvenue + objectif d'usage — crée désormais la ligne profils
        // (déplacé depuis l'ancienne étape 1 "Identité", repoussée à
        // l'étape 2) pour que la toute première question posée à un
        // nouvel utilisateur soit "qu'est-ce que tu recherches ?", pas
        // son prénom.
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
        }
        let photoRows = [];
        if (uploadedUrls.length > 0) {
          const rows = uploadedUrls.map((url, idx) => ({ profile_id: currentUser.id, url, position: idx }));
          const { data: inserted, error: photoError } = await supabase.from("profile_photos").insert(rows).select();
          if (photoError) throw photoError;
          photoRows = inserted || [];
        }
        const payload = { avatar_url: uploadedUrls[0] || currentUser.avatar_url || null, onboarding_step: 3 };
        const { data, error: updateError } = await supabase.from("profiles").update(payload).eq("id", currentUser.id).select().single();
        if (updateError) throw updateError;
        setCurrentUser(data);
        setProfiles((prev) => prev.map((p) => (p.id === data.id ? data : p)));
        setProfilePhotos((pp) => ({ ...pp, [data.id]: photoRows }));
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
      setView("feed");
    } else {
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    if (step <= 1) return;
    setError("");
    setStep((s) => s - 1);
  }

  const StepComponent = {
    1: Step0Welcome, 2: Step1Identity, 3: Step2Photo, 4: Step3Location, 5: Step4CanadaJourney,
    6: Step5Languages, 7: Step6LookingFor, 8: Step7LifeProject, 9: Step8Interests, 10: Step9PersonalityBio,
  }[step];

  return (
    <div className="p-6 max-w-md mx-auto w-full">
      {step > 1 && (
        <button onClick={goBack} className="flex items-center gap-1 text-sm mb-4" style={{ color: C.indigo }}>
          <ArrowLeft size={16} /> Retour
        </button>
      )}

      <OnboardingProgress step={step} />

      <div key={step} className="bb-fade-in">
        {step === 3 ? (
          <StepComponent photoPreviews={photoPreviews} handlePhotosSelected={handlePhotosSelected} removePhotoFile={removePhotoFile} />
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
    </div>
  );
}
