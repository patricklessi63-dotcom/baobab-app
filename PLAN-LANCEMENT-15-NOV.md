# Baobab — Plan de lancement du 15 novembre 2026

Rédigé le **mardi 20 octobre 2026 (J0)**. Cible : **dimanche 15 novembre 2026 (J+26)**.
S'appuie sur `AUDIT-BAOBAB.md` (constats C1–C7, I1–I13) et sur `LANCEMENT.md` (fiches SQL-1 à SQL-21, §8 fonctions,
§9 réglages, §10 décisions, §13 contrôles de santé), qui restent les références de détail. Rien ici n'a été exécuté.

**Trois colonnes dans chaque journée** : **(a) Assistant** = ce que je peux faire seul dans le dépôt (code, tests, doc) ;
**(b) Propriétaire** = ce que seul le propriétaire peut faire (SQL en production, secrets, déploiements, DNS, comptes,
tableaux de bord) ; **(c) Dépendance** = ce qui bloque la suite. Une case « (a) » suppose qu'une session de travail est
ouverte ce jour-là : l'assistant n'agit pas en arrière-plan.

**Hypothèse de charge du propriétaire** : environ 1 à 2 heures par jour en semaine, un peu plus le week-end. Si ce n'est pas
le cas, le chemin critique (section 3) glisse d'autant.

## 1. Recommandation (le propriétaire tranche)

1. **Lancer le web seul le 15 novembre.** Les apps natives ne peuvent pas tenir cette date (voir section 5) ; elles suivent.
2. **Reporter Stripe/Premium** après le lancement et masquer le bouton d'ici là (décision 13 de `LANCEMENT.md`).
3. **Ne pas annoncer l'IA** le 15 novembre, sauf si `ai-assist` est corrigé et testé d'ici le 6 novembre ; le bot d'aide
   « Baobab AI » (voir `BAOBAB-AI.md`) est proposé en **bêta fermée du 8 au 12 novembre**, et en production seulement s'il passe ses critères.
4. **Prévoir une voie de repli « ouverture progressive »** (hook de bêta maintenu, liste d'attente publique, invitations par vagues)
   si les critères de sécurité (section 4, bloc S) ne sont pas atteints au **9 novembre**. C'est un compromis, pas un échec :
   la date du 15 reste, l'ouverture devient plus étroite.
5. **Recommander un report** (au lieu d'un lancement dangereux) si un des seuils de la section 3 est franchi.

## 2. Ce qui tient, ce qui est à risque

| Sujet | Verdict | Pourquoi |
| --- | --- | --- |
| Site web (landing, légal, app) | **Tient** | En ligne, 1652 tests verts, build OK, 279 kB à l'accueil, aucune erreur console (AUDIT §0). |
| Sécurité des données de profil (C1, C2, I3) | **À risque, tenable** | Correctifs SQL à écrire, répéter, puis exécuter ; ~2 semaines de marge si le projet de répétition existe au 24 oct. |
| Mise à niveau de la base (SQL-1 à SQL-15) | **À risque** | Non exécutés ; aucun environnement de test ; 12 pièges d'ordre (`LANCEMENT.md` §6). Solo = risque d'erreur humaine. |
| Inscriptions + e-mails (SMTP, hook, DNS) | **À risque (le plus dépendant d'une action extérieure)** | DNS non résolu, SMTP inconnu, délais de propagation et de validation des fournisseurs. |
| Textes légaux, contact, Loi 25 | **À risque** | Adresse vide, aucun texte Québec, relecture juridique non commencée ; délai d'un tiers. |
| Observabilité (erreurs, santé, alertes) | **Tient si lancée avant le 2 nov.** | SQL-5 + panneau santé : petit travail. |
| Stripe / Premium | **Ne tient pas** (reporter) | Secrets, produits, webhook, tests : > 1 semaine, risque financier. |
| IA `ai-assist` | **Ne tient pas telle quelle** | Modèle retiré + clé absente + consentement. Corrigeable en ~1 jour de code **si** la clé est posée. |
| Bot « Baobab AI » | **Bêta seulement** | Conçu, rien d'implémenté ; 9 jours de développement et de tests possibles avant la bêta. |
| Apps natives | **Ne tient pas** | Builds jamais lancés ; Play : test fermé 14 j + ≈ 7 j ; Apple : compte + revue ; rien testé sur appareil. |
| Charge | **Inconnu** | Production : 4 comptes. Aucune preuve de comportement sous charge ; Supabase (offre inconnue) peut plafonner (connexions Realtime, e-mails Auth). |

## 3. Chemin critique et dates butoirs

Le chemin critique est une chaîne **dépendante du propriétaire** :

```
Bilan SQL (21 oct.) → projet de répétition (22-24 oct.) → SQL de mise à niveau en prod (27-30 oct.)
      → SQL de fermeture C1/C2/I3 en prod (31 oct.-2 nov.) → tests de sécurité à deux comptes (3-6 nov.)
      → bêta (8-12 nov.) → gel (13-14 nov.) → ouverture (15 nov.)

En parallèle, deux chaînes longues à lancer TÔT (délais de tiers) :
   DNS + SMTP : 21 oct. → prêts le 28 oct.  (propagation, validation du fournisseur d'e-mail)
   Légal : adresse de contact (22 oct.) → texte Loi 25 (assistant, 28 oct.) → relecture juriste (2-9 nov.) → publication (10 nov.)
```

| Date butoir | Condition | Si non atteinte |
| --- | --- | --- |
| **mercredi 21 oct.** | Bilan SQL lancé, résultat transmis | Tout le reste glisse jour pour jour. |
| **samedi 24 oct.** | Projet Supabase de répétition créé ; DNS et choix du SMTP lancés | Alerte : chaque jour de retard consomme la marge de la phase SQL. |
| **mercredi 28 oct.** | SMTP + DNS prêts, **test d'inscription avec une adresse externe réussi** ; SQL-1→SQL-5 répétés avec succès | Alerte rouge. |
| **lundi 2 nov.** | Mise à niveau SQL (SQL-1→SQL-15) et fonctions **déployées en production** et bilan sans « NON » en catégories web | **Au-delà du 4 nov. : recommander un report** ou une ouverture progressive. |
| **vendredi 6 nov.** | SQL de fermeture C1/C2/I3 en production ; tests à deux comptes verts ; e2e verts | **Au-delà du 9 nov. : pas d'ouverture publique** (ouverture progressive uniquement, ou report). |
| **lundi 9 nov.** | Adresse de contact en ligne sur les 3 pages ; texte légal relu ou décision écrite du propriétaire de lancer sans relecture | **Au-delà du 11 nov. : report** (impossibilité d'exercer ses droits = non conforme ; décision juridique du propriétaire). |
| **mardi 10 nov.** | Décision Baobab AI en bêta (oui/non) | Sans impact sur la date : le bot est retiré du périmètre. |
| **jeudi 12 nov.** | **Réunion GO / NO-GO** (section 4) | NO-GO = report ou ouverture progressive. |
| **vendredi 13 nov. 00 h** | Gel : plus aucun push risqué, aucun SQL, aucun déploiement de fonction | Correctifs critiques seulement, avec retour arrière prêt. |

## 4. Critères d'acceptation « GO / NO-GO » (mesurables)

Tous les critères du bloc S (sécurité) et du bloc P (parcours) sont **éliminatoires**. Les autres : GO si au moins 90 % atteints et aucun
éliminatoire en échec. Chaque critère a une commande ou une procédure ; le résultat est noté avec date et heure.

**Bloc T — tests automatiques (assistant exécute)**
- T1 `npm run build` : succès. T2 `npx vitest run --pool=forks --poolOptions.forks.singleFork=true` : 0 échec (référence au 20 oct. : 240 fichiers, 1652 tests). T3 `npm audit --omit=dev` : 0 vulnérabilité haute ou critique. T4 CI GitHub verte sur `main` (à relire par le propriétaire). T5 chunk principal ≤ 500 kB (seuil du test existant ; 487 kB au 20 oct.). T6 e2e (à créer) : les 8 parcours P1–P8 verts sur le site.

**Bloc S — sécurité (éliminatoire)**
- S1 Lecture anonyme de **toutes** les tables sensibles = `[]` (commande de `rls-test-commands.md` étendue à ~40 tables) ; en particulier `profile_photos` = `[]`.
- S2 Avec un compte de test A, un `select=*` sur `profiles` d'un autre profil **ne renvoie ni `birth_date`, ni `ban_reason`, ni `report_count`, ni `notification_preferences`**.
- S3 RPC d'administration appelées en anonyme : **401/403 avant d'atteindre le corps** (plus de réponse « Non autorise » P0001).
- S4 Bilan SQL (`LANCEMENT.md` §4) : **aucune ligne « NON »** pour les catégories web.
- S5 `git grep` + `git log -S` : aucun secret. `npx supabase secrets list` : aucun secret attendu manquant pour le périmètre lancé.
- S6 Un utilisateur B bloqué par A ne voit plus le contenu de A (SQL-3), un événement privé refusé n'est plus lisible (SQL-2), un compte < 18 ans ne peut pas être enregistré par appel direct (SQL-1).
- S7 Fonction `delete-account` supprimée ; `process-scheduled-deletions` redéployée ; une suppression de compte de test s'exécute **entièrement dans l'heure** qui suit le délai de 24 h (requête 7 du §13 : `en_retard = 0`).

**Bloc P — parcours essentiels (éliminatoire), deux comptes réels, adresse e-mail externe, site de production**
- P1 Inscription → e-mail reçu **en moins de 2 minutes** → confirmation → onboarding terminé. P2 Connexion, déconnexion, mot de passe oublié (lien reçu et fonctionnel). P3 Découverte → like mutuel → match. P4 Message texte, photo et vocal reçus en temps réel (**< 3 s**). P5 Publication, commentaire, signalement, blocage. P6 Création et adhésion à une communauté, publication. P7 Création d'événement, invitation privée, refus. P8 Statut (story) créé et vu. P9 Notifications dans l'app (et push web si activé). P10 Export de données puis suppression de compte. P11 Admin : traiter un signalement, suspendre puis rétablir un compte de test.

**Bloc F — performance et fiabilité (mesures réelles, aucun score inventé)**
- F1 Accueil : ≤ 300 kB transférés et ≤ 12 requêtes (20 oct. : 279 kB, 10 requêtes). F2 Aucune erreur console sur les 6 pages publiques à 375 px et 1280 px, sans débordement horizontal. F3 Aucun 401/403 inattendu au chargement d'une session neuve et d'une session ancienne (procédure AUDIT §9). F4 `client_errors` reçoit une erreur de test (preuve de l'observabilité) ; requêtes de santé du §13 sans anomalie. F5 Mesure externe PageSpeed/WebPageTest sur 4G simulée faite **par le propriétaire** (je n'ai pas d'outil Lighthouse) : seuil proposé LCP ≤ 2,5 s ; ce n'est pas un résultat acquis. F6 Test de charge **sur le projet de répétition** seulement (jamais en production) : pas d'erreur 5xx à 50 utilisateurs simultanés simulés.

**Bloc L — légal et conformité (éliminatoire pour a, b ; décision du propriétaire pour c)**
- L1 Adresse de contact et nom d'exploitant visibles sur confidentialité, conditions, suppression de compte, à-propos. L2 Texte confidentialité mis à jour : fournisseurs, IA, Québec/Loi 25 (rédaction du brouillon par l'assistant ; **validation par un juriste = décision du propriétaire**, non remplaçable par l'assistant). L3 Durée de conservation des sauvegardes notée (décision 11). L4 Âge minimal 18 ans : contrôle côté serveur actif (S6).

**Bloc O — exploitation**
- O1 Sauvegarde/PITR confirmée et **restauration comprise** (durée, point de retour). O2 Plan de retour arrière répété une fois (section 6). O3 Quelqu'un surveille les 3 premiers jours (qui, quand, quoi regarder : `LANCEMENT.md` §13). O4 Seuils d'alerte écrits : e-mails non confirmés > 30 %, `en_retard` > 0, une tâche planifiée en échec 2 jours de suite, un même message d'erreur > 20 fois/jour.

## 5. Les apps natives : pourquoi pas le 15 novembre

- **Android** : compte Google Play (25 USD, pièce d'identité), **test fermé de 12 testeurs pendant 14 jours consécutifs**, puis demande d'accès à la production (≈ 7 jours) — `STORES.md:497` : prévoir **3 semaines** avant la date. Il faudrait que les 12 testeurs aient installé une version au plus tard le **~25 octobre**, or le projet Android n'a **jamais été compilé** (`MOBILE.md:165`), Firebase n'existe pas, la clé de signature n'existe pas.
- **iOS** : compte Apple (99 USD/an, D-U-N-S si organisation), clé APNs, capacités, TestFlight, revue (durée variable, non garantie), jamais compilé, Premium visible dans l'app = rejet probable (décision 1).
- **Règles de boutiques** : contact publié (Apple 1.2/1.5), filtre à la publication (décision 2), consentement IA explicite (5.1.2(i)), compte de démonstration.
- Conclusion : **web le 15 novembre ; natif en décembre-janvier**, en démarrant dès maintenant les tâches à délai long qui ne gênent pas le web (comptes développeur, Firebase) **si le propriétaire le souhaite**.

## 6. Plan de retour arrière

| Élément | Comment revenir en arrière | Délai | Prérequis |
| --- | --- | --- | --- |
| **Site (Vercel)** | Dashboard Vercel > Deployments > déploiement précédent > « Promote / Instant Rollback » (ou `npx vercel rollback <url>`). Dernier déploiement sain connu au 20 oct. : celui d'il y a 12 jours (`baobab-2xnbhkid3`). | < 2 min | À **répéter une fois** avant le 12 nov. (non testé). |
| **Commit fautif** | `git revert <sha>` puis push (Vercel redéploie). **Jamais de force-push.** | 5 min | — |
| **SQL** | Chaque fiche de `LANCEMENT.md` §5 a un « Annuler ». Avant chaque fichier : sauvegarde/point de contrôle ; capturer la définition actuelle des fonctions touchées (`select pg_get_functiondef(...)`, `select * from pg_policies where tablename=...`) dans un fichier hors dépôt. Les SQL de fermeture (C1/C2/I3) que j'écrirai incluront leur propre bloc d'annulation et seront répétés sur le projet de répétition. | 5–15 min par fiche | Sauvegarde + PITR (O1). |
| **Edge function** | Redéployer la version précédente : `git checkout <sha> -- supabase/functions/<nom>` puis `functions deploy` (SHA indiqués en `LANCEMENT.md` §8.2 : `b4c3b41`, `1a3b3ca`). Désactiver une fonction : `npx supabase functions delete <nom>` (irréversible, à réserver aux fonctions inutiles comme `delete-account`). | 5 min | CLI connectée. |
| **Crons** | `select cron.unschedule('<nom>')` ; réactivation : rejouer le `cron.schedule` du fichier d'origine. | 1 min | — |
| **Inscriptions ouvertes → fermées** | Réactiver le hook « Before User Created » (liste blanche `beta_testers`) dans le tableau de bord Supabase : ferme les nouvelles inscriptions en une minute sans toucher au code. | 1 min | Liste blanche à jour. |
| **Fonctionnalité** | Interrupteurs : `app_config.monetization_enabled` (Premium), futur drapeau `baobab_ai_enabled` (bot), `app-version.json` (`updateRequired:true` seulement en dernier recours : force le rechargement). | 1–5 min | — |
| **Mise à jour forcée** | `public/app-version.json` → push. | 3 min | — |

## 7. Plan jour par jour

Légende des jours : **L** lundi … **D** dimanche. « Sem. » = semaine (`A` = avant gel, `G` = gel).

### Semaine 1 — Audit et mise en place (20–25 octobre)

| Jour | (a) Assistant (seul) | (b) Propriétaire | (c) Dépendance / jalon |
| --- | --- | --- | --- |
| **Mar 20 oct. (J0)** | Phase 1 : 4 documents + test de cohérence, vérifications §0 de l'audit. | Lire `SYNTHESE-PHASE-1.md`. Décider les points de la §6 de la synthèse. | — |
| **Mer 21** | Préparer le fichier de bilan (déjà dans `LANCEMENT.md` §4) ; rédiger la procédure de répétition. | **Lancer le bilan SQL** (SQL Editor, lecture seule) et me transmettre le résultat ; consigner région, sauvegardes, PITR (§9.4). **Choisir le fournisseur SMTP** ; **lancer l'ajout des enregistrements DNS** du domaine (Vercel > Domains > Cloudflare). | Bilan = jalon n° 1. |
| **Jeu 22** | Corriger `ai-assist` dans le dépôt (modèle `claude-haiku-5-5`, SDK, budget) **sans déployer** ; feature flags (masquer Premium, IA, compteur) avec tests. | **Créer le projet Supabase de répétition** (gratuit) ; **créer l'adresse de contact dédiée** et me la communiquer (je remplis `contact.json`). | — |
| **Ven 23** | Rédiger les SQL de fermeture : colonnes de `profiles`, `profile_photos` (+ versionner la table), `REVOKE EXECUTE … FROM anon` ; blocs d'annulation inclus. | Sur le projet de répétition : jouer le schéma de base (je fournis l'ordre) pour y reproduire la prod. | Répétition prête = jalon n° 2. |
| **Sam 24** | Tests RLS automatisables (script anonyme/connecté) ; écrire la liste des 8 parcours e2e. | Sauvegarde/point de contrôle de la prod. Vérifier Max rows ≥ 1000, hook de bêta, limites de débit Auth (§9). | Date butoir : répétition + DNS/SMTP lancés. |
| **Dim 25** | Panneau « Santé » de l'admin (lecture seule, requêtes du §13) ; tests. | Repos / relecture des décisions (§10 de `LANCEMENT.md`). | — |

### Semaine 2 — Corrections et mise à niveau (26 octobre – 1er novembre)

| Jour | (a) Assistant | (b) Propriétaire | (c) Dépendance |
| --- | --- | --- | --- |
| **Lun 26** | Brouillon de mise à jour légale (Loi 25, IA, fournisseurs, conservation) **à relire par un juriste** ; 404 réelle. | **Répétition** : exécuter SQL-1→SQL-5 sur le projet de répétition, vérifier avec le bilan. | — |
| **Mar 27** | e2e Playwright (parcours P1–P8) en CI contre la répétition ; tests SQL de fermeture. | Répétition : SQL-6→SQL-15 + mes SQL de fermeture ; test S2/S3 à deux comptes. | — |
| **Mer 28** | Corriger les écarts trouvés en répétition. | **SMTP et DNS prêts** ; test d'inscription avec une adresse externe. **Prod : exécuter SQL-1→SQL-5** (hors heures de pointe pour SQL-4) après sauvegarde. | **Date butoir** inscriptions/e-mails ; sans cela alerte rouge. |
| **Jeu 29** | Support aux exécutions ; bilan comparé avant/après. | **Prod : SQL-6→SQL-15**, un par un, bilan après chaque série. | — |
| **Ven 30** | Dossier d'annulation prêt pour chaque fiche. | **Déployer** `process-scheduled-deletions`, `cleanup-expired-stories`, `send-push` (`--no-verify-jwt`) ; **supprimer** `delete-account` après examen. | — |
| **Sam 31** | — | **Prod : SQL de fermeture C1/C2/I3** (ceux validés en répétition). Remplir `contact.json` via moi (push). | — |
| **Dim 1er nov.** | Tests S1–S7 scriptés ; rapport. | Si ancien test : supprimer le compte de test de septembre (via procédure, **pas** le script `cleanup-test-data` tel quel). | Jalon n° 3. |

### Semaine 3 — Tests et bot (2–8 novembre)

| Jour | (a) Assistant | (b) Propriétaire | (c) Dépendance |
| --- | --- | --- | --- |
| **Lun 2** | Bilan final catégorie web ; rapport écarts. | **Date butoir mise à niveau** : confirmer bilan sans « NON ». Envoyer le brouillon légal au juriste. Décider : bot d'aide en bêta ? **Si oui : créer la clé Anthropic** (secret, jamais dans le chat) et fixer un budget mensuel. | **Au-delà du 4 nov. : recommander report.** |
| **Mar 3** | Squelette de la fonction `baobab-ai-help` + table de compteurs (SQL à fournir) + corpus d'aide ; tests unitaires. | Poser `ANTHROPIC_API_KEY` ; décider quotas. | Dépend de la clé. |
| **Mer 4** | Consentement avant premier usage, mode dégradé, journalisation sans contenu ; tests. | Répétition : exécuter le SQL du bot. | — |
| **Jeu 5** | Jeu de 50 questions d'évaluation + tests d'injection ; mesure de coût. | Premiers essais du bot sur la répétition. | — |
| **Ven 6** | **Date butoir sécurité** : rapport S1–S7 ; e2e verts ; correctifs. | Test manuel à deux comptes (P1–P11) sur la **production**. | **Au-delà du 9 nov. : pas d'ouverture publique.** |
| **Sam 7** | Corriger les écarts. | Déployer `baobab-ai-help` en production **seulement** si les critères du bot sont atteints. | — |
| **Dim 8** | Préparer le tableau de suivi de la bêta. | **Ouverture de la bêta** (hook maintenu, invitations `beta_testers`). | — |

### Semaine 4 — Bêta, gel, lancement (9–15 novembre)

| Jour | (a) Assistant | (b) Propriétaire | (c) Dépendance |
| --- | --- | --- | --- |
| **Lun 9** | Triage quotidien des retours (`beta_feedback`, `client_errors`) ; correctifs non risqués. | **Date butoir légale** : contact en ligne ; décision de relecture juridique. Premier point bêta. | Légal. |
| **Mar 10** | Correctifs ; texte légal final si relu. | Publier le texte légal ; décision bot en production (oui/non). | — |
| **Mer 11** | Correctifs critiques seulement. | Répétition du retour arrière Vercel (O2). | — |
| **Jeu 12** | Rapport GO/NO-GO chiffré (blocs T, S, P, F, L, O). | **Réunion GO / NO-GO.** | **Décision.** |
| **Ven 13** | **Gel** : aucun changement non critique. | Vérifier sauvegarde fraîche ; prévenir les testeurs. | — |
| **Sam 14** | Dernière exécution de la suite et des sondes (lecture seule). | Dernière lecture des requêtes de santé ; préparer la surveillance. | — |
| **Dim 15 nov.** | Sondes toutes les heures pendant les premières heures (si session ouverte). | **Désactiver le hook de bêta** (si GO), faire une inscription réelle, la confirmer, surveiller §13 et Supabase Logs. | **Lancement.** |

### Après le 15 novembre (non planifié ici)
Stripe (mode test d'abord), comptes développeur et apps natives, anglais, discipline de migration, bot d'aide en production.

## 8. Ce que ce plan ne garantit pas

- Il suppose que le propriétaire dispose des heures indiquées et que les fournisseurs (DNS, SMTP, juriste) répondent dans les délais.
- Il n'a pas été confronté à des données ou une charge réelles : la production compte **4 comptes**.
- Les cases « à vérifier » (hook, SMTP, Realtime DELETE, Max rows, sauvegardes) peuvent faire apparaître des tâches nouvelles dès le 21 octobre.
- Aucun avis juridique n'est donné ; la conformité relève d'un professionnel.
