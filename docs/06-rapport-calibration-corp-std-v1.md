# Rapport de calibration — CORP_STD_V1

*Modèle expert de notation interne — Entreprises non financières Maroc (TPE/PME/GE)*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_STD_V1-SYNTH-20260823` · modèle CORP_STD_V1 v1.0.0 · graine 20260823 · horizon 12 mois.

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
| Tendance centrale du taux de défaut PME | 3.50 % | **posée** — à remplacer par l'observé de la banque |
| Tendance centrale du taux de défaut GE | 1.20 % | **posée** — à remplacer par l'observé de la banque |
| Corrélation d'actifs ρ | 0.12 | ordre de grandeur du dispositif de Bâle pour les entreprises |
| Part du signal portée par la qualité latente (a) | 0.5 | **posée** — détermine le pouvoir discriminant |
| Part portée par le biais de dossier (b) | 0.42 | **posée** — borne le pouvoir discriminant |
| Répartition du portefeuille | TPE 55 % · PME 35 % · GE 10 % | **posée** |

## 3. Portefeuille simulé

48 000 contreparties sur 8 cohortes annuelles.

| Cohorte | Facteur systématique | Taux de défaut | Usage |
|---:|---:|---:|---|
| 0 | 0.904 | 2.25 % | développement / hors-échantillon |
| 1 | 0.524 | 2.30 % | développement / hors-échantillon |
| 2 | -1.999 | 10.15 % | développement / hors-échantillon |
| 3 | -0.867 | 6.03 % | développement / hors-échantillon |
| 4 | -0.252 | 4.28 % | développement / hors-échantillon |
| 5 | -1.294 | 7.35 % | hors-période |
| 6 | 2.027 | 1.05 % | hors-période |
| 7 | -0.380 | 4.70 % | hors-période |

La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **4.19 %**.
Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur
systématique : c'est cette dispersion qui rend la distinction entre une PD
« travers-le-cycle » et un taux ponctuel observable.

### Population écartée de la calibration

| Motif | Effectif | Part |
|---|---:|---:|
| Déjà en défaut à l'observation | 1 012 | 2.11 % |
| Scoring bloqué (donnée critique) | 1 228 | 2.56 % |
| Aucun grade final (confiance insuffisante) | 1 535 | 3.20 % |

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

- G3 score moyen 82.4 puis G4 score moyen 83.5 — soit une remontée de 1.1 point(s) en descendant d'un grade
- G6 score moyen 67.6 puis G7 score moyen 71.7 — soit une remontée de 4.1 point(s) en descendant d'un grade

### Origine des grades : barème ou cap de qualité d'information ?

| Grade | Effectif | Part | Score moyen | Déplacé par un cap | dont cap de confiance |
|---|---:|---:|---:|---:|---:|
| G1 | 1 131 | 2.6 % | 93.8 | 0 % | 0 % |
| G2 | 1 010 | 2.3 % | 87.4 | 0 % | 0 % |
| G3 | 1 154 | 2.6 % | 82.4 | 0 % | 0 % |
| G4 | 10 945 | 24.7 % | 83.5 | 61 % | 61 % |
| G5 | 4 053 | 9.2 % | 72.5 | 0 % | 0 % |
| G6 | 3 581 | 8.1 % | 67.6 | 0 % | 0 % |
| G7 | 10 734 | 24.3 % | 71.7 | 61 % | 55 % |
| G8 | 3 401 | 7.7 % | 58.0 | 4 % | 0 % |
| G9 | 5 213 | 11.8 % | 52.2 | 14 % | 0 % |
| G10 | 3 003 | 6.8 % | 36.8 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1618**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| G1 | 481 | 0.147 % | 0.000 % | 0.056 % | × 2.64 |
| G2 | 435 | 0.269 % | 0.230 % | 0.178 % | × 1.51 |
| G3 | 530 | 0.637 % | 1.132 % | 0.284 % | × 2.24 |
| G4 | 4 742 | 1.016 % | 0.970 % | 0.688 % | × 1.48 |
| G5 | 1 754 | 1.604 % | 1.482 % | 1.588 % | × 1.01 |
| G6 | 1 583 | 2.827 % | 2.590 % | 2.392 % | × 1.18 |
| G7 | 4 784 | 3.895 % | 3.470 % | 2.872 % | × 1.36 |
| G8 | 1 506 | 6.505 % | 5.644 % | 5.067 % | × 1.28 |
| G9 | 2 215 | 14.773 % | 13.454 % | 10.873 % | × 1.36 |
| G10 | 1 315 | 23.726 % | 21.597 % | 19.691 % | × 1.20 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |


La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 19 345 · 953 défauts · taux observé 4.93 % · PD moyenne affectée 5.43 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5826 | pouvoir de séparation des défauts |
| AUC | 0.7913 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4420 | écart maximal entre sains et défauts |
| Brier | 0.04344 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0853 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.8707 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| G1 | 481 | 0.147 % | 0.000 % | 0 | 1.0000 |
| G2 | 435 | 0.269 % | 0.230 % | 1 | 0.6907 |
| G3 | 530 | 0.637 % | 1.132 % | 6 | 0.1261 |
| G4 | 4 742 | 1.016 % | 0.970 % | 46 | 0.6429 |
| G5 | 1 754 | 1.604 % | 1.482 % | 26 | 0.6832 |
| G6 | 1 583 | 2.827 % | 2.590 % | 41 | 0.7358 |
| G7 | 4 784 | 3.895 % | 3.470 % | 166 | 0.9424 |
| G8 | 1 506 | 6.505 % | 5.644 % | 85 | 0.9226 |
| G9 | 2 215 | 14.773 % | 13.454 % | 298 | 0.9637 |
| G10 | 1 315 | 23.726 % | 21.597 % | 284 | 0.9687 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| G3 → G4 | 1.13 % → 0.97 % | 530 / 4742 | 6 / 46 | 0.7204 | compatible avec le bruit |

#### Échantillon hors-échantillon

Effectif 8 309 · 429 défauts · taux observé 5.16 % · PD moyenne affectée 5.43 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5743 | pouvoir de séparation des défauts |
| AUC | 0.7872 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4537 | écart maximal entre sains et défauts |
| Brier | 0.04562 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.1783 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.1672 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| G1 | 217 | 0.147 % | 0.461 % | 1 | 0.2729 |
| G2 | 198 | 0.269 % | 0.505 % | 1 | 0.4138 |
| G3 | 186 | 0.637 % | 0.000 % | 0 | 1.0000 |
| G4 | 2 073 | 1.016 % | 0.724 % | 15 | 0.9310 |
| G5 | 759 | 1.604 % | 1.581 % | 12 | 0.5591 |
| G6 | 667 | 2.827 % | 3.448 % | 23 | 0.1942 |
| G7 | 2 008 | 3.895 % | 4.333 % | 87 | 0.1692 |
| G8 | 654 | 6.505 % | 6.575 % | 43 | 0.4934 |
| G9 | 1 009 | 14.773 % | 12.488 % | 126 | 0.9834 |
| G10 | 538 | 23.726 % | 22.491 % | 121 | 0.7642 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| G2 → G3 | 0.51 % → 0.00 % | 198 / 186 | 1 / 0 | 0.3318 | compatible avec le bruit |

#### Échantillon hors-période

Effectif 16 571 · 723 défauts · taux observé 4.36 % · PD moyenne affectée 5.49 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5991 | pouvoir de séparation des défauts |
| AUC | 0.7995 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4667 | écart maximal entre sains et défauts |
| Brier | 0.03940 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0000 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0019 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| G1 | 433 | 0.147 % | 0.000 % | 0 | 1.0000 |
| G2 | 377 | 0.269 % | 0.265 % | 1 | 0.6383 |
| G3 | 438 | 0.637 % | 0.000 % | 0 | 1.0000 |
| G4 | 4 130 | 1.016 % | 0.702 % | 29 | 0.9857 |
| G5 | 1 540 | 1.604 % | 2.013 % | 31 | 0.1216 |
| G6 | 1 331 | 2.827 % | 2.179 % | 29 | 0.9392 |
| G7 | 3 942 | 3.895 % | 3.222 % | 127 | 0.9887 |
| G8 | 1 241 | 6.505 % | 4.915 % | 61 | 0.9921 |
| G9 | 1 989 | 14.773 % | 11.463 % | 228 | 1.0000 |
| G10 | 1 150 | 23.726 % | 18.870 % | 217 | 1.0000 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| G2 → G3 | 0.27 % → 0.00 % | 377 / 438 | 1 / 0 | 0.2808 | compatible avec le bruit |

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.5826 | intervalle bootstrap à 95 % : [0.5557 ; 0.6084] |
| Stabilité hors-échantillon | 0.0020 | < 0,10 stable |
| Stabilité hors-période | 0.0010 | < 0,10 stable |
| Concentration des grades | 0.1618 | Herfindahl sur la répartition |

| Segment | Effectif | Gini |
|---|---:|---:|
| TPE | 10 133 | 0.5864 |
| PME | 7 175 | 0.6028 |
| GE | 2 037 | 0.5149 |

## 7. Reproductibilité

```
npx tsx scripts/calibration/run.mts --seed 20260823 --cohorts 8 --per-cohort 6000 --moc 0.1
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

