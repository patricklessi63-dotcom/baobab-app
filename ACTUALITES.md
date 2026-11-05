# Fil « Actualités » de Baobab — réactions, réponses, mentions

Livré le 4 novembre 2026, par étapes. Les fichiers SQL sont **livrés, non exécutés** (numéros SQL-32 et SQL-33 ; SQL-27 à 30 sont
d'autres fichiers, déjà en production). Sans eux, le fil marche **exactement comme avant**.

## Ce qui est fait

| Fonction | Application | Base de données |
|---|---|---|
| Six réactions ❤️ 😂 😍 👏 🤝 😮, **une seule active** par personne, changer / retirer | `PostCard.jsx`, `PostsFeed.jsx`, `lib/postReactions.js` | SQL-32 `supabase-post-reactions.sql` : colonne `emoji` sur `post_likes`, policy UPDATE avec gardes (compte suspendu / banni / en suppression, blocage) |
| Résumé des réactions les plus utilisées + total | `PostCard.jsx` | — |
| Commentaires en **réponse** (un niveau), « Voir les N réponses », tri (plus anciens / récents / pertinents), pagination par 5 | `PostComments.jsx` | SQL-33 `supabase-post-threads-mentions.sql` : `post_comments.parent_id` |
| **Mentions @** avec suggestions (choisir la personne pour la notifier), surlignage et ouverture de la fiche | `MentionInput.jsx`, `MentionText.jsx`, `lib/mentions.js` | SQL-33 : `mentions` (jsonb, 5 au plus), validations |
| Notifications « t'a mentionné(e) » et « a répondu à ton commentaire » (aucune entre personnes qui se sont bloquées) | `notificationLabels.js`, menu des notifications, fil d'accueil | SQL-33 : types ajoutés à `notifications_type_check` sans recopier sa liste |
| **Filtres du fil** : Tout, Abonnements, Populaires (7 jours, réactions + 2 × commentaires), Photos et vidéos ; choix mémorisé ; fil d'un profil sans filtres | `PostsFeed.jsx`, `lib/feedFilters.js` | **Aucun SQL** (requêtes existantes : `follows`, `post_media`) |
| « J'aime » sur les **commentaires** (cœur + compteur), pertinence = 2 × réponses + j'aime, notification « a aimé ton commentaire » | `PostComments.jsx`, `PostsFeed.jsx` | SQL-35 `supabase-post-comment-likes.sql` : `post_comment_likes` (RLS, gardes), type `comment_liked` ajouté à la contrainte des notifications |
| Modération (insultes, signalement d'images) sur publications et commentaires | voir `MODERATION.md` | SQL-31 |

## Comportement tant que le SQL n'est pas exécuté

- **Réactions** : le cœur marche (comme un like) ; une autre réaction annonce « Les réactions multiples ne sont pas encore disponibles. » et revient en arrière.
- **Réponses / mentions** : le commentaire part **à plat** avec son « @Nom » dans le texte, sans notification.
- Aucun message d'erreur technique n'est montré.

## Validation

PGlite (Postgres embarqué, schéma factice, RLS appliquée pour SQL-32) : `src/native/postReactions.test.js` (8 tests),
`src/native/postThreads.test.js` (13 tests). Interface : `PostsFeed.reactions`, `PostComments`, `mentions`. **Non validé** : la RLS
et les droits réels de Supabase → répétition d'abord (`LANCEMENT.md` §9.7).

## Pas encore fait (brief « statuts »)

- Brouillons enregistrés côté serveur, programmation, publication de **liens** avec aperçu, vidéos : les photos et vidéos existent déjà.
- Modification et suppression : modification et suppression d'une publication existent déjà ; **historique des modifications** absent.
- Audience (public / abonnés / communauté) par publication ; fil « intelligent » personnalisé (les Populaires sont un classement simple de la semaine, calculé côté application sur les 60 plus récentes).
- Partage d'une publication (message, lien) : il n'existe pas de page par publication ; il faudrait d'abord en créer une (adresse, contrôle d'accès). Le fil d'un profil existe déjà (grille de publications).
- Filtre « Communautés » : les publications des communautés vivent dans l'onglet Communautés (autre table) ; elles n'entrent pas dans ce fil.
- Notifications groupées (« 3 personnes ont réagi ») et préférences par type de réaction.
- Mentions : seules les personnes **choisies dans la liste** sont notifiées (5 au plus) ; la recherche cherche par début de nom.

## À l'exécution de SQL-33 et SQL-35 en production (relecture croisée)

SQL-33 et SQL-35 **reconstruisent** `notifications_type_check` à partir de sa définition actuelle (ajout de types, aucune liste recopiée).
Avant de jouer : `select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_type_check';` — **garder le résultat hors
dépôt**. Après : la même requête doit montrer **tous** les types d'avant, plus `post_mention` et `comment_replied` (SQL-33), puis `comment_liked` (SQL-35).
SQL-33 relit aussi le **nom** de chaque mention depuis `profiles` : un client modifié ne peut pas faire passer « @Support » pour une autre personne.

## Prérequis de SQL-32 et SQL-35 : `is_blocked_pair()` (SQL-25)

Les gardes de blocage de SQL-32 (changer sa réaction) et SQL-35 (aimer un commentaire) utilisent `public.is_blocked_pair()` (SQL-25, **déjà exécuté en
production**) et non une sous-sélection directe sur `blocks` : la RLS de `blocks` ne montre à la personne bloquée aucune ligne la concernant, donc
une garde écrite avec `not exists (select … from blocks …)` la laisserait passer (défaut relevé à la relecture croisée du 5 novembre, couvert par
les tests PGlite qui modélisent cette RLS). Chaque fichier vérifie au début que la fonction existe et s'arrête avec un message clair sinon.
SQL-35 ne notifie en outre qu'**une fois par jour** pour un même commentaire et une même personne (aimer / retirer / aimer de nouveau ne fait pas de bruit).

### Correctif du 5 novembre (relecture de la session messagerie, essai de SQL-36 sur la répétition)

Passer une **sous-requête** à `is_blocked_pair()` ne couvre pas le sens « celui qui a bloqué » : la RLS de lecture de `posts` / `post_comments` cache le contenu
de la personne bloquée à celui qui l'a bloquée, la sous-requête renvoie NULL et la garde est fausse. SQL-32 et SQL-35 retrouvent donc l'auteur dans des fonctions
**SECURITY DEFINER** (`is_blocked_with_post_author`, `is_blocked_with_comment_author`), de même définition que celles de SQL-36 : `create or replace` identique, l'ordre
d'exécution des fichiers n'a pas d'importance. Les tests PGlite modélisent désormais la RLS de lecture (contenu caché à qui a un blocage dans un sens ou l'autre) et
couvrent « B a bloqué A, B réagit / aime sur le contenu de A → refusé ».

### Rejeu sur la répétition (session messagerie, 5 novembre) et suites

SQL-32, 33 et 35 rejoués dans cet ordre sur `baobab-staging` : 24/24, 18/18, 20/20, aucun type de notification perdu, fichiers rejouables. Suites appliquées :
- SQL-33 refuse maintenant la **réponse** entre deux personnes qui se sont bloquées (dans un sens ou l'autre) ; avant, la personne bloquée pouvait encore répondre au commentaire de celle qui l'avait bloquée.
- SQL-35 : la déduplication de la notification est **par publication et par jour** (la notification ne porte que l'id de la publication) ; le commentaire du fichier le dit maintenant.
- SQL-32/33/35 se terminent par `notify pgrst, 'reload schema'` : sans cela, un premier appel API peut échouer quelques secondes (« Could not find the 'emoji' column … in the schema cache »).
