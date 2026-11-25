// Âge en années révolues à partir d'une date de naissance « AAAA-MM-JJ ». Module léger, sans React : importé par
// App.jsx et EditProfileForm sans tirer tout l'écran d'inscription (Step1Identity) dans le fichier principal.
export function computeAge(birthDate) {
  if (!birthDate) return null;
  // « AAAA-MM-JJ » : composantes lues telles quelles. new Date("AAAA-MM-JJ") vaut minuit UTC, que
  // getDate()/getMonth() relisent en heure LOCALE : au Canada (UTC-5 à UTC-8) la date de naissance
  // reculait d’un jour et l’âge passait à l’âge suivant la veille de l’anniversaire.
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate));
  let by, bm, bd;
  if (iso) {
    by = Number(iso[1]); bm = Number(iso[2]) - 1; bd = Number(iso[3]);
  } else {
    const b = new Date(birthDate);
    if (Number.isNaN(b.getTime())) return null;
    by = b.getFullYear(); bm = b.getMonth(); bd = b.getDate();
  }
  const today = new Date();
  let age = today.getFullYear() - by;
  const m = today.getMonth() - bm;
  if (m < 0 || (m === 0 && today.getDate() < bd)) age--;
  return age;
}
