// Registre global de lecture audio (messages vocaux) : un seul <audio> HTML
// peut jouer à la fois, comme WhatsApp — bug corrigé à l'audit voix. Avant
// ceci, chaque AudioPlayer (MessageBubbleMedia.jsx) et l'aperçu avant envoi
// (AudioRecorder.jsx) possédaient chacun leur propre élément <audio> sans la
// moindre coordination entre eux : lancer la lecture d'un deuxième message
// vocal pendant qu'un premier jouait déjà les faisait jouer EN MÊME TEMPS
// (son superposé), y compris entre deux conversations différentes.
//
// Simple variable de module (pas de React Context) car elle doit coordonner
// des lecteurs qui vivent dans des arbres React totalement indépendants —
// bulles de messages différentes, aperçu d'enregistrement — sans dépendre
// d'un ancêtre commun.
let activeAudio = null;

// À appeler quand un <audio> démarre réellement sa lecture (évènement
// natif "play") : met en pause l'élément précédemment actif s'il s'agit
// d'un élément différent.
export function notifyAudioPlaying(audioEl) {
  if (activeAudio && activeAudio !== audioEl) {
    activeAudio.pause();
  }
  activeAudio = audioEl;
}

// À appeler sur pause/fin de lecture/démontage : ne fait rien si un AUTRE
// lecteur a entre-temps pris la main (évite qu'un évènement tardif efface
// la référence du lecteur réellement actif).
export function notifyAudioStopped(audioEl) {
  if (activeAudio === audioEl) activeAudio = null;
}
