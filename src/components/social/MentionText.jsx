import React from "react";
import { splitMentions } from "../../lib/mentions";
import { primary } from "./theme";

// Texte d'une publication ou d'un commentaire avec les mentions surlignées ; chacune ouvre la fiche de la
// personne quand `onOpenProfile` est fourni. Sans mention, rend le texte tel quel.
export default function MentionText({ body, mentions, onOpenProfile }) {
  const segments = splitMentions(body, mentions);
  if (segments.length === 1 && !segments[0].mention) return <>{segments[0].text}</>;
  return (
    <>
      {segments.map((s, i) => (s.mention ? (
        onOpenProfile ? (
          <button key={i} type="button" onClick={() => onOpenProfile(s.mention.id)} className="font-bold focus-visible:outline focus-visible:outline-2" style={{ color: "var(--bb-accent-text, var(--bb-accent))" }}>
            {s.text}
          </button>
        ) : (
          <strong key={i} style={{ color: primary }}>{s.text}</strong>
        )
      ) : (
        <React.Fragment key={i}>{s.text}</React.Fragment>
      )))}
    </>
  );
}
