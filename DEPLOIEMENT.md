# Déploiement en attente — Baobab

Mise à jour 2026-09-15.

**FAIT :**
- ✅ `supabase-COMBINED-pending-fixes.sql` exécuté en prod (vérifié : RLS/RPC OK).
- ✅ `supabase-combined-supersede-order-regression-fix.sql` exécuté en prod.
- ✅ Icône PWA maskable ajoutée (`public/icon-512-maskable.png` + manifest).

**RESTE (3 déploiements d'edge functions — terminal, pas Supabase SQL Editor) :**
- ⬜ `cleanup-expired-stories` — voir §2b.
- ⬜ `stripe-webhook` — voir §2a (nécessite les clés Stripe).
- ⬜ `send-push` — voir §2c. **Re**-déploiement (la fonction est déjà en ligne)
  pour que le code gère les nouveaux types "like"/"follow" (voir §1c) — sans
  ça les nouveaux triggers SQL appelleront une fonction qui ignore
  silencieusement ces payloads.

**RESTE (SQL, écrit mais jamais exécuté — voir §1b, §1c et §1d) :**
- ⬜ `supabase-unaccent-search.sql` — recherche insensible aux accents
  (extension `unaccent` + index trigram) pour les communautés, événements et
  la recherche de profils à inviter. Additif et idempotent, mais livré
  sans branchement côté client (voir en-tête du fichier pour le pourquoi et
  la suite).
- ⬜ `supabase-push-notifications-triggers.sql` — **oubli corrigé le
  2026-09-15** : ce fichier existait déjà dans le dépôt mais n'était listé
  nulle part dans ce document et n'apparaît pas dans
  `supabase-COMBINED-pending-fixes.sql` — tout indique qu'il n'a jamais été
  exécuté en prod. Sans lui, aucune notification push ne part jamais (ni
  message, ni match, ni comme, ni abonnement), même si le client s'abonne
  correctement et que l'Edge Function `send-push` sait générer l'envoi :
  aucun trigger SQL ne l'appelle. Voir §1c.
- ⬜ `supabase-community-orphan-guard-fix.sql` — **ajouté le 2026-09-18** :
  filet de sécurité RLS pour le bug "communauté orpheline" (un owner/admin
  unique qui quitte sa communauté la laisse sans personne pour la gérer).
  Le correctif côté client (commit `eb43ad4`, déjà déployé) bloque bien le
  bouton "Quitter" dans l'UI normale, mais la policy RLS DELETE réelle de
  `community_members` n'avait aucune garde équivalente — un appel API
  direct, en contournant l'UI, pouvait toujours orpheliner une communauté.
  Ce script ajoute cette garde côté base (la vraie source de vérité). Voir
  §1d.

Le §1 ci-dessous est conservé pour référence mais **n'est plus à faire**.

---

## 1. SQL — `supabase-COMBINED-pending-fixes.sql` — ✅ DÉJÀ EXÉCUTÉ

**Quoi :** 44 correctifs SQL regroupés en un seul fichier (sécurité RLS, autorisations,
gardes de longueur, tâches planifiées).

**Comment :**
1. Ouvre le **SQL Editor** de Supabase (projet `vozehymbihnckzklxesw`).
2. Colle tout le contenu de `supabase-COMBINED-pending-fixes.sql`.
3. Exécute en une fois.
4. Si une section échoue : note le nom du fichier source (marqué `-- SOURCE : …`
   juste au-dessus) et envoie-le moi ; le reste peut être rejoué séparément.

**Les 3 sections les plus critiques** (si tu ne fais pas tout d'un coup) :
- `supabase-authz-null-bypass-CRITIQUE-fix.sql` — contournement d'autorisation
  (un `NULL` SQL faisait passer les gardes `is_admin`/`is_moderator`/… pour vrais).
- `supabase-storage-anon-listing-fix.sql` — les buckets `avatars` et `post-media`
  sont listables par n'importe qui sans compte.
- `supabase-profile-insert-trust-columns-protect-fix.sql` — un compte tout juste
  créé pouvait s'auto-attribuer `is_premium` / `is_founder` à l'inscription.

> Les 3 dernières sections du fichier planifient des tâches `pg_cron`. Elles sont
> idempotentes. Celle des statuts expirés (`cleanup-expired-stories`) suppose que
> l'Edge Function du même nom est déjà déployée (étape 2) — si elle est planifiée
> avant, sa 1re exécution échoue sans dommage et la suivante réussit.

---

## 1b. SQL — `supabase-unaccent-search.sql` — ⬜ JAMAIS EXÉCUTÉ

**Quoi :** corrige un bug trouvé à l'audit — la recherche texte de
communautés, d'événements et de profils (à inviter dans une communauté)
utilise `ILIKE`, insensible à la casse mais pas aux accents (chercher
"Montreal" ne trouve pas "Montréal"). Le script installe l'extension
`unaccent` (+ `pg_trgm` pour des index performants), une fonction wrapper
`unaccent_immutable()` et 7 index trigram (`communities.name/description/city`,
`events.title/description/city`, `profiles.name`).

**Comment :**
1. Ouvre le **SQL Editor** de Supabase (projet `vozehymbihnckzklxesw`).
2. Colle tout le contenu de `supabase-unaccent-search.sql`.
3. Exécute en une fois (additif et idempotent — rejouable sans erreur).

**Important :** ce script prépare seulement le terrain côté base. Le code
JS (`CommunitiesTab.jsx`, `EventsTab.jsx`, `CommunityInviteModal.jsx`)
continue d'utiliser `ILIKE` sur la colonne brute après cette exécution — le
bug d'accents n'est donc pas encore visible côté utilisateur. Le
branchement du code client sur `unaccent_immutable()` est une tâche
séparée, volontairement pas faite ici (voir l'en-tête du fichier SQL pour
le détail des options envisagées et pourquoi elle nécessite une session
capable de tester contre la vraie base).

---

## 1c. SQL — `supabase-push-notifications-triggers.sql` — ⬜ JAMAIS EXÉCUTÉ

**Quoi :** branche enfin les triggers SQL qui manquaient pour que les
notifications push partent réellement. Le fichier contient 4 triggers
`pg_net` (tous après INSERT, tous idempotents via `create or replace
function` / `drop trigger if exists`) :
1. `trg_push_notify_message` sur `messages` — déjà présent avant le
   2026-09-15, jamais exécuté.
2. `trg_push_notify_match` sur `likes` (cas mutuel uniquement) — déjà
   présent avant le 2026-09-15, jamais exécuté.
3. `trg_push_notify_like` sur `likes` (**nouveau**, ajouté le 2026-09-15) —
   envoie un push pour CHAQUE like, mutuel ou non (coexiste avec le
   trigger 2 : un like qui forme un match déclenche les deux pushes).
4. `trg_push_notify_follow` sur `follows` (**nouveau**, ajouté le
   2026-09-15) — envoie un push à chaque nouvel abonnement.

Les triggers 3 et 4 nécessitent que `supabase/functions/send-push/index.ts`
gère déjà les types `"like"` (`prefKey = "likes"`) et `"follow"`
(`prefKey = "follows"`) — code ajouté le 2026-09-15, voir §2c pour le
déploiement.

**Comment :**
1. Ouvre le **SQL Editor** de Supabase (projet `vozehymbihnckzklxesw`).
2. Étape manuelle préalable (une seule fois, si pas déjà fait pour les
   triggers 1/2) : crée le secret Vault partagé avec l'Edge Function —
   voir le bloc « ÉTAPE MANUELLE OBLIGATOIRE » dans le fichier SQL lui-même
   (je ne dois jamais voir ni écrire la valeur de ce secret).
3. Colle tout le contenu de `supabase-push-notifications-triggers.sql` et
   exécute en une fois (additif et idempotent — rejouable sans erreur, y
   compris si les triggers 1/2 avaient déjà été exécutés séparément un
   jour).
4. Redéploie `send-push` avec le nouveau code — voir §2c — **avant ou
   juste après**, mais indispensable pour que les pushes "like"/"follow"
   partent réellement (sinon l'Edge Function répond "ok" sans rien envoyer,
   silencieusement).

Requêtes de vérification en fin de fichier SQL.

---

## 1d. SQL — `supabase-community-orphan-guard-fix.sql` — ⬜ JAMAIS EXÉCUTÉ

**Quoi :** filet de sécurité côté base pour le bug "communauté orpheline",
trouvé lors de l'audit du 18 septembre 2026. Un owner/admin qui est le
SEUL owner/admin restant d'une communauté pouvait la quitter, la laissant
sans personne pour gérer les membres, les demandes d'adhésion ou les
signalements — orpheline de façon permanente (aucune autre issue que sa
suppression complète).

Un premier correctif (commit `eb43ad4`, déjà déployé) a bloqué ça côté
client : `wouldOrphanCommunity()` dans `src/lib/communities/permissions.js`,
branché dans `handleLeave()` de `CommunitiesTab.jsx`, désactive le bouton
"Quitter" dans ce cas précis. Mais ce fichier lui-même le dit explicitement
en en-tête : *"ce fichier ne doit jamais être considéré comme une barrière
de sécurité"* — la vraie source de vérité est la policy RLS. Or la policy
DELETE réelle de `community_members` (`supabase-communities.sql`, policy
"Quitter ou etre retire selon la hierarchie") autorise sans aucune
condition n'importe quel membre à supprimer sa propre ligne
(`profile_id = current_profile_id()`), owner/admin unique compris. Un appel
API direct (`supabase.from('community_members').delete()...`), qui
contourne complètement `CommunitiesTab.jsx`, pouvait donc toujours
orpheliner une communauté malgré le correctif client — le filet de
sécurité manquant côté serveur, complémentaire (pas redondant) du
correctif déjà en prod.

Le script ajoute une fonction `community_would_be_orphaned_by_leaving()`
(même style que les fonctions centrales déjà présentes dans
`supabase-communities.sql`) et l'utilise pour resserrer uniquement la
branche "je me retire moi-même" de la policy DELETE. Les deux autres
branches (un owner qui expulse quelqu'un d'autre, un admin qui retire un
modérateur/membre — c'est-à-dire la modération, jamais un départ
volontaire) restent inchangées. Un départ normal (simple membre, ou
owner/admin alors qu'il reste au moins un autre owner/admin) n'est jamais
bloqué.

**Comment :**
1. Ouvre le **SQL Editor** de Supabase (projet `vozehymbihnckzklxesw`).
2. Colle tout le contenu de `supabase-community-orphan-guard-fix.sql`.
3. Exécute en une fois (additif et idempotent — rejouable sans erreur), après
   `supabase-communities.sql`.

Requêtes de vérification en fin de fichier SQL.

---

## 2. Edge Functions — 2 fonctions jamais déployées, 1 à re-déployer

Vérifié aujourd'hui par appel direct : `stripe-webhook` et `cleanup-expired-stories`
renvoient **404** (le reste des fonctions est bien en ligne).

### Prérequis (une seule fois)
Depuis un terminal, à la racine du projet, avec la CLI Supabase connectée :

```bash
supabase link --project-ref vozehymbihnckzklxesw   # si pas déjà fait
```

### 2a. `stripe-webhook`

Secrets requis (le `SERVICE_ROLE_KEY` n'est **pas** injecté automatiquement pour les
Edge Functions — il faut le poser explicitement) :

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  SUPABASE_SERVICE_ROLE_KEY=<clé service_role, Project Settings > API>
```

Déploiement (sans vérification JWT — Stripe appelle sans session Supabase) :

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

Puis, côté **Dashboard Stripe** → Developers → Webhooks :
- endpoint : `https://vozehymbihnckzklxesw.supabase.co/functions/v1/stripe-webhook`
- événements : `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted` (au minimum)
- copie le « Signing secret » affiché dans `STRIPE_WEBHOOK_SECRET` ci-dessus si
  différent.

Sans ça, la synchro Premium/abonnements ne fonctionne pas : le frontend n'est
jamais la source de vérité du statut Premium.

### 2b. `cleanup-expired-stories`

Aucun secret supplémentaire (réutilise le Vault `service_role_key` déjà créé pour
`process-scheduled-deletions`).

```bash
supabase functions deploy cleanup-expired-stories --no-verify-jwt
```

Le cron qui l'appelle (tous les jours à 3h) est la dernière section de
`supabase-COMBINED-pending-fixes.sql` — donc déploie la fonction **avant** ou
**juste après** l'étape 1.

### 2c. `send-push` (re-déploiement — la fonction est déjà en ligne)

Aucun nouveau secret : réutilise les secrets VAPID / `PUSH_WEBHOOK_SECRET`
déjà configurés pour cette fonction.

```bash
supabase functions deploy send-push
```

**Pourquoi :** le code de `supabase/functions/send-push/index.ts` a été
étendu le 2026-09-15 pour gérer deux nouveaux types de payload, `"like"` et
`"follow"` (en plus de `"match"` et du cas message déjà gérés). Sans ce
re-déploiement, les nouveaux triggers SQL du §1c appelleront une version de
la fonction qui ne reconnaît pas ces types et répond "ok" sans rien envoyer.
À faire dans l'ordre : **d'abord ce re-déploiement, ensuite** l'exécution du
SQL du §1c (dans l'autre ordre ce n'est pas grave non plus — `net.http_post`
ne bloque rien — mais évite une fenêtre où les triggers tournent pour rien).

---

## 3. Vérification après coup

```bash
# Fonctions en ligne (doit répondre autre chose que 404) :
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vozehymbihnckzklxesw.supabase.co/functions/v1/stripe-webhook
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://vozehymbihnckzklxesw.supabase.co/functions/v1/cleanup-expired-stories
```

Dans le SQL Editor :
```sql
-- Les crons sont bien planifiés :
select jobname, schedule, active from cron.job
where jobname like 'baobab-%';

-- Le correctif d'autorisation critique est bien actif (doit renvoyer false, pas null) :
select coalesce(is_moderator_or_above(), false);
```

---

## 4. Point de design à trancher (non bloquant, aucune action requise ce soir)

Les policies **SELECT** de `posts` / `post_comments` / `post_likes` restent lisibles
par tout compte connecté, même bloqué (`using (true)`) — cohérent avec le choix fait
partout ailleurs (communautés, profils) : le filtrage des blocages dans les fils
publics est géré côté client React, pas garanti par RLS. À généraliser dans un sens
ou dans l'autre un jour si tu veux ; ce n'était pas un oubli.
