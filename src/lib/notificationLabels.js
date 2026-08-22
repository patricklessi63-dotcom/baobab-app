// Libellés partagés entre SocialShell.jsx (menu déroulant) et FeedTab.jsx
// (panneau vertical dans l'accueil) — une seule source pour éviter la
// divergence des deux affichages.
export const NOTIFICATION_LABELS = {
  join_request_received: "Nouvelle demande d'adhésion",
  join_request_accepted: "Ta demande d'adhésion a été acceptée",
  invite_received: "Tu as reçu une invitation",
  report_received: "Nouveau signalement dans ta communauté",
  event_invite: "Tu as été invité(e) à un événement",
  event_participation_confirmed: "Ta participation est confirmée",
  event_updated: "Un événement auquel tu participes a changé",
  event_cancelled: "Un événement auquel tu participes a été annulé",
  event_reminder_24h: "Un événement commence dans 24h",
  event_reminder_1h: "Un événement commence dans 1h",
  event_report_received: "Nouveau signalement sur ton événement",
  event_waitlist_promoted: "Tu es passé(e) de la liste d'attente à participant(e)",
  new_follower: "Nouvel abonné",
  new_like: "T'a aimé(e)",
  new_match: "C'est un match !",
  new_message: "Nouveau message",
  post_liked: "A aimé ta publication",
  post_commented: "A commenté ta publication",
  // Écrites par le webhook Stripe (stripe-webhook/index.ts) mais jamais
  // affichées correctement avant (audit complémentaire post-palette) :
  // elles tombaient dans le fourre-tout "Communautés" sans libellé dédié.
  premium_activated: "Ton abonnement Premium est actif",
  premium_cancelled: "Ton abonnement Premium a été annulé",
  premium_payment_failed: "Échec du paiement de ton abonnement",
  premium_renewing_soon: "Ton abonnement Premium se renouvelle bientôt",
};
