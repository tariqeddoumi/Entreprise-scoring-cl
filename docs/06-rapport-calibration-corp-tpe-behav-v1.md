# Rapport de calibration — CORP_TPE_BEHAV_V1

*Modèle TPE comportemental — flux bancaires et informations alternatives*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_TPE_BEHAV_V1-SYNTH-20260824` · modèle CORP_TPE_BEHAV_V1 v1.0.0 · graine 20260824 · horizon 12 mois.

---

## 1. Ce que cet exercice peut et ne peut pas établir

**Ce qu'il établit.** Que le score du moteur ordonne le risque de façon exploitable ;
que l'échelle maîtresse produit des PD monotones ; que la chaîne « données →
moteur → score → grade → PD » tourne de bout en bout ; que la batterie de
validation détecte effectivement les défauts de calibration lorsqu'il y en a.

**Ce qu'il n'établit pas.** Le niveau des PD. Celui-ci est une conséquence
arithmétique des hypothèses du simulateur — au premier rang desquelles la tendance
centrale du taux de défaut, qui est POSÉE, non estimée. Le pouvoir discriminant
obtenu est de la même nature : il découle du bruit que le simulateur introduit
entre la qualité latente et les critères observés. Un Gini élevé sur données
simulées ne dit rien du Gini sur le portefeuille réel.

## 2. Processus générateur

Les scores ne sont jamais simulés directement : le simulateur produit des données
d'entrée (ratios, ancrages, flags, qualité de l'information) et c'est le moteur réel
`computeRating` qui en tire un score et un grade. Un raccourci « score simulé → PD »
aurait rendu l'exercice circulaire.

```
Q_i ~ N(0,1)                     qualité de crédit latente
B_i ~ N(0,1)                     biais propre au dossier, non informatif sur le défaut
signal_ij = a·Q_i + b·B_i + c·e_ij       → percentile → bande de barème ou ancrage

p_i = Φ(m_s − k_s·Q_i)           PD vraie, avec m_s tel que E[p_i] = tendance centrale
défaut ⟺ √ρ·F_t + √(1−ρ)·ε_i < Φ⁻¹(p_i)          (Vasicek / ASRF)
```

Conditionnellement à Q, score et défaut sont indépendants : le score n'est
informatif que parce qu'il mesure Q, imparfaitement. Le terme B est essentiel —
sans lui, l'agrégation de 45 critères ferait disparaître le bruit et produirait un
pouvoir discriminant irréaliste.

### Hypothèses posées

| Hypothèse | Valeur | Statut |
|---|---:|---|
| Tendance centrale du taux de défaut TPE | 6.00 % | **posée** — à remplacer par l'observé de la banque |
| Corrélation d'actifs ρ | 0.12 | ordre de grandeur du dispositif de Bâle pour les entreprises |
| Part du signal portée par la qualité latente (a) | 0.5 | **posée** — détermine le pouvoir discriminant |
| Part portée par le biais de dossier (b) | 0.42 | **posée** — borne le pouvoir discriminant |
| Répartition du portefeuille | TPE 100 % | **posée** |

## 3. Portefeuille simulé

48 000 contreparties sur 8 cohortes annuelles.

| Cohorte | Facteur systématique | Taux de défaut | Usage |
|---:|---:|---:|---|
| 0 | -0.252 | 5.26 % | développement / hors-échantillon |
| 1 | -0.942 | 8.10 % | développement / hors-échantillon |
| 2 | 0.203 | 4.80 % | développement / hors-échantillon |
| 3 | -1.242 | 9.15 % | développement / hors-échantillon |
| 4 | -0.078 | 4.74 % | développement / hors-échantillon |
| 5 | -1.025 | 7.69 % | hors-période |
| 6 | 1.111 | 2.64 % | hors-période |
| 7 | -0.939 | 7.81 % | hors-période |

La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **5.36 %**.
Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur
systématique : c'est cette dispersion qui rend la distinction entre une PD
« travers-le-cycle » et un taux ponctuel observable.

### Population écartée de la calibration

| Motif | Effectif | Part |
|---|---:|---:|
| Déjà en défaut à l'observation | 1 287 | 2.68 % |
| Scoring bloqué (donnée critique) | 2 004 | 4.17 % |
| Aucun grade final (confiance insuffisante) | 3 289 | 6.85 % |

Une contrepartie déjà en défaut est écartée par construction : une PD est une
probabilité de PASSER en défaut. La conserver gonflerait mécaniquement le pouvoir
discriminant mesuré.

## 4. Méthode d'affectation

PD à 12 mois calibrée par grade : taux de défaut observé avec correction de continuité, rétréci vers une tendance log-linéaire sur le rang du grade proportionnellement au nombre de défauts, monotonie imposée par régression isotone pondérée, marge de prudence relative puis plancher. La calibration porte sur le grade final et non sur le score brut, afin de conserver l'effet des caps.

**Pourquoi calibrer sur le grade et non sur le score.** Le grade final intègre les
caps — qualité de l'information, situations structurelles — qui déplacent une
contrepartie vers le bas sans toucher à son score brut. Le score moyen n'est donc
pas monotone dans l'échelle : un grade plafonné rassemble des dossiers bien notés.
Dériver la PD d'une courbe du score réaffecterait à ces dossiers la PD de leur
score et annulerait l'effet du cap.

Inversions constatées du score moyen sur ce portefeuille :

- G3 score moyen 82.5 puis G4 score moyen 84.1 — soit une remontée de 1.6 point(s) en descendant d'un grade
- G6 score moyen 67.5 puis G7 score moyen 73.8 — soit une remontée de 6.3 point(s) en descendant d'un grade

### Origine des grades : barème ou cap de qualité d'information ?

| Grade | Effectif | Part | Score moyen | Déplacé par un cap | dont cap de confiance |
|---|---:|---:|---:|---:|---:|
| G1 | 700 | 1.7 % | 94.1 | 0 % | 0 % |
| G2 | 595 | 1.4 % | 87.3 | 0 % | 0 % |
| G3 | 598 | 1.4 % | 82.5 | 0 % | 0 % |
| G4 | 9 131 | 22.0 % | 84.1 | 65 % | 65 % |
| G5 | 3 067 | 7.4 % | 72.5 | 0 % | 0 % |
| G6 | 2 628 | 6.3 % | 67.5 | 0 % | 0 % |
| G7 | 14 411 | 34.8 % | 73.8 | 72 % | 61 % |
| G8 | 3 315 | 8.0 % | 57.7 | 1 % | 0 % |
| G9 | 4 057 | 9.8 % | 50.5 | 0 % | 0 % |
| G10 | 2 918 | 7.0 % | 36.4 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.2020**.

Le grade G7 rassemble à lui seul 34.8 % du portefeuille, et 61 % de ces dossiers y ont été déplacés par le cap de qualité d'information — pas par l'analyse du risque. C'est le comportement voulu du modèle, mais il a une conséquence opérationnelle directe : améliorer la collecte d'information déplacerait davantage de dossiers que réviser les pondérations.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| G1 | 336 | 0.175 % | 0.000 % | 0.179 % | × 0.98 |
| G2 | 279 | 0.318 % | 0.000 % | 0.490 % | × 0.65 |
| G3 | 253 | 0.748 % | 1.581 % | 0.758 % | × 0.99 |
| G4 | 3 907 | 1.033 % | 0.921 % | 0.936 % | × 1.10 |
| G5 | 1 374 | 2.976 % | 3.130 % | 2.509 % | × 1.19 |
| G6 | 1 132 | 4.754 % | 4.947 % | 3.480 % | × 1.37 |
| G7 | 6 440 | 4.754 % | 4.224 % | 3.345 % | × 1.42 |
| G8 | 1 416 | 10.379 % | 9.393 % | 8.132 % | × 1.28 |
| G9 | 1 801 | 15.423 % | 13.881 % | 12.014 % | × 1.28 |
| G10 | 1 279 | 32.038 % | 29.242 % | 24.684 % | × 1.30 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |

**Grades fusionnés par la régression isotone.**

- G6 et G7 portent la même PD (4.754 %).

Ce n'est pas un défaut de la calibration : c'est le résultat correct lorsque deux
grades ne se distinguent pas sur les données. C'est en revanche un constat de
premier ordre — une distinction de grade qui ne porte aucune différence de risque
n'apporte rien à la décision. Deux issues possibles : revoir ce qui alimente ces
grades, ou les fusionner dans l'échelle maîtresse.

La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 18 217 · 1 168 défauts · taux observé 6.41 % · PD moyenne affectée 7.02 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6100 | pouvoir de séparation des défauts |
| AUC | 0.8050 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4574 | écart maximal entre sains et défauts |
| Brier | 0.05474 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0220 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.5798 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| G1 | 336 | 0.175 % | 0.000 % | 0 | 1.0000 |
| G2 | 279 | 0.318 % | 0.000 % | 0 | 1.0000 |
| G3 | 253 | 0.748 % | 1.581 % | 4 | 0.1231 |
| G4 | 3 907 | 1.033 % | 0.921 % | 36 | 0.7767 |
| G5 | 1 374 | 2.976 % | 3.130 % | 43 | 0.3901 |
| G6 | 1 132 | 4.754 % | 4.947 % | 56 | 0.3995 |
| G7 | 6 440 | 4.754 % | 4.224 % | 272 | 0.9803 |
| G8 | 1 416 | 10.379 % | 9.393 % | 133 | 0.8975 |
| G9 | 1 801 | 15.423 % | 13.881 % | 250 | 0.9688 |
| G10 | 1 279 | 32.038 % | 29.242 % | 374 | 0.9856 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| G3 → G4 | 1.58 % → 0.92 % | 253 / 3907 | 4 / 36 | 0.2974 | compatible avec le bruit |
| G6 → G7 | 4.95 % → 4.22 % | 1132 / 6440 | 56 / 272 | 0.2702 | compatible avec le bruit |

#### Échantillon hors-échantillon

Effectif 7 748 · 495 défauts · taux observé 6.39 % · PD moyenne affectée 7.02 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5841 | pouvoir de séparation des défauts |
| AUC | 0.7920 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4432 | écart maximal entre sains et défauts |
| Brier | 0.05502 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0326 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.1539 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| G1 | 117 | 0.175 % | 0.000 % | 0 | 1.0000 |
| G2 | 100 | 0.318 % | 1.000 % | 1 | 0.2730 |
| G3 | 105 | 0.748 % | 0.000 % | 0 | 1.0000 |
| G4 | 1 779 | 1.033 % | 1.405 % | 25 | 0.0806 |
| G5 | 583 | 2.976 % | 2.744 % | 16 | 0.6626 |
| G6 | 499 | 4.754 % | 2.605 % | 13 | 0.9946 |
| G7 | 2 633 | 4.754 % | 4.747 % | 125 | 0.5194 |
| G8 | 648 | 10.379 % | 9.259 % | 60 | 0.8412 |
| G9 | 728 | 15.423 % | 13.462 % | 98 | 0.9374 |
| G10 | 556 | 32.038 % | 28.237 % | 157 | 0.9763 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| G2 → G3 | 1.00 % → 0.00 % | 100 / 105 | 1 / 0 | 0.3043 | compatible avec le bruit |
| G5 → G6 | 2.74 % → 2.61 % | 583 / 499 | 16 / 13 | 0.8876 | compatible avec le bruit |

#### Échantillon hors-période

Effectif 15 455 · 934 défauts · taux observé 6.04 % · PD moyenne affectée 7.02 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5770 | pouvoir de séparation des défauts |
| AUC | 0.7885 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4440 | écart maximal entre sains et défauts |
| Brier | 0.05294 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0000 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0442 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| G1 | 247 | 0.175 % | 0.000 % | 0 | 1.0000 |
| G2 | 216 | 0.318 % | 0.926 % | 2 | 0.1513 |
| G3 | 240 | 0.748 % | 1.250 % | 3 | 0.2676 |
| G4 | 3 445 | 1.033 % | 1.161 % | 40 | 0.2507 |
| G5 | 1 110 | 2.976 % | 2.613 % | 29 | 0.7855 |
| G6 | 997 | 4.754 % | 4.614 % | 46 | 0.6034 |
| G7 | 5 338 | 4.754 % | 4.234 % | 226 | 0.9674 |
| G8 | 1 251 | 10.379 % | 7.994 % | 100 | 0.9982 |
| G9 | 1 528 | 15.423 % | 13.678 % | 209 | 0.9742 |
| G10 | 1 083 | 32.038 % | 25.762 % | 279 | 1.0000 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| G3 → G4 | 1.25 % → 1.16 % | 240 / 3445 | 3 / 40 | 0.9013 | compatible avec le bruit |
| G6 → G7 | 4.61 % → 4.23 % | 997 / 5338 | 46 / 226 | 0.5869 | compatible avec le bruit |

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6100 | intervalle bootstrap à 95 % : [0.5883 ; 0.6304] |
| Stabilité hors-échantillon | 0.0035 | < 0,10 stable |
| Stabilité hors-période | 0.0016 | < 0,10 stable |
| Concentration des grades | 0.2020 | Herfindahl sur la répartition |

| Segment | Effectif | Gini |
|---|---:|---:|
| TPE | 18 217 | 0.6100 |

## 7. Reproductibilité

```
npx tsx scripts/calibration/run.mts --seed 20260824 --cohorts 8 --per-cohort 6000 --moc 0.1
```

Aucun appel à `Math.random()` n'intervient dans la chaîne : le générateur est à
graine explicite (xoshiro128**), y compris pour les intervalles bootstrap. À graine
égale, l'artefact produit est identique au bit près.

## 8. Ce qu'il faudrait pour une calibration utilisable

1. **Un historique de défauts réels** couvrant au minimum un cycle complet, avec une
   définition de défaut stable sur toute la période et alignée sur la définition
   prudentielle applicable.
2. **Une tendance centrale estimée**, non posée : moyenne de long terme des taux de
   défaut annuels par segment, et non le taux de la dernière année observée.
3. **Une marge de prudence justifiée**, dérivée de l'incertitude d'estimation et des
   insuffisances de données constatées, et non fixée forfaitairement comme ici.
4. **Une validation indépendante** de la fonction de validation des modèles, puis un
   passage en comité modèles.
5. **Un suivi de performance** périodique : dérive du pouvoir discriminant, stabilité
   de la population, adéquation des PD par grade.

