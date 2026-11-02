# Rapport de calibration — CORP_STD_V1

*Modèle expert de notation interne — Entreprises non financières Maroc (TPE/PME/GE)*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_STD_V1-SYNTH-20260823` · modèle CORP_STD_V1 v3.2.0 · graine 20260823 · horizon 12 mois.

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
| 0 | 0.904 | 2.04 % | développement / hors-échantillon |
| 1 | 0.378 | 3.26 % | développement / hors-échantillon |
| 2 | 0.880 | 1.93 % | développement / hors-échantillon |
| 3 | -1.466 | 8.63 % | développement / hors-échantillon |
| 4 | -0.879 | 6.23 % | développement / hors-échantillon |
| 5 | -0.046 | 4.36 % | hors-période |
| 6 | -1.158 | 6.35 % | hors-période |
| 7 | 0.688 | 2.23 % | hors-période |

La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **4.22 %**.
Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur
systématique : c'est cette dispersion qui rend la distinction entre une PD
« travers-le-cycle » et un taux ponctuel observable.

### Population écartée de la calibration

| Motif | Effectif | Part |
|---|---:|---:|
| Déjà en défaut à l'observation | 1 059 | 2.21 % |
| Scoring bloqué (donnée critique) | 2 833 | 5.90 % |
| Aucun grade final (confiance insuffisante) | 1 445 | 3.01 % |

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

Sur ce portefeuille, le score moyen reste néanmoins ordonné sur toute l'échelle.

### Origine des grades : barème ou cap de qualité d'information ?

| Grade | Effectif | Part | Score moyen | Déplacé par un cap | dont cap de confiance |
|---|---:|---:|---:|---:|---:|
| 1 | 1 752 | 4.1 % | 93.0 | 0 % | 0 % |
| 2 | 2 885 | 6.8 % | 87.2 | 0 % | 0 % |
| 3 | 4 152 | 9.7 % | 82.3 | 0 % | 0 % |
| 4 | 5 143 | 12.1 % | 77.4 | 0 % | 0 % |
| 5 | 5 467 | 12.8 % | 72.5 | 0 % | 0 % |
| 6 | 6 406 | 15.0 % | 67.0 | 0 % | 0 % |
| 7 | 6 379 | 15.0 % | 60.6 | 0 % | 0 % |
| 8 | 5 747 | 13.5 % | 53.2 | 3 % | 0 % |
| 9 | 2 606 | 6.1 % | 44.4 | 0 % | 0 % |
| 10 | 2 126 | 5.0 % | 32.6 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1162**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| 1 | 792 | 0.150 % | 0.000 % | 0.064 % | × 2.35 |
| 2 | 1 249 | 0.264 % | 0.160 % | 0.257 % | × 1.03 |
| 3 | 1 802 | 0.498 % | 0.444 % | 0.496 % | × 1.01 |
| 4 | 2 218 | 0.899 % | 0.812 % | 0.867 % | × 1.04 |
| 5 | 2 370 | 1.562 % | 1.392 % | 1.387 % | × 1.13 |
| 6 | 2 802 | 3.004 % | 2.748 % | 2.500 % | × 1.20 |
| 7 | 2 821 | 4.764 % | 4.289 % | 3.819 % | × 1.25 |
| 8 | 2 523 | 8.534 % | 7.729 % | 7.651 % | × 1.12 |
| 9 | 1 096 | 15.613 % | 14.234 % | 12.752 % | × 1.22 |
| 10 | 929 | 23.745 % | 21.529 % | 22.332 % | × 1.06 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |


La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 18 602 · 810 défauts · taux observé 4.35 % · PD moyenne affectée 4.82 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6181 | pouvoir de séparation des défauts |
| AUC | 0.8091 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4676 | écart maximal entre sains et défauts |
| Brier | 0.03885 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.2213 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.9935 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| 1 | 792 | 0.150 % | 0.000 % | 0 | 1.0000 |
| 2 | 1 249 | 0.264 % | 0.160 % | 2 | 0.8411 |
| 3 | 1 802 | 0.498 % | 0.444 % | 8 | 0.6740 |
| 4 | 2 218 | 0.899 % | 0.812 % | 18 | 0.6999 |
| 5 | 2 370 | 1.562 % | 1.392 % | 33 | 0.7690 |
| 6 | 2 802 | 3.004 % | 2.748 % | 77 | 0.8010 |
| 7 | 2 821 | 4.764 % | 4.289 % | 121 | 0.8917 |
| 8 | 2 523 | 8.534 % | 7.729 % | 195 | 0.9326 |
| 9 | 1 096 | 15.613 % | 14.234 % | 156 | 0.9044 |
| 10 | 929 | 23.745 % | 21.529 % | 200 | 0.9493 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-échantillon

Effectif 7 991 · 364 défauts · taux observé 4.56 % · PD moyenne affectée 4.95 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5603 | pouvoir de séparation des défauts |
| AUC | 0.7801 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4340 | écart maximal entre sains et défauts |
| Brier | 0.04111 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0023 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0039 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| 1 | 316 | 0.150 % | 0.316 % | 1 | 0.3770 |
| 2 | 514 | 0.264 % | 0.389 % | 2 | 0.3930 |
| 3 | 767 | 0.498 % | 0.652 % | 5 | 0.3361 |
| 4 | 971 | 0.899 % | 1.854 % | 18 | 0.0038 ⚠ |
| 5 | 1 042 | 1.562 % | 1.248 % | 13 | 0.8263 |
| 6 | 1 202 | 3.004 % | 2.496 % | 30 | 0.8698 |
| 7 | 1 142 | 4.764 % | 5.517 % | 63 | 0.1313 |
| 8 | 1 092 | 8.534 % | 7.601 % | 83 | 0.8777 |
| 9 | 535 | 15.613 % | 11.402 % | 61 | 0.9978 |
| 10 | 410 | 23.745 % | 21.463 % | 88 | 0.8743 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| 4 → 5 | 1.85 % → 1.25 % | 971 / 1042 | 18 / 13 | 0.2698 | compatible avec le bruit |

#### Échantillon hors-période

Effectif 16 070 · 694 défauts · taux observé 4.32 % · PD moyenne affectée 4.79 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6124 | pouvoir de séparation des défauts |
| AUC | 0.8062 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4579 | écart maximal entre sains et défauts |
| Brier | 0.03853 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.1599 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.8764 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| 1 | 644 | 0.150 % | 0.000 % | 0 | 1.0000 |
| 2 | 1 122 | 0.264 % | 0.267 % | 3 | 0.5679 |
| 3 | 1 583 | 0.498 % | 0.505 % | 8 | 0.5313 |
| 4 | 1 954 | 0.899 % | 0.870 % | 17 | 0.5870 |
| 5 | 2 055 | 1.562 % | 1.265 % | 26 | 0.8822 |
| 6 | 2 402 | 3.004 % | 2.873 % | 69 | 0.6637 |
| 7 | 2 416 | 4.764 % | 4.512 % | 109 | 0.7329 |
| 8 | 2 132 | 8.534 % | 7.317 % | 156 | 0.9815 |
| 9 | 975 | 15.613 % | 13.128 % | 128 | 0.9869 |
| 10 | 787 | 23.745 % | 22.618 % | 178 | 0.7830 |

Taux de défaut observés strictement croissants sur toute l'échelle.

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6181 | intervalle bootstrap à 95 % : [0.5913 ; 0.6454] |
| Stabilité hors-échantillon | 0.0021 | < 0,10 stable |
| Stabilité hors-période | 0.0005 | < 0,10 stable |
| Concentration des grades | 0.1162 | Herfindahl sur la répartition |

| Segment | Effectif | Gini |
|---|---:|---:|
| TPE | 9 793 | 0.6075 |
| PME | 6 807 | 0.6170 |
| GE | 2 002 | 0.7536 |

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

