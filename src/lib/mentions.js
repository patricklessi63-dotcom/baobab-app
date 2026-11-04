// Mentions « @Nom » dans les publications et les commentaires du fil général (SQL-33).
//
// Le texte garde « @Awa Diop » en clair (lisible partout, y compris sans SQL-33). Une liste
// [{ id, name }] (5 au plus) accompagne le message : elle sert aux notifications côté serveur et au
// surlignage. Une mention n'existe que si la personne a été CHOISIE dans la liste de suggestions : taper
// « @quelqu'un » sans la choisir n'envoie aucune notification.

export const MAX_MENTIONS = 5;
const MAX_QUERY = 30;

// Mention en cours de saisie à la position du curseur : « @ » précédé d'un début de texte ou d'un
// espace, suivi d'au plus deux mots sans retour à la ligne. null sinon.
export function findActiveMention(text, caret) {
  const value = String(text ?? "");
  const end = Math.min(Math.max(caret ?? value.length, 0), value.length);
  for (let i = end - 1; i >= 0 && end - i <= MAX_QUERY + 1; i--) {
    const ch = value[i];
    if (ch === "\n") return null;
    if (ch === "@") {
      const before = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(before)) return null;
      const query = value.slice(i + 1, end);
      if ((query.match(/ /g) || []).length > 1) return null;
      if (query.startsWith(" ")) return null;
      return { start: i, query };
    }
  }
  return null;
}

// Remplace « @requête » par « @Nom » suivi d'une espace ; retourne le nouveau texte et la nouvelle position du curseur.
export function applyMention(text, start, caret, profile) {
  const value = String(text ?? "");
  const name = String(profile?.name || "").trim();
  const insert = `@${name} `;
  const next = value.slice(0, start) + insert + value.slice(caret);
  return { text: next, caret: start + insert.length };
}

// Ajoute une personne choisie (sans doublon, 5 au plus).
export function addMention(mentions, profile) {
  const list = mentions || [];
  if (!profile?.id || list.some((m) => m.id === profile.id) || list.length >= MAX_MENTIONS) return list;
  return [...list, { id: profile.id, name: String(profile.name || "").trim() }];
}

// Ne garde que les mentions dont « @Nom » figure toujours dans le texte (la personne a pu l'effacer).
export function prunedMentions(text, mentions) {
  const value = String(text ?? "");
  const seen = new Set();
  return (mentions || []).filter((m) => {
    if (!m?.id || !m.name || seen.has(m.id) || !value.includes(`@${m.name}`)) return false;
    seen.add(m.id);
    return true;
  }).slice(0, MAX_MENTIONS);
}

// Découpe un message en segments { text } et { mention: { id, name } } pour l'affichage (noms les plus longs d'abord).
export function splitMentions(body, mentions) {
  const value = String(body ?? "");
  const known = [...(mentions || [])].filter((m) => m?.name).sort((a, b) => b.name.length - a.name.length);
  if (!known.length) return [{ text: value }];
  const segments = [];
  let i = 0;
  let buffer = "";
  while (i < value.length) {
    const hit = value[i] === "@" ? known.find((m) => value.startsWith(`@${m.name}`, i) && !/[\p{L}\p{N}]/u.test(value[i + 1 + m.name.length] || " ")) : null;
    if (hit) {
      if (buffer) { segments.push({ text: buffer }); buffer = ""; }
      segments.push({ mention: hit, text: `@${hit.name}` });
      i += 1 + hit.name.length;
    } else {
      buffer += value[i];
      i += 1;
    }
  }
  if (buffer) segments.push({ text: buffer });
  return segments;
}

// Échappe % _ et \ pour une recherche ILIKE de début de nom.
export const escapeLike = (s) => String(s ?? "").replace(/[\\%_]/g, (c) => "\\" + c);

// Colonne absente (SQL-33 pas encore exécuté) : PostgREST répond PGRST204 / 42703.
export function isMissingColumnError(error, ...columns) {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return !columns.length || columns.some((c) => String(error.message || "").includes(c));
  return false;
}
