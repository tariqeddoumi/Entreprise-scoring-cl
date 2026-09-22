# Argumentaire — Responsables des engagements et contre-étude

## Pourquoi ce dispositif renforce votre fonction au lieu de la réduire

**Public :** responsables des engagements, contre-étude des dossiers de crédit, par marché GE, PME et TPE
**Durée de présentation conseillée :** 45 minutes, dont 20 de questions
**Classification :** usage interne

---

> **En une phrase.** Le modèle ne prend aucune décision, ne remplace aucun avis : il impose que la même question soit posée à tous les dossiers, il enregistre votre réponse avec sa preuve, et il refuse de se prononcer quand l'information manque — ce que vous faites déjà, mais que rien ne trace aujourd'hui.

---

## 1. Le problème que vous connaissez mieux que quiconque

Trois situations vous sont familières.

**Le même dossier, deux lectures.** Un compte courant d'associé de 3 MMAD. Un analyste le traite en quasi-fonds propres, un autre en dette financière. Le ratio de solvabilité passe de 28 % à 11 %, le levier de 2,1× à 4,3×. Les deux lectures sont défendables. Aucune n'est écrite nulle part. Le dossier revient en comité avec deux chiffres et personne pour arbitrer autrement qu'à l'autorité.

**Le dossier qui tourne mal trois ans plus tard.** On vous demande pourquoi il a été accepté. Vous retrouvez la note de synthèse. Elle dit « situation financière satisfaisante, gouvernance correcte ». Elle ne dit pas quel était le levier retenu, quelle définition de l'EBE avait été appliquée, ni ce qui était connu de l'endettement système à la date d'arrêté. Vous ne pouvez pas rejouer la décision : vous pouvez seulement la raconter.

**L'aller-retour.** Le dossier revient parce qu'il manque une pièce que personne n'avait listée au départ. Deuxième aller-retour parce que la pièce reçue ne permet pas de calculer ce qu'on voulait. Le délai s'allonge, le chargé d'affaires vous en veut, et la qualité de l'instruction n'a pas progressé.

Aucun de ces trois problèmes n'est un problème d'intelligence. Ce sont des problèmes de **méthode partagée et de mémoire**.

## 2. Ce que le dispositif fait, exactement

| Le modèle fait | Le modèle ne fait pas |
|---|---|
| Poser 45 questions (24 sur le modèle TPE comportemental), toujours les mêmes, dans le même ordre | Décider d'un octroi, d'une limite, d'un prix ou d'une délégation |
| Appliquer des pondérations et des barèmes publiés, identiques pour tous les dossiers d'un segment | Remplacer votre appréciation : **31 des 45 critères** (17 des 24 sur le modèle TPE) sont des jugements ancrés que vous seul pouvez porter |
| Enregistrer votre réponse, sa preuve, la date d'arrêté et la version de règle appliquée | Produire une probabilité de défaut utilisable |
| Refuser de produire un grade quand l'information est insuffisante | Classer la contrepartie au sens Bank Al-Maghrib, ni déterminer un stage IFRS 9 |
| Restituer la note ligne à ligne, avec le poids et la contribution de chaque critère | S'appliquer aux financements spécialisés, à la promotion immobilière ou aux établissements financiers |

Le champ `decisionStatus` du résultat vaut **toujours** `NOT_EVALUATED`. Ce n'est pas une omission : c'est une garantie technique. Aucun système aval ne peut déduire une décision d'un grade, parce que le grade ne la porte pas.

## 3. Les six arguments à porter

### 3.1 Le modèle défend l'analyste, pas l'inverse

Aujourd'hui, quand un dossier se dégrade, la charge de la preuve pèse sur vous : montrer que vous aviez raisonné correctement avec l'information de l'époque. Vous n'avez qu'une note de synthèse rédigée pour convaincre, pas pour être rejouée.

Le dispositif conserve un instantané immuable : les valeurs saisies, leur état — observée, estimée, obsolète —, la version du modèle, la version du moteur, la date d'arrêté et l'identité du demandeur. Trois ans plus tard, la notation se rejoue **avec la règle qui était alors en vigueur**. Ce n'est pas un outil de contrôle sur vous : c'est votre meilleure défense.

### 3.2 Le modèle refuse de se prononcer quand il ne sait pas

C'est le réflexe d'un bon analyste, et c'est désormais encodé. Deux mécanismes :

- **la porte de couverture** — si moins de 60 % du poids du modèle est porté par une donnée réellement observée (70 % sur le modèle TPE comportemental), aucun grade n'est produit. Le score brut est calculé et conservé pour la surveillance, mais l'outil ne prononce pas de note ;
- **la classe de confiance** — A, B, C ou U, calculée sur la complétude, la fraîcheur, la fiabilité et la provenance. En classe U, aucun grade.

Point important pour vous : **la confiance ne plafonne plus le grade**, contrairement à la version précédente. Le grade mesure le risque, la classe de confiance mesure la robustesse de l'estimation, et les deux sont affichés côte à côte. Mélanger les deux produisait une note qui ne voulait plus rien dire — la version antérieure déplaçait ainsi 55 à 65 % des dossiers de deux crans, pour une raison qui n'avait rien à voir avec le risque du client.

### 3.3 Une faiblesse n'est plus comptée quatre fois

Un audit indépendant a relevé qu'un même phénomène pouvait agir jusqu'à quatre fois : sur le critère élémentaire, sur le domaine transparence, sur un plafond de grade, puis sur un signal. Des fonds propres négatifs étaient ainsi sanctionnés par un score nul, un plafond à G9, un red flag et un effet sur la qualité des comptes.

Ce n'est pas seulement injuste pour la contrepartie. C'est surtout **incalibrable** : impossible de mesurer l'effet propre de chaque règle, donc impossible de savoir laquelle mérite d'être conservée.

Un inventaire phénomène-règle a été construit. Chaque exception conservée doit désormais nommer le critère qui porte la contribution centrale du phénomène et justifier pourquoi un effet supplémentaire s'y ajoute. **Dix plafonds sont ramenés à quatre** sur le modèle standard, et à zéro sur le modèle comportemental.

C'est un argument technique que votre auditoire comprendra immédiatement : le modèle est devenu plus lisible en devenant moins sévère par accumulation.

### 3.4 Les définitions comptables sont écrites, une fois, pour tous

Le dictionnaire CGNC fixe sept grandeurs et les affiche à l'analyste **au moment de la saisie** :

| Grandeur | Ce qui est désormais tranché |
|---|---|
| Excédent brut d'exploitation retraité | Réintégration des redevances de crédit-bail, rémunération normative du dirigeant, exclusion des produits non courants, rapprochement avec la capacité d'autofinancement |
| Comptes courants d'associés | Trois catégories — remboursable à vue, bloqué non subordonné, contractuellement subordonné. Seule la troisième vaut quasi-fonds propres, et seulement sur convention écrite produite |
| Dette financière nette économique | Crédit-bail actualisé, affacturage avec recours, financements participatifs selon leur substance, dette système de la Centrale des Risques ; trésorerie nantie exclue |
| Service de la dette à 12 mois | Échéances ballon et in fine comptées intégralement, convention documentée pour le revolving |
| Créances publiques et crédit de TVA | Isolées du poste clients, avec ancienneté et décote de liquidité |
| Fonds propres tangibles | Déduction des non-valeurs, incorporels non cessibles, réévaluations non liquides, créances sur associés |
| Flux bancaires nettoyés | Exclusion des décaissements de prêts, virements circulaires, apports d'associés, produit d'affacturage |

Le débat sur le compte courant d'associé ne disparaît pas — il se déplace au bon endroit : sur la **preuve juridique produite**, et non sur l'opinion de l'analyste du jour.

### 3.5 Le segment ne se choisit plus

Le segment détermine à la fois les pondérations et les barèmes. Le choisir revenait donc à choisir sa grille. Désormais : référentiel de segmentation effectif-daté et versionné, routage déterministe du modèle, et un segment fourni par le référentiel amont est **confronté au calcul** — toute divergence est tracée.

Conséquence pratique : un dossier refusé par une grille ne peut plus être représenté à l'autre jusqu'à obtenir le grade souhaité.

### 3.6 Vos seuils, pas ceux d'un éditeur

Les pondérations et les barèmes actuels sont une **proposition experte non calibrée**. Il faut le dire clairement, parce que c'est vrai et parce que c'est votre principal levier d'adhésion : ces seuils sont faits pour être contestés par vous, sur votre portefeuille.

Le pilote en mode fantôme sert exactement à cela. Vous notez en parallèle de vos décisions habituelles ; les écarts entre la note du modèle et votre appréciation sont analysés ; ce sont les seuils qui bougent, pas votre jugement. Un analyste qui documente un désaccord fait progresser le modèle — c'est le contraire d'un système qui vous impose sa réponse.

## 4. Par marché

### 4.1 Grandes entreprises

**La réalité du portefeuille.** Selon les données de l'Observatoire Marocain de la TPME citées par le diagnostic, les grandes entreprises représentent environ **1,5 % des entreprises créditées mais 58,8 % de l'exposition** analysée. Peu de dossiers, très forte matérialité, très peu de défauts observés.

**Ce que cela implique, et qu'il faut assumer devant ce public.** Sur la GE, aucune calibration statistique classique ne sera possible avant longtemps : il n'y a pas assez de défauts. La valeur du dispositif n'est donc pas prédictive à court terme. Elle est ailleurs :

- **la comparabilité** — deux dossiers GE instruits par deux équipes différentes passent la même grille ;
- **la discipline groupe** — la méthode de support groupe exige les quatre preuves : capacité financière du garant, volonté démontrée, engagement juridiquement contraignant, transférabilité effective des fonds. Le relèvement est plafonné à deux crans, et **la note autonome reste conservée**. Aujourd'hui, une lettre de confort non contraignante produit trop souvent un relèvement implicite que personne ne quantifie ;
- **la dette économique consolidée** — crédit-bail, affacturage avec recours, participatif, dette système. Sur un groupe, c'est là que se cachent les écarts ;
- **l'honnêteté sur la granularité** — l'échelle GE est volontairement plus courte qu'avant. Dix grades affichaient une finesse que le nombre de défauts ne justifiera jamais.

**L'objection à préparer :** « nos GE, on les connaît individuellement, on n'a pas besoin d'une grille. » Réponse : c'est exact pour l'appréciation ; ce n'est pas exact pour la **cohérence entre analystes**, ni pour le rejeu à trois ans, ni pour la construction de l'historique qui permettra un jour de traiter le cas des faibles défauts par pooling ou par approche bayésienne. Et l'analyse groupe, elle, n'est aujourd'hui formalisée nulle part.

### 4.2 PME

**C'est le marché où le dispositif rend le plus vite.** Assez de dossiers pour calibrer dans un délai raisonnable, assez d'information financière pour utiliser la grille standard, et un domaine comportemental pondéré à 20 % qui capte la dégradation **avant** les comptes.

Trois arguments spécifiques :

- **le décalage de l'information comptable.** Les états financiers arrivent avec plusieurs mois de retard. Les retards de paiement, les dépassements, les mouvements créditeurs et les incidents sont disponibles mensuellement, produits par la banque elle-même, donc difficilement manipulables. La pondération le reflète ;
- **les marchés publics.** Le dictionnaire isole les créances publiques et le crédit de TVA du poste clients, avec leur ancienneté et le délai réellement observé sur le donneur d'ordre. Une créance certaine n'est pas un encaissement disponible — c'est exactement ce qui fait tomber des PME du BTP par ailleurs rentables ;
- **le scénario de stress différencié.** Un choc unique appliqué à toutes les contreparties ne décrit rien. Cinq familles de scénarios marocains sont déclarées : stress hydrique, demande touristique, délais sur marchés publics, change et énergie pour les importateurs, contrainte carbone à l'export.

### 4.3 TPE

**C'est le marché où le changement est le plus profond**, et celui où votre auditoire sera le plus sceptique.

**Le fait structurant.** Toujours selon les données OMTPME reprises par le diagnostic : 86,6 % de micro-entreprises et 7,4 % de TPE parmi les personnes morales actives. Les comptes courants d'associés représentent **44,5 % du financement des micro-entreprises et 30,7 % de celui des TPE**, contre 17,4 % et 28,7 % pour les capitaux propres. Autrement dit : sur ce marché, lire un bilan sans convention de classement du compte courant, c'est ne rien lire du tout.

**Deux réponses concrètes :**

- **un modèle comportemental dédié.** Une TPE dont les comptes ne sont pas fiables n'est pas notée avec une grille financière dégradée : elle est routée vers une grille qui lit ce qu'on a réellement — les flux bancaires, les incidents, la régularité des encaissements — sur une fenêtre portée à 24 mois, cible 36. Douze mois ne couvrent qu'une seule saison : sur un hôtel, une exploitation agricole ou un commerce dépendant du Ramadan, impossible de distinguer une bonne saison d'une mauvaise ;
- **la fin de la pénalisation injuste sur l'audit.** Une TPE légalement non soumise à l'audit n'est plus sanctionnée pour ne pas être auditée. Le critère évalue la fiabilité et les rapprochements au regard de l'**obligation légale et de la matérialité**, pas le label d'audit.

**Le taux de capture bancaire.** Une faible domiciliation des flux n'est pas une faible activité. Le taux de capture alimente désormais la **fiabilité de l'estimation**, pas le score de risque. C'est une correction importante : elle évite de pénaliser mécaniquement un client multi-bancarisé.

**La jeune entreprise.** 98,5 % des créations d'entreprises au Maroc sont des micro-entreprises. La version précédente les plafonnait à un grade médiocre — ce qui revenait à refuser de les analyser tout en prétendant les noter. Elles sortent désormais des grilles publiées avec un motif explicite : « route jeune entreprise ». La banque doit décider quoi en faire. Le dispositif rend cette décision visible au lieu de la masquer derrière un plafond.

## 5. Objections et réponses

| Objection | Réponse |
|---|---|
| « On veut me remplacer par un algorithme » | Le moteur ne produit aucune décision, et 31 des 45 critères sont des jugements ancrés que seul un analyste peut porter — ils portent environ 60 % du poids de la note. L'outil formalise l'instruction, il ne la fait pas |
| « Ça va rallonger mes délais » | Le temps se déplace : plus de saisie structurée au départ, moins d'allers-retours ensuite. Le formulaire liste ce qui est attendu dès la première demande, et affiche la définition de chaque grandeur |
| « Les seuils sont arbitraires » | Exact, et c'est écrit noir sur blanc dans la note méthodologique : ce sont des seuils experts non calibrés. Le pilote existe pour les challenger sur votre portefeuille. C'est vous qui les corrigerez |
| « Le modèle va noter un bon client en mauvais » | Possible, et c'est ce qu'on veut mesurer. En mode fantôme, votre décision prévaut à 100 %. Un désaccord documenté est une donnée de calibration, pas un conflit |
| « Je vais devoir défendre la note du modèle » | Non. Le grade moteur, le grade autonome et votre décision sont trois objets distincts, conservés séparément. La dérogation existe, sous double validation et motif codifié, plafonnée à deux crans |
| « 45 critères, c'est trop pour une PME moyenne » | Une partie est préremplie depuis les systèmes. Et la vraie question est : lesquels de ces 45 n'examinez-vous pas déjà, au moins mentalement ? Le modèle rend explicite ce qui était implicite |
| « Le modèle ne connaît pas mes clients » | Non, et il ne prétend pas les connaître. Il vous demande ce que vous savez, dans une forme comparable et enregistrée |
| « On a déjà des outils pour la promotion immobilière et le financement de projets » | Périmètre différent et assumé : ce modèle couvre les entreprises non financières de droit commun, qui n'ont aujourd'hui aucun dispositif homogène |

## 6. Ce que vous ne devez pas dire

Ces trois phrases vous exposeraient à une contradiction immédiate de la validation indépendante ou du superviseur :

1. **« Le modèle calcule la probabilité de défaut de la contrepartie. »** Faux. Aucune probabilité n'est exposée hors environnement de simulation. La calibration attachée est établie sur données simulées : elle valide la chaîne de traitement, jamais le niveau du risque.
2. **« Le modèle est validé. »** Faux. Il est testé, pas validé. La validation indépendante est une porte explicite du programme, et elle n'a pas été franchie.
3. **« Le grade détermine la classe réglementaire ou le stage IFRS 9. »** Faux, et techniquement impossible : ces statuts valent `NOT_EVALUATED`, les moteurs correspondants n'existent pas.

Dire ces trois choses avec franchise **renforce** votre crédibilité. Un dispositif qui annonce ses limites est plus solide qu'un dispositif qui prétend tout faire.

## 7. Ce qu'on vous demande

1. **Participer au pilote en mode fantôme** sur un périmètre fermé, sans effet client, avec double notation.
2. **Documenter les désaccords** entre votre appréciation et la note du modèle — ce sont eux qui feront bouger les seuils.
3. **Arbitrer les conventions** qui vous reviennent : classement des comptes courants d'associés, définition de l'excédent brut retraité, périmètre de la dette économique.
4. **Challenger la segmentation et les barèmes** sur des dossiers réels, en particulier aux frontières.

## 8. Les trois chiffres à retenir

- **Zéro décision produite.** Le statut de décision de crédit vaut toujours `NOT_EVALUATED`.
- **Dix plafonds ramenés à quatre**, avec obligation de déclarer la contribution centrale du phénomène.
- **60 % de couverture observée minimum** pour qu'un grade soit produit — sinon l'outil se tait.
