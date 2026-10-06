# Déploiement en attente — Baobab

Mise à jour 2026-10-02.

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
- ⬜ **§8 (5 oct. 2026) — correctif SQL `can_view_event()`** : refuser ou se
  faire révoquer une invitation à un événement privé ne retire pas l'accès (+
  filet optionnel anti-partage de carte d'événement privé en conversation).
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
- ⬜ `supabase-community-orphan-account-deletion-fix.sql` — **ajouté le
  2026-10-02** : même bug "communauté orpheline" que les deux fichiers
  ci-dessus, mais par un troisième chemin jamais vérifié jusqu'ici — la
  SUPPRESSION DE COMPTE. `community_members.profile_id` est en
  `on delete cascade` sur `profiles` : supprimer le profil d'un owner/admin
  unique supprime aussi sa ligne `community_members` par cascade, un chemin
  qu'aucune policy RLS ne peut intercepter (ni une suppression cascade ni un
  appel service role, utilisé par `process-scheduled-deletions`, ne passent
  par la RLS). Contrairement aux deux fichiers précédents (qui resserrent
  une policy RLS), celui-ci ajoute un trigger `BEFORE DELETE` sur
  `community_members` qui transfère automatiquement la propriété au membre
  restant le mieux placé plutôt que de bloquer la suppression de compte
  (bloquer aurait fait échouer silencieusement et indéfiniment la
  suppression de ce compte précis). Voir l'en-tête du fichier pour le
  raisonnement complet et la limite résiduelle documentée (communauté à un
  seul membre).
- ⬜ `supabase-event-orphan-account-deletion-fix.sql` — **ajouté le
  2026-10-02** : même bug "orphelin par suppression de compte" que
  `supabase-community-orphan-account-deletion-fix.sql` ci-dessus, vérifié
  pour les ÉVÉNEMENTS (`event_staff`, rôle organizer/co_organizer/moderator).
  `event_staff.profile_id` est aussi en `on delete cascade` sur `profiles` :
  supprimer le profil d'un organisateur supprime sa ligne `event_staff` par
  cascade, un chemin qu'aucune policy RLS ni le client service role de
  `process-scheduled-deletions` ne peuvent intercepter — même raisonnement
  que pour les communautés. Nuance confirmée (pas supposée par analogie) : la
  policy DELETE de `event_staff` interdisait déjà, depuis l'origine, le
  départ volontaire d'un organisateur unique ; seul le chemin cascade/service
  role restait un trou. Ajoute un trigger `BEFORE DELETE` sur `event_staff`
  qui transfère automatiquement le rôle 'organizer' au meilleur candidat
  restant (co_organizer en priorité, sinon moderator, sinon le plus ancien).
  Limite réaliste documentée dans l'en-tête du fichier : la fonctionnalité
  "ajouter un co-organisateur" n'est jamais câblée côté client aujourd'hui
  (vérifié : `canManageEventStaff`/`canSetEventRole`/`canRemoveEventStaff`
  dans `src/lib/events/permissions.js` ne sont appelés nulle part), donc la
  quasi-totalité des événements n'ont qu'une seule ligne `event_staff` — le
  trigger ne trouvera presque jamais de successeur, et la plupart des
  événements dont le créateur supprime son compte deviendront des coquilles
  sans organisateur. Limite déjà inhérente à l'app, pas une régression de ce
  trigger. Vérifié côté client (`EventsTab.jsx`/`EventDetailView.jsx`) :
  aucun plantage sur un événement sans staff (la seule requête `event_staff`
  utilise `.maybeSingle()` et gère déjà un résultat vide ; `organizerName`
  n'est affiché que `if (data.created_by)`) — rien à corriger côté `.jsx`.
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
- ⬜ `supabase-community-event-governance-banned-staff-fix.sql` — **ajouté le
  2026-10-02**, audit "owner de communauté/organisateur d'événement banni
  par un admin plateforme" (bannissement, PAS suppression de compte — la
  ligne `community_members`/`event_staff` reste intacte, `banned_at` est
  juste posé sur `profiles`). Confirmé : `App.jsx`
  (`own.banned_at → setView('banned')`, `applyOwnProfile()`) bloque bien
  TOUT compte banni dès son prochain chargement de session, sans trou
  spécifique au rôle owner/organisateur — mais, comme déjà trouvé et corrigé
  à plusieurs reprises pour les tables de contenu (posts/likes/comments/
  reactions...), ce blocage n'a toujours été qu'un garde CLIENT. Aucune
  policy RLS ni RPC de gestion de communauté/événement ne vérifie l'état du
  compte de l'acteur : `communities` (UPDATE/DELETE), `community_members`
  (changement de rôle/exclusion), `community_reports`/`community_invites`
  (traitement/création/révocation), `accept_join_request`/
  `reject_join_request`, et l'équivalent événement — `events` (UPDATE),
  `event_staff` (changement de rôle/exclusion), `event_reports`/
  `event_invitations`. Un owner/organisateur banni dont le JWT Supabase
  reste valide (session déjà ouverte, ou appel API direct) peut donc
  continuer à gérer entièrement sa communauté/son événement malgré l'écran
  "compte banni" affiché par l'app. Une fois ce fichier exécuté, un
  owner/organisateur banni devient un vrai "owner fantôme" (ligne
  `community_members`/`event_staff` intacte mais plus aucune action
  possible) — conforme au comportement attendu, mais qui met en lumière une
  lacune FONCTIONNELLE distincte et déjà confirmée par ailleurs : aucun
  mécanisme de transfert de propriété forcé par un admin plateforme
  n'existe pour réaffecter une communauté/un événement laissé sans
  owner/organisateur actif. Volontairement non traitée ici (hors périmètre
  d'un correctif livré un jour de lancement — demanderait une nouvelle RPC
  `admin_reassign_community_owner` ou équivalent, avec ses propres règles de
  choix du nouveau owner). Voir l'en-tête du fichier pour le détail complet,
  y compris pourquoi `community_members` (UPDATE/DELETE) est redéfini dans
  son état le plus récent connu (celui de
  `supabase-community-orphan-guard-fix.sql`/
  `supabase-community-role-change-orphan-fix.sql` ci-dessus, encore jamais
  exécutés) pour ne régresser aucune garde anti-orpheline quel que soit
  l'ordre d'exécution choisi. À exécuter après `supabase-communities.sql` et
  `supabase-events-v2.sql`.
- ⬜ `supabase-indexes-launch-fix.sql` — **ajouté le 2026-10-06** (audit
  performance, voir §10) : 12 index manquants sur les chemins chauds du client
  (`favorites(to_id)`, `stories`, `profiles(created_at)`, `profile_photos`,
  `community_posts`/`community_comments`, invitations...). Additif, idempotent
  (`create index if not exists`), ignore avec un NOTICE une table/colonne absente.
  Pas de `concurrently` (refusé par l'éditeur SQL) : verrou d'écriture de
  quelques ms à quelques secondes par index, à lancer hors pic. À exécuter avant
  l'afflux du lancement.

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

## 1e. SQL — `supabase-community-orphan-account-deletion-fix.sql` — ⬜ JAMAIS EXÉCUTÉ

**Quoi :** troisième variante du bug "communauté orpheline" (après le départ
volontaire, §1d, et l'auto-rétrogradation par UPDATE), trouvée lors de
l'audit autonome du 2 octobre 2026 : la SUPPRESSION DE COMPTE.

`community_members.profile_id` référence `profiles(id) on delete cascade`
(`supabase-communities.sql`). Supprimer la ligne `profiles` d'un owner/admin
unique supprime donc automatiquement sa ligne `community_members` par
cascade — y compris si ce profil est owner/admin d'une communauté. Vérifié
par lecture seule :

- Une suppression cascade n'est pas un `DELETE` explicite soumis à la RLS de
  `community_members` : les deux garde-fous RLS déjà livrés (§1d et la
  variante UPDATE) sont donc structurellement invisibles à ce chemin, quelle
  que soit leur rigueur.
- `process-scheduled-deletions` (edge function qui traite la suppression
  différée après le délai de grâce de 24h, voir `supabase-account-deletion
  .sql`) appelle `admin.auth.admin.deleteUser(...)` avec le client
  **service role**, qui contourne toujours la RLS par conception — une
  seconde raison indépendante.

Conséquence réelle, confirmée : un·e owner/admin unique d'une communauté qui
supprime son compte l'orpheline exactement comme le départ volontaire déjà
corrigé — plus personne ne peut gérer les membres, les demandes d'adhésion
ni les signalements. Vérifié séparément côté client (`CommunitiesTab.jsx`,
`CommunityDetailView.jsx`) : aucun plantage, `isStaff`/`isMod`/
`viewerRole === "owner"` gèrent déjà une absence de staff avec grâce (les
boutons de gestion disparaissent simplement) — rien à corriger côté `.jsx`
pour ce chemin précis.

**Approche retenue :** pas un trigger qui bloque la suppression du profil
(ça ferait échouer silencieusement et indéfiniment la suppression de ce
compte précis à chaque passage du cron, sans jamais prévenir
l'utilisateur·rice). À la place, un trigger `BEFORE DELETE` sur
`community_members` lui-même (qui se déclenche aussi pour les suppressions
cascade) transfère automatiquement la propriété ("owner") au membre restant
le mieux placé (modérateur existant en priorité, sinon le plus ancien)
juste avant que la ligne ne disparaisse — la suppression de compte continue
de réussir normalement, la communauté garde toujours un responsable tant
qu'il lui reste au moins un autre membre. Limite résiduelle documentée dans
l'en-tête du fichier : une communauté à un seul membre (celui qui vient de
supprimer son compte) reste sans owner/admin, mais seule échappatoire déjà
existante (suppression par un admin plateforme) reste disponible.

**Comment :**
1. Ouvre le **SQL Editor** de Supabase (projet `vozehymbihnckzklxesw`).
2. Colle tout le contenu de `supabase-community-orphan-account-deletion-fix.sql`.
3. Exécute en une fois (additif et idempotent — rejouable sans erreur), après
   `supabase-communities.sql`.

Requêtes de vérification en fin de fichier SQL.

---

## 1f. SQL — `supabase-event-orphan-account-deletion-fix.sql` — ⬜ JAMAIS EXÉCUTÉ

**Quoi :** vérification demandée le 2 octobre 2026 du même bug "orphelin par
suppression de compte" (§1e) pour les ÉVÉNEMENTS plutôt que les communautés.

`event_staff.profile_id` référence aussi `profiles(id) on delete cascade`
(`supabase-events-v2.sql`). Supprimer la ligne `profiles` d'un organisateur
supprime donc automatiquement sa ligne `event_staff` par cascade.

Différence confirmée avec le cas communauté (pas supposée par analogie) : la
policy DELETE de `event_staff` ("Quitter le staff ou etre retire par
l'organisateur") interdisait déjà, depuis l'origine, à un organisateur de
supprimer sa propre ligne par un appel direct (`role <> 'organizer'` exigé
sur la branche self-delete) — contrairement à `community_members`, aucun
correctif de policy RLS n'était donc nécessaire ici. Mais exactement comme
pour les communautés, cette policy reste structurellement invisible à une
suppression cascade, et la suppression de compte réelle passe de toute façon
par le client service role de `process-scheduled-deletions`, qui contourne
toujours la RLS.

Conséquence confirmée : un organisateur d'événement qui supprime son compte
orpheline son événement (plus personne ne peut l'éditer, l'annuler, modérer
ses signalements, ni jamais réattribuer le rôle 'organizer', réservé à un
organizer déjà existant par la policy UPDATE).

**Limite réaliste documentée** (vérifiée, pas supposée) : la fonctionnalité
"ajouter un co-organisateur" n'est jamais câblée côté client —
`canManageEventStaff()`, `canSetEventRole()` et `canRemoveEventStaff()`
existent dans `src/lib/events/permissions.js` mais ne sont importés par
aucun composant, et le seul point d'insertion dans `event_staff` dans tout
le dépôt SQL (`create_event()`) n'insère qu'une seule ligne 'organizer' par
événement. En pratique, la quasi-totalité des événements n'ont donc qu'UN
seul membre de staff : le trigger de transfert ci-dessous ne trouvera
presque jamais de successeur à promouvoir, et la plupart des événements dont
le créateur supprime son compte deviendront des coquilles sans organisateur.
Ce n'est pas une régression introduite par ce fichier, mais une limite déjà
inhérente à l'absence de la fonctionnalité co-organisateur dans l'app.

**Approche retenue :** même logique que §1e — un trigger `BEFORE DELETE` sur
`event_staff` (pas un blocage de la suppression de compte, qui échouerait
silencieusement et indéfiniment) transfère automatiquement le rôle
'organizer' au membre restant le mieux placé (co_organizer en priorité,
sinon moderator, sinon le plus ancien) quand c'est possible.

Vérifié séparément côté client (`EventsTab.jsx`, `EventDetailView.jsx`) :
aucun plantage sur un événement sans staff. La seule requête `event_staff`
(`.eq('profile_id', currentUser.id).maybeSingle()`) gère déjà un résultat
vide (`role = null`, `isEventStaff(null)` → false), et `organizerName` n'est
renseigné que `if (data.created_by)` (déjà `null` après la suppression du
compte créateur, `events.created_by` étant en `on delete set null`). Rien à
corriger côté `.jsx` pour ce chemin précis.

**Comment :**
1. Ouvre le **SQL Editor** de Supabase (projet `vozehymbihnckzklxesw`).
2. Colle tout le contenu de `supabase-event-orphan-account-deletion-fix.sql`.
3. Exécute en une fois (additif et idempotent — rejouable sans erreur), après
   `supabase-events-v2.sql`.

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

---

## 7. Audit du rate-limit serveur de `ai-assist` (30 septembre 2026) — pas de
problème de fiabilité trouvé, lecture seule sur l'edge function

Question posée : la fonction `ai-assist` étant déployée et facturée au token
(API Anthropic), le rate-limit CÔTÉ SERVEUR (la seule protection fiable,
puisqu'un appel direct à l'API peut contourner le client) a-t-il déjà été
vérifié ?

**Constat : le rate-limit serveur est solide, pas de bug trouvé.**

- Il n'est **pas** en mémoire (pas de variable globale Deno fragile face aux
  cold starts) : `ai-assist/index.ts` (~ligne 51-61) compte les lignes de la
  table `ai_usage` (`supabase-intelligence.sql`, §4) créées dans la dernière
  heure pour le `profile_id` courant (`select count(*) ... where profile_id =
  ... and created_at >= now() - 1h`), via le client `service_role` (RLS
  contourné pour la lecture globale, mais aucune policy INSERT cliente —
  seule la fonction peut écrire). Un index dédié existe déjà
  (`idx_ai_usage_profile_time on ai_usage(profile_id, created_at)`). Cette
  limite **survit** aux redémarrages/redéploiements de la fonction — pas de
  trou de fiabilité ici, contrairement à l'hypothèse initiale de l'audit.
- Limite réelle : `AI_RATE_LIMIT_PER_HOUR` (défaut 20/h par profil, fenêtre
  glissante d'1h recalculée à chaque appel). Raisonnable compte tenu du coût :
  modèle `claude-3-5-haiku-latest` (le moins cher), `max_tokens: 400` en
  sortie, entrées tronquées à 400-1000 caractères selon l'action — coût
  largement contenu même à 20 appels/h/utilisateur. Rien à corriger ici.
- Cohérence client/serveur déjà bonne : au dépassement, le serveur répond
  HTTP 429 avec `{"error": "Limite de suggestions IA atteinte pour cette
  heure. Réessaie plus tard."}` (texte explicite, pas une panne). Côté client,
  `invokeAI` (`src/lib/ai/aiClient.js`, `readServerErrorMessage`) relit déjà
  ce corps JSON depuis `error.context` (`FunctionsHttpError` de supabase-js —
  jamais dans `data` pour un statut non-2xx) et le propage tel quel ; ce n'est
  QUE si ce corps est illisible (panne réseau/relais réelle) que le message
  générique "Le service IA n'a pas pu répondre. Réessaie." apparaît. Tous les
  appelants (`AiSuggestButton`, `AiConversationSuggestions`,
  `CommunityCreateForm`, `ConversationPane.handleTranslate`) affichent cette
  chaîne telle quelle — l'utilisateur voit donc bien le message de limite
  horaire, distinct de la panne générique. Ce correctif existait déjà (commit
  `531f12c`, avant cet audit) mais n'avait, contrairement au même motif pour
  `create-checkout-session`/`create-portal-session`
  (`src/lib/premium/checkout.test.js`), **aucun test** : ajouté dans cette
  session (`src/lib/ai/aiClient.test.js`, 7 cas — message de limite horaire,
  autres messages précis du serveur, repli générique, anti-rebond client).

Rien à déployer ni corriger côté SQL/edge function suite à cet audit.

---

## 8. Audit des événements PRIVÉS (5 octobre 2026) — 1 correctif SQL à exécuter, 1 choix produit à valider

### Constat — ce qui est correct (aucune action)

- **Liste / Près de toi / Populaires / Recommandés / Recherche** (`EventsTab.jsx`,
  `recommendations.js`) : tout part d'un seul `supabase.from("events")` filtré par
  la RLS `can_view_event(id)` (`supabase-events-v2.sql`), aucun chemin ne la
  contourne. `FeedTab.jsx` filtre en plus `.eq("visibility", "public")`.
  `CommunitiesTab.loadEvents` (événements d'une communauté) passe aussi par la
  RLS : un événement privé rattaché à une communauté n'y apparaît que pour les
  organisateurs/participants/invités. `event_attendees`, `event_comments`,
  `event_media`, buckets `event-media`/`event-covers` : tous gardés par
  `can_view_event()`. Le compteur `event_participant_count(uuid)` a sa garde
  depuis `supabase-event-participant-count-authz-fix.sql`.
- Une personne invitée voit bien l'événement dans sa liste (`can_view_event`
  accepte une ligne `event_invitations`) et peut ouvrir la fiche.

### Corrigé côté CLIENT (déjà dans le code)

1. **Accepter/Refuser depuis la fiche** (même bug que les communautés
   `invite_only`) : la fiche d'un événement privé n'offrait qu'un « Participer »
   (`join_event`) qui laissait l'invitation `pending` à jamais ; Accepter/Refuser
   n'existaient que dans le bloc « Tes invitations » de l'accueil. La fiche
   affiche maintenant « Invité·e par X — Accepter l'invitation / Refuser »
   (invitation re-vérifiée à l'ouverture de la fiche).
2. **Refus = perte d'accès affichée** : refuser l'invitation à un événement privé
   ramène à l'accueil et le masque de la liste (`isHiddenByDeclinedInvite`,
   `src/lib/events/invitations.js`).
3. **Partage dans une conversation** : retiré pour les événements privés (voir le
   point « Confidentialité » ci-dessous) + garde défensive dans
   `handleSendEventMessage`.

### ⬜ Correctif SQL à exécuter — `can_view_event()` garde l'accès après un refus/une révocation

**Problème réel.** Dans `can_view_event()` (`supabase-events-v2.sql`), la branche
`private` accepte *n'importe quelle* ligne `event_invitations` de la personne,
**quel que soit son `status`** :

```sql
or exists (select 1 from event_invitations where event_id = ev.id and invited_profile_id = current_profile_id())
```

Conséquences :
- une personne qui **refuse** l'invitation (`decline_event_invitation` → `declined`)
  continue de voir titre, lieu, date, description, discussion, photos et (si
  `participants_visible`) participants de l'événement privé, indéfiniment ;
- surtout, **la révocation par le staff est sans effet** : la policy « Le staff
  revoque une invitation » ne fait que passer le statut à `declined` — la
  personne révoquée garde l'accès complet. Le seul moyen de la sortir serait de
  supprimer la ligne, ce que la RLS n'autorise pas (aucune policy DELETE sur
  `event_invitations`).

Le filtre client ci-dessus masque l'événement dans la liste, mais ne protège pas
contre un appel API direct : c'est la RLS qui doit trancher.

**Correctif** (à exécuter dans le SQL Editor ; ne remplace que cette fonction,
dont la seule définition est celle de `supabase-events-v2.sql`) :

```sql
create or replace function can_view_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case ev.visibility
    when 'public' then true
    when 'community' then is_community_member(ev.community_id)
    when 'private' then (
      is_event_mod(ev.id) or is_event_participant(ev.id)
      or exists (
        select 1 from event_invitations
        where event_id = ev.id and invited_profile_id = current_profile_id()
          and status <> 'declined'
      )
    )
    else false end
  from events ev where ev.id = p_event_id;
$$;
```

Effets de bord à connaître :
- `accept_event_invitation` / `decline_event_invitation` ne dépendent que du statut
  `pending` : inchangés. Une personne qui a **déjà accepté** (`accepted`) garde
  l'accès (comportement voulu : elle peut se réinscrire).
- Une personne **déjà participante** (ligne `event_attendees` going/interested/
  waitlisted) garde l'accès même avec une invitation `declined` (via
  `is_event_participant`). Pour exclure quelqu'un de façon complète, le staff doit
  donc aussi le retirer des participants (le bouton existe déjà).
- Limite connue, non traitée ici : `unique (event_id, invited_profile_id)` empêche
  de **ré-inviter** quelqu'un qui a refusé (erreur 23505 « Cette personne est déjà
  invitée »). À trancher côté produit (ex. autoriser le staff à repasser une
  invitation `declined` en `pending`).

Vérification : en tant que A invité·e, `select count(*) from events where id = '<id privé>'`
→ 1 ; après `select decline_event_invitation('<invitation>')` → 0.

### ⬜ Confidentialité — partage d'un événement privé dans une conversation (choix produit)

**Problème réel (point 4 de l'audit).** « Partager → Dans une conversation »
écrivait dans `messages` une ligne `kind='event'` avec
`media_meta = { event_id, title, cover_url, event_date, timezone, city }`, pour
n'importe quel participant·e (pas seulement l'organisateur) et pour n'importe
quelle connexion mutuelle, invitée ou non. Ce message est lisible par les deux
personnes de la conversation **sans aucun contrôle `can_view_event`** : le
destinataire non invité lisait titre, date, ville — et surtout `cover_url`, une
**URL signée** du bucket privé `event-covers` (durée `COVER_URL_EXPIRY`) qui
contourne la RLS du bucket. La carte n'est pas cliquable pour lui, mais
l'information a déjà fuité.

**Décision prise côté client (réversible, à valider)** : l'option
« Dans une conversation » n'est plus proposée pour un événement privé (le
partage vers le fil ne l'était déjà pas) ; pour faire entrer quelqu'un, on utilise
« Inviter », qui crée une vraie invitation. Si tu préfères autoriser le partage
vers des personnes *déjà invitées uniquement*, il faut une vérification serveur
(`can_view_event()` s'évalue pour l'utilisateur courant, pas pour le
destinataire : il faudrait une variante prenant un `profile_id`). Le même
raisonnement vaut pour les événements `community` partagés à un non-membre (hors
périmètre de cet audit, déjà traité côté communautés).

**Filet côté base (optionnel mais recommandé : un client modifié peut contourner
l'UI)** — rejette l'insertion d'une carte d'événement privé :

```sql
create or replace function block_private_event_share()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_event_id uuid;
begin
  if new.kind = 'event' and (new.media_meta->>'event_id') ~* '^[0-9a-f-]{36}$' then
    v_event_id := (new.media_meta->>'event_id')::uuid;
    if exists (select 1 from events where id = v_event_id and visibility = 'private') then
      raise exception 'Un evenement prive ne se partage pas dans une conversation';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists trg_block_private_event_share on messages;
create trigger trg_block_private_event_share before insert on messages
for each row execute function block_private_event_share();
```

**Nettoyage des cartes déjà envoyées (optionnel)** — retire les champs sensibles des
messages existants qui partagent un événement privé (à exécuter une seule fois ;
vérifier d'abord qu'aucun trigger `BEFORE UPDATE` sur `messages` ne pose problème) :

```sql
update messages m
set media_meta = jsonb_build_object('event_id', m.media_meta->>'event_id')
from events e
where m.kind = 'event'
  and (m.media_meta->>'event_id') ~* '^[0-9a-f-]{36}$'
  and e.id = (m.media_meta->>'event_id')::uuid
  and e.visibility = 'private';
```

(L'URL signée déjà émise reste valide jusqu'à son expiration même après ce
nettoyage ; seule la suppression/le remplacement du fichier de couverture la
neutralise immédiatement.)

### ⬜ Confidentialité — carte d'un événement `community` partagée à un non-membre (décision produit : Patrick)

**Corrigé côté client (5 oct. 2026)** : pour un événement dont la visibilité n'est
pas `public` (donc `community`), la carte partagée en conversation n'embarque plus
`cover_url` (l'URL signée du bucket privé `event-covers` contournait la RLS : un
destinataire non membre de la communauté liée pouvait ouvrir la couverture).
La carte retombe sur son dégradé décoratif. Voir `buildEventShareMeta()`
(`src/lib/events/shareCard.js`) ; pour un événement `public`, rien ne change.

**Reste visible, volontairement non modifié** : le **titre, la date et la ville**
de la carte d'un événement `community` partagé restent lisibles par un
destinataire qui n'est pas membre de la communauté. L'option de partage n'a pas
été retirée (elle sert peut-être à inviter quelqu'un). **À trancher par
Patrick** : (a) accepter cette exposition minimale, (b) retirer « Dans une
conversation » pour `community` comme pour `private`, ou (c) ne l'autoriser que
vers des membres de la communauté (vérification serveur nécessaire : la RLS ne
s'évalue pas pour le destinataire). Les cartes `community` déjà envoyées gardent
leur `cover_url` en base (l'URL signée expire d'elle-même) ; un nettoyage SQL
analogue à celui ci-dessus est possible sur `visibility = 'community'` si besoin.


## 9. Audit de la vitrine publique (5 octobre 2026) — points juridiques/produit à trancher par Patrick

Périmètre vérifié : `index.html`, `public/` (manifest, icônes, robots, sitemap,
sw.js), `vercel.json` (rewrite + CSP, hashes des 2 scripts inline recalculés
sur le build : OK), `usePathname.js`, routage de `App.jsx`, `LandingPage`,
`AboutPage`/`PrivacyPage`/`TermsPage`, `legalContent.jsx`, modales légales
(`AppModals.jsx`, `Auth.jsx`). Routes testées dans un navigateur
(`/`, `/connexion`, `/inscription`, `/a-propos`, `/confidentialite`,
`/conditions`, `/nimportequoi`, retour arrière) : tout fonctionne ; une route
inconnue affiche la page d'accueil, un utilisateur connecté qui ouvre une route
publique est renvoyé vers `/`.

**Corrigé dans le code** : le `<link rel="canonical">` de `index.html` pointait
vers `/` sur toutes les routes (réécrites vers le même fichier) — `/a-propos`,
`/confidentialite`, `/conditions` se déclaraient doublons de l'accueil malgré
le sitemap. `PublicPageShell` ajuste désormais le canonical à la page courante.

**À trancher / valider (aucun texte juridique n'a été modifié) :**

1. **Aucune adresse de contact n'existe nulle part** (ni dans l'app, ni dans
   la landing, ni dans les pages légales). Or la politique de confidentialité
   (§1, §6, §12) et les CGU (§13) renvoient toutes à « l'adresse de contact
   indiquée/fournie dans l'application » — qui n'existe pas. Pour exercer ses
   droits (accès, effacement : exigence LPRPDE/RGPD), un utilisateur n'a aucun
   moyen de joindre l'exploitant. Il faut choisir une adresse email (ex.
   `contact@…`) et l'afficher (landing, À propos, légal, Réglages).
2. **Identité de l'exploitant** : les CGU/confidentialité ne nomment ni
   entreprise ni personne responsable du traitement ; « droit applicable » reste
   générique (« province ou pays où le service est exploité »). Seule mention :
   « BAOBAB — BY LESSI PATRICK » sur la page À propos.
3. **Texte légal en retard sur les fonctionnalités** (daté du 15 août 2026) :
   la politique ne mentionne pas la **géolocalisation** (obligatoire à
   l'inscription), les **paiements Premium (Stripe)**, les **notifications
   push**, les **messages vocaux / médias**, ni l'identité du fournisseur d'IA.
   Les CGU ne parlent ni de l'abonnement Premium ni de la facturation. À faire
   relire par un juriste (le fichier le dit déjà en commentaire).
4. **Tutoiement/vouvoiement** : toute l'app et la landing tutoient (« tu »),
   les textes légaux vouvoient (« vous »). Choix éditorial à confirmer (le
   vouvoiement est classique en juridique).
5. **Compteur « N membres déjà sur Baobab »** sur la landing (RPC
   `public_user_count`) : au moment de l'audit il affichait « 4 membres » —
   mauvais effet de preuve sociale au lancement. Envisager un seuil minimal
   d'affichage (ex. ≥ 50) ou le retirer ; non modifié (décision produit).
6. **Domaine** : `og:image`, `og:url`, canonical, sitemap et robots utilisent
   `https://baobab-app-zeta.vercel.app`. Si un domaine officiel est adopté, mettre
   à jour ces 4 fichiers (le canonical des pages publiques suit `index.html`).
7. Mineur : `og:image` est l'icône 512×512 carrée (carte `summary`), pas une
   image 1200×630 — l'aperçu de partage sera petit. Pas de balise `og:locale`.


---

## 10. Audit de performance avant le lancement (6 octobre 2026) — 1 script SQL d'index à exécuter, le reste est corrigé dans le code ou documenté

### Chiffres (lecture du code, session type : compte ouvert sur l'onglet « Fil »)

- **Requêtes au démarrage d'une session : ~31** (+ 1 si le compte a des matches) :
  version (1), `loadAll` (profils 500, photos 3200, propre profil, likes, passes,
  blocks, `get_my_likers`, blocks+profils : 8), localisation et rôle plateforme (2),
  coque sociale (stories, favoris envoyés, favoris reçus, 2 listes d'abonnements de
  2000 lignes, notifications, statut Premium, recommandations masquées, journal
  d'écran : ~9), onglet Fil (communautés + événements recommandés : 6 ; publications :
  4), heartbeat (1). Aucune requête N+1 dans les listes de profils/posts (un seul
  `.in()` par page) ; le seul N+1 trouvé (URLs signées) est corrigé ci-dessous.
- **Canaux Realtime par client connecté : 7 permanents** (`likes-received`,
  `blocks-passes-own`, `favorites-own`, `follows-own`, `global-messages`,
  `notifications`, + `conversations-preview` dès qu'il y a un match), **+1** sur le
  Fil (`posts-feed`), **+1** sur l'onglet Événements, **+3** par conversation ouverte
  (`messages`, `typing`, `reactions`). Soit 8 en navigation normale, 11 avec une
  conversation ouverte. Côté base : **23 abonnements `postgres_changes`** par client
  (+4 avec une conversation). Tous sont fermés par `removeChannel` au démontage /
  déconnexion (vérifié canal par canal) ; aucun n'est recréé en boucle (voir le
  correctif n°4 pour le seul cas de recréation intempestive).
- **Appels réseau par minute, onglet visible et inactif : ~1,03** (heartbeat 1/min
  depuis ce correctif, c'était 2/min, + vérification de version toutes les 30 min).
  **Onglet en arrière-plan : ~0,03/min** (seule la vérification de version continue ;
  le heartbeat est suspendu et le tick d'horloge des statuts est local, sans réseau).
  Chaque passage en arrière-plan = 1 UPDATE ; chaque retour de focus = 1 UPDATE + 1
  fetch de version + (au plus 1/min) le rafraîchissement de présence.
- **Bundle** (`npm run build`) : chunk principal 124 ko gzip, vendor-supabase 57 ko,
  vendor-react 45 ko, icônes 9 ko ; Auth, Onboarding, Communautés (19 ko), Événements
  (18 ko), Admin, Premium... en chunks à la demande. **Rien d'anormal** (seuil de 150 ko
  gzip non atteint, aucune grosse dépendance dans le chunk principal). Les assets
  hashés sont servis `immutable` (`vercel.json`).

### Corrigé dans le code (commits atomiques, tests ajoutés)

1. **Chargement initial en cascade** : `loadAll` enchaînait profils+photos, puis le
   graphe social, puis (après `loadAll`) la requête du propre profil : 3 allers-retours
   en série (4 au-delà des 500 premiers comptes). Le propre profil part maintenant en
   parallèle des deux grosses requêtes, le graphe social dès qu'il répond, et l'écran
   de vérification de profil réutilise ce résultat. `src/lib/initialLoad.js`.
2. **N+1 des URLs signées** : une conversation de 30 messages dont 20 photos lançait
   20 POST `/object/sign` (`getSignedUrls`, déjà écrite, n'était appelée nulle part).
   Regroupement en un seul appel. `src/lib/signedUrlCache.js`.
3. **POST inutile à chaque like / message** : `trackActivation("first_like"/
   "first_message")` était rappelé à chaque action et échouait (409) après la première,
   soit une écriture refusée en plus par message envoyé. Mémorisé désormais.
4. **Réabonnements Realtime et rechargements à chaque réglage modifié** : 10 effets de
   `SocialShell` dépendaient de l'objet `currentUser` (remplacé à chaque bascule de
   confidentialité/préférence/avatar) : ~10 requêtes (2 listes de 2000 abonnements,
   500 derniers messages) + 3 canaux désabonnés/réabonnés par réglage (écriture dans
   `realtime.subscription` + fenêtre où un message peut être perdu). Dépendances
   réduites à `currentUser.id`. Le canal `posts-feed` ne se réabonne plus à chaque
   blocage.
5. **Rafraîchissement de présence qui ne pouvait pas fonctionner** : `.in("id", [~500
   uuids])` en GET (~19 ko d'URL) dépasse la limite de la passerelle ; l'erreur était
   ignorée, donc la présence des autres ne se rafraîchissait jamais dès ~220 profils.
   Lots de 100 ids + au plus 1 rafraîchissement par minute.
6. **Fil** : likes/commentaires chargés en parallèle de `post_media` (2 allers-retours
   au lieu de 3).
7. **Heartbeat de présence 30 s -> 60 s** : moitié moins d'UPDATE sur `profiles`
   (1 000 onglets visibles : ~33 -> ~17 écritures/s). Sans effet visible (le badge
   « En ligne » exige `last_seen` de moins de 10 min). Pour revenir en arrière :
   `HEARTBEAT_INTERVAL_MS` dans `src/lib/presenceHeartbeat.js`.
8. **Même famille de bug que le n°5, croisement exhaustif des `.in()`** (limite d'URL
   de la passerelle, ~38 caractères par uuid, seuil prudent 6 000 caractères) :
   corrigés par lots via `src/lib/inChunks.js` (`selectInChunks`, s'appuie sur `chunk.js`,
   parallélisme borné, un lot en erreur ne fait pas perdre les autres) —
   `CommunitiesTab` (likes, commentaires, statuts de participation, nettoyage au départ
   d'une communauté), `EventsTab` (profils des connexions mutuelles), `SocialShell`
   (aperçu des conversations, lots de 50 clés). Sous la limite d'URL, non découpés : `PostsFeed`
   (3 sites, 20 posts/page ; ses likes/commentaires restent soumis au plafond de 1000 lignes, voir n°9), `loadReactionsFor` (30 messages/page), suppression des
   photos d'un échec d'enregistrement (≤ 6 `MAX_PHOTOS`), statuts `event_attendees` du
   profil (3 valeurs constantes).
   **Plafond PostgREST de 1000 lignes par réponse** (audit de régression, 6 oct.) : un lot
   de 100 posts peut renvoyer plus de 1000 likes/commentaires (tronqué sans erreur, comme
   avant le découpage) ; ces deux lectures de `CommunitiesTab` paginent donc par `.range`
   (`selectAllPages`, ordre `id`). Les autres sites sont bornés par construction (une ligne
   par id : statuts, invitations, profils ; `messages` : `limit(500)`). La RLS SELECT de
   `messages` (participants uniquement, `supabase-protect-rls.sql`) conditionne le canal
   Realtime `conversations-preview` sans filtre au-delà de 100 clés : à vérifier en prod
   (`select policyname, qual from pg_policies where tablename = 'messages'` ne doit pas
   montrer `using (true)`).

9. **Croisement exhaustif du plafond PostgREST de 1000 lignes** (`max_rows`, troncature
   SILENCIEUSE, sans erreur). Aucun `supabase/config.toml` dans le dépôt : c'est le réglage du
   projet hébergé (Supabase > Settings > API > « Max rows », 1000 par défaut) qui s'applique —
   **à vérifier dans le tableau de bord** ; la pagination ajoutée est inoffensive s'il a été
   relevé. Un `.limit(N)` avec N > 1000 ne protège donc de rien. Corrigés par pagination
   `.order("id").range()` (`selectAllPages`, `src/lib/inChunks.js`), un test par site simulant
   un serveur qui tronque à 1000 :
   - **Chargement initial** (`lib/initialLoad.js`) : `limit(3200)` sur `profile_photos` ne livrait
     que **1000 photos** (profils au-delà de la 1000e photo, ordre `profile_id`, sans galerie
     dès ~170 comptes à 6 photos) ; *likes/passes/blocks* du graphe social et liste « Comptes
     bloqués » (**sécurité/vie privée : une liste de blocages tronquée faisait réapparaître des
     utilisateurs bloqués** dans Découverte/matches/conversations, `blockedIds` vient d'ici ;
     seul le filtrage côté client était touché, la RLS serveur sur le contenu restait active).
   - **Exporter mes données** (`lib/exportData.js`, extrait d'`App.jsx`) : 17 catégories, dont
     messages envoyés/reçus, tronquées à 1000 lignes sans signal (droit d'accès incomplet).
   - **Connexions mutuelles** d'`EventsTab` (likes envoyés/reçus), **Abonnements/Abonnés**
     (`lib/followLists.js`, `.limit(2000)` plafonné à 1000), **compteurs likes/commentaires du
     Fil** (`PostsFeed`, 20 posts dont un viral).

### ⬜ SQL à exécuter — `supabase-indexes-launch-fix.sql`

Index manquants confirmés par rapprochement requêtes client / index déclarés :
`favorites(to_id)`, `stories(expires_at)` et `(profile_id, created_at)` (table sans
aucun index, lignes expirées jamais purgées tant que `cleanup-expired-stories` n'est
pas déployée), `profiles(created_at)` (requête de démarrage de chaque session),
`profile_photos(profile_id, position)`, `community_posts`, `community_comments`,
`event_comments`, `event_invitations`, `community_invites`,
`community_join_requests`, `communities(created_at)`. Idempotent ; pas de
`concurrently` (l'éditeur SQL exécute dans une transaction) : chaque `create index`
bloque les écritures de sa table quelques ms à quelques secondes, à lancer hors pic.
Impact honnête : à l'échelle de la bêta, quasi invisible ; il évite que le coût de
chaque connexion/ouverture d'écran grandisse avec les tables après le lancement.
Volontairement NON inclus (hors chemin chaud) : les index de clés étrangères pour la
suppression de compte (`messages.from_id`, `notifications.actor_id`,
`story_views.viewer_id`, `community_posts.author_id`...) — à ajouter si
`process-scheduled-deletions` devient lent.

### Documenté, NON corrigé (refactors ou décisions produit)

- **Canaux Realtime non filtrables** (principal risque de coût à l'échelle) :
  `global-messages` écoute **tous** les INSERT de `messages` (la RLS borne la
  livraison, mais Realtime évalue la RLS pour CHAQUE abonné et CHAQUE message : N
  utilisateurs connectés = N vérifications par message) ; `reactions:<clé>` fait de
  même sur `message_reactions`. `messages` n'a pas de colonne destinataire, donc pas
  de filtre serveur possible. Pistes : diffusion « broadcast depuis la base » vers un
  canal par utilisateur, ou supprimer `global-messages` (l'aperçu est déjà alimenté par
  `conversations-preview`, filtré par `match_key`) en y déplaçant le compteur de
  non-lus. À surveiller dans Supabase : Realtime > Reports.
- **`conversations-preview`** (partiellement corrigé, n°8) : l'URL de la requête d'aperçu est
  désormais découpée en lots de 50 clés, et au-delà de 100 matches le canal Realtime
  s'abonne **sans** filtre `in` (limite Realtime de 100 valeurs ; la RLS borne la diffusion
  et les gestionnaires filtrent déjà par clé). Reste documenté : l'aperçu ne lit que les
  500 messages les plus récents de toutes les conversations (les compteurs de non-lus sont
  sous-estimés au-delà), et chaque lot est une requête de plus au démarrage (7 requêtes à
  350 matches).
- **Chargement initial lourd** : 500 profils (`OTHER_PROFILE_COLUMNS`) + 3200 photos
  `select("*")` à chaque session, avant d'afficher le Fil — le vrai remède est un
  classement/pagination côté serveur (voir le commentaire « item 12/13 » de `loadAll`).
  Au-delà de 500 comptes, la Découverte ne voit que les 500 plus anciens.
- **Ouverture d'une communauté** (`CommunitiesTab`) : tous les posts et tous les événements
  sont toujours chargés sans `limit` (aucun « charger plus » dans cet écran, donc pas de
  borne ajoutée sans changement visible). Les compteurs likes/commentaires et les statuts
  de participation passent désormais par lots de 100 ids (n°8) et ne tombent plus en silence
  dès ~200 posts, mais le volume lu croît toujours avec la communauté : une pagination (comme
  `PostsFeed`) reste à faire pour les grosses communautés.
- **Journal d'écran beta** : `trackBetaEvent("screen_view")` écrit une ligne dans
  `beta_events` à CHAQUE changement d'onglet (sans purge) — à retirer ou échantillonner
  pour le lancement public (décision produit).
- **Doublons mineurs** : `EventsTab` ouvre un second canal sur `notifications` (déjà
  couvert par celui de `SocialShell`) ; `usePremiumStatus` refait la même requête dans
  4 composants ; `EventsTab` recharge toutes les lignes `likes` du compte alors que
  `likePairs` les a déjà.

### Plafond de 1000 lignes — sites NON corrigés (décision/risque, audit du 6 oct.)

Lecture seule ou borne naturelle très inférieure à 1000 à l'échelle du lancement ; à
revisiter si la base grossit. Conséquence = liste/compteur incomplet, **jamais de fuite**.
- **Vie privée / sécurité** — aucun site restant n'a de conséquence de sécurité sans
  correctif, à une réserve près : `hidden_recommendations` (masquages de communautés/événements
  recommandés, `FeedTab`, `useHiddenRecommendations`) : au-delà de 1000 masquages d'un seul
  compte (irréaliste), un élément masqué réapparaîtrait (simple recommandation, rien de
  privé). Les blocages sont par ailleurs filtrés côté serveur par la RLS pour le contenu.
- **Contenu d'un seul objet, > 1000 lignes tronquées (le plus récent ou le plus ancien selon
  le tri)** : commentaires d'un post du Fil (`PostsFeed`, ordre croissant : les derniers
  commentaires disparaîtraient), commentaires d'un post de communauté et de discussion
  d'événement (même cas), `event_media` d'un événement, signalements ouverts d'une
  communauté/d'un événement (modération locale, `CommunitiesTab`/`EventsTab`), liste des
  personnes ayant vu un statut (`story_views`, le compteur, lui, est exact : `count` exact),
  posts et événements d'une communauté (tout est chargé sans `limit` : 1000 plus récents),
  membres d'une communauté et participants d'un événement (`limit(1000)` explicite, déjà
  documenté). Un post/une communauté à plus de 1000 éléments n'est pas réaliste avant une
  forte croissance ; correctif prévu : `selectAllPages` (commentaires) ou « charger plus ».
- **Listes personnelles bornées par l'action de l'utilisateur** (< 1000 en pratique) :
  adhésions et demandes de communautés, invitations (en attente/déclinées), `event_attendees`
  du compte, favoris envoyés (`SocialShell`), `immigration_news_favorites`, signalements
  déposés. Favoris **reçus** (`SocialShell`, compteur « incomingFavoritesCount ») : un profil
  très populaire (> 1000 favoris) verrait ce compteur plafonné à 1000.
- **Chargement initial** : les 500 profils chargés sont les 500 plus anciens
  (`created_at`), alors que les photos sont lues par `profile_id` (uuid, ordre sans lien
  avec l'ancienneté) : au-delà de ~500 comptes, une partie des 500 profils chargés n'a pas
  sa galerie dans le lot de 3200 photos. Le vrai remède (photos `.in("profile_id", ids)` par
  lots après les profils, ou pagination serveur de la Découverte) touche la cascade de
  chargement : hors périmètre, à traiter avec le point « Chargement initial lourd » ci-dessus.
- **RPC** : `get_my_likers()` renvoie un seul jsonb (non concerné par `max_rows`) ;
  `nearby_profiles` (`limit 100`) et les listes admin (`limit 200`) sont bornées côté SQL.
  Au-delà de 200 signalements/retours ouverts, la file d'administration n'en montre que 200.
