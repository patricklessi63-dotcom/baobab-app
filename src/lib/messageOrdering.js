// Tri chronologique canonique des messages d'une conversation — extrait en
// fonction pure pour être testable sans monter tout App.jsx/ConversationPane.
//
// Bug corrigé à l'audit pièces jointes (chat-media) : App.jsx n'a jamais
// trié "messages" après un envoi ou un événement Realtime — chaque nouveau
// message (optimiste ou reçu) était simplement ajouté en fin de tableau,
// dans l'ordre où le CLIENT l'a déclenché, jamais dans l'ordre où il a
// réellement été inséré en base (created_at).
//
// Ça ne pose aucun problème pour un texte seul (l'INSERT est quasi
// instantané, l'ordre de clic == l'ordre d'insertion). Mais un média
// (photo/vidéo/audio/fichier) passe d'abord par un upload Storage — parfois
// plusieurs secondes — AVANT l'INSERT en base (voir sendMediaMessage).
// Scénario concret : j'envoie une photo (upload lent) PUIS, avant qu'il se
// termine, un message texte (upload nul, INSERT immédiat) :
// - le texte est en réalité inséré en base AVANT la photo (created_at plus
//   ancien) ;
// - mais côté expéditeur, le tableau local gardait l'ordre de clic (photo
//   avant texte) puisque insertMessageRow remplaçait chaque message
//   optimiste À SA PLACE D'ORIGINE sans jamais retrier ;
// - côté destinataire, les événements Realtime (postgres_changes INSERT)
//   arrivent dans l'ordre réel des INSERT, donc texte avant photo.
// Résultat : l'expéditeur voyait "photo puis texte" pendant toute la
// session, alors que le destinataire voyait "texte puis photo" — et un
// rechargement de page (refreshMessages, qui trie par created_at) aurait
// lui aussi montré "texte puis photo" à l'expéditeur, donc l'ordre du
// message changeait sous ses yeux au moindre rechargement. Les deux
// participants d'une même conversation doivent toujours voir le même ordre,
// cohérent avec ce qu'un rechargement affiche.
//
// sortMessagesChronologically trie donc par created_at croissant, avec un
// tri stable (ordre d'origine conservé) en cas d'égalité exacte — les
// messages sans created_at encore résolu (ne devrait plus arriver, gardé en
// filet de sécurité) sont traités comme "maintenant" et restent en fin de
// liste plutôt que de sauter n'importe où.
export function sortMessagesChronologically(messages) {
  return messages
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const ta = a.m.created_at || "";
      const tb = b.m.created_at || "";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.i - b.i; // égalité exacte : on ne réordonne jamais, tri stable
    })
    .map((x) => x.m);
}
