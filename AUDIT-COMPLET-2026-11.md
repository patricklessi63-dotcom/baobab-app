# Audit complet de Baobab — rapport (3-4 novembre 2026)

Complète `RAPPORT-MESSAGERIE.md` (détail de la messagerie). Méthode : lecture du code, tests automatisés (vitest : jsdom + PGlite), et — nouveauté — **essais réels sur un projet Supabase de répétition** (`baobab-staging`, séparé de la production) avec deux comptes (A, B) plus un « outsider » : 3 scripts rejouables (`scripts/staging-e2e.mjs`, `scripts/staging-security.mjs`, structure exportable `scripts/staging-export-schema.sql`).

**Règles respectées** : aucun SQL exécuté en production (seule une lecture seule des catalogues Postgres, avec l'accord explicite du propriétaire) ; aucun compte de test en production ; aucune RLS ni protection désactivée ; aucune donnée supprimée ; aucun service payant ; aucun secret exposé (mots de passe de test dans `.env.staging.local`, ignoré par git).

> **Limites à connaître** — la répétition **n'est pas identique** à la production : structure exportée de la production, puis rejeu de 124 des 132 fichiers SQL et des blocs 1, 2, 3A, 3B, 4A de SQL-22 (l'état « exécuté en production » déclaré). 8 fichiers n'ont pas pu être rejoués et la RLS de 8 tables a dû être réactivée à la main. Les défauts ci-dessous viennent des **policies/fonctions réellement rejouées depuis les fichiers du dépôt** ; **à re-vérifier sur la production par l'exécutant autorisé** avant de conclure qu'ils y existent à l'identique. Aucun navigateur autre que Chromium (navigateur intégré + Chrome) n'a été utilisé ; aucun appareil physique.

## A–C. Bilan chiffré
- **Défauts détectés : 17** (messagerie 12, sécurité/base de données 5). **Corrigés et vérifiés : 12** dans le code déjà poussé ; **4 correctifs SQL livrés, vérifiés sur la répétition, NON exécutés en production** (voir G) ; **1 constat accepté** (ci-dessous).
- **Restent ouverts / à décider** : voir I.

| # | Défaut | Gravité | Cause | Correction | Vérification |
|---|---|---|---|---|---|
| 1 | Une personne **bloquée** peut encore écrire, réagir, téléverser, liker, suivre, mettre en favori | **Haute** | sous-requête `blocks` des policies exécutée avec les droits de l'appelant, qui ne voit que SES blocages | SQL-25 (fonction `is_blocked_pair` + policies restrictives) | PGlite (reproduction puis correctif) + répétition réelle |
| 2 | `client_errors` : un visiteur sans compte insère 2 000 lignes de 8 Ko (16 Mo) en une requête → risque de saturer les 500 Mo gratuits et de passer toute la base en lecture seule | **Haute** | policy `with check (true)` sans limite de nombre | SQL-28 (déclencheur 30/min, 300/jour, 3 000 au total + `profile_id` imposé) | PGlite + répétition (lot de 2 000 refusé) |
| 3 | Commentaires sans limite de débit (60 d'affilée acceptés) | Moyenne | aucun déclencheur sur `post_comments`/`community_comments`/`event_comments` | SQL-30 (20 / 5 min, 300 / 24 h) | PGlite + répétition (20 acceptés, 10 refusés) |
| 4 | 43 clés étrangères sans index (suppression de compte = parcours complet de chaque table liée) | Moyenne (performance) | index jamais créés | SQL-29 (`create index if not exists`) | appliqué sur la répétition : 0 FK sans index ensuite |
| 5 | Le badge « non lus » baissait quand l'autre lisait MES messages | Basse | décrément sans filtrer `from_id` | corrigé (`SocialShell`) | test de non-régression vérifié par mutation |
| 6 | Galerie de photos et traduction sans effet sous `React.StrictMode` (dev) | Basse (dev seulement) | `mountedRef` jamais remis à `true` | corrigé (+ autre session : 6 autres composants) | test StrictMode vérifié par mutation + essai réel |
| 7 | Boutons « Favoris » / « Préférences » du profil débordaient de 6 px à 320 px | Basse | `flex-1` sans `min-w-0` | corrigé (`ProfileTab`) | mesure sur la page réelle à 320 px |
| 8 | Champ de saisie : « Écris un message… » sur 2 lignes avec barre de défilement à 375 px | Basse | placeholder trop long | « Message » | essai réel |
| 9–17 | Autres défauts de messagerie (photos rognées, vocal sans forme d'onde/durée, vocaux vides envoyables, réactions multiples, frappe diffusée à chaque touche, séparateur de jour par année, aperçu « Média », clavier mobile…) | Basse à moyenne | voir `RAPPORT-MESSAGERIE.md` §3 | corrigés | tests + essais réels |

**Constat accepté, non corrigé** : l'expéditeur peut marquer « lu » son propre message (faux accusé sans autre effet) ; la personne bloquée peut relire l'historique (seul l'envoi est interdit par SQL-25).

## Rapport 1 — AUDIT ANTI-PIRATAGE
- **Méthode** : `scripts/staging-security.mjs` (105 contrôles, exécutés contre la répétition) + audit du code.
- **Testé et REFUSÉ comme attendu (105/105)** : lecture anonyme de 36 tables privées (messages, profils, positions, notifications, tokens push, signalements, rôles…) ; appel anonyme des RPC d'administration (`admin_*`, `ban_user`, `get_my_profile`…) ; énumération anonyme des buckets ; **élévation de privilèges** (passer `is_premium`, `is_founder`, `email_verified`, `banned_at`, `risk_level`… sans effet ; s'attribuer un rôle dans `platform_roles` refusé ; RPC admin refusées à un compte ordinaire) ; **données d'autrui** (modifier/supprimer le profil, les photos, les publications, les commentaires d'un autre ; lire ses positions, notifications, tokens, signalements ; fabriquer une notification, un like ou une publication au nom d'un autre ; lire `birth_date`/`ban_reason`) ; **messagerie** (lecture, écriture, usurpation `from_id`, modification du texte, suppression « pour tous » par un tiers, réactions par un outsider, Realtime : l'outsider ne reçoit aucun événement) ; **stockage** (écrire dans le dossier d'un autre, écraser/supprimer ses fichiers, téléverser `text/html` ou `image/svg+xml`, URL signée refusée à l'outsider, bucket privé non lisible anonymement).
- **Code** : aucune clé secrète dans `src/`, `index.html` ni `public/` (le seul `service_role` trouvé est un commentaire) ; aucun `eval`/`new Function` ; un seul `dangerouslySetInnerHTML` (logo : titre nettoyé, contenu statique) ; les liens des messages ne sont que `http(s)` ; `target="_blank"` avec `rel` ; aucun `.env` ni clé de signature suivi par git (seul `.env.example`) ; `npm audit` en production : **0 vulnérabilité** (6 avis « modérés » sur des outils de développement — vitest, esbuild, minimatch — non livrés aux utilisateurs).
- **Sécurité base** : toutes les tables ont la RLS ; toutes les fonctions SECURITY DEFINER ont un `search_path` figé ; **une seule** fonction exécutable par `anon` (`public_user_count`, compteur de la page d'accueil) ; **une seule** policy d'écriture ouverte (`client_errors_insert_anyone`, corrigée par SQL-28).
- **Corrigé** : #1, #2, #3 ci-dessus (**livrés en SQL, non exécutés en production**).
- **Restant** : 15 connexions échouées de suite n'ont **jamais** été limitées (429) sur la répétition : la limitation par défaut de Supabase Auth est trop souple pour freiner une attaque lente — à régler dans **Authentication > Rate Limits** + envisager une protection anti-robot (Turnstile/hCaptcha, gratuits) : **réglage du tableau de bord, décision du propriétaire** (aucun code ni service payant ajouté). Journalisation des actions sensibles : `admin_actions` existe pour l'administration ; pas de journal pour les actions utilisateur (acceptable). Tests CSRF : sans objet (API sans cookie, jeton en en-tête).
- **Non testé** : fonctions Edge réelles (`send-push`, `ai-assist`…), webhook Stripe, authentification par email externe, injection SQL via les filtres `.or()` du client (le code utilise `escapeOrFilterValue`/`escapeLikePattern`, couvert par des tests unitaires, pas par un essai réel).

## Rapport 2 — AUDIT UX/UI
- **Pages / écrans vérifiés (essais réels, compte A)** : accueil public, connexion, inscription, assistant d'inscription (10 étapes), Découverte, Rencontres, Messages (liste + conversation), Intégration, Profil, fenêtre de publication, visionneuse de photos, fenêtre de transfert, mode sélection, menus de messages.
- **Problèmes visuels / ergonomiques trouvés** : #7 et #8 ci-dessus (corrigés) ; l'heure d'une photo partageait la ligne de l'image (corrigé : pastille en surimpression) ; bouton de vitesse du vocal chevauchant l'heure à 375 px (corrigé).
- **Faux positif écarté** : des boutons d'icônes mesurent 13–15 px, mais la classe `bb-hit` ajoute une zone tactile de 44 px (CSS `pointer: coarse`) : conforme.
- **Accessibilité** : curseur de lecture vocale au clavier (flèches, début, fin), étiquettes `aria` des réactions, `aria-live` du compteur de sélection ; réduction des animations respectée par la règle globale.
- **Restent** : états « connexion perdue / accès interdit / action refusée » vérifiés seulement par les tests existants et un essai « backend injoignable » ; contrastes non mesurés outil en main ; pas d'audit lecteur d'écran réel.

## Rapport 3 — AUDIT COMPATIBILITÉ
- **Testé réellement** : Chromium (navigateur intégré) en émulation de largeur **320, 375, 414, 768, 1024, 1440 px** sur les 5 onglets principaux (aucun débordement horizontal de page après correctif #7) ; **Google Chrome** (Windows) en bureau pour le second compte ; conversation mobile (375 × 812) ; faux `visualViewport` pour le clavier.
- **Navigateurs NON testés** : Firefox, Edge, Safari (macOS et iOS), Chrome Android, applications Capacitor. **Appareils physiques : aucun.** Clavier virtuel, encoche/zones de sécurité, gestes tactiles réels, orientation paysage mobile, lecture audio Safari : **non vérifiés** (simulation seulement).
- **Compatibilité audio** : l'enregistrement choisit `audio/mp4` en priorité (Safari l'exige) puis webm/ogg ; vérifié : Chrome enregistre bien en m4a ; Safari/Firefox **non essayés**.
- **Problèmes détectés** : #7, #8. **Corrections** : idem.

## D–E. Optimisations
Messagerie : frappe limitée à 1 diffusion / 2 s (au lieu d'une par touche) ; historique chargé automatiquement ; signature d'URL en lots (déjà présente) ; **43 index de clés étrangères** (SQL-29, non exécuté) ; plafond de `client_errors`. Mesure : 610 messages affichés = ~7 500 nœuds DOM, mise en page ≈ 4–11 ms. Bundle principal ~508 Ko (150 Ko gzip) : un avertissement de taille existe, pas de régression ; **pas de découpage supplémentaire fait**.

## F. Fichiers modifiés (cette série)
`src/components/social/ProfileTab.jsx`, `src/components/SocialShell.jsx`, `src/components/social/ConversationPane.jsx`, `RAPPORT-MESSAGERIE.md`, `LANCEMENT.md`, `PLAN-LANCEMENT-15-NOV.md`, `DEPLOIEMENT.md`, `.gitignore`. Nouveaux : `scripts/staging-export-schema.sql`, `scripts/staging-e2e.mjs`, `scripts/staging-security.mjs`, tests `src/native/{blockEnforcement,clientErrorsRateLimit,commentRateLimit}.test.js`, ce rapport.

## G. Migrations SQL créées (toutes NON exécutées en production)
| Fichier | Rôle | Risque |
|---|---|---|
| `supabase-block-enforcement-messages-fix.sql` (SQL-25) | blocage effectif pour messages, réactions, stockage, likes, follows, favoris, invitations | additif ; policies restrictives |
| `supabase-client-errors-rate-limit-fix.sql` (SQL-28) | plafond des écritures anonymes de `client_errors` | additif ; peut perdre des rapports d'erreur pendant une inondation |
| `supabase-fk-indexes-fix.sql` (SQL-29) | 43 index | additif ; verrou d'écriture très bref par table, hors heures de pointe |
| `supabase-comment-rate-limit-fix.sql` (SQL-30) | limite de débit des commentaires | additif |
Chacun a son en-tête (contrôle + retour arrière) et figure dans `LANCEMENT.md` §5/§7 et, pour deux d'entre eux, `DEPLOIEMENT.md`. **Aucune sauvegarde n'existe** (offre gratuite, critère O1) : à décider avant d'exécuter quoi que ce soit.

## H. Tests exécutés
Voir le résultat final de la suite complète en bas du fichier (§ Validation globale). Essais réels : 35 contrôles API messagerie (`staging-e2e`) et 105 contrôles de sécurité (`staging-security`), tous réussis sur la répétition après correction de ses écarts avec la production (RLS réactivée, SQL-22, SQL-25 appliqués).

## I. Impossible à corriger automatiquement / décisions humaines
1. **Exécuter SQL-25, 28, 29, 30 en production** (accord explicite ; sauvegarde à trancher).
2. **Limite de connexions échouées** et anti-robot : réglage du tableau de bord Supabase.
3. Vérifier en production (par l'exécutant autorisé) que les défauts 1–3 y existent bien : la répétition les montre, la production peut différer.
4. 8 fichiers SQL non rejoués sur la répétition (SQL-22 complet, quota de stockage…) : leurs comportements n'ont pas été éprouvés.
5. Tests sur appareils réels (iOS/Android), Safari/Firefox/Edge.

## J. Recommandations
Créer une **sauvegarde** avant toute migration (passer au plan payant le temps du lancement ou exporter `pg_dump` régulièrement) ; garder la répétition à jour (rejouer chaque nouveau SQL dessus d'abord) ; ajouter `staging-security.mjs` à la routine avant chaque ouverture ; limiter par IP côté passerelle (Cloudflare gratuit) si le trafic grossit ; surveiller la taille de la base (`client_errors`, `notifications`, `analytics_events`).

## Bilan par domaine
| Domaine | État |
|---|---|
| Frontend | OK (réserve : navigateurs non testés) |
| Backend / Edge functions | **Non audité en réel** (fonctions non déployées sur la répétition) |
| Base de données | **À corriger** : SQL-25/28/29/30 à exécuter |
| Sécurité | **À corriger** : mêmes SQL + limitation des connexions (tableau de bord) |
| Messagerie | OK sur la répétition (réserve : appareils réels, iOS/Android, vrai micro) |
| Interface mobile | OK en émulation (réserve : appareils réels) |
| Performances | OK aux volumes mesurés (réserve : index SQL-29 et mobiles modestes non mesurés) |
| Tests | OK (suite complète verte, voir ci-dessous) |

## Validation globale (4 novembre 2026, après rebase sur `main`)
- `npm run build` : **réussi** (avertissement habituel de taille de chunk, sans régression).
- Suite complète `vitest run` : **289 fichiers, 2 301 tests, tous réussis** (4 workers ; les tests sensibles à la charge passent quand la machine n'exécute pas d'autre tâche lourde).
- Essais réels sur la répétition : `staging-e2e` 35/35 (dont 2 constats « INFO » acceptés) ; `staging-security` 105/105.
- Pas de configuration de lint ni de vérification de types dans le dépôt (JavaScript sans TypeScript) : **non exécutés**, rien d'inventé.
- Contrôle de fumée visuel : 5 onglets × 6 largeurs, aucune erreur JavaScript nouvelle, aucun débordement horizontal.

## Essai de SQL-27 (« supprimer pour tout le monde », délai serveur) sur la répétition — 4 novembre 2026
Écrit par une autre session (validé par elle sur PGlite seulement) ; **joué par l'auteur de ce rapport sur `baobab-staging` avec les comptes A et B** (API, via le script jetable `dw.mjs`, non versionné) : **10/10 contrôles réussis** — le destinataire ne peut pas supprimer « pour tous » ; l'auteur supprime dans le délai ; le texte est remplacé par « Ce message a été supprimé. » (ce que voit aussi le destinataire) ; `deleted_by` est posé par le serveur ; une suppression ne peut pas être annulée ; la suppression arrive en Realtime chez le destinataire ; **après 15 minutes** (message antidaté en base) la suppression est refusée avec le message de délai ; une photo supprimée voit son `media_path` neutralisé (`deleted`). **Interface vérifiée en réel** (compte A, mobile) : le menu propose « Supprimer pour tout le monde », la fenêtre de confirmation s'ouvre (texte encore « irréversible … tous les participants »), la bulle devient « Ce message a été supprimé. ». **Non testé** : le libellé dépassant le délai dans l'interface, le nettoyage du fichier Storage côté client, le réglage `app_config.message_delete_window_minutes` modifié. SQL-27 reste **NON exécuté en production**.

## Exécution en production — 4 novembre 2026
Sur **accord explicite du propriétaire** (réponse « Autoriser »), après annonce à l'autre session (seule exécutante habituelle), **SQL-25, SQL-28, SQL-30, SQL-27 puis SQL-29** ont été exécutés **dans cet ordre** depuis le SQL Editor de la production, **sans sauvegarde** (critère O1 toujours non rempli : offre gratuite). Chaque fichier a été collé tel quel (contrôle de longueur et de contenu), exécuté une seule fois ; l'avertissement « destructive operations » du tableau de bord ne portait que sur les `drop … if exists` idempotents de leurs propres objets. Un instantané de lecture seule des règles d'origine (43 policies, définition d'origine de `enforce_message_update_rules`, déclencheurs) a été pris AVANT et gardé HORS dépôt (scratchpad de la session).

**Vérifié en lecture seule APRÈS** : 7 policies `*_block_enforcement_insert` / `chat-media: blocage entre participants` toutes RESTRICTIVES ; `is_blocked_pair` en SECURITY DEFINER, exécutable par `authenticated` seulement ; `app_config.message_delete_window_minutes` = 15 et `enforce_message_update_rules` à jour ; 4 déclencheurs (`trg_client_errors_guard`, 3 limites de commentaires) ; **0 clé étrangère sans index** ; **0 table sans RLS** ; seule `public_user_count` reste exécutable par `anon` ; données intactes (105 messages, 1 ligne `client_errors`).
**Non vérifié en production** : le comportement fonctionnel (A bloque B → B refusé, rafale de commentaires, suppression avec délai), car aucun compte de test ne doit être créé en production ; il a été vérifié sur la répétition. À recouper par la session qui fera les sondes anonymes.
**Retour arrière** : en tête de chaque fichier (SQL-27 : la définition d'origine de la fonction est dans l'instantané et dans l'en-tête du fichier ; la colonne `message_delete_window_minutes` et la contrainte restent, sans effet).

## SQL-34 (ex-« SQL-31 ») — affinage de SQL-28, livré NON exécuté
Revue croisée du 4 novembre : les plafonds de SQL-28 (déjà exécuté) étaient globaux. `supabase-client-errors-rate-limit-v2-fix.sql` (**SQL-34**, renuméroté pour éviter une collision avec SQL-31 à 33 annoncés par une autre session) ajoute : dédoublonnage silencieux (même message + même 1re ligne de pile en 10 min), plafonds séparés anonymes (20/min, 500/jour) / connectés (120/min, 5 000/jour), plafond de taille de 100 Mo. Validé PGlite (17 tests) et répétition ; **exécuté en production le 4 novembre 2026** sur autorisation explicite du propriétaire (sans sauvegarde) ; vérifié ensuite en lecture seule : fonction v2 active (dédoublonnage + plafond de taille présents), SECURITY DEFINER, aucun droit d'exécution pour `anon`, déclencheur et policy inchangés, table à 64 ko / 1 ligne.

## Essai de SQL-31 (modération du texte) sur la répétition — 4 novembre 2026

Fichier `supabase-moderation-text.sql` appliqué sur le projet de répétition `baobab-staging` (jamais en production), puis joué avec de vrais comptes (script hors dépôt, 60 contrôles).

- **Défaut bloquant constaté** : `moderation_apply_ladder` (suspension, bannissement) et `moderation_revoke` mettent à jour `profiles.suspended_until` / `banned_at` sans poser `baobab.trust_column_write`. Le déclencheur `trg_protect_profile_trust_columns` refuse alors l'écriture dès qu'un utilisateur connecté déclenche l'appel : les avertissements 1 à 4 passent, la 5e infraction lève une erreur, **aucune suspension ni aucun bannissement automatique**. Correctif : `perform set_config('baobab.trust_column_write', 'on', true);` avant chacun des 4 `update profiles`. Signalé à la session auteur, qui corrige le fichier.
- **Avec ce correctif (appliqué sur la répétition seulement)** : échelle 4 avertissements / suspension 24 h / 2e suspension / 3e suspension = bannissement (journal 12 / 2 / 1) ; sessions et jetons de rafraîchissement révoqués ; empreinte d'e-mail sans e-mail en clair ; réinscription refusée (même adresse, +alias, points Gmail, googlemail.com, majuscules) et adresse non bannie acceptée ; journal des décisions non modifiable (UPDATE/DELETE refusés) ; tables et fonctions de modération inaccessibles à un utilisateur ordinaire et à l'anonyme ; `my_moderation_status()` limité à l'appelant.
- **Observation** : un compte banni peut se reconnecter par mot de passe ; ses écritures (publication) sont ensuite refusées par la RLS. Si « connexion refusée » est exigé, poser `auth.users.banned_until`.
- **Non testé** : l'interface, les rapports de médias, la purge planifiée, le comportement sur la base de production.
- **Rejeu après correctif de la session auteur (fichier du dépôt appliqué tel quel sur la répétition)** : 61/61 contrôles réussis, sans correctif provisoire. Échelle jusqu'au bannissement, sessions et jetons révoqués, **connexion par mot de passe refusée pour un banni** (« User is banned », `auth.users.banned_until` ≈ +100 ans), **connexion rétablie, empreinte retirée et réinscription de l'adresse de nouveau possible après la levée** ; journal : `ban_applied` puis `ban_lifted`. Le défaut du drapeau `trust_column_write` et l'observation sur la reconnexion sont donc corrigés. Toujours non testé : interface, purge planifiée, production.

## Contrôle en lecture seule de `admin_list_reports` en production — 5 novembre 2026

Demandé après un HTTP 400 constaté sur l'onglet Signalements du tableau de bord (aucune écriture en production).

- **Journaux (API Gateway + Postgres)** : 6 appels `POST /rest/v1/rpc/admin_list_reports` en 400 (4 nov. 16:05, 5 nov. 00:15 à 00:19), chacun correspondant à la seconde près à `ERROR: UNION types uuid and bigint cannot be matched`. Aucune erreur « column reference "category" is ambiguous » (42702) sur 3 jours.
- **Cause réelle** : en production `reports.id` est `bigint` (export du catalogue de production), alors que `community_reports`, `event_reports`, `post_reports` et `info_reports` ont un `id` `uuid` ; la branche « profile » du `UNION ALL` ne peut pas être unifiée. Cette erreur d'analyse survient avant l'`ORDER BY`.
- **Second défaut, masqué par le premier** : la définition en base se termine par `order by case category … created_at desc limit 200`, colonne non qualifiée alors que `RETURNS TABLE` expose `category` (42702 attendu une fois le UNION réparé). Le fichier `supabase-admin-list-reports-hotfix.sql` corrige seulement celui-ci : **il ne supprimerait pas le 400 en production** tant que le type de `reports.id` n'est pas traité. Signalé à la session auteur ; hotfix NON exécuté.
- **Limite du contrôle** : seule la fin de la définition a pu être lue (un second essai de lecture a été refusé par le classifieur d'autorisation).
- **Suite (5 novembre)** : `supabase-admin-list-reports-hotfix.sql` (v2 : id de signalement de profil encodé en uuid réversible, branche `profile` ajoutée à `admin_resolve_report`, test PGlite avec `reports.id` en bigint et en uuid) — **livré, NON exécuté en production** (exécution = accord explicite du propriétaire, un fichier à la fois). Relecture statique : aucune autre fonction ni aucun déclencheur du dépôt ne compare `reports.id` à un uuid (les autres usages comptent par `status` / `from_id`). Non vérifié : la définition réelle d'`admin_resolve_report` en production (non lue : seconde lecture refusée par le classifieur d'autorisation) ; si elle contient `id = p_id` sur `reports`, la résolution d'un signalement de profil y échoue aussi (bigint = uuid).
- **Lecture de `admin_resolve_report` en production (5 novembre, lecture seule, accord de l'utilisateur)** : la définition en base est la version du correctif de course (verrou `for update`, « Signalement introuvable ou deja traite ») avec seulement les sources `community`, `event`, `post`, `info` ; **pas de branche `profile`** : toute tentative de résoudre un signalement de profil lève « Source inconnue ». Le hotfix v2 (branche `profile` + id uuid réversible) la complète sans changer la signature. Rien n'a été modifié en production.
- **Exécuté en production le 5 novembre 2026** (par la session auteur, accord explicite du propriétaire, une seule exécution, `create or replace`) : `supabase-admin-list-reports-hotfix.sql`. Vérifié en lecture seule : `admin_list_reports` contient `r.category`, `to_hex` et `limit 200` ; `admin_resolve_report` contient la branche `profile` ; droits inchangés (pas d'`anon`) ; la requête interne rejouée sur les données de production passe (signalement de profil `reports.id = 3` → `00000000-0000-0000-0000-000000000003`). L'appel de la fonction avec le compte technique répond « Non autorise » (attendu : pas de rôle modérateur). **Non testé de bout en bout** : l'onglet Signalements avec un vrai compte modérateur (à confirmer par le propriétaire : plus de HTTP 400, résolution d'un signalement de profil).

## Rejeu de SQL-31 (version « identifiants d'images en texte », commit 0619d45) sur la répétition — 5 novembre 2026

Fichier `supabase-moderation-text.sql` rejoué tel quel sur `baobab-staging` (où l'ancienne version, `target_id` en uuid, était installée et où `profile_photos.id` est un bigint comme en production). Jamais en production.

- **Mise à niveau** : s'applique sans erreur, deux fois de suite ; `media_reports.target_id` et `media_moderation.target_id` passent en `text` en conservant les lignes existantes ; une seule signature par fonction (`report_media`, `moderate_media`, `admin_media_info`, `admin_media_queue`), aucune surcharge uuid restante ; `authenticated` peut les exécuter, `anon` non.
- **Photo de profil par id entier** : signalement avec un id numérique JSON (comme le client) ou texte ; doublon ignoré ; 2 signalements = visible, 3 comptes anciens = **masquée** ; état « masquée » lisible par l'application ; visible dans `admin_media_queue` (motifs agrégés) ; `admin_media_info` renvoie l'adresse et le propriétaire ; `moderate_media('restore')` la rétablit et la verrouille (un nouveau signalement ne la re-masque pas) ; décision journalisée (`profile_photo:3`). Refus pour un anonyme et pour un utilisateur ordinaire (« Non autorise »).
- **Régression** : les 61 contrôles du premier essai (échelle, bannissement, connexion refusée, réinscription, journal, droits) et le cycle bannissement/levée passent toujours.
- **Non testé** : l'interface (onglets Règles et File d'images), les suggestions de règles, la purge planifiée, les médias privés (messages, événements), la production.
