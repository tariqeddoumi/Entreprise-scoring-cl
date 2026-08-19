# Note méthodologique — Modèle et outil de notation interne des entreprises

## Contreparties TPE, PME et Grandes Entreprises — contexte bancaire marocain

**Version :** 2.0 · **Date :** 19 août 2026
**Destinataires :** Direction générale, Direction des Risques, Comité modèles, Validation indépendante, Finance et IFRS 9, Conformité et Juridique, Direction des Systèmes d'Information
**Classification :** usage interne

---

> **Statut du document.** Les pondérations, seuils et barèmes présentés constituent une proposition experte complète permettant de démarrer un pilote et de collecter des données homogènes. Ce ne sont **ni des seuils réglementaires de Bank Al-Maghrib, ni des probabilités de défaut calibrées, ni une validation de modèle**. Avant tout usage de décision automatisée, de tarification, d'application d'IFRS 9 ou de calcul de capital réglementaire, ils doivent être challengés sur l'historique de la banque, calibrés, validés indépendamment et approuvés par les instances compétentes.
>
> Ce document ne constitue ni un avis juridique ni une attestation de conformité. Les paramètres réglementaires, dates d'effet, articles, seuils, taux de provision et traitements des garanties doivent être extraits des textes officiels applicables à l'établissement et revus par la Conformité et le Juridique.

---

# Sommaire

**Partie I — Note à l'attention de la Direction générale**
1. Message exécutif
2. Décisions sollicitées
3. Proposition de valeur
4. Choix structurants
5. Risques de mise en œuvre et réponses
6. Feuille de route

**Partie II — Méthodologie du modèle**
7. Objectifs et philosophie
8. Périmètre, unité de notation et segmentation
9. Architecture de calcul
10. Justification économique des sept domaines
11. Qualité des données et niveau de confiance
12. Caps, red flags et dérogations
13. Séparation avec la classification réglementaire, IFRS 9 et le capital
14. Exemples de calcul complets

**Partie III — Grilles détaillées** *(générées depuis le moteur)*
15. Modèle standard CORP_STD_V1
16. Modèle TPE comportemental CORP_TPE_BEHAV_V1

**Partie IV — L'outil**
17. Principes d'architecture
18. Le moteur de calcul
19. Interface de programmation bidirectionnelle
20. Persistance et compatibilité multi-bases
21. Sécurité, habilitations et piste d'audit
22. Parcours utilisateur
23. Déploiement et exploitation
24. Stratégie de tests et preuves d'exécution

**Partie V — Gouvernance**
25. Calibration statistique et passage au modèle challenger
26. Validation indépendante et surveillance
27. Fréquences de revue
28. Décisions du comité modèles avant pilote

**Annexes**
A. Vecteurs de contrôle chiffrés
B. Registre des écarts et travaux futurs

---

# Partie I — Note à l'attention de la Direction générale

## 1. Message exécutif

La banque dispose aujourd'hui d'outils de notation dédiés au financement de projets et à la promotion immobilière, mais pas d'un dispositif homogène pour ses contreparties entreprises de droit commun — qui constituent l'essentiel du portefeuille corporate. L'appréciation du risque y repose largement sur le jugement de l'analyste, avec trois conséquences : une variabilité d'appréciation entre chargés d'affaires et entre agences, une difficulté à démontrer au régulateur la reproductibilité d'une décision passée, et l'absence de données structurées permettant de construire ultérieurement une probabilité de défaut calibrée.

Le dispositif présenté répond à ces trois points. Il propose un **modèle expert transparent** couvrant 45 critères répartis en sept domaines, pondérés différemment selon le segment TPE, PME ou Grande Entreprise, et un **outil qui exécute ce modèle de façon déterministe**, conserve la preuve complète de chaque calcul et expose une interface de programmation permettant l'échange dans les deux sens avec le système d'information.

Deux caractéristiques méritent l'attention de la Direction générale.

**Le modèle ne prétend pas prédire une probabilité de défaut.** Il produit un classement ordinal fiable et explicable. Le statut de calibration est affiché en permanence comme non calibré, et l'outil bloque techniquement l'usage de ce score pour IFRS 9, la tarification ou le capital réglementaire. C'est une position volontairement prudente : un score expert présenté comme une probabilité de défaut exposerait l'établissement à une critique immédiate de la validation indépendante et du superviseur. La calibration viendra de l'historique que ce dispositif permettra précisément de constituer.

**Les cinq finalités restent séparées.** La notation de la contrepartie, la décision de crédit, la classification réglementaire, le staging IFRS 9 et le calcul de capital sont cinq moteurs distincts. Une garantie peut réduire la perte en cas de défaut, sécuriser une décision ou modifier une pondération prudentielle ; elle ne rend jamais l'emprunteur intrinsèquement meilleur. Cette séparation, structurante pour l'architecture, est la principale différence avec des outils de place qui agrègent tout dans un score unique.

À ce stade, la notation interne est opérationnelle et testée. Les quatre autres moteurs sont spécifiés et attendent la validation du corpus réglementaire pour être implémentés — aucune règle réglementaire n'a été codée sans preuve documentaire.

## 2. Décisions sollicitées

| # | Décision | Instance | Impact si différée |
|---|---|---|---|
| 1 | Approuver le périmètre : contreparties entreprises non financières, hors financements spécialisés et entités à dynamique de défaut différente | Comité modèles | Risque de noter des contreparties avec un modèle inadapté |
| 2 | Confirmer les seuils de segmentation TPE / PME / GE depuis le corpus applicable | Risques et Conformité | La segmentation reste une hypothèse ; les pondérations par segment ne sont pas opposables |
| 3 | Approuver la définition du défaut, les règles de guérison et de rechute | Risques et Finance | Bloque la calibration et la cohérence avec IFRS 9 |
| 4 | Valider les formules financières et les retraitements | Risques et Finance | Les ratios ne sont pas comparables entre dossiers |
| 5 | Challenger pondérations et seuils sur le portefeuille existant | Risques et Validation | Le modèle reste une opinion experte non testée |
| 6 | Arbitrer entre modèle TPE standard et modèle TPE comportemental | Comité modèles | Les TPE mal documentées reçoivent un traitement inadapté |
| 7 | Approuver caps, red flags et politique de données manquantes | Risques | Les garde-fous restent des propositions |
| 8 | Valider l'échelle interne et les règles de dérogation | Comité modèles | Pas de référentiel commun de communication du risque |
| 9 | Approuver le plan de calibration et de validation indépendante | Comité modèles | Le statut non calibré ne pourra jamais évoluer |
| 10 | Autoriser un pilote en mode fantôme avant tout usage contraignant | Direction générale | Mise en production sans mesure d'impact |

## 3. Proposition de valeur

**Homogénéité.** Un dossier identique produit la même note quel que soit l'analyste, l'agence ou la date, dès lors que les données et la version de modèle sont identiques. Cette propriété est garantie par construction et vérifiée par des tests automatisés.

**Explicabilité.** Chaque note se décompose en sept scores de domaine, puis en 45 contributions élémentaires, chacune accompagnée de la valeur source, de la bande retenue, du poids appliqué et d'une explication en langue naturelle. Un analyste peut justifier une note ligne à ligne devant un client, un comité ou un auditeur.

**Traçabilité.** Chaque exécution enregistre un instantané immuable des données d'entrée, les versions de modèle et de moteur, la date d'arrêté, l'identité du demandeur et le résultat complet. Une décision vieille de trois ans peut être rejouée avec la règle exacte alors en vigueur.

**Constitution de l'historique.** En imposant une collecte structurée des mêmes 45 critères sur l'ensemble du portefeuille, le dispositif construit la base de données qui rendra possible, dans dix-huit à vingt-quatre mois, l'estimation d'une probabilité de défaut propre à la banque.

**Détection précoce.** Le domaine comportemental, prépondérant sur la TPE et la PME, s'appuie sur des données bancaires disponibles mensuellement, alors que les états financiers arrivent avec plusieurs mois de décalage.

**Ouverture.** L'interface de programmation permet au système bancaire central d'alimenter l'outil et de récupérer les notations, sans double saisie ni interface manuelle.

## 4. Choix structurants

| Choix | Alternative écartée | Motif |
|---|---|---|
| Modèle expert transparent avant modèle statistique | Apprentissage automatique d'emblée | L'historique structuré n'existe pas encore ; un modèle appris sur des données non homogènes reproduirait les biais des pratiques passées |
| Statut de probabilité de défaut non calibré, techniquement bloquant | Publier une correspondance grade–PD indicative | Une PD non calibrée utilisée en IFRS 9 ou en tarification constitue une faiblesse majeure en validation |
| Cinq moteurs séparés | Score unique agrégeant tout | Un score qui mêle risque intrinsèque, garanties et classe réglementaire n'est ni auditable ni conforme |
| Score sur 0–100, 100 = meilleur | Échelle inversée | Convention plus lisible pour les métiers ; cohérente avec les outils existants de la banque |
| Scores élémentaires discrets 0/25/50/75/100 | Score continu | Réduit la fausse précision, force l'ancrage sur des preuves observables, facilite la revue par un tiers |
| Caps plafonnant le grade sans modifier le score brut | Pénalités soustraites du score | Conserve la mesure brute pour le contrôle a posteriori et rend l'effet du cap explicite et réversible |
| Poids en points de base entiers | Pourcentages en virgule flottante | Élimine toute dérive d'arrondi ; la somme à 100 % est vérifiable exactement |
| Formulaire généré depuis la version de modèle | Écrans codés en dur | Une modification de modèle ne nécessite aucune modification d'interface, donc aucune divergence possible |

## 5. Profil de pondération

Le poids relatif des domaines varie selon le segment, selon une logique défendable devant un validateur.

| Domaine | TPE | PME | GE | Logique |
|---|---:|---:|---:|---|
| D1 — Performance financière | 25 % | 30 % | 30 % | L'information comptable gagne en fiabilité et en richesse avec la taille |
| D2 — Capacité de remboursement et stress | 10 % | 15 % | 20 % | Le pilotage prévisionnel et les données de cash-flow ne sont exploitables qu'à partir d'une certaine sophistication |
| D3 — Comportement bancaire | 25 % | 20 % | 10 % | Sur la TPE, le compte bancaire est le signal le plus fiable et le plus fréquent ; sur la GE, il est dilué par la multibancarisation |
| D4 — Activité et secteur | 15 % | 15 % | 15 % | Le risque sectoriel affecte toutes les tailles de façon comparable |
| D5 — Management et gouvernance | 15 % | 12 % | 15 % | Fort sur la TPE par dépendance à l'homme-clé ; fort sur la GE par complexité de gouvernance et enjeux de groupe |
| D6 — Transparence et conformité | 7 % | 5 % | 5 % | Le risque d'information incomplète est structurellement plus élevé sur la TPE |
| D7 — ESG et climat | 3 % | 3 % | 5 % | Matérialité financière croissante avec la taille, l'exposition réglementaire et l'international |

**Contrôle du double comptage.** Un même phénomène n'est pénalisé dans deux domaines que si les preuves sont distinctes et le mécanisme économique différent. Une baisse du chiffre d'affaires affecte D1 ; elle n'affecte D4 que si elle traduit également une dégradation structurelle de la position de marché, établie par une preuve différente — perte de parts documentée, sortie d'un référencement, obsolescence d'une offre.

## 6. Risques de mise en œuvre et réponses

| Risque | Probabilité | Réponse intégrée au dispositif |
|---|---|---|
| Les seuils experts s'avèrent mal calibrés sur le portefeuille réel | Élevée | Tous les seuils sont des paramètres versionnés, modifiables sans livraison de code ; pilote en mode fantôme obligatoire avant usage contraignant |
| Données comptables insuffisantes sur la TPE | Élevée | Modèle TPE comportemental distinct, avec identifiant, poids et calibration propres ; aucune note moyenne attribuée par défaut |
| Le score expert est utilisé comme une probabilité de défaut | Moyenne | Blocage technique : aucune PD n'est produite ni exposée par l'API tant que le statut est non calibré |
| Dérive des pratiques de dérogation | Moyenne | Double validation, limite de crans, motifs codifiés, suivi des taux et contrôle a posteriori des grades brut et final |
| Divergence entre la documentation et le calcul réel | Moyenne | Les grilles de la Partie III sont **générées depuis le code du moteur** ; toute modification se répercute à la régénération |
| Dépendance à un fournisseur de base de données ou de cloud | Moyenne | Source de schéma unique générant quatre dialectes ; déploiement local en une commande ; aucune dépendance à un service en ligne |
| Corpus réglementaire non disponible en temps voulu | Élevée | Les moteurs réglementaires sont spécifiés mais non implémentés ; aucune règle n'est codée sans preuve documentaire |
| Résistance des métiers à la saisie de 45 critères | Moyenne | Formulaire généré, ancrages visibles, préremplissage depuis les connecteurs, distinction claire entre critères critiques et secondaires |

## 7. Feuille de route

| Vague | Contenu | Durée indicative | Condition de sortie |
|---|---|---|---|
| **1 — Socle et TPE/PME en mode fantôme** | Données, groupe, modèle expert, parcours analyste, interface de programmation, audit | 3 à 4 mois | Notes produites en parallèle des décisions existantes, écarts analysés |
| **2 — Grandes entreprises et calibration** | Modèle GE, support groupe, référentiel sectoriel, premiers travaux de probabilité de défaut | 4 à 6 mois | Historique suffisant pour une première estimation, validation indépendante engagée |
| **3 — Moteurs réglementaires** | Classification, IFRS 9, capital prudentiel — subordonnés à la validation du corpus | 4 à 6 mois | Matrice de traçabilité approuvée, tests réglementaires verts |
| **4 — Industrialisation** | Alerte précoce, traitement de masse, challengers statistiques, surveillance, certification multi-bases | 3 à 4 mois | Objectifs de niveau de service tenus, certification des bases retenues |

Le facteur de réussite n'est pas le nombre d'écrans, mais l'accord explicite sur la définition du défaut, la qualité et le lignage des données, l'indépendance des cinq moteurs et la capacité à reproduire un résultat historique avec sa règle exacte.

---

# Partie II — Méthodologie du modèle

## 8. Objectifs et philosophie

### 8.1 Ce que le modèle produit

Le modèle mesure la qualité de crédit intrinsèque d'une contrepartie entreprise et produit un score brut de 0 à 100, sept scores de domaine, un grade interne ordinal, les contributions détaillées de chaque critère, les facteurs favorables et défavorables classés par contribution, le niveau de confiance dans la note, les red flags et caps applicables, le grade moteur avant dérogation, le grade final après dérogation approuvée, et une probabilité de défaut à 12 mois **uniquement** lorsque la table grade–PD est empiriquement calibrée.

### 8.2 Ce que le modèle ne fait pas

| Sortie | Objet | Effet des garanties et collatéraux |
|---|---|---|
| Note emprunteur et PD | Risque intrinsèque de défaut de la contrepartie | Aucun effet direct sur la PD, sauf support d'un tiers juridiquement et économiquement démontré |
| Décision de crédit | Acceptation, conditions, délégation, limites | Oui, selon la politique de crédit |
| Classification réglementaire | Classe et provision | Oui, uniquement selon l'éligibilité et les règles du régime applicable |
| IFRS 9 | Stage et pertes attendues | Oui, dans la perte en cas de défaut, les flux de récupération et l'exposition |
| Actifs pondérés | Exposition pondérée et réduction du risque | Oui, selon la reconnaissance prudentielle |

Une bonne garantie ne transforme pas un mauvais emprunteur en bon emprunteur : elle réduit éventuellement la perte en cas de défaut, ou sécurise la décision.

### 8.3 Critères de sélection d'une variable

Une variable n'entre dans le modèle que si elle satisfait six conditions cumulatives : un **lien économique** avec le risque de défaut explicable en une phrase à un comité ; une **disponibilité** effective pour la majorité de la population cible ; une **mesurabilité** objective à partir d'une source identifiable ; une **résistance à la manipulation** raisonnable, ou l'existence d'un contrôle de cohérence ; une **non-redondance** avec les autres variables retenues ; une **stabilité** temporelle suffisante pour ne pas produire de volatilité artificielle de la note.

Les variables qui échouent sur la disponibilité sur un segment donné y reçoivent un poids nul plutôt qu'une valeur imputée : c'est le cas de plusieurs indicateurs de cash-flow sur la TPE.

### 8.4 Approche de pondération

Les poids initiaux résultent d'un jugement expert structuré, non d'une optimisation statistique — impossible en l'absence d'historique. Ils suivent trois principes : le poids d'un domaine reflète sa **valeur informationnelle attendue** compte tenu de la qualité de la donnée disponible sur le segment ; aucun critère élémentaire ne dépasse 6 % du score global, afin qu'aucune variable isolée ne détermine la note ; la somme est vérifiée à exactement 100,00 % par segment, contrôle automatisé qui fait échouer le démarrage de l'application en cas d'écart.

Ces poids sont des hypothèses documentées, destinées à être challengées sur le portefeuille de la banque, puis remplacées par des coefficients estimés lors du passage au modèle challenger.

## 9. Périmètre, unité de notation et segmentation

### 9.1 Contreparties incluses

Sociétés non financières marocaines ; entrepreneurs individuels assimilés à une entreprise selon la politique de la banque ; holdings opérationnelles lorsque les flux et le support peuvent être analysés ; contreparties appartenant à un groupe, avec note autonome et analyse groupe distinctes.

### 9.2 Modèles dédiés ou hors périmètre

Établissements de crédit, sociétés financières et assurances ; souverains, collectivités et entités publiques ; financement de projets et financements spécialisés ; promotion immobilière et immobilier générateur de revenus ; startups sans historique financier suffisant ; associations et fondations ; contreparties en défaut, qui relèvent des grades défaut sans forcer un modèle de continuité d'exploitation.

Un cas hors modèle est routé avec motif tracé, ou bloqué. Il ne reçoit jamais une note neutre par défaut.

### 9.3 Segmentation

La segmentation est calculée sur la contrepartie et, lorsque requis, sur le groupe d'intérêt consolidé. Les seuils figurant en Partie III sont des paramètres versionnés, effectifs-datés, dont la source doit être confirmée dans le corpus applicable. Le chiffre d'affaires du groupe prime sur celui de l'entité lorsqu'il est disponible.

Si le segment ne peut être déterminé, **le scoring est bloqué** : aucun segment par défaut n'est appliqué, car le choix du segment détermine à la fois les pondérations et les barèmes.

### 9.4 Variante TPE comportementale

Une TPE dont les comptes sont insuffisamment fiables ne reçoit pas automatiquement une note moyenne. Elle est dirigée vers un modèle comportemental distinct si **toutes** les conditions minimales sont réunies : au moins douze mois d'historique de compte exploitable, chiffre d'affaires ou mouvements créditeurs raisonnablement vérifiés, encours, limites et incidents disponibles, identité et obligations documentaires validées, absence de red flag bloquant.

Ce modèle porte un identifiant distinct, ses propres poids et sa propre calibration. Les scores des deux modèles ne sont pas comparables sans table de correspondance validée.

## 10. Architecture de calcul

### 10.1 Score d'un critère

Chaque critère élémentaire reçoit un score parmi 0, 25, 50, 75 et 100. Pour une variable continue, une interpolation linéaire à l'intérieur d'une bande est possible mais désactivée par défaut : elle ne peut être activée qu'après validation, car elle introduit une précision que les seuils experts ne justifient pas.

### 10.2 Agrégation

```
Score_domaine = Σ(Score_critère × Poids_critère) / Σ(Poids applicables)
Score_brut    = Σ(Score_domaine × Poids_domaine) / Σ(Poids de domaines applicables)
```

La redistribution de poids n'est autorisée que pour un critère authentiquement **non applicable**, et uniquement à l'intérieur du même domaine. Une donnée manquante, invalide ou obsolète n'est jamais redistribuée silencieusement : elle déclenche la politique de qualité, un cap ou un blocage.

Les poids sont manipulés en points de base entiers ; l'arrondi n'intervient qu'à l'affichage.

### 10.3 Ordre de calcul obligatoire

1. identification et routage du modèle ;
2. segmentation ;
3. contrôles de complétude et de validité ;
4. calcul des indicateurs ;
5. détermination des bandes et scores élémentaires ;
6. agrégation par domaine ;
7. agrégation globale ;
8. application des caps de qualité et de structure ;
9. détection des red flags et routage ;
10. grade moteur ;
11. dérogation éventuelle sous double validation ;
12. enregistrement de l'instantané, des explications et des versions.

Les arrêts durs et la définition du défaut ne sont jamais dilués dans la moyenne pondérée : un red flag bloquant arrête le calcul **avant** toute agrégation, et un défaut avéré force un grade défaut quel que soit le score.

### 10.4 États de donnée

Chaque champ porte l'un des états `AVAILABLE`, `MISSING`, `NOT_APPLICABLE`, `INVALID`, `STALE` ou `ESTIMATED`. **La valeur zéro est une valeur économique, jamais un code de donnée manquante.**

Un ratio non calculable en raison d'un dénominateur nul ou négatif n'est pas automatiquement traité comme manquant : il reçoit le traitement économique défini dans la grille — par exemple, un excédent brut d'exploitation négatif conduit à un score nul sur le levier, ce qui est une information, pas une absence d'information.

## 11. Justification économique des sept domaines

### D1 — Performance financière et structure bilancielle

Le domaine mesure la capacité de l'entreprise à générer un résultat, la solidité de sa structure de financement et la qualité de conversion de ce résultat en trésorerie.

Le ratio de **fonds propres tangibles sur total bilan** est retenu comme mesure centrale de solvabilité parce qu'il capture la capacité d'absorption des pertes, après élimination des actifs incorporels et des non-valeurs. Une réévaluation non liquide ou une créance sur associé ne vaut pas recapitalisation en numéraire ; les comptes courants d'associés ne sont assimilés aux fonds propres que sous conditions juridiques de subordination, de blocage et de permanence approuvées.

Le **levier dette nette sur excédent brut d'exploitation** est l'indicateur de soutenabilité de l'endettement le plus discriminant sur la population corporate. Les seuils sont différenciés par segment : une PME supporte structurellement un levier plus faible qu'une grande entreprise à risque égal, faute d'accès au refinancement de marché.

La **conversion de l'excédent brut d'exploitation en cash-flow opérationnel**, moyennée sur trois exercices avec des poids dégressifs, détecte les situations où le résultat comptable ne se traduit pas en trésorerie — signal classique de dégradation de la qualité des créances ou de gonflement des stocks. Son poids croît fortement sur le segment GE, où la qualité de l'information permet une lecture fiable du tableau de flux.

### D2 — Capacité de remboursement et résistance au stress

Là où D1 mesure un état, D2 mesure une capacité prospective. Le **ratio de couverture du service de la dette** rapporte les flux disponibles aux échéances contractuelles, en incluant le crédit-bail et la dette assimilée — omission fréquente qui flatte artificiellement le ratio.

La **résistance au stress** applique un choc combiné adapté au secteur et mesure le ratio de couverture résiduel. Les chocs ne modifient jamais rétroactivement les comptes observés : ils produisent des métriques séparées, avec leur scénario, leur sévérité et leur effet documenté sur la décision.

La **liquidité disponible face au mur de dette** capture le risque de refinancement, distinct du risque de solvabilité : une entreprise solvable peut faire défaut sur un problème de calendrier.

### D3 — Comportement bancaire et historique de crédit

Ce domaine est le plus prédictif à court terme sur les petites contreparties, pour trois raisons : les données sont disponibles mensuellement, elles sont produites par la banque elle-même donc difficilement manipulables, et un incident de paiement est un signal de tension de trésorerie qui précède souvent de plusieurs mois la dégradation comptable.

Les **jours de retard** sont mesurés en maximum et en fréquence sur douze mois, complétés par vingt-quatre mois pour détecter la récidive. La définition du défaut et la classification réglementaire s'appliquent séparément et peuvent forcer un grade défaut.

Les **mouvements créditeurs rapportés aux flux attendus** mesurent la part d'activité réellement domiciliée. Une baisse de ce ratio signale soit une perte d'activité, soit un transfert de flux vers un concurrent — deux informations de risque différentes, à instruire. Les virements circulaires et mouvements artificiels sont exclus du calcul.

Une **absence de donnée externe n'est jamais assimilée à une absence d'incident.**

### D4 — Activité, secteur et positionnement

Le **risque sectoriel** provient d'un référentiel séparé, daté et approuvé, et n'est pas saisi librement par l'analyste — c'est une condition de comparabilité entre dossiers. Une entreprise performante dans un secteur faible conserve le score sectoriel de son secteur, mais peut obtenir de bons scores de position concurrentielle et de qualité de croissance.

Les **concentrations clients et fournisseurs** sont mesurées après élimination des ventes liées et circulaires. Un contrat de long terme de haute qualité peut justifier un relèvement d'un cran au maximum, documenté.

La **qualité de la croissance** distingue une croissance rentable financée par le cash-flow d'une expansion financée par la dette et le besoin en fonds de roulement — cette dernière étant une cause fréquente de défaillance d'entreprises par ailleurs profitables.

### D5 — Management, gouvernance et groupe

Sur la TPE et la PME familiale, la **dépendance à l'homme-clé** est un facteur de risque majeur et sous-évalué : l'indisponibilité du dirigeant peut compromettre immédiatement la relation client, la compétence technique et le pouvoir de signature.

Le critère **actionnariat, groupe et soutien** évalue la structure actionnariale ; il ne porte **pas** le relèvement lié au support groupe, qui relève d'une méthode dédiée conservant la note autonome et exigeant capacité, volonté, cadre juridique et transférabilité des fonds.

Les **transactions avec parties liées** sont surveillées comme vecteur principal de fuite de trésorerie dans les groupes non cotés.

### D6 — Transparence et conformité

Le domaine mesure un risque d'information, non une qualité morale. Le **délai de production** de l'information est un indicateur avancé reconnu : une dégradation du délai précède fréquemment l'annonce d'une mauvaise nouvelle.

La **cohérence entre le chiffre d'affaires comptable, déclaratif, les flux bancaires annualisés et les informations commerciales** constitue le contrôle anti-manipulation le plus efficace du dispositif.

Les contrôles de lutte contre le blanchiment, les sanctions et la connaissance client qui interdisent la relation sont des **contrôles bloquants**, jamais des points négatifs dilués dans un score.

### D7 — ESG et climat

Le domaine mesure un risque financier de crédit, pas une appréciation morale. Le **risque physique** est matériel au Maroc pour l'agriculture, l'agroalimentaire, le tourisme et les industries intensives en eau ; le **risque de transition** l'est pour les activités énergo-intensives et exportatrices vers des marchés à réglementation carbone.

Le module est proportionné et son poids reste modéré, afin de ne pas créer une fausse précision. Une exposition élevée assortie d'un plan crédible obtient un score intermédiaire ; **une absence de donnée n'équivaut jamais à un risque faible.**

## 12. Qualité des données et niveau de confiance

Le score de confiance combine quatre composantes — complétude, fraîcheur, fiabilité et provenance — chacune notée sur la même échelle discrète, avec des pondérations figurant en Partie III.

Le niveau de confiance ne modifie jamais le score brut : il plafonne le grade final. Un score de confiance insuffisant empêche la production d'un grade, le dossier étant alors déclaré incomplet ou routé vers un modèle alternatif. Le score brut reste calculé et conservé pour la surveillance du modèle.

Ce mécanisme évite l'écueil le plus fréquent des dispositifs de notation : produire une note d'apparence normale sur un dossier dont l'information est insuffisante.

## 13. Caps, red flags et dérogations

### 13.1 Caps structurels

Un cap signifie « le grade final ne peut pas être meilleur que ». Il ne remplace pas le score brut, qui reste conservé. L'application de plusieurs caps retient le plus contraignant. Chaque cap expose sa règle, sa version, la donnée déclenchante, le grade avant et après, et sa justification.

Les caps de la Partie III sont des propositions de **politique interne**, explicitement qualifiées comme telles : ce ne sont pas des règles réglementaires.

### 13.2 Red flags

Cinq niveaux sont distingués : `BLOCK` arrête la décision automatisée et déclenche une escalade ; `DEFAULT_CHECK` impose l'évaluation immédiate de la définition de défaut et de la classification ; `REFER` impose un comité ou un niveau de délégation supérieur ; `WARNING` autorise le calcul mais exige une condition ou une justification ; `INFO` est explicatif.

Chaque red flag porte sa **source** — réglementaire, IFRS 9, politique de crédit, conformité ou modèle. Un red flag interne n'est jamais présenté comme une exigence de Bank Al-Maghrib.

### 13.3 Dérogations

Le résultat moteur n'est jamais écrasé. L'outil conserve le score brut, le grade moteur, le grade après caps et le grade final. Une dérogation ordinaire est limitée à deux crans, exige un motif codifié, un commentaire, une preuve, un auteur et un valideur distinct, et porte une date d'expiration. L'amélioration d'un grade défaut est refusée hors processus formel de guérison. Les taux, sens, motifs et performance des dérogations font l'objet d'un suivi trimestriel.

## 14. Séparation avec la classification réglementaire, IFRS 9 et le capital

### 14.1 Classification réglementaire

La classe réglementaire est calculée par un moteur séparé, à partir du régime applicable à la date d'arrêté, des arriérés, des critères qualitatifs, des restructurations, de la contagion, des garanties éligibles et des règles de provision. Elle peut imposer un grade défaut interne, mais **le score 0–100 ne choisit jamais seul la classe réglementaire.**

L'outil conserve séparément le résultat de notation interne, le résultat de classification, la version du régime utilisé, le statut de rapprochement et les motifs de divergence.

Les régimes réglementaires successifs sont représentés comme des régimes effectifs-datés distincts. Dates, articles, taux et règles transitoires ne sont injectés qu'après validation depuis les textes officiels.

### 14.2 IFRS 9

Le grade et la probabilité de défaut internes sont une **entrée** du dispositif d'augmentation significative du risque et de calcul des pertes attendues, pas le stage lui-même. Le staging tient compte de l'évolution depuis l'octroi, des critères qualitatifs, de la surveillance rapprochée, des restructurations et des seuils de sécurité approuvés.

Une dégradation de deux crans peut constituer un indicateur paramétrable d'augmentation significative du risque, mais ne constitue pas une règle universelle sans politique validée.

### 14.3 Prudentiel

Une probabilité de défaut interne calibrée, une probabilité réglementaire en moyenne de long terme, une probabilité IFRS 9 ponctuelle et une fréquence de défaut observée **ne sont pas interchangeables**. De même, la perte en cas de défaut économique, celle d'IFRS 9 et celle en conditions dégradées sont stockées séparément, chacune avec son horizon, sa philosophie et son usage autorisé.

## 15. Exemples de calcul complets

### 15.1 TPE — cheminement complet

Une TPE dispose de trois exercices fiables et ne présente aucun défaut. Ses scores élémentaires sur le domaine D1 sont les suivants.

| Critère D1 | Score | Poids TPE (bps) | Contribution |
|---|---:|---:|---:|
| D1.1 Croissance | 75 | 300 | 22 500 |
| D1.2 Marge EBITDA | 50 | 300 | 15 000 |
| D1.3 Rentabilité | 50 | 200 | 10 000 |
| D1.4 Fonds propres | 75 | 400 | 30 000 |
| D1.5 Levier | 50 | 400 | 20 000 |
| D1.6 Liquidité | 75 | 400 | 30 000 |
| D1.7 BFR | 50 | 300 | 15 000 |
| D1.8 Conversion cash | 50 | 200 | 10 000 |
| **Total** | | **2 500** | **152 500** |

`Score D1 = 152 500 / 2 500 = 61,00`

Les autres domaines ressortent à D2 = 60, D3 = 82, D4 = 65, D5 = 70, D6 = 75 et D7 = 50.

`Score brut = 61 × 25 % + 60 × 10 % + 82 × 25 % + 65 × 15 % + 70 × 15 % + 75 × 7 % + 50 × 3 % = 68,75`

**Résultat : G6 — Acceptable.** Avec un niveau de confiance de 82, le cap « pas mieux que G4 » est enregistré mais reste sans effet, G6 étant déjà moins favorable. Un retard de paiement de 40 jours déclencherait néanmoins un signal `REFER` et l'analyse réglementaire et IFRS 9 indépendante.

### 15.2 PME — effet d'un cap structurel

| Domaine | Score | Poids PME | Contribution |
|---|---:|---:|---:|
| D1 | 72 | 30 % | 21,60 |
| D2 | 68 | 15 % | 10,20 |
| D3 | 75 | 20 % | 15,00 |
| D4 | 60 | 15 % | 9,00 |
| D5 | 65 | 12 % | 7,80 |
| D6 | 80 | 5 % | 4,00 |
| D7 | 50 | 3 % | 1,50 |
| **Total** | | **100 %** | **69,10** |

Résultat moteur : **G6**. Si le ratio de couverture du service de la dette est inférieur à 1,0 en scénario de base, le cap structurel limite le résultat à **G9**, alors même que le score brut demeure 69,10. Le score brut et le grade capé sont tous deux conservés : le premier alimente la surveillance du modèle, le second la décision.

### 15.3 Grande entreprise

| Domaine | Score | Poids GE | Contribution |
|---|---:|---:|---:|
| D1 | 78 | 30 % | 23,40 |
| D2 | 75 | 20 % | 15,00 |
| D3 | 80 | 10 % | 8,00 |
| D4 | 70 | 15 % | 10,50 |
| D5 | 75 | 15 % | 11,25 |
| D6 | 90 | 5 % | 4,50 |
| D7 | 60 | 5 % | 3,00 |
| **Total** | | **100 %** | **75,65** |

Résultat moteur : **G4 — Bon**. Un soutien de groupe ne modifie aucun score élémentaire ; un relèvement éventuel est calculé et approuvé séparément, la note autonome étant conservée.

---

# Partie III — Grilles détaillées

> **Section générée automatiquement depuis la configuration exécutée par le moteur** (`src/models/`), au moyen de `scripts/generate-model-doc.mts`. Toute modification d'un poids, d'un seuil ou d'un ancrage dans le code se répercute ici à la régénération. Cette section ne peut donc pas diverger du calcul réellement appliqué.

<!-- GRILLES_GENEREES -->

---

# Partie IV — L'outil

## 17. Principes d'architecture

L'outil est un **monolithe modulaire, orienté interface de programmation et neutre vis-à-vis du cloud**, plutôt qu'un ensemble prématuré de microservices. Ce choix privilégie le déterminisme, la simplicité d'exploitation et la capacité à démontrer qu'un résultat provient d'un chemin de calcul unique.

Quatre principes structurent l'implémentation.

**Le noyau de risque est pur.** Le répertoire `src/core/` n'importe ni framework web, ni couche d'accès aux données, ni bibliothèque de fournisseur. Le moteur est une fonction du couple (configuration de modèle, données d'entrée) vers un résultat. Cette propriété rend les tests métier exécutables sans base ni réseau, et garantit qu'aucune dépendance d'infrastructure ne peut altérer un calcul.

**Un seul moteur canonique par finalité.** Les dépôts examinés comptaient jusqu'à huit implémentations concurrentes de moteur de scoring, avec un risque de divergence selon le chemin d'appel. Ici, la notation possède un unique point d'entrée, dont la version est estampillée dans chaque résultat.

**Les cinq finalités sont séparées.** Notation, décision, classification réglementaire, IFRS 9 et capital sont cinq moteurs distincts, composés par un orchestrateur, jamais couplés mathématiquement.

**Aucune configuration n'est codée en dur.** Poids, seuils, barèmes, caps, red flags, échelle interne, pondérations de confiance et seuils de segmentation appartiennent à une version de modèle immuable, validée au chargement.

## 18. Le moteur de calcul

### 18.1 Validation d'une version de modèle

Une version de modèle est refusée au chargement — l'application ne démarre pas — si l'un des contrôles suivants échoue : la somme des poids de critères diffère de 100,00 % pour un segment ; un critère référence un domaine inexistant ; un barème quantitatif présente un trou, un chevauchement ou une incohérence d'inclusivité à une frontière ; un critère quantitatif pondéré n'a pas de barème pour son segment ; un critère qualitatif ne possède pas exactement les cinq ancrages ; l'échelle interne ne couvre pas l'intervalle complet des scores ; les pondérations de confiance ne totalisent pas 100 ; les bandes de confiance présentent une discontinuité ; un cap référence un grade inexistant.

Ce mécanisme rend structurellement impossible la mise en production d'un modèle dont les poids ne sommeraient pas à 100 % — défaut classique des dispositifs configurables.

### 18.2 Déterminisme et reproductibilité

Le moteur ne consulte ni horloge, ni générateur aléatoire, ni source externe. La date de calcul lui est fournie. Deux exécutions avec le même instantané et la même version produisent des résultats strictement identiques, propriété vérifiée par un test dédié.

Les poids sont manipulés en entiers ; les montants et scores utilisent un type décimal en base ; l'arrondi n'intervient qu'à l'affichage.

### 18.3 Traitement des situations dégradées

| Situation | Comportement |
|---|---|
| Red flag bloquant | Calcul arrêté avant toute agrégation ; aucun score produit ; motif de blocage explicite |
| Segment indéterminable | Scoring bloqué ; aucun segment par défaut |
| Donnée critique manquante ou invalide | Scoring bloqué, avec le critère nommé dans le motif |
| Donnée non critique manquante | Critère exclu du dénominateur, avertissement nommant le critère ; impact porté par le niveau de confiance |
| Critère non applicable | Poids redistribué à l'intérieur du domaine, sans avertissement |
| Cas spécial documenté | Score nul explicite, avec mention du cas dans l'explication |
| Confiance insuffisante | Aucun grade final ; score brut conservé pour la surveillance |
| Défaut avéré | Grade défaut forcé, indépendamment du score ; score brut conservé |

**À aucun moment une donnée absente n'est convertie en zéro ou en score neutre.**

### 18.4 Explicabilité

Chaque résultat porte, pour chaque critère : la valeur d'entrée, l'état de la donnée, la bande retenue avec ses bornes, le score attribué, le poids appliqué, la contribution au domaine et une explication en langue naturelle. Au niveau global : le score brut, les scores de domaine avec leur poids théorique et applicable, les caps appliqués avec leur source, les red flags avec leur niveau et leur traitement, les motifs de blocage, les avertissements, et les cinq principaux facteurs favorables et défavorables classés par contribution pondérée.

## 19. Interface de programmation bidirectionnelle

### 19.1 Principes contractuels

L'interface est décrite en OpenAPI 3.1 (`openapi.yaml`). Quatre principes la gouvernent.

**L'identité provient toujours du jeton**, jamais du corps de requête. Le champ identifiant l'auteur d'une exécution est renseigné par le serveur depuis le contexte de sécurité.

**Le client ne fournit jamais un poids, une formule ni un score final.** Il transmet des observations — valeurs mesurées et scores qualitatifs ancrés. Le serveur applique les poids et barèmes de la version publiée et recalcule intégralement.

**Les créations et calculs sont idempotents.** Une clé d'idempotence identique retourne l'exécution existante plutôt que d'en créer une seconde, contradictoire.

**Les erreurs suivent un format normalisé** (RFC 9457), sans trace d'exécution ni détail interne.

### 19.2 Ressources exposées

| Domaine | Points d'entrée |
|---|---|
| Santé | `GET /health` — sans authentification, sans donnée sensible |
| Modèles | `GET /models`, `GET /models/{modelId}` — configuration complète en lecture |
| Contreparties | `GET`, `POST /counterparties` ; `GET`, `PATCH /counterparties/{id}` ; `GET /counterparties/{id}/rating-runs` |
| Notation | `POST /rating-runs` (calcul persisté), `POST /rating-runs/simulate` (calcul sans effet de bord), `GET /rating-runs`, `GET /rating-runs/{id}` |
| Dérogations | `POST /overrides` (demandeur), `POST /overrides/{id}/decision` (valideur distinct) |
| Événements sortants | `GET`, `POST /webhook-subscriptions`, `DELETE /webhook-subscriptions/{id}` |

La consultation détaillée d'une exécution restitue l'instantané des données d'entrée **et** le résultat complet, permettant de rejouer et de vérifier un calcul historique.

### 19.3 Événements sortants

Les notifications sont signées en HMAC SHA-256 sur la concaténation de l'horodatage et du corps brut. Chaque envoi porte un identifiant unique servant de protection contre le rejeu, un horodatage et le type d'événement. Le consommateur doit vérifier la signature, rejeter au-delà d'une fenêtre de trois cents secondes, mémoriser l'identifiant et rester idempotent, la livraison étant garantie au moins une fois.

Chaque tentative est journalisée avec son statut, son nombre d'essais et son erreur éventuelle.

Événements produits : `rating.completed`, `rating.blocked`, `rating.overridden`, `counterparty.updated`.

## 20. Persistance et compatibilité multi-bases

### 20.1 Source de schéma unique

Le schéma possède une **source canonique unique** (`prisma/schema.template.prisma`) à partir de laquelle le schéma effectif est généré pour le dialecte cible. La génération est idempotente et réversible : appliquer successivement quatre dialectes puis revenir au premier restitue exactement le schéma d'origine, propriété vérifiée.

### 20.2 Choix de portabilité

| Choix | Motif |
|---|---|
| Identifiants textuels non séquentiels | Évite les collisions concurrentes et les fuites d'information par énumération ; supprime la dépendance aux séquences |
| Aucun type énuméré natif | Les énumérations natives sont mal supportées et coûteuses à faire évoluer sur certains moteurs ; les valeurs sont validées applicativement |
| Charges JSON stockées en texte | Supprime la dépendance à un type JSON natif propriétaire |
| Montants et scores en décimal | Élimine les erreurs d'arrondi du flottant binaire sur des valeurs financières |
| Horodatages en temps universel | Le fuseau métier est traité applicativement |
| Date d'arrêté distincte de la date d'enregistrement | Sépare temps métier et temps système, condition du rejeu historique |

### 20.3 Matrice de compatibilité

| Moteur | Niveau | Preuve disponible |
|---|---|---|
| PostgreSQL 15+ | Cible de référence | Schéma validé, application construite et exécutée |
| MySQL 8 / MariaDB 10.11+ | Schéma validé | Génération et validation du schéma vertes |
| SQL Server 2022+ | Schéma validé | Génération et validation du schéma vertes |
| Oracle 19c+ | À certifier | Nécessite une instance licenciée fournie par la banque |
| SQLite | Développement uniquement | Ne gère pas la précision décimale ; exclu de la production |

**Un dialecte n'est déclaré certifié qu'après exécution de la suite d'intégration complète sur une instance réelle de ce moteur.** La validation du schéma est une condition nécessaire, pas suffisante — cette distinction est maintenue explicitement, la déclaration de compatibilité sur la seule foi d'une abstraction d'ORM étant l'un des défauts relevés dans les dépôts audités.

## 21. Sécurité, habilitations et piste d'audit

### 21.1 Authentification et rôles

L'authentification s'effectue par clé porteuse, destinée à être remplacée par OAuth 2.1 / OIDC avec le fournisseur d'identité de la banque — le contrat restant identique : identité et rôle dérivés du jeton.

Quatre rôles hiérarchisés : lecteur, analyste, gestionnaire de risque, administrateur. Les clés sont conservées sous forme d'empreinte, jamais en clair, et comparées en temps constant.

**Aucun secret par défaut.** En l'absence de configuration de clés, l'application refuse toute requête authentifiée et lève une erreur explicite au démarrage en production. Une clé de moins de seize caractères est refusée. Ce point répond directement à un défaut constaté dans le dépôt de référence, où un secret de repli littéral était présent dans le code.

### 21.2 Séparation des tâches

Une dérogation est proposée par un acteur et décidée par un autre. L'auto-approbation est refusée techniquement, non par convention. L'amélioration d'un grade défaut est refusée hors processus formel de guérison. L'ampleur ordinaire est plafonnée à deux crans.

### 21.3 Audit transactionnel

Pour toute écriture critique, l'événement d'audit est inscrit **dans la même transaction** que l'opération métier : si l'audit échoue, l'opération est annulée. Une opération ne peut jamais être considérée comme réussie sans sa trace.

Ce point répond à un défaut constaté dans l'un des dépôts audités, où l'audit interceptait toute erreur et se limitait à un message en console, laissant l'opération métier réussir sans trace.

Chaque événement enregistre l'acteur, son rôle, l'action, le type et l'identifiant de ressource, le détail sérialisé de façon stable, et un identifiant de corrélation.

### 21.4 Validation des entrées

Tous les payloads sont validés par schéma strict côté serveur, avec rejet des propriétés inconnues. Un score qualitatif hors de l'ensemble autorisé est refusé ; une valeur transmise sur un critère quantitatif est traitée comme une mesure, jamais comme un score.

## 22. Parcours utilisateur

L'interface est intégralement consommatrice de la même logique que l'interface de programmation : aucun calcul n'est effectué dans le navigateur.

**Tableau de bord** — volumétrie, distribution des grades, dernières notations, modèles disponibles et leur statut de calibration.

**Contreparties** — référentiel avec dernière notation connue, score et date d'arrêté.

**Notation** — le formulaire est **généré depuis la version de modèle publiée**, jamais codé en dur. Chaque critère affiche son libellé, sa description, son poids pour le segment sélectionné, son état de donnée, le barème ou les cinq ancrages, et son caractère critique. Le changement de segment recompose immédiatement le formulaire avec les poids et barèmes correspondants.

**Résultat** — score brut, grade moteur, grade après caps, niveau de confiance, statut de calibration, décomposition par domaine puis par critère, caps appliqués avec leur source, red flags avec leur traitement, avertissements et motifs de blocage.

**Modèles** — consultation de la configuration exécutée : pondérations par domaine et par critère, échelle interne, caps et red flags. Ce que l'utilisateur consulte est exactement ce que le moteur applique.

**Méthodologie** — rappel permanent de la séparation des cinq finalités, de l'ordre de calcul et du statut de calibration.

Le bandeau de bas de page rappelle en permanence que le modèle est un seed expert non calibré et que ses seuils ne constituent ni des règles de Bank Al-Maghrib ni des paramètres IFRS 9.

## 23. Déploiement et exploitation

### 23.1 Modes de déploiement

**Démonstration locale en une commande** — `docker compose up --build` démarre PostgreSQL auto-hébergé, exécute la migration comme tâche séparée et démarre l'application.

**Sur site et cloud privé** — image conteneurisée exécutée sous un utilisateur non privilégié, avec sonde de santé intégrée, configurable par variables d'environnement sans reconstruction.

**Hors ligne** — l'image ne dépend d'aucun service en ligne à l'exécution.

Aucune dépendance obligatoire à un fournisseur de plateforme ou de base de données managée n'est introduite.

### 23.2 Configuration

Les secrets, la configuration technique, les politiques métier, les modèles validés et les référentiels sont séparés. L'application refuse de démarrer si un secret critique manque ou si un modèle publié est invalide.

### 23.3 Intégration continue

La chaîne exécute la génération du client de persistance, le contrôle de types, l'analyse statique, les tests, la construction, puis la validation du schéma sur les quatre dialectes cibles.

Ce point répond à un défaut constaté dans le dépôt audité, où le workflow appelait un script inexistant : la chaîne était verte sans avoir jamais exécuté le contrôle de types.

## 24. Stratégie de tests et preuves d'exécution

### 24.1 Couverture actuelle

Quarante-six tests couvrent : la validation des configurations de modèle (sommes de poids par segment et par domaine, exhaustivité des barèmes, détection de trous et d'incohérences d'inclusivité) ; les vecteurs d'agrégation exacts ; les bornes de barème une à une, y compris les valeurs immédiatement inférieure et supérieure ; la monotonie ; la segmentation dans tous ses cas de figure, y compris la primauté du chiffre d'affaires groupe et le blocage sur segment indéterminable ; les caps structurels et de confiance, isolés et combinés ; les red flags bloquants et non bloquants ; le défaut forcé ; la distinction entre non applicable et manquant ; le refus d'un score fourni par le client sur un critère quantitatif ; la reproductibilité.

### 24.2 Preuves d'exécution

| Contrôle | Commande | Résultat |
|---|---|---|
| Contrôle de types | `npm run type-check` | 0 erreur |
| Tests | `npm test` | 46 tests, 46 passés |
| Construction | `npm run build` | 20 routes compilées |
| Schéma PostgreSQL | `DATABASE_PROVIDER=postgresql npx prisma validate` | valide |
| Schéma MySQL | `DATABASE_PROVIDER=mysql npx prisma validate` | valide |
| Schéma SQL Server | `DATABASE_PROVIDER=sqlserver npx prisma validate` | valide |
| Schéma SQLite | `DATABASE_PROVIDER=sqlite npx prisma validate` | valide |
| Idempotence du générateur de schéma | cycle sur quatre dialectes | annotations intégralement restaurées |

### 24.3 Tests restant à produire

Tests d'intégration sur instances réelles pour chaque base cible ; tests de contrat d'interface ; tests de charge sur les objectifs de latence et de traitement de masse ; tests de sécurité automatisés sur la matrice d'habilitations, l'accès horizontal, le rejeu de notification et d'idempotence ; tests réglementaires, conditionnés à la validation du corpus.

---

# Partie V — Gouvernance

## 25. Calibration statistique et passage au modèle challenger

### 25.1 Construction du jeu de données

Constituer un jeu de données par date d'observation, avec une performance mesurée à douze mois selon une définition de défaut approuvée. Conserver au minimum des échantillons de développement, de validation et hors période. Documenter les changements de politique et les biais d'acceptation.

Analyser séparément les segments TPE, PME et GE, puis tester si un regroupement avec interactions est plus robuste.

### 25.2 Étapes du passage

1. tester la qualité, le taux de valeurs manquantes et la stabilité de chaque variable ;
2. mesurer le pouvoir discriminant univarié et vérifier le sens économique ;
3. construire des bandes monotones et stables ;
4. tester corrélations et colinéarité ;
5. estimer une grille de score logistique transparente ;
6. comparer au score expert et expliquer les divergences ;
7. calibrer la tendance centrale et les probabilités par grade ;
8. ajouter une marge de prudence documentée ;
9. réaliser la validation indépendante et le passage en comité modèles ;
10. déployer d'abord en challenger, en mode fantôme.

### 25.3 Segment des grandes entreprises

Le segment GE produit structurellement trop peu de défauts pour une estimation classique. Traiter explicitement ce cas par regroupement avec test d'homogénéité, information externe validée avec justification de transposabilité, approche hiérarchique ou bayésienne, estimation par intervalle avec borne haute prudente, et marge de prudence croissante avec l'incertitude.

Documenter le nombre de défauts par grade et par génération : **un tableau de calibration sans effectifs est irrecevable.** Ne jamais extrapoler une probabilité sur un grade sans défaut observé sans marge documentée.

## 26. Validation indépendante et surveillance

Indicateurs minimaux : pouvoir discriminant avec intervalles de confiance ; score de Brier et log-vraisemblance ; ordonnée à l'origine et pente de calibration, rapport observé sur attendu ; taux de défaut par grade et monotonie ; matrices de migration et stabilité ; indices de stabilité de population et de caractéristiques ; performance par segment, secteur, région et qualité de donnée ; taux, sens, motifs et performance des dérogations ; sensibilité et robustesse ; analyse de biais et de variables de substitution illicites ; comparaison champion-challenger.

Des zones de surveillance peuvent être proposées, mais doivent être adaptées au portefeuille et **approuvées par la banque**. Un seuil générique de place ne remplace ni l'appétence au risque de l'établissement ni l'analyse de ses intervalles de confiance.

## 27. Fréquences de revue

| Élément | Fréquence |
|---|---|
| Actualisation de la note TPE et PME | Annuelle, ou sur événement significatif |
| Actualisation de la note GE | Annuelle au minimum, revue intermédiaire selon exposition |
| Comportement et alerte précoce | Mensuelle ou plus fréquente selon les systèmes |
| Référentiel sectoriel | Trimestrielle à semestrielle selon volatilité |
| Surveillance du modèle | Trimestrielle, synthèse annuelle |
| Contrôle a posteriori des probabilités de défaut | Annuel, avec générations suffisantes |
| Recalibration | Sur déclencheur ou périodicité approuvée |
| Validation indépendante complète | Selon matérialité et politique modèle, et après tout changement majeur |
| Revue des dérogations et des caps | Trimestrielle |
| Revue des règles réglementaires | À chaque nouveau texte ou date d'effet, et au moins annuellement |

## 28. Décisions du comité modèles avant pilote

1. valider le périmètre et les modèles dédiés ;
2. confirmer la segmentation et la définition du groupe ;
3. approuver la définition du défaut et de la guérison ;
4. valider les formules et retraitements financiers ;
5. challenger les poids et seuils sur le portefeuille ;
6. décider entre modèle TPE standard et comportemental ;
7. approuver les caps, red flags et politiques de données manquantes ;
8. valider l'échelle interne et les règles de dérogation ;
9. approuver le plan de calibration et de validation indépendante ;
10. confirmer la séparation des cinq moteurs ;
11. valider les sources de données et les habilitations ;
12. autoriser un pilote en mode fantôme avant tout usage contraignant.

---

# Annexes

## Annexe A — Vecteurs de contrôle chiffrés

Ces vecteurs sont exacts et vérifiables par exécution. Ils constituent le socle de non-régression du moteur.

| # | Objet | Attendu |
|---|---|---|
| 1 | Agrégation du domaine D1 sur TPE, scores 75/50/50/75/50/75/50/50 | 61,00 |
| 2 | Agrégation globale TPE, domaines 61/60/82/65/70/75/50 | 68,75 → G6 |
| 3 | Cap structurel sur score 69,10 avec couverture de dette insuffisante | brut 69,10 conservé, moteur G6, final G9 |
| 4 | Confiance sur composantes 75/100/75/100 | 83,75 → niveau moyen → cap G4 |
| 5 | Agrégation globale GE, domaines 78/75/80/70/75/90/60 | 75,65 → G4 |
| 6 | Bornes du levier TPE | 1,0 → 100 ; 1,0001 → 75 ; 2,0 → 75 ; 2,0001 → 50 ; 3,5 → 50 ; 3,5001 → 25 ; 5,0 → 25 ; 5,0001 → 0 |
| 7 | Deux critères non applicables sur quatre, les autres à 50 | score de domaine 50, poids applicable réduit, score global inchangé |

## Annexe B — Registre des écarts et travaux futurs

| # | Écart ou travail | Nature | Condition de levée |
|---|---|---|---|
| 1 | Seuils de segmentation non confirmés | Hypothèse | Extraction depuis le corpus applicable et validation Conformité |
| 2 | Probabilité de défaut non calibrée | Limitation assumée | Historique suffisant, calibration, validation indépendante |
| 3 | Moteurs de décision, classification, IFRS 9 et capital non implémentés | Périmètre | Validation du corpus réglementaire (Porte 1) |
| 4 | Référentiel sectoriel non alimenté | Dépendance | Construction et approbation du référentiel daté |
| 5 | Méthode de support groupe spécifiée mais non implémentée | Périmètre | Approbation de la grille de relèvement |
| 6 | Percentiles sectoriels référencés dans les grilles qualitatives | Dépendance | Alimentation du référentiel avec effectifs et périodes |
| 7 | Oracle non certifié | Certification | Instance licenciée fournie par la banque |
| 8 | Authentification par clé, non OIDC | Transitoire | Raccordement au fournisseur d'identité de la banque |
| 9 | Imports de masse et connecteurs non implémentés | Périmètre | Phase 4 |
| 10 | Alerte précoce non implémentée | Périmètre | Phase 4 |
| 11 | Multilinguisme arabe et droite-à-gauche non implémenté | Périmètre | Phase 4 |
| 12 | Tests d'intégration sur instances réelles non exécutés | Preuve | Mise à disposition des environnements de test |

---

**Conclusion.** Cette version 2.0 est suffisamment détaillée pour paramétrer le moteur, construire les écrans, préparer les imports et créer les cas de référence. Elle devient un dispositif bancaire de production uniquement après calibration, validation indépendante, approbation réglementaire et interne, et pilote contrôlé.
