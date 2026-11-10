# Baobab — Test de bout en bout en PRODUCTION, à deux vrais comptes (pas-à-pas pour le propriétaire)

> **Pourquoi ce document.** Tout ce qui a été essayé jusqu'ici l'a été sur le projet de répétition (`baobab-staging`) ou en simulation. **Jamais en production avec de vrais appareils.** Ce pas-à-pas couvre la messagerie (messages, photo, vocal, réaction, transfert, suppression, signalement, blocage) et se joue à la main, avec **deux comptes qui existent déjà**. Il ne demande aucun compte de test à créer et aucun SQL.
>
> **Durée** : 60 à 75 minutes. **Matériel** : un téléphone (compte 1) et un ordinateur (compte 2). Idéal : refaire les parties C, D, E sur un second téléphone d'une autre marque (iPhone ET Android) : c'est le seul moyen de voir la lecture audio et le clavier réels.
>
> **Légende** : ☐ = case à cocher · **Attendu** = ce que tu dois voir · en cas d'écart, note l'étape, l'appareil, l'heure et une capture d'écran (voir §6).

---

## 1. Précautions (à lire avant de commencer)

- **C'est la vraie base.** Chaque message, photo, vocal et signalement envoyé **reste enregistré** (les signalements ne se suppriment pas). N'envoie rien que tu ne voudrais pas garder. Utilise deux comptes à toi (ou d'une personne qui sait qu'elle participe).
- **Ne teste PAS le filtre de mots interdits avec un vrai compte, sauf une seule fois et en le sachant.** La modération est active : chaque texte refusé est une **infraction comptée pendant 365 jours** (4 avertissements, puis suspension de 24 h à la 5ᵉ, puis bannissement à la 3ᵉ suspension). Une seule tentative = 1 avertissement sur ce compte (un administrateur peut l'annuler dans l'onglet Modération). Pas de test répété.
- **Signalement « Mineur suspecté » : une fois, puis clos.** Il passe en tête de la file des modérateurs. Si tu le testes, ferme-le tout de suite dans Administration › Signalements (Rejeter).
- **Cadence** : le serveur refuse les rafales (au-delà d'environ 28 messages d'affilée, message « Trop de messages envoyés récemment »). Ne spamme pas pour le tester.
- **Si quelque chose ressemble à une faille** (tu vois la conversation de quelqu'un d'autre, un message arrive chez la mauvaise personne) : **arrête-toi**, ne continue pas, note l'heure exacte et prévenez-moi.
- **Rien à saisir en dehors de l'application** : aucun mot de passe à me donner, aucune clé.

## 2. Préparation (10 min)

☐ **P1.** Compte 1 sur le téléphone, compte 2 sur l'ordinateur. Chacun connecté, onboarding terminé. *Attendu* : l'accueil s'affiche, pas d'erreur rouge.
☐ **P2.** Recharge complètement la page / ferme et rouvre l'application des deux côtés (pour être sûr d'avoir la dernière version, pas une copie en cache). Note la date du dernier déploiement Vercel si tu la connais.
☐ **P3.** Les deux comptes ont **matché** (« j'aime » mutuel dans *Découverte* / *Rencontres*) : sans cela, la messagerie n'ouvre pas de conversation (règle du serveur). *Attendu* : la conversation apparaît dans *Messages* chez les deux.
☐ **P4.** Ouvre la conversation des deux côtés, côte à côte, pour voir l'arrivée en direct.

## 3. Parcours

### A. Messages texte (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ A1 | 1 → 2 : « Test A1 ». | Apparaît chez 2 **en 1 à 3 secondes sans recharger**. Coche « envoyé » chez 1. |
| ☐ A2 | 2 → 1 : « Test A2 ». | Idem en sens inverse. |
| ☐ A3 | Message long (plusieurs lignes, accents, un lien, un emoji). | Affichage intact, lien cliquable, retours à la ligne conservés. |
| ☐ A4 | 1 envoie 3 messages d'affilée. | Regroupés visuellement, heures correctes, ordre respecté chez 2. |
| ☐ A5 | Coupe le Wi-Fi/données du téléphone, envoie « Test hors ligne », rallume. | Le message montre un état d'attente/erreur, **puis part** (ou propose « renvoyer ») ; **un seul exemplaire** arrive chez 2 (pas de doublon). |

### B. Indicateurs (3 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ B1 | 2 commence à écrire sans envoyer. | Chez 1 : « écrit… » qui disparaît quelques secondes après l'arrêt / à l'envoi. |
| ☐ B2 | 2 lit un message de 1. | Accusé « lu » chez 1 **si** les accusés de lecture sont activés dans les réglages de 2 (vérifie le réglage et note-le). |
| ☐ B3 | Ferme l'application chez 2. | Chez 1 : « vu à … » (ou « en ligne » disparaît). |

### C. Photos (10 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ C1 | 1 envoie une photo **portrait**, 2 une photo **paysage**. | Miniature aux bonnes proportions, coins arrondis, heure sur la photo, arrivée en direct chez l'autre. |
| ☐ C2 | Appuie sur une photo. | Visionneuse plein écran ; flèches / balayage vers les autres photos de la conversation ; fermeture facile. |
| ☐ C3 | Envoie une **grosse photo** (> 5 Mo, direct de l'appareil). | Elle part (réduite automatiquement) sans erreur, pas trop longue. |
| ☐ C4 | *(Optionnel)* Envoie une courte **vidéo** et un **fichier joint** (PDF). | La vidéo se lit dans la conversation ; le PDF s'ouvre / se télécharge chez l'autre. |
| ☐ C5 | Des deux côtés, ferme puis rouvre la conversation. | Les photos se rechargent (adresses signées renouvelées), aucune image cassée. |

### D. Messages vocaux (10 min, **sur téléphone réel, iPhone ET Android si possible**)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ D1 | Autorise le micro (première fois), enregistre 5 à 10 secondes, envoie. | Pendant l'enregistrement : durée qui défile ; chez 2 : « enregistre un message vocal ». Envoi réussi. |
| ☐ D2 | Chez 2 : lis le vocal. | Forme d'onde, durée affichée **avant** la lecture, lecture audible, pause/reprise, progression ; **clic sur la forme d'onde = déplacement**. |
| ☐ D3 | Change la vitesse (1× → 1,5× → 2×). | Le son change de vitesse. |
| ☐ D4 | Enregistre puis **annule**. | Rien n'est envoyé. |
| ☐ D5 | Appuie-relâche très vite (< 1 s). | Refusé (« trop court »), rien n'est envoyé. |
| ☐ D6 | Lis le vocal **dans l'autre navigateur** (iPhone Safari ↔ Chrome ordinateur, etc.). | Se lit partout. **Si un appareil ne lit pas : note le modèle et la version** (format audio). |

### E. Réactions (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ E1 | 2 réagit à un message texte de 1 (appui long sur téléphone / bouton « Options du message »). | La pastille apparaît chez les deux **en direct**. |
| ☐ E2 | 2 choisit **une autre** réaction sur le même message. | **Remplace** la première (une seule réaction par personne). |
| ☐ E3 | 2 touche la même réaction pour la retirer. | La pastille disparaît chez les deux. |
| ☐ E4 | Réagis à une **photo** et à un **vocal**. | Même comportement, pastille lisible sur la bulle. |

### F. Répondre, copier, rechercher, sélectionner (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ F1 | Répondre à un message (citation) ; répondre à une photo et à un vocal. | La citation est lisible (« Photo », « Message vocal ») ; toucher la citation **saute** au message d'origine. |
| ☐ F2 | Copier un message texte. | Le texte est dans le presse-papiers. |
| ☐ F3 | Rechercher un mot dans la conversation (avec et sans accent / majuscule). | Les occurrences sont surlignées. |
| ☐ F4 | Sélection multiple (menu du message › Sélectionner) : copier, supprimer pour moi. | Fonctionne ; « Annuler la sélection » quitte le mode. |

### G. Transfert (5 min)
Il faut une conversation de destination : si tu n'as qu'une seule conversation, transfère vers **la même** conversation.
| ☐ | Action | Attendu |
|---|---|---|
| ☐ G1 | Transférer un message texte. | Arrive dans la destination. |
| ☐ G2 | Transférer une **photo**, puis un **vocal**. | Le média arrive **et s'affiche/joue** (la copie côté stockage a fonctionné). **Si une erreur apparaît : note le texte exact** (c'est le point le moins éprouvé). |
| ☐ G3 | Transférer plusieurs messages d'un coup (sélection multiple). | Tous arrivent, dans l'ordre. |

### H. Suppression (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ H1 | « Supprimer pour moi » un message de l'autre. | Disparaît chez toi seulement. |
| ☐ H2 | « Supprimer pour tout le monde » un message **que tu viens d'envoyer** (moins de 15 minutes). | Chez les deux : « Ce message a été supprimé. » (sans recharger). Pour une photo : plus de photo visible. |
| ☐ H3 | **Optionnel (attendre 16 minutes)** : retenter « Supprimer pour tout le monde » sur un ancien message. | Option absente ou refusée (« délai dépassé »). Le délai est contrôlé par le serveur. |
| ☐ H4 | Essaie de supprimer pour tous un message de **l'autre**. | Impossible (seul l'auteur peut). |

### I. Signalement (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ I1 | Menu du message › « Signaler ce message » (motif au choix, ex. « Autre »). | Confirmation affichée. |
| ☐ I2 | Options de la conversation › « Signaler [prénom] », motif **Autre**. | Confirmation affichée. |
| ☐ I3 | *(Optionnel, une fois)* Même chose avec **« Mineur suspecté »**. | Confirmation (le correctif de production permet maintenant ce motif). Puis **clos-le** : Administration › Signalements › le signalement en tête › **Rejeter**. |
| ☐ I4 | Dans Administration › Signalements (compte modérateur/admin) : retrouve ces signalements. | Ils s'affichent avec le statut « En attente » ; essaie « Prendre en charge » puis « Libérer », puis clos-les. |

### J. Blocage / déblocage (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ J1 | 1 : Options de la conversation › **Bloquer** [2] › confirme. | Confirmation. |
| ☐ J2 | 2 essaie d'écrire, réagir, envoyer une photo à 1. | **Refusé** avec un message de permission ; rien n'arrive chez 1. (2 peut encore relire l'historique : choix assumé.) |
| ☐ J3 | 2 essaie de commenter / aimer une publication de 1 dans le fil. | Refusé (cas couvert depuis le 5 novembre). |
| ☐ J4 | 1 **débloque** 2. | 2 peut de nouveau écrire ; le message arrive chez 1. |

### K. Robustesse et mobile (5 min)
| ☐ | Action | Attendu |
|---|---|---|
| ☐ K1 | Sur téléphone : ouvre le clavier dans la conversation. | La barre de saisie **reste visible** au-dessus du clavier (iPhone Safari et Android Chrome). |
| ☐ K2 | Tourne le téléphone, retourne. | Pas de débordement horizontal, mise en page correcte. |
| ☐ K3 | Recharge la page en pleine conversation. | La conversation et sa position se retrouvent, aucun doublon. |
| ☐ K4 | Connexion lente (mode économie de données ou Wi-Fi faible) : envoie une photo. | Indicateur d'envoi, puis succès ou erreur claire avec possibilité de renvoyer. |

## 4. À NE PAS faire avec de vrais comptes
- Un test de **mots interdits répété** (ladder de sanctions réelle).
- Plus de 30 messages d'affilée.
- Créer un compte de test : **inutile** ici et à éviter (on garde la base propre).
- Se connecter à un compte banni/suspendu « pour voir » : le bannissement refuse maintenant la connexion ; ce test se fait sur la répétition (déjà fait).

## 5. Après le test (10 min)
☐ Supprime pour toi les messages/photos de test que tu ne veux pas garder (« Supprimer pour moi » ; « pour tout le monde » dans les 15 minutes).
☐ Clos tous les signalements de test dans Administration › Signalements.
☐ Débloque le compte si le blocage est resté en place.
☐ **Envoie-moi** : la date et l'heure de début/fin du test, le prénom des deux comptes, les modèles de téléphone/navigateurs, et la liste des étapes en ✘ avec captures. Je ferai alors, **en lecture seule**, les recoupements côté serveur : journaux d'erreurs Postgres et API sur la fenêtre du test (erreurs 4xx/5xx, violations de politique), comptage des messages par type, présence des fichiers de la messagerie, signalements et blocages créés — sans rien écrire.

## 6. Comment noter un écart
Pour chaque ✘ : **l'étape** (ex. D6), **l'appareil et le navigateur** (ex. iPhone 13, Safari 17), **l'heure à la minute**, **le message d'erreur exact** à l'écran, **une capture d'écran**. Si le texte d'erreur contient « permission », « RLS » ou « violates », ne le cherche pas : copie-le tel quel, l'heure suffit pour retrouver la ligne dans les journaux.

## 7. Critères : quand peut-on dire que la messagerie est bonne en production ?
- **Bloquant** (à corriger avant le lancement) : un message ou un média arrive chez la mauvaise personne ; un message envoyé n'arrive jamais ou arrive en double ; un vocal ne se lit sur aucun appareil ; la barre de saisie est masquée par le clavier ; le blocage n'empêche pas d'écrire ; « supprimer pour tout le monde » laisse le contenu visible.
- **À corriger bientôt** : un format audio illisible sur un modèle précis ; un transfert de média qui échoue ; un indicateur (« écrit… », « lu ») qui ne s'actualise pas ; une forme de cadrage de photo disgracieuse.
- **Acceptable** : relecture de l'historique par la personne bloquée ; l'expéditeur peut marquer « lu » son propre message (sans effet).

## 8. Ce que ce test ne couvre pas
Notifications push (application native et PWA), réinitialisation de mot de passe par e-mail, paiement/Premium, charge (beaucoup d'utilisateurs en même temps), appareils très anciens, connexion Capacitor native (voir `MOBILE.md`). Les essais déjà faits sur la répétition (RLS, Realtime, stockage, droits anonymes, limites de débit) sont dans `RAPPORT-MESSAGERIE.md` §11 et §12 et dans `AUDIT-COMPLET-2026-11.md`.
