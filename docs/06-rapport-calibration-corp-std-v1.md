# Rapport de calibration — CORP_STD_V1

*Modèle expert de notation interne — Entreprises non financières Maroc (TPE/PME/GE)*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_STD_V1-SYNTH-20260823` · modèle CORP_STD_V1 v3.1.0 · graine 20260823 · horizon 12 mois.

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
| STD-P1 | 2 703 | 6.3 % | 91.6 | 0 % | 0 % |
| STD-P2 | 4 298 | 10.1 % | 84.8 | 0 % | 0 % |
| STD-P3 | 5 825 | 13.7 % | 78.8 | 0 % | 0 % |
| STD-P4 | 6 573 | 15.4 % | 73.0 | 0 % | 0 % |
| STD-P5 | 6 406 | 15.0 % | 67.0 | 0 % | 0 % |
| STD-P6 | 6 379 | 15.0 % | 60.6 | 0 % | 0 % |
| STD-P7 | 5 747 | 13.5 % | 53.2 | 3 % | 0 % |
| STD-P8 | 4 732 | 11.1 % | 39.1 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1319**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 1 198 | 0.168 % | 0.000 % | 0.102 % | × 1.64 |
| STD-P2 | 1 865 | 0.349 % | 0.322 % | 0.369 % | × 0.95 |
| STD-P3 | 2 521 | 0.674 % | 0.595 % | 0.747 % | × 0.90 |
| STD-P4 | 2 847 | 1.499 % | 1.405 % | 1.328 % | × 1.13 |
| STD-P5 | 2 802 | 2.973 % | 2.748 % | 2.500 % | × 1.19 |
| STD-P6 | 2 821 | 4.783 % | 4.289 % | 3.819 % | × 1.25 |
| STD-P7 | 2 523 | 8.613 % | 7.729 % | 7.651 % | × 1.13 |
| STD-P8 | 2 025 | 19.308 % | 17.580 % | 17.147 % | × 1.13 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |


La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 18 602 · 810 défauts · taux observé 4.35 % · PD moyenne affectée 4.81 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6181 | pouvoir de séparation des défauts |
| AUC | 0.8091 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4676 | écart maximal entre sains et défauts |
| Brier | 0.03899 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0933 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.9228 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 1 198 | 0.168 % | 0.000 % | 0 | 1.0000 |
| STD-P2 | 1 865 | 0.349 % | 0.322 % | 6 | 0.6324 |
| STD-P3 | 2 521 | 0.674 % | 0.595 % | 15 | 0.7186 |
| STD-P4 | 2 847 | 1.499 % | 1.405 % | 40 | 0.6806 |
| STD-P5 | 2 802 | 2.973 % | 2.748 % | 77 | 0.7734 |
| STD-P6 | 2 821 | 4.783 % | 4.289 % | 121 | 0.9000 |
| STD-P7 | 2 523 | 8.613 % | 7.729 % | 195 | 0.9490 |
| STD-P8 | 2 025 | 19.308 % | 17.580 % | 356 | 0.9781 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-échantillon

Effectif 7 991 · 364 défauts · taux observé 4.56 % · PD moyenne affectée 4.96 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5603 | pouvoir de séparation des défauts |
| AUC | 0.7801 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4340 | écart maximal entre sains et défauts |
| Brier | 0.04140 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0151 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0412 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 492 | 0.168 % | 0.203 % | 1 | 0.5627 |
| STD-P2 | 777 | 0.349 % | 0.644 % | 5 | 0.1384 |
| STD-P3 | 1 074 | 0.674 % | 1.024 % | 11 | 0.1153 |
| STD-P4 | 1 267 | 1.499 % | 1.736 % | 22 | 0.2724 |
| STD-P5 | 1 202 | 2.973 % | 2.496 % | 30 | 0.8564 |
| STD-P6 | 1 142 | 4.783 % | 5.517 % | 63 | 0.1380 |
| STD-P7 | 1 092 | 8.613 % | 7.601 % | 83 | 0.8953 |
| STD-P8 | 945 | 19.308 % | 15.767 % | 149 | 0.9979 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-période

Effectif 16 070 · 694 défauts · taux observé 4.32 % · PD moyenne affectée 4.79 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6124 | pouvoir de séparation des défauts |
| AUC | 0.8062 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4579 | écart maximal entre sains et défauts |
| Brier | 0.03877 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.1151 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.9421 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 1 013 | 0.168 % | 0.099 % | 1 | 0.8179 |
| STD-P2 | 1 656 | 0.349 % | 0.362 % | 6 | 0.5182 |
| STD-P3 | 2 230 | 0.674 % | 0.673 % | 15 | 0.5371 |
| STD-P4 | 2 459 | 1.499 % | 1.301 % | 32 | 0.8115 |
| STD-P5 | 2 402 | 2.973 % | 2.873 % | 69 | 0.6308 |
| STD-P6 | 2 416 | 4.783 % | 4.512 % | 109 | 0.7468 |
| STD-P7 | 2 132 | 8.613 % | 7.317 % | 156 | 0.9866 |
| STD-P8 | 1 762 | 19.308 % | 17.367 % | 306 | 0.9829 |

Taux de défaut observés strictement croissants sur toute l'échelle.

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6181 | intervalle bootstrap à 95 % : [0.5913 ; 0.6454] |
| Stabilité hors-échantillon | 0.0017 | < 0,10 stable |
| Stabilité hors-période | 0.0003 | < 0,10 stable |
| Concentration des grades | 0.1319 | Herfindahl sur la répartition |

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

