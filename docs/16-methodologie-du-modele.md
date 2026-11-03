# Méthodologie du modèle de notation des entreprises

**Objet :** présenter la méthodologie du modèle de notation interne des entreprises (TPE, PME, grandes entreprises) : le modèle actuel et ses limites au regard de la circulaire 1/W/2025, le nouveau modèle et la manière dont il intègre les règles de classification de Bank Al-Maghrib, la trajectoire vers une modélisation statistique, et l'application aux filiales africaines.
**Périmètre :** le modèle uniquement. L'outil informatique qui le met en œuvre fait l'objet de documents distincts (guide utilisateur, expression de besoin).
**Destinataires :** Direction des Risques, Engagements, contre-étude, Conformité, comité modèles, filiales.
**Version :** 1.0 — novembre 2026. Moteur de référence 3.2.0.

> Les poids, barèmes et seuils présentés sont fixés à dire d'expert et documentés ; ils n'ont pas encore été estimés sur les défauts observés de la banque. Les probabilités de défaut ne sont pas publiées tant qu'une calibration sur données réelles n'a pas été validée. Le chapitre 4 décrit comment le modèle intègre les règles de classification réglementaire : une partie est en place dans la version 3.2, le reste est spécifié en trois lots à activer ; la classification des créances elle-même (saine, sensible, en souffrance) reste un dispositif distinct, alimenté par le modèle.

## 1. Synthèse

- **Le modèle actuel** (cahier des charges version 2.1 de 2007) repose sur deux outils : PME / GE (10 facteurs quantitatifs et un questionnaire qualitatif) et TPE / PRO (6 facteurs quantitatifs, le comportement du compte et des signaux d'alerte). Il a structuré la notation de la banque, mais il ne mesure pas la capacité de remboursement des PME et des GE, il note la taille comme un risque, il est forcé une fois sur trois en production et il ne reprend pas les critères chiffrés de la circulaire 1/W/2025.
- **Le nouveau modèle** est une grille experte à sept domaines, pondérée selon la taille de l'entreprise, avec une grille dédiée aux TPE sans comptes exploitables. La note s'exprime sur une échelle unique de 1 à 10. Des règles imposées (données critiques, plafonds, défaut) garantissent qu'aucune moyenne favorable ne compense une situation dégradée.
- **Les règles de classification** des circulaires 1/W/2025 et 19/G/2002 s'intègrent à trois niveaux : comme critères de la grille, comme règles imposées (défaut, plafonds, revues obligatoires) et comme indicateurs transmis à la classification des créances. Les 108 critères des deux circulaires ont été recensés un à un ; tous les thèmes sont couverts par la grille, et les seuils chiffrés de la 1/W/2025 s'activent en trois lots.
- **La modélisation statistique** se construit par étapes : calibrer d'abord les classes du modèle expert sur les défauts observés, puis réestimer les poids des variables quantitatives, enfin estimer un modèle complet, sans jamais interrompre la notation.
- **Les filiales africaines** appliquent le même cadre, avec un référentiel comptable (SYSCOHADA), des seuils de segmentation, un référentiel sectoriel, une dimension pays et des règles de classification propres à leur régulateur.

## 2. Le modèle actuel

### 2.1 Architecture

Le modèle en production est décrit par le cahier des charges « Outil de notation Pro / TPE / PME / GE », version 2.1 du 11 mai 2007. Il comporte deux outils, routés par le chiffre d'affaires.

| Élément | PME / GE | TPE / PRO |
|---|---|---|
| Segment | Chiffre d'affaires d'au moins 3 MDH ; GE au-delà de 50 MDH | Chiffre d'affaires inférieur à 3 MDH |
| Score | Quantitatif (10 facteurs) + qualitatif (6 thèmes) | Quantitatif (6 facteurs) + comportemental (5 facteurs du compte courant) |
| Combinaison | Poids du quantitatif de 50 % (CA < 10 MDH) à 75 % (CA > 150 MDH) | Poids θ selon l'ancienneté de la relation et des comptes (100 %, 25 % ou 0 %) |
| Ajustements | Forçage : créance en souffrance (Déf), garantie de l'État (A), appartenance à un groupe (± crans) | Malus : signaux d'alerte de −10, −20 ou défaut |
| Échelle | A à H et Déf ; PD de 0,03 % (A) à 54,45 % (H) | A à H et Déf ; PD de 0,30 % (A) à 27,44 % (H) |

### 2.2 Facteurs et pondérations

**PME / GE — quantitatif.** Rotation du capital (20 %), liquidité réduite (20 %), rentabilité des fonds propres (10 %), frais financiers / CA (5 %), dette nette / fonds propres (5 %), fonds de roulement / actif circulant (5 %), croissance du résultat net (5 %), chiffre d'affaires (10 %), effectif (10 %), âge de l'entreprise (10 %). Chaque facteur est noté par tranche ; une donnée absente reçoit la modalité « NR » et une note (de 0 à 20 selon le facteur).

**PME / GE — qualitatif.** Situation du secteur (20 %), concurrence (15 %), pouvoir de marché (10 %), qualité du management (35 %), historique bancaire (15 %), exposition aux crédits (5 %). Réponses fermées et codifiées ; taux de défaut sectoriel défini en central.

**TPE / PRO — quantitatif.** Secteur (25 %), chiffre d'affaires (20 %), frais financiers / CA (20 %), forme juridique (20 %), expérience du dirigeant (10 %), résultat net / CA (5 %) ; malus de 20 points si le fonds de roulement est négatif (hors pharmacies).

**TPE / PRO — comportemental.** Utilisation du découvert (35 %), nombre de mouvements (30 %), variation du nombre de flux créditeurs sur 3 mois (15 %), variation du montant des flux créditeurs sur 6 mois (10 %), solde / flux créditeurs (10 %).

**Signaux d'alerte TPE / PRO.** Défaut : créance en souffrance, liquidation ou règlement judiciaire, consolidation de crédit dans les 6 mois. −20 points : impayé de plus de 60 jours, plus de 3 rejets SCIP dans le mois, rééchelonnement dans les 6 mois. −10 points : impayé régularisé dans les 3 mois, impayé de plus de 30 jours, 1 ou 2 incidents SCIP. Seul le malus le plus fort s'applique.

### 2.3 Avantages

1. **Une architecture à deux outils**, adaptée à la taille : la TPE est notée d'abord sur le fonctionnement de son compte, ce qui reste le bon choix pour des entreprises aux comptes peu fiables.
2. **Le comportement bancaire et les incidents** sont pris en compte (historique bancaire, signaux d'alerte, SCIP), et la créance en souffrance impose le défaut.
3. **Un référentiel sectoriel central**, non modifiable par le chargé de notation.
4. **Des réponses qualitatives fermées et codifiées**, qui limitent l'arbitraire.
5. **Une logique de groupe** (importance stratégique, dépendance) et une hiérarchie des forçages.
6. **Une exigence de paramétrage** (tables accessibles à la Direction des Risques) et d'historisation.

### 2.4 Inconvénients

| Constat | Conséquence |
|---|---|
| Aucun ratio de capacité de remboursement (EBE, service de la dette) dans la note PME / GE | La question centrale du crédit — l'entreprise peut-elle rembourser ? — n'est pas mesurée |
| La taille et l'ancienneté pèsent 30 % ; le CA au-delà de 50 MDH rapporte 120 points | Une grande entreprise ancienne est mécaniquement mieux notée, quel que soit son endettement |
| Barèmes non monotones (liquidité réduite, fonds de roulement) | Une liquidité très faible peut être mieux notée qu'une liquidité confortable |
| Ratios rapportés aux fonds propres (rentabilité, dette nette) | Instables ou trompeurs quand les fonds propres sont faibles ou négatifs |
| Donnée absente notée de 0 à 20 points | Une information manquante peut valoir mieux qu'une information défavorable |
| Questionnaire déclaratif pesant jusqu'à 50 % pour les petites PME | Note sensible à l'appréciation, peu vérifiable |
| Garantie de l'État : note A automatique | La note ne mesure plus le risque propre de l'entreprise |
| Forçage manuel sans motif codifié ni plafond | 30 % de notes forcées dans l'extraction de production (3 881 sur 12 909, 2008-2019) |
| Deux échelles A à H aux PD de 2007, jamais recalibrées | Une même lettre ne signifie pas le même risque dans les deux outils |
| Notes non rapprochées des défauts constatés | La performance du modèle n'est pas mesurée |

L'extraction de production montre aussi une forte concentration (80 % des notes en C, D ou E) et une dette bancaire renseignée dans 51 % des notations seulement.

### 2.5 Non-conformité au regard de la circulaire 1/W/2025

La circulaire 1/W/2025 du 15 décembre 2025, qui abroge la 19/G/2002, s'applique à partir du 1er janvier 2027 avec une mise en œuvre progressive (article 53). Son article 48 demande que les systèmes d'évaluation du risque de crédit prennent en compte ses règles. Le modèle actuel ne les reprend pas :

| Exigence de la 1/W/2025 | Modèle actuel |
|---|---|
| Créances sensibles (art. 5) : recul du CA de 50 % en un an, dettes financières / capitaux propres > 3 (> 5 en financement spécialisé), trois exercices déficitaires sans augmentation de capital, comptes non reçus 7 mois après la clôture, saisie ou ATD, information négative (crédit bureau, SCIP, CAC), mouvements créditeurs anormalement faibles | Aucun de ces critères n'est mesuré à son seuil ; la notion de créance sensible n'existe pas ; les comptes de plus de 15 mois sont simplement écartés |
| Souffrance (art. 8, 10 à 13) : impayé de plus de 90 jours, dépassement de plus de 90 / 180 / 360 jours et de plus de 10 %, absence de flux créditeurs réels, 9 échéances impayées, procédures | Défaut imposé seulement si la créance est déjà classée en souffrance ; pour les TPE, un impayé de plus de 60 jours ne retire que 20 points |
| Restructurations (art. 17 à 30) : définition, viabilité, rang, différé, période d'observation, retour en sain sous quatre conditions | Seuls la consolidation (défaut) et le rééchelonnement (−20 points) des TPE sont traités, sans trajectoire |
| Classement indépendant des garanties (art. 16) | La garantie de l'État force la note A |
| Impact sur le groupe (art. 50) | Forçage de la filiale selon la note du groupe, sans examen de la contagion d'une dégradation |
| Normes minimales, classement plus sévère si d'autres informations le justifient (art. 49) | Forçage possible dans les deux sens, sans motif |

## 3. Le nouveau modèle

### 3.1 Principes

1. **Mesurer les mécanismes de défaut** : la structure financière, la capacité de remboursement, le comportement du compte, puis l'activité, le management et la transparence. La taille oriente la grille ; elle ne note pas.
2. **Des variables monotones et robustes** : le risque varie toujours dans le même sens ; les ratios restent définis quand les fonds propres ou l'EBE sont faibles.
3. **Pas de compensation des situations graves** : données critiques, plafonds, défaut et signaux d'alerte s'imposent à la moyenne.
4. **Une donnée absente ne rapporte jamais de points.**
5. **Une note intrinsèque**, distincte du soutien d'un groupe ou de l'État, qui s'ajoute en crans plafonnés.
6. **Tout est documenté et versionné** : chaque notation garde la version du modèle, des paramètres et de l'échelle qui l'ont produite.
7. **Un modèle conçu pour devenir statistique** : les variables, les données et l'historique sont structurés pour l'estimation.

### 3.2 Segmentation et grilles

| Grille | Population | Base de la note |
|---|---|---|
| Standard (CORP_STD_V1) | TPE avec comptes, PME, grandes entreprises | Bilan et CPC CGNC sur deux exercices, comportement bancaire, appréciation |
| TPE comportementale (CORP_TPE_BEHAV_V1) | TPE sans comptes exploitables | Fonctionnement du compte et flux observés, appréciation simplifiée |
| Challengers (pilote) | Mêmes populations | Grilles resserrées (16 et 12 critères), notées en parallèle pour comparer |

Le segment (TPE, PME, GE) est déterminé par le chiffre d'affaires et l'exposition, convertis en MAD ; seuils provisoires : TPE jusqu'à 10 MDH, GE au-delà de 175 MDH, à confirmer. Le segment fixe les poids et les barèmes.

### 3.3 Les sept domaines de la grille standard

| Domaine | Ce qui est mesuré | TPE | PME | GE |
|---|---|---|---|---|
| D1 · Performance financière et structure bilancielle | Croissance et stabilité du CA, marge d'EBE, rentabilité économique, fonds propres tangibles / total bilan, dette nette / EBE, liquidité, BFR, conversion de l'EBE en trésorerie | 25 % | 30 % | 30 % |
| D2 · Capacité de remboursement et stress | Couverture des intérêts, DSCR, free cash-flow / dette, liquidité et mur de dette, résistance à un scénario de stress, covenants | 10 % | 15 % | 20 % |
| D3 · Comportement bancaire et historique de crédit | Retards de paiement, dépassements, utilisation des lignes, mouvements créditeurs, incidents, restructuration, endettement système | 25 % | 20 % | 10 % |
| D4 · Activité, secteur et positionnement | Risque sectoriel, position concurrentielle, concentration clients et fournisseurs, visibilité des revenus, exposition pays et change, risque opérationnel, qualité de la croissance | 15 % | 15 % | 15 % |
| D5 · Management, gouvernance et groupe | Expérience, homme-clé et succession, gouvernance, actionnariat et groupe, stratégie, parties liées, pilotage financier | 15 % | 12 % | 15 % |
| D6 · Transparence et conformité | Qualité des états financiers, délai de production, cohérence, situation juridique, fiscale et sociale, transparence de l'actionnariat | 7 % | 5 % | 5 % |
| D7 · ESG et climat | Risque physique, risque de transition, conformité environnementale et sociale, gouvernance ESG | 3 % | 3 % | 5 % |

La grille standard compte 45 critères. Aucun critère ne dépasse 6 % du poids (plafond de concentration). La grille TPE comportementale compte 24 critères : comportement de crédit (30 %), capacité observée sur les flux (20 %), activité (18 %), management (12 %), transparence et conformité (12 %), groupe (5 %), ESG (3 %).

### 3.4 Notation d'un critère

- **Critère chiffré** : barème à cinq paliers (100, 75, 50, 25, 0), propre au segment, monotone, bornes sans chevauchement. Les ratios sont calculés à partir du bilan CGNC avec des définitions uniques : EBE retraité du crédit-bail, fonds propres tangibles (hors non-valeurs, incorporels, écarts de réévaluation, comptes d'associés débiteurs), dette nette économique (dettes de financement, trésorerie passif, crédit-bail, comptes courants d'associés à vue), DSCR sur le service de la dette à douze mois. Un EBE nul ou négatif, ou des fonds propres tangibles négatifs, imposent le score défavorable.
- **Critère qualitatif** : cinq repères écrits (100, 75, 50, 25, 0) décrivent chaque niveau ; l'analyste choisit le repère qui correspond aux faits, pièces à l'appui.
- **Statut de la donnée** : disponible, estimée, manquante, invalide, périmée ou non applicable. Une donnée manquante, invalide ou périmée vaut 0, son poids restant dans la moyenne.

### 3.5 Du score à la note

1. **Score brut** : moyenne pondérée des scores des critères, sur 100.
2. **Données critiques** : sans fonds propres tangibles, dette nette / EBE, liquidité, DSCR et retards de paiement, aucune note n'est produite.
3. **Porte de qualité** : 60 % au moins du poids sur des données observées, 30 % au moins dans chaque domaine, et une classe de confiance au moins C ; sinon aucune note.
4. **Classe** : le score donne la classe de l'échelle de 1 à 10.
5. **Exceptions (plafonds)** : DSCR inférieur à 1, incertitude sur la continuité d'exploitation, EBE négatif deux années sur trois → au mieux classe 8 ; dossier groupe incomplet alors que le groupe est matériel → au mieux classe 7.
6. **Soutien** : la note autonome est conservée ; le soutien d'un groupe ou de l'État relève de deux crans au plus, s'il est documenté (capacité, volonté, engagement juridique, transférabilité des fonds).
7. **Défaut** : un défaut constaté impose DEF1 (retard), DEF2 (improbabilité de paiement, restructuration en difficulté) ou DEF3 (procédure collective, contentieux), quel que soit le score.
8. **Dérogation** : un écart de deux crans au plus, motivé, documenté, validé par une seconde personne, à durée limitée ; jamais vers ou depuis un défaut.

### 3.6 Échelle de notation

| Classe | Score minimal | Libellé |
|---|---|---|
| 1 | 90 | Exceptionnel |
| 2 | 85 | Très solide |
| 3 | 80 | Solide |
| 4 | 75 | Bon |
| 5 | 70 | Satisfaisant |
| 6 | 64 | Acceptable |
| 7 | 57 | Fragile |
| 8 | 48 | Faible |
| 9 | 40 | Très faible |
| 10 | 0 | Critique |
| DEF1 · DEF2 · DEF3 | — | Défaut constaté, hors échelle |

L'échelle est commune à toutes les grilles et se gère par versions datées. Les bornes définitives résulteront de la calibration sur défauts observés.

### 3.7 Niveau de confiance

Chaque note porte une classe de confiance (A, B, C ou U), calculée sur la complétude (35 %), la fraîcheur (20 %), la fiabilité (30 %) et la provenance (15 %) des données. Elle ne modifie pas la note ; elle dit au décideur sur quoi elle repose.

### 3.8 Correspondance avec le modèle actuel

| Modèle actuel | Nouveau modèle |
|---|---|
| Rotation du capital, croissance du résultat net | Rentabilité économique, croissance et stabilité du CA |
| Liquidité réduite, fonds de roulement / actif circulant | Liquidité court terme (barème monotone), BFR et cycle de trésorerie |
| Rentabilité des fonds propres, dette nette / fonds propres | Marge d'EBE, fonds propres tangibles / total bilan, dette nette / EBE |
| Frais financiers / CA | Couverture des intérêts par l'EBE ; DSCR ; free cash-flow / dette |
| CA, effectif, âge | Segmentation ; ancienneté dans la grille TPE |
| Questionnaire (secteur, concurrence, pouvoir de marché, management) | Domaines D4 et D5, avec repères écrits ; concentrations mesurées en % |
| Historique bancaire, nombre de banques | Domaine D3 (10 à 25 % de la note) |
| Comportement du compte TPE | Grille TPE comportementale (B1, B2) |
| Malus et signaux d'alerte | Critères pondérés, signaux imposant une revue, défaut au-delà de 90 jours |
| Garantie de l'État, groupe | Note intrinsèque et soutien plafonné |
| Forçage | Dérogation encadrée |
| Échelles A à H | Échelle unique de 1 à 10, défaut hors échelle |

## 4. Intégration des règles de classification Bank Al-Maghrib

### 4.1 Notation et classification

La classification réglementaire porte sur chaque créance (saine, sensible, pré-douteuse, douteuse, compromise) ; la note porte sur la contrepartie. Les deux ne se confondent pas : une note, même mauvaise, ne vaut pas classement ; un critère de classement, en revanche, ne doit jamais être compensé dans la note par d'autres critères favorables. Le nouveau modèle intègre les règles des circulaires à trois niveaux. Dans les tableaux qui suivent, les mécanismes sans mention sont en place dans la version 3.2 du modèle ; les mentions « lot A », « lot B » et « lot C » désignent les règles et données à activer (4.6).

| Niveau | Mécanisme | Effet |
|---|---|---|
| 1. Critère de la grille | Le fait mesuré par la circulaire est un critère pondéré (retards, dépassements, flux, incidents, restructuration, secteur, dirigeants…) | Il dégrade la note de façon graduée |
| 2. Règle imposée | Défaut, plafond ou revue obligatoire déclenchés par le seuil de la circulaire | Il ne se compense pas |
| 3. Indicateur de classification | Le fait daté (seuil, date, pièce) est restitué avec la note | Il alimente la classification des créances |

### 4.2 Créances sensibles (1/W/2025, art. 5 à 7)

| Critère | Intégration dans le modèle |
|---|---|
| Saisie-arrêt ou avis à tiers détenteur affectant le compte | Critère D6.4 (situation juridique, fiscale et sociale) ; signal RF11 ; fait daté et revue obligatoire (lot B) |
| États comptables annuels absents 7 mois après la clôture | Critère D6.2 (délai de production) ; règle (lot A) : comptes non reçus à clôture + 7 mois → revue obligatoire, indicateur sensible |
| Information négative du crédit bureau, du SCIP, des CAC | Critères D3.5 (incidents), D3.7 (endettement système), D6.1 (certification) ; signal RF10 |
| Mouvements créditeurs anormalement faibles au regard des lignes utilisées | Critères D3.3 et D3.4 ; B1.3 et B1.4 pour les TPE |
| Événement touchant un dirigeant ou un actionnaire | Critère D5.2 ; B4.2, B4.4 ; fait daté et revue obligatoire (lot B) |
| Litiges entre associés, problèmes de gestion | Critère D5.3 ; signal RF12 |
| Difficultés du secteur | Critère D4.1 ; B3.1 |
| Dépendance à un client ou fournisseur en difficulté | Critères D4.3, D4.4 ; signal RF13 |
| Recul du CA de 50 % ou plus en un an | Indicateur calculé sur le bilan (N / N−1) ; règle (lot A) : revue obligatoire, indicateur sensible |
| Dettes financières / capitaux propres > 3 (> 5 en financement spécialisé) | Indicateur calculé (gearing) ; règle (lot A) : revue obligatoire, indicateur sensible ; capitaux propres nuls ou négatifs : critère rempli |
| Trois exercices déficitaires, entreprise d'au moins 5 ans, sans augmentation de capital | Résultat et capital sur trois exercices, date de création ; règle (lot A) : revue obligatoire, indicateur sensible ; exception NC03 (EBE négatif) |
| Projets financés (avancement, commercialisation, retards, autorisations) | Hors grille entreprises : dispositif Project Finance |
| Émetteurs de dette privée en difficulté | Critère D2.4 ; fait daté (lot B) ; portefeuille titres |
| Exception validée par le comité des risques (art. 6), retour en sain à la levée des critères (art. 7) | Relève de la classification ; la note restitue les critères actifs et leur levée |

### 4.3 Créances en souffrance (1/W/2025, art. 8 à 16)

| Critère | Intégration dans le modèle |
|---|---|
| Impayé de plus de 90 jours (art. 8) | Critère D3.1 / B1.1 (score 0 au-delà de 60 jours) ; règle (lot A) : retard de plus de 90 jours → défaut DEF1 imposé |
| Paiement intégral improbable (art. 8, 10-7, 11-7) | Constat motivé et validé (lot B) → défaut DEF2 ; exception NC02 (continuité) |
| Dépassements de plus de 90 / 180 / 360 jours et de plus de 10 % (art. 10-1, 11-1, 12-1) | Critère D3.2 / B1.2 ; durée continue et pourcentage de l'autorisation transmis comme indicateur |
| Échéances, crédits à échéance unique, loyers de crédit-bail impayés à 90 / 180 / 360 jours | Critère D3.1 / B1.1 ; défaut imposé au-delà de 90 jours ; ancienneté par produit transmise comme indicateur |
| Comptes sans mouvements créditeurs réels couvrant les agios pendant 180 / 360 jours (art. 11-2, 12-2) | Critères D3.4, B1.3, B2.3 |
| Situation non évaluable faute d'information (art. 10-6) | Données critiques : pas de note ; constat « situation non évaluable » transmis |
| Redressement judiciaire, cessation, liquidation, action en recouvrement (art. 11-6, 12-9) | Signal RF05 ; règle (lot A) : défaut DEF3 imposé |
| Perte des trois quarts (SA) ou du tiers (autres formes) de la situation nette sans AGE (art. 12-9) | Capitaux propres, capital, forme juridique ; règle (lot A) : revue obligatoire, indicateur compromis ; signal RF09 |
| Contestation judiciaire des créances, déchéance du terme, résiliation du crédit-bail (art. 12-9) | Faits datés (lot B) → défaut DEF3 |
| Neuf échéances mensuelles impayées (art. 13) | Compteur transmis par le système des crédits (lot C) → défaut |
| Contagion à toutes les créances de la contrepartie (art. 15) | Note unique par contrepartie |
| Classement indépendant des garanties (art. 16) | Note intrinsèque, sans critère de garantie ; soutien plafonné et visible |
| Titres de créance (art. 10-5, 12-6), projets (art. 12-7, 12-8) | Dispositifs dédiés |

### 4.4 Restructurations (1/W/2025, art. 17 à 31)

| Règle | Intégration dans le modèle |
|---|---|
| Définition (difficulté financière et concession), présomptions, exclusion des réaménagements commerciaux (art. 17) | Critère D3.6 (restructuration et forbearance) ; fait daté : difficulté, concession, ancien et nouveau contrat |
| Viabilité démontrée, sinon douteux (art. 18) | Critères D2.2 et D2.5 (DSCR, stress) ; dossier de viabilité joint ; à défaut, indicateur douteux |
| Première, seconde, troisième restructuration ; différé d'un an ; seconde pendant l'observation (art. 21 à 25, 28) | Rang de la restructuration et différé dans le fait daté (lot B) ; D3.6 au niveau 25 ou 0 ; exception et revue obligatoires ; seconde concession → DEF2 |
| Impayé de plus de 30 jours (sensible) ou 90 jours (douteux) après restructuration (art. 29) | D3.6 au niveau 0 ; défaut imposé au-delà de 90 jours |
| Observation d'un an à partir de la première échéance ; retour en sain sous quatre conditions (art. 26, 27, 30) | Politique de guérison : sortie du défaut DEF2 après la période d'observation, paiements significatifs du principal, absence d'impayé et de critère, difficultés résolues, décision formelle |
| Abandons, décote, provisions (art. 19, 20, 31 à 46) | Comptabilité et provisionnement |

### 4.5 Ancienne circulaire 19/G/2002

La 19/G/2002 reste la référence jusqu'au 31 décembre 2026 et pour les arrêtés antérieurs. Ses critères de souffrance (impayés à 90, 180 et 360 jours par produit, comptes sans flux, procédures, neuf mensualités, créance restructurée impayée à 180 jours) sont repris par la 1/W/2025 et traités comme ci-dessus. Ses critères qualitatifs — déséquilibre persistant de la situation financière, baisse significative du chiffre d'affaires, endettement excessif, événements touchant les dirigeants, litiges entre associés, difficultés du secteur — n'ont pas de seuil chiffré : ils correspondent directement aux domaines D1, D2, D4 et D5 du modèle. La catégorie des créances irrégulières (couvertes par des garanties à 100 %) disparaît avec la 1/W/2025 ; le modèle, qui note sans tenir compte des garanties, n'en dépend pas.

### 4.6 Bilan de couverture et mise en œuvre

Sur les 108 critères et dispositions recensés dans les deux circulaires, 17 sont intégrés en l'état, 61 sont couverts par un critère voisin dont le seuil exact est à activer, 23 relèvent de données ou de dispositifs à ajouter, et 7 relèvent du provisionnement ou du reporting. L'intégration complète se fait en trois lots :

| Lot | Contenu | Données |
|---|---|---|
| A — règles imposées | Défaut au-delà de 90 jours et en cas de procédure ; revues obligatoires : recul du CA de 50 %, gearing > 3 (5), trois exercices déficitaires, perte des trois quarts de la situation nette, comptes non reçus à 7 mois | Déjà disponibles (bilan sur trois exercices, capital, forme juridique, retards), date de création |
| B — faits datés | Saisie ou ATD, crédit bureau, événement dirigeant, litige, partenaire en difficulté, improbabilité de paiement, restructuration (rang, différé, viabilité) | Saisis et justifiés par l'analyste |
| C — classification | Retards par produit, dépassements continus, flux réels sur 180 / 360 jours, 9 échéances, observation des restructurations, contagion de groupe (art. 50), exception du comité des risques (art. 6), calendrier de l'article 53 | Systèmes de la banque |

Le détail critère par critère figure dans le document « Couverture des critères Bank Al-Maghrib ».

## 5. Vers une modélisation statistique progressive

### 5.1 Prérequis

1. **Une définition du défaut** unique et datée, alignée sur la 1/W/2025 (impayé de plus de 90 jours, improbabilité de paiement, restructuration en difficulté, procédure collective) et approuvée par Risques, Finance et Conformité.
2. **Un historique de notations rapproché des défauts** : pour chaque notation, la survenance d'un défaut dans les douze mois suivants, avec une fenêtre d'observation complète.
3. **Des données structurées et stables** : bilan CGNC, ratios calculés selon des formules uniques, comportement du compte, réponses qualitatives codifiées. Le nouveau modèle les produit dès sa mise en service.
4. **Un volume suffisant** : plusieurs centaines de défauts pour les PME et les TPE ; les grandes entreprises, peu nombreuses à faire défaut, relèvent de méthodes adaptées.

### 5.2 Démarche d'estimation

| Étape | Méthode |
|---|---|
| Échantillons | Développement, calibration et validation séparés par contrepartie ; test hors période sur les années les plus récentes |
| Analyse univariée | Pouvoir discriminant de chaque variable (Gini, valeur d'information), monotonie, stabilité dans le temps, taux de valeurs manquantes |
| Discrétisation | Regroupement des valeurs en classes de risque homogènes et monotones (poids de l'évidence) |
| Sélection | Élimination des variables redondantes (corrélations, facteur d'inflation de la variance) ; une variable par mécanisme de défaut |
| Estimation | Régression logistique sur les variables quantitatives et comportementales ; module qualitatif estimé séparément puis combiné |
| Échelle | Découpage du score en classes respectant la monotonie des taux de défaut et une concentration raisonnable |
| Calibration | Probabilité de défaut par classe ajustée sur la moyenne de long terme, avec une marge de prudence |
| Validation | Discrimination (Gini, AUC et intervalles de confiance), calibration (test binomial par classe), stabilité (indice de stabilité de la population), migrations, dérogations, revue indépendante |

### 5.3 Une trajectoire en quatre stades

| Stade | Le modèle | Ce qui est estimé | Conditions de passage |
|---|---|---|---|
| 0 · Expert (aujourd'hui) | Grille experte, poids et barèmes documentés | Rien ; calibration synthétique pour vérifier la chaîne de calcul | Définition du défaut, collecte structurée |
| 1 · Expert calibré | Même grille | Probabilité de défaut par classe sur les défauts observés ; bornes de l'échelle | 12 à 24 mois d'historique, défauts rapprochés |
| 2 · Hybride | Poids et barèmes quantitatifs réestimés ; qualitatif expert | Coefficients des variables financières et comportementales | Volume suffisant par segment ; validation indépendante |
| 3 · Statistique | Modèle estimé, qualitatif intégré comme module | Ensemble du modèle | Performance supérieure au stade 2 sur l'échantillon hors période |

À chaque stade, le nouveau modèle et le modèle candidat sont notés en parallèle sur les mêmes dossiers ; la bascule se décide sur la matrice de migration et sur l'analyse des écarts de deux crans ou plus. Les grandes entreprises, portefeuille à faible taux de défaut, restent sur un modèle expert calibré, avec des méthodes adaptées aux portefeuilles à faibles défauts et, le cas échéant, des références externes.

### 5.4 Critères de réussite

| Indicateur | Cible |
|---|---|
| Gini hors échantillon | 50 à 60 % pour les PME et les TPE |
| Taux de dérogation | Moins de 10 % (30 % de forçage aujourd'hui) |
| Stabilité de la population | Indice inférieur à 10 % ; recalibrage au-delà de 25 % |
| Calibration | Aucune classe significativement sous-estimée au test binomial |
| Revue | Annuelle, par une fonction indépendante |

## 6. Application aux filiales africaines

### 6.1 Principe : un socle groupe, des paramètres locaux

Le cadre du modèle — sept domaines, règles imposées, échelle de 1 à 10, confiance, gouvernance — est commun au groupe. Chaque filiale le complète par des paramètres locaux, validés localement puis par le groupe. La note locale et la vue consolidée du groupe se lisent sur la même échelle.

| Composant | Socle groupe | Paramètre local |
|---|---|---|
| Domaines, critères, repères qualitatifs | Communs | Libellés et exemples adaptés au contexte |
| Référentiel comptable | Ratios définis une fois | Correspondance des postes SYSCOHADA révisé (zones UEMOA et CEMAC) ou du référentiel national avec les rubriques du modèle |
| Segmentation | TPE, PME, GE | Seuils de chiffre d'affaires et d'exposition en monnaie locale (XOF, XAF, MGA…) |
| Barèmes chiffrés | Structure à cinq paliers | Seuils recalés sur les distributions locales (marges, endettement, délais) |
| Risque sectoriel | Méthode | Référentiel sectoriel et taux de défaut locaux |
| Pays | — | Plafond lié au risque pays et au risque de transfert ; note de la filiale et de l'État |
| Classification réglementaire | Les trois niveaux d'intégration (4.1) | Règles du régulateur local : BCEAO pour l'UMOA, COBAC pour la CEMAC, banque centrale nationale ailleurs |
| Défaut | Définition groupe | Correspondance avec la définition locale |
| Échelle et calibration | Échelle 1 à 10 | Calibration par zone, sur les défauts locaux |

### 6.2 Démarche de déploiement

1. **Diagnostic local** : textes du régulateur, systèmes d'information, disponibilité des états financiers et des données de compte, population des clients entreprises.
2. **Correspondance comptable** : table des postes SYSCOHADA (ou du référentiel national) vers les rubriques du modèle ; vérification sur un échantillon de liasses.
3. **Recensement des règles de classification locales**, critère par critère, selon la méthode appliquée à la 1/W/2025 ; intégration aux trois niveaux.
4. **Paramétrage** : seuils de segmentation, barèmes, référentiel sectoriel, plafond pays, en versions datées.
5. **Double notation** sur un échantillon de dossiers, comparée à la notation locale existante ; analyse des écarts.
6. **Validation** par la gestion des risques de la filiale, puis par le comité modèles du groupe ; mise en service.
7. **Calibration** sur les défauts locaux quand l'historique le permet ; à défaut, calibration du groupe ajustée du risque pays, avec une marge de prudence.

### 6.3 Points d'attention

- **Qualité de l'information financière** : comptes souvent non audités pour les petites entreprises ; la grille comportementale et la classe de confiance y prennent tout leur sens.
- **Économie informelle et trésorerie** : les flux observés sur le compte pèsent davantage que les comptes déclarés.
- **Risque pays et risque de change** : plafond de note lié au pays ; attention aux expositions en devise sans revenus en devise.
- **Concentration sectorielle** (matières premières, agriculture, commerce) : référentiel sectoriel local et scénarios de stress adaptés.
- **Volumes de défauts plus faibles par filiale** : mutualiser l'estimation par zone économique (UEMOA, CEMAC) plutôt que par pays.
- **Gouvernance** : la filiale reste responsable de sa classification réglementaire ; le groupe garantit la cohérence de la méthode.

## 7. Gouvernance du modèle

| Instance | Rôle |
|---|---|
| Direction des Risques | Propriétaire du modèle ; propose les évolutions ; suivi de la performance |
| Comité modèles | Approuve les versions du modèle, des paramètres et de l'échelle |
| Fonction de validation indépendante | Revue annuelle ; validation de toute estimation statistique |
| Conformité | Alignement avec Bank Al-Maghrib et les régulateurs locaux |
| Audit interne | Contrôle de l'application et de la traçabilité |

Toute modification fait l'objet d'une version datée, motivée et approuvée ; une notation conserve toujours la version qui l'a produite. Le suivi comprend au moins une fois par an la distribution des notes, les migrations, les taux de défaut par classe, les dérogations et la stabilité des populations.

## 8. Décisions attendues

1. Approuver la méthodologie du nouveau modèle et la correspondance avec le modèle actuel.
2. Arrêter la définition du défaut et les seuils de segmentation.
3. Valider l'intégration des règles de la 1/W/2025 (lots A et B) et cadrer la classification des créances (lot C).
4. Lancer la collecte structurée et le rapprochement des notations avec les défauts, première étape de la modélisation statistique.
5. Désigner une filiale pilote pour le déploiement africain.
