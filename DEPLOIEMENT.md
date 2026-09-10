# Déploiement en attente — Baobab

État au 2026-09-09. Tout le code est poussé sur `main` (commit `58ce1de` et suivants).
Rien de ce qui suit ne s'exécute automatiquement : ce sont les **actions manuelles**
qui restent, dans l'ordre.

---

## 1. SQL — `supabase-COMBINED-pending-fixes.sql` (le plus urgent)

**Quoi :** 44 correctifs SQL regroupés en un seul fichier (sécurité RLS, autorisations,
gardes de longueur, tâches planifiées). Aucun n'est encore actif en production.

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

## 2. Edge Functions — 2 fonctions jamais déployées

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
