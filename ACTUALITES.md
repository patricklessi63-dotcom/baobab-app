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
- Audience (public / abonnés / communauté) par publication ; fil intelligent (algorithme) ; filtres Tout / Abonnements / Communautés / Populaires / Photos et vidéos.
- Likes sur les commentaires ; partage d'une publication (message, lien) ; section « Actualités » du profil.
- Notifications groupées (« 3 personnes ont réagi ») et préférences par type de réaction.
- Mentions : seules les personnes **choisies dans la liste** sont notifiées (5 au plus) ; la recherche cherche par début de nom.
