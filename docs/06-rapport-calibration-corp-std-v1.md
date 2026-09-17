# Rapport de calibration — CORP_STD_V1

*Modèle expert de notation interne — Entreprises non financières Maroc (TPE/PME/GE)*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_STD_V1-SYNTH-20260823` · modèle CORP_STD_V1 v3.0.0 · graine 20260823 · horizon 12 mois.

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
| 0 | 0.904 | 1.81 % | développement / hors-échantillon |
| 1 | -0.659 | 5.17 % | développement / hors-échantillon |
| 2 | -0.930 | 6.06 % | développement / hors-échantillon |
| 3 | 0.193 | 3.00 % | développement / hors-échantillon |
| 4 | 1.223 | 1.90 % | développement / hors-échantillon |
| 5 | 0.755 | 2.14 % | hors-période |
| 6 | -0.447 | 4.60 % | hors-période |
| 7 | -0.076 | 3.63 % | hors-période |

La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **4.13 %**.
Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur
systématique : c'est cette dispersion qui rend la distinction entre une PD
« travers-le-cycle » et un taux ponctuel observable.

### Population écartée de la calibration

| Motif | Effectif | Part |
|---|---:|---:|
| Déjà en défaut à l'observation | 1 061 | 2.21 % |
| Scoring bloqué (donnée critique) | 1 016 | 2.12 % |
| Aucun grade final (confiance insuffisante) | 2 638 | 5.50 % |

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
| STD-P1 | 3 237 | 7.5 % | 91.6 | 0 % | 0 % |
| STD-P2 | 4 505 | 10.4 % | 84.7 | 0 % | 0 % |
| STD-P3 | 6 150 | 14.2 % | 78.9 | 0 % | 0 % |
| STD-P4 | 6 739 | 15.6 % | 72.9 | 0 % | 0 % |
| STD-P5 | 6 509 | 15.0 % | 67.0 | 0 % | 0 % |
| STD-P6 | 6 173 | 14.3 % | 60.6 | 0 % | 0 % |
| STD-P7 | 5 530 | 12.8 % | 53.3 | 4 % | 0 % |
| STD-P8 | 4 442 | 10.3 % | 39.4 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1306**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 1 448 | 0.158 % | 0.000 % | 0.154 % | × 1.03 |
| STD-P2 | 1 964 | 0.325 % | 0.305 % | 0.424 % | × 0.77 |
| STD-P3 | 2 688 | 0.708 % | 0.707 % | 0.813 % | × 0.87 |
| STD-P4 | 2 962 | 1.304 % | 1.215 % | 1.580 % | × 0.83 |
| STD-P5 | 2 853 | 2.266 % | 2.033 % | 2.568 % | × 0.88 |
| STD-P6 | 2 668 | 4.002 % | 3.561 % | 4.128 % | × 0.97 |
| STD-P7 | 2 458 | 7.893 % | 7.120 % | 8.040 % | × 0.98 |
| STD-P8 | 1 923 | 16.110 % | 14.665 % | 17.101 % | × 0.94 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |


La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 18 964 · 671 défauts · taux observé 3.54 % · PD moyenne affectée 3.91 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6181 | pouvoir de séparation des défauts |
| AUC | 0.8090 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4730 | écart maximal entre sains et défauts |
| Brier | 0.03231 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.1453 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.8844 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 1 448 | 0.158 % | 0.000 % | 0 | 1.0000 |
| STD-P2 | 1 964 | 0.325 % | 0.305 % | 6 | 0.6139 |
| STD-P3 | 2 688 | 0.708 % | 0.707 % | 19 | 0.5331 |
| STD-P4 | 2 962 | 1.304 % | 1.215 % | 36 | 0.6859 |
| STD-P5 | 2 853 | 2.266 % | 2.033 % | 58 | 0.8145 |
| STD-P6 | 2 668 | 4.002 % | 3.561 % | 95 | 0.8886 |
| STD-P7 | 2 458 | 7.893 % | 7.120 % | 175 | 0.9294 |
| STD-P8 | 1 923 | 16.110 % | 14.665 % | 282 | 0.9617 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-échantillon

Effectif 8 135 · 301 défauts · taux observé 3.70 % · PD moyenne affectée 3.90 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6189 | pouvoir de séparation des défauts |
| AUC | 0.8095 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.5035 | écart maximal entre sains et défauts |
| Brier | 0.03362 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.2605 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.2409 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 597 | 0.158 % | 0.168 % | 1 | 0.6118 |
| STD-P2 | 862 | 0.325 % | 0.116 % | 1 | 0.9395 |
| STD-P3 | 1 186 | 0.708 % | 1.012 % | 12 | 0.1417 |
| STD-P4 | 1 258 | 1.304 % | 1.272 % | 16 | 0.5732 |
| STD-P5 | 1 195 | 2.266 % | 1.674 % | 20 | 0.9352 |
| STD-P6 | 1 186 | 4.002 % | 3.373 % | 40 | 0.8829 |
| STD-P7 | 1 019 | 7.893 % | 8.636 % | 88 | 0.2040 |
| STD-P8 | 832 | 16.110 % | 14.784 % | 123 | 0.8622 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| STD-P1 → STD-P2 | 0.17 % → 0.12 % | 597 / 862 | 1 / 1 | 0.7938 | compatible avec le bruit |

#### Échantillon hors-période

Effectif 16 186 · 560 défauts · taux observé 3.46 % · PD moyenne affectée 3.95 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6422 | pouvoir de séparation des défauts |
| AUC | 0.8211 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4929 | écart maximal entre sains et défauts |
| Brier | 0.03157 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0213 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.4729 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| STD-P1 | 1 192 | 0.158 % | 0.084 % | 1 | 0.8489 |
| STD-P2 | 1 679 | 0.325 % | 0.357 % | 6 | 0.4637 |
| STD-P3 | 2 276 | 0.708 % | 0.308 % | 7 | 0.9964 |
| STD-P4 | 2 519 | 1.304 % | 1.072 % | 27 | 0.8691 |
| STD-P5 | 2 461 | 2.266 % | 2.113 % | 52 | 0.7130 |
| STD-P6 | 2 319 | 4.002 % | 3.320 % | 77 | 0.9610 |
| STD-P7 | 2 053 | 7.893 % | 7.063 % | 145 | 0.9263 |
| STD-P8 | 1 687 | 16.110 % | 14.523 % | 245 | 0.9660 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| STD-P2 → STD-P3 | 0.36 % → 0.31 % | 1679 / 2276 | 6 / 7 | 0.7868 | compatible avec le bruit |

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6181 | intervalle bootstrap à 95 % : [0.5902 ; 0.6485] |
| Stabilité hors-échantillon | 0.0007 | < 0,10 stable |
| Stabilité hors-période | 0.0003 | < 0,10 stable |
| Concentration des grades | 0.1306 | Herfindahl sur la répartition |

| Segment | Effectif | Gini |
|---|---:|---:|
| TPE | 10 007 | 0.6092 |
| PME | 6 858 | 0.6152 |
| GE | 2 099 | 0.8404 |

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

