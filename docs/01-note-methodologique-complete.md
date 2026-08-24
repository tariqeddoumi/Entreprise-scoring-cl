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

**Le modèle ne prétend pas prédire une probabilité de défaut.** Il produit un classement ordinal fiable et explicable. La calibration actuellement attachée est établie sur des données **simulées** : elle porte un statut distinct, `CALIBRATED_SYNTHETIC`, et l'outil signale son origine partout où la probabilité est restituée. L'usage de ce score pour IFRS 9, la tarification ou le capital réglementaire reste exclu jusqu'à une calibration sur défauts observés, validée indépendamment. C'est une position volontairement prudente : un score expert présenté comme une probabilité de défaut exposerait l'établissement à une critique immédiate de la validation indépendante et du superviseur. La calibration viendra de l'historique que ce dispositif permettra précisément de constituer.

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
| Le score expert est utilisé comme une probabilité de défaut | Moyenne | Statut de calibration distinct et propagé au contrat d'interface, à l'instantané persisté et à l'écran de résultat ; toute probabilité issue de données simulées est marquée `CALIBRATED_SYNTHETIC` et accompagnée de son avertissement |
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

Les poids initiaux résultent d'un jugement expert structuré, non d'une optimisation statistique — impossible en l'absence d'historique. Ils suivent trois principes : le poids d'un domaine reflète sa **valeur informationnelle attendue** compte tenu de la qualité de la donnée disponible sur le segment ; aucun critère élémentaire ne dépasse 6 % du score global dans le modèle standard, afin qu'aucune variable isolée ne détermine la note — le modèle TPE comportemental admet un plafond de 8 %, la mesure des retards de paiement y étant la variable la plus discriminante disponible ; la somme est vérifiée à exactement 100,00 % par segment, contrôle automatisé qui fait échouer le démarrage de l'application en cas d'écart.

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

## Modèle standard — CORP_STD_V1

Identifiant `CORP_STD_V1` · version 1.0.0 · statut DRAFT_EXPERT_SEED · date d'effet 2026-08-18.

Score 100 = risque le plus faible ; score 0 = risque le plus élevé.

### Pondération des domaines

| Domaine | TPE | PME | GE |
|---|---:|---:|---:|
| D1 — Performance financière et structure bilancielle | 25.00 % | 30.00 % | 30.00 % |
| D2 — Capacité de remboursement et stress | 10.00 % | 15.00 % | 20.00 % |
| D3 — Comportement bancaire et historique de crédit | 25.00 % | 20.00 % | 10.00 % |
| D4 — Activité, secteur et positionnement | 15.00 % | 15.00 % | 15.00 % |
| D5 — Management, gouvernance et groupe | 15.00 % | 12.00 % | 15.00 % |
| D6 — Transparence et conformité | 7.00 % | 5.00 % | 5.00 % |
| D7 — ESG et climat | 3.00 % | 3.00 % | 5.00 % |
| **Total** | **100.00 %** | **100.00 %** | **100.00 %** |

### Pondération des 45 critères élémentaires

| Code | Critère | TPE | PME | GE |
|---|---|---:|---:|---:|
| D1.1 | Croissance et stabilité du chiffre d'affaires | 3.00 % | 3.00 % | 3.00 % |
| D1.2 | Marge EBITDA / performance opérationnelle | 3.00 % | 4.00 % | 4.00 % |
| D1.3 | Rentabilité économique / ROA ajusté | 2.00 % | 3.00 % | 3.00 % |
| D1.4 | Fonds propres tangibles / total bilan | 4.00 % | 5.00 % | 4.00 % |
| D1.5 | Dette financière nette / EBITDA ajusté | 4.00 % | 5.00 % | 5.00 % |
| D1.6 | Liquidité court terme | 4.00 % | 4.00 % | 3.00 % |
| D1.7 | BFR et cycle de conversion de trésorerie | 3.00 % | 3.00 % | 3.00 % |
| D1.8 | Conversion EBITDA en cash-flow opérationnel | 2.00 % | 3.00 % | 5.00 % |
| D2.1 | Couverture des intérêts | 1.50 % | 2.00 % | 3.00 % |
| D2.2 | DSCR / couverture du service de la dette | 3.00 % | 4.00 % | 5.00 % |
| D2.3 | Free cash-flow / dette financière | 1.00 % | 2.00 % | 3.00 % |
| D2.4 | Liquidité disponible et mur de dette | 1.50 % | 2.00 % | 3.00 % |
| D2.5 | Résistance au scénario de stress | 2.00 % | 3.00 % | 4.00 % |
| D2.6 | Covenants et marge de sécurité | 1.00 % | 2.00 % | 2.00 % |
| D3.1 | Retards de paiement / DPD | 6.00 % | 5.00 % | 2.50 % |
| D3.2 | Dépassements et irrégularités de compte | 4.00 % | 3.00 % | 1.50 % |
| D3.3 | Utilisation des lignes | 3.00 % | 2.00 % | 1.00 % |
| D3.4 | Mouvements créditeurs et domiciliation | 4.00 % | 3.00 % | 1.50 % |
| D3.5 | Incidents chèques et effets de commerce | 4.00 % | 3.00 % | 1.00 % |
| D3.6 | Restructuration et forbearance | 2.00 % | 2.00 % | 1.50 % |
| D3.7 | Tendance de l'endettement système et groupe | 2.00 % | 2.00 % | 1.00 % |
| D4.1 | Risque sectoriel interne | 3.00 % | 3.00 % | 3.00 % |
| D4.2 | Position concurrentielle | 2.00 % | 2.50 % | 3.00 % |
| D4.3 | Concentration clients | 2.50 % | 2.00 % | 1.50 % |
| D4.4 | Concentration fournisseurs | 2.00 % | 1.50 % | 1.50 % |
| D4.5 | Visibilité des revenus / carnet de commandes | 2.00 % | 2.00 % | 2.00 % |
| D4.6 | Exposition pays, change et matières premières | 1.00 % | 1.50 % | 1.50 % |
| D4.7 | Risque opérationnel, technologie et capex | 1.50 % | 1.50 % | 1.50 % |
| D4.8 | Qualité et soutenabilité de la croissance | 1.00 % | 1.00 % | 1.00 % |
| D5.1 | Expérience et stabilité du management | 3.00 % | 2.50 % | 2.50 % |
| D5.2 | Dépendance homme-clé et succession | 2.50 % | 1.50 % | 1.50 % |
| D5.3 | Gouvernance et contrôle interne | 2.00 % | 2.00 % | 3.00 % |
| D5.4 | Actionnariat, groupe et soutien | 2.00 % | 1.50 % | 2.50 % |
| D5.5 | Stratégie et qualité d'exécution | 2.00 % | 1.50 % | 2.00 % |
| D5.6 | Transactions avec parties liées | 1.50 % | 1.50 % | 1.50 % |
| D5.7 | Pilotage financier et culture du risque | 2.00 % | 1.50 % | 2.00 % |
| D6.1 | Qualité / certification des états financiers | 1.50 % | 1.25 % | 1.50 % |
| D6.2 | Délai de production de l'information | 1.50 % | 1.00 % | 0.75 % |
| D6.3 | Cohérence et rapprochements | 1.50 % | 1.00 % | 1.00 % |
| D6.4 | Situation juridique, fiscale et sociale | 1.50 % | 1.00 % | 0.75 % |
| D6.5 | Transparence actionnariat et documents | 1.00 % | 0.75 % | 1.00 % |
| D7.1 | Risque climatique physique | 1.00 % | 1.00 % | 1.50 % |
| D7.2 | Risque de transition | 0.50 % | 0.75 % | 1.50 % |
| D7.3 | Conformité environnementale et sociale | 1.00 % | 0.75 % | 1.00 % |
| D7.4 | Gouvernance ESG et plan d'adaptation | 0.50 % | 0.50 % | 1.00 % |

### D1 — Performance financière et structure bilancielle

#### D1.1 — Croissance et stabilité du chiffre d'affaires

CAGR sur trois exercices, nombre d'années en baisse et volatilité vs secteur. Une croissance excessive financée par dette/BFR est examinée aussi en D4.8.

**Poids :** TPE 3.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | CAGR +3 % à +20 %, aucune baisse annuelle > 10 %, volatilité faible, ≥ médiane sectorielle |
| 75 | CAGR 0 % à +3 % ou +20 % à +30 % ; une baisse ponctuelle ≤ 10 % expliquée et corrigée |
| 50 | CAGR −5 % à 0 %, ou > +30 % avec tension BFR maîtrisable, ou volatilité matérielle sans tendance durable |
| 25 | CAGR −15 % à −5 %, ou deux exercices consécutifs en baisse, ou écart défavorable au secteur > 10 points |
| 0 | CAGR < −15 %, effondrement récent > 25 %, perte majeure de clientèle ou CA non fiable |

**Justificatifs requis :** États financiers N, N−1, N−2 ; Comparaison sectorielle datée.

#### D1.2 — Marge EBITDA / performance opérationnelle

EBITDA ajusté/CA, percentile sectoriel, tendance sur trois ans. Si l'EBITDA est non pertinent pour l'activité, utiliser un indicateur opérationnel équivalent validé.

**Poids :** TPE 3.00 % · PME 4.00 % · GE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Marge ≥ P75 sectoriel, positive sur trois ans et stable/améliorée de ≥ 1 point |
| 75 | Marge entre P50 et P75, positive et stable à ±1 point |
| 50 | Marge entre P25 et P50, ou baisse de 1 à 3 points en restant positive |
| 25 | Marge entre P10 et P25, ou baisse > 3 points, ou un exercice proche de zéro |
| 0 | Marge négative au dernier exercice, < P10, pertes opérationnelles récurrentes ou EBITDA non fiable |

**Justificatifs requis :** EBITDA ajusté et trace des retraitements ; Référentiel sectoriel daté.

#### D1.3 — Rentabilité économique / ROA ajusté

Résultat opérationnel après impôt normatif / actifs économiques moyens, comparaison sectorielle et volatilité.

**Poids :** TPE 2.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | ≥ P75 sectoriel, positif sur trois ans, sans dépendance à un produit exceptionnel |
| 75 | P50 à P75, positif et stable |
| 50 | P25 à P50, faible mais positif, ou un exercice déficitaire non récurrent |
| 25 | P10 à P25, proche de zéro ou forte dépendance à des éléments non récurrents |
| 0 | Négatif au dernier exercice et tendance non corrigée, ou < P10 sur deux exercices |

#### D1.4 — Fonds propres tangibles / total bilan

FP tangibles / total bilan ajusté, en %. Une réévaluation non liquide ou une créance sur associé ne vaut pas recapitalisation en cash. Comptes courants d'associés assimilés aux FP uniquement si subordination, blocage et permanence approuvés.

**Formule :** `FP_tangibles / total_bilan_ajusté`

**Poids :** TPE 4.00 % · PME 5.00 % · GE 4.00 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≥ 35 % | [25 % ; 35 %[ | [15 % ; 25 %[ | [5 % ; 15 %[ | < 5 % |
| PME | ≥ 35 % | [25 % ; 35 %[ | [15 % ; 25 %[ | [8 % ; 15 %[ | < 8 % |
| GE | ≥ 30 % | [20 % ; 30 %[ | [12 % ; 20 %[ | [5 % ; 12 %[ | < 5 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `NEGATIVE_TANGIBLE_EQUITY` | Fonds propres tangibles négatifs — déclenche également le cap CAP02 | 0 |

**Justificatifs requis :** Bilan et retraitements des incorporels/non-valeurs.

#### D1.5 — Dette financière nette / EBITDA ajusté

Dette nette négative : score 100 uniquement si trésorerie libre, durable, rapprochée et non affectée. Holding : look-through des flux/dividendes, pas d'application mécanique.

**Formule :** `dette_financière_nette / EBITDA_ajusté`

**Poids :** TPE 4.00 % · PME 5.00 % · GE 5.00 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≤ 1x | ]1x ; 2x] | ]2x ; 3.5x] | ]3.5x ; 5x] | > 5x |
| PME | ≤ 1.5x | ]1.5x ; 2.5x] | ]2.5x ; 3.5x] | ]3.5x ; 5x] | > 5x |
| GE | ≤ 1.5x | ]1.5x ; 2.5x] | ]2.5x ; 3.5x] | ]3.5x ; 4.5x] | > 4.5x |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `EBITDA_LTE_0` | EBITDA nul ou négatif : le levier n'est pas calculable, la situation est défavorable | 0 |

**Justificatifs requis :** États financiers ; Trace des retraitements dette/trésorerie.

#### D1.6 — Liquidité court terme

Actif circulant réalisable CT / passif circulant exigible, stocks obsolètes et créances douteuses retraités. Secteurs à BFR structurellement négatif : sous-modèle cash/stress validé.

**Poids :** TPE 4.00 % · PME 4.00 % · GE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≥ 1.5x | [1.25x ; 1.5x[ | [1x ; 1.25x[ | [0.8x ; 1x[ | < 0.8x |
| PME | ≥ 1.5x | [1.25x ; 1.5x[ | [1x ; 1.25x[ | [0.8x ; 1x[ | < 0.8x |
| GE | ≥ 1.4x | [1.2x ; 1.4x[ | [1x ; 1.2x[ | [0.85x ; 1x[ | < 0.85x |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `CASH_BREAK` | Rupture de trésorerie avérée sur la période | 0 |

#### D1.7 — BFR et cycle de conversion de trésorerie

DSO + DIO − DPO, évolution en jours et percentile sectoriel. Un DPO artificiellement élevé lié à des fournisseurs impayés est défavorable.

**Poids :** TPE 3.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Cycle ≤ P25 sectoriel, stable ou amélioré ; aucune tension fournisseur |
| 75 | Entre P25 et P50 ; détérioration ≤ 5 jours |
| 50 | Entre P50 et P75 ou détérioration de 6 à 15 jours, financée sans dépassement |
| 25 | > P75 ou détérioration de 16 à 45 jours ; stocks/créances vieillissants |
| 0 | > P90 avec détérioration > 45 jours, actifs non recouvrables, fournisseurs durablement impayés ou BFR non finançable |

#### D1.8 — Conversion EBITDA en cash-flow opérationnel

Moyenne pondérée sur trois ans de CFO ajusté / EBITDA ajusté (50 % N, 30 % N−1, 20 % N−2), en %. Si EBITDA ≤ 0 : score 0 sauf règle spécifique documentée.

**Formule :** `0,5×(CFO/EBITDA)_N + 0,3×(CFO/EBITDA)_N−1 + 0,2×(CFO/EBITDA)_N−2`

**Poids :** TPE 2.00 % · PME 3.00 % · GE 5.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≥ 90 % |
| 75 | [70 % ; 90 %[ |
| 50 | [50 % ; 70 %[ |
| 25 | [20 % ; 50 %[ |
| 0 | < 20 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `EBITDA_LTE_0` | EBITDA nul ou négatif : la conversion en trésorerie n'est pas mesurable | 0 |

### D2 — Capacité de remboursement et stress

#### D2.1 — Couverture des intérêts

EBITDA ajusté / charges financières cash ajustées. Holding : cash-flow récurrent disponible / intérêts.

**Poids :** TPE 1.50 % · PME 2.00 % · GE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≥ 5x | [3x ; 5x[ | [2x ; 3x[ | [1x ; 2x[ | < 1x |
| PME | ≥ 5x | [3x ; 5x[ | [2x ; 3x[ | [1.2x ; 2x[ | < 1.2x |
| GE | ≥ 6x | [4x ; 6x[ | [2.5x ; 4x[ | [1.5x ; 2.5x[ | < 1.5x |

#### D2.2 — DSCR / couverture du service de la dette

CFADS / (intérêts + principal exigibles), service de dette complet y compris leasing et dette assimilée. Revolving sans amortissement : convention de conversion documentée.

**Poids :** TPE 3.00 % · PME 4.00 % · GE 5.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≥ 1.5x | [1.3x ; 1.5x[ | [1.15x ; 1.3x[ | [1x ; 1.15x[ | < 1x |
| PME | ≥ 1.6x | [1.35x ; 1.6x[ | [1.2x ; 1.35x[ | [1x ; 1.2x[ | < 1x |
| GE | ≥ 1.75x | [1.4x ; 1.75x[ | [1.2x ; 1.4x[ | [1x ; 1.2x[ | < 1x |

**Justificatifs requis :** Échéancier complet de la dette ; CFADS et retraitements.

#### D2.3 — Free cash-flow / dette financière

FCF récurrent / dette financière brute moyenne, en %. Un ratio élevé dû à des capex de maintien artificiellement faibles doit être retraité.

**Poids :** TPE 1.00 % · PME 2.00 % · GE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≥ 20 % |
| 75 | [12 % ; 20 %[ |
| 50 | [5 % ; 12 %[ |
| 25 | [0 % ; 5 %[ |
| 0 | < 0 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `FCF_NEGATIVE_2_OF_3` | Free cash-flow négatif deux années sur trois | 0 |

#### D2.4 — Liquidité disponible et mur de dette

Cash libre + lignes confirmées disponibles rapportés aux besoins et échéances des 12 prochains mois.

**Poids :** TPE 1.50 % · PME 2.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Couverture ≥ 12 mois, headroom ≥ 30 %, aucune échéance concentrée non financée |
| 75 | Couverture 9–12 mois, headroom 20–30 %, refinancement très probable et documenté |
| 50 | Couverture 6–9 mois, headroom 10–20 %, dépendance modérée au renouvellement |
| 25 | Couverture 3–6 mois, headroom < 10 %, mur de dette proche ou lignes non confirmées |
| 0 | Couverture < 3 mois, gap avéré, refinancement non sécurisé ou rupture prévisible |

#### D2.5 — Résistance au scénario de stress

DSCR minimal sous choc combiné seed (CA −10 %, marge −2 pts, taux +200 pb, DSO +15 j, change) — chocs définitifs calibrés sur l'historique et les stress BAM/internes (Directive 2/G/10).

**Poids :** TPE 2.00 % · PME 3.00 % · GE 4.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≥ 1.4x |
| 75 | [1.2x ; 1.4x[ |
| 50 | [1x ; 1.2x[ |
| 25 | [0.8x ; 1x[ |
| 0 | < 0.8x |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `STRESS_LIQUIDITY_BREAK` | Rupture de liquidité sous stress, sans mesure de redressement crédible | 0 |

#### D2.6 — Covenants et marge de sécurité

**Poids :** TPE 1.00 % · PME 2.00 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucun covenant financier ou marge ≥ 30 % sur tous les covenants ; reporting à jour |
| 75 | Marge entre 20 % et 30 % ; aucune tendance de rupture |
| 50 | Marge entre 10 % et 20 % ou waiver ancien régularisé |
| 25 | Marge entre 0 % et 10 %, waiver en cours ou reporting incomplet |
| 0 | Covenant rompu non régularisé, information dissimulée ou accélération possible de dette |

### D3 — Comportement bancaire et historique de crédit

#### D3.1 — Retards de paiement / DPD

Maximum de jours de retard sur 12 mois (fréquence et 24 mois pour récidive en analyse). La définition de défaut et la classification réglementaire s'appliquent séparément.

**Poids :** TPE 6.00 % · PME 5.00 % · GE 2.50 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Score | Bande |
|---:|---|
| 100 | ≤ 0 j |
| 75 | ]0 j ; 7 j] |
| 50 | ]7 j ; 30 j] |
| 25 | ]30 j ; 60 j] |
| 0 | > 60 j |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `UNPAID_NOT_CURED` | Impayé non régularisé — à instruire avec RF06/RF07 | 0 |
| `UNLIKELY_TO_PAY` | Signal d'incapacité probable de payer — à instruire avec RF06 | 0 |

**Justificatifs requis :** Système autoritatif DPD banque.

#### D3.2 — Dépassements et irrégularités de compte

Sur 12 mois glissants.

**Poids :** TPE 4.00 % · PME 3.00 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucun dépassement non autorisé |
| 75 | Un dépassement ≤ 3 jours et ≤ 5 % de la ligne, régularisé spontanément |
| 50 | 4–15 jours cumulés ou 2–3 épisodes, montant ≤ 10 % de la ligne |
| 25 | 16–30 jours cumulés, épisodes mensuels ou montant > 10 % |
| 0 | > 30 jours, dépassement permanent, compte bloqué ou absence d'autorisation |

#### D3.3 — Utilisation des lignes

Moyenne, maximum, saisonnalité et variation de l'utilisation des lignes confirmées. Une utilisation moyenne saine se situe entre 20 % et 70 %.

**Poids :** TPE 3.00 % · PME 2.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Utilisation moyenne 20–70 %, pics cohérents avec la saisonnalité, marge disponible |
| 75 | 10–20 % ou 70–85 %, utilisation stable et justifiée |
| 50 | 85–95 %, ou hausse > 20 points sur six mois, sans dépassement |
| 25 | > 95 % pendant plus de trois mois, pics fréquents ou dépendance au renouvellement |
| 0 | > 100 % non autorisé, ligne saturée sans capacité de réduction ou besoin structurel non financé |

#### D3.4 — Mouvements créditeurs et domiciliation

Mouvements créditeurs observés / flux attendus (%), tendance 12 mois et part des flux domiciliés. Virements circulaires et mouvements artificiels exclus.

**Poids :** TPE 4.00 % · PME 3.00 % · GE 1.50 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≥ 110 % |
| 75 | [90 % ; 110 %[ |
| 50 | [70 % ; 90 %[ |
| 25 | [50 % ; 70 %[ |
| 0 | < 50 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `ARTIFICIAL_FLOWS` | Mouvements créditeurs artificiels (virements circulaires, allers-retours) | 0 |
| `BANKING_ACTIVITY_STOPPED` | Activité bancaire quasi arrêtée sur la période | 0 |

#### D3.5 — Incidents chèques et effets de commerce

Sur 24 mois, sources autorisées (SCIP/centrale des incidents).

**Poids :** TPE 4.00 % · PME 3.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Absence d'incident vérifiée auprès des sources autorisées |
| 75 | Un incident mineur, erreur technique démontrée, régularisé ≤ 5 jours |
| 50 | Un à deux incidents régularisés ≤ 30 jours, montant non matériel |
| 25 | Incidents récurrents, régularisation tardive ou incident matériel |
| 0 | Incident grave/non régularisé, interdiction ou signal bloquant selon dispositif applicable |

#### D3.6 — Restructuration et forbearance

**Poids :** TPE 2.00 % · PME 2.00 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucune restructuration ni concession liée à une difficulté financière |
| 75 | Restructuration ancienne > 36 mois, période probatoire achevée, performance durable |
| 50 | Restructuration entre 24 et 36 mois, paiements réguliers, surveillance en cours |
| 25 | Restructuration < 24 mois, concession significative ou dépendance à un moratoire |
| 0 | Échec de restructuration, seconde concession, impayé post-restructuration ou défaut |

#### D3.7 — Tendance de l'endettement système et groupe

Données centrale des risques et vision groupe, dans les limites légales.

**Poids :** TPE 2.00 % · PME 2.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Endettement stable/en baisse, aucun incident groupe, capacité consolidée confortable |
| 75 | Hausse ≤ 10 % cohérente avec croissance et cash-flow |
| 50 | Hausse de 10–25 %, nouvelle banque/ligne ou concentration accrue mais justifiée |
| 25 | Hausse > 25 %, dette non expliquée, multiplication de demandes ou dégradation d'une entité liée |
| 0 | Cross-default, contagion applicable, dette cachée, incident majeur groupe ou soutien inversé non soutenable |

### D4 — Activité, secteur et positionnement

#### D4.1 — Risque sectoriel interne

Grade issu du référentiel sectoriel interne séparé, daté et approuvé (S1=100, S2=75, S3=50, S4=25, S5=0). Jamais saisi librement par l'analyste.

**Poids :** TPE 3.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | S1 — secteur très résilient |
| 75 | S2 — secteur résilient |
| 50 | S3 — secteur moyen/cyclique maîtrisable |
| 25 | S4 — secteur vulnérable/sous surveillance |
| 0 | S5 — secteur très vulnérable/crise structurelle |

**Justificatifs requis :** Référentiel sectoriel interne daté et version.

#### D4.2 — Position concurrentielle

**Poids :** TPE 2.00 % · PME 2.50 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Leader ou niche dominante ; avantages défendables ; pouvoir de prix ; preuves de parts de marché |
| 75 | Position forte ; différenciation claire ; bonne fidélité ; marges au moins sectorielles |
| 50 | Position moyenne ; offre comparable au marché ; pression concurrentielle normale |
| 25 | Position faible ; perte de parts/clients ; pression prix élevée ; dépendance à un canal |
| 0 | Position marginale/non viable ; produit obsolète ; rupture de licence ; perte du marché essentiel |

#### D4.3 — Concentration clients

Part du premier client (ou groupe client) dans le chiffre d'affaires, en %, après élimination des ventes liées et circulaires. Le barème est appliqué par le moteur : l'analyste renseigne une mesure, il ne choisit pas un niveau. Une mitigation contractuelle documentée peut relever d'un cran au maximum, via une dérogation tracée.

**Formule :** `CA_premier_client / CA_total`

**Poids :** TPE 2.50 % · PME 2.00 % · GE 1.50 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≤ 15 % | ]15 % ; 25 %] | ]25 % ; 35 %] | ]35 % ; 50 %] | > 50 % |
| PME | ≤ 10 % | ]10 % ; 20 %] | ]20 % ; 30 %] | ]30 % ; 45 %] | > 45 % |
| GE | ≤ 10 % | ]10 % ; 15 %] | ]15 % ; 25 %] | ]25 % ; 40 %] | > 40 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `MAIN_CLIENT_LOSS_LIKELY` | Perte probable du client principal (préavis reçu, appel d'offres perdu) | 0 |

**Justificatifs requis :** Balance clients ; Élimination des ventes intragroupe.

#### D4.4 — Concentration fournisseurs

Part du premier fournisseur dans les achats, en %. La substituabilité et le délai de remplacement sont appréciés séparément en D4.7 (risque opérationnel) : le présent critère mesure la dépendance, pas sa mitigation.

**Formule :** `achats_premier_fournisseur / achats_totaux`

**Poids :** TPE 2.00 % · PME 1.50 % · GE 1.50 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≤ 15 % |
| 75 | ]15 % ; 25 %] |
| 50 | ]25 % ; 40 %] |
| 25 | ]40 % ; 60 %] |
| 0 | > 60 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `VITAL_SINGLE_SOURCE` | Mono-source vitale sans alternative qualifiée, ou fournisseur lié en difficulté | 0 |

**Justificatifs requis :** Balance fournisseurs ; Cartographie des alternatives.

#### D4.5 — Visibilité des revenus / carnet de commandes

Commandes : mois de CA sécurisé et qualité juridique du carnet. Récurrent : rétention/churn. Retail : historique comparable et saisonnalité.

**Poids :** TPE 2.00 % · PME 2.00 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | ≥ 12 mois de revenus sécurisés ou > 80 % récurrents avec rétention > 90 % ; contreparties solides |
| 75 | 9–12 mois ou 60–80 % récurrents ; annulations historiques faibles |
| 50 | 6–9 mois ou 40–60 % récurrents ; visibilité moyenne cohérente au secteur |
| 25 | 3–6 mois, carnet non ferme, churn élevé ou dépendance à appels d'offres non acquis |
| 0 | < 3 mois, annulations matérielles, carnet artificiel ou arrêt d'activité prévisible |

#### D4.6 — Exposition pays, change et matières premières

Exposition nette après couverture juridiquement efficace, rapportée à EBITDA/achats/CA.

**Poids :** TPE 1.00 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Exposition nette < 10 % de l'EBITDA ou couverture complète ; pays stables |
| 75 | Exposition 10–25 %, couverture > 75 %, répercussion prix démontrée |
| 50 | Exposition 25–50 %, couverture 50–75 %, volatilité absorbable |
| 25 | Exposition 50–100 %, couverture < 50 %, risque pays/transfert ou commodity matériel |
| 0 | Exposition > 100 % de l'EBITDA, aucune couverture, continuité menacée ou pays bloqué |

#### D4.7 — Risque opérationnel, technologie et capex

**Poids :** TPE 1.50 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Processus robustes, redondance, maintenance et assurance adéquates, capex financé, aucun incident matériel |
| 75 | Contrôles satisfaisants, dépendances connues et plans testés, capex maîtrisé |
| 50 | Contrôles moyens, quelques dépendances/sites uniques, capex nécessaire mais finançable |
| 25 | Outil vieillissant, incidents fréquents, sous-investissement, dépendance critique, assurance insuffisante |
| 0 | Arrêt majeur non résolu, technologie obsolète, perte de licence/certification ou capex vital non financé |

#### D4.8 — Qualité et soutenabilité de la croissance

**Poids :** TPE 1.00 % · PME 1.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Croissance rentable, financée majoritairement par cash-flow/fonds propres, BFR et capacités maîtrisés |
| 75 | Croissance rentable avec dette modérée, plan capacitaire et commercial prouvé |
| 50 | Croissance correcte mais dépendante de dette/BFR ; hypothèses raisonnables, mitigations identifiées |
| 25 | Croissance non rentable, BFR tendu, expansion trop rapide ou investissements sous-estimés |
| 0 | Croissance artificielle/circulaire, acquisitions non intégrées, destruction de cash ou plan irréaliste |

### D5 — Management, gouvernance et groupe

#### D5.1 — Expérience et stabilité du management

**Poids :** TPE 3.00 % · PME 2.50 % · GE 2.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Équipe complète, > 10 ans d'expérience pertinente, stabilité > 5 ans, succession en place, réalisations vérifiées |
| 75 | Expérience 5–10 ans, faible turnover, compétences adaptées et résultats cohérents |
| 50 | Expérience 3–5 ans ou changement récent maîtrisé ; quelques lacunes compensées |
| 25 | Équipe incomplète, turnover élevé, expérience limitée, objectifs régulièrement non atteints |
| 0 | Incompétence manifeste, départs critiques, information trompeuse ou incapacité à exploiter |

#### D5.2 — Dépendance homme-clé et succession

**Poids :** TPE 2.50 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Responsabilités distribuées, délégations formelles, successeurs identifiés et plan testé |
| 75 | Dépendance limitée ; adjoint compétent et documentation suffisante |
| 50 | Dépendance réelle mais remplaçable en 3–6 mois ; plan partiel |
| 25 | Dirigeant concentre clients, technique et pouvoirs ; absence de succession crédible |
| 0 | Indisponibilité de l'homme-clé compromettant immédiatement l'activité, sans solution |

#### D5.3 — Gouvernance et contrôle interne

**Poids :** TPE 2.00 % · PME 2.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Organes actifs et documentés, séparation des pouvoirs, audit/risques/conformité proportionnés |
| 75 | Gouvernance structurée, contrôles réguliers, incidents corrigés dans les délais |
| 50 | Gouvernance informelle mais fonctionnelle ; contrôles essentiels présents |
| 25 | Pouvoirs concentrés, contrôles faibles, recommandations récurrentes non clôturées |
| 0 | Absence de contrôle, fraude/irrégularité de gouvernance, décisions non autorisées |

#### D5.4 — Actionnariat, groupe et soutien

Note standalone conservée. Le support groupe n'améliore le grade que via la méthode dédiée (capacité + volonté + cadre juridique), jamais dans ce critère.

**Poids :** TPE 2.00 % · PME 1.50 % · GE 2.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Actionnariat stable et transparent ; parent très solide ; support juridiquement engageant ou historique incontestable |
| 75 | Actionnaires solides et impliqués ; soutien documenté mais non totalement contraignant |
| 50 | Actionnariat stable, capacité de soutien moyenne ou entité autonome sans besoin de support |
| 25 | Conflits, dilution probable, actionnaires endettés ou soutien incertain |
| 0 | Groupe en difficulté, ponctions de cash, litige actionnarial majeur ou opacité |

#### D5.5 — Stratégie et qualité d'exécution

**Poids :** TPE 2.00 % · PME 1.50 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Stratégie documentée et cohérente ; réalisations ≥ 90 % des budgets ajustés |
| 75 | Stratégie crédible ; réalisations 75–90 % ; écarts expliqués et corrigés |
| 50 | Plan raisonnable mais partiellement documenté ; réalisations 60–75 % |
| 25 | Plans fréquemment révisés, réalisations < 60 %, hypothèses trop optimistes |
| 0 | Absence de stratégie, budgets manipulés ou décisions menaçant la continuité |

#### D5.6 — Transactions avec parties liées

**Poids :** TPE 1.50 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Transactions limitées, aux conditions de marché, approuvées, documentées et rapprochées |
| 75 | Transactions significatives mais transparentes, contractuelles et recouvrées normalement |
| 50 | Transactions fréquentes, documentation partielle, impact financier limité |
| 25 | Créances/avances importantes, prix non démontrés, cash-pooling défavorable |
| 0 | Détournement de ressources, créances irrécouvrables, garanties cachées ou transactions non autorisées |

#### D5.7 — Pilotage financier et culture du risque

**Poids :** TPE 2.00 % · PME 1.50 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Reporting mensuel fiable, cash forecast glissant, scénarios, limites et alertes formalisés |
| 75 | Reporting trimestriel fiable, budget/forecast et suivi de trésorerie réguliers |
| 50 | Reporting annuel/intermédiaire suffisant mais peu prospectif ; dépendance à l'expert-comptable |
| 25 | Pilotage tardif, absence de forecast, données contradictoires, réaction après incident |
| 0 | Aucun pilotage fiable, refus de transparence ou dissimulation de difficultés |

### D6 — Transparence et conformité

#### D6.1 — Qualité / certification des états financiers

**Poids :** TPE 1.50 % · PME 1.25 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Comptes audités/certifiés sans réserve matérielle ; ou TPE non soumise avec comptes rapprochés à fiabilité élevée |
| 75 | Opinion avec réserve non matérielle ou revue limitée solide ; écarts corrigés |
| 50 | Comptes non audités mais cohérents, documentés et rapprochés ; qualité moyenne |
| 25 | Réserves matérielles, nombreux retraitements ou périmètre incomplet |
| 0 | Comptes non fiables/refusés, soupçon de falsification ou continuité non reflétée |

#### D6.2 — Délai de production de l'information

Jours entre la clôture et la réception d'un dossier exploitable.

**Poids :** TPE 1.50 % · PME 1.00 % · GE 0.75 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≤ 120 j | ]120 j ; 180 j] | ]180 j ; 240 j] | ]240 j ; 365 j] | > 365 j |
| PME | ≤ 90 j | ]90 j ; 150 j] | ]150 j ; 210 j] | ]210 j ; 300 j] | > 300 j |
| GE | ≤ 75 j | ]75 j ; 120 j] | ]120 j ; 180 j] | ]180 j ; 270 j] | > 270 j |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `PRODUCTION_REFUSED` | Refus de produire l'information financière | 0 |

#### D6.3 — Cohérence et rapprochements

Écart inexpliqué (%) entre CA comptable, déclaratif/fiscal, flux bancaires annualisés et informations commerciales.

**Poids :** TPE 1.50 % · PME 1.00 % · GE 1.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≤ 2 % |
| 75 | ]2 % ; 5 %] |
| 50 | ]5 % ; 10 %] |
| 25 | ]10 % ; 20 %] |
| 0 | > 20 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `PROBABLE_MANIPULATION` | Manipulation probable de l'information — à instruire avec RF03/RF16 | 0 |

#### D6.4 — Situation juridique, fiscale et sociale

**Poids :** TPE 1.50 % · PME 1.00 % · GE 0.75 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Obligations à jour, aucune dette/litige matériel, certificats et documents valides |
| 75 | Retard mineur régularisé, contrôle courant sans enjeu matériel |
| 50 | Plan d'apurement respecté ou litige provisionné et maîtrisable |
| 25 | Arriérés/litige matériel, plan fragile, saisie ou risque de sanction significatif |
| 0 | Mesure d'exécution majeure, dette non soutenable, procédure menaçant l'activité ou document falsifié |

#### D6.5 — Transparence actionnariat et documents

**Poids :** TPE 1.00 % · PME 0.75 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Actionnariat, UBO, pouvoirs, groupe et engagements complets, à jour, vérifiés |
| 75 | Lacune mineure sans ambiguïté sur contrôle/pouvoirs, correction rapide |
| 50 | Documents partiels mais contrôle et structure raisonnablement établis |
| 25 | Chaîne de détention complexe/opaque, documents expirés ou hors bilan incomplet |
| 0 | UBO/pouvoirs impossibles à établir, faux document ou blocage KYC |

### D7 — ESG et climat

#### D7.1 — Risque climatique physique

**Poids :** TPE 1.00 % · PME 1.00 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Exposition faible vérifiée ou actifs résilients ; assurances et plans de continuité testés |
| 75 | Exposition modérée, mitigations financées, couverture assurance adéquate |
| 50 | Exposition matérielle mais cartographiée ; plan partiel et pertes absorbables |
| 25 | Exposition élevée (eau/chaleur/inondation/sécheresse), données ou mitigation insuffisantes |
| 0 | Actifs critiques menacés à court terme, sinistres récurrents, absence de solution viable |

#### D7.2 — Risque de transition

**Poids :** TPE 0.50 % · PME 0.75 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Faible intensité/dépendance, réglementation anticipée, offre compatible avec la transition |
| 75 | Exposition modérée, investissements identifiés et finançables, capacité de répercussion |
| 50 | Exposition matérielle, trajectoire et budget partiels, risque absorbable |
| 25 | Forte dépendance énergie/carbone/réglementation, capex important non totalement financé |
| 0 | Modèle économique menacé, interdiction/obsolescence probable, aucun plan crédible |

#### D7.3 — Conformité environnementale et sociale

**Poids :** TPE 1.00 % · PME 0.75 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Autorisations à jour, absence d'incident matériel, système de gestion et indicateurs suivis |
| 75 | Écart mineur corrigé, contrôles adaptés et historique satisfaisant |
| 50 | Écarts modérés avec plan daté/financé ; aucun arrêt probable |
| 25 | Non-conformité matérielle, accident/litige, plan incomplet ou passif potentiel important |
| 0 | Autorisation retirée, fermeture/sanction grave, dommage majeur ou violation bloquante |

#### D7.4 — Gouvernance ESG et plan d'adaptation

**Poids :** TPE 0.50 % · PME 0.50 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Responsabilités conseil/direction, données fiables, objectifs, budget, scénarios et suivi |
| 75 | Gouvernance formalisée et plan financé sur les risques matériels |
| 50 | Responsables identifiés, diagnostic initial et actions partielles |
| 25 | Approche réactive, données faibles, plan non chiffré ou sans propriétaire |
| 0 | Déni d'un risque matériel, aucune gouvernance, information trompeuse ou greenwashing démontré |

### Échelle interne (master scale)

| Grade | Score | Libellé | Décision indicative |
|---|---|---|---|
| G1 | ≥ 90 | Excellent | Délégation favorable sous contrôles usuels |
| G2 | [85 ; 90[ | Très solide | Favorable |
| G3 | [80 ; 85[ | Solide | Favorable |
| G4 | [75 ; 80[ | Bon | Favorable avec conditions usuelles |
| G5 | [70 ; 75[ | Satisfaisant | Analyse normale / conditions selon produit |
| G6 | [65 ; 70[ | Acceptable | Conditions renforcées et suivi |
| G7 | [60 ; 65[ | Fragile | Comité / revue renforcée, watchlist possible |
| G8 | [55 ; 60[ | Faible | Exception très encadrée ou réduction du risque |
| G9 | [45 ; 55[ | Très faible | Généralement défavorable, stratégie de réduction |
| G10 | < 45 | Risque très élevé | Défavorable sauf décision exceptionnelle formelle |
| DEF1 · DEF2 · DEF3 | définition de défaut déclenchée | Grades défaut internes | Recouvrement et classification par les dispositifs dédiés |

### Caps structurels

| Code | Situation | Plafond de grade | Source de la règle |
|---|---|---|---|
| CAP01 | Entreprise de moins de 2 ans, hors support groupe juridiquement robuste | pas mieux que G7 | CREDIT_POLICY |
| CAP02 | Fonds propres tangibles négatifs sans recapitalisation ferme et réalisée | pas mieux que G9 | CREDIT_POLICY |
| CAP03 | Incertitude matérielle sur la continuité d'exploitation | pas mieux que G9 | CREDIT_POLICY |
| CAP04 | Comptes annuels trop anciens (au-delà du maximum segment) | aucun grade final | CREDIT_POLICY |
| CAP05 | EBITDA négatif deux années sur trois | pas mieux que G9 | CREDIT_POLICY |
| CAP06 | DSCR < 1,0× en scénario de base | pas mieux que G9 | CREDIT_POLICY |
| CAP07 | DSCR < 1,0× uniquement en stress | pas mieux que G7 | CREDIT_POLICY |
| CAP08 | Dépendance client unique sans contrat ferme ni mitigation | pas mieux que G8 | CREDIT_POLICY |
| CAP09 | Restructuration active / forbearance | pas mieux que G8 | CREDIT_POLICY |
| CAP10 | Dossier groupe incomplet alors que le groupe est matériel | pas mieux que G7 | CREDIT_POLICY |

### Niveau de confiance et conséquence sur le grade

Confiance = 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance.

| Score de confiance | Niveau | Conséquence |
|---|---|---|
| ≥ 85 | Élevé | aucun cap lié à la qualité des données |
| [70 ; 85[ | Moyen | le grade final ne peut être meilleur que G4 |
| [55 ; 70[ | Faible | le grade final ne peut être meilleur que G7 |
| [0 ; 55[ | Insuffisant | aucun grade final : dossier incomplet ou modèle alternatif requis |

### Red flags

| Code | Signal | Niveau | Source | Traitement |
|---|---|---|---|---|
| RF01 | Identité/UBO/pouvoirs impossibles à valider | BLOCK | COMPLIANCE | Stop KYC, pas de score final |
| RF02 | Sanction ou interdiction issue du système conformité autoritatif | BLOCK | COMPLIANCE | Suivre la décision Conformité, jamais diluer dans le score |
| RF03 | Fraude ou falsification documentaire confirmée | BLOCK | COMPLIANCE | Escalade fraude/juridique et audit |
| RF04 | Activité interdite par politique ou loi | BLOCK | CREDIT_POLICY | Rejet/routage selon politique |
| RF05 | Liquidation, cessation ou procédure incompatible avec le going concern | DEFAULT_CHECK | CREDIT_POLICY | Classe/grade défaut selon règles applicables |
| RF06 | DPD ≥ seuil de défaut, UTP ou cross-default | DEFAULT_CHECK | CREDIT_POLICY | Évaluer défaut, contagion, IFRS 9 et BAM séparément |
| RF07 | DPD 31–89 jours ou incident matériel récurrent | REFER | CREDIT_POLICY | Revue risque, watchlist/SICR éventuels |
| RF08 | Échec de restructuration ou seconde concession | DEFAULT_CHECK | CREDIT_POLICY | Défaut/forbearance selon politique |
| RF09 | Fonds propres négatifs et aucun plan ferme | REFER | CREDIT_POLICY | Cap G9, recapitalisation comme condition éventuelle |
| RF10 | Opinion audit défavorable / refus de certifier | REFER | CREDIT_POLICY | Selon matérialité et fiabilité des comptes (peut devenir BLOCK) |
| RF11 | Dette fiscale/sociale ou saisie matérielle | REFER | CREDIT_POLICY | Quantifier, vérifier plan et priorité de paiement |
| RF12 | Litige menaçant la continuité | REFER | CREDIT_POLICY | Scénario de perte et avis juridique |
| RF13 | Perte d'un client/fournisseur/licence vital | REFER | CREDIT_POLICY | Reforecast et stress immédiats |
| RF14 | Covenant rompu non régularisé | REFER | CREDIT_POLICY | Vérifier exigibilité et waiver |
| RF15 | Transactions liées ou sortie de cash inexpliquée | REFER | CREDIT_POLICY | Investigation et cap selon impact |
| RF16 | Information critique manquante/incohérente | REFER | MODEL | Appliquer la politique de complétude (peut devenir BLOCK) |
| RF17 | Risque climatique/ESG avec fermeture probable | REFER | CREDIT_POLICY | Scénario, cap et plan d'adaptation |
| RF18 | Contagion groupe réglementaire/politique | DEFAULT_CHECK | REGULATORY | Appliquer uniquement la règle validée du régime applicable |

## Modèle TPE comportemental — CORP_TPE_BEHAV_V1

Identifiant `CORP_TPE_BEHAV_V1` · version 1.0.0 · statut DRAFT_EXPERT_SEED · date d'effet 2026-08-18.

Score 100 = risque le plus faible ; score 0 = risque le plus élevé.

### Pondération des domaines

| Domaine | TPE |
|---|---:|
| B1 — Comportement de crédit | 30.00 % |
| B2 — Capacité par flux | 20.00 % |
| B3 — Activité | 18.00 % |
| B4 — Management | 12.00 % |
| B5 — Transparence et conformité | 12.00 % |
| B6 — Groupe / support | 5.00 % |
| B7 — ESG / climat | 3.00 % |
| **Total** | **100.00 %** |

### Pondération des 24 critères élémentaires

| Code | Critère | TPE |
|---|---|---:|
| B1.1 | DPD et impayés 12/24 mois | 8.00 % |
| B1.2 | Dépassements et irrégularités | 6.00 % |
| B1.3 | Mouvements créditeurs vérifiés et tendance | 7.00 % |
| B1.4 | Utilisation des lignes et marge disponible | 4.00 % |
| B1.5 | Chèques/effets et incidents externes autorisés | 5.00 % |
| B2.1 | Couverture du service de dette par flux observés | 7.00 % |
| B2.2 | Stabilité mensuelle des encaissements | 5.00 % |
| B2.3 | Solde minimum, jours débiteurs et liquidité | 4.00 % |
| B2.4 | Saisonnalité et résistance à un choc de flux | 4.00 % |
| B3.1 | Risque sectoriel | 4.00 % |
| B3.2 | Ancienneté et continuité de l'activité | 3.00 % |
| B3.3 | Concentration clients/fournisseurs | 4.00 % |
| B3.4 | Marge brute ou proxy vérifié | 3.00 % |
| B3.5 | Contrats, commandes et récurrence | 4.00 % |
| B4.1 | Expérience du dirigeant | 4.00 % |
| B4.2 | Dépendance homme-clé | 3.00 % |
| B4.3 | Organisation et contrôles minimums | 2.00 % |
| B4.4 | Succession / continuité | 3.00 % |
| B5.1 | Documents et autorisations | 3.00 % |
| B5.2 | Rapprochement flux / CA déclaré / fiscal | 4.00 % |
| B5.3 | Situation fiscale et sociale | 3.00 % |
| B5.4 | Actionnariat / UBO / KYC | 2.00 % |
| B6.1 | Groupe, garant et soutien démontré | 5.00 % |
| B7.1 | Risques ESG/climat matériels | 3.00 % |

### B1 — Comportement de crédit

#### B1.1 — DPD et impayés 12/24 mois

**Poids :** TPE 8.00 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Score | Bande |
|---:|---|
| 100 | ≤ 0 j |
| 75 | ]0 j ; 7 j] |
| 50 | ]7 j ; 30 j] |
| 25 | ]30 j ; 60 j] |
| 0 | > 60 j |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `UNPAID_NOT_CURED` | Impayé non régularisé — à instruire avec RF06/RF07 | 0 |
| `UNLIKELY_TO_PAY` | Signal d'incapacité probable de payer — à instruire avec RF06 | 0 |

#### B1.2 — Dépassements et irrégularités

**Poids :** TPE 6.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucun dépassement non autorisé |
| 75 | Un dépassement ≤ 3 jours et ≤ 5 % de la ligne, régularisé spontanément |
| 50 | 4–15 jours cumulés ou 2–3 épisodes, montant ≤ 10 % de la ligne |
| 25 | 16–30 jours cumulés, épisodes mensuels ou montant > 10 % |
| 0 | > 30 jours, dépassement permanent, compte bloqué ou absence d'autorisation |

#### B1.3 — Mouvements créditeurs vérifiés et tendance

Mouvements créditeurs observés / flux attendus (%). Un compte secondaire ne peut être annualisé sans preuve de la part de flux domiciliée.

**Poids :** TPE 7.00 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Score | Bande |
|---:|---|
| 100 | ≥ 110 % |
| 75 | [90 % ; 110 %[ |
| 50 | [70 % ; 90 %[ |
| 25 | [50 % ; 70 %[ |
| 0 | < 50 % |

#### B1.4 — Utilisation des lignes et marge disponible

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Utilisation moyenne 20–70 %, pics cohérents, marge disponible |
| 75 | 10–20 % ou 70–85 %, utilisation stable et justifiée |
| 50 | 85–95 % ou hausse > 20 points sur six mois, sans dépassement |
| 25 | > 95 % pendant plus de trois mois ou dépendance au renouvellement |
| 0 | > 100 % non autorisé ou besoin structurel non financé |

#### B1.5 — Chèques/effets et incidents externes autorisés

**Poids :** TPE 5.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Absence d'incident vérifiée auprès des sources autorisées |
| 75 | Un incident mineur, erreur technique démontrée, régularisé ≤ 5 jours |
| 50 | Un à deux incidents régularisés ≤ 30 jours, montant non matériel |
| 25 | Incidents récurrents, régularisation tardive ou incident matériel |
| 0 | Incident grave/non régularisé, interdiction ou signal bloquant |

### B2 — Capacité par flux

#### B2.1 — Couverture du service de dette par flux observés

**Poids :** TPE 7.00 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Score | Bande |
|---:|---|
| 100 | ≥ 1.5x |
| 75 | [1.3x ; 1.5x[ |
| 50 | [1.15x ; 1.3x[ |
| 25 | [1x ; 1.15x[ |
| 0 | < 1x |

#### B2.2 — Stabilité mensuelle des encaissements

Coefficient de variation mensuel des encaissements (%), tendance ≥ 0.

**Poids :** TPE 5.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≤ 15 % |
| 75 | ]15 % ; 25 %] |
| 50 | ]25 % ; 40 %] |
| 25 | ]40 % ; 60 %] |
| 0 | > 60 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `FLOWS_DOWN_OVER_30PCT` | Encaissements en baisse de plus de 30 % sur la période | 0 |
| `FLOWS_DOWN_OVER_15PCT` | Encaissements en baisse de plus de 15 % sur la période | 25 |

#### B2.3 — Solde minimum, jours débiteurs et liquidité

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucun jour débiteur non autorisé, solde de sécurité > 30 jours de charges |
| 75 | ≤ 3 jours débiteurs et solde > 20 jours de charges |
| 50 | 4–15 jours débiteurs et solde > 10 jours de charges |
| 25 | 16–30 jours débiteurs ou solde < 10 jours de charges |
| 0 | > 30 jours débiteurs ou rupture de trésorerie |

#### B2.4 — Saisonnalité et résistance à un choc de flux

Couverture du service de dette après choc de flux −20 %.

**Poids :** TPE 4.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≥ 1.3x |
| 75 | [1.15x ; 1.3x[ |
| 50 | [1x ; 1.15x[ |
| 25 | [0.8x ; 1x[ |
| 0 | < 0.8x |

### B3 — Activité

#### B3.1 — Risque sectoriel

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | S1 — secteur très résilient |
| 75 | S2 — secteur résilient |
| 50 | S3 — secteur moyen/cyclique maîtrisable |
| 25 | S4 — secteur vulnérable/sous surveillance |
| 0 | S5 — secteur très vulnérable/crise structurelle |

#### B3.2 — Ancienneté et continuité de l'activité

**Poids :** TPE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : WARN**

| Score | Bande |
|---:|---|
| 100 | ≥ 7 ans |
| 75 | [5 ans ; 7 ans[ |
| 50 | [3 ans ; 5 ans[ |
| 25 | [2 ans ; 3 ans[ |
| 0 | < 2 ans |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `UNDER_2Y_NO_SUPPORT` | Moins de deux ans d'activité sans support ni contrat structurant — déclenche le cap CAP01 | 0 |

#### B3.3 — Concentration clients/fournisseurs

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Concentration très faible, alternatives disponibles |
| 75 | Concentration faible, contrats sécurisés |
| 50 | Concentration moyenne, substituabilité raisonnable |
| 25 | Concentration élevée ou dépendance difficilement remplaçable |
| 0 | Concentration critique, mono-client ou mono-source vital |

#### B3.4 — Marge brute ou proxy vérifié

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | ≥ P75 secteur, rapprochée des flux |
| 75 | P50–P75 |
| 50 | P25–P50 |
| 25 | P10–P25 |
| 0 | < P10, négative ou non fiable |

#### B3.5 — Contrats, commandes et récurrence

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Revenus fortement sécurisés ou récurrents, contreparties solides |
| 75 | Bonne visibilité, annulations faibles |
| 50 | Visibilité moyenne cohérente avec le secteur |
| 25 | Faible visibilité, carnet non ferme ou churn élevé |
| 0 | Aucune visibilité, carnet artificiel ou arrêt prévisible |

### B4 — Management

#### B4.1 — Expérience du dirigeant

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | > 10 ans d'expérience pertinente, réalisations vérifiées |
| 75 | 5–10 ans, résultats cohérents |
| 50 | 3–5 ans ou reprise récente maîtrisée |
| 25 | Expérience limitée, objectifs non atteints |
| 0 | Incompétence manifeste ou information trompeuse |

#### B4.2 — Dépendance homme-clé

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Responsabilités distribuées, relais opérationnels en place |
| 75 | Dépendance limitée, adjoint compétent |
| 50 | Dépendance réelle mais remplaçable en 3–6 mois |
| 25 | Dirigeant concentre tout, succession absente |
| 0 | Indisponibilité compromettant immédiatement l'activité |

#### B4.3 — Organisation et contrôles minimums

**Poids :** TPE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Organisation claire, contrôles essentiels effectifs |
| 75 | Organisation correcte, quelques contrôles informels |
| 50 | Organisation informelle mais fonctionnelle |
| 25 | Contrôles faibles, incidents récurrents |
| 0 | Absence de contrôle ou irrégularités |

#### B4.4 — Succession / continuité

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Succession identifiée et plan testé |
| 75 | Relais crédible identifié |
| 50 | Plan partiel |
| 25 | Aucune succession crédible |
| 0 | Continuité immédiatement menacée |

### B5 — Transparence et conformité

#### B5.1 — Documents et autorisations

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Documents complets, valides et vérifiés |
| 75 | Lacune mineure corrigée rapidement |
| 50 | Documents partiels mais activité établie |
| 25 | Documents expirés ou incomplets |
| 0 | Documents faux/refusés ou activité non autorisée |

#### B5.2 — Rapprochement flux / CA déclaré / fiscal

Écart (%) entre flux bancaires annualisés, CA déclaré et données fiscales.

**Poids :** TPE 4.00 % · **Nature :** quantitatif · **donnée critique — absence bloquante**

| Score | Bande |
|---:|---|
| 100 | ≤ 5 % |
| 75 | ]5 % ; 10 %] |
| 50 | ]10 % ; 20 %] |
| 25 | ]20 % ; 30 %] |
| 0 | > 30 % |

**Cas particuliers :**

| Code | Cas | Score imposé |
|---|---|---:|
| `MAJOR_INCONSISTENCY` | Incohérence majeure entre flux, chiffre d'affaires déclaré et données fiscales | 0 |

#### B5.3 — Situation fiscale et sociale

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Obligations à jour, aucun arriéré |
| 75 | Retard mineur régularisé |
| 50 | Plan d'apurement respecté |
| 25 | Arriérés matériels ou plan fragile |
| 0 | Dette non soutenable ou mesure d'exécution majeure |

#### B5.4 — Actionnariat / UBO / KYC

**Poids :** TPE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | UBO et pouvoirs complets et vérifiés |
| 75 | Lacune mineure sans ambiguïté |
| 50 | Structure raisonnablement établie |
| 25 | Chaîne de détention opaque |
| 0 | UBO impossible à établir ou blocage KYC |

### B6 — Groupe / support

#### B6.1 — Groupe, garant et soutien démontré

**Poids :** TPE 5.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Support juridiquement engageant d'un tiers très solide, historique démontré |
| 75 | Soutien documenté mais non totalement contraignant |
| 50 | Entité autonome sans besoin de support |
| 25 | Soutien incertain ou garant lui-même fragile |
| 0 | Groupe en difficulté, ponctions de cash ou soutien promis non honoré |

### B7 — ESG / climat

#### B7.1 — Risques ESG/climat matériels

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : WARN**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Exposition faible vérifiée |
| 75 | Exposition modérée, mitigations en place |
| 50 | Exposition matérielle cartographiée, plan partiel |
| 25 | Exposition élevée, mitigation insuffisante |
| 0 | Activité menacée à court terme sans solution viable |

### Échelle interne (master scale)

| Grade | Score | Libellé | Décision indicative |
|---|---|---|---|
| G1 | ≥ 90 | Excellent | Délégation favorable sous contrôles usuels |
| G2 | [85 ; 90[ | Très solide | Favorable |
| G3 | [80 ; 85[ | Solide | Favorable |
| G4 | [75 ; 80[ | Bon | Favorable avec conditions usuelles |
| G5 | [70 ; 75[ | Satisfaisant | Analyse normale / conditions selon produit |
| G6 | [65 ; 70[ | Acceptable | Conditions renforcées et suivi |
| G7 | [60 ; 65[ | Fragile | Comité / revue renforcée, watchlist possible |
| G8 | [55 ; 60[ | Faible | Exception très encadrée ou réduction du risque |
| G9 | [45 ; 55[ | Très faible | Généralement défavorable, stratégie de réduction |
| G10 | < 45 | Risque très élevé | Défavorable sauf décision exceptionnelle formelle |
| DEF1 · DEF2 · DEF3 | définition de défaut déclenchée | Grades défaut internes | Recouvrement et classification par les dispositifs dédiés |

### Caps structurels

| Code | Situation | Plafond de grade | Source de la règle |
|---|---|---|---|
| CAP01 | Entreprise de moins de 2 ans, hors support groupe juridiquement robuste | pas mieux que G7 | CREDIT_POLICY |
| CAP03 | Incertitude matérielle sur la continuité d'exploitation | pas mieux que G9 | CREDIT_POLICY |
| CAP04 | Comptes annuels trop anciens (au-delà du maximum segment) | aucun grade final | CREDIT_POLICY |
| CAP09 | Restructuration active / forbearance | pas mieux que G8 | CREDIT_POLICY |
| CAP10 | Dossier groupe incomplet alors que le groupe est matériel | pas mieux que G7 | CREDIT_POLICY |

### Niveau de confiance et conséquence sur le grade

Confiance = 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance.

| Score de confiance | Niveau | Conséquence |
|---|---|---|
| ≥ 85 | Élevé | aucun cap lié à la qualité des données |
| [70 ; 85[ | Moyen | le grade final ne peut être meilleur que G4 |
| [55 ; 70[ | Faible | le grade final ne peut être meilleur que G7 |
| [0 ; 55[ | Insuffisant | aucun grade final : dossier incomplet ou modèle alternatif requis |

### Red flags

| Code | Signal | Niveau | Source | Traitement |
|---|---|---|---|---|
| RF01 | Identité/UBO/pouvoirs impossibles à valider | BLOCK | COMPLIANCE | Stop KYC, pas de score final |
| RF02 | Sanction ou interdiction issue du système conformité autoritatif | BLOCK | COMPLIANCE | Suivre la décision Conformité, jamais diluer dans le score |
| RF03 | Fraude ou falsification documentaire confirmée | BLOCK | COMPLIANCE | Escalade fraude/juridique et audit |
| RF04 | Activité interdite par politique ou loi | BLOCK | CREDIT_POLICY | Rejet/routage selon politique |
| RF05 | Liquidation, cessation ou procédure incompatible avec le going concern | DEFAULT_CHECK | CREDIT_POLICY | Classe/grade défaut selon règles applicables |
| RF06 | DPD ≥ seuil de défaut, UTP ou cross-default | DEFAULT_CHECK | CREDIT_POLICY | Évaluer défaut, contagion, IFRS 9 et BAM séparément |
| RF07 | DPD 31–89 jours ou incident matériel récurrent | REFER | CREDIT_POLICY | Revue risque, watchlist/SICR éventuels |
| RF08 | Échec de restructuration ou seconde concession | DEFAULT_CHECK | CREDIT_POLICY | Défaut/forbearance selon politique |
| RF09 | Fonds propres négatifs et aucun plan ferme | REFER | CREDIT_POLICY | Cap G9, recapitalisation comme condition éventuelle |
| RF10 | Opinion audit défavorable / refus de certifier | REFER | CREDIT_POLICY | Selon matérialité et fiabilité des comptes (peut devenir BLOCK) |
| RF11 | Dette fiscale/sociale ou saisie matérielle | REFER | CREDIT_POLICY | Quantifier, vérifier plan et priorité de paiement |
| RF12 | Litige menaçant la continuité | REFER | CREDIT_POLICY | Scénario de perte et avis juridique |
| RF13 | Perte d'un client/fournisseur/licence vital | REFER | CREDIT_POLICY | Reforecast et stress immédiats |
| RF14 | Covenant rompu non régularisé | REFER | CREDIT_POLICY | Vérifier exigibilité et waiver |
| RF15 | Transactions liées ou sortie de cash inexpliquée | REFER | CREDIT_POLICY | Investigation et cap selon impact |
| RF16 | Information critique manquante/incohérente | REFER | MODEL | Appliquer la politique de complétude (peut devenir BLOCK) |
| RF17 | Risque climatique/ESG avec fermeture probable | REFER | CREDIT_POLICY | Scénario, cap et plan d'adaptation |
| RF18 | Contagion groupe réglementaire/politique | DEFAULT_CHECK | REGULATORY | Appliquer uniquement la règle validée du régime applicable |


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

### 25.4 Répétition à blanc sur portefeuille simulé

La chaîne de calibration décrite ci-dessus a été exécutée intégralement sur un portefeuille **simulé**, avant toute disponibilité de défauts observés. L'objet n'est pas d'obtenir des probabilités : il est de s'assurer que la chaîne fonctionne, que l'échelle ordonne correctement le risque, et que la batterie de validation sait détecter un défaut de calibration lorsqu'il y en a un. Elle a été exécutée sur les **deux modèles**, chacun avec sa propre calibration : les deux grilles n'observent pas la même chose — flux bancaires pour le modèle TPE comportemental, états financiers pour le modèle standard — et ne produisent pas la même distribution de grades. Une calibration transposée de l'un à l'autre serait indéfendable. Les rapports détaillés figurent en annexe (`docs/06-rapport-calibration-corp-std-v1.md` et `docs/06-rapport-calibration-corp-tpe-behav-v1.md`).

Deux garde-fous méthodologiques structurent l'exercice.

**Les scores ne sont pas simulés.** Le simulateur produit des données d'entrée — ratios, ancrages qualitatifs, flags structurels, qualité de l'information — et c'est le moteur réel qui en tire un score et un grade. Simuler directement un score puis lui associer une probabilité aurait rendu l'exercice circulaire : il aurait vérifié l'hypothèse posée, pas le modèle.

**Le statut de calibration reste distinct.** Une probabilité issue de données simulées porte le statut `CALIBRATED_SYNTHETIC`, jamais `CALIBRATED`. La distinction est propagée jusqu'au contrat d'interface, à l'instantané persisté et à l'écran de résultat : aucun système aval ne peut confondre les deux.

Trois enseignements de portée générale en sont ressortis.

**La probabilité doit être calibrée sur le grade, non sur le score.** Le grade final intègre les caps, qui déplacent une contrepartie vers le bas sans toucher à son score brut. Le score moyen n'est donc pas monotone dans l'échelle : sur le portefeuille simulé, le score moyen de G4 dépasse celui de G3, et celui de G7 dépasse celui de G6, parce que ces grades rassemblent des dossiers bien notés mais plafonnés. Le risque, lui, reste monotone. Dériver la probabilité d'une courbe du score réaffecterait à ces dossiers la probabilité de leur score et annulerait l'effet du cap.

**Les caps de confiance créent deux points de masse dans l'échelle.** G4 et G7 rassemblent à eux seuls la moitié du portefeuille, et la majorité des dossiers qui s'y trouvent y ont été **déplacés** par un cap de qualité d'information : 61 % en G4 et 55 % en G7 pour le modèle standard, 65 % et 61 % pour le modèle TPE. Les autres grades ne sont pratiquement pas touchés par les caps. C'est le comportement voulu, mais il a une conséquence opérationnelle : améliorer la collecte d'information déplacerait davantage de dossiers que réviser les pondérations.

**Sur le modèle TPE, deux grades ne se distinguent plus.** La régression isotone fusionne G6 et G7 à une même probabilité. Le cap de confiance déverse dans G7 des dossiers dont le score moyen (73,8) dépasse celui de G6 (67,5), au point que les taux de défaut des deux grades ne diffèrent plus de façon détectable — la comparaison des deux proportions donne p = 0,27 en développement et p = 0,59 hors période. Ce n'est pas un défaut de la calibration : c'est le constat qu'une distinction de grade ne porte plus de différence de risque. Deux issues relèvent du comité modèles : revoir ce qui alimente ces grades, ou les fusionner dans l'échelle.

**Le test d'adéquation usuel est inadapté à un système de notation.** Le test de Hosmer-Lemeshow découpe la population en déciles de probabilité prédite ; or celle-ci ne prend qu'une valeur par grade. Un même grade se retrouve scindé en groupes de probabilité identique dont les taux observés diffèrent par le seul hasard, et le test rejette pour une mauvaise raison. Le test retenu groupe par grade.

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
