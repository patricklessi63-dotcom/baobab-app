# Modération de Baobab — texte, sanctions, images (100 % gratuit)

Livré le 4 novembre 2026. **Rien de ce qui touche la base de production n'est exécuté** : le serveur
attend `supabase-moderation-text.sql` (SQL-27). D'ici là, l'application fait déjà le contrôle côté
navigateur avec la liste de départ du dépôt.

## 1. Ce qui existait déjà (réutilisé, rien de supprimé)

| Élément | Où | Rôle |
|---|---|---|
| Signalement de profils, publications, communautés, événements | `ReportModal.jsx`, tables `reports`, `post_reports`, `community_reports`, `event_reports` | Signalement manuel |
| Blocage | `BlockConfirmModal`, table `blocks`, gardes RLS | Masque et empêche d'écrire |
| Suspension / bannissement manuels | `suspend_user`, `ban_user`, colonnes `profiles.suspended_until` / `banned_at` / `suspend_reason` / `ban_reason`, `admin_actions` (`supabase-admin.sql`) | Sanctions décidées par un modérateur |
| Rôles | `platform_roles`, `is_moderator_or_above()`, `is_admin_or_above()` | Droits des modérateurs |
| Tableau de bord | `src/components/admin/AdminDashboard.jsx` | Utilisateurs, signalements, retours |
| Refus lisible côté app | `friendlyDbError.js` (erreur `P0001`) | Affiche le motif d'un refus serveur |

**Il n'existait aucun filtre de texte ni aucune analyse d'image** (`STORES.md` §2.3).

## 2. Ce qui est construit

### Filtre de texte (français et anglais)
- `src/lib/contentModeration.js` : normalisation (minuscules, accents, homoglyphes cyrilliques/grecs,
  pleine chasse, caractères invisibles, `0 1 3 4 5 7 @ $ € +`, ponctuation, répétitions, lettres
  isolées recollées) puis recherche de **mots entiers** (pluriels `s`, `es`, `x` compris).
  Exemples reconnus : `connard`, `conn@rd`, `c0nnard`, `c.o.n.n.a.r.d`, `c o n n a r d`, `f.d.p`, `m3rde`.
  Le texte d'origine n'est jamais modifié.
- Deux gravités : **`block`** (refusé) et **`review`** (mot ambigu : accepté, placé en file de relecture).
- **Exceptions** configurables (ex. « pas con »).
- `src/lib/contentGate.js` : `screenText()` appelé avant l'envoi d'un **message privé, d'une publication,
  d'un commentaire (fil, communauté, événement), d'une publication de communauté, d'un statut et d'une
  biographie**. Refus : « Ce message contient des propos non autorisés. »
- `src/config/moderationTerms.seed.json` : liste de **départ** (101 termes, 5 catégories : insulte, racisme,
  homophobie, menace, harcèlement). Une fois SQL-27 exécuté, la liste vivante est la table
  `moderation_terms`, que les administrateurs modifient sans toucher au code ; l'application la charge au
  premier envoi et garde la liste de départ si la table est illisible.

### Serveur (`supabase-moderation-text.sql`)
- `moderation_normalize()` / `moderation_check()` : **miroir exact** du JS (le test
  `contentModeration.sqlMirror.test.js` échoue si les deux divergent).
- **Déclencheurs « filet »** sur `messages`, `posts`, `post_comments`, `community_posts`,
  `community_comments`, `event_comments`, `stories`, `profiles.bio` : refusent côté serveur même si
  l'application est contournée. **Échec ouvert** : une panne interne du filtre laisse passer le texte.
- **Sanctions progressives** (`moderation_settings.steps`, modifiable) : 1re infraction avertissement,
  2e suspension 24 h, 3e suspension 7 jours, 4e bannissement. Décompte sur une fenêtre configurable
  (30 jours par défaut). Une infraction ne produit jamais deux sanctions ; le même texte renvoyé dans
  les 10 minutes n'est pas une nouvelle infraction ; l'équipe de la plateforme n'est jamais sanctionnée
  automatiquement ; seules les détections **certaines** (`block`) comptent.
- Historique : `moderation_violations`, `moderation_sanctions`, `moderation_decisions`.
- Modérateurs : annuler une sanction, approuver ou confirmer un texte « à relire », décider d'un appel.
  Utilisateur : contester une sanction (`moderation_appeal`, une seule fois par sanction).
- Administrateurs : ajouter / modifier / retirer des termes et des exceptions, régler les seuils et
  l'interrupteur général (`admin_*`).

### Images, sans service payant
- **Aucune détection automatique de nudité ou de violence** : ce serait faux de le prétendre sans moteur
  d'analyse.
- `report_media()` : un signalement par personne et par image (contrainte unique), 10 signalements par
  heure au plus par personne, **masquage temporaire à 3 signalements indépendants** (réglable), sauf si
  la majorité des signalants ont moins de 2 jours d'ancienneté (campagne possible : l'image reste visible
  et attend un humain).
- File des images masquées ou suspectes (`admin_media_queue`), décisions `moderate_media` :
  rétablir (verrouille contre un nouveau masquage automatique), masquer, retirer. **« Retirer » ne
  supprime aucun fichier** : seul un humain décide ensuite de l'effacer.
- `media_moderation.provider` et `scores` sont réservés à une analyse automatique future ; aucun
  fournisseur n'est actif (`moderation_settings.image_provider` reste vide).

## 3. Installation

1. **Répétition d'abord** (`LANCEMENT.md` §9.7) : exécuter `supabase-moderation-text.sql` sur le projet de
   répétition. Le fichier est **entièrement ASCII** (aucun émoji ni caractère spécial en clair) : il se
   colle sans risque d'altération. (Le piège qui a bloqué les réactions aux statuts : voir SQL-26.)
2. Vérifier (requêtes en bas du fichier) :
   `select * from moderation_check('c.o.n.n.a.r.d');` → `blocked = true` ;
   `select * from moderation_check('Un concert a Montreal');` → tout à `false` ;
   `select count(*) from moderation_terms;` → 101 ; 10 déclencheurs `trg_moderation_%` (8 contrôles de texte + 2 normalisations de la liste).
3. Essayer avec deux comptes de test : un message insultant doit être refusé, trois refus rapprochés
   doivent suspendre le compte (échelle), un modérateur doit pouvoir annuler la sanction.
4. Puis production, même fichier, une seule exécution (il est rejouable : `if not exists`,
   `on conflict do nothing`, `create or replace`).
5. Si la liste de départ change : `node scripts/gen-moderation-seed.mjs` puis relancer les tests.

Aucune variable d'environnement, aucune clé, aucun abonnement : `.env.example` n'a pas à changer.

## 3 bis. Ce qui a été validé, et ce qui ne l'est pas

- **Validé automatiquement** sur un vrai moteur PostgreSQL embarqué (PGlite, schéma factice, `src/native/moderationText.test.js`, 80 tests) : le fichier s'exécute en entier et se rejoue ; la normalisation et la détection SQL donnent **le même résultat que le JS** sur un corpus de 48 textes ; les 8 déclencheurs refusent ; l'échec ouvert ; l'échelle de sanctions (avertissement, 24 h, 7 jours, palier 4) ; un texte renvoyé n'est pas une nouvelle infraction ; annulation, appel, relecture ; termes réservés aux administrateurs ; signalements d'images (doublon, seuil, comptes neufs, limite horaire, rétablissement verrouillé).
- **Un défaut réel trouvé et corrigé par ces tests** : pour une personne sans rôle, `is_moderator_or_above()` renvoie NULL et non faux ; `if not NULL` ne lève aucune erreur, donc n'importe qui aurait pu appeler les fonctions de modération. Elles utilisent maintenant `coalesce(..., false)`.
- **Non validé** : la RLS réelle de Supabase, les droits d'exécution (`revoke` / `grant` par rôle) et le comportement sur vos vraies tables. D'où la répétition obligatoire avant la production.

## 4. Retour arrière

- **Immédiat, sans perte** : `update moderation_settings set text_filter_enabled = false where id = 1;`
  (plus aucun refus, plus aucune sanction automatique).
- Détail et suppression complète : `supabase-moderation-text-rollback.sql`.

## 5. Ajouter plus tard une analyse automatique d'images

Quand un budget existe : choisir un fournisseur (Google Cloud Vision SafeSearch, AWS Rekognition,
Sightengine…), créer une **fonction serveur** (Edge Function) qui reçoit l'adresse de l'image à
l'envoi, appelle le fournisseur avec une clé stockée dans les secrets Supabase (jamais dans le
navigateur), écrit `media_moderation.provider` / `scores`, puis applique la règle : explicite → refus,
violent → `hidden` avec avertissement, incertain → file humaine, erreur du fournisseur → politique
configurable (ne jamais considérer l'image comme sûre). Les tables sont déjà prêtes ; il reste
ce service et son interrupteur (`image_provider`). Rien de cela n'est actif aujourd'hui.

## 6. Limites connues

- **Un refus serveur annule l'insertion, donc l'infraction n'est pas comptée** (une transaction
  annulée ne garde rien). Les sanctions reposent sur l'appel `moderation_screen()` que fait
  l'application quand elle détecte un texte. Quelqu'un qui contourne l'application voit ses textes
  refusés par le serveur mais n'est pas sanctionné.
- Lettres espacées sur **plusieurs mots d'une expression** (« f u c k   y o u ») : non reconnues.
- Une liste ne comprend ni le contexte ni l'ironie ; les mots ambigus (`con`, `idiot`) sont mis en
  relecture plutôt que refusés. Des faux positifs et des contournements restent possibles : il faut
  suivre la file de relecture et ajuster la liste.
- La liste de termes est lisible par les comptes connectés (l'application en a besoin pour refuser avant
  l'envoi). Quelqu'un de motivé peut la lire pour la contourner ; le serveur garde la version vivante.
- Le masquage d'une image est appliqué **à l'affichage** par l'application ; l'adresse du fichier reste
  accessible à qui la connaît (stockage public). Pas de blocage serveur de l'image elle-même.
- L'âge réel d'une personne sur une photo ne peut pas être déterminé : « Mineur suspecté » reste un
  traitement humain prioritaire.
- Pas de notification automatique à la personne sanctionnée (elle voit l'effet : compte suspendu).

## 7. Décisions à valider

1. **Bannissement automatique** : désactivé par défaut (`auto_ban_enabled = false`) : le 4e palier devient une
   suspension de 30 jours à confirmer par un modérateur. À activer si vous acceptez qu'un faux positif
   répété puisse bannir.
2. **Gravité des mots ambigus** (`review` ou `block`) et contenu exact de la liste de départ.
3. **Interrupteur général** `text_filter_enabled` : activé dès l'exécution du SQL.
4. Seuil de masquage des images (3) et plafond de signalements par heure (10).
5. Création d'un faux compte par un utilisateur banni : aucune protection sans collecte de données
   supplémentaires (téléphone, appareil) : décision produit et juridique.

## 8. Interface (livrée)

- **Tableau de bord → onglet « Modération »** (`src/components/admin/ModerationPanel.jsx`) : textes à relire
  (approuver / confirmer l'infraction), sanctions (annuler), appels (accepter / refuser), images masquées ou
  suspectes (voir l'image, rétablir / masquer / retirer), et pour les administrateurs : interrupteur général,
  bannissement automatique, liste de termes (ajouter, désactiver, retirer). Recherche dans chaque liste, motif
  facultatif conservé dans le journal des décisions (vidé après chaque décision). Tant que SQL-27 n'est pas exécuté,
  l'écran affiche « pas encore installée sur le serveur ».
- **Signaler une image** : menu ⋮ d'un statut photo ou vidéo (« Signaler cette image ») et bouton « Signaler l'image »
  sous une publication du fil qui en contient (`ReportMediaDialog.jsx`). Motifs : sexuel, violence, haine,
  harcèlement, mineur, autre. Après 3 signalements indépendants, l'image est **masquée à l'affichage** pour les
  autres membres (« Image masquée en attendant l'examen d'un modérateur ») ; son auteur la voit toujours.
- **Pas encore branché** : le signalement d'image sur les publications de communauté, les photos d'événement,
  les photos de profil et les pièces jointes de messages (les fonctions serveur acceptent déjà ces types) ;
  l'écran de contestation côté personne sanctionnée (la fonction `moderation_appeal` existe, l'écran du compte
  suspendu ne la propose pas encore).
