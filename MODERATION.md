# Modération de Baobab — texte, sanctions, images (100 % gratuit)

Livré le 4 novembre 2026. **Rien de ce qui touche la base de production n'est exécuté** : le serveur
attend `supabase-moderation-text.sql` (SQL-31). D'ici là, l'application fait déjà le contrôle côté
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
  biographie**. Refus : « Ce contenu contient des propos non autorisés. »
- `src/config/moderationTerms.seed.json` : liste de **départ** (101 termes, 5 catégories : insulte, racisme,
  homophobie, menace, harcèlement). Une fois SQL-31 exécuté, la liste vivante est la table
  `moderation_terms`, que les administrateurs modifient sans toucher au code ; l'application la charge au
  premier envoi et garde la liste de départ si la table est illisible.

### Serveur (`supabase-moderation-text.sql`)
- `moderation_normalize()` / `moderation_check()` : **miroir exact** du JS (le test
  `contentModeration.sqlMirror.test.js` échoue si les deux divergent).
- **Déclencheurs « filet »** sur `messages`, `posts`, `post_comments`, `community_posts`,
  `community_comments`, `event_comments`, `stories`, `profiles.bio` : refusent côté serveur même si
  l'application est contournée. **Échec ouvert** : une panne interne du filtre laisse passer le texte.
- **Sanctions progressives** (réglages `moderation_settings`, modifiables par un administrateur) : **infractions 1 à 4 = avertissement** (contenu bloqué, infraction enregistrée, règle expliquée) ; **la 5e = suspension de 24 h** ; on **continue de compter** (6 à 9 avertissements, 10e = 2e suspension…) ; **la 3e suspension (15e infraction) = bannissement** (`auto_ban_enabled`, actif par défaut ; sinon suspension de 30 jours à confirmer par un modérateur). Décompte sur une fenêtre configurable (365 jours par défaut). Une infraction ne produit jamais deux sanctions ; le même texte renvoyé dans les 10 minutes n'est pas une nouvelle infraction ; l'équipe de la plateforme n'est jamais sanctionnée automatiquement ; seules les détections **certaines** (`block`) comptent : un signalement non vérifié ne sanctionne jamais.
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
   `select count(*) from moderation_terms;` → 101 ; 13 déclencheurs `trg_moderation_%` (11 contrôles de texte : 8 zones + nom, nom de famille, métier ; + 2 normalisations de la liste).
3. Essayer avec deux comptes de test : un message insultant doit être refusé ; avec les réglages par défaut, les 4 premières infractions sont des avertissements, la 5e suspend le compte 24 h (pour un essai court : `update moderation_settings set warnings_before_suspension = 1 where id = 1;`, puis remettre 4) ; un modérateur doit pouvoir annuler la sanction.
   **Base de répétition où l'ancienne version a déjà été jouée** : la ligne `moderation_settings` existante garde ses anciennes valeurs (fenêtre de 30 jours, bannissement automatique désactivé). Pour les aligner sur le cahier des charges : `update moderation_settings set window_days = 365, auto_ban_enabled = true where id = 1;`. La colonne `steps` de l'ancienne version devient inutilisée.
   **Déclencheur d'inscription** (`trg_modban_signup`, `trg_modban_email` sur `auth.users`) : vérifier sur la répétition qu'un compte de test banni ne peut plus se réinscrire, que la connexion d'un compte non banni n'est pas affectée, et que le message d'erreur côté application est acceptable.
4. Puis production, même fichier, une seule exécution (il est rejouable : `if not exists`,
   `on conflict do nothing`, `create or replace`).
5. Si la liste de départ change : `node scripts/gen-moderation-seed.mjs` puis relancer les tests.

Aucune variable d'environnement, aucune clé, aucun abonnement : `.env.example` n'a pas à changer.

## 3 bis. Ce qui a été validé, et ce qui ne l'est pas

- **Validé automatiquement** sur un vrai moteur PostgreSQL embarqué (PGlite, schéma factice, `src/native/moderationText.test.js`, 105 tests) : le fichier s'exécute en entier et se rejoue ; la normalisation et la détection SQL donnent **le même résultat que le JS** sur un corpus de 48 textes ; les 11 déclencheurs refusent (dont nom, nom de famille et métier du profil, à la création comme à la modification) ; l'échec ouvert ; l'échelle de sanctions du cahier des charges (4 avertissements, suspension de 24 h à la 5e infraction, bannissement à la 3e suspension, sur 15 infractions), les sessions révoquées, le registre d'adresses bannies, le journal non modifiable ; un texte renvoyé n'est pas une nouvelle infraction ; annulation, appel, relecture ; termes réservés aux administrateurs ; signalements d'images (doublon, seuil, comptes neufs, limite horaire, rétablissement verrouillé).
- **Un défaut réel trouvé et corrigé par ces tests** : pour une personne sans rôle, `is_moderator_or_above()` renvoie NULL et non faux ; `if not NULL` ne lève aucune erreur, donc n'importe qui aurait pu appeler les fonctions de modération. Elles utilisent maintenant `coalesce(..., false)`.
- **Non validé** (liste complète en §9) : la RLS réelle de Supabase, les droits d'exécution (`revoke` / `grant` par rôle) et le comportement sur vos vraies tables. D'où la répétition obligatoire avant la production.

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
- La personne sanctionnée voit l'explication à l'écran de son compte suspendu / banni, mais ne reçoit ni e-mail ni notification push.

## 6 bis. Vie privée et conservation (Loi 25) — relecture croisée du 4 novembre

- **Ce qui part vers le serveur** : quand l'application refuse ou signale un texte, elle appelle `moderation_screen` avec le
  texte, pour que le SERVEUR refasse la détection (il ne fait jamais confiance au client) et enregistre l'infraction. Aucun tiers :
  le serveur est celui de Baobab.
- **Ce qui est conservé** (`moderation_violations`) : l'auteur, la source, la catégorie, le terme détecté, une empreinte (MD5 du
  texte normalisé, pour ne pas compter deux fois le même texte), la date, et — **sauf pour les messages privés** — un extrait de
  **200 caractères au plus**. Jamais le texte complet.
- **Messages privés** : aucun extrait n'est conservé, et un message privé « ambigu » (mot à relire) n'entre **jamais** dans la file
  de relecture humaine : seul un refus certain est comptabilisé (terme + empreinte, sans texte). Les modérateurs ne lisent donc
  pas de conversations privées par ce canal ; elles ne leur parviennent que par un signalement de la personne concernée.
- **Qui y accède** : les modérateurs et administrateurs (policies de lecture réservées), l'historique de leurs décisions est journalisé.
- **Durée de conservation** : `moderation_purge_old(jours)` (administrateurs, 365 jours par défaut, minimum 30) supprime les
  infractions anciennes ; l'historique des sanctions est conservé. À lancer à la main chaque mois, ou planifier (extension
  pg_cron déjà utilisée par le projet) :
  `select cron.schedule('baobab-moderation-purge', '0 4 1 * *', $$select moderation_purge_old(365)$$);`
  (non exécuté ; durée à valider).
- **Brouillon de textes légaux** : `LEGAL-MODERATION-BROUILLON.md` (Conditions d'utilisation § 8, Politique de confidentialité §§ 2, 4, 5) décrit ce que le code fait réellement ; à faire valider, puis à publier en même temps que SQL-31.
- **À faire avant l'exécution en production** : mentionner ce traitement (finalité : sécurité de la communauté ; données ; durée ;
  accès) dans la politique de confidentialité — **texte à faire valider par le propriétaire / un juriste** ; non modifié ici.

## 6 ter. Cas limites assumés

- Un titre d'œuvre contenant un terme de la liste (ex. « Nègres blancs d'Amérique ») est refusé ; l'ajouter en **exception** si souhaité
  (onglet Modération → Réglages, ou `admin_upsert_moderation_exception`). Mais une exception retire l'expression du texte avant
  la recherche : « sale nègre blanc » ne serait alors plus refusé. À peser.
- Les usages affectueux (« salope » entre amies) sont refusés : le filtre ne comprend pas le contexte.
- Vérifié à la relecture : pas de faux positif « Scunthorpe » (Bitche, Cumberland, Dickinson, assistant, concert) ; auto-descriptions
  d'identité (« je suis gay », « femme noire, immigrante et lesbienne ») acceptées.

## 7. Décisions à valider

1. **Bannissement automatique** : **actif par défaut** (cahier des charges du 4 novembre : 3e suspension = bannissement). Garde-fous : seules les détections certaines comptent (15 au minimum), un modérateur peut annuler, la personne peut contester. Désactiver (`auto_ban_enabled = false`) transforme le bannissement en suspension de 30 jours à confirmer.
2. **Gravité des mots ambigus** (`review` ou `block`) et contenu exact de la liste de départ.
3. **Interrupteur général** `text_filter_enabled` : activé dès l'exécution du SQL.
4. Seuil de masquage des images (3) et plafond de signalements par heure (10).
5. Création d'un faux compte par un utilisateur banni : l'empreinte de l'e-mail est bloquée (voir §9). Aller plus loin (téléphone, appareil, IP) exige de collecter davantage de données : décision produit et juridique, et mise à jour de la politique de confidentialité.

## 8. Interface (livrée)

- **Tableau de bord → onglet « Modération »** (`src/components/admin/ModerationPanel.jsx`) : textes à relire
  (approuver / confirmer l'infraction), sanctions (annuler), appels (accepter / refuser), images masquées ou
  suspectes (voir l'image, rétablir / masquer / retirer), et pour les administrateurs : interrupteur général,
  bannissement automatique, liste de termes (ajouter, désactiver, retirer). Recherche dans chaque liste, motif
  facultatif conservé dans le journal des décisions (vidé après chaque décision). Tant que SQL-31 n'est pas exécuté,
  l'écran affiche « pas encore installée sur le serveur ».
- **Signaler une image** : menu ⋮ d'un statut photo ou vidéo (« Signaler cette image ») et bouton « Signaler l'image »
  sous une publication du fil qui en contient (`ReportMediaDialog.jsx`). Motifs : sexuel, violence, haine,
  harcèlement, mineur, autre. Après 3 signalements indépendants, l'image est **masquée à l'affichage** pour les
  autres membres (« Image masquée en attendant l'examen d'un modérateur ») ; son auteur la voit toujours.
- **Aussi branchés** : signalement d'image sur les publications de communauté (`CommunityPostCard`) et sur les photos de
  profil (`PublicProfileModal` : « Signaler cette photo », à l'unité quand l'identifiant de la photo est connu, sinon
  l'avatar) ; une photo masquée disparaît de la galerie. **Contestation** : l'écran « Compte suspendu / banni » propose
  « Contester cette décision » (`AppealPanel.jsx`) quand une sanction automatique existe ; une suspension décidée à la main
  par un modérateur n'a pas de ligne de sanction automatique et n'ouvre pas de contestation.
- **Explication de la sanction** (livrée) : l'écran « Compte suspendu / banni » (`AppealPanel.jsx`) affiche la règle enfreinte, le nombre d'infractions confirmées, la durée, le fonctionnement de l'échelle et un lien vers les règles de la communauté (`/conditions`), lus par `my_moderation_status()`. Si la fonction est absente, seul le formulaire de contestation reste.
- **Onglet « Règles »** (livré, `ModerationPanel.jsx`) : tester un texte (et un terme candidat pas encore actif) sans rien enregistrer ; suggestions de règles à valider (un modérateur propose, **seul un administrateur accepte ou rejette**, rien n'est appliqué automatiquement) ; précision par terme sur 90 jours (confirmées contre faux positifs, les termes sous 70 % ressortent).
- **Pas encore branché** : le signalement d'image sur les photos d'événement et les pièces jointes de messages (les fonctions
  serveur acceptent déjà ces types ; leurs fichiers sont privés, l'aperçu modérateur est alors indisponible).

## 9. Cahier des charges de modération (4 novembre 2026) : ce qui est fait, ce qui ne l'est pas

Tout est dans `supabase-moderation-text.sql` (toujours **NON exécuté en production**) ; rien n'a été activé.

| Exigence | État |
|---|---|
| Détection serveur avant transmission (haine, harcèlement, insultes, variantes, caractères insérés, substitutions, fautes volontaires, contexte via exceptions et gravité « à relire ») | **Fait** (FR/EN, liste configurable). Pas d'autres langues que FR/EN ; ne comprend pas l'ironie. |
| Échelle : 4 avertissements, 5e = suspension 24 h, 3e suspension = bannissement | **Fait** et testé (15 infractions de bout en bout). |
| Notification explicative à la personne sanctionnée | **Fait à l'écran** (règle, nombre, durée, échelle, lien, contestation). **Pas d'e-mail ni de notification push.** |
| Révocation des sessions au bannissement, connexion refusée | **Fait** (déclencheur sur `profiles.banned_at` : couvre aussi `ban_user` manuel ; sessions supprimées, jetons révoqués, `auth.users.banned_until` posé 100 ans puis levé au débannissement : la reconnexion par mot de passe est refusée). Un jeton d'accès déjà émis reste valable ~1 h : les policies RLS refusent le compte entre-temps. **À vérifier sur la répétition** (le schéma `auth` réel n'est pas dans les tests). |
| Empêcher la recréation d'un compte banni | **Partiel** : empreinte salée de l'e-mail normalisé (sans +alias, points Gmail retirés), déclencheur d'inscription sur `auth.users`. **Pas d'adresse IP stockée** (réseaux partagés, VPN, faux positifs). Un e-mail entièrement différent n'est pas détecté. Téléphone / appareil : non. Limitation de débit d'inscription : à régler dans le tableau de bord Supabase (Authentication, Rate Limits), hors SQL. |
| Le déclencheur sur `auth.users` | À poser avec un rôle autorisé : si l'instruction échoue, le fichier continue (message `NOTICE`) ; la reposer à part. L'erreur côté inscription est générique (« Database error saving new user »). |
| Journal d'audit non modifiable | **Fait** (ni UPDATE ni DELETE ; seule la mise à NULL par clé étrangère à la suppression d'un compte). Le propriétaire de la base peut toujours désactiver le déclencheur : le journal est protégé des utilisateurs, pas d'un administrateur de base. |
| Signalements (profil, publication, commentaire, image) | **Existant** (tables `reports`, `post_reports`…, `report_media`) ; le déclarant n'est jamais révélé à la personne signalée. **Statuts** : `supabase-report-statuses.sql` (livré, **NON exécuté**  ; élargit d'abord les contraintes CHECK de status des 4 tables community/event/post/info_reports, présentes en production) ajoute « en cours d'examen » et « confirmé » aux statuts existants (en attente = open, résolu, rejeté = dismissed) avec `admin_set_report_status`, transitions contrôlées (une infraction confirmée ne revient pas en arrière), verrou et contrôle « déjà traité ». Tableau de bord : badge de statut, boutons Prendre en charge / Libérer / Confirmer / Résolu / Rejeter, filtres par catégorie et par statut ; sans le SQL, les boutons intermédiaires disparaissent d'eux-mêmes. Testé sur PGlite avec `reports.id` bigint ET uuid. Prérequis : `supabase-admin-list-reports-hotfix.sql` (exécuté le 5 novembre). |
| Tableau de bord administrateur | **Fait** : textes à relire, sanctions, appels, images, termes, réglages, et onglet « Règles » (test d'un texte, suggestions à valider, précision par terme). |
| Modération adaptative | **Fait** (SQL + écran) : précision par terme (confirmées / annulées), suggestions (faux positif, faux négatif, nouvelle variante) **jamais appliquées sans décision d'un administrateur**, test d'un texte et d'un terme candidat sans effet. **Pas de détection automatique de variantes** : les suggestions sont proposées par des modérateurs. |
| Images pornographiques / mineurs : classification automatique | **NON fait.** Aucun moteur d'analyse n'est actif (voir §5) : cela exige un service tiers, une clé secrète côté serveur et un budget, donc une décision du propriétaire. Tant que ce n'est pas fait, seules les images **signalées** sont masquées (3 signalements) puis revues par un humain. |
| Conservation des preuves et accès restreint aux contenus signalés | **Partiel** : extraits de 200 caractères, aucun message privé conservé, purge manuelle. Les fichiers d'images restent dans un stockage public à l'adresse connue (voir §6). |

### Défaut trouvé à l'essai sur la répétition (corrigé)
Les `UPDATE profiles` de l'échelle (`moderation_apply_ladder`) et de l'annulation (`moderation_revoke_sanction`) ne posaient pas le drapeau `baobab.trust_column_write` attendu par `trg_protect_profile_trust_columns` : pour un compte connecté, les avertissements 1 à 4 passaient mais **la 5e infraction (suspension) et le bannissement échouaient**. Corrigé comme `suspend_user` / `ban_user`. Le harnais de test reproduit maintenant ce déclencheur (armé dans le bloc « échelle conforme ») : sans le drapeau, 4 tests échouent avec exactement l'erreur de la répétition.

### Écart dépôt / production sur les identifiants (corrigé avant exécution)
L'audit d'écart `scripts/schema-drift-audit.mjs` (export du catalogue de production contre les fichiers `supabase-*.sql`) montre que `profile_photos.id`, `blocks.id` et `reports.id` sont des **entiers (bigint) en production**, alors que le dépôt les déclare en uuid. Conséquence pour SQL-31 : le signalement, le masquage et l'aperçu d'une **photo de profil** auraient échoué (« invalid input syntax for type uuid »). `media_reports.target_id` et `media_moderation.target_id` sont donc de type **text**, et `report_media`, `moderate_media`, `admin_media_info` prennent `p_id text` (les ids de tables sont comparés en texte). Le fichier se rejoue sur une base où l'ancienne version (uuid) était installée : colonnes converties, anciennes signatures retirées. Test PGlite avec `profile_photos.id` en bigint.

### Tests
`src/native/moderationText.test.js` : PGlite (PostgreSQL embarqué), schéma factice incluant `auth.users` / `sessions` / `refresh_tokens`. Nouveaux cas : échelle 4/5/3 sur 15 infractions, sessions et jetons révoqués, registre sans adresse en clair, réinscription refusée (adresse et alias), levée du bannissement, bannissement manuel, panne du nettoyage sans blocage, journal non modifiable, suggestions (rien d'appliqué sans administrateur), précision, test sans effet, explication de la sanction. **Non couvert par ces tests** : la RLS réelle, les droits d'exécution par rôle, le vrai schéma `auth` : ils se vérifient sur la répétition (`scripts/staging-security.mjs`).

### Vérification après exécution en production
`scripts/verify-prod-sql31-and-statuses.sql` : requête en **lecture seule** (une ligne par contrôle, champ `ok`) à lancer après l'exécution de SQL-31 puis de `supabase-report-statuses.sql` : 11 tables avec RLS, 101 termes, réglages 4 / 24 h / 3 / 365 j, 11 déclencheurs de texte, déclencheur de bannissement sur profiles, **deux déclencheurs sur auth.users** (sans eux le bannissement durable de l'e-mail ne marche pas, en silence), journal non modifiable, ids d'images en text, droits (anon sans aucun droit d'exécution ; fonctions internes non exécutables), moteur de détection, contraintes CHECK élargies. Validée par `src/native/verifyProdScript.test.js` (tout à true sur une installation complète ; un élément retiré fait passer son contrôle à false).

## Exécution en production (5 novembre 2026)

SQL-31 exécuté avec l'accord explicite du propriétaire, **sans sauvegarde**, en dernier (après SQL-36, 32, 33, 35), après un instantané « avant » hors dépôt.
Contrôles en lecture seule : 101 termes et 4 exceptions ; réglages `text_filter_enabled` et `auto_ban_enabled` actifs, fenêtre 365 j ; 11 déclencheurs
`trg_moderation_*` (hors normalisation) dont 4 sur `profiles` (name, last_name, occupation, bio) ; `trg_modban_signup` et `trg_modban_email` présents sur `auth.users` ;
`moderation_private` : 1 ligne, sel présent ; `banned_identities` : 0 ; aucun accès anonyme aux 23 fonctions de modération ; `moderation_check` : « c.o.n.n.a.r.d » et « f.d.p »
refusés, « quel con » à relire, « Bonjour, bienvenue au Canada ! », « Un concert à Montréal » et « Je cherche un contact au Canada » acceptés.
**Interrupteur d'urgence** (sans rien supprimer) : `update moderation_settings set text_filter_enabled = false where id = 1;`
Retour arrière de l'inscription : `drop trigger trg_modban_signup on auth.users; drop trigger trg_modban_email on auth.users;`.
**À faire par le propriétaire juste après** : UNE connexion normale et UN message normal (je ne peux pas créer de compte en production).

**Recoupement indépendant (5 novembre, 17 h, lecture seule, requête `scripts/verify-prod-sql31-and-statuses.sql`)** : 13 contrôles sur 13 conformes pour SQL-31 sur la base de production — 11 tables avec RLS, 101 termes, réglages 4 / 24 h / 3 / 365 j (bannissement automatique et filtre actifs), 11 déclencheurs de texte, `trg_modban_change` sur profiles, `trg_modban_signup` + `trg_modban_email` sur auth.users, journal non modifiable, ids d'images en text, droits (anon : 0 ; fonctions internes non exécutables par authenticated), moteur de détection, messages (144) et profils (6) intacts. Les 2 contrôles « statuts de signalement » sont à faux : `supabase-report-statuses.sql` n'est PAS exécuté (attendu). **Texte légal** : le traitement est désormais actif en production ; `LEGAL-MODERATION-BROUILLON.md` reste à faire valider puis publier (Conditions § 8, Confidentialité §§ 2, 4, 5).

**Confirmation du propriétaire (5 novembre 2026, après l'exécution)** : une connexion normale et un message normal ont été faits et fonctionnent ; aucune régression constatée.

### Exécution en production du 5 novembre (suite)
Sur le message explicite du propriétaire (« exécute et pousse tout ce qu'il faut »), après annonce aux autres sessions et lecture seule AVANT, dans cet ordre, un fichier à la fois, sans sauvegarde (offre gratuite) :
1. `supabase-profile-report-minor-constraint-fix.sql` : `reports_category_check` accepte maintenant « mineur_suspecte » (contrainte validée) : le signalement « Mineur suspecté » d'un profil n'est plus refusé.
2. `supabase-report-statuses.sql` : les 4 contraintes `<table>_status_check` (community, event, post, info) acceptent les 5 statuts ; `admin_set_report_status` créée ; `admin_list_reports` et `admin_resolve_report` remplacées (une seule version de chacune, SECURITY DEFINER, exécutables par les comptes connectés et jamais par l'anonyme).
Vérification en lecture seule après : `scripts/verify-prod-sql31-and-statuses.sql` = 15 contrôles sur 15 conformes ; messages et profils intacts. **Non testé en production** : un clic réel sur « Prendre en charge » / « Confirmer » dans le tableau de bord et l'envoi réel d'un signalement « Mineur suspecté » (aucun compte de test ne doit être créé en production) : à faire par le propriétaire, un seul essai de chaque.
