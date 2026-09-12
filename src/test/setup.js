// Fichier de setup Vitest — appliqué à TOUS les tests (node + jsdom) via
// `setupFiles` dans vite.config.js. Il doit donc rester neutre quand il
// n'y a pas de DOM : les 293 tests de logique pure tournent en
// environnement `node` et ne doivent pas être ralentis ni cassés.
//
// Les matchers @testing-library/jest-dom (toBeInTheDocument, toHaveClass…)
// n'ont de sens qu'avec un DOM : on ne les enregistre que dans les fichiers
// de composant (`*.dom.test.jsx`, environnement jsdom via
// environmentMatchGlobs). jsdom expose `window`, ce qui sert de sonde.
if (typeof window !== "undefined") {
  const matchers = await import("@testing-library/jest-dom/matchers");
  const { expect } = await import("vitest");
  expect.extend(matchers.default ?? matchers);

  // Testing Library nettoie le DOM monté entre chaque test.
  const { cleanup } = await import("@testing-library/react");
  const { afterEach } = await import("vitest");
  afterEach(() => cleanup());

  // jsdom n'implémente aucune méthode de layout/scroll (scrollIntoView,
  // scrollTo…) — plusieurs composants (FeedTab.jsx, ProfileTab.jsx,
  // SocialShell.jsx) l'appellent sur un ref à chaque changement de
  // catégorie/onglet. Sans ce stub, tout montage de ces composants en test
  // jsdom plante avec "scrollIntoView is not a function", même pour un test
  // qui ne porte pas du tout sur le scroll.
  if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
  }
}
