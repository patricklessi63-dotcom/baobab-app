// Traduction des erreurs Supabase Auth (signIn/signUp/resend/verifyOtp/
// updateUser...) vers un message français clair. Utilisé par Auth.jsx (tous
// les écrans signin/signup/reset/vérification) ET par UpdatePasswordScreen.jsx
// (écran "nouveau mot de passe" atteint via le lien de récupération) — un
// seul point de traduction pour ne jamais laisser fuir un message technique
// brut de Supabase (souvent en anglais) vers l'utilisateur final, quel que
// soit l'écran d'où provient l'erreur.
export function traduireAuthErreur(err) {
  const code = err?.code;
  const msg = err?.message || "";
  if (code === "invalid_credentials" || msg.includes("Invalid login credentials"))
    return "Email ou mot de passe incorrect.";
  if (code === "user_already_exists" || msg.includes("User already registered"))
    return "Cette adresse email est déjà associée à un compte Baobab.";
  if (code === "same_password" || msg.includes("should be different from the old password"))
    return "Ton nouveau mot de passe doit être différent de l'ancien.";
  if (code === "weak_password" || msg.includes("Password should be at least"))
    return "Le mot de passe ne respecte pas les règles minimales.";
  if (code === "validation_failed" || msg.includes("Unable to validate email address"))
    return "Veuillez entrer une adresse email valide.";
  if (code === "over_email_send_rate_limit" || msg.includes("rate limit"))
    return "Trop de tentatives. Réessaie dans quelques minutes.";
  if (msg.toLowerCase().includes("already confirmed"))
    return "Cette adresse est déjà vérifiée. Tu peux te connecter directement.";
  // Session de récupération manquante/expirée (item b du cahier des charges
  // "auth flows") : le lien "mot de passe oublié" a déjà été utilisé, a
  // expiré entre l'ouverture de l'écran et la soumission, ou l'onglet a
  // perdu sa session de récupération — sans ce cas, l'utilisateur voyait la
  // string technique brute "Auth session missing!".
  if (code === "session_not_found" || msg.toLowerCase().includes("auth session missing") || msg.toLowerCase().includes("session missing"))
    return "Ta session de réinitialisation a expiré ou ce lien a déjà été utilisé. Demande un nouveau lien de réinitialisation.";
  if (code === "otp_expired" || msg.toLowerCase().includes("expired") || msg.toLowerCase().includes("invalid"))
    return "Code invalide ou expiré. Vérifie les chiffres saisis ou demande un nouveau code.";
  if (!navigator.onLine) return "Pas de connexion internet.";
  // Filet de sécurité (item 6 du cahier des charges) : ne jamais renvoyer
  // le message technique brut de Supabase à l'utilisateur si aucun des cas
  // ci-dessus ne correspond — seulement l'enregistrer pour le diagnostic.
  if (msg) console.error("Erreur Supabase Auth non traduite :", msg);
  return "Une erreur est survenue. Réessaie dans un instant.";
}
