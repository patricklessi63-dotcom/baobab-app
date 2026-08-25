# Tableau de bord — Écart à la vision Baobab 3.0

Tableau vivant, mis à jour à chaque item traité (voir `prompt-amelioration-baobab-3.0.md`). Basé sur une lecture réelle du code + les dizaines de correctifs déjà livrés cette session — pas une impression générale. Les items marqués « à vérifier » n'ont pas encore été confirmés par un test manuel en conditions réelles.

## Tableau d'écart

| # | Critère | État actuel constaté | Statut | Écart précis à combler |
|---|---|---|---|---|
| 1 | Aucun bug, aucune incohérence | Processus d'audit récurrent actif et continu (ce soir : ~10 bugs réels trouvés et corrigés — reply perdu, race conditions messagerie, fuite mémoire stories, focus clavier). Report/Bloquer désormais unifié sur profil, conversation, événement, communauté. | **Partiel** (par nature — standard à maintenir, jamais « fini ») | Continuer l'audit module par module ; pas d'incohérence transverse connue non traitée actuellement. |
| 2 | Identité visuelle et palette fonctionnelle | Or/noir en image de marque, mode clair/sombre présents et récemment corrigés (contrastes). Aucun audit WCAG AA formel n'a été fait, pas de séparation formalisée accent vs couleurs sémantiques. | **Partiel** | Audit de contraste systématique + palette fonctionnelle dédiée. **Chantier global** → hors périmètre de ce soir (règle du prompt : passage par un environnement de test avant déploiement). |
| 3 | Navigation et disposition des onglets | 6 onglets actuels (Accueil, Rencontres, Messages, Communautés, Événements, Profil) — dépasse le maximum recommandé de 4-5. Intégration n'est pas un onglet de premier niveau (sous-vue accessible depuis le Fil). Badges déjà bien ciblés (uniquement messages/communautés/événements non lus). | **Partiel / à construire** | Repenser la hiérarchie à 4-5 onglets avec Intégration promue. **Chantier global à part** → hors périmètre de ce soir. |
| 4 | Disposition des images et publications | Grille de post à un seul média (pas encore multi-photo/vidéo comme la maquette de composer le prévoit). Lecture vidéo déjà corrigée (`preload="metadata"`, plus d'écran noir figé). | **Partiel** | Composer + affichage multi-média (plan déjà écrit, jamais exécuté — voir plan en attente). Chantier de taille moyenne, éligible à ce soir si le temps le permet. |
| 5 | Expérience de matching | Double opt-in (like mutuel) ✓. Signalement/blocage désormais accessibles depuis plus de surfaces ✓. **À vérifier** : un profil signalé est-il vraiment exclu des suggestions futures ? Aucun flux séparé par type de lien (amitié/mentorat/pro/amoureux) — un seul flux généraliste. Suggestions expliquées : à vérifier dans DiscoverTab/matchingService. | **Partiel** | 1) Vérifier/corriger l'exclusion immédiate d'un profil signalé (sécurité — priorité haute si manquant). 2) Types de lien multiples : absent, chantier important non commencé. |
| 6 | Expérience de messagerie | Accusés de lecture ✓ (avec réglage de confidentialité), indicateur de saisie ✓, médias (photo/vidéo/vocal) ✓, réponse ciblée ✓ (bug de perte corrigé ce soir), réactions ✓, nudges anti-arnaque déjà implémentés (`moneyGuard.js` — argent, documents d'immigration, parrainage, incitation à quitter la plateforme). Dégradation connexion instable : messages en échec relancés automatiquement à la reconnexion ✓. Traduction automatique intégrée : absente. Recherche dans l'historique : à vérifier. | **Partiel** | Traduction à la demande (chantier IA, dépend d'une clé API actuellement absente côté Supabase — voir item 10). Recherche dans l'historique à vérifier/construire si absente. |
| 7 | Questions à la création de compte | Parcours en étapes déjà en place (`OnboardingWizard` + steps), vérification d'âge ≥18 appliquée. Justification champ-par-champ (pourquoi chaque question sert le matching/Intégration/sécurité) non auditée en détail ce soir. | **À vérifier** | Relire chaque étape d'onboarding contre le critère « chaque question se justifie par un usage concret en aval ». |
| 8 | Sécurité toujours accessible | Signalement/blocage désormais présents sur profil public, conversation, participants d'événement, membres de communauté. Nudges anti-arnaque actifs en messagerie. Règle « 2 gestes max depuis n'importe quel écran » non vérifiée formellement partout (ex. depuis le Fil, depuis une Story). | **Partiel** | Vérifier/compléter l'accès sécurité depuis les surfaces restantes (Fil, Stories) ; transparence de la visibilité du profil à documenter. |
| 9 | Interaction légère entre utilisateurs | Réactions rapides sur publications ✓ (fil + communautés, alignées ce soir). Commentaires sur événements : à vérifier. « X personnes participent, dont Y dans votre réseau » : absent (fonctionnalité de réseau mutuel non construite). | **Partiel** | Présence sociale sur les événements (compteur + recoupement réseau) : chantier non commencé. |
| 10 | Moments d'intelligence perçue | `AiConversationSuggestions.jsx`/`AiSuggestButton.jsx` existent dans le code mais la fonction Supabase `ai-assist` n'est pas déployée (clé `ANTHROPIC_API_KEY` manquante côté Supabase — hors de portée de cette session, accès dashboard requis). Recherche actuelle = correspondance textuelle (`ilike`), ne comprend pas l'intention. Rappels contextuels du module Intégration : module encore embryonnaire (une seule vue d'actualités). | **Bloqué / à construire** | L'IA conversationnelle attend une clé API que seul l'utilisateur peut ajouter dans le dashboard Supabase. Recherche sémantique et rappels contextuels : chantiers non commencés. |

## Plan d'exécution priorisé (selon la logique du prompt)

**1. Sécurité/incohérences (priorité absolue) :**
- Vérifier et, si nécessaire, corriger l'exclusion immédiate d'un profil signalé des suggestions de matching futures (item 5).
- Vérifier l'accès sécurité « 2 gestes max » depuis le Fil et les Stories (item 8).

**2. Gains rapides sur les « Partiel » :**
- Recherche dans l'historique de conversation si absente (item 6).
- Commentaires sur événements + compteur de présence simple (item 9, sans le recoupement réseau qui est plus lourd).

**3. Constructions plus longues (ordre de dépendance) :**
- Composer/affichage multi-média (item 4) — plan déjà écrit, prêt à exécuter.
- Types de lien multiples en matching (item 5) — chantier important, à planifier séparément vu son impact sur le schéma et l'UX de Découverte.

**4. Hors périmètre de ce soir, chantiers à part avec revue dédiée :**
- Refonte de palette fonctionnelle (item 2).
- Refonte de navigation (item 3).
- IA conversationnelle (item 10) — bloqué sur une clé API que seul l'utilisateur peut fournir.

---
*Table initialisée le 2026-08-25. À remettre à jour à chaque item traité (statut + date).*
