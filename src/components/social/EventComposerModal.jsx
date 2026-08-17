import React from "react";
import { X } from "lucide-react";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { primary, coral, bg, muted } from "./theme";

export default function EventComposerModal({
  eventComposer,
  setEventComposer,
  eventTitle,
  setEventTitle,
  eventLocation,
  setEventLocation,
  eventDate,
  setEventDate,
  eventTime,
  setEventTime,
  eventDescription,
  setEventDescription,
  eventError,
  eventSubmitting,
  createEvent,
}) {
  const canSubmit = eventTitle.trim() && eventLocation.trim() && eventDate && eventTime;
  useEscapeKey(eventComposer, () => setEventComposer(false));
  return (
    eventComposer && (
      <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-5" style={{ background: "rgba(21,27,61,.55)", backdropFilter: "blur(5px)" }} onClick={() => setEventComposer(false)} role="dialog" aria-modal="true" aria-label="Nouvel événement">
        <div className="bg-white w-full max-w-md rounded-t-[30px] md:rounded-[30px] p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black" style={{ color: primary }}>Nouvel événement</h2>
            <button onClick={() => setEventComposer(false)} aria-label="Fermer"><X /></button>
          </div>

          <label className="block mt-5 text-xs font-bold" style={{ color: muted }}>Titre</label>
          <input
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            maxLength={80}
            className="mt-1.5 w-full rounded-2xl p-3.5 outline-none text-sm"
            style={{ background: bg }}
            placeholder="Coffee & Baobab"
          />

          <label className="block mt-4 text-xs font-bold" style={{ color: muted }}>Lieu</label>
          <input
            value={eventLocation}
            onChange={(e) => setEventLocation(e.target.value)}
            maxLength={80}
            className="mt-1.5 w-full rounded-2xl p-3.5 outline-none text-sm"
            style={{ background: bg }}
            placeholder="Montréal, Plateau-Mont-Royal…"
          />
          <p className="text-[11px] mt-1" style={{ color: muted }}>Une ville ou un quartier — jamais une adresse exacte.</p>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-xs font-bold" style={{ color: muted }}>Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1.5 w-full rounded-2xl p-3.5 outline-none text-sm"
                style={{ background: bg }}
              />
            </div>
            <div>
              <label className="block text-xs font-bold" style={{ color: muted }}>Heure</label>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="mt-1.5 w-full rounded-2xl p-3.5 outline-none text-sm"
                style={{ background: bg }}
              />
            </div>
          </div>

          <label className="block mt-4 text-xs font-bold" style={{ color: muted }}>Description (optionnel)</label>
          <textarea
            value={eventDescription}
            onChange={(e) => setEventDescription(e.target.value)}
            maxLength={280}
            className="mt-1.5 w-full min-h-20 rounded-2xl p-3.5 outline-none text-sm resize-none"
            style={{ background: bg }}
            placeholder="Quelques mots sur l'événement…"
          />

          {eventError && <p className="text-xs mt-3" style={{ color: coral }}>{eventError}</p>}

          <button
            onClick={createEvent}
            disabled={!canSubmit || eventSubmitting}
            className="w-full mt-4 rounded-xl py-3 text-white font-bold disabled:opacity-40"
            style={{ background: coral }}
          >
            {eventSubmitting ? "Création..." : "Créer l'événement"}
          </button>
        </div>
      </div>
    )
  );
}
