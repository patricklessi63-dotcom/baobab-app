// Forme d'onde des messages vocaux.
//
// À l'enregistrement on échantillonne le niveau sonore (AnalyserNode) ; à
// l'envoi on le réduit à WAVEFORM_BARS valeurs entières 0..100 stockées dans
// messages.media_meta.waveform (jsonb libre, aucune migration SQL). À la
// réception on ne décode JAMAIS l'audio pour dessiner la forme (coûteux sur
// mobile et impossible pour certains conteneurs) : on lit ces valeurs, ou à
// défaut (anciens messages vocaux) on dessine une forme neutre stable.
//
// media_meta est écrit par l'autre participant : normalizeWaveform() ne fait
// aucune confiance au contenu (type, longueur, bornes).

export const WAVEFORM_BARS = 40;
export const MAX_WAVEFORM_LENGTH = 128;
// Un vocal plus court est jugé accidentel (appui involontaire) : il n'est
// jamais envoyé — un conteneur quasi vide est aussi la cause classique d'un
// « fichier corrompu » côté lecture.
export const MIN_VOICE_DURATION_MS = 600;

/**
 * Réduit une série de niveaux (0..1, un par échantillon) à `bars` barres 0..100.
 * Le maximum de chaque tranche est conservé (les pics comptent plus que la
 * moyenne pour la lisibilité) puis l'ensemble est normalisé sur le pic global :
 * un enregistrement calme garde une forme lisible. Plancher à 6 pour qu'une
 * barre ne disparaisse jamais.
 */
export function downsamplePeaks(levels, bars = WAVEFORM_BARS) {
  const clean = (Array.isArray(levels) ? levels : []).map((v) => (Number.isFinite(v) && v > 0 ? Math.min(1, v) : 0));
  if (clean.length === 0) return new Array(bars).fill(6);
  const out = [];
  for (let i = 0; i < bars; i += 1) {
    const from = Math.floor((i * clean.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * clean.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < clean.length; j += 1) peak = Math.max(peak, clean[j]);
    out.push(peak);
  }
  const globalPeak = Math.max(...out);
  if (globalPeak <= 0) return out.map(() => 6);
  return out.map((v) => Math.max(6, Math.round((v / globalPeak) * 100)));
}

/** Niveau RMS 0..1 d'un buffer temporel (getByteTimeDomainData : 0..255, silence = 128). */
export function rmsLevel(timeDomain) {
  if (!timeDomain || timeDomain.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i += 1) {
    const v = (timeDomain[i] - 128) / 128;
    sum += v * v;
  }
  // racine puis légère courbe : la voix parlée reste sous 0.3 en RMS brut.
  return Math.min(1, Math.sqrt(sum / timeDomain.length) * 2.2);
}

/** Valide une forme d'onde venue de media_meta. null si inutilisable. */
export function normalizeWaveform(raw) {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const list = raw.slice(0, MAX_WAVEFORM_LENGTH).map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(6, Math.round(v))) : 6));
  return list;
}

/** Forme neutre déterministe (même id -> même dessin) pour les vocaux sans waveform. */
export function pseudoWaveform(seed, bars = WAVEFORM_BARS) {
  let h = 2166136261;
  const str = String(seed ?? "");
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out = [];
  for (let i = 0; i < bars; i += 1) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5; // xorshift32
    const r = ((h >>> 0) % 1000) / 1000;
    // enveloppe douce : plus haut au centre
    const env = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / bars);
    out.push(Math.max(10, Math.round((0.25 + 0.75 * r) * env * 100)));
  }
  return out;
}

/** Durée en secondes lue dans media_meta (non fiable) : nombre fini 0..7200 ou null. */
export function normalizeDuration(raw) {
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 && raw < 7200 ? raw : null;
}
