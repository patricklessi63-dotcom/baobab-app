import React, { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import ChipSelect from "../ChipSelect";
import { supabase } from "../../supabaseClient";
import { EVENT_CATEGORIES, CANADA_TIMEZONE_OPTIONS, closestCanadaTimezone, zonedInputsToUtc, utcToZonedInputs } from "../../lib/events/eventConfig";
import { validateMediaFile } from "../../lib/mediaValidation";
import { compressImageIfNeeded } from "../../lib/imageCompression";
import { extFromMime } from "../../lib/mediaConstants";
import { uploadWithProgress } from "../../lib/uploadWithProgress";
import { primary, coral, muted, bg, primaryRgb } from "./theme";

const TITLE_MAX = 80;
const DESCRIPTION_MAX = 500;
const COVER_URL_EXPIRY = 60 * 60 * 24 * 365 * 5;

// Doit utiliser les composants de date LOCAUX, pas toISOString() qui renvoie
// la date en UTC : pour un événement en soirée (ex. 20h à Toronto = 00h UTC
// le lendemain), le champ date affichait le lendemain alors que le champ
// heure affichait l'heure locale — en recombinant ces deux valeurs
// incohérentes à l'enregistrement (même sans rien modifier), l'événement se
// décalait silencieusement d'un jour entier.
//
// Deuxième bug corrigé sur le même terrain : "locales" veut dire "dans le
// fuseau de l'ÉVÉNEMENT" (event.timezone), pas celui du navigateur qui
// édite. utcToZonedInputs/zonedInputsToUtc (eventConfig.js) lisent et
// recomposent la date/heure dans ce fuseau précis — avant, un éditeur situé
// dans un fuseau différent de celui de l'événement voyait un mauvais
// date/heure pré-rempli, et le ré-enregistrer (même sans rien changer)
// décalait l'événement de l'écart entre les deux fuseaux.
function resolveInitialTimezone(ev) {
  if (ev.timezone) return ev.timezone;
  try {
    return closestCanadaTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "America/Toronto";
  }
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
  const [date, setDate] = useState(() => utcToZonedInputs(event.event_date, resolveInitialTimezone(event)).date);
  const [time, setTime] = useState(() => utcToZonedInputs(event.event_date, resolveInitialTimezone(event)).time);
  const [durationMinutes, setDurationMinutes] = useState(event.duration_minutes || "");
  const [city, setCity] = useState(event.city || "");
  const [location, setLocation] = useState(event.location || "");
  const [maxParticipants, setMaxParticipants] = useState(event.max_participants || "");
  const [timezone, setTimezone] = useState(() => resolveInitialTimezone(event));
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Le formulaire se démonte dès que l'utilisateur clique "← Annuler" en
  // haut d'écran (setView() dans EventsTab, hors du bouton "Annuler" du
  // pied de formulaire) : sans cette garde, un enregistrement encore en
  // vol au moment du clic appelait quand même onSaved() après coup et
  // écrasait silencieusement les données affichées.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const onPickCover = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  // Révoque l'URL blob de l'aperçu à chaque remplacement et au démontage —
  // sans ça, chaque couverture sélectionnée fuyait en mémoire (jamais
  // révoquée). coverPreview peut aussi être l'URL signée d'origine de
  // l'événement (pas un blob) : on ne révoque que les URL blob créées ici.
  useEffect(() => {
    return () => {
      if (coverPreview && coverPreview.startsWith("blob:")) {
        try { URL.revokeObjectURL(coverPreview); } catch (_) {}
      }
    };
  }, [coverPreview]);

  const canSubmit = title.trim().length > 0 && category && date && time && city.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      // Composé dans le fuseau actuellement sélectionné (timezone), pas
      // celui du navigateur — voir zonedInputsToUtc dans eventConfig.js.
      const eventDateTime = zonedInputsToUtc(date, time, timezone);
      if (Number.isNaN(eventDateTime.getTime())) {
        setError("Date ou heure invalide.");
        setSubmitting(false);
        return;
      }
      // Bug identifié à l'audit : create_event() (RPC) refuse une date
      // passée à la création (supabase-events-v2.sql), mais cet
      // enregistrement passe par un simple .update() sans RPC ni contrainte
      // serveur équivalente — rien n'empêchait un organisateur de faire
      // basculer par erreur (mauvais mois/jour) un événement À VENIR vers
      // une date passée. Conséquence silencieuse : buildListQuery filtre le
      // listing par défaut sur `event_date >= now()`, donc l'événement
      // disparaissait purement et simplement de la découverte pour tous ses
      // participants déjà inscrits, sans le moindre message d'erreur. On ne
      // bloque pas pour autant l'édition d'un événement déjà passé
      // (corriger une description après coup doit rester possible).
      const wasAlreadyPast = new Date(event.event_date).getTime() < Date.now();
      if (!wasAlreadyPast && eventDateTime <= new Date()) {
        setError("Choisis une date et une heure dans le futur.");
        setSubmitting(false);
        return;
      }
      // Même bug qu'à la création (EventCreateForm) : min="1" sur un
      // <input type="number"> n'empêche pas de taper "-30" ou "0" au
      // clavier, et cette édition passe par un simple .update() (pas de RPC)
      // — duration_minutes n'a aucune contrainte serveur (contrairement à
      // max_participants) et se serait enregistrée telle quelle, faussant
      // ensuite durationLabel() (EventDetailView) et l'export .ics
      // (calendarExport.js, heure de fin avant l'heure de début).
      const parsedDuration = durationMinutes.toString().trim() ? Number(durationMinutes) : null;
      if (parsedDuration !== null && (!Number.isInteger(parsedDuration) || parsedDuration <= 0)) {
        setError("La durée doit être un nombre de minutes positif.");
        setSubmitting(false);
        return;
      }
      const parsedMaxParticipants = maxParticipants.toString().trim() ? Number(maxParticipants) : null;
      if (parsedMaxParticipants !== null && (!Number.isInteger(parsedMaxParticipants) || parsedMaxParticipants <= 0)) {
        setError("Le nombre maximum de participants doit être un entier positif.");
        setSubmitting(false);
        return;
      }
      let coverUrl = event.cover_url;
      let uploadedPath = null;
      if (coverFile) {
        const { ok, error: validationError } = await validateMediaFile(coverFile, "image");
        if (!mountedRef.current) return;
        if (!ok) { setError(validationError); setSubmitting(false); return; }
        // Bug corrigé à l'audit (croisement exhaustif avec
        // compressImageIfNeeded, déjà utilisé par PostsFeed.jsx) : la
        // couverture d'événement partait toujours en taille originale,
        // jamais compressée comme les autres images de l'app.
        const finalCoverFile = await compressImageIfNeeded(coverFile);
        const path = `${event.id}/${Date.now()}-cover.${extFromMime(finalCoverFile.type)}`;
        await uploadWithProgress({ bucket: "event-covers", path, file: finalCoverFile });
        uploadedPath = path;
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
          duration_minutes: parsedDuration,
          city: city.trim(),
          location: location.trim() || null,
          max_participants: parsedMaxParticipants,
          timezone: timezone || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id)
        .select()
        .single();
      if (updateError) {
        // Nouvelle couverture envoyée avec succès mais mise à jour de
        // l'événement échouée : sans ce nettoyage l'ancienne couverture
        // restait en place ET la nouvelle traînait orpheline dans le bucket.
        if (uploadedPath) supabase.storage.from("event-covers").remove([uploadedPath]).catch(() => {});
        throw updateError;
      }
      // Nettoyage de l'ANCIENNE couverture, seulement maintenant que la mise
      // à jour a réussi (l'événement pointe bien vers la nouvelle image) —
      // bug identifié à l'audit : ce remplacement n'écrasait jamais le
      // fichier d'origine (chemin horodaté, différent à chaque envoi), donc
      // chaque changement de couverture laissait l'ancienne orpheline pour
      // toujours dans le bucket "event-covers". Même geste que pour la photo
      // de couverture de profil (App.jsx, coverPathToDeleteOnSuccess).
      if (uploadedPath && event.cover_url) {
        const marker = "/event-covers/";
        const idx = event.cover_url.indexOf(marker);
        if (idx !== -1) {
          const oldPath = decodeURIComponent(event.cover_url.slice(idx + marker.length).split("?")[0]);
          if (oldPath && oldPath !== uploadedPath) {
            supabase.storage.from("event-covers").remove([oldPath]).catch(() => {});
          }
        }
      }
      if (!mountedRef.current) return; // annulé entre-temps : on ne force pas la mise à jour de l'écran quitté
      onSaved(data);
    } catch (e) {
      console.error(e);
      if (!mountedRef.current) return;
      setError("Impossible d'enregistrer les modifications. Réessaie.");
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
        <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))} rows={3} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)] resize-none" style={{ background: bg }} />
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
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
        </label>
        <label className="block">
          <span className="text-xs font-bold" style={{ color: muted }}>Heure *</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Fuseau horaire</span>
        <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }}>
          {CANADA_TIMEZONE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Durée (minutes, optionnel)</span>
        <input type="number" min="1" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Ville *</span>
        <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Lieu public (optionnel)</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
      </label>

      <label className="block">
        <span className="text-xs font-bold" style={{ color: muted }}>Nombre maximum de participants (optionnel)</span>
        <input type="number" min="1" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} className="mt-1.5 w-full rounded-xl px-3.5 py-2.5 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bb-clay)]" style={{ background: bg }} />
      </label>

      {error && <p role="alert" className="text-xs" style={{ color: coral }}>{error}</p>}

      <div className="flex gap-2 mt-2">
        <button onClick={onCancel} disabled={submitting} className="flex-1 py-3 rounded-full text-sm font-semibold disabled:opacity-40" style={{ border: `1px solid rgba(${primaryRgb},.12)`, color: primary }}>
          Annuler
        </button>
        <button onClick={handleSubmit} disabled={!canSubmit} className="bb-btn-gold flex-1 py-3 rounded-full text-sm font-bold disabled:opacity-40">
          {submitting ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
