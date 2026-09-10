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
}
