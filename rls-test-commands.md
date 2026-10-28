# Test RLS — accès anonyme (sans compte, sans connexion)

Ces commandes utilisent uniquement la clé "anon" publique (déjà présente dans
le bundle client, donc pas un secret) — **aucun jeton utilisateur**. Elles
simulent ce que n'importe qui sur Internet peut faire sans se connecter.

À lancer dans un terminal (PowerShell ou Git Bash) :

```bash
curl "https://vozehymbihnckzklxesw.supabase.co/rest/v1/messages?select=*" \
  -H "apikey: sb_publishable_iruVElEyigL1moQz9iY5tw_C13Oop-o"

curl "https://vozehymbihnckzklxesw.supabase.co/rest/v1/likes?select=*" \
  -H "apikey: sb_publishable_iruVElEyigL1moQz9iY5tw_C13Oop-o"

curl "https://vozehymbihnckzklxesw.supabase.co/rest/v1/passes?select=*" \
  -H "apikey: sb_publishable_iruVElEyigL1moQz9iY5tw_C13Oop-o"
```

## Résultat attendu APRÈS avoir exécuté supabase-protect-rls.sql
Les trois doivent renvoyer `[]` (tableau vide) — aucune ligne, même s'il
existe des messages/likes/passes en base, puisque aucun utilisateur n'est
authentifié.

Si l'une des trois renvoie des lignes, le correctif SQL n'a pas été appliqué
ou une policy problématique existe encore ailleurs — collez-moi le résultat.

## Test complémentaire (optionnel, si vous voulez un test encore plus poussé)
Avec un deuxième compte de test, on pourrait aussi prouver qu'un utilisateur
connecté A ne peut lire QUE ses propres conversations (pas celles d'un match
entre deux autres comptes B et C). Dites-moi si vous voulez qu'on fasse ce
test-là aussi une fois un deuxième compte disponible.

## Sonde de comptage pour `profile_photos` (ajoutée le 20 oct. 2026)
Constat de l'audit : cette table répondait avec des lignes (11) à un visiteur sans compte. Cette commande ne lit AUCUN contenu : elle demande
seulement le nombre de lignes (`Prefer: count=exact`, `limit=0`) dans l'en-tête `content-range`.

```bash
curl -s -o /dev/null -D - -H "Prefer: count=exact"   "https://vozehymbihnckzklxesw.supabase.co/rest/v1/profile_photos?select=id&limit=0"   -H "apikey: sb_publishable_iruVElEyigL1moQz9iY5tw_C13Oop-o" | grep -i "^HTTP|content-range"
```

Avant `supabase-close-read-leaks.sql` (bloc 1) : `HTTP/2 200` et `content-range: */11`. Après : `HTTP/2 401` (permission refusée), aucune ligne.
Même principe pour les fonctions (voir `LANCEMENT.md`, fiche SQL-22) : `POST /rest/v1/rpc/admin_dashboard_stats` doit répondre 401/403 sans connexion.
Depuis le bloc 2, une table dont la politique appelle `current_profile_id()` peut répondre 401 à un anonyme au lieu de `[]` : les deux sont acceptables (aucune donnée).
