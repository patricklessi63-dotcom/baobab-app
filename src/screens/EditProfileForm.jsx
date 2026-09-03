import React from "react";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Star } from "lucide-react";
import {
  C, LOOKING_FOR_OPTIONS, RELATIONSHIP_VALUES_OPTIONS, EDUCATION_LEVELS, HAS_CHILDREN_OPTIONS,
  IMMIGRATION_STATUS_OPTIONS, WANTS_CHILDREN_OPTIONS, FAMILY_IMPORTANCE_OPTIONS, CAREER_GOAL_OPTIONS,
  GEOGRAPHIC_OPENNESS_OPTIONS, PERSONALITY_EVENING_OPTIONS, PERSONALITY_TRAVEL_OPTIONS,
  RELATIONSHIP_NEEDS_OPTIONS, INTERESTS_OPTIONS, LANGUAGES_OPTIONS, LANGUAGE_LEVELS, MAX_PHOTOS,
} from "../constants";
import ChipSelect from "../components/ChipSelect";
import AiSuggestButton from "../components/ai/AiSuggestButton";
import { validateMediaFile } from "../lib/mediaValidation";
import { parseArrivedSince, formatArrivedSince } from "./onboarding/steps/Step4CanadaJourney";
import { useImageLightbox } from "../lib/ImageLightboxContext";

function hasIntimateIntent(lookingFor) {
  return (lookingFor || []).some((v) => v.includes("Amour") || v.includes("Relation sérieuse"));
}

export default function EditProfileForm({
  setView,
  editForm,
  setEditForm,
  coverPreview,
  currentUser,
  setCoverFile,
  setCoverPreview,
  coverRemoved,
  setCoverRemoved,
  existingPhotos,
  removeExistingPhoto,
  moveExistingPhoto = () => {},
  setPrimaryPhoto = () => {},
  newPhotoPreviews,
  removeNewPhotoFile,
  handleNewPhotosSelected,
  savingProfile,
  handleSaveProfile,
  onError = () => {},
}) {
  const set = (patch) => setEditForm({ ...editForm, ...patch });
  const { openLightbox } = useImageLightbox();
  const photoGallery = [
    ...existingPhotos.map((p) => ({ url: p.url, alt: "Photo" })),
    ...newPhotoPreviews.map((src, i) => ({ url: src, alt: `Nouvelle photo ${i + 1}` })),
  ];
  const languagesDetail = editForm.languagesDetail || [];

  const toggleLanguage = (language) => {
    const exists = languagesDetail.find((l) => l.language === language);
    if (exists) set({ languagesDetail: languagesDetail.filter((l) => l.language !== language) });
    else set({ languagesDetail: [...languagesDetail, { language, level: LANGUAGE_LEVELS[3] }] });
  };
  const setLanguageLevel = (language, level) => {
    set({ languagesDetail: languagesDetail.map((l) => (l.language === language ? { ...l, level } : l)) });
  };

  return (
    <div className="p-6 max-w-md mx-auto w-full">
      <button onClick={() => setView("feed")} className="flex items-center gap-1 text-sm mb-4" style={{ color: C.indigo }}>
        <ArrowLeft size={16} /> Retour
      </button>
      <h2 style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontSize: 24, color: C.indigo }} className="mb-4">
        Modifier mon profil
      </h2>

      <div className="mb-4" style={{ position: "relative" }}>
        <label className="cursor-pointer block">
          <div
            className="w-full rounded-2xl flex items-center justify-center"
            style={{
              height: 120,
              background: !coverRemoved && (coverPreview || currentUser?.cover_url)
                ? `url(${coverPreview || currentUser.cover_url}) center/cover`
                : `linear-gradient(150deg, ${C.ochre}, ${C.clay} 55%, ${C.indigo} 130%)`,
            }}
          >
            {coverRemoved || (!coverPreview && !currentUser?.cover_url) ? (
              <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "#fff" }}>
                <Camera size={14} /> Ajouter une photo de couverture
              </span>
            ) : null}
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const { ok, error } = await validateMediaFile(file, "image");
              if (!ok) { onError(error); return; }
              setCoverFile(file);
              setCoverRemoved(false);
              const reader = new FileReader();
              reader.onload = () => setCoverPreview(reader.result);
              reader.readAsDataURL(file);
            }}
          />
        </label>
        {!coverRemoved && (coverPreview || currentUser?.cover_url) && (
          <button
            type="button"
            onClick={() => { setCoverFile(null); setCoverPreview(""); setCoverRemoved(true); }}
            aria-label="Supprimer la photo de couverture"
            style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: "50%", background: C.indigo, color: "#fff", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </button>
        )}
      </div>

      <form onSubmit={handleSaveProfile} className="flex flex-col gap-3">
        <div className="mb-2">
          <div className="flex flex-wrap gap-2 mb-2">
            {existingPhotos.map((photo, i) => (
              <div key={photo.id} style={{ position: "relative" }}>
                {/* Bug corrigé à l'audit accessibilité : <img onClick> nu, jamais
                    focusable ni activable au clavier (même famille que
                    ClickableImage.jsx) — un utilisateur clavier-seul ne pouvait
                    pas agrandir une photo de profil depuis cet écran d'édition. */}
                <img
                  src={photo.url}
                  alt="Photo"
                  onClick={() => openLightbox(photoGallery, i)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(photoGallery, i); } }}
                  tabIndex={0}
                  role="button"
                  aria-label="Agrandir la photo"
                  className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ width: 72, height: 72, borderRadius: "var(--bb-radius-sm)", objectFit: "cover", boxShadow: "var(--bb-shadow-sm)", cursor: "pointer" }}
                />
                <button type="button" onClick={() => removeExistingPhoto(photo)} aria-label="Supprimer la photo"
                  style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: C.indigo, color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
                {i === 0 ? (
                  <span aria-hidden="true" style={{ position: "absolute", top: -6, left: -6, width: 20, height: 20, borderRadius: "50%", background: C.ochre, color: C.indigoDeep || C.indigo, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Star size={11} fill="currentColor" />
                  </span>
                ) : (
                  <button type="button" onClick={() => setPrimaryPhoto(photo.id)} aria-label="Définir comme photo principale"
                    style={{ position: "absolute", top: -6, left: -6, width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `1px solid rgba(var(--bb-ink-rgb-static),0.15)`, color: C.indigo, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Star size={11} />
                  </button>
                )}
                <div style={{ position: "absolute", bottom: -6, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 4 }}>
                  {i > 0 && (
                    <button type="button" onClick={() => moveExistingPhoto(photo.id, "up")} aria-label="Déplacer la photo vers la gauche"
                      style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `1px solid rgba(var(--bb-ink-rgb-static),0.15)`, color: C.indigo, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronLeft size={12} />
                    </button>
                  )}
                  {i < existingPhotos.length - 1 && (
                    <button type="button" onClick={() => moveExistingPhoto(photo.id, "down")} aria-label="Déplacer la photo vers la droite"
                      style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", border: `1px solid rgba(var(--bb-ink-rgb-static),0.15)`, color: C.indigo, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {newPhotoPreviews.map((src, i) => (
              <div key={`new-${i}`} style={{ position: "relative" }}>
                <img
                  src={src}
                  alt={`Nouvelle photo ${i + 1}`}
                  onClick={() => openLightbox(photoGallery, existingPhotos.length + i)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(photoGallery, existingPhotos.length + i); } }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Agrandir la nouvelle photo ${i + 1}`}
                  className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ width: 72, height: 72, borderRadius: "var(--bb-radius-sm)", objectFit: "cover", boxShadow: "var(--bb-shadow-sm)", cursor: "pointer" }}
                />
                <button type="button" onClick={() => removeNewPhotoFile(i)} aria-label="Supprimer la nouvelle photo"
                  style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: C.indigo, color: "#fff", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ×
                </button>
              </div>
            ))}
            {existingPhotos.length + newPhotoPreviews.length < MAX_PHOTOS && (
              <label className="cursor-pointer flex items-center justify-center transition-colors hover:bg-black/[0.02]" style={{ width: 72, height: 72, borderRadius: "var(--bb-radius-sm)", border: "1.5px dashed rgba(var(--bb-ink-rgb-static),0.28)" }}>
                <span className="text-xs text-center px-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>+ Ajouter</span>
                <input type="file" accept="image/*" multiple onChange={handleNewPhotosSelected} className="hidden" />
              </label>
            )}
          </div>
          <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>
            Jusqu'à {MAX_PHOTOS} photos. La première est ta photo principale.
          </p>
        </div>

        <p className="text-xs font-semibold" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Identité</p>
        <input placeholder="Prénom" value={editForm.name} onChange={(e) => set({ name: e.target.value })}
          maxLength={80} className="bb-input w-full text-sm" />
        <input placeholder="Nom (facultatif)" value={editForm.lastName || ""} onChange={(e) => set({ lastName: e.target.value })}
          maxLength={80} className="bb-input w-full text-sm" />
        <label htmlFor="edit-birth-date" className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Date de naissance (jamais affichée publiquement)</label>
        <input id="edit-birth-date" type="date" value={editForm.birthDate} onChange={(e) => set({ birthDate: e.target.value })}
          min={`${new Date().getFullYear() - 100}-01-01`} max={`${new Date().getFullYear() - 18}-12-31`}
          className="bb-input w-full text-sm" />

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Localisation</p>
        <input placeholder="Pays d'origine" value={editForm.country} onChange={(e) => set({ country: e.target.value })}
          maxLength={80} className="bb-input w-full text-sm" />
        <input placeholder="Province" value={editForm.province} onChange={(e) => set({ province: e.target.value })}
          maxLength={80} className="bb-input w-full text-sm" />
        <input placeholder="Ville (Canada)" value={editForm.city} onChange={(e) => set({ city: e.target.value })}
          maxLength={80} className="bb-input w-full text-sm" />

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>🇨🇦 Parcours Canada</p>
        {(() => {
          const { amount, unit } = parseArrivedSince(editForm.arrivedSince);
          return (
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={amount}
                onChange={(e) => set({ arrivedSince: formatArrivedSince(e.target.value, unit) })}
                placeholder="Ex. 6"
                className="bb-input text-sm"
                style={{ width: 100 }}
                aria-label="Depuis combien de temps au Canada"
              />
              <div className="flex gap-2 flex-1">
                <button type="button" onClick={() => set({ arrivedSince: formatArrivedSince(amount, "mois") })} aria-pressed={unit === "mois"}
                  className={`bb-pill flex-1 text-xs font-semibold px-3.5 py-2.5 rounded-full ${unit === "mois" ? "bb-pill-active" : ""}`}>
                  Mois
                </button>
                <button type="button" onClick={() => set({ arrivedSince: formatArrivedSince(amount, "annees") })} aria-pressed={unit === "annees"}
                  className={`bb-pill flex-1 text-xs font-semibold px-3.5 py-2.5 rounded-full ${unit === "annees" ? "bb-pill-active" : ""}`}>
                  Années
                </button>
              </div>
            </div>
          );
        })()}
        <ChipSelect options={IMMIGRATION_STATUS_OPTIONS} value={editForm.immigrationStatus} onChange={(v) => set({ immigrationStatus: v })} />
        <input placeholder="Profession / métier" value={editForm.occupation} onChange={(e) => set({ occupation: e.target.value })}
          maxLength={120} className="bb-input w-full text-sm" />
        <div>
          <p className="text-xs mb-1.5" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Études</p>
          <ChipSelect options={EDUCATION_LEVELS} value={editForm.educationLevel} onChange={(v) => set({ educationLevel: v })} />
        </div>
        <input placeholder="Ville d'arrivée au Canada (facultatif)" value={editForm.arrivalCity} onChange={(e) => set({ arrivalCity: e.target.value })}
          maxLength={80} className="bb-input w-full text-sm" />

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>🗣️ Langues</p>
        <div className="flex gap-2 flex-wrap">
          {LANGUAGES_OPTIONS.map((lang) => {
            const active = languagesDetail.some((l) => l.language === lang);
            return (
              <button type="button" key={lang} onClick={() => toggleLanguage(lang)} aria-pressed={active}
                className={`bb-pill text-xs font-semibold px-3.5 py-2.5 rounded-full ${active ? "bb-pill-active" : ""}`}>
                {lang}
              </button>
            );
          })}
        </div>
        {languagesDetail.length > 0 && (
          <div className="flex flex-col gap-2">
            {languagesDetail.map(({ language, level }) => (
              <div key={language} className="flex items-center justify-between gap-2 p-2.5 rounded-xl" style={{ background: "rgba(var(--bb-ink-rgb-static),0.03)" }}>
                <span className="text-sm font-semibold">{language}</span>
                <select value={level} onChange={(e) => setLanguageLevel(language, e.target.value)}
                  className="text-xs rounded-full px-2.5 py-1.5" style={{ border: "1px solid rgba(var(--bb-ink-rgb-static),0.16)", background: "#fff", color: C.indigo }}>
                  {LANGUAGE_LEVELS.map((lv) => <option key={lv} value={lv}>{lv}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Ce que tu recherches</p>
        <ChipSelect
          options={LOOKING_FOR_OPTIONS}
          value={editForm.lookingFor}
          onChange={(v) =>
            // Bug corrigé (même famille que Step6LookingFor.jsx à l'onboarding) :
            // retirer "Amour"/"Relation sérieuse" ici cachait la section
            // "Quel type de relation souhaites-tu ?" sans jamais vider
            // editForm.relationshipValues, qui restait donc enregistré et
            // continuait de s'afficher sur le profil public malgré des
            // intentions désormais contradictoires (ex. "Amitié" seule).
            set(hasIntimateIntent(v) ? { lookingFor: v } : { lookingFor: v, relationshipValues: [] })
          }
          multi
        />
        {hasIntimateIntent(editForm.lookingFor) && (
          <>
            <p className="text-xs mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Quel type de relation souhaites-tu ?</p>
            <ChipSelect options={RELATIONSHIP_VALUES_OPTIONS} value={editForm.relationshipValues} onChange={(v) => set({ relationshipValues: v })} multi />
          </>
        )}

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Centres d'intérêt</p>
        <ChipSelect options={INTERESTS_OPTIONS} value={editForm.interests} onChange={(v) => set({ interests: v })} multi max={10} />

        <div>
          <p className="text-xs mb-1.5 mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>As-tu déjà des enfants ?</p>
          <div className="flex gap-2">
            {HAS_CHILDREN_OPTIONS.map((opt) => (
              <button type="button" key={opt} onClick={() => set({ hasChildren: opt })}
                className={`bb-pill text-xs font-semibold px-3.5 py-2.5 rounded-full ${editForm.hasChildren === opt ? "bb-pill-active" : ""}`}>
                {opt}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>✨ Projet de vie (facultatif)</p>
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Souhaites-tu avoir des enfants ?</p>
        <ChipSelect options={WANTS_CHILDREN_OPTIONS} value={editForm.wantsChildren} onChange={(v) => set({ wantsChildren: v })} />
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Importance de la famille</p>
        <ChipSelect options={FAMILY_IMPORTANCE_OPTIONS} value={editForm.familyImportance} onChange={(v) => set({ familyImportance: v })} />
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Projet professionnel</p>
        <ChipSelect options={CAREER_GOAL_OPTIONS} value={editForm.careerGoal} onChange={(v) => set({ careerGoal: v })} />
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Projet géographique</p>
        <ChipSelect options={GEOGRAPHIC_OPENNESS_OPTIONS} value={editForm.geographicOpenness} onChange={(v) => set({ geographicOpenness: v })} />

        <p className="text-xs font-semibold mt-2" style={{ color: "rgba(var(--bb-ink-rgb-static),0.55)" }}>Personnalité</p>
        <ChipSelect options={PERSONALITY_EVENING_OPTIONS} value={editForm.personalityEvening} onChange={(v) => set({ personalityEvening: v })} />
        <ChipSelect options={PERSONALITY_TRAVEL_OPTIONS} value={editForm.personalityTravel} onChange={(v) => set({ personalityTravel: v })} />
        <p className="text-xs" style={{ color: "rgba(var(--bb-ink-rgb-static),0.5)" }}>Une bonne relation repose surtout sur (max 2)</p>
        <ChipSelect options={RELATIONSHIP_NEEDS_OPTIONS} value={editForm.relationshipNeeds} onChange={(v) => set({ relationshipNeeds: v })} multi max={2} />

        <textarea placeholder="Une courte bio..." value={editForm.bio} onChange={(e) => set({ bio: e.target.value.slice(0, 300) })}
          rows={3} maxLength={300} className="bb-input w-full text-sm" />
        <p className="text-xs text-right -mt-1" style={{ color: "rgba(var(--bb-ink-rgb-static),0.4)" }}>{(editForm.bio || "").length}/300</p>
        {currentUser?.ai_suggestions_enabled !== false && (
          <AiSuggestButton
            action="improve_bio"
            label="Améliorer ma bio"
            buildPayload={() => ({ text: editForm.bio || "" })}
            onApply={(text) => set({ bio: text.slice(0, 300) })}
            disabled={!(editForm.bio || "").trim()}
          />
        )}

        <button type="submit" disabled={savingProfile} className="bb-btn bb-btn-primary mt-2 py-3 rounded-full font-semibold text-sm">
          {savingProfile ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
      </form>
    </div>
  );
}
