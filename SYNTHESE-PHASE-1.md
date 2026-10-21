# Baobab — Synthèse de la phase 1 (20 octobre 2026)

Détails et preuves : `AUDIT-BAOBAB.md`, `PLAN-LANCEMENT-15-NOV.md`, `BAOBAB-AI.md`. Rien n'a été modifié en production.

## 1. Diagnostic général

Le produit est **riche et bien testé** (1652 tests verts, build OK, 0 vulnérabilité npm, site propre à 375 et 1280 px, 279 kB à l'accueil, aucune
erreur console, aucun secret dans le dépôt ni l'historique). Le problème n'est plus le code : c'est **l'écart entre le dépôt et la production**
(≈ 21 fiches SQL jamais exécutées, 3 fonctions périmées ou absentes, une fonction fantôme) et l'**absence de preuve en conditions réelles** (4 comptes
en production, aucun test e2e, aucune observabilité, aucun environnement de répétition). Le 15 novembre est **tenable pour le web seul, à risque**.
Les apps natives, Stripe et l'IA ne tiennent pas cette date.

## 2. Les cinq risques ou problèmes les plus importants

1. **Fuites de lecture** : tout compte connecté lit tous les profils, colonnes sensibles comprises (`birth_date`, `ban_reason`…) ; les photos de profil sont
   **lisibles sans connexion** (sonde du 20 oct. : 11 lignes). Inacceptable avec des inscriptions ouvertes.
2. **Production en retard et non répétée** : SQL de sécurité non exécutés (âge 18 ans, blocage, événements privés), état exact inconnu tant que le bilan n'est pas lancé, `EXECUTE` accordé à `anon` sur les RPC.
3. **Ouverture des inscriptions non éprouvée** : hook de bêta, SMTP, domaine `baobab-app.ca` qui ne résout pas, adresse de contact vide, texte légal sans Québec/Loi 25 et sans relecture.
4. **Aucun filet** : `client_errors` absente, pas d'e2e ni de tests RLS, pas de test de charge ; un jour de lancement sans visibilité.
5. **Périmètre trop large pour la date** : IA cassée (modèle retiré en février 2026 + clé absente), Stripe non configuré, natif jamais compilé (Google Play exige ≈ 3 semaines).

## 3. Les dix améliorations prioritaires

1. Fermer C1/C2/I3 (colonnes de `profiles`, `profile_photos`, retrait de `EXECUTE` à `anon`), répété d'abord hors production.
2. Créer un projet Supabase de répétition et y jouer le bilan, les SQL et les tests RLS.
3. Lancer le bilan SQL et exécuter SQL-1→SQL-15 dans l'ordre de `LANCEMENT.md`.
4. Redéployer `process-scheduled-deletions` et `send-push`, déployer `cleanup-expired-stories`, supprimer `delete-account`.
5. SMTP, hook, Site URL, DNS du domaine ; test d'inscription avec une adresse externe.
6. Adresse de contact, nom d'exploitant, texte Loi 25, relecture juridique.
7. Observabilité : `client_errors` (avec limite de débit), panneau « Santé », alertes écrites.
8. Tests e2e (8 parcours) + tests RLS scriptés + CI planifiée de sondes.
9. Masquer Premium, IA et compteur « 4 membres » tant qu'ils ne sont pas prêts ; CAPTCHA à l'inscription.
10. Corriger `ai-assist` (modèle `claude-haiku-5-5`, budget global, consentement explicite) puis tester le bot d'aide en bêta.

## 4. Plan d'action réaliste jusqu'au 15 novembre

Chemin critique (propriétaire) : **bilan 21 oct. → répétition 24 oct. → SMTP/DNS prêts 28 oct. → SQL en prod 28 oct.–2 nov. → fermeture C1/C2 6 nov. →
bêta 8–12 nov. → GO/NO-GO 12 nov. → gel 13–14 nov. → ouverture 15 nov.** Dates au-delà desquelles un report (ou une ouverture progressive par invitations)
est recommandé : **4 nov.** (mise à niveau SQL), **9 nov.** (sécurité et contact légal), **11 nov.** (légal). Plan jour par jour, critères GO/NO-GO
mesurables et retour arrière (Vercel, SQL, fonctions, crons, hook d'inscription) : `PLAN-LANCEMENT-15-NOV.md`.

## 5. Fonctionnalités que le bot peut raisonnablement automatiser

- **Recommandation seule** : regroupement des erreurs répétitives, rapport de santé quotidien, anomalies de cohérence, doublons de notifications, rapports de performance, propositions de correctifs.
- **Action automatique bornée, réversible, journalisée, avec interrupteur** : purges de données déjà approuvées ; ajout d'un signalement à la file de modération ; ouverture d'une *issue* ou d'une *pull request* (jamais sur `main`).
- **Jamais automatique** : bannir, suspendre, supprimer, exécuter du SQL de production, déployer, toucher aux secrets.
- Le bot interactif d'aide (FAQ, onboarding, confidentialité) n'a **jamais** la clé de service ni accès aux conversations privées. **Conçu, rien d'implémenté** (`BAOBAB-AI.md`).

## 6. Éléments nécessitant l'approbation du propriétaire

Tout SQL en production et tout déploiement de fonction ; création du projet de répétition ; pose de toute clé (Anthropic, Stripe) ; choix du SMTP et du DNS ; texte légal et relecture juridique ;
adresse de contact et entité ; décisions 3, 4, 12, 13, 14, 15, 20 de `LANCEMENT.md` ; reporter Stripe et le natif ; bot d'aide en bêta (budget proposé : 20 $/mois) ;
procédure de contestation de la modération ; **le GO/NO-GO du 12 novembre**.

## 7. Tests confirmant que l'application est prête

- **Automatiques** : `npm run build` ; `npx vitest run --pool=forks --poolOptions.forks.singleFork=true` (référence : 240 fichiers, 1652 tests, 0 échec) ; `npm audit --omit=dev` (0 haute/critique) ; chunk principal ≤ 500 kB ; CI verte.
- **Sécurité** : lecture anonyme de toutes les tables sensibles = `[]` ; `select=*` sur le profil d'un tiers sans `birth_date`/`ban_reason` ; RPC d'administration refusées en anonyme avant leur corps ; bilan SQL sans « NON » ; aucun secret (`git grep`, `git log -S`).
- **Parcours manuels, deux comptes réels, site de production** : inscription avec e-mail externe reçu en < 2 min, connexion/réinitialisation, match, message temps réel < 3 s, publication/signalement/blocage, communauté, événement privé, statut, export puis suppression de compte effectuée dans l'heure, traitement d'un signalement par un modérateur.
- **Mesures** : accueil ≤ 300 kB et ≤ 12 requêtes (20 oct. : 279 kB, 10) ; zéro erreur console et zéro débordement sur les pages publiques ; zéro 401/403 inattendu au chargement ; `client_errors` reçoit une erreur de test ; mesure externe LCP faite par le propriétaire (non disponible ici, aucun score inventé).
- **Exploitation** : sauvegarde/PITR confirmée, retour arrière Vercel répété une fois, surveillance des 3 premiers jours assignée.
