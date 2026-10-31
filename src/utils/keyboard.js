// Vrai quand la touche Entrée sert à VALIDER une saisie IME en cours (clavier
// chinois, japonais, coréen…) et non à envoyer le message : sans ce test, un
// onKeyDown "Entrée = envoyer" publie le texte à moitié composé. keyCode 229
// couvre Safari, où compositionend précède le keydown (isComposing y est déjà
// faux).
export function isImeComposing(e) {
  return Boolean(e?.nativeEvent?.isComposing || e?.isComposing || e?.keyCode === 229);
}
