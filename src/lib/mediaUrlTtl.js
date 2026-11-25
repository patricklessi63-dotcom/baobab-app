// Durée de vie des liens signés vers les médias des buckets PRIVÉS réservés aux membres
// (community-media, event-media). Une URL signée Storage ne se révoque pas : sa durée est le temps
// pendant lequel une personne retirée (membre exclu d'une communauté, participant retiré d'un
// événement privé) garde l'accès à ce qu'elle a déjà chargé. Les listes re-signent ces médias à
// chaque chargement, une durée courte ne gêne donc pas l'affichage. Audit du 25 nov. 2026 : 5 ans
// (communautés) et 30 jours (photos d'événements) ramenés à 24 h.
export const MEMBER_MEDIA_URL_TTL = 60 * 60 * 24;
