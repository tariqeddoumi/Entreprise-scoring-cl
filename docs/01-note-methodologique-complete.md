# Note méthodologique — Modèle de notation interne des entreprises, version 3

## Contreparties TPE, PME et Grandes Entreprises — contexte bancaire marocain

**Version :** 3.0 · **Date :** 17 septembre 2026
**Remplace :** version 2.0 du 19 août 2026
**Destinataires :** Direction générale, Direction des Risques, Comité modèles, Validation indépendante, Finance et IFRS 9, Conformité et Juridique, Direction des Systèmes d'Information
**Classification :** usage interne

---

> **Statut du document.** Cette version répond au diagnostic indépendant du 16 septembre 2026. Elle corrige des défauts de CONCEPTION ; elle ne produit aucune preuve empirique nouvelle. Le modèle reste un seed expert non calibré sur défauts observés et non validé indépendamment. Les pondérations, seuils et barèmes ne sont ni des règles Bank Al-Maghrib, ni des paramètres IFRS 9, ni des probabilités de défaut utilisables.
>
> **Position d'usage inchangée :** pilote en mode fantôme autorisé, usage décisionnel ou réglementaire refusé. Ce qui change est que cette position est désormais **techniquement imposée** par le dispositif, et non seulement affirmée dans une note.

---

# Partie I — Ce que cette version change, et pourquoi

## 1. Message exécutif

Le diagnostic indépendant a relevé vingt-six constats : huit critiques, quatorze élevés, quatre moyens. Il concluait à une maturité de 2,1 sur 5 — prototype avancé, admissible en pilote fantôme, non prêt pour la production.

Cette version traite **dix-neuf constats dans le code exécuté**, dont les huit critiques. Les sept restants ne dépendent pas du modèle mais de décisions, de données ou d'infrastructures qui appartiennent à la banque ; ils sont listés en annexe B avec le motif de non-prise en charge et la condition de levée. Aucun n'a été écarté pour raison de difficulté.

Trois changements structurants méritent l'attention de la Direction générale, parce qu'ils modifient ce que l'outil affiche et ce que les métiers en verront.

**La qualité de l'information ne déforme plus la mesure du risque.** La version 2 traduisait une information incomplète en plafond de grade. Sur le portefeuille simulé, ce mécanisme déplaçait 55 à 65 % des dossiers de deux grades et concentrait la moitié du portefeuille sur deux grades, au point que le score moyen d'un grade dépassait celui du grade censé lui être supérieur. La version 3 sépare les deux : le grade mesure le risque, une classe de confiance A/B/C/U décrit la robustesse de l'estimation, et sous un seuil de couverture minimal **aucun grade n'est produit**. Un dossier insuffisamment documenté n'est plus un dossier moyen : c'est un dossier non notable, et la réponse attendue est de le compléter.

**Chaque modèle porte désormais sa propre échelle.** Le modèle standard produit des grades STD-P1 à STD-P8, le modèle TPE comportemental des grades TPE-B1 à TPE-B6. Les deux grilles n'observent pas la même chose — états financiers d'un côté, flux bancaires de l'autre — et la calibration le confirme : sur données simulées, le meilleur grade du modèle standard porte une probabilité de défaut de 0,16 % contre 0,48 % pour le meilleur grade du modèle comportemental. Afficher « G1 » dans les deux cas revenait à affirmer une équivalence que rien n'établissait.

**Aucune probabilité de défaut ne sort de l'environnement de simulation.** La version 2 exposait une probabilité issue de données simulées, protégée par un simple libellé de statut. La version 3 la rend techniquement inaccessible : en production, la valeur est nulle, la finalité déclarée du résultat est « pilote fantôme », et l'application refuse de démarrer si la dérogation de bac à sable est posée en production. Le statut de calibration reste visible, pour que le système aval sache *pourquoi* la valeur est absente.

## 2. Traitement des vingt-six constats

Le détail figure dans le journal des décisions, document distinct. Synthèse :

| Gravité | Constats | Traités dans le code | Traités partiellement | Hors du périmètre du modèle |
|---|---|---|---|---|
| Critique | C01 – C08 | 6 | 2 | 0 |
| Élevée | H01 – H14 | 10 | 2 | 2 |
| Moyenne | M01 – M04 | 1 | 1 | 2 |
| **Total** | **26** | **17** | **5** | **4** |

« Traité partiellement » signifie que la structure, les contrôles et les points d'accroche existent dans le code, mais que le contenu suppose une donnée ou une décision qui n'appartient pas au modèle : le référentiel sectoriel est construit mais vide, la matrice article-règle-test est spécifiée mais non alimentée, le paquet de preuve est généré mais la revue indépendante reste à conduire.

## 3. Ce que cette version ne change pas

Elle ne produit aucune probabilité de défaut utilisable, aucune validation indépendante, aucun moteur réglementaire, aucune certification de base de données sur instance réelle. Elle ne remplace pas la lecture du corpus Bank Al-Maghrib applicable, qui reste la première porte du programme. Le score reste un classement ordinal expert, dont la valeur principale est de standardiser le jugement et de constituer l'historique qui rendra la calibration possible.

La maturité ne se décrète pas depuis le code : elle sera réévaluée par la validation indépendante, sur pièces.

---

# Partie II — Méthodologie du modèle, version 3

## 4. Philosophie de notation

Le diagnostic relevait que la philosophie n'était pas formalisée, et que calibration, backtesting et IFRS 9 travailleraient dès lors sur des horizons implicitement différents. Elle est désormais déclarée dans la configuration de chaque modèle, contrôlée au chargement, et restituée dans l'interface.

| Paramètre | Modèle standard | Modèle TPE comportemental |
|---|---|---|
| Type | Hybride assumé | Point-in-time assumé |
| Horizon | 12 mois | 12 mois |
| Fenêtre — états financiers | 36 mois | sans objet |
| Fenêtre — comportement | 24 mois, cible 36 | 24 mois, cible 36 |
| Fenêtre — secteur | 60 mois | 60 mois |

**Traitement du cycle.** Aucune correction de cycle n'est appliquée : l'historique ne permet pas de l'estimer. La sensibilité au point du cycle est donc une limitation documentée, pas une propriété revendiquée.

**Règle de migration.** Une notation reste valide jusqu'à son terme sauf événement significatif : impayé, restructuration, perte d'un client vital, changement de contrôle, arrivée d'états financiers plus récents. La migration n'est jamais lissée.

**Événements postérieurs à l'arrêté.** Un événement postérieur à la date d'arrêté ne modifie jamais rétroactivement une notation produite : il déclenche une nouvelle notation, à une nouvelle date d'arrêté. C'est la condition du rejeu historique.

## 5. Pipeline canonique

La version 2 décrivait un ordre de calcul que ses propres exemples contredisaient : les plafonds y figuraient avant le grade moteur, alors que le texte et les illustrations les appliquaient après. Une divergence d'implémentation était inévitable. L'ordre ci-dessous est désormais unique, implémenté tel quel et couvert par des tests de précédence.

| Étape | Fonction | Ce que le moteur garantit |
|---|---|---|
| 01 | Identité, groupe, arrêté | En amont du moteur : service d'identité ICE/RC/IF, groupe économique, date métier |
| 02 | Routage | Segment déterminé par un référentiel effectif-daté, puis éligibilité du modèle. Un modèle non publié pour le segment refuse de noter |
| 03 | Contrôles de relation | Statut conformité produit séparément ; il n'annule jamais la notation d'une exposition existante |
| 04 | Défaut | Constat reçu d'un moteur amont ; force le grade de défaut quel que soit le score |
| 05 | Qualité et couverture | Classe de confiance et seuils de couverture observée ; ouvre ou ferme la porte, sans déformer l'échelle |
| 06 | Caractéristiques | Résolution des critères : barèmes, ancrages, cas spéciaux, catégorie « information absente », transferts de non-applicabilité |
| 07 | Score brut | Agrégation à **poids total constant** |
| 08 | Grade moteur | Application de l'échelle propre au modèle |
| 09 | Exceptions non compensatoires | **Après** le grade moteur, jamais avant |
| 10 | Grade autonome | Conservé séparément du grade final |
| 11 | Support groupe | Relèvement plafonné et conditionné ; la note autonome reste la mesure du risque intrinsèque |
| 12 | Dérogation | Hors moteur : maker-checker, motif codifié, preuve, expiration |
| 13 | Persistance et diffusion | Hors moteur : instantané, versions, droits d'usage |

Le moteur est une fonction pure : aucune entrée-sortie, aucune lecture d'environnement, aucune horloge implicite. La décision d'exposer ou non une probabilité de défaut est prise à la frontière applicative et transmise explicitement.

## 6. Données manquantes et non applicables

C'était le constat critique le plus lourd de conséquences. La version 2 retirait du dénominateur un critère sans donnée : deux dossiers cessaient d'être comparables, et l'absence d'une information défavorable pouvait **améliorer** un score.

La version 3 supprime le mécanisme. Deux issues seulement pour une donnée indisponible :

| État de la donnée | Traitement | Effet sur la couverture |
|---|---|---|
| `AVAILABLE` | Barème ou ancrage ordinaire | Compte comme observée |
| `ESTIMATED` | Scoré normalement, signalé | **Ne compte pas** : une estimation n'est pas une observation |
| `MISSING`, `INVALID`, `STALE` sur critère critique | Blocage : aucune notation, aucun score publié | — |
| `MISSING`, `INVALID`, `STALE` sur critère non critique | Catégorie « information absente », score prudent déclaré par la grille | Ne compte pas |
| `NOT_APPLICABLE` prévu par le modèle | Poids transféré au critère receveur **nommé** dans la configuration | Neutre |
| `NOT_APPLICABLE` non prévu | Refusé : traité comme manquant, incohérence tracée | Ne compte pas |

Le poids total appliqué vaut exactement 10 000 points de base dans tous les cas. Cette propriété est vérifiée par un test dédié, de même que l'impossibilité qu'une information absente améliore un score.

**Porte de couverture.** Le modèle standard exige que 60 % du poids soit porté par une donnée observée, et 30 % par domaine ; le modèle comportemental, 70 % et 40 % — une grille entièrement fondée sur les flux ne tolère pas une information faible, car s'ils ne sont pas fiables il ne reste rien. Sous le seuil, le score brut est calculé et conservé pour la surveillance, mais aucun grade n'est produit.

## 7. Classe de confiance

La confiance combine complétude, fraîcheur, fiabilité et provenance, pondérées 35 / 20 / 30 / 15. Elle produit une classe :

| Score | Classe | Effet |
|---|---|---|
| ≥ 85 | A — élevée | Grade produit, classe affichée à côté |
| [70 ; 85[ | B — moyenne | Grade produit, classe affichée à côté |
| [55 ; 70[ | C — faible | Grade produit, classe affichée à côté |
| [0 ; 55[ | U — insuffisante | **Aucun grade** : dossier non notable en l'état |

La classe minimale exigée est C pour le modèle standard, B pour le modèle comportemental. **La confiance ne plafonne jamais le grade.** Le champ `affectsGrade` du résultat vaut `false` et le rappelle explicitement à tout système aval.

## 8. Exceptions non compensatoires

La version 2 comptait dix plafonds structurels, auxquels s'ajoutaient un plafond de confiance et des red flags. Un même phénomène — des fonds propres négatifs, une restructuration — pouvait agir jusqu'à quatre fois : score élémentaire, domaine transparence, plafond, signal. La conséquence n'est pas seulement une surpénalisation : l'effet marginal de chaque règle devient inisolable, donc la grille incalibrable.

Un inventaire phénomène-règle a été construit. Chaque exception conservée doit déclarer le critère qui porte la contribution centrale du phénomène et justifier son effet incrémental ; une exception qui ne le fait pas **fait échouer le chargement du modèle**.

Résultat : de dix plafonds à **quatre exceptions** sur le modèle standard, et **aucune** sur le modèle comportemental.

| Phénomène | Contribution centrale | Exception conservée | Ce qui a été retiré |
|---|---|---|---|
| Fonds propres tangibles négatifs | D1.4 (score nul imposé) | aucune | CAP02 — le score nul et le signal RF09 suffisaient |
| Couverture du service de dette < 1 en base | D2.2 | NC01 | CAP07 — le stress est déjà mesuré par D2.5 |
| Restructuration / forbearance | D3.6 | aucune | CAP09 — relève des moteurs défaut et IFRS 9 |
| Concentration client | D4.3 | aucune | CAP08 — barème continu et RF13 suffisants |
| Comptes anciens ou incohérents | D6.2 | aucune | CAP04 et le plafond de confiance — traités par la porte de couverture |
| Identité, bénéficiaire effectif, sanctions | D6.5 (transparence résiduelle) | aucune | Le blocage total du scoring — la conformité porte son statut |
| Entreprise de moins de deux ans | — | **route dédiée** | CAP01 — un plafond tenait lieu de modèle de millésime |
| Continuité d'exploitation | D6.1 | NC02 | — |
| Excédent brut négatif deux ans sur trois | D1.2 | NC03 | — |
| Dossier groupe incomplet | D5.4 | NC04 | — |

**La route jeune entreprise** mérite une explication. Les entreprises de moins de deux ans représentent 98,5 % des créations au Maroc. Les plafonner à un grade médiocre revenait à refuser de les analyser tout en prétendant les noter. Elles sortent désormais des grilles publiées, avec un motif explicite. Cela met la banque devant une décision qu'un plafond masquait : construire une grille jeune entreprise, ou assumer un traitement à dire d'expert tracé.

## 9. Support groupe

La version 2 annonçait une méthode dédiée sans l'implémenter, tout en laissant un critère porter implicitement le soutien. La méthode existe désormais et elle est stricte :

1. la note **autonome** est toujours calculée et conservée ;
2. le relèvement n'est accordé que si les **quatre** conditions sont documentées — capacité financière du garant, volonté démontrée, engagement juridiquement contraignant, transférabilité effective des fonds ;
3. il est plafonné à **deux crans** ;
4. toute condition manquante est nommée dans le résultat.

Une garantie qui ne satisfait pas ces conditions n'est pas ignorée : elle appartient au moteur de décision et au calcul de la perte en cas de défaut. Elle ne rend simplement pas l'emprunteur intrinsèquement meilleur.

## 10. Défaut, guérison et rechute

Les grades DEF1, DEF2 et DEF3 restaient des libellés génériques. Ils sont définis, avec leurs critères d'entrée et leur règle de guérison — proposition à valider sur le corpus applicable, Risques et Finance conjointement. Ils demeurent **communs aux deux modèles** : un défaut est un état constaté selon une définition unique, pas une estimation produite par une grille. Deux modèles peuvent diverger sur l'estimation d'un risque ; ils ne peuvent pas diverger sur le constat d'un impayé de plus de quatre-vingt-dix jours.

Le moteur de notation n'évalue jamais lui-même la définition du défaut : il reçoit le constat et force le grade correspondant.

## 11. Segmentation et routage

Le référentiel de segmentation est désormais **effectif-daté et versionné** (jeu `SEG-2026.1`), avec un statut de source explicite — `UNCONFIRMED_SEED` tant que la lecture du corpus Bank Al-Maghrib n'a pas été validée conjointement Risques, Conformité et Juridique. Aucun seuil n'est opposable en l'état, et le document le dit là où les seuils apparaissent.

Six axes de segmentation sont distingués et ne doivent jamais être dérivés l'un de l'autre : taille économique, segment commercial, catégorie prudentielle, portefeuille IFRS 9, segment modèle, groupe économique. Le module ne produit que le segment modèle.

**Le routage est déterministe.** Le modèle applicable découle du segment, de la disponibilité d'états financiers exploitables et de la longueur de l'historique de compte. Un segment fourni par le référentiel amont est accepté mais **confronté au calcul** : une divergence est tracée plutôt que silencieusement acceptée. Sans cette règle, choisir son segment revient à choisir ses pondérations, et un dossier refusé par une grille peut être représenté à l'autre.

## 12. Cinq finalités, cinq statuts

Chaque résultat porte cinq statuts distincts. Quatre restent `NOT_EVALUATED` : c'est une information, pas un oubli.

| Statut | Valeurs | Moteur |
|---|---|---|
| `ratingStatus` | RATED, DEFAULTED, NO_RATING_INSUFFICIENT_DATA, NO_RATING_SEGMENT_UNDETERMINED, NO_RATING_ROUTED_OTHER_MODEL | Implémenté |
| `complianceStatus` | NOT_EVALUATED, CLEAR, REFER, BLOCKED | Amont, hors outil |
| `decisionStatus` | NOT_EVALUATED | Non implémenté |
| `regulatoryClassStatus` | NOT_EVALUATED | Non implémenté |
| `ifrs9Status` | NOT_EVALUATED | Non implémenté |

Conséquence directe : **un blocage de conformité n'empêche plus de noter une exposition déjà au bilan.** Un contrôle de sanctions interdit une entrée en relation ou une opération ; il ne rend pas le risque d'un encours existant inconnaissable — et refuser de le noter reviendrait à refuser de le surveiller et de le provisionner.

L'échelle de grades ne porte plus de « décision indicative ». La décision de crédit tient compte de l'exposition, du produit, des garanties, de la rentabilité et de l'appétence : elle appartient à un moteur distinct, qui n'est pas implémenté ici.

## 13. Droits d'usage attachés au résultat

Chaque résultat transporte ses usages autorisés et ses restrictions, afin qu'aucun système aval n'ait à les deviner.

| Finalité | Conditions | Probabilité de défaut |
|---|---|---|
| `PRODUCTION_RATING` | Calibration sur défauts **observés** et modèle validé ou publié | Exposée |
| `SIMULATION_ONLY` | Environnement bac à sable explicitement déclaré | Exposée, marquée simulée |
| `PILOT_SHADOW` | Tout le reste — situation actuelle | **Nulle** |

En production, la dérogation de bac à sable fait échouer le démarrage de l'application. La position sûre est le refus.


---

# Partie III — Grilles détaillées

> **Section générée automatiquement depuis la configuration exécutée par le moteur** (`src/models/`), au moyen de `scripts/generate-model-doc.mts`. Toute modification d'un poids, d'un seuil ou d'un ancrage dans le code se répercute ici à la régénération. Cette section ne peut donc pas diverger du calcul réellement appliqué — un vérificateur d'alignement le contrôle à chaque exécution.

## 14. Lecture des grilles

Chaque critère indique son poids par segment, sa nature, et la politique appliquée lorsque l'information est absente : **blocage** pour une donnée critique, **catégorie prudente** sinon, avec le score imposé. Les critères conditionnés à la matérialité indiquent le critère qui reçoit leur poids lorsqu'ils ne s'appliquent pas.

## Modèle standard — CORP_STD_V1

Identifiant `CORP_STD_V1` · version 3.0.0 · statut DRAFT_EXPERT_SEED · date d'effet 2026-09-17.

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

**Poids :** TPE 3.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 3.00 % · PME 4.00 % · GE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 2.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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
| `NEGATIVE_TANGIBLE_EQUITY` | Fonds propres tangibles négatifs (contribution centrale du phénomène ; RF09 route la revue, aucun plafond ne s'y ajoute) | 0 |

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

**Poids :** TPE 4.00 % · PME 4.00 % · GE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 3.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 2.00 % · PME 3.00 % · GE 5.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 1.50 % · PME 2.00 % · GE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≥ 5x | [3x ; 5x[ | [2x ; 3x[ | [1x ; 2x[ | < 1x |
| PME | ≥ 5x | [3x ; 5x[ | [2x ; 3x[ | [1.2x ; 2x[ | < 1.2x |
| GE | ≥ 6x | [4x ; 6x[ | [2.5x ; 4x[ | [1.5x ; 2.5x[ | < 1.5x |

#### D2.2 — DSCR / couverture du service de la dette

CFADS / (intérêts + principal exigibles), service de dette complet y compris leasing et dette assimilée. Revolving sans amortissement : convention de conversion documentée.

**Poids :** TPE 3.00 % · PME 4.00 % · GE 5.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≥ 1.5x | [1.3x ; 1.5x[ | [1.15x ; 1.3x[ | [1x ; 1.15x[ | < 1x |
| PME | ≥ 1.6x | [1.35x ; 1.6x[ | [1.2x ; 1.35x[ | [1x ; 1.2x[ | < 1x |
| GE | ≥ 1.75x | [1.4x ; 1.75x[ | [1.2x ; 1.4x[ | [1x ; 1.2x[ | < 1x |

**Justificatifs requis :** Échéancier complet de la dette ; CFADS et retraitements.

#### D2.3 — Free cash-flow / dette financière

FCF récurrent / dette financière brute moyenne, en %. Un ratio élevé dû à des capex de maintien artificiellement faibles doit être retraité.

**Poids :** TPE 1.00 % · PME 2.00 % · GE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 1.50 % · PME 2.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Couverture ≥ 12 mois, headroom ≥ 30 %, aucune échéance concentrée non financée |
| 75 | Couverture 9–12 mois, headroom 20–30 %, refinancement très probable et documenté |
| 50 | Couverture 6–9 mois, headroom 10–20 %, dépendance modérée au renouvellement |
| 25 | Couverture 3–6 mois, headroom < 10 %, mur de dette proche ou lignes non confirmées |
| 0 | Couverture < 3 mois, gap avéré, refinancement non sécurisé ou rupture prévisible |

#### D2.5 — Résistance au scénario de stress

DSCR minimal sous choc combiné seed (CA −10 %, marge −2 pts, taux +200 pb, DSO +15 j, change) — chocs définitifs calibrés sur l'historique et les stress BAM/internes (Directive 2/G/10).

**Poids :** TPE 2.00 % · PME 3.00 % · GE 4.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 1.00 % · PME 2.00 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 4.00 % · PME 3.00 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucun dépassement non autorisé |
| 75 | Un dépassement ≤ 3 jours et ≤ 5 % de la ligne, régularisé spontanément |
| 50 | 4–15 jours cumulés ou 2–3 épisodes, montant ≤ 10 % de la ligne |
| 25 | 16–30 jours cumulés, épisodes mensuels ou montant > 10 % |
| 0 | > 30 jours, dépassement permanent, compte bloqué ou absence d'autorisation |

#### D3.3 — Utilisation des lignes

Moyenne, maximum, saisonnalité et variation de l'utilisation des lignes confirmées. Une utilisation moyenne saine se situe entre 20 % et 70 %.

**Poids :** TPE 3.00 % · PME 2.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Utilisation moyenne 20–70 %, pics cohérents avec la saisonnalité, marge disponible |
| 75 | 10–20 % ou 70–85 %, utilisation stable et justifiée |
| 50 | 85–95 %, ou hausse > 20 points sur six mois, sans dépassement |
| 25 | > 95 % pendant plus de trois mois, pics fréquents ou dépendance au renouvellement |
| 0 | > 100 % non autorisé, ligne saturée sans capacité de réduction ou besoin structurel non financé |

#### D3.4 — Mouvements créditeurs et domiciliation

Mouvements créditeurs observés / flux attendus (%), tendance 12 mois et part des flux domiciliés. Virements circulaires et mouvements artificiels exclus.

**Poids :** TPE 4.00 % · PME 3.00 % · GE 1.50 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 4.00 % · PME 3.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Absence d'incident vérifiée auprès des sources autorisées |
| 75 | Un incident mineur, erreur technique démontrée, régularisé ≤ 5 jours |
| 50 | Un à deux incidents régularisés ≤ 30 jours, montant non matériel |
| 25 | Incidents récurrents, régularisation tardive ou incident matériel |
| 0 | Incident grave/non régularisé, interdiction ou signal bloquant selon dispositif applicable |

#### D3.6 — Restructuration et forbearance

**Poids :** TPE 2.00 % · PME 2.00 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucune restructuration ni concession liée à une difficulté financière |
| 75 | Restructuration ancienne > 36 mois, période probatoire achevée, performance durable |
| 50 | Restructuration entre 24 et 36 mois, paiements réguliers, surveillance en cours |
| 25 | Restructuration < 24 mois, concession significative ou dépendance à un moratoire |
| 0 | Échec de restructuration, seconde concession, impayé post-restructuration ou défaut |

#### D3.7 — Tendance de l'endettement système et groupe

Données centrale des risques et vision groupe, dans les limites légales.

**Poids :** TPE 2.00 % · PME 2.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 3.00 % · PME 3.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | S1 — secteur très résilient |
| 75 | S2 — secteur résilient |
| 50 | S3 — secteur moyen/cyclique maîtrisable |
| 25 | S4 — secteur vulnérable/sous surveillance |
| 0 | S5 — secteur très vulnérable/crise structurelle |

**Justificatifs requis :** Référentiel sectoriel interne daté et version.

#### D4.2 — Position concurrentielle

**Poids :** TPE 2.00 % · PME 2.50 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 2.50 % · PME 2.00 % · GE 1.50 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 2.00 % · PME 1.50 % · GE 1.50 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 2.00 % · PME 2.00 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | ≥ 12 mois de revenus sécurisés ou > 80 % récurrents avec rétention > 90 % ; contreparties solides |
| 75 | 9–12 mois ou 60–80 % récurrents ; annulations historiques faibles |
| 50 | 6–9 mois ou 40–60 % récurrents ; visibilité moyenne cohérente au secteur |
| 25 | 3–6 mois, carnet non ferme, churn élevé ou dépendance à appels d'offres non acquis |
| 0 | < 3 mois, annulations matérielles, carnet artificiel ou arrêt d'activité prévisible |

#### D4.6 — Exposition pays, change et matières premières

Exposition nette après couverture juridiquement efficace, rapportée à EBITDA/achats/CA.

**Poids :** TPE 1.00 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Exposition nette < 10 % de l'EBITDA ou couverture complète ; pays stables |
| 75 | Exposition 10–25 %, couverture > 75 %, répercussion prix démontrée |
| 50 | Exposition 25–50 %, couverture 50–75 %, volatilité absorbable |
| 25 | Exposition 50–100 %, couverture < 50 %, risque pays/transfert ou commodity matériel |
| 0 | Exposition > 100 % de l'EBITDA, aucune couverture, continuité menacée ou pays bloqué |

#### D4.7 — Risque opérationnel, technologie et capex

**Poids :** TPE 1.50 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Processus robustes, redondance, maintenance et assurance adéquates, capex financé, aucun incident matériel |
| 75 | Contrôles satisfaisants, dépendances connues et plans testés, capex maîtrisé |
| 50 | Contrôles moyens, quelques dépendances/sites uniques, capex nécessaire mais finançable |
| 25 | Outil vieillissant, incidents fréquents, sous-investissement, dépendance critique, assurance insuffisante |
| 0 | Arrêt majeur non résolu, technologie obsolète, perte de licence/certification ou capex vital non financé |

#### D4.8 — Qualité et soutenabilité de la croissance

**Poids :** TPE 1.00 % · PME 1.00 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Croissance rentable, financée majoritairement par cash-flow/fonds propres, BFR et capacités maîtrisés |
| 75 | Croissance rentable avec dette modérée, plan capacitaire et commercial prouvé |
| 50 | Croissance correcte mais dépendante de dette/BFR ; hypothèses raisonnables, mitigations identifiées |
| 25 | Croissance non rentable, BFR tendu, expansion trop rapide ou investissements sous-estimés |
| 0 | Croissance artificielle/circulaire, acquisitions non intégrées, destruction de cash ou plan irréaliste |

### D5 — Management, gouvernance et groupe

#### D5.1 — Expérience et stabilité du management

**Poids :** TPE 3.00 % · PME 2.50 % · GE 2.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Équipe complète, > 10 ans d'expérience pertinente, stabilité > 5 ans, succession en place, réalisations vérifiées |
| 75 | Expérience 5–10 ans, faible turnover, compétences adaptées et résultats cohérents |
| 50 | Expérience 3–5 ans ou changement récent maîtrisé ; quelques lacunes compensées |
| 25 | Équipe incomplète, turnover élevé, expérience limitée, objectifs régulièrement non atteints |
| 0 | Incompétence manifeste, départs critiques, information trompeuse ou incapacité à exploiter |

#### D5.2 — Dépendance homme-clé et succession

**Poids :** TPE 2.50 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Responsabilités distribuées, délégations formelles, successeurs identifiés et plan testé |
| 75 | Dépendance limitée ; adjoint compétent et documentation suffisante |
| 50 | Dépendance réelle mais remplaçable en 3–6 mois ; plan partiel |
| 25 | Dirigeant concentre clients, technique et pouvoirs ; absence de succession crédible |
| 0 | Indisponibilité de l'homme-clé compromettant immédiatement l'activité, sans solution |

#### D5.3 — Gouvernance et contrôle interne

**Poids :** TPE 2.00 % · PME 2.00 % · GE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Organes actifs et documentés, séparation des pouvoirs, audit/risques/conformité proportionnés |
| 75 | Gouvernance structurée, contrôles réguliers, incidents corrigés dans les délais |
| 50 | Gouvernance informelle mais fonctionnelle ; contrôles essentiels présents |
| 25 | Pouvoirs concentrés, contrôles faibles, recommandations récurrentes non clôturées |
| 0 | Absence de contrôle, fraude/irrégularité de gouvernance, décisions non autorisées |

#### D5.4 — Actionnariat, groupe et soutien

Note standalone conservée. Le support groupe n'améliore le grade que via la méthode dédiée (capacité + volonté + cadre juridique), jamais dans ce critère.

**Poids :** TPE 2.00 % · PME 1.50 % · GE 2.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Actionnariat stable et transparent ; parent très solide ; support juridiquement engageant ou historique incontestable |
| 75 | Actionnaires solides et impliqués ; soutien documenté mais non totalement contraignant |
| 50 | Actionnariat stable, capacité de soutien moyenne ou entité autonome sans besoin de support |
| 25 | Conflits, dilution probable, actionnaires endettés ou soutien incertain |
| 0 | Groupe en difficulté, ponctions de cash, litige actionnarial majeur ou opacité |

#### D5.5 — Stratégie et qualité d'exécution

**Poids :** TPE 2.00 % · PME 1.50 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Stratégie documentée et cohérente ; réalisations ≥ 90 % des budgets ajustés |
| 75 | Stratégie crédible ; réalisations 75–90 % ; écarts expliqués et corrigés |
| 50 | Plan raisonnable mais partiellement documenté ; réalisations 60–75 % |
| 25 | Plans fréquemment révisés, réalisations < 60 %, hypothèses trop optimistes |
| 0 | Absence de stratégie, budgets manipulés ou décisions menaçant la continuité |

#### D5.6 — Transactions avec parties liées

**Poids :** TPE 1.50 % · PME 1.50 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Transactions limitées, aux conditions de marché, approuvées, documentées et rapprochées |
| 75 | Transactions significatives mais transparentes, contractuelles et recouvrées normalement |
| 50 | Transactions fréquentes, documentation partielle, impact financier limité |
| 25 | Créances/avances importantes, prix non démontrés, cash-pooling défavorable |
| 0 | Détournement de ressources, créances irrécouvrables, garanties cachées ou transactions non autorisées |

#### D5.7 — Pilotage financier et culture du risque

**Poids :** TPE 2.00 % · PME 1.50 % · GE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Reporting mensuel fiable, cash forecast glissant, scénarios, limites et alertes formalisés |
| 75 | Reporting trimestriel fiable, budget/forecast et suivi de trésorerie réguliers |
| 50 | Reporting annuel/intermédiaire suffisant mais peu prospectif ; dépendance à l'expert-comptable |
| 25 | Pilotage tardif, absence de forecast, données contradictoires, réaction après incident |
| 0 | Aucun pilotage fiable, refus de transparence ou dissimulation de difficultés |

### D6 — Transparence et conformité

#### D6.1 — Qualité / certification des états financiers

**Poids :** TPE 1.50 % · PME 1.25 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Comptes audités/certifiés sans réserve matérielle ; ou TPE non soumise avec comptes rapprochés à fiabilité élevée |
| 75 | Opinion avec réserve non matérielle ou revue limitée solide ; écarts corrigés |
| 50 | Comptes non audités mais cohérents, documentés et rapprochés ; qualité moyenne |
| 25 | Réserves matérielles, nombreux retraitements ou périmètre incomplet |
| 0 | Comptes non fiables/refusés, soupçon de falsification ou continuité non reflétée |

#### D6.2 — Délai de production de l'information

Jours entre la clôture et la réception d'un dossier exploitable.

**Poids :** TPE 1.50 % · PME 1.00 % · GE 0.75 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 1.50 % · PME 1.00 % · GE 1.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 1.50 % · PME 1.00 % · GE 0.75 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Obligations à jour, aucune dette/litige matériel, certificats et documents valides |
| 75 | Retard mineur régularisé, contrôle courant sans enjeu matériel |
| 50 | Plan d'apurement respecté ou litige provisionné et maîtrisable |
| 25 | Arriérés/litige matériel, plan fragile, saisie ou risque de sanction significatif |
| 0 | Mesure d'exécution majeure, dette non soutenable, procédure menaçant l'activité ou document falsifié |

#### D6.5 — Transparence actionnariat et documents

**Poids :** TPE 1.00 % · PME 0.75 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Actionnariat, UBO, pouvoirs, groupe et engagements complets, à jour, vérifiés |
| 75 | Lacune mineure sans ambiguïté sur contrôle/pouvoirs, correction rapide |
| 50 | Documents partiels mais contrôle et structure raisonnablement établis |
| 25 | Chaîne de détention complexe/opaque, documents expirés ou hors bilan incomplet |
| 0 | UBO/pouvoirs impossibles à établir, faux document ou blocage KYC |

### D7 — ESG et climat

#### D7.1 — Risque climatique physique

**Poids :** TPE 1.00 % · PME 1.00 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Exposition faible vérifiée ou actifs résilients ; assurances et plans de continuité testés |
| 75 | Exposition modérée, mitigations financées, couverture assurance adéquate |
| 50 | Exposition matérielle mais cartographiée ; plan partiel et pertes absorbables |
| 25 | Exposition élevée (eau/chaleur/inondation/sécheresse), données ou mitigation insuffisantes |
| 0 | Actifs critiques menacés à court terme, sinistres récurrents, absence de solution viable |

#### D7.2 — Risque de transition

**Poids :** TPE 0.50 % · PME 0.75 % · GE 1.50 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Faible intensité/dépendance, réglementation anticipée, offre compatible avec la transition |
| 75 | Exposition modérée, investissements identifiés et finançables, capacité de répercussion |
| 50 | Exposition matérielle, trajectoire et budget partiels, risque absorbable |
| 25 | Forte dépendance énergie/carbone/réglementation, capex important non totalement financé |
| 0 | Modèle économique menacé, interdiction/obsolescence probable, aucun plan crédible |

#### D7.3 — Conformité environnementale et sociale

**Poids :** TPE 1.00 % · PME 0.75 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Autorisations à jour, absence d'incident matériel, système de gestion et indicateurs suivis |
| 75 | Écart mineur corrigé, contrôles adaptés et historique satisfaisant |
| 50 | Écarts modérés avec plan daté/financé ; aucun arrêt probable |
| 25 | Non-conformité matérielle, accident/litige, plan incomplet ou passif potentiel important |
| 0 | Autorisation retirée, fermeture/sanction grave, dommage majeur ou violation bloquante |

#### D7.4 — Gouvernance ESG et plan d'adaptation

**Poids :** TPE 0.50 % · PME 0.50 % · GE 1.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Responsabilités conseil/direction, données fiables, objectifs, budget, scénarios et suivi |
| 75 | Gouvernance formalisée et plan financé sur les risques matériels |
| 50 | Responsables identifiés, diagnostic initial et actions partielles |
| 25 | Approche réactive, données faibles, plan non chiffré ou sans propriétaire |
| 0 | Déni d'un risque matériel, aucune gouvernance, information trompeuse ou greenwashing démontré |

### Échelle de grades propre au modèle — STD-P-2026.1

Statut : provisoire. Aucune correspondance validée avec une autre échelle : ces grades ne sont comparables à ceux d'aucun autre modèle. L'échelle ne porte aucune décision indicative — la décision de crédit relève d'un moteur distinct.

| Grade | Score | Libellé |
|---|---|---|
| STD-P1 | ≥ 88 | Très solide |
| STD-P2 | [82 ; 88[ | Solide |
| STD-P3 | [76 ; 82[ | Bon |
| STD-P4 | [70 ; 76[ | Satisfaisant |
| STD-P5 | [64 ; 70[ | Acceptable |
| STD-P6 | [57 ; 64[ | Fragile |
| STD-P7 | [48 ; 57[ | Faible |
| STD-P8 | < 48 | Très faible |

Grades de défaut, communs aux modèles (un défaut est un état constaté) :

| Grade | Libellé | Critères d'entrée | Règle de guérison |
|---|---|---|---|
| DEF1 | Défaut par retard de paiement | Arriéré supérieur au seuil de matérialité approuvé, persistant au-delà du nombre de jours retenu par la définition du défaut applicable (seuil seed : 90 jours). Aucun élément d'improbabilité de paiement au-delà du retard lui-même. | Retour en sain après régularisation intégrale de l'arriéré et période probatoire continue sans nouvel incident (durée seed : 3 mois). Une rechute pendant la période probatoire ramène en défaut sans nouvelle période de grâce. |
| DEF2 | Défaut par improbabilité de paiement ou restructuration en difficulté | Improbabilité de paiement constatée : abandon de créance, provision spécifique matérielle, cession à perte, exécution de garantie. Restructuration accordée en raison de difficultés financières, ou seconde concession sur un même encours. Contagion appliquée selon la règle validée du régime applicable. | Retour en sain après période probatoire renforcée (durée seed : 12 mois) sans arriéré ni nouvelle concession, et suppression des éléments d'improbabilité de paiement. La décision de guérison est prise par l'instance de délégation compétente, jamais par le modèle. |
| DEF3 | Défaut par procédure collective ou contentieux | Ouverture d'une procédure de redressement, de sauvegarde ou de liquidation. Cessation d'activité constatée, ou passage en recouvrement contentieux. | Pas de guérison automatique : sortie uniquement sur décision formelle après clôture de la procédure et reconstitution d'un historique de paiement approuvé par l'instance compétente. |

### Exceptions non compensatoires

| Code | Situation | Plafond de grade | Contribution centrale | Source | Justification de l'effet incrémental |
|---|---|---|---|---|---|
| NC01 | Couverture du service de la dette inférieure à 1 en scénario de base | pas mieux que STD-P7 | D2.2 | CREDIT_POLICY | Une incapacité à couvrir le service de la dette en scénario de base n'est compensable ni par la gouvernance ni par un secteur porteur : le défaut survient par manque de trésorerie à l'échéance, quelles que soient les autres qualités du dossier. L'effet incrémental par rapport au score de D2.2 reste à mesurer sur défauts observés. |
| NC02 | Incertitude matérielle sur la continuité d'exploitation | pas mieux que STD-P7 | D6.1 | CREDIT_POLICY | Une réserve d'auditeur sur la continuité d'exploitation porte une information que les ratios ne contiennent pas encore : elle synthétise un jugement professionnel sur des éléments prospectifs. Son pouvoir prédictif non linéaire est largement documenté ; l'effet incrémental reste à mesurer localement. |
| NC03 | Excédent brut d'exploitation négatif deux années sur trois | pas mieux que STD-P7 | D1.2 | CREDIT_POLICY | La persistance distingue un accident d'exercice d'un modèle économique qui ne dégage pas d'excédent. Le critère D1.2 note le niveau du dernier exercice ; il ne capture pas la répétition, qui est précisément ce qui rend le redressement improbable sans apport externe. |
| NC04 | Dossier groupe incomplet alors que le groupe est matériel | pas mieux que STD-P6 | D5.4 | CREDIT_POLICY | Contrairement aux autres insuffisances d'information, celle-ci porte sur un périmètre de consolidation entier et non sur une variable isolée : la porte de couverture, qui raisonne critère par critère, ne la détecte pas. Sans vision groupe, ni la contagion ni les sorties de trésorerie ne sont appréciables. |

### Classe de confiance et porte de couverture

Confiance = 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance.

La classe de confiance ne plafonne pas le grade : elle est restituée à côté de lui. Sous la classe minimale (C), aucun grade n'est produit.

| Score de confiance | Classe | Effet |
|---|---|---|
| ≥ 85 | A — Élevée — estimation robuste | grade produit, classe restituée à côté du grade |
| [70 ; 85[ | B — Moyenne — estimation utilisable avec réserve | grade produit, classe restituée à côté du grade |
| [55 ; 70[ | C — Faible — estimation fragile, à compléter | grade produit, classe restituée à côté du grade |
| [0 ; 55[ | U — Insuffisante — aucun grade produit | aucun grade produit : dossier non notable en l'état |

Couverture minimale exigée : 60 % du poids total porté par une donnée observée, et 30 % par domaine. Une estimation ne compte pas comme une observation.

### Red flags

| Code | Signal | Niveau | Source | Traitement |
|---|---|---|---|---|
| RF01 | Identité/UBO/pouvoirs impossibles à valider | BLOCK | COMPLIANCE | Statut conformité BLOQUÉ : pas d'entrée en relation. La notation d'une exposition existante reste produite pour la surveillance. |
| RF02 | Sanction ou interdiction issue du système conformité autoritatif | BLOCK | COMPLIANCE | Décision Conformité appliquée telle quelle, jamais diluée dans le score |
| RF03 | Fraude ou falsification documentaire confirmée | BLOCK | COMPLIANCE | Escalade fraude/juridique et audit ; fiabilité des données à réexaminer intégralement |
| RF04 | Activité interdite par politique ou loi | BLOCK | CREDIT_POLICY | Rejet/routage selon politique de crédit |
| RF05 | Liquidation, cessation ou procédure incompatible avec le going concern | DEFAULT_CHECK | CREDIT_POLICY | Évaluation défaut DEF3 par le moteur dédié |
| RF06 | DPD ≥ seuil de défaut, UTP ou cross-default | DEFAULT_CHECK | CREDIT_POLICY | Évaluer défaut, contagion, IFRS 9 et classification BAM séparément |
| RF07 | DPD 31–89 jours ou incident matériel récurrent | REFER | CREDIT_POLICY | Revue risque, watchlist et augmentation significative du risque éventuelles |
| RF08 | Échec de restructuration ou seconde concession | DEFAULT_CHECK | CREDIT_POLICY | Défaut DEF2 / forbearance selon la politique validée |
| RF09 | Fonds propres négatifs et aucun plan ferme | REFER | CREDIT_POLICY | Revue ; la contribution au risque est portée par D1.4, sans plafond additionnel |
| RF10 | Opinion audit défavorable / refus de certifier | REFER | CREDIT_POLICY | Selon matérialité et fiabilité des comptes |
| RF11 | Dette fiscale/sociale ou saisie matérielle | REFER | CREDIT_POLICY | Quantifier, vérifier plan d'apurement et rang de paiement |
| RF12 | Litige menaçant la continuité | REFER | CREDIT_POLICY | Scénario de perte et avis juridique |
| RF13 | Perte d'un client/fournisseur/licence vital | REFER | CREDIT_POLICY | Reprévision et stress immédiats |
| RF14 | Covenant rompu non régularisé | REFER | CREDIT_POLICY | Vérifier exigibilité anticipée et waiver |
| RF15 | Transactions liées ou sortie de cash inexpliquée | REFER | CREDIT_POLICY | Investigation des flux avec parties liées |
| RF16 | Information critique manquante/incohérente | REFER | MODEL | Traité par la porte de couverture : sous le seuil, aucun grade n'est produit |
| RF17 | Risque climatique/ESG avec fermeture probable | REFER | CREDIT_POLICY | Scénario sectoriel et plan d'adaptation |
| RF18 | Contagion groupe réglementaire/politique | DEFAULT_CHECK | REGULATORY | Appliquer uniquement la règle validée du régime applicable |

## Modèle TPE comportemental — CORP_TPE_BEHAV_V1

Identifiant `CORP_TPE_BEHAV_V1` · version 3.0.0 · statut DRAFT_EXPERT_SEED · date d'effet 2026-09-17.

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

**Poids :** TPE 6.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Utilisation moyenne 20–70 %, pics cohérents, marge disponible |
| 75 | 10–20 % ou 70–85 %, utilisation stable et justifiée |
| 50 | 85–95 % ou hausse > 20 points sur six mois, sans dépassement |
| 25 | > 95 % pendant plus de trois mois ou dépendance au renouvellement |
| 0 | > 100 % non autorisé ou besoin structurel non financé |

#### B1.5 — Chèques/effets et incidents externes autorisés

**Poids :** TPE 5.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 5.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Aucun jour débiteur non autorisé, solde de sécurité > 30 jours de charges |
| 75 | ≤ 3 jours débiteurs et solde > 20 jours de charges |
| 50 | 4–15 jours débiteurs et solde > 10 jours de charges |
| 25 | 16–30 jours débiteurs ou solde < 10 jours de charges |
| 0 | > 30 jours débiteurs ou rupture de trésorerie |

#### B2.4 — Saisonnalité et résistance à un choc de flux

Couverture du service de dette après choc de flux −20 %.

**Poids :** TPE 4.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

| Score | Bande |
|---:|---|
| 100 | ≥ 1.3x |
| 75 | [1.15x ; 1.3x[ |
| 50 | [1x ; 1.15x[ |
| 25 | [0.8x ; 1x[ |
| 0 | < 0.8x |

### B3 — Activité

#### B3.1 — Risque sectoriel

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | S1 — secteur très résilient |
| 75 | S2 — secteur résilient |
| 50 | S3 — secteur moyen/cyclique maîtrisable |
| 25 | S4 — secteur vulnérable/sous surveillance |
| 0 | S5 — secteur très vulnérable/crise structurelle |

#### B3.2 — Ancienneté et continuité de l'activité

**Poids :** TPE 3.00 % · **Nature :** quantitatif · **politique en cas d'absence : 25**

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
| `UNDER_2Y_NO_SUPPORT` | Moins de deux ans d'activité sans support ni contrat structurant (le dossier est routé hors grille : voir la route jeune entreprise) | 0 |

#### B3.3 — Concentration clients/fournisseurs

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Concentration très faible, alternatives disponibles |
| 75 | Concentration faible, contrats sécurisés |
| 50 | Concentration moyenne, substituabilité raisonnable |
| 25 | Concentration élevée ou dépendance difficilement remplaçable |
| 0 | Concentration critique, mono-client ou mono-source vital |

#### B3.4 — Marge brute ou proxy vérifié

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | ≥ P75 secteur, rapprochée des flux |
| 75 | P50–P75 |
| 50 | P25–P50 |
| 25 | P10–P25 |
| 0 | < P10, négative ou non fiable |

#### B3.5 — Contrats, commandes et récurrence

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Revenus fortement sécurisés ou récurrents, contreparties solides |
| 75 | Bonne visibilité, annulations faibles |
| 50 | Visibilité moyenne cohérente avec le secteur |
| 25 | Faible visibilité, carnet non ferme ou churn élevé |
| 0 | Aucune visibilité, carnet artificiel ou arrêt prévisible |

### B4 — Management

#### B4.1 — Expérience du dirigeant

**Poids :** TPE 4.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | > 10 ans d'expérience pertinente, réalisations vérifiées |
| 75 | 5–10 ans, résultats cohérents |
| 50 | 3–5 ans ou reprise récente maîtrisée |
| 25 | Expérience limitée, objectifs non atteints |
| 0 | Incompétence manifeste ou information trompeuse |

#### B4.2 — Dépendance homme-clé

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Responsabilités distribuées, relais opérationnels en place |
| 75 | Dépendance limitée, adjoint compétent |
| 50 | Dépendance réelle mais remplaçable en 3–6 mois |
| 25 | Dirigeant concentre tout, succession absente |
| 0 | Indisponibilité compromettant immédiatement l'activité |

#### B4.3 — Organisation et contrôles minimums

**Poids :** TPE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Organisation claire, contrôles essentiels effectifs |
| 75 | Organisation correcte, quelques contrôles informels |
| 50 | Organisation informelle mais fonctionnelle |
| 25 | Contrôles faibles, incidents récurrents |
| 0 | Absence de contrôle ou irrégularités |

#### B4.4 — Succession / continuité

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Succession identifiée et plan testé |
| 75 | Relais crédible identifié |
| 50 | Plan partiel |
| 25 | Aucune succession crédible |
| 0 | Continuité immédiatement menacée |

### B5 — Transparence et conformité

#### B5.1 — Documents et autorisations

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

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

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Obligations à jour, aucun arriéré |
| 75 | Retard mineur régularisé |
| 50 | Plan d'apurement respecté |
| 25 | Arriérés matériels ou plan fragile |
| 0 | Dette non soutenable ou mesure d'exécution majeure |

#### B5.4 — Actionnariat / UBO / KYC

**Poids :** TPE 2.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | UBO et pouvoirs complets et vérifiés |
| 75 | Lacune mineure sans ambiguïté |
| 50 | Structure raisonnablement établie |
| 25 | Chaîne de détention opaque |
| 0 | UBO impossible à établir ou blocage KYC |

### B6 — Groupe / support

#### B6.1 — Groupe, garant et soutien démontré

**Poids :** TPE 5.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Support juridiquement engageant d'un tiers très solide, historique démontré |
| 75 | Soutien documenté mais non totalement contraignant |
| 50 | Entité autonome sans besoin de support |
| 25 | Soutien incertain ou garant lui-même fragile |
| 0 | Groupe en difficulté, ponctions de cash ou soutien promis non honoré |

### B7 — ESG / climat

#### B7.1 — Risques ESG/climat matériels

**Poids :** TPE 3.00 % · **Nature :** qualitatif ancré · **politique en cas d'absence : 25**

| Score | Ancrage et preuves attendues |
|---:|---|
| 100 | Exposition faible vérifiée |
| 75 | Exposition modérée, mitigations en place |
| 50 | Exposition matérielle cartographiée, plan partiel |
| 25 | Exposition élevée, mitigation insuffisante |
| 0 | Activité menacée à court terme sans solution viable |

### Échelle de grades propre au modèle — TPE-B-2026.1

Statut : provisoire. Aucune correspondance validée avec une autre échelle : ces grades ne sont comparables à ceux d'aucun autre modèle. L'échelle ne porte aucune décision indicative — la décision de crédit relève d'un moteur distinct.

| Grade | Score | Libellé |
|---|---|---|
| TPE-B1 | ≥ 85 | Comportement très sain |
| TPE-B2 | [76 ; 85[ | Comportement sain |
| TPE-B3 | [68 ; 76[ | Comportement acceptable |
| TPE-B4 | [60 ; 68[ | Tensions ponctuelles |
| TPE-B5 | [50 ; 60[ | Tensions installées |
| TPE-B6 | < 50 | Comportement très dégradé |

Grades de défaut, communs aux modèles (un défaut est un état constaté) :

| Grade | Libellé | Critères d'entrée | Règle de guérison |
|---|---|---|---|
| DEF1 | Défaut par retard de paiement | Arriéré supérieur au seuil de matérialité approuvé, persistant au-delà du nombre de jours retenu par la définition du défaut applicable (seuil seed : 90 jours). Aucun élément d'improbabilité de paiement au-delà du retard lui-même. | Retour en sain après régularisation intégrale de l'arriéré et période probatoire continue sans nouvel incident (durée seed : 3 mois). Une rechute pendant la période probatoire ramène en défaut sans nouvelle période de grâce. |
| DEF2 | Défaut par improbabilité de paiement ou restructuration en difficulté | Improbabilité de paiement constatée : abandon de créance, provision spécifique matérielle, cession à perte, exécution de garantie. Restructuration accordée en raison de difficultés financières, ou seconde concession sur un même encours. Contagion appliquée selon la règle validée du régime applicable. | Retour en sain après période probatoire renforcée (durée seed : 12 mois) sans arriéré ni nouvelle concession, et suppression des éléments d'improbabilité de paiement. La décision de guérison est prise par l'instance de délégation compétente, jamais par le modèle. |
| DEF3 | Défaut par procédure collective ou contentieux | Ouverture d'une procédure de redressement, de sauvegarde ou de liquidation. Cessation d'activité constatée, ou passage en recouvrement contentieux. | Pas de guérison automatique : sortie uniquement sur décision formelle après clôture de la procédure et reconstitution d'un historique de paiement approuvé par l'instance compétente. |

### Exceptions non compensatoires

Aucune exception. Toutes les contributions sont continues : aucun effet marginal n'a à être isolé pour calibrer la grille.

### Classe de confiance et porte de couverture

Confiance = 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance.

La classe de confiance ne plafonne pas le grade : elle est restituée à côté de lui. Sous la classe minimale (B), aucun grade n'est produit.

| Score de confiance | Classe | Effet |
|---|---|---|
| ≥ 85 | A — Élevée — estimation robuste | grade produit, classe restituée à côté du grade |
| [70 ; 85[ | B — Moyenne — estimation utilisable avec réserve | grade produit, classe restituée à côté du grade |
| [55 ; 70[ | C — Faible — estimation fragile, à compléter | grade produit, classe restituée à côté du grade |
| [0 ; 55[ | U — Insuffisante — aucun grade produit | aucun grade produit : dossier non notable en l'état |

Couverture minimale exigée : 70 % du poids total porté par une donnée observée, et 40 % par domaine. Une estimation ne compte pas comme une observation.

### Red flags

| Code | Signal | Niveau | Source | Traitement |
|---|---|---|---|---|
| RF01 | Identité/UBO/pouvoirs impossibles à valider | BLOCK | COMPLIANCE | Statut conformité BLOQUÉ : pas d'entrée en relation. La notation d'une exposition existante reste produite pour la surveillance. |
| RF02 | Sanction ou interdiction issue du système conformité autoritatif | BLOCK | COMPLIANCE | Décision Conformité appliquée telle quelle, jamais diluée dans le score |
| RF03 | Fraude ou falsification documentaire confirmée | BLOCK | COMPLIANCE | Escalade fraude/juridique et audit ; fiabilité des données à réexaminer intégralement |
| RF04 | Activité interdite par politique ou loi | BLOCK | CREDIT_POLICY | Rejet/routage selon politique de crédit |
| RF05 | Liquidation, cessation ou procédure incompatible avec le going concern | DEFAULT_CHECK | CREDIT_POLICY | Évaluation défaut DEF3 par le moteur dédié |
| RF06 | DPD ≥ seuil de défaut, UTP ou cross-default | DEFAULT_CHECK | CREDIT_POLICY | Évaluer défaut, contagion, IFRS 9 et classification BAM séparément |
| RF07 | DPD 31–89 jours ou incident matériel récurrent | REFER | CREDIT_POLICY | Revue risque, watchlist et augmentation significative du risque éventuelles |
| RF08 | Échec de restructuration ou seconde concession | DEFAULT_CHECK | CREDIT_POLICY | Défaut DEF2 / forbearance selon la politique validée |
| RF09 | Fonds propres négatifs et aucun plan ferme | REFER | CREDIT_POLICY | Revue ; la contribution au risque est portée par D1.4, sans plafond additionnel |
| RF10 | Opinion audit défavorable / refus de certifier | REFER | CREDIT_POLICY | Selon matérialité et fiabilité des comptes |
| RF11 | Dette fiscale/sociale ou saisie matérielle | REFER | CREDIT_POLICY | Quantifier, vérifier plan d'apurement et rang de paiement |
| RF12 | Litige menaçant la continuité | REFER | CREDIT_POLICY | Scénario de perte et avis juridique |
| RF13 | Perte d'un client/fournisseur/licence vital | REFER | CREDIT_POLICY | Reprévision et stress immédiats |
| RF14 | Covenant rompu non régularisé | REFER | CREDIT_POLICY | Vérifier exigibilité anticipée et waiver |
| RF15 | Transactions liées ou sortie de cash inexpliquée | REFER | CREDIT_POLICY | Investigation des flux avec parties liées |
| RF16 | Information critique manquante/incohérente | REFER | MODEL | Traité par la porte de couverture : sous le seuil, aucun grade n'est produit |
| RF17 | Risque climatique/ESG avec fermeture probable | REFER | CREDIT_POLICY | Scénario sectoriel et plan d'adaptation |
| RF18 | Contagion groupe réglementaire/politique | DEFAULT_CHECK | REGULATORY | Appliquer uniquement la règle validée du régime applicable |

---

# Partie IV — Référentiels marocains

Le diagnostic reprochait à la version 2 d'importer des libellés de référentiels étrangers — EBITDA, current ratio, dette nette — sans les relier au Code Général de Normalisation Comptable ni aux pratiques de financement réellement observées. Deux analystes pouvaient calculer deux ratios différents sur le même bilan.

## 15. Dictionnaire comptable CGNC

Sept grandeurs sont définies une fois pour toutes, consommées par les critères et **affichées à l'analyste au moment de la saisie** — la définition n'est plus enfouie dans une note. Statut : proposition à valider conjointement Finance et Risques.

| Grandeur | Point de vigilance marocain |
|---|---|
| Excédent brut d'exploitation retraité | Réintégration des redevances de crédit-bail, rémunération normative du dirigeant, exclusion des produits non courants ; rapprochement avec la capacité d'autofinancement |
| Comptes courants d'associés | **Trois catégories** : remboursable à vue, bloqué non subordonné, contractuellement subordonné. Seule la troisième vaut quasi-fonds propres. Ce poste représente 44,5 % du financement des micro-entreprises et 30,7 % de celui des TPE : son classement détermine à lui seul le levier et la solvabilité affichés |
| Dette financière nette économique | Crédit-bail actualisé, affacturage avec recours, financements participatifs selon leur substance, dette système de la Centrale des Risques ; trésorerie nantie exclue |
| Service de la dette à 12 mois | Échéances ballon et in fine comptées intégralement, convention documentée pour le revolving. Un service partiel est la première cause de surestimation de la capacité de remboursement |
| Créances publiques et crédit de TVA | Isolées du poste clients, avec ancienneté, délai observé et décote de liquidité. Une créance certaine n'est pas un encaissement disponible |
| Fonds propres tangibles | Déduction des non-valeurs, incorporels non cessibles, réévaluations non liquides et créances sur associés |
| Flux bancaires nettoyés et taux de capture | Exclusion des décaissements de prêts, virements circulaires, apports d'associés, produit d'affacturage et transferts entre banques. Le taux de capture alimente la **fiabilité**, pas le score de risque |

## 16. Référentiel sectoriel NMA 2010 × région

La structure existe, avec ses contrôles : code NMA 2010, région, grade sectoriel S1–S5, effectif ayant servi à l'établir, période d'observation, source, date d'effet, percentiles de marge et de levier, et matérialité ESG par secteur.

Elle est livrée **non alimentée**, et c'est un choix assumé : le peuplement suppose les distributions OMTPME, celles du portefeuille de la banque et une gouvernance sectorielle — trois éléments qui n'appartiennent pas au code. Un effectif minimal de trente dossiers est exigé pour qu'un grade sectoriel soit opposable ; en deçà, un repli national explicite s'applique. Tant que le référentiel est vide, le grade sectoriel est traité comme une donnée indisponible et déclenche la catégorie prudente : l'absence devient visible au lieu de se dissoudre dans un score moyen.

## 17. Bibliothèque de scénarios de stress

La version 2 appliquait un choc combiné unique à toutes les contreparties : chiffre d'affaires −10 %, marge −2 points, taux +200 points de base. Un tel choc ne décrit ni une sécheresse pour un producteur du Souss, ni une saison touristique manquée à Marrakech, ni un retard de certification sur un marché public.

Cinq familles de scénarios différenciés sont déclarées, avec leur périmètre d'application et leurs chocs : stress hydrique et rendement agricole ; choc de demande touristique ; allongement des délais sur marchés publics ; choc de change et d'énergie pour les importateurs ; contrainte carbone à l'export. La sévérité de chaque choc reste à calibrer sur l'historique — les scénarios portent le statut `SEED_A_CALIBRER`.

## 18. Flux bancaires des TPE

Trois changements issus du diagnostic :

- **fenêtre d'observation portée de 12 à 24 mois, cible 36.** Douze mois ne couvrent qu'une seule saison : sur un hôtel, une exploitation agricole ou un commerce dépendant du Ramadan, un exercice observé sur douze mois glissants peut décrire une saison exceptionnelle ou une saison manquée sans qu'on puisse les distinguer ;
- **règles de nettoyage explicites**, inscrites au dictionnaire CGNC ;
- **taux de capture bancaire distingué du risque.** Une faible domiciliation n'est pas une faible activité : le taux de capture alimente la fiabilité de l'estimation, non le score.

## 19. Matérialité ESG

Le domaine ESG pesait de 3 à 5 % et s'appliquait uniformément. La version 3 conditionne les deux critères réellement dépendants de l'exposition — risque physique et risque de transition — à une **porte de matérialité** alimentée par le référentiel sectoriel et la localisation des sites, jamais par le jugement libre de l'analyste. Lorsque le risque n'est pas matériel, le poids est transféré au critère receveur nommé dans la configuration, et le poids total reste constant.

La conformité environnementale et la gouvernance d'adaptation restent évaluées pour tous : elles sont universelles, contrairement à l'exposition.

---

# Partie V — L'outil

## 20. Architecture et statuts

Le noyau de risque reste pur : `src/core/` n'importe ni framework web, ni couche d'accès aux données, ni bibliothèque de fournisseur. La notation possède un point d'entrée unique, dont la version est estampillée dans chaque résultat.

Cinq moteurs sont distingués ; **un seul est implémenté**. L'outil l'affirme dans le contrat d'interface, dans l'écran de résultat et dans la page méthodologie, plutôt que de laisser un champ vide suggérer un oubli.

## 21. Interface de programmation

| Contrôle | État en version 3 |
|---|---|
| Droits d'usage | `purpose`, `calibrationStatus`, `pdDisclosed`, usages autorisés et restrictions portés par chaque résultat et par chaque événement sortant |
| Probabilité de défaut | `pd12m` nul hors bac à sable ; le statut de calibration reste visible pour expliquer l'absence |
| Idempotence | Clé liée au **contenu** : une même clé présentée avec un payload différent lève un conflit explicite, au lieu de renvoyer silencieusement le résultat d'un autre dossier |
| Échelles | `gradeScaleId` porté par le résultat ; deux grades d'échelles différentes ne sont pas comparables sans correspondance validée |
| Statuts | Cinq statuts distincts exposés séparément |
| Erreurs | Format normalisé RFC 9457, sans trace d'exécution |

## 22. Parcours utilisateur

Le formulaire reste **généré depuis la version de modèle publiée**. Il affiche désormais, pour chaque critère, la politique appliquée en cas d'information absente — blocage ou catégorie prudente — et la définition CGNC de la grandeur demandée.

L'écran de résultat restitue séparément : le grade moteur, le grade autonome, le grade après support groupe, la classe de confiance, la couverture observée, les exceptions appliquées avec leur contribution centrale, les cinq statuts, et les droits d'usage.

## 23. Sécurité et exploitation

Les constats de sécurité relevés par le diagnostic — authentification par fournisseur d'identité, mTLS, contrôle d'accès par attributs, coffre à secrets, supervision, tests d'intrusion, registre des traitements — **n'ont pas été traités dans cette version** : ils relèvent de l'infrastructure de la banque et d'un programme de sécurité, non de la conception du modèle. Ils figurent en annexe B avec leur condition de levée. Le dispositif existant conserve ses garde-fous : aucun secret par défaut, empreintes de clés, comparaison en temps constant, audit transactionnel, validation stricte des entrées, limitation de débit.

## 24. Tests et preuves d'exécution

| Contrôle | Résultat |
|---|---|
| Contrôle de types | 0 erreur |
| Analyse statique | 0 erreur |
| Tests | 165 tests, 165 passés |
| Vérificateur d'alignement base ↔ code ↔ contrat ↔ interface ↔ documentation | aucune divergence |
| Construction de production | réussie |

La suite de tests couvre désormais explicitement les constats : constance du poids total, impossibilité qu'une information absente améliore un score, refus d'une non-applicabilité non déclarée, porte de couverture, indépendance du grade et de la confiance, précédence des exceptions après le grade moteur, routage, séparation des statuts, non-comparabilité des échelles, non-exposition de la probabilité de défaut, méthode de support groupe, matérialité ESG.

---

# Partie VI — Calibration sur portefeuille simulé

## 25. Ce que l'exercice établit, et ce qu'il n'établit pas

La chaîne de calibration a été réexécutée intégralement sur les échelles de la version 3, pour les deux modèles. **L'objet n'est pas d'obtenir des probabilités** : il est de vérifier que la chaîne fonctionne, que l'échelle ordonne correctement le risque, et que la batterie de validation sait détecter un défaut de calibration. Les scores ne sont pas simulés : le simulateur produit des données d'entrée, et c'est le moteur réel qui en tire un score et un grade.

## 26. Résultats

| Modèle standard | Effectif | PD | | Modèle comportemental | Effectif | PD |
|---|---:|---:|---|---|---:|---:|
| STD-P1 | 1 448 | 0,158 % | | TPE-B1 | 1 645 | 0,479 % |
| STD-P2 | 1 964 | 0,325 % | | TPE-B2 | 2 112 | 1,263 % |
| STD-P3 | 2 688 | 0,708 % | | TPE-B3 | 2 046 | 2,888 % |
| STD-P4 | 2 962 | 1,304 % | | TPE-B4 | 1 602 | 5,474 % |
| STD-P5 | 2 853 | 2,266 % | | TPE-B5 | 1 304 | 9,726 % |
| STD-P6 | 2 668 | 4,002 % | | TPE-B6 | 910 | 24,698 % |
| STD-P7 | 2 458 | 7,893 % | | | | |
| STD-P8 | 1 923 | 16,110 % | | | | |

Pouvoir discriminant : Gini 0,618 en développement, 0,619 hors échantillon, 0,642 hors période pour le modèle standard ; 0,623 / 0,584 / 0,592 pour le modèle comportemental.

## 27. Trois enseignements

**Les points de masse ont disparu.** En version 2, deux grades concentraient la moitié du portefeuille et le score moyen n'était pas monotone dans l'échelle, parce que le plafond de confiance y déversait des dossiers bien notés. La suppression de ce plafond et la réduction du nombre de grades produisent une distribution régulière et une progression de probabilité de défaut strictement monotone sur les deux modèles.

**Plus aucun grade n'est indistinguable.** La version 2 fusionnait G6 et G7 sur le modèle comportemental : la régression isotone leur attribuait la même probabilité, et la comparaison des deux proportions ne rejetait pas l'égalité. Sur les échelles de la version 3, aucune fusion n'apparaît — le contrôle est automatisé et vert.

**Les deux modèles ne sont pas équivalents, et cela se mesure.** Le meilleur grade du modèle standard porte une probabilité de 0,16 %, celui du modèle comportemental 0,48 % — trois fois plus. Le pire grade : 16,1 % contre 24,7 %. Afficher le même libellé pour les deux échelles aurait affirmé une équivalence que les données contredisent. C'est la justification empirique du constat C03.

Ces trois résultats portent sur des **données simulées**. Ils valident la chaîne, pas le niveau du risque.

---

# Partie VII — Gouvernance et feuille de route

## 28. Portes de décision

La trajectoire du diagnostic est conservée. Cette version livre l'essentiel du contenu de la porte P1 et une partie de P2.

| Porte | Objet | État |
|---|---|---|
| P0 — Sécuriser | Restrictions d'usage, paquet de preuve, corpus, gouvernance | Restrictions d'usage **techniquement imposées** ; paquet de preuve à produire ; corpus et gouvernance à la banque |
| P1 — Refondre | Routage, données, échelles, ordre de calcul, double comptage, CGNC, interface | **Livré** dans cette version |
| P2 — Construire | Moteur remédié, ingestion, identité/groupe, qualité de données, tests, observabilité | Moteur et tests livrés ; ingestion, service d'identité et observabilité à construire |
| P3 — Piloter | Mode fantôme TPE/PME, double notation, accord inter-analystes | À conduire |
| P4 — Calibrer | Historique, reconstruction, champion/challenger, validation hors période | À conduire — condition de toute probabilité de défaut |
| P5 — Réglementer | Moteurs classification, IFRS 9, actifs pondérés | À construire après validation du corpus |
| P6 — Déployer | Déploiement progressif, limites, surveillance, alerte précoce | À conduire |

## 29. Décisions demandées

1. Prendre acte que les huit constats critiques sont traités dans la conception, et mandater la revue indépendante de niveau E3 qui seule peut le confirmer sur pièces.
2. Valider ou corriger les arbitrages structurants du journal des décisions, notamment : grades de défaut communs, granularité provisoire à huit et six grades, seuils de couverture, route jeune entreprise.
3. Confirmer les seuils de segmentation sur le corpus Bank Al-Maghrib applicable, avec date d'effet — ils restent non opposables.
4. Approuver la politique de défaut, de guérison et de rechute proposée.
5. Approuver le dictionnaire CGNC et les conventions de retraitement, conjointement Finance et Risques.
6. Financer le peuplement du référentiel sectoriel NMA 2010 × région et la bibliothèque de scénarios.
7. Décider du traitement des jeunes entreprises, aujourd'hui routées hors grille.
8. Maintenir l'interdiction de toute probabilité de défaut, master scale commune ou usage réglementaire avant calibration sur défauts observés et validation indépendante.

---

# Annexes

## Annexe A — Vecteurs de contrôle

Exacts et vérifiables par exécution ; ils constituent le socle de non-régression du moteur.

| # | Objet | Attendu |
|---|---|---|
| 1 | Agrégation du domaine D1 sur TPE, scores 75/50/50/75/50/75/50/50 | 61,00 |
| 2 | Agrégation globale TPE, domaines 61/50/75/50/75/75/50 | 64,50 → STD-P5 |
| 3 | Poids total appliqué, avec ou sans donnée manquante | 10 000 points de base dans les deux cas |
| 4 | Effacement d'un critère à 50 | score strictement inférieur ; jamais supérieur |
| 5 | Couverture du service de dette < 1 en base | grade moteur STD-P5 inchangé, grade autonome STD-P7, score brut conservé |
| 6 | Confiance ramenée de 100 à 75 | grade **inchangé**, classe B |
| 7 | Confiance à 25 | aucun grade, score brut 64,50 conservé |
| 8 | Bornes du levier TPE | 1,0 → 100 ; 1,0001 → 75 ; 2,0 → 75 ; 2,0001 → 50 ; 3,5 → 50 ; 3,5001 → 25 ; 5,0 → 25 ; 5,0001 → 0 |
| 9 | Support groupe, quatre conditions réunies, quatre crans demandés | deux crans appliqués, note autonome conservée |
| 10 | Risque physique non matériel | poids de D7.1 transféré à D7.3, poids du domaine inchangé |
| 11 | Notation hors bac à sable | probabilité de défaut nulle, finalité PILOT_SHADOW |

## Annexe B — Constats non traités dans cette version

| Réf. | Constat | Motif | Condition de levée |
|---|---|---|---|
| C01 | Revue indépendante du code et des preuves | Une revue indépendante ne peut pas être conduite par l'auteur du code | Mandat de revue E3 sur le dépôt et l'environnement de la banque |
| C05 | Moteurs classification, IFRS 9, actifs pondérés | Supposent le corpus Bank Al-Maghrib autoritatif, non disponible. Coder une règle réglementaire sans son texte serait exactement le défaut que le diagnostic reproche | Obtention du corpus, matrice article-règle-test, validation Juridique |
| H04 / H08 | Peuplement du référentiel sectoriel et des scénarios | Suppose les distributions OMTPME et du portefeuille, et une gouvernance sectorielle | Publication des distributions, comité sectoriel |
| H10 | Sécurité : OIDC, mTLS, contrôle par attributs, coffre, supervision, tests d'intrusion, registre CNDP | Relève de l'infrastructure et d'un programme de sécurité | Programme de sécurité et raccordement au fournisseur d'identité |
| H11 | Certification multi-bases sur instances réelles | Aucune instance MySQL, SQL Server ou Oracle disponible | Mise à disposition des environnements |
| H13 | Imports de masse, connecteurs, alerte précoce | Supposent les systèmes sources et leurs conventions d'échange | Cadrage des interfaces avec la DSI |
| M02 | Objectifs de reprise, haute disponibilité, exercices de restauration | Relève de l'exploitation | Programme de production |
| M03 | Accord inter-analystes | Suppose un pilote et des dossiers étalons | Porte P3 |
| M04 | Interface arabe et droite-à-gauche | Chantier d'internationalisation complet | Priorisation produit |
| A.3 | Ré-estimation des pondérations | Aucune donnée observée. Optimiser des poids sur des données simulées produirait les poids du simulateur, pas ceux du risque | Porte P4 |

## Annexe C — Ce qui reste vrai de la version 2

Les fondements conservés : séparation des cinq finalités, grilles discrètes 0/25/50/75/100, explicabilité par contribution, conservation du score brut, versionnement et rejouabilité, horodatage métier distinct du temps système, dérogation sous double validation, moteur pur et déterministe, configuration entièrement externalisée, source de schéma unique multi-dialecte.

**Conclusion.** Cette version corrige la conception là où le diagnostic a montré qu'elle produisait des résultats trompeurs ou incalibrables. Elle ne rapproche pas le dispositif d'un usage réglementaire : elle le rend honnête sur ce qu'il mesure, et calibrable le jour où l'historique existera. La décision prudente reste celle du diagnostic — remédier, piloter en parallèle, valider indépendamment, puis déployer progressivement.
