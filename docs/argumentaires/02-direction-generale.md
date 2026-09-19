# Argumentaire — Direction générale et Présidence

## Ce que la banque gagne, ce qu'elle risque en ne faisant rien, et ce qu'on lui demande d'engager

**Public :** Directeur général, Président, membres du comité de direction
**Durée de présentation conseillée :** 20 minutes, dont 10 de questions
**Classification :** usage interne

---

> **En une phrase.** L'actif que ce dispositif construit n'est pas un score : c'est l'historique structuré qui permettra, dans dix-huit à vingt-quatre mois, d'estimer une probabilité de défaut propre à la banque — et chaque mois sans collecte est un mois de cet actif qui ne se constitue pas.

---

## 1. Le constat de départ

La banque dispose d'outils de notation pour le financement de projets et la promotion immobilière. Elle n'en a aucun pour ses contreparties entreprises de droit commun, qui constituent l'essentiel du portefeuille corporate.

L'appréciation du risque y repose sur le jugement de l'analyste. Cela produit trois effets mesurables :

- **une variabilité d'appréciation** entre chargés d'affaires, entre agences et entre régions, qu'aucun dispositif ne mesure aujourd'hui ;
- **une impossibilité de rejouer une décision passée** avec la règle qui était alors en vigueur ;
- **l'absence de données structurées** permettant de construire une probabilité de défaut propre à l'établissement.

Le troisième point est le plus coûteux, et le moins visible.

## 2. Les cinq arguments de décision

### 2.1 La donnée est l'actif, le score n'est que le moyen

Une banque ne peut pas estimer sa propre probabilité de défaut sans un historique où **les mêmes variables ont été collectées de la même façon** sur l'ensemble du portefeuille, avec une définition du défaut stable.

Cet historique n'existe pas. Il ne s'achète pas. Il ne se reconstitue pas rétroactivement : les dossiers anciens ne contiennent pas les champs qu'on aurait voulu y trouver. **Il se construit, mois après mois, à partir du jour où la collecte devient structurée.**

C'est la vraie raison de démarrer maintenant, même en mode fantôme, même avec des seuils imparfaits. Les seuils se corrigent ; le temps perdu à collecter ne se rattrape pas.

### 2.2 Le risque de ne rien faire est un risque de supervision

La reproductibilité et la traçabilité des décisions de crédit sont une attente croissante des superviseurs. La question qui sera posée n'est pas « avez-vous un modèle », mais :

> « Montrez-nous comment cette décision de 2024 a été prise, avec quelles données, et rejouez-la. »

Aujourd'hui, la réponse serait une note de synthèse rédigée pour convaincre un comité, pas pour être rejouée. Le dispositif produit un instantané immuable : valeurs saisies, état de chaque donnée, version de modèle, version de moteur, date d'arrêté, identité du demandeur. Une décision de 2026 se rejoue en 2029 avec la règle de 2026.

Ce point ne demande ni calibration, ni validation : il est acquis dès le pilote.

### 2.3 La prudence assumée est un actif de crédibilité

Le dispositif **refuse techniquement** de publier une probabilité de défaut qu'il ne peut pas justifier. En production, la valeur est nulle, la finalité du résultat est déclarée « pilote fantôme », et l'application refuse de démarrer si la dérogation de simulation y est activée.

Cela peut sembler une limitation. C'est en réalité la position la plus solide devant une validation indépendante ou un superviseur :

- une probabilité non calibrée utilisée en IFRS 9, en tarification ou en capital constitue une **faiblesse majeure** en validation ;
- un dispositif qui l'expose, même assorti d'un avertissement, sera repris par un système aval — c'est ce que l'audit indépendant a relevé, et c'est corrigé.

Autrement dit : le dispositif a été conçu pour que la banque **ne puisse pas** commettre l'erreur la plus fréquente du marché.

### 2.4 Un modèle marocain, pas une grille importée

Une grille de place ne sait pas ce que signifie, au Maroc :

| Fait de marché | Ce que le dispositif en fait |
|---|---|
| Les comptes courants d'associés représentent 44,5 % du financement des micro-entreprises et 30,7 % de celui des TPE | Trois catégories de classement, avec preuve juridique exigée : sans cela, le levier et la solvabilité affichés n'ont aucun sens |
| 86,6 % de micro-entreprises et 7,4 % de TPE parmi les personnes morales actives | Un modèle comportemental dédié, lisant les flux bancaires quand les comptes ne sont pas fiables |
| 98,5 % des créations sont des micro-entreprises | Une route « jeune entreprise » explicite, au lieu d'un plafond qui revenait à refuser de les analyser |
| 60 % de l'exposition analysée concentrée sur Casablanca-Settat | Un référentiel sectoriel structuré par activité **et par région**, avec seuil de crédibilité |
| Les TPME représentent 41,2 % de l'exposition crédit, les GE 58,8 % pour 1,5 % des entreprises créditées | Deux régimes de validation distincts : volume et granularité d'un côté, faible défaut et forte matérialité de l'autre |
| Délais d'encaissement sur marchés publics, stress hydrique, saisonnalité touristique | Cinq familles de scénarios de stress différenciés, au lieu d'un choc unique appliqué à tous |

*(Données de structure : Observatoire Marocain de la TPME, reprises par le diagnostic indépendant.)*

Un modèle acheté ne se challenge pas de l'intérieur. Celui-ci est entièrement paramétré : poids, seuils, barèmes, plafonds et échelles sont des données versionnées, modifiables sans livraison de code, et contrôlées au chargement.

### 2.5 Ce que la calibration ouvrira, une fois l'historique constitué

Tant que la probabilité de défaut n'est pas calibrée, la banque ne peut pas :

- **tarifer différentiellement** le risque de manière défendable ;
- **allouer le capital économique** par segment sur une base autre que déclarative ;
- **fixer des limites** par grade, secteur ou région avec un fondement quantitatif ;
- **alimenter proprement le dispositif IFRS 9** en probabilité de défaut interne ;
- **envisager** à terme toute ambition de notation interne avancée.

Aucune de ces capacités n'est promise par le pilote. Toutes sont **conditionnées à l'historique que seul le pilote permet de constituer**.

## 3. Ce qu'on vous demande d'engager

| Engagement | Nature | Réversibilité |
|---|---|---|
| Autoriser un pilote en mode fantôme sur un périmètre fermé | Décision de direction | Totale — arrêt sans effet client |
| Mandater une revue indépendante du code et des preuves | Budget de revue | Sans objet |
| Nommer les propriétaires Risques, Finance, Conformité, Juridique, Data | Gouvernance | Réversible |
| Obtenir et faire valider le corpus réglementaire applicable | Travail juridique | Sans objet — nécessaire de toute façon |
| Financer le référentiel sectoriel et le dictionnaire comptable | Chantier données | Actif réutilisable |

**Ce qu'on ne vous demande pas :** aucune mise en production décisionnelle, aucun usage réglementaire, aucune communication externe de readiness, aucun engagement sur une date de go-live.

## 4. Objections et réponses

| Objection | Réponse |
|---|---|
| « Combien ça coûte ? » | La construction du modèle et de l'outil est faite. Ce qui reste est du temps de gouvernance, un chantier de données et un pilote sans effet client. Le poste réellement coûteux serait de refaire l'exercice après un constat de supervision |
| « Pourquoi ne pas acheter une solution de place ? » | Une grille importée ne sait pas lire un compte courant d'associé à 44,5 % du financement, ni une créance sur marché public. Et un modèle acheté ne se challenge pas de l'intérieur : la banque en hériterait des seuils sans pouvoir les défendre devant son superviseur |
| « Et si le pilote montre que le modèle est mauvais ? » | Alors nous l'aurons appris sans effet client et pour un coût faible. C'est précisément l'objet du mode fantôme. Un modèle réfutable vaut mieux qu'un modèle dont on ne peut rien démontrer |
| « Pourquoi ne produit-il pas de probabilité de défaut ? » | Parce qu'il n'en a pas le droit tant qu'elle n'est pas calibrée sur des défauts réellement observés. Publier un chiffre non calibré exposerait la banque à une critique immédiate en validation, et le chiffre serait repris en aval |
| « Combien de temps avant un usage réel ? » | Le programme comporte six portes. La calibration est en porte 4, les moteurs réglementaires en porte 5. L'ordre de grandeur est de douze mois, sous réserve de la disponibilité des données et des équipes |
| « Nos concurrents ont-ils cela ? » | Question mal posée. La question utile est : peuvent-ils rejouer une décision de crédit vieille de trois ans avec la règle d'alors ? Peu de dispositifs le permettent, et c'est ce qui sera demandé |
| « Le diagnostic parle d'une maturité de 2,1 sur 5 » | Il portait sur la version précédente. Les huit constats critiques ont été traités dans le code ; dix-sept constats sur vingt-six le sont. La maturité ne se décrète pas depuis l'intérieur : elle sera réévaluée par la revue indépendante, sur pièces. C'est la bonne façon de procéder |

## 5. Le message à retenir

> Nous ne demandons pas d'approuver un modèle. Nous demandons d'autoriser la construction d'un actif — un historique de crédit structuré — dans des conditions où l'erreur est sans conséquence client, où les limites sont techniquement imposées plutôt qu'affirmées, et où une revue indépendante tranchera avant tout usage contraignant.

## 6. Les trois chiffres à retenir

- **Dix-huit à vingt-quatre mois** d'historique structuré avant qu'une probabilité de défaut propre à la banque soit estimable. Le compteur démarre au pilote, pas à la décision.
- **Zéro effet client** pendant le pilote : notation produite en parallèle des décisions existantes.
- **Dix-sept constats sur vingt-six** traités dans le code exécuté, dont les huit critiques ; les autres documentés avec leur condition de levée.
