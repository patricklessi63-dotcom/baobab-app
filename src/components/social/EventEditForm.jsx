import React, { useState } from "react";
import { ImagePlus } from "lucide-react";
import ChipSelect from "../ChipSelect";
import { supabase } from "../../supabaseClient";
import { EVENT_CATEGORIES } from "../../lib/events/eventConfig";
import { validateMediaFile } from "../../lib/mediaValidation";
import { extFromMime } from "../../lib/mediaConstants";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { primary, coral, muted, bg } from "./theme";

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;
const COVER_URL_EXPIRY = 60 * 60 * 24 * 365 * 5;

function toDateInput(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function toTimeInput(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Modifie titre/description/catégorie/image/date/heure/durée/lieu/plafond
// — la visibilité et la communauté associée ne sont volontairement pas
// modifiables après création (évite les cas limites RLS d'un événement qui
// changerait de visibilité avec des participants déjà inscrits/invités).
export default function EventEditForm({ event, onSaved, onCancel, onError }) {
  const [title, setTitle] = useState(event.title || "");
  const [description, setDescription] = useState(event.description || "");
  const [category, setCategory] = useState(event.category || "");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(event.cover_url || "");
  const [date, setDate] = useState(toDateInput(event.event_date));
  const [time, setTime] = useState(toTimeInput(event.event_date));
  const [durationMinutes, setDurationMinutes] = useState(event.duration_minutes || "");
  const [city, setCity] = useState(event.city || "");
  const [location, setLocation] = useState(event.location || "");
  const [maxParticipants, setMaxParticipants] = useState(event.max_participants || "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onPickCover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  const canSubmit = title.trim().length > 0 && category && date && time && city.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const eventDateTime = new Date(`${date}T${time}`);
      if (Number.isNaN(eventDateTime.getTime())) {
        setError("Date ou heure invalide.");
        setSubmitting(false);
        return;
      }
      let coverUrl = event.cover_url;
      if (coverFile) {
        const { ok, error: validationError } = await validateMediaFile(coverFile, "image");
        if (!ok) { setError(validationError); setSubmitting(false); return; }
        const path = `${event.id}/${Date.now()}-cover.${extFromMime(coverFile.type)}`;
        await uploadWithProgress({ bucket: "event-covers", path, file: coverFile });
        const { data: signed } = await supabase.storage.from("event-covers").createSignedUrl(path, COVER_URL_EXPIRY);
        if (signed?.signedUrl) coverUrl = signed.signedUrl;
      }

      const { data, error: updateError } = await supabase
        .from("events")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          category,
          cover_url: coverUrl,
          event_date: eventDateTime.toISOString(),
          duration_minutes: durationMinutes ? Number(durationMinutes) : null,
          city: city.trim(),
          location: location.trim() || null,
          max_participants: maxParticipants ? Number(maxParticipants) : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id)
        .select()
        .single();
      if (updateError) throw updateError;
      onSaved(data);
    } catch (e) {
      console.error(e);
      setError("Impossible d'enregistrer les modifications. Réessaie.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Image de couverture</span>
        <label className="mt-1.5 flex items-center justify-center h-32 rounded-2xl cursor-pointer overflow-hidden" style={{ background: coverPreview ? undefined : bg, backgroundImage: coverPreview ? `url(${coverPreview})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}>
          {!coverPreview && <ImagePlus size={22} color={muted} />}
          <input type="file" accept="image/*" className="hidden" onChange={onPickCover} />
        </label>
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Titre *</span>
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))} rows={3} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none" style={{ background: bg }} />
      </label>

      <div>
        <span className="text-xs font-bold" style={{ color: muted }}>Catégorie *</span>
        <div className="mt-1.5">
          <ChipSelect
            options={EVENT_CATEGORIES.map((c) => `${c.icon} ${c.label}`)}
            value={category ? `${EVENT_CATEGORIES.find((c) => c.value === category)?.icon} ${EVENT_CATEGORIES.find((c) => c.value === category)?.label}` : ""}
            onChange={(label) => setCategory(EVENT_CATEGORIES.find((c) => `${c.icon} ${c.label}` === label)?.value || "")}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold" style={{ color: muted }}>Date *</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
        </label>
        <label className="block">
          <span className="text-xs font-bold" style={{ color: muted }}>Heure *</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Durée (minutes, optionnel)</span>
        <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Ville *</span>
        <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Lieu public (optionnel)</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Nombre maximum de participants (optionnel)</span>
        <input type="number" min="1" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      {error && <p className="text-xs" style={{ color: coral }}>{error}</p>}

      <div className="flex gap-2 mt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(21,27,61,.12)", color: primary }}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="flex-1 py-3 rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ background: coral }}>
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
