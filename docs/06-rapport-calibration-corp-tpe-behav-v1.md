# Rapport de calibration — CORP_TPE_BEHAV_V1

*Modèle TPE comportemental — flux bancaires et informations alternatives*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_TPE_BEHAV_V1-SYNTH-20260824` · modèle CORP_TPE_BEHAV_V1 v3.2.0 · graine 20260824 · horizon 12 mois.

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
| 0 | -0.252 | 4.09 % | développement / hors-échantillon |
| 1 | -0.942 | 6.39 % | développement / hors-échantillon |
| 2 | 0.203 | 3.75 % | développement / hors-échantillon |
| 3 | -1.242 | 7.10 % | développement / hors-échantillon |
| 4 | -0.078 | 3.74 % | développement / hors-échantillon |
| 5 | -1.025 | 6.78 % | hors-période |
| 6 | 1.111 | 2.12 % | hors-période |
| 7 | -0.939 | 6.69 % | hors-période |

La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **4.29 %**.
Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur
systématique : c'est cette dispersion qui rend la distinction entre une PD
« travers-le-cycle » et un taux ponctuel observable.

### Population écartée de la calibration

| Motif | Effectif | Part |
|---|---:|---:|
| Déjà en défaut à l'observation | 1 287 | 2.68 % |
| Scoring bloqué (donnée critique) | 4 941 | 10.29 % |
| Aucun grade final (confiance insuffisante) | 19 469 | 40.56 % |

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
| 1 | 1 540 | 6.9 % | 93.3 | 0 % | 0 % |
| 2 | 1 931 | 8.7 % | 87.2 | 0 % | 0 % |
| 3 | 2 450 | 11.0 % | 82.3 | 0 % | 0 % |
| 4 | 2 944 | 13.2 % | 77.4 | 0 % | 0 % |
| 5 | 2 988 | 13.4 % | 72.4 | 0 % | 0 % |
| 6 | 3 218 | 14.4 % | 67.0 | 0 % | 0 % |
| 7 | 2 903 | 13.0 % | 60.5 | 0 % | 0 % |
| 8 | 2 423 | 10.9 % | 52.9 | 0 % | 0 % |
| 9 | 1 105 | 5.0 % | 44.3 | 0 % | 0 % |
| 10 | 801 | 3.6 % | 32.6 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1123**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| 1 | 678 | 0.340 % | 0.147 % | 0.203 % | × 1.68 |
| 2 | 855 | 0.548 % | 0.117 % | 0.407 % | × 1.35 |
| 3 | 1 101 | 0.974 % | 0.817 % | 0.842 % | × 1.16 |
| 4 | 1 317 | 1.889 % | 1.822 % | 1.310 % | × 1.44 |
| 5 | 1 264 | 2.873 % | 2.611 % | 2.048 % | × 1.40 |
| 6 | 1 379 | 4.657 % | 4.206 % | 3.073 % | × 1.52 |
| 7 | 1 274 | 7.558 % | 6.829 % | 5.305 % | × 1.42 |
| 8 | 1 065 | 11.596 % | 10.423 % | 8.571 % | × 1.35 |
| 9 | 503 | 18.385 % | 16.501 % | 14.233 % | × 1.29 |
| 10 | 357 | 30.913 % | 28.291 % | 25.057 % | × 1.23 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |


La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 9 793 · 508 défauts · taux observé 5.19 % · PD moyenne affectée 5.78 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6047 | pouvoir de séparation des défauts |
| AUC | 0.8024 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4498 | écart maximal entre sains et défauts |
| Brier | 0.04545 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.2903 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.9162 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| 1 | 678 | 0.340 % | 0.147 % | 1 | 0.9009 |
| 2 | 855 | 0.548 % | 0.117 % | 1 | 0.9909 |
| 3 | 1 101 | 0.974 % | 0.817 % | 9 | 0.7440 |
| 4 | 1 317 | 1.889 % | 1.822 % | 24 | 0.5984 |
| 5 | 1 264 | 2.873 % | 2.611 % | 33 | 0.7344 |
| 6 | 1 379 | 4.657 % | 4.206 % | 58 | 0.8032 |
| 7 | 1 274 | 7.558 % | 6.829 % | 87 | 0.8507 |
| 8 | 1 065 | 11.596 % | 10.423 % | 111 | 0.8947 |
| 9 | 503 | 18.385 % | 16.501 % | 83 | 0.8755 |
| 10 | 357 | 30.913 % | 28.291 % | 101 | 0.8711 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| 1 → 2 | 0.15 % → 0.12 % | 678 / 855 | 1 / 1 | 0.8693 | compatible avec le bruit |

#### Échantillon hors-échantillon

Effectif 4 142 · 191 défauts · taux observé 4.61 % · PD moyenne affectée 5.60 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6029 | pouvoir de séparation des défauts |
| AUC | 0.8014 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4660 | écart maximal entre sains et défauts |
| Brier | 0.04005 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0025 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0113 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| 1 | 291 | 0.340 % | 0.000 % | 0 | 1.0000 |
| 2 | 358 | 0.548 % | 1.397 % | 5 | 0.0488 ⚠ |
| 3 | 455 | 0.974 % | 1.319 % | 6 | 0.2851 |
| 4 | 514 | 1.889 % | 0.973 % | 5 | 0.9660 |
| 5 | 576 | 2.873 % | 2.257 % | 13 | 0.8444 |
| 6 | 642 | 4.657 % | 3.271 % | 21 | 0.9665 |
| 7 | 532 | 7.558 % | 4.511 % | 24 | 0.9983 |
| 8 | 448 | 11.596 % | 8.482 % | 38 | 0.9865 |
| 9 | 196 | 18.385 % | 18.367 % | 36 | 0.5315 |
| 10 | 130 | 30.913 % | 33.077 % | 43 | 0.3269 |

Ruptures d'ordre observées. La valeur-p compare les deux proportions : elle
sépare l'inversion de quelques défauts sur un grade peu peuplé — du bruit — de
celle portée par des centaines de défauts, qui traduit un vrai défaut
d'ordonnancement.

| Grades | Taux | Effectifs | Défauts | p | Lecture |
|---|---|---|---|---:|---|
| 2 → 3 | 1.40 % → 1.32 % | 358 / 455 | 5 / 6 | 0.9239 | compatible avec le bruit |
| 3 → 4 | 1.32 % → 0.97 % | 455 / 514 | 6 / 5 | 0.6120 | compatible avec le bruit |

#### Échantillon hors-période

Effectif 8 368 · 435 défauts · taux observé 5.20 % · PD moyenne affectée 5.79 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5938 | pouvoir de séparation des défauts |
| AUC | 0.7969 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4570 | écart maximal entre sains et défauts |
| Brier | 0.04571 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.3271 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.8938 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| 1 | 571 | 0.340 % | 0.350 % | 2 | 0.5789 |
| 2 | 718 | 0.548 % | 0.836 % | 6 | 0.2043 |
| 3 | 894 | 0.974 % | 0.895 % | 8 | 0.6420 |
| 4 | 1 113 | 1.889 % | 1.348 % | 15 | 0.9311 |
| 5 | 1 148 | 2.873 % | 2.526 % | 29 | 0.7827 |
| 6 | 1 197 | 4.657 % | 3.843 % | 46 | 0.9233 |
| 7 | 1 097 | 7.558 % | 7.293 % | 80 | 0.6466 |
| 8 | 910 | 11.596 % | 10.440 % | 95 | 0.8742 |
| 9 | 406 | 18.385 % | 16.995 % | 69 | 0.7829 |
| 10 | 314 | 30.913 % | 27.070 % | 85 | 0.9390 |

Taux de défaut observés strictement croissants sur toute l'échelle.

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6047 | intervalle bootstrap à 95 % : [0.5676 ; 0.6365] |
| Stabilité hors-échantillon | 0.0041 | < 0,10 stable |
| Stabilité hors-période | 0.0011 | < 0,10 stable |
| Concentration des grades | 0.1123 | Herfindahl sur la répartition |

| Segment | Effectif | Gini |
|---|---:|---:|
| TPE | 9 793 | 0.6047 |

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

