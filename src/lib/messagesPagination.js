// Curseur composé (created_at, id) pour "Charger les messages précédents"
// (loadOlderMessages, App.jsx). Bug corrigé à l'audit pagination : la requête
// utilisait auparavant un simple ".lt('created_at', oldest)" pour remonter
// l'historique d'une conversation. Si plusieurs messages partagent EXACTEMENT
// le même created_at que le plus ancien déjà affiché (colonne/horloge peu
// précise, ou deux messages insérés au même instant par deux participants),
// un ".lt" strict sur created_at seul les exclut TOUS définitivement dès
// qu'un seul d'entre eux a déjà été chargé — contrairement à un doublon, ce
// message manque en permanence, sans aucun moyen de le revoir en rechargeant.
// "id" est une identity strictement croissante à l'insertion (voir
// supabase-schema.sql), donc un tri secondaire dessus donne un ordre total
// déterministe qui lève l'ambiguïté sans jamais sauter ni dupliquer un
// message. Même correctif déjà appliqué à PostsFeed.jsx/CommunitiesTab.jsx/
// EventsTab.jsx pour created_at/id sur posts/communities/events.
export function buildOlderMessagesFilter(oldestMessage) {
  const { created_at, id } = oldestMessage || {};
  return `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`;
}
