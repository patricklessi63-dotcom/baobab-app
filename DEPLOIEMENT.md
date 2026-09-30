# Déploiement en attente — Baobab

Mise à jour 2026-09-30.

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
- ⬜ `supabase-community-role-change-orphan-fix.sql` — **ajouté le
  2026-09-25** : même bug "communauté orpheline" que
  `supabase-community-orphan-guard-fix.sql` ci-dessus, mais via le
  changement de rôle (UPDATE) plutôt que le départ (DELETE) — un owner
  unique peut appeler directement `community_members.update({role:
  'member'})` sur sa propre ligne (aucun bouton de l'UI n'atteint ce cas,
  donc aucun correctif client n'est possible ni nécessaire ici) et se
  rétrograder lui-même sans qu'aucun autre owner/admin ne reste. Resserre
  uniquement la branche "owner modifie sa propre ligne" de la policy UPDATE
  existante, en réutilisant `community_would_be_orphaned_by_leaving()`.
- ⬜ `supabase-community-invite-block-bypass-fix.sql` et
  `supabase-community-join-request-block-bypass-fix.sql` — **ajoutés le
  2026-09-25**, non encore listés ici : les notifications d'invitation et
  de demande d'adhésion partent encore sans vérifier un blocage existant
  entre les deux profils (voir l'en-tête de chaque fichier pour le détail).
- ⬜ `supabase-age-check-server-side.sql` — **retrouvé le 2026-09-25** (commit
  `8785275`, plus ancien, jamais listé ici) : ajoute la contrainte
  `check (birth_date is null or birth_date <= current_date - interval '18
  years')` sur `profiles`. Le contrôle 18 ans+ à l'inscription/édition est
  déjà solide côté client (vérifié le 2026-09-25), mais SANS ce script,
  RIEN ne l'impose côté serveur — un appel API direct pourrait enregistrer
  une date de naissance de mineur. **Priorité haute** (sujet légal/sécurité
  des mineurs sur une app de rencontre), à exécuter dès que possible.
- ⬜ `supabase-admin-resolve-report-race-fix.sql` — **ajouté le 2026-09-25**,
  audit du tableau de bord admin (rôle plateforme `myPlatformRole`, jamais
  audité jusqu'ici pour sa logique de traitement) : `admin_resolve_report()`
  ne vérifiait pas que le signalement était encore "open" avant d'écrire son
  nouveau statut. Deux membres du staff (moderator/admin/super_admin)
  pouvaient donc traiter le même signalement en même temps (aucun canal
  Realtime sur les tables de signalement) sans aucune erreur : le second clic
  écrasait silencieusement la décision du premier (résolu -> ignoré ou
  l'inverse) et journalisait une entrée `admin_actions` contradictoire — même
  classe de bug que la course déjà corrigée sur les demandes d'adhésion aux
  communautés (commit `833f240`), mais sans même l'erreur qui, là-bas,
  alertait le second membre du staff. Le correctif ajoute le verrouillage de
  ligne + vérification de statut déjà en place pour
  accept_join_request/reject_join_request. Correctif client livré en même
  temps (commit correspondant) : `AdminDashboard.jsx` reconnaît désormais
  cette erreur pour retirer la ligne avec un message exact au lieu d'un échec
  générique.
- ⬜ `supabase-posts-update-account-state-guard-fix.sql` — **ajouté le
  2026-09-30**, audit du flux d'édition de publication : la policy UPDATE de
  "posts" ne vérifiait que `author_id = current_profile_id()`, sans les 3
  gardes d'état de compte (banni/suspendu, onboarding incomplet, suppression
  en attente) déjà posés sur l'INSERT de la même table par
  `supabase-posts-account-state-guard-fix.sql` (2026-09-09). Un compte banni
  APRÈS avoir publié pouvait donc toujours réécrire le texte de ses
  publications existantes par appel API direct, contournant l'effet de la
  modération sur ce chemin précis. À exécuter après
  `supabase-posts-account-state-guard-fix.sql`.
- ⬜ `supabase-community-comments-update-account-state-guard-fix.sql` —
  **ajouté le 2026-09-30**, même audit que le correctif "posts" ci-dessus
  (vérification si l'édition de commentaire, fil général ET communautés,
  souffrait des mêmes bugs que l'édition de publication) : le fil général
  (`post_comments`) n'a tout simplement pas de fonctionnalité d'édition de
  commentaire (aucune policy UPDATE, aucun bouton "Modifier" — juste une
  limite de fonctionnalité, pas un bug). Les communautés (`community_
  comments`), en revanche, ont bien l'édition (ajoutée par
  `supabase-communities-3.sql`), et sa policy UPDATE "L'auteur modifie son
  propre commentaire" ne vérifiait que `author_id = current_profile_id()`,
  sans les 3 gardes d'état de compte (banni/suspendu, onboarding incomplet,
  suppression en attente) déjà posés sur l'INSERT de la même table par
  `supabase-content-account-state-block-guards-remaining-fix.sql`. Un compte
  banni APRÈS avoir commenté pouvait donc toujours réécrire le texte de ses
  commentaires de communauté existants par appel API direct. À exécuter après
  `supabase-communities-3.sql` et
  `supabase-content-account-state-block-guards-remaining-fix.sql`. Deux vrais
  bugs client trouvés et corrigés dans le même audit (voir commit
  correspondant) : `handleEditComment`/`CommunityPostCard.jsx` n'avaient ni
  garde anti-double-soumission ni contrôle de concurrence optimiste sur
  `updated_at`, exactement comme `editPost`/`PostCard.jsx` avant leur
  correctif du 2026-09-30 (commit `0b29505`).
- ⬜ `supabase-premium-media-kind-mismatch-fix.sql` — **ajouté le
  2026-09-30**, audit du paywall messagerie (`FREE_MESSAGE_LIMIT_REACHED`/
  `PREMIUM_MEDIA_REQUIRED`) : `enforce_premium_message_limits()`
  (`supabase-premium-messaging.sql`) teste `new.kind in ('photo', 'video')`
  pour bloquer l'envoi de médias aux comptes non-Premium, mais le client
  envoie toujours `kind: "image"` pour une photo — jamais `"photo"`, valeur
  qui n'existe même pas dans la contrainte `messages_kind_check`. Résultat :
  la restriction Premium sur les PHOTOS est du code mort, un compte gratuit
  peut en envoyer sans limite (la vidéo, elle, est bien bloquée). Sans
  impact aujourd'hui car `monetization_enabled = false` en prod, mais
  **à exécuter avant toute activation future de la monétisation** — sinon le
  contournement sera immédiat et invisible. Remplace uniquement `'photo'`
  par `'image'` dans la fonction (redéfinition complète, idempotente). À
  exécuter après `supabase-premium-messaging.sql`.
- ⬜ `supabase-accept-event-invitation-membership-check-fix.sql` — **ajouté
  le 2026-09-30**, audit "quitter une communauté" : `accept_event_invitation()`
  ne revérifie jamais l'appartenance à la communauté (`can_view_event()`,
  déjà utilisé par `join_event()`) avant d'accepter une invitation à un
  événement `visibility='community'`. Le correctif client du même jour
  (commit `52a4ebd`) décline déjà les invitations en attente quand on quitte
  une communauté, mais ne protège pas contre une fenêtre de course ou un
  départ par un autre chemin (exclusion par le staff) — un ex-membre pourrait
  encore accepter une invitation restée "pending" et rejoindre un événement
  réservé aux membres. Ajoute uniquement l'appel à `can_view_event()` avant
  l'insertion dans `event_attendees`. À exécuter après `supabase-events-v2.sql`.
- ⬜ `supabase-waitlist-promotion-race-fix.sql` — **ajouté le 2026-09-25**,
  audit du mécanisme de promotion de la liste d'attente des événements
  (jamais audité jusqu'ici — seule la mise en liste d'attente elle-même
  l'avait été) : `promote_from_waitlist()` ne verrouille pas la ligne
  "events" avant de compter les "going" et choisir la prochaine personne en
  attente à promouvoir, contrairement à join_event()/
  accept_event_invitation() qui le font déjà pour éviter la même classe de
  course. Sur un événement plafonné et complet, si deux participants
  "going" quittent presque en même temps, les deux transactions peuvent
  sélectionner la MÊME personne en tête de liste d'attente : elle est
  promue et notifiée deux fois, et la personne suivante n'est jamais
  promue alors qu'une seconde place s'est bel et bien libérée — cette place
  reste vacante indéfiniment (rien ne relance le calcul tant qu'un autre
  "going" ne quitte pas l'événement). Correctif : même verrou ('for
  update') sur "events" que join_event/accept_event_invitation, plus
  vérification défensive du statut avant la promotion finale. Voir
  l'en-tête du fichier pour le détail du scénario.

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

---

## 5. Écart connu — quota de messages gratuits jamais affiché côté client (non bloquant tant que `monetization_enabled = false`)

`get_message_quota(p_match_key)` (`supabase-premium-messaging.sql`) renvoie déjà
`{ monetization_enabled, is_premium, used, limit }` pour une conversation donnée,
mais n'est appelée nulle part dans `src/` (vérifié par recherche exhaustive) :
aucun affichage "X/20 messages restants", aucune désactivation préventive du
bouton d'envoi ou du bouton photo/vidéo. Le pattern existant ailleurs dans l'app
pour les autres quotas (invitations d'événements, création de posts, débit des
messages) est le même : purement réactif — le serveur lève une erreur déjà
traduite en français seulement une fois la limite atteinte
(`check_event_invite_rate_limit`, `check_post_creation_rate_limit`,
`check_message_rate_limit`) — il n'existe donc aucun composant "compteur de
quota" existant dont s'inspirer directement le jour où quelqu'un construira
cet affichage.

Ce n'est pas un problème de fiabilité : `enforce_premium_message_limits()` lève
`FREE_MESSAGE_LIMIT_REACHED` / `PREMIUM_MEDIA_REQUIRED` à l'insertion, et
`App.jsx` (`insertMessageRow`, voir le commentaire "audit paywall messagerie")
traite déjà ces deux codes comme non transitoires — le message passe en
`_status: "failed"` avec `_premiumBlocked: true`, sans réessai automatique ni
ré-upload du fichier, et sans bloquer le reste de la messagerie. C'est un
problème de confort/UX : le jour où `monetization_enabled` passera à `true`,
l'utilisateur gratuit découvrira sa limite en la heurtant (message d'erreur
après coup) plutôt que d'être prévenu à l'avance. Construire cet affichage
préventif est une vraie mission UI/UX à part entière (composant, design,
décision produit sur où l'afficher) — non traitée ici.

---

## 6. Écart connu — l'exclusion d'un membre par le staff ne nettoie PAS ses
invitations/participations aux événements de la communauté, et un correctif
purement client (identique à celui de `handleLeave`) ne peut pas combler ce
trou sans modification SQL

Audit du 30 septembre 2026, suite au correctif client du départ volontaire
(commit `52a4ebd`, `handleLeave` de `CommunitiesTab.jsx`) : question posée —
`handleRemoveMember` (même fichier, exclusion d'un membre par le staff) fait-il
le même nettoyage ?

**Constat : non.** `handleRemoveMember` (`CommunitiesTab.jsx`, ~ligne 1222) se
contente de `delete from community_members where id = member.id` puis met à
jour l'état local (compteur, liste des membres) — contrairement à `handleLeave`,
il ne touche ni `event_invitations` ni `event_attendees`. Un membre exclu de
force garde donc ses invitations "en attente" aux événements
`visibility='community'` de cette communauté, et reste inscrit
(`going`/`waitlisted`) à ceux déjà confirmés, alors que `can_view_event()`
(`supabase-events-v2.sql`) exige `is_community_member()` pour ce type
d'événement — même incohérence que celle corrigée pour le départ volontaire.

**Mais copier-coller le correctif de `handleLeave` ne fonctionnerait PAS**, pour
une raison structurelle propre aux droits RLS/RPC existants (aucun fichier
`supabase-*.sql` n'a été modifié pour vérifier ceci — lecture seule) :

- `decline_event_invitation(p_invitation_id)` (`supabase-events-v2.sql`,
  ~ligne 550) exige `invited_profile_id = current_profile_id()` : seul
  l'invité·e peut décliner sa propre invitation. Appelée par le membre du
  staff qui exclut quelqu'un d'autre (`current_profile_id()` = le staff, pas
  le membre exclu), cette RPC échoue **systématiquement** ("Invitation
  introuvable ou deja traitee") — ce n'est pas un cas limite, ça ne peut
  jamais réussir pour un tiers.
- La policy DELETE de `event_attendees` (`supabase-events-v2.sql`,
  ~ligne 226-228, "Se retirer ou etre retire par le staff") autorise
  `profile_id = current_profile_id() or is_event_mod(event_id)` — mais
  `is_event_mod()` teste le rôle dans `event_staff` (organisateur/
  co-organisateur/modérateur de CET événement précis, renseigné uniquement à
  la création de l'événement par `create_event()`, ~ligne 485), pas le rôle
  dans `community_members`. Un owner/admin de communauté qui exclut un membre
  n'est donc "event mod" que par coïncidence (s'il a lui-même créé
  l'événement) — dans le cas général, la suppression de la ligne
  `event_attendees` d'un tiers échoue silencieusement (0 ligne affectée, pas
  d'erreur PostgREST).

Autrement dit : le même code que `handleLeave` compilerait et s'exécuterait
sans planter, mais ne nettoierait quasiment jamais rien dans le cas réel
(exclusion par un owner/admin qui n'est pas l'organisateur de l'événement) —
un correctif cosmétique qui donnerait une fausse impression d'être réglé.
Un vrai correctif demande soit une fonction `SECURITY DEFINER` dédiée
(ex. `remove_community_member(p_member_id)` qui nettoie les événements
`community` de ce membre AVANT de supprimer la ligne `community_members`,
avec les droits du staff vérifiés à l'intérieur de la fonction), soit un
trigger `AFTER DELETE on community_members` qui fait ce nettoyage avec des
privilèges élevés indépendamment de qui a fait le DELETE — les deux touchent
`supabase-*.sql`, hors périmètre autorisé pour cette session (lecture seule,
aucune edge function). Non traité ici volontairement plutôt que de forcer un
changement spéculatif ; à corriger via une vraie modification SQL une fois
autorisée.

Point vérifié par la même occasion : aucune action que tenterait un membre
déjà exclu (mais ayant encore le détail de la communauté ouvert à l'écran —
pas de canal Realtime sur `community_members`, limitation déjà connue) ne
plante côté client. Toutes les mutations de `CommunitiesTab.jsx` (poster,
réagir, commenter, quitter, accepter/décliner une invitation, etc.) sont déjà
protégées par `try/catch` avec un message d'erreur générique ou
`friendlyDbError()` : un refus RLS remonte proprement comme une erreur
affichée, jamais comme un crash silencieux.
