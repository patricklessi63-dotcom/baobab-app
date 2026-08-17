import React, { useState } from "react";
import { ImagePlus } from "lucide-react";
import ChipSelect from "../ChipSelect";
import { supabase } from "../../supabaseClient";
import { COMMUNITY_CATEGORIES, COMMUNITY_VISIBILITY } from "../../lib/communities/communityConfig";
import { primary, coral, muted, bg } from "./theme";

const NAME_MAX = 80;
const DESCRIPTION_MAX = 300;

export default function CommunityCreateForm({ currentUser, onCreated, onCancel, onError }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState(currentUser?.city || "");
  const [visibility, setVisibility] = useState("public");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      });
      if (error) throw error;
      onCreated(data);
    } catch (e) {
      console.error(e);
      onError?.("Impossible de créer la communauté. Réessaie.");
    } finally {
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

      <div className="flex gap-2 mt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(21,27,61,.12)", color: primary }}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="flex-1 py-3 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ background: coral }}>
          {submitting ? "Création..." : "Créer la communauté"}
        </button>
      </div>
    </div>
  );
}
