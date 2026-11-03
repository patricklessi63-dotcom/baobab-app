# Rapport — audit et refonte de la messagerie (1er novembre 2026)

Périmètre : `src/components/social/` (ConversationPane, MessagesTab, MessageBubbleMedia, AudioRecorder…), `src/App.jsx` (envoi, Realtime, réactions), libs associées.
Méthode : lecture du code, tests automatisés (vitest + jsdom), harnais visuel local (navigateur intégré, desktop 800 px et mobile 375 × 812) avec données générées localement.

> **Limite majeure.** Aucun environnement Supabase de test n'existe (projet de répétition de `LANCEMENT.md` §9.7 non créé) et la production ne doit pas recevoir de comptes de test. **Aucun test bout en bout avec deux vrais comptes n'a donc été fait** : ni Realtime réel, ni RLS/Storage réels, ni vrai micro, ni iOS/Safari réel. Tout ce qui touche ces points est vérifié par tests simulés uniquement, et marqué comme tel ci-dessous.

## 1. Comptes de test
Aucun compte A/B créé (production interdite, pas d'environnement de test). Utilisés : comptes simulés dans les tests (`u1`, `m1`…) et un harnais local sans réseau (`.claude/harness/`, non versionné). Aucun mot de passe saisi ni exposé.

## 2. Fonctionnalités testées et statut

| Fonctionnalité | Statut | Détail |
|---|---|---|
| Bulles, espacement, regroupement, heures | Fonctionnelle | Vérifié desktop + mobile (harnais). |
| Séparateurs de jour | **Corrigée et vérifiée** | Comparaison par date calendaire + année affichée si autre année (test unitaire + DOM). |
| Présence « en ligne » / vu à | Fonctionnelle | Code existant, tests existants. Non testé en réel. |
| « En train d'écrire » | **Corrigée et vérifiée (simulé)** | Limité à 1 événement / 2 s ; effacé à l'arrivée du message ; arrêt explicite. |
| « Enregistre un message vocal » | **Nouveau, vérifié (simulé)** | Diffusé toutes les 2 s pendant l'enregistrement, « idle » à l'arrêt. Respecte le réglage accusés de lecture. |
| Accusés envoyé / distribué / lu | Fonctionnelle | Code et tests existants ; non testé en réel. |
| Envoi instantané, état en cours / erreur / renvoi | Fonctionnelle | Chemins existants (reprise après coupure, anti-doublon) couverts par les tests App existants, relancés OK. |
| Messages vocaux : enregistrement, annulation, aperçu, envoi | **Corrigée et vérifiée (simulé)** | Refus des vocaux vides / < 0,6 s ; durée mesurée ; micro simulé (pas de vrai micro testé). |
| Vocaux : lecture, pause, reprise, progression, durée, forme d'onde | **Corrigée et vérifiée (visuel + tests)** | Forme d'onde cliquable (clavier compris), vitesse 1×/1,5×/2×, durée avant chargement. Lecture audio réelle sur Safari/iOS : **non testée**. |
| Compatibilité formats audio | Partiellement fonctionnelle | mp4 prioritaire (Safari lit), webm/ogg en repli ; en-têtes webm/ogg vérifiés avant envoi. Matrice navigateurs réelle non testée. |
| Photos : proportions, miniatures, coins arrondis | **Corrigée et vérifiée (visuel)** | Portrait / paysage / carré / panorama sur desktop et mobile ; heure en surimpression, photo pleine largeur. |
| Visionneuse plein écran + navigation | **Corrigée et vérifiée (tests DOM)** | Galerie de toutes les photos de la conversation (flèches, balayage). Navigation vérifiée en jsdom ; non vue en réel faute de médias Storage. |
| Grosses images | Fonctionnelle | Compression à 1600 px existante (tests existants). |
| Vidéos | Fonctionnelle | Lecteur natif ; inchangé. |
| Réactions (message / photo / vidéo / vocal) | **Corrigée et vérifiée (simulé)** | Une réaction par personne (remplacement) ; pastilles superposées à la bulle, étiquetées ; Realtime INSERT/DELETE existant. Synchronisation réelle non testée. |
| Réponse avec citation | **Améliorée** | Aperçu lisible (« 📷 Photo », « 🎤 Message vocal »), tap = saut au message cité. |
| Transfert | **Nouveau, vérifié (simulé)** | Texte, sticker, médias (copie Storage, pas de ré-upload). Dépend des policies Storage réelles (voir risques). |
| Copie | Fonctionnelle | Texte uniquement. |
| Suppression (pour moi / pour tous) | Fonctionnelle | Inchangé. |
| Sélection multiple | **Nouveau, vérifié (tests DOM)** | Copier / transférer / supprimer pour moi. |
| Appui long mobile | **Nouveau, vérifié (tests DOM)** | 450 ms ; annulé si le doigt bouge. Pas testé sur vrai écran tactile. |
| Recherche dans la conversation | **Améliorée, vérifiée (tests DOM)** | Filtre côté client sur les messages chargés + surlignage des occurrences (insensible à la casse et aux accents). Pas de précédent / suivant ni de recherche dans l'historique non chargé. |
| Chargement de l'historique | **Amélioré** | Chargement automatique en remontant (+ bouton conservé). |
| Très longues conversations | Fonctionnelle (mesurée) | Pagination 30 messages + chargement auto en remontant. Mesure sur 610 messages chargés (navigateur intégré, mode développement) : ~7 500 nœuds DOM, défilement + recalcul de mise en page ≈ 4 ms, reflow complet ≈ 11 ms : pas de virtualisation nécessaire à cette échelle. Non mesuré sur mobile réel bas de gamme. |
| Partage de fichiers | Fonctionnelle | Inchangé. |
| Aperçu de liens | Non fonctionnelle (absent) | Nécessite une Edge Function (récupération d'URL côté serveur, protection SSRF) : hors périmètre sans accès Supabase de test. Les liens sont cliquables. |
| Barre de saisie (texte / vocal / photo / vidéo / fichier / emoji) | Fonctionnelle | Vérifiée mobile et desktop. |
| Clavier virtuel mobile (web) | **Corrigée — vérifiée en simulation uniquement** | Le clavier ne redimensionne pas la fenêtre sur Safari iOS / Chrome Android : la barre de saisie pouvait être recouverte. Nouveau suivi du `visualViewport` (`lib/keyboardViewport.js`) : quand il est > 120 px plus court que la fenêtre (hors zoom pincé), la conversation passe en position fixe sur la zone visible (en-tête, messages, saisie) et reste calée en bas. Vérifié : tests jsdom (visualViewport simulé, bureau et liste ignorés, écouteurs nettoyés) + rendu à 375 px avec un faux `visualViewport`. **Jamais vu avec un vrai clavier** (iOS / Android). Inerte dans l'app native Capacitor (`Keyboard.resize: native` rétrécit déjà la WebView ; `innerHeight` suit, aucun écart détecté). `interactive-widget` non utilisé (effets sur les autres écrans non vérifiables). |
| Auth : connexion, validation, réseau coupé, « mot de passe oublié » (formulaire) | Fonctionnelle (testé en émulation mobile, backend injoignable) | Validation des champs, message « Connexion instable » propre, bouton réactivé, aucun exception JS. Envoi réel du lien et page de réinitialisation : non testés (backend requis ; suites existantes vertes). |
| Profil, découverte, publications, notifications, paramètres | **Non testés en émulation** (backend requis) | Audit de code : tous les canaux Realtime (12) sont désabonnés au démontage ; suites unitaires existantes (≈ 270 fichiers) vertes. Un bug réel trouvé et corrigé dans la liste des conversations (voir §3 bis). |
| RLS / Realtime / Storage / sessions | Non testés en réel | Lecture du code et des SQL uniquement (voir §4). |

## 3. Bugs trouvés
1. Aucun accusé d'arrêt de frappe : « en train d'écrire » restait affiché jusqu'à 3 s sous un message déjà reçu.
2. Un événement Realtime était émis à **chaque touche** (risque de saturation des quotas).
3. Un utilisateur pouvait cumuler plusieurs réactions différentes sur un même message (la clé primaire inclut l'emoji).
4. Photos portrait rognées (240 × 320 forcé dans 240 × 260) ; photos réduites à ~170 px sur mobile (l'heure partageait la ligne).
5. Visionneuse : une seule photo ouverte, aucune navigation dans la conversation.
6. Vocaux : aucune forme d'onde ; chevauchement du bouton de vitesse avec l'heure sur mobile (détecté au test mobile) ; un enregistrement vide ou accidentel pouvait être envoyé (fichier illisible).
7. Séparateurs de jour : deux jours distincts de même jour et mois d'années différentes fusionnaient.
8. Aperçu de réponse : « Média » pour toute pièce jointe.
9. `Avatar.jsx` : clé `fontWeight` en double (avertissement de compilation).

## 3 bis. Autre anomalie trouvée à l'audit hors conversation
10. **Badge de messages non lus** (`SocialShell`, canal `conversations-preview`) : l'UPDATE `read_at` d'un message décrémentait le compteur même quand l'autre personne lisait MES messages (accusé de lecture) — mon badge baissait à tort. Corrigé (seuls les messages reçus comptent), test de non-régression vérifié par mutation (échoue sans le correctif). Limite connue restante : sans `REPLICA IDENTITY FULL` sur `messages` (SQL, non fait), un UPDATE de `deleted_for` sur un message reçu déjà lu peut encore décrémenter à tort : cas rare, à traiter avec une migration autorisée.

## 4. Causes techniques
- 1–2 : `broadcastTyping()` appelé à chaque `onChange`, jamais de reset à l'arrivée d'un message (`App.jsx`).
- 3 : `toggleReaction` ne faisait qu'ajouter / retirer l'emoji touché.
- 4 : `object-cover` avec `maxHeight` fixe ; `flex items-end` avec heure et bouton ⋯ en frères de l'image.
- 5 : le composant ne passait que `[{url}]` à `openLightbox`.
- 6 : aucune vérification de taille / durée avant l'aperçu ; lecteur sans métadonnées.
- 7 : comparaison de libellés (`formatDayLabel`) au lieu de clés de jour.

## 5. Corrections réalisées
- **Nouvelles libs** : `photoLayout.js` (boîte à rapport conservé), `voiceWaveform.js` (forme d'onde, durée, normalisation défensive des `media_meta` écrits par l'autre participant), `reactionToggle.js` (une réaction par personne).
- **`App.jsx`** : `broadcastTyping(state)` + limite 2 s ; effacement à l'arrivée ; `toggleReaction` avec remplacement ; `sendMediaMessage(…, extraMeta)` (conserve durée / forme d'onde au renvoi) ; `forwardMessages` (copie Storage, nettoyage si refus, plafond 10).
- **`ConversationPane`** : modes sélection / transfert, appui long, saut vers le message cité, galerie, auto-chargement de l'historique, libellés de présence, heure en surimpression sur photo / vidéo.
- **`MessageBubbleMedia`** : lecteur vocal (forme d'onde, vitesse), boîte photo proportionnelle.
- **`AudioRecorder`** : échantillonnage du niveau (AnalyserNode), refus < 0,6 s / vide, durée + forme d'onde envoyées.
- **`mediaValidation`** : en-têtes webm / ogg obligatoires pour les vocaux.
- **Aucune migration SQL**, aucune politique RLS modifiée, aucun secret touché (`media_meta` est du jsonb libre).

## 6. Fichiers modifiés / créés
Modifiés : `src/App.jsx`, `src/components/SocialShell.jsx`, `src/components/Avatar.jsx`, `src/components/social/{ConversationPane,MessageBubbleMedia,AudioRecorder,MessageActionsMenu,MessagesTab}.jsx`, `src/lib/{ImageLightboxContext.jsx,mediaValidation.js}`, `src/utils/format.js`, trois fichiers de test existants adaptés.
Créés : `src/components/social/ForwardModal.jsx`, `src/lib/{photoLayout,voiceWaveform,reactionToggle}.js`, tests `src/lib/messagingMedia.test.js`, `src/components/social/ConversationPane.messaging.dom.test.jsx`, `src/App.messagingRealtime.dom.test.jsx`, ce rapport.

## 7. Tests
- Nouveaux : ~60 (libs, `ConversationPane` 17, `App` 16, `AudioRecorder` 4, validation audio 2).
- Build `npm run build` : OK.
- Suite complète : 1966 tests ; lancée une première fois en parallèle d'une autre exécution, elle a donné 21 échecs **tous dus à des dépassements de délai (5 s) sous charge** (CommunitiesTab, EventsTab, PostsFeed, SocialShell, Auth…). Relancés isolément (3 workers) : **142 / 142 passent**. Les tests `SocialShell*`, `CommunitiesTab*`, `EventsTab*`, `PostsFeed*` restent sensibles à la charge machine (déjà signalé).
- Le résultat du dernier passage complet avant livraison est consigné dans le message de commit / le bilan.

## 8. Problèmes restants
- Aucun test bout en bout avec deux comptes (pas d'environnement de test) : Realtime, RLS, Storage, sessions non validés en réel.
- **Transfert de médias** : suppose que `storage.copy` est autorisé par les policies Storage existantes (lecture du dossier source + insertion dans le dossier destination — le code SQL le laisse supposer). À valider sur l'environnement de répétition avant de s'y fier ; en cas de refus l'utilisateur voit une erreur et rien n'est créé.
- Les anciens clients (apps natives Capacitor embarquant leur code, PWA non rechargée) ignorent `state` du canal « typing » (traité comme frappe) et affichent un vocal sans forme d'onde (forme neutre).
- Clavier virtuel iOS / Android : correctif vérifié en simulation seulement, pas sur appareil.
- Lecture audio Safari / iOS non testée sur appareil.
- Pas de virtualisation de liste (non nécessaire aux volumes mesurés), pas d'aperçu de liens, pas de navigation précédent / suivant dans la recherche.
- Les réactions multiples déjà en base (avant correctif) restent affichées ; elles sont nettoyées au prochain changement de réaction de la personne.

## 9. Améliorations de la messagerie (acquis)
Forme d'onde et vitesse de lecture des vocaux, durée immédiate, garde anti-fichier corrompu, photos aux bonnes proportions avec heure en surimpression, galerie plein écran, réaction unique façon WhatsApp, citation cliquable, transfert, sélection multiple, appui long, chargement automatique de l'historique, indicateur « enregistre un message vocal », anti-saturation Realtime.

## 10. Résultats desktop / mobile
- Desktop (800 × 600) : bulles, photos 4 formats, vocaux, réactions, réponse citée, lien cliquable : conformes.
- Mobile (375 × 812) : défauts trouvés (chevauchement vocal, photos réduites) **corrigés et revus à l'écran**. Photos pleines largeur, vocaux sans chevauchement, composeur lisible.
- Non vérifié sur appareils réels (iOS Safari, Android Chrome, apps Capacitor).
