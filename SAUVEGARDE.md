# Sauvegarde et restauration de Baobab (gratuit)

État au 4 novembre 2026 : l'offre Supabase gratuite ne fournit **aucune sauvegarde restaurable** (`pitr_enabled=false`,
aucune sauvegarde quotidienne). Tant que cette procédure n'a pas été exécutée **et** qu'une restauration n'a pas été
essayée une fois, le critère GO O1 de `PLAN-LANCEMENT-15-NOV.md` reste **non rempli**. Ce document ne le déclare pas rempli.

Principe : une sauvegarde est faite **depuis votre ordinateur**, chiffrée, et gardée **hors du dépôt Git**. Rien n'est
envoyé à un service tiers, rien n'est payant. Les commandes ne modifient jamais la base (`pg_dump` lit seulement).

## 1. Données critiques

| Priorité | Données | Où | Remarque |
| --- | --- | --- | --- |
| 1 | Comptes de connexion | `auth.users`, `auth.identities` | Sans eux, personne ne peut se reconnecter. Contiennent des **mots de passe hachés** : traiter comme secret. |
| 1 | Profils, relations, blocages | `public.profiles`, `likes`, `follows`, `blocks`, `passes`, `favorites` | Cœur de l'application. |
| 1 | Messages | `public.messages` (+ réactions) | Données privées. |
| 2 | Communautés, événements, publications, commentaires, statuts | tables `public.*` correspondantes | |
| 2 | Signalements et sanctions | `public.reports`, tables d'administration | Preuve en cas de litige. |
| 2 | Fichiers (photos, vocaux, images de messages) | Storage : buckets `avatars`, médias de messages, publications | **Pas inclus** dans `pg_dump` : voir §4. |
| 3 | Structure (tables, politiques de sécurité, fonctions) | schéma `public` | Déjà rejouable depuis les `supabase-*.sql` du dépôt (`LANCEMENT.md` §5), mais le dump la contient aussi. |

**À ne jamais mettre dans une sauvegarde ni dans le dépôt** : clés `service_role`, secrets Stripe, clés des fonctions Edge,
mot de passe de la base, Vault. Ce procédé ne les lit pas.

## 2. Fréquence recommandée

- **Avant tout SQL de production** (ajout d'une table, d'une politique, d'une fonction) : une sauvegarde juste avant.
- **Chaque semaine** jusqu'au lancement ; **chaque jour** à partir du lancement officiel (15 décembre 2026) tant que l'offre reste gratuite.
- **Conservation** : les 7 dernières quotidiennes + 4 hebdomadaires ; supprimer le reste.
- Passer à une offre avec sauvegardes quotidiennes ou au PITR reste la vraie solution dès que des utilisateurs réels écrivent des messages (réglage payant : décision du propriétaire).

## 3. Faire une sauvegarde (≈ 10 minutes, depuis votre ordinateur)

Prérequis (gratuits) : le client PostgreSQL 17 (`pg_dump`, `pg_restore`, `psql`) et `openssl` (déjà présent avec Git for Windows).
Chaîne de connexion : Supabase > **Connect** > **Session pooler** (elle contient le mot de passe de la base ; ne la collez ni dans un fichier du
dépôt ni dans un message).

```bash
# Dossier de sauvegarde HORS du dépôt, par exemple :
D="$HOME/Sauvegardes-Baobab/$(date +%Y-%m-%d)" && mkdir -p "$D"
export DB='postgresql://...'   # chaîne Session pooler (à taper dans votre terminal uniquement)

# 1. Structure + données de l'application
pg_dump "$DB" --schema=public --no-owner --no-privileges --format=custom --file="$D/public.dump"
# 2. Comptes (pour la reconnexion après restauration)
pg_dump "$DB" --data-only --no-owner --no-privileges --table=auth.users --table=auth.identities --format=custom --file="$D/auth.dump"
# 3. Manifeste NON secret : nombre de lignes par table + contrôles d'intégrité (lecture seule)
psql "$DB" -At -F ',' -f scripts/backup-verify.sql > "$D/manifest-counts.csv"
# 4. L'archive doit être relisible
pg_restore --list "$D/public.dump" > /dev/null && pg_restore --list "$D/auth.dump" > /dev/null && echo "archives lisibles"
# 5. Chiffrer (AES-256) puis supprimer les fichiers en clair — la phrase de passe vous est demandée
for f in public.dump auth.dump; do openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -in "$D/$f" -out "$D/$f.enc" && rm -f "$D/$f"; done
(cd "$D" && sha256sum public.dump.enc auth.dump.enc manifest-counts.csv > SHA256SUMS)
unset DB
```

- **Phrase de passe** : longue, aléatoire, enregistrée dans votre gestionnaire de mots de passe. **Sans elle, la sauvegarde est illisible.**
- Garder au moins **deux copies** (ordinateur + disque externe ou stockage personnel chiffré), jamais dans le dépôt Git.
- Le fichier `manifest-counts.csv` ne contient que des noms de tables et des nombres : sans risque pour la vie privée.

## 4. Fichiers du Storage (photos, vocaux, médias)

`pg_dump` ne contient **que la base**. Les fichiers (buckets) se copient séparément :
Supabase > **Storage** > bucket > téléchargement, ou avec le CLI Supabase connecté à votre compte :
`supabase storage cp -r ss:///avatars ./Sauvegardes-Baobab/<date>/storage/avatars --experimental`.
Les bases de photos de profil (`avatars`) et les médias de messages sont à copier **après** chaque sauvegarde de base.
Ce sont des données personnelles : les garder chiffrées (archive `.zip` avec mot de passe, ou dossier chiffré), hors dépôt.

## 5. Restaurer (essai à faire UNE FOIS, sur un projet de répétition, jamais d'abord en production)

1. Créer un projet Supabase vide (ex. `baobab-restauration`) — **ne jamais restaurer sur la production pour essayer**.
2. Déchiffrer :
   `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in public.dump.enc -out public.dump` (idem `auth.dump`) ; vérifier d'abord `sha256sum -c SHA256SUMS`.
3. Restaurer le schéma `public` puis les comptes :
   ```bash
   pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$DB_CIBLE" public.dump
   pg_restore --data-only --no-owner --dbname="$DB_CIBLE" auth.dump
   ```
   Les erreurs « already exists » sur des objets que Supabase crée lui-même (extensions, rôles) sont normales ; toute autre erreur est à noter.
4. **Vérifier l'intégrité** : rejouer `psql "$DB_CIBLE" -At -F ',' -f scripts/backup-verify.sql > restauré.csv`, puis comparer :
   `diff <(grep '^count' manifest-counts.csv) <(grep '^count' restauré.csv)` — **aucune différence attendue** ; et aucune ligne
   `fk_non_valide` ni `rls_desactivee` dans `restauré.csv`.
5. Se connecter avec un compte de test sur le projet restauré, ouvrir une conversation : les messages doivent apparaître.
6. Noter la **durée totale** de l'essai : c'est le « temps de retour » à indiquer au critère GO O1.

Restaurer en production après un incident : mêmes étapes, en mettant d'abord l'application en maintenance, puis en restaurant
sur le projet réel ou, plus prudent, sur un **nouveau** projet dont on remplace ensuite les clés dans Vercel.

## 6. Ce qui n'est pas couvert

- Aucune automatisation n'est livrée : la sauvegarde est **manuelle** (un export automatique des comptes et des messages vers un service
  tiers a été volontairement écarté par prudence : à décider par le propriétaire, avec un stockage chiffré dont il détient la phrase de passe).
- Les points de retour entre deux sauvegardes ne sont pas récupérables (pas de PITR).
- Les fichiers du Storage sont à copier à la main (§4).
- Cette procédure n'a **pas été exécutée par l'assistant** (aucun accès à la base ni à la chaîne de connexion) : le contenu des commandes
  est à valider par un premier essai réel, dont le résultat sera à consigner ici.
