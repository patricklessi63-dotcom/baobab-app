// Configuration centralisée des événements — jamais codée en dur dans
// plusieurs composants (même motif que communityConfig.js, Phase 6).

export const EVENT_CATEGORIES = [
  { value: "rencontres", label: "Rencontres", icon: "❤️" },
  { value: "amities", label: "Amitiés", icon: "🤝" },
  { value: "sport", label: "Sport", icon: "🏃" },
  { value: "musique", label: "Musique", icon: "🎵" },
  { value: "repas", label: "Repas", icon: "🍽️" },
  { value: "etudes", label: "Études", icon: "🎓" },
  { value: "networking", label: "Networking", icon: "💼" },
  { value: "culture", label: "Culture", icon: "🎨" },
  { value: "voyages", label: "Voyages", icon: "✈️" },
  { value: "jeux", label: "Jeux", icon: "🎮" },
  { value: "communautes", label: "Communautés", icon: "🌍" },
  { value: "sorties", label: "Sorties", icon: "🎉" },
];

export const EVENT_VISIBILITY = [
  { value: "public", label: "Public", description: "Tout le monde peut découvrir et rejoindre l'événement." },
  { value: "community", label: "Communauté", description: "Seuls les membres de la communauté associée peuvent le découvrir et le rejoindre." },
  { value: "private", label: "Privé", description: "Accessible uniquement aux personnes invitées." },
];

export const EVENT_STAFF_ROLES = [
  { value: "organizer", label: "Organisateur" },
  { value: "co_organizer", label: "Co-organisateur" },
  { value: "moderator", label: "Modérateur" },
];

// Même liste que la contrainte SQL event_reports.category (supabase-events-v2.sql).
export const EVENT_REPORT_CATEGORIES = [
  { value: "spam", label: "Spam" },
  { value: "arnaque", label: "Arnaque" },
  { value: "faux_evenement", label: "Faux événement" },
  { value: "harcelement", label: "Harcèlement" },
  { value: "contenu_inapproprie", label: "Contenu inapproprié" },
  { value: "autre", label: "Autre" },
];

export const EVENT_ATTENDANCE_STATUS = [
  { value: "going", label: "Participera" },
  { value: "interested", label: "Intéressé(e)" },
  { value: "not_going", label: "Ne participe pas" },
  { value: "waitlisted", label: "Sur liste d'attente" },
];

// Les 6 fuseaux horaires officiels du Canada — un événement organisé pour
// un public canadien reste dans cette liste, jamais une liste mondiale.
export const CANADA_TIMEZONE_OPTIONS = [
  { value: "America/St_Johns", label: "Terre-Neuve (HNT)" },
  { value: "America/Halifax", label: "Atlantique (HNA)" },
  { value: "America/Toronto", label: "Est (HNE)" },
  { value: "America/Winnipeg", label: "Centre (HNC)" },
  { value: "America/Edmonton", label: "Rocheuses (HNR)" },
  { value: "America/Vancouver", label: "Pacifique (HNP)" },
];

export function timezoneLabel(value) {
  return CANADA_TIMEZONE_OPTIONS.find((t) => t.value === value)?.label || value || "";
}

// Fuseau canadien le plus proche du fuseau détecté du navigateur (repli sur
// "America/Toronto" si l'utilisateur navigue hors Canada) — utilisé comme
// valeur par défaut à la création d'un événement.
export function closestCanadaTimezone(detected) {
  if (CANADA_TIMEZONE_OPTIONS.some((t) => t.value === detected)) return detected;
  return "America/Toronto";
}

// Décalage (en ms) entre l'heure murale du fuseau `timeZone` à l'instant
// `instantMs` et cet instant lui-même (ex. -4h pour America/Toronto en été,
// EDT = UTC-4). Utilisé par zonedInputsToUtc pour situer un instant UTC par
// rapport à une heure locale saisie.
function wallClockOffsetMs(instantMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instantMs)).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = Number(p.value);
    return acc;
  }, {});
  const asUtcIfSameWallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
  return asUtcIfSameWallClock - instantMs;
}

// Convertit une date/heure de formulaire (valeurs d'<input type="date"> et
// <input type="time">, sans fuseau) en instant UTC réel, en les interprétant
// dans le fuseau CHOISI par l'utilisateur (champ "Fuseau horaire" du
// formulaire) — pas dans celui du navigateur. Bug corrigé : EventCreateForm/
// EventEditForm faisaient `new Date(`${date}T${time}`)`, que le moteur JS
// interprète toujours dans le fuseau LOCAL du navigateur. Un organisateur à
// Toronto planifiant "20h" pour un événement en fuseau Pacifique se
// retrouvait donc avec un événement stocké à 20h HNE (= 17h HNP), pas 20h
// HNP comme sélectionné — décalage silencieux de plusieurs heures, visible
// par tous les participants (formatEventWhen affiche bien dans le fuseau de
// l'événement, donc l'erreur de fond se voit).
//
// Algorithme : on suppose d'abord que les composants saisis sont en UTC
// ("guess"), on regarde à quelle heure locale cet instant correspond dans le
// fuseau cible, puis on corrige par l'écart constaté — MAIS un seul passage
// ne suffit pas les jours de bascule DST. Pour un fuseau canadien (UTC-3h30
// à -8h), "guess" (juste les chiffres saisis interprétés comme UTC) tombe
// presque toujours AVANT l'instant de bascule du jour visé (qui a lieu à 2h
// heure locale = 2h+|décalage| UTC), même quand l'heure saisie est après 2h
// locale : le décalage lu à "guess" était alors celui d'AVANT la bascule
// (ex. HNE au lieu de HNA), et toute heure pourtant parfaitement valide de
// 2h à ~7h-8h locale ce jour-là se retrouvait décalée d'une heure entière.
// Repéré concrètement : zonedInputsToUtc("2025-03-09", "03:30",
// "America/Toronto") — 9 mars 2025, jour du passage à l'heure d'été au
// Canada — renvoyait 2025-03-09T08:30:00.000Z (= 4h30 HAE) au lieu de
// 2025-03-09T07:30:00.000Z (3h30 HAE, l'heure réellement choisie), alors que
// 3h30 HAE ce jour-là est une heure on ne peut plus valide (la bascule a eu
// lieu à 2h, une heure plus tôt). Corrigé en relisant le décalage une
// seconde fois, cette fois à proximité de l'instant candidat (donc du bon
// côté de la bascule) plutôt qu'à "guess" qui peut en être à des heures.
// Seule l'heure murale réellement inexistante (ex. 2h00-2h59 le jour du
// passage à l'heure d'été) reste, par nature, sans réponse unique : le
// résultat est alors déterministe (jamais d'exception, jamais aléatoire)
// mais correspond à une convention arbitraire parmi d'autres.
export function zonedInputsToUtc(dateStr, timeStr, timeZone) {
  if (!dateStr || !timeStr) return new Date(NaN);
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, mi] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  if (!timeZone) return new Date(guess);
  const firstPassOffset = wallClockOffsetMs(guess, timeZone);
  const candidate = guess - firstPassOffset;
  const secondPassOffset = wallClockOffsetMs(candidate, timeZone);
  return new Date(guess - secondPassOffset);
}

// Opération inverse : décompose un instant UTC stocké (event.event_date) en
// { date, time } pour pré-remplir le formulaire, en lisant l'heure locale
// dans le fuseau de l'ÉVÉNEMENT (pas celui du navigateur qui édite). Même
// bug côté lecture : EventEditForm utilisait `new Date(iso).getHours()` etc,
// qui lit l'heure locale du navigateur — pré-remplissant le formulaire avec
// la mauvaise heure dès que l'éditeur n'est pas dans le même fuseau que
// l'événement, et donc en RE-décalant l'événement à l'enregistrement, même
// sans rien changer.
export function utcToZonedInputs(iso, timeZone) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  if (!timeZone) {
    return {
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(d).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`,
  };
}

export function categoryLabel(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value)?.label || value;
}

export function categoryIcon(value) {
  return EVENT_CATEGORIES.find((c) => c.value === value)?.icon || "🎉";
}

export function staffRoleLabel(value) {
  return EVENT_STAFF_ROLES.find((r) => r.value === value)?.label || value;
}

export function reportCategoryLabel(value) {
  return EVENT_REPORT_CATEGORIES.find((c) => c.value === value)?.label || value;
}
