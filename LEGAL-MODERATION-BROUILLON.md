# Brouillon de textes légaux — modération automatique (à FAIRE VALIDER avant publication)

**Statut : brouillon rédigé le 5 novembre 2026. Rien n'est publié.** Les pages en ligne (`src/legalContent.jsx` : Conditions d'utilisation § 8 « Signalement, blocage et modération » ; Politique de confidentialité §§ 2, 4, 5) ne mentionnent pas encore la modération automatique décrite dans `MODERATION.md`. Ce texte est à relire par le propriétaire, idéalement par un juriste (Loi 25 du Québec, LPRPDE). Il n'est pas un avis juridique. Il décrit ce que le code SQL-31 fait **réellement** ; si une règle change (seuils, durées, conservation), corriger ce texte en même temps.

À publier **en même temps** que l'exécution de SQL-31 en production, pas avant (sinon le texte décrit un traitement qui n'existe pas encore).

---

## A. Conditions d'utilisation — à ajouter au § 8 « Signalement, blocage et modération »

> **Détection automatique et sanctions progressives.** Pour protéger la communauté, Baobab analyse automatiquement le texte que vous envoyez (messages privés, publications, commentaires, statuts, biographie) afin de repérer les insultes, les propos haineux ou discriminatoires, les menaces et le harcèlement. Un texte clairement interdit est refusé avant d'être transmis ; il n'apparaît jamais chez son destinataire. Un texte ambigu peut être accepté puis placé en file de relecture humaine, sauf pour les messages privés, qui ne sont jamais relus par ce moyen.
>
> Les infractions confirmées entraînent des sanctions progressives : les quatre premières donnent un avertissement ; la cinquième suspend votre compte pendant 24 heures ; nous continuons ensuite de compter, et la troisième suspension entraîne le bannissement définitif du compte. Un signalement non vérifié ne déclenche jamais de sanction automatique. Chaque infraction n'est comptée qu'une fois.
>
> Vous pouvez contester une sanction automatique depuis l'écran de votre compte suspendu ou banni ; un modérateur examine votre contestation. Le contournement d'une sanction (par exemple créer un nouveau compte avec la même adresse courriel pour revenir après un bannissement) est interdit et peut être bloqué.
>
> Nous ne détectons pas automatiquement les images à ce jour : une image peut être masquée à l'affichage après plusieurs signalements indépendants, en attendant l'examen d'un modérateur.

## B. Politique de confidentialité — ajouts

**§ 2 (Données que nous collectons) — ajouter :**

> • Données de modération : l'historique des infractions détectées (compte concerné, source du texte, catégorie, terme détecté, date), les sanctions appliquées et les décisions des modérateurs. Pour un message privé, nous ne conservons ni le texte ni un extrait, seulement le terme détecté et une empreinte technique qui évite de compter deux fois le même texte. Pour une publication ou un commentaire public, un extrait de 200 caractères au plus est conservé.
> • Registre d'adresses courriel de comptes bannis : lorsqu'un compte est banni, nous conservons une empreinte chiffrée (et non l'adresse en clair) de son adresse courriel, uniquement pour empêcher qu'elle serve à recréer un compte banni.

**§ 4 (Finalités) — compléter « modérer les contenus signalés et prévenir les abus » :**

> … y compris la détection automatique de contenus interdits, l'application de sanctions progressives et la prévention du contournement d'un bannissement (intérêt légitime : sécurité de la communauté). Ces décisions sont fondées sur des règles fixes et publiques ; elles peuvent être contestées auprès d'un modérateur, qui les examine à la main.

**§ 5 (Conservation) — ajouter :**

> Les infractions détectées sont supprimées au bout de **365 jours** (durée à confirmer) ; l'historique des sanctions et le journal des décisions de modération sont conservés pour pouvoir répondre à une contestation et établir qu'une règle a été appliquée. L'empreinte d'une adresse courriel bannie est conservée tant que le bannissement est en vigueur ; elle est supprimée si le bannissement est levé. Nous ne conservons pas les adresses IP à des fins de modération.

## C. Points à décider avant de publier

1. **Durée de conservation des infractions** : 365 jours par défaut (`moderation_purge_old`, à lancer à la main chaque mois ou par `pg_cron`). Confirmer ou changer.
2. **Bannissement automatique** : actif par défaut (3e suspension). Si le propriétaire préfère une confirmation humaine, régler `auto_ban_enabled = false` ET adapter le texte A (« entraîne le bannissement » devient « peut entraîner »).
3. **Responsable de la protection des renseignements personnels et adresse de contact** : requis par la Loi 25 ; pas encore définis dans l'application (voir `LANCEMENT.md`).
4. **Décision automatisée** : la Loi 25 impose d'informer la personne qu'une décision est fondée exclusivement sur un traitement automatisé et de lui permettre de présenter ses observations. Le texte A et la contestation couvrent cela ; un juriste doit confirmer que c'est suffisant.
5. **Images** : le texte A dit que les images ne sont pas détectées automatiquement. Si un service d'analyse est ajouté un jour, il faudra nommer le sous-traitant (transfert de données hors Canada éventuel) et obtenir le consentement approprié.
