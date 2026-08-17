// Estimation réelle de la force d'un mot de passe — pas un simple
// comptage de caractères. Pénalise les séquences évidentes ("1234",
// "abcd"), les répétitions ("aaaa") et les mots de passe faibles connus,
// en plus de récompenser la longueur et la diversité de classes de
// caractères. Aucune dépendance externe (zxcvbn ~800 Ko serait
// disproportionné pour ce besoin).

const SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "azertyuiop"];

const COMMON_WEAK = [
  "password", "motdepasse", "123456", "12345678", "123456789",
  "qwerty", "azerty", "admin", "letmein", "baobab", "bienvenue",
];

function hasSequence(lower) {
  for (const seq of SEQUENCES) {
    for (let i = 0; i <= seq.length - 4; i++) {
      const chunk = seq.slice(i, i + 4);
      const reversed = [...chunk].reverse().join("");
      if (lower.includes(chunk) || lower.includes(reversed)) return true;
    }
  }
  return false;
}

function hasRepetition(pw) {
  return /(.)\1\1/.test(pw); // 3 répétitions consécutives du même caractère
}

const LABELS = ["Très faible", "Faible", "Moyen", "Fort", "Très fort"];

// { score: 0-4, label, checks: {length, upper, lower, digit, special} }
export function scorePassword(pw = "") {
  const checks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };

  if (!pw) return { score: 0, label: "", checks };

  let points = 0;
  if (checks.length) points += 1;
  if (pw.length >= 12) points += 1;
  if (checks.upper && checks.lower) points += 1;
  if (checks.digit) points += 1;
  if (checks.special) points += 1;

  const lower = pw.toLowerCase();
  if (hasSequence(lower)) points -= 1;
  if (hasRepetition(pw)) points -= 1;
  if (COMMON_WEAK.some((w) => lower.includes(w))) points -= 2;

  const score = Math.max(0, Math.min(4, points));
  return { score, label: LABELS[score], checks };
}

// Règles minimales obligatoires (item 15) — le caractère spécial reste
// seulement recommandé, jamais bloquant.
export function passwordMeetsMinimum(checks) {
  return Boolean(checks.length && checks.upper && checks.lower && checks.digit);
}
