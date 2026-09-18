import { describe, it, expect, vi, beforeEach } from "vitest";
import { notifyAudioPlaying, notifyAudioStopped } from "./audioPlaybackRegistry";

// Un seul message vocal doit jouer à la fois dans toute l'app (comme
// WhatsApp) — bug corrigé à l'audit voix : chaque lecteur audio possédait
// son propre <audio> sans coordination, donc lancer un deuxième message
// vocal pendant qu'un premier jouait les faisait jouer EN MÊME TEMPS.
describe("audioPlaybackRegistry", () => {
  // Le registre est une variable de module partagée entre les tests : on la
  // remet à zéro en "libérant" tout élément resté actif d'un test précédent.
  beforeEach(() => {
    notifyAudioStopped({ pause: () => {} });
  });

  function fakeAudio() {
    return { pause: vi.fn() };
  }

  it("met en pause le lecteur précédent quand un nouveau démarre", () => {
    const first = fakeAudio();
    const second = fakeAudio();

    notifyAudioPlaying(first);
    expect(first.pause).not.toHaveBeenCalled();

    notifyAudioPlaying(second);
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(second.pause).not.toHaveBeenCalled();
  });

  it("ne se met pas en pause soi-même si on redémarre le même élément", () => {
    const el = fakeAudio();
    notifyAudioPlaying(el);
    notifyAudioPlaying(el);
    expect(el.pause).not.toHaveBeenCalled();
  });

  it("un arrêt tardif d'un ancien lecteur n'efface pas la référence du lecteur réellement actif", () => {
    const first = fakeAudio();
    const second = fakeAudio();

    notifyAudioPlaying(first);
    notifyAudioPlaying(second); // second devient l'actif, first est mis en pause

    // évènement "pause"/"ended" tardif du PREMIER lecteur (déjà supplanté) :
    // ne doit pas effacer la référence de "second", sinon un futur
    // notifyAudioPlaying(third) ne mettrait plus "second" en pause.
    notifyAudioStopped(first);

    const third = fakeAudio();
    notifyAudioPlaying(third);
    expect(second.pause).toHaveBeenCalledTimes(1);
  });

  it("libère le registre quand le lecteur actif s'arrête normalement", () => {
    const el = fakeAudio();
    notifyAudioPlaying(el);
    notifyAudioStopped(el);

    const next = fakeAudio();
    notifyAudioPlaying(next);
    // el n'est plus l'actif : le démonter/rejouer plus tard ne doit pas
    // mettre "next" en pause par erreur.
    expect(next.pause).not.toHaveBeenCalled();
  });
});
