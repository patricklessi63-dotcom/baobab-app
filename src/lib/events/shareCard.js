// Métadonnées de la carte "événement" partagée dans une conversation
// (messages.kind = 'event', colonne media_meta).
//
// Fuite évitée : cover_url est une URL SIGNÉE du bucket privé event-covers ; une
// telle URL contourne la RLS, donc quiconque lit le message peut ouvrir la
// couverture, même sans accès à l'événement. Pour un événement 'community'
// partagé à une personne qui n'est PAS membre de la communauté liée, c'était une
// fuite. Choix prudent : la couverture n'est embarquée que pour un événement
// explicitement 'public' (de toute façon accessible à tous) ; pour tout autre
// cas (community, private, valeur inconnue ou absente) elle est omise et la carte
// retombe sur son dégradé décoratif. Titre, date et ville restent inchangés
// (décision produit à trancher, voir DEPLOIEMENT.md §8).
export function buildEventShareMeta(event) {
  return {
    event_id: event.id,
    title: event.title,
    cover_url: event.visibility === "public" ? (event.cover_url || null) : null,
    event_date: event.event_date,
    timezone: event.timezone || null,
    city: event.city,
  };
}
