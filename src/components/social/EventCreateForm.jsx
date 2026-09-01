import React, { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import ChipSelect from "../ChipSelect";
import { supabase } from "../../supabaseClient";
import { EVENT_CATEGORIES, EVENT_VISIBILITY, CANADA_TIMEZONE_OPTIONS, closestCanadaTimezone, zonedInputsToUtc } from "../../lib/events/eventConfig";
import { validateMediaFile } from "../../lib/mediaValidation";
import { extFromMime } from "../../lib/mediaConstants";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import AiSuggestButton from "../ai/AiSuggestButton";
import { primary, coral, muted, bg, primaryRgb } from "./theme";

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;
const COVER_URL_EXPIRY = 60 * 60 * 24 * 365 * 5; // 5 ans — bucket privé, pas de re-signature à gérer pour une couverture

export default function EventCreateForm({ currentUser, onCreated, onCancel, onError }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [city, setCity] = useState(currentUser?.city || "");
  const [location, setLocation] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [communityId, setCommunityId] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try {
      return closestCanadaTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      return "America/Toronto";
    }
  });
  const [myCommunities, setMyCommunities] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Le formulaire se démonte dès que l'utilisateur clique "← Annuler" en
  // haut d'écran (setView() dans EventsTab, hors du bouton "Annuler" du
  // pied de formulaire) : sans cette garde, un create_event() encore en
  // vol au moment du clic appelait quand même onCreated() après coup et
  // renavigait de force vers l'événement que l'utilisateur venait
  // d'annuler.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!currentUser) return;
    supabase
      .from("community_members")
      .select("communities(id, name)")
      .eq("profile_id", currentUser.id)
      .then(({ data, error: e }) => {
        if (e) { console.error(e); return; }
        setMyCommunities((data || []).filter((r) => r.communities).map((r) => r.communities));
      });
  }, [currentUser?.id]);

  const onPickCover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  // Révoque l'URL blob de l'aperçu à chaque remplacement et au démontage —
  // sans ça, chaque couverture sélectionnée fuyait en mémoire (jamais
  // révoquée), même après création de l'événement ou annulation.
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith("blob:")) {
        try { URL.revokeObjectURL(coverPreview); } catch (_) {}
      }
    };
  }, [coverPreview]);

  const canSubmit = title.trim().length > 0 && category && date && time && city.trim().length > 0 && !submitting
    && (visibility !== "community" || communityId);

  const handleSubmit = async () => {
    if (!canSubmit || !currentUser) return;
    setSubmitting(true);
    setError("");
    try {
      // Composé dans le fuseau CHOISI (timezone), pas celui du navigateur —
      // voir zonedInputsToUtc dans eventConfig.js.
      const eventDateTime = zonedInputsToUtc(date, time, timezone);
      if (Number.isNaN(eventDateTime.getTime()) || eventDateTime <= new Date()) {
        setError("Choisis une date et une heure dans le futur.");
        setSubmitting(false);
        return;
      }
      if (coverFile) {
        const { ok, error: validationError } = await validateMediaFile(coverFile, "image");
        if (!mountedRef.current) return;
        if (!ok) { setError(validationError); setSubmitting(false); return; }
      }

      const { data, error: rpcError } = await supabase.rpc("create_event", {
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_category: category,
        p_cover_url: null,
        p_event_date: eventDateTime.toISOString(),
        p_duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        p_city: city.trim(),
        p_location: location.trim() || null,
        p_max_participants: maxParticipants ? Number(maxParticipants) : null,
        p_visibility: visibility,
        p_community_id: visibility === "community" ? communityId : null,
        p_timezone: timezone || null,
      });
      if (rpcError) throw rpcError;

      let finalEvent = data;
      if (coverFile) {
        // L'événement existe déjà en base à ce stade (create_event a réussi
        // ci-dessus) : un échec ici ne doit jamais faire tomber dans le
        // catch général, qui n'appelle jamais onCreated et laisserait
        // croire que RIEN n'a été créé — un nouveau clic sur "Créer"
        // relancerait create_event et créerait un second événement, en
        // double, celui-ci sans couverture restant invisible pour
        // l'utilisateur. On continue donc sans couverture plutôt que
        // d'échouer toute la création.
        let uploadedPath = null;
        try {
          // La couverture ne peut être téléversée qu'APRÈS la création : le
          // chemin Storage est {event_id}/... (supabase-events-v2.sql).
          const path = `${data.id}/${Date.now()}-cover.${extFromMime(coverFile.type)}`;
          await uploadWithProgress({ bucket: "event-covers", path, file: coverFile });
          uploadedPath = path;
          const { data: signed } = await supabase.storage.from("event-covers").createSignedUrl(path, COVER_URL_EXPIRY);
          if (signed?.signedUrl) {
            const { data: updated, error: coverUpdateError } = await supabase.from("events").update({ cover_url: signed.signedUrl }).eq("id", data.id).select().single();
            if (coverUpdateError) throw coverUpdateError;
            if (updated) finalEvent = updated;
          }
        } catch (coverError) {
          console.error(coverError);
          // Upload Storage réussi mais liaison à l'événement échouée (ex :
          // l'UPDATE cover_url a échoué après un upload OK) : sans ce
          // nettoyage le fichier restait orphelin dans "event-covers".
          if (uploadedPath) supabase.storage.from("event-covers").remove([uploadedPath]).catch(() => {});
          onError?.("Ton événement a été créé, mais l'image de couverture n'a pas pu être envoyée. Tu peux réessayer depuis la modification de l'événement.");
        }
      }

      if (!mountedRef.current) return; // annulé entre-temps : l'événement existe déjà, mais on ne force pas la navigation
      onCreated(finalEvent);
    } catch (e) {
      console.error(e);
      if (!mountedRef.current) return;
      setError(e.message || "Impossible de créer l'événement. Réessaie.");
    } finally {
      if (mountedRef.current) setSubmitting(false);
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
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} placeholder="Brunch Baobab Montréal" className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))} placeholder="Quelques mots sur l'événement…" rows={3} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none resize-none" style={{ background: bg }} />
        <span className="text-[11px]" style={{ color: muted }}>{description.length}/{DESCRIPTION_MAX}</span>
        {currentUser?.ai_suggestions_enabled !== false && (
          <AiSuggestButton
            action="improve_event_description"
            label="Améliorer la description"
            buildPayload={() => ({ title, text: description })}
            onApply={(text) => setDescription(text.slice(0, DESCRIPTION_MAX))}
            disabled={!description.trim()}
          />
        )}
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
        <span className="text-xs font-bold" style={{ color: muted }}>Fuseau horaire</span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }}>
          {CANADA_TIMEZONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Durée (minutes, optionnel)</span>
        <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} placeholder="90" className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Ville *</span>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Montréal" className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Lieu public (optionnel)</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Café Aunja, Plateau-Mont-Royal" className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
        <p className="text-[11px] mt-1" style={{ color: muted }}>Un lieu public ou un quartier — jamais une adresse exacte.</p>
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Nombre maximum de participants (optionnel)</span>
        <input type="number" min="1" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} placeholder="Illimité" className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }} />
      </label>

      <div>
        <span className="text-xs font-bold" style={{ color: muted }}>Visibilité</span>
        <div className="mt-2 flex flex-col gap-2">
          {EVENT_VISIBILITY.map((v) => (
            <button
              key={v.value}
              onClick={() => setVisibility(v.value)}
              disabled={v.value === "community" && myCommunities.length === 0}
              className="text-left p-3 rounded-xl disabled:opacity-40"
              style={{ background: visibility === v.value ? "var(--bb-surface-2)" : bg, border: visibility === v.value ? `1px solid ${coral}` : "1px solid transparent" }}
            >
              <div className="text-sm font-bold" style={{ color: visibility === v.value ? coral : primary }}>{v.label}</div>
              <div className="text-xs mt-0.5" style={{ color: muted }}>{v.description}</div>
            </button>
          ))}
        </div>
      </div>

      {visibility === "community" && (
        <label className="block">
          <span className="text-xs font-bold" style={{ color: muted }}>Communauté organisatrice *</span>
          <select value={communityId} onChange={(e) => setCommunityId(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: bg }}>
            <option value="">Choisir une communauté</option>
            {myCommunities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}

      {error && <p role="alert" className="text-xs" style={{ color: coral }}>{error}</p>}

      <div className="flex gap-2 mt-2">
        <button onClick={onCancel} disabled={submitting} className="flex-1 py-3 rounded-full text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="bb-btn-gold flex-1 py-3 rounded-full text-sm font-bold disabled:opacity-40">
          {submitting ? "Création..." : "Créer l'événement"}
        </button>
      </div>
    </div>
  );
}
