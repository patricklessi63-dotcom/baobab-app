import React, { useState } from "react";
import { ImagePlus, Sparkles, Loader2 } from "lucide-react";
import ChipSelect from "../ChipSelect";
import { supabase } from "../../supabaseClient";
import { COMMUNITY_CATEGORIES, COMMUNITY_VISIBILITY } from "../../lib/communities/communityConfig";
import { invokeAI } from "../../lib/ai/aiClient";
import { beginCriticalOperation, endCriticalOperation } from "../../lib/criticalOperationGuard";
import { primary, coral, muted, bg, goldTint, goldText, primaryRgb } from "./theme";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 300;
const RULES_MAX = 1000;

export default function CommunityCreateForm({ currentUser, onCreated, onCancel, onError }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState(currentUser?.city || "");
  const [visibility, setVisibility] = useState("public");
  const [rules, setRules] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiIdea, setAiIdea] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiError, setAiError] = useState("");

  // Suggestion IA (item 20) — résultat à 3 champs (nom/description/
  // catégorie), donc géré ici plutôt que par le AiSuggestButton générique
  // (conçu pour un champ texte unique). Ne remplit jamais rien sans clic
  // explicite sur "Utiliser".
  const handleAiSuggest = async () => {
    if (!aiIdea.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiSuggestion(null);
    const { data, error } = await invokeAI("suggest_community", { text: aiIdea.trim() });
    setAiLoading(false);
    if (error) { setAiError(error); return; }
    if (!data?.name) { setAiError("Réponse IA invalide, réessaie."); return; }
    setAiSuggestion(data);
  };
  const applyAiSuggestion = () => {
    if (!aiSuggestion) return;
    setName((aiSuggestion.name || "").slice(0, NAME_MAX));
    setDescription((aiSuggestion.description || "").slice(0, DESCRIPTION_MAX));
    if (COMMUNITY_CATEGORIES.some((c) => c.value === aiSuggestion.category)) setCategory(aiSuggestion.category);
    setAiSuggestion(null);
  };

  const onPickCover = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const canSubmit = name.trim().length > 0 && category && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser) return;
    setSubmitting(true);
    beginCriticalOperation(); // évite que la déconnexion auto par inactivité (App.jsx) coupe un upload/création en cours
    try {
      let coverUrl = null;
      if (coverFile) {
        // Même convention de chemin/bucket que les autres médias publics
        // de profil (avatars/photos/stories) — voir uploadPhoto (App.jsx)
        // et uploadStoryMedia (SocialShell.jsx).
        const ext = coverFile.name.split(".").pop();
        const path = `${currentUser.user_id}/community-${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, coverFile, { upsert: true });
        if (uploadError) throw uploadError;
        coverUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      }

      const { data, error } = await supabase.rpc("create_community", {
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_category: category,
        p_city: city.trim() || null,
        p_visibility: visibility,
        p_cover_url: coverUrl,
        p_rules: rules.trim() || null,
      });
      if (error) throw error;
      onCreated(data);
    } catch (e) {
      console.error(e);
      onError?.("Impossible de créer la communauté. Réessaie.");
    } finally {
      endCriticalOperation();
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Image de couverture</span>
        <label className="mt-1.5 flex items-center justify-center h-28 rounded-2xl cursor-pointer overflow-hidden" style={{ background: coverPreview ? undefined : bg, backgroundImage: coverPreview ? `url(${coverPreview})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
          {!coverPreview && <ImagePlus size={22} color={muted} />}
          <input type="file" accept="image/*" className="hidden" onChange={onPickCover} />
        </label>
      </label>

      {currentUser?.ai_suggestions_enabled !== false && (
        <div className="rounded-2xl p-3.5" style={{ background: goldTint, border: "1px solid rgba(242,184,75,.3)" }}>
          <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: goldText }}>
            <Sparkles size={11} /> Suggestion IA
          </div>
          {aiSuggestion ? (
            <>
              <p className="text-sm font-bold mt-1.5" style={{ color: primary }}>{aiSuggestion.name}</p>
              <p className="text-xs mt-0.5" style={{ color: muted }}>{aiSuggestion.description}</p>
              <div className="flex gap-2 mt-2.5">
                <button type="button" onClick={() => setAiSuggestion(null)} className="flex-1 py-2 rounded-xl text-xs font-bold" style={{ background: bg, color: primary }}>Annuler</button>
                <button type="button" onClick={applyAiSuggestion} className="flex-1 py-2 rounded-xl text-xs font-bold text-white" style={{ background: coral }}>Utiliser</button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs mt-1.5" style={{ color: muted }}>Décris ton idée en quelques mots, l'IA propose un nom, une description et une catégorie.</p>
              <div className="flex gap-2 mt-2">
                <input value={aiIdea} onChange={(e) => setAiIdea(e.target.value)} placeholder="Ex : club de course pour nouveaux arrivants à Montréal" className="flex-1 rounded-xl px-3 py-2 text-xs outline-none" style={{ background: "#fff" }} />
                <button type="button" onClick={handleAiSuggest} disabled={aiLoading || !aiIdea.trim()} className="px-3 py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 flex items-center gap-1" style={{ background: coral }}>
                  {aiLoading ? <Loader2 size={12} className="animate-spin" /> : "Suggérer"}
                </button>
              </div>
              {aiError && <p className="text-[11px] mt-1.5" style={{ color: coral }}>{aiError}</p>}
            </>
          )}
        </div>
      )}

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Nom *</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
          placeholder="Montréal Running Club"
          className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ background: bg }}
        />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
          placeholder="Une communauté pour les passionnés de course."
          rows={2}
          className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
          style={{ background: bg }}
        />
        <span className="text-[11px]" style={{ color: muted }}>{description.length}/{DESCRIPTION_MAX}</span>
      </label>

      <div>
        <span className="text-xs font-bold" style={{ color: muted }}>Catégorie *</span>
        <div className="mt-1.5">
          <ChipSelect
            options={COMMUNITY_CATEGORIES.map((c) => `${c.icon} ${c.label}`)}
            value={category ? `${COMMUNITY_CATEGORIES.find((c) => c.value === category)?.icon} ${COMMUNITY_CATEGORIES.find((c) => c.value === category)?.label}` : ""}
            onChange={(label) => setCategory(COMMUNITY_CATEGORIES.find((c) => `${c.icon} ${c.label}` === label)?.value || "")}
          />
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Ville</span>
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Montréal"
          className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ background: bg }}
        />
      </label>

      <div>
        <span className="text-xs font-bold" style={{ color: muted }}>Type</span>
        <div className="mt-2 flex flex-col gap-2">
          {COMMUNITY_VISIBILITY.map((v) => (
            <button
              key={v.value}
              onClick={() => setVisibility(v.value)}
              className="text-left p-3 rounded-xl"
              style={{ background: visibility === v.value ? "#FFF3F1" : bg, border: visibility === v.value ? `1px solid ${coral}` : "1px solid transparent" }}
            >
              <div className="text-sm font-bold" style={{ color: primary }}>{v.label}</div>
              <div className="text-xs mt-0.5" style={{ color: muted }}>{v.description}</div>
            </button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Règles (facultatif)</span>
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value.slice(0, RULES_MAX))}
          placeholder={"1. Respect des membres\n2. Pas de spam\n3. Pas d'arnaques"}
          rows={3}
          className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none"
          style={{ background: bg }}
        />
        <span className="text-[11px]" style={{ color: muted }}>Affichées aux membres avant de rejoindre une communauté privée. {rules.length}/{RULES_MAX}</span>
      </label>

      <div className="flex gap-2 mt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-full text-sm font-semibold" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="flex-1 py-3 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ background: coral }}>
          {submitting ? "Création..." : "Créer la communauté"}
        </button>
      </div>
    </div>
  );
}
