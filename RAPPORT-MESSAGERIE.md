# Rapport — audit et refonte de la messagerie (1er novembre 2026)

Périmètre : `src/components/social/` (ConversationPane, MessagesTab, MessageBubbleMedia, AudioRecorder…), `src/App.jsx` (envoi, Realtime, réactions), libs associées.
Méthode : lecture du code, tests automatisés (vitest + jsdom), harnais visuel local (navigateur intégré, desktop 800 px et mobile 375 × 812) avec données générées localement.

> **Mise à jour du 3 novembre 2026.** Un projet Supabase de répétition (`baobab-staging`, séparé de la production) a été créé et reconstruit ; deux comptes de test (A et B) y ont servi à un essai réel de bout en bout en émulation desktop (Chrome) + mobile (navigateur intégré, 375 px). Résultats détaillés au §11. Le paragraphe suivant décrit l'état AVANT cet essai ; ce qui n'a toujours pas pu être testé est listé au §11.3.
>
> **Limite majeure (état avant l'essai du 3 nov.).** Aucun environnement Supabase de test n'existe (projet de répétition de `LANCEMENT.md` §9.7 non créé) et la production ne doit pas recevoir de comptes de test. **Aucun test bout en bout avec deux vrais comptes n'a donc été fait** : ni Realtime réel, ni RLS/Storage réels, ni vrai micro, ni iOS/Safari réel. Tout ce qui touche ces points est vérifié par tests simulés uniquement, et marqué comme tel ci-dessous.

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
| Profil, découverte, publications, notifications, paramètres | **Non testés en émulation** (backend requis) | Audit de code et de journaux de tests (3 passages complets, ≈ 2 000 tests) : les 12 canaux Realtime sont désabonnés au démontage ; aucun avertissement React (clés, `act`, mise à jour après démontage) ni rejet de promesse non géré dans les journaux (les seules erreurs affichées viennent de simulations de réseau coupé volontaires) ; minuteurs `setTimeout` inspectés (seuls restes sans nettoyage : le message « tu envoies trop vite » et la fermeture du brouillon de publication, sans effet visible). Un seul vrai bug trouvé : le badge de non-lus (voir §3 bis). **Cela ne prouve pas que ces parcours fonctionnent de bout en bout** : aucun test avec un vrai backend. |
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

## 11. Essai réel sur le projet de répétition (3 novembre 2026)

### 11.1 Environnement et comptes (aucun mot de passe dans ce rapport)
- Projet Supabase **baobab-staging** (Ohio, plan Free), distinct de la production. Aucun compte de test n'a été créé en production ; la seule action en production a été une lecture seule des catalogues Postgres (structure des tables, aucune donnée), exécutée avec l'accord explicite du propriétaire, pour reconstruire la répétition.
- Reconstruction : structure exportée de la production (`scripts/staging-export-schema.sql`) puis rejeu de 124 des 132 fichiers `supabase-*.sql` (buckets Storage, politiques RLS, fonctions, déclencheurs, publication Realtime). **8 fichiers n'ont pas pu être rejoués** (objets déjà présents dans l'export : `supabase-schema`, `-stories`, `-stories-media`, `-events`, `-age-check-server-side` ; `-premium-badge` (données d'amorçage) ; `-storage-account-quota` (propriété de `storage.objects`) ; `-close-read-leaks` (SQL-22)). La répétition **approche** la production sans lui être identique (l'export ne contenait pas les colonnes d'identité : ajoutées à la main sur les `id`).
- Comptes : **TesteurA** et **TesteurB** (inscription réelle par l'interface ; profil de B complété directement en base), **TesteurC** (créé en base, sans connexion, comme destinataire de transfert). Photos générées localement. Géolocalisation simulée à Toronto (porte d'accès bêta) par une configuration Vite locale non versionnée.

### 11.2 Ce qui a été vérifié en réel (A sur mobile 375 px, B dans Chrome desktop)
| Fonctionnalité | Résultat |
|---|---|
| Inscription / connexion, assistant d'inscription (10 étapes), accès bêta (localisation) | Fonctionnelle (un défaut de la répétition corrigé : identités d'`id` manquantes) |
| Message texte A→B puis B→A, **sans rechargement** (Realtime) | **Fonctionnelle** : arrivée immédiate, badge « 1 non lus » chez le destinataire |
| « En train d'écrire » (Realtime broadcast) | **Fonctionnelle** : visible chez A pendant la frappe de B, effacé à l'envoi |
| Accusé de lecture | **Fonctionnelle** : « Lu » chez A dès que B ouvre la conversation |
| Message vocal (MediaRecorder réel, micro simulé par un oscillateur) | **Fonctionnelle** : enregistrement, aperçu, envoi en audio/mp4 (.m4a), 12,7 s, forme d'onde 40 barres, 205 Ko dans Storage (politiques RLS Storage réelles) |
| Vocal reçu et lu chez B (Chrome) | **Fonctionnelle** : métadonnées chargées, lecture, progression 0:02 / 0:12 |
| Photos portrait / paysage / carré envoyées par B | **Fonctionnelle** : dimensions enregistrées, affichage conforme sur mobile |
| Visionneuse de photos avec navigation | **Fonctionnelle** : 2 / 3 avec flèches. **Bug trouvé et corrigé** : sous React.StrictMode (développement) elle ne s'ouvrait pas ; la production n'était pas concernée. Test de non-régression vérifié par mutation |
| Réactions | **Fonctionnelle** : une seule par personne (👍 remplace 😂), synchronisation en direct vers l'autre compte, base cohérente |
| Transfert de photo vers TesteurC | **Fonctionnelle** : `storage.copy` **autorisé** par les politiques Storage réelles, message inséré avec « transféré », fichier dans le dossier du destinataire (lève le risque signalé au §8) |
| Notifications | **Fonctionnelle** : nouveau match, « t'a aimé(e) », nouveau message créés par les déclencheurs et affichés |
| Publication sur le fil | **Fonctionnelle** : publiée et affichée |
| Onglets Découverte, Rencontres, Intégration, Profil | S'affichent avec de vraies données, aucune erreur de console (hors défaut de la répétition corrigé) |
| Écran « microphone bloqué » (permission refusée du navigateur) | **Fonctionnelle** : bascule vers l'aide, nouvel essai possible |

Défaut visuel trouvé : le champ de saisie à 375 px affichait « Écris un message… » sur deux lignes avec barre de défilement ; placeholder raccourci en « Message » (corrigé).

### 11.3 Toujours NON testé
- Vrai microphone, vrai clavier virtuel, iOS Safari / Android Chrome / apps Capacitor (émulation de largeur seulement).
- Vidéos, fichiers joints, aperçu de liens (absent), notifications push, réception hors ligne puis reconnexion, suppression « pour tout le monde » en direct, recherche dans la conversation en direct, mode sélection sur appareil tactile, appui long sur écran tactile réel.
- Réinitialisation de mot de passe par email, modification de profil, découverte (aucun profil à parcourir), paramètres, administration, paiement/Premium.
- Les 8 fichiers SQL non rejoués : tout comportement qui en dépend (SQL-22, quota de stockage…) n'a pas été éprouvé.
- Comportement sous charge / grands volumes de données réelles.

### 11.4 Essais API bout en bout (scripts/staging-e2e.mjs) — 3 novembre 2026, projet de répétition
Script rejouable (35 contrôles, comptes A, B et un « outsider » sans lien avec eux) : RLS, Realtime, Storage, contraintes, cadence. Résultats après corrections de la répétition :
- **Réussis** : envoi et lecture ; **Realtime** reçu par B (~2,7 s à froid) et **aucun événement reçu par l'outsider** ; l'outsider ne lit, n'écrit, ne réagit ni ne téléverse ; usurpation de `from_id` refusée ; modification du texte d'un message envoyé refusée ; suppression « pour tous » réservée à l'auteur ; « lu » réservé au destinataire ; contraintes (texte > 4000, vide, type inconnu, image sans fichier) ; Storage : téléversement limité au dossier de sa conversation, MIME `text/html` refusé, URL signée refusée à l'outsider, bucket non public, listage refusé ; **limitation de cadence** (26 acceptés / 14 refusés sur une rafale de 40).
- **Défaut réel trouvé : une personne BLOQUÉE pouvait continuer à écrire** à celle qui l'a bloquée (et réagir, et téléverser). Cause : les policies contiennent un `NOT EXISTS (… blocks …)` exécuté avec les droits de l'appelant, et chacun ne voit que SES blocages. **Correctif livré, NON exécuté en production** : `supabase-block-enforcement-messages-fix.sql` (SQL-25, additif, policies restrictives + fonction `is_blocked_pair`), validé sur PGlite (reproduction du défaut puis correctif, 11 tests) et sur la répétition (B refusé après blocage). Même défaut constaté en réel sur `likes`, `follows` et `favorites` (et probable sur `event_invitations`, non testé en réel) : SQL-25 les couvre aussi (test PGlite). À valider sur la production par l'exécutant autorisé : les policies de production peuvent différer de la répétition.
- **Comportements constatés et laissés tels quels** : l'expéditeur peut marquer « lu » son propre message (faux accusé, sans autre effet) ; la personne bloquée relit l'historique (seul l'envoi est interdit par SQL-25).
- Artefact de reconstruction de la répétition (pas un défaut de la production) : la RLS était désactivée sur 8 tables dont les fichiers n'avaient pas pu être rejoués ; elle a été activée à la main avant les essais. Les essais d'isolation ci-dessus portent sur cet état corrigé.
