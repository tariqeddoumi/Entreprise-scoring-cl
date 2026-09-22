# Rapport de calibration — CORP_TPE_BEHAV_V1

*Modèle TPE comportemental — flux bancaires et informations alternatives*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_TPE_BEHAV_V1-SYNTH-20260824` · modèle CORP_TPE_BEHAV_V1 v3.0.0 · graine 20260824 · horizon 12 mois.

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
| 0 | -0.252 | 4.12 % | développement / hors-échantillon |
| 1 | -0.942 | 6.41 % | développement / hors-échantillon |
| 2 | 0.203 | 3.78 % | développement / hors-échantillon |
| 3 | -1.242 | 6.98 % | développement / hors-échantillon |
| 4 | -0.078 | 3.86 % | développement / hors-échantillon |
| 5 | -1.025 | 6.64 % | hors-période |
| 6 | 1.111 | 2.08 % | hors-période |
| 7 | -0.939 | 6.68 % | hors-période |

La PD vraie moyenne du portefeuille — invariante, connue du simulateur seul — vaut **4.26 %**.
Les taux réalisés s'en écartent d'une année sur l'autre sous l'effet du facteur
systématique : c'est cette dispersion qui rend la distinction entre une PD
« travers-le-cycle » et un taux ponctuel observable.

### Population écartée de la calibration

| Motif | Effectif | Part |
|---|---:|---:|
| Déjà en défaut à l'observation | 1 287 | 2.68 % |
| Scoring bloqué (donnée critique) | 2 705 | 5.64 % |
| Aucun grade final (confiance insuffisante) | 22 062 | 45.96 % |

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
| TPE-B1 | 3 713 | 16.9 % | 89.9 | 0 % | 0 % |
| TPE-B2 | 4 809 | 21.9 % | 80.2 | 0 % | 0 % |
| TPE-B3 | 4 651 | 21.2 % | 71.9 | 0 % | 0 % |
| TPE-B4 | 3 679 | 16.8 % | 64.1 | 0 % | 0 % |
| TPE-B5 | 3 000 | 13.7 % | 55.4 | 0 % | 0 % |
| TPE-B6 | 2 094 | 9.5 % | 41.0 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1778**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 1 645 | 0.479 % | 0.304 % | 0.283 % | × 1.69 |
| TPE-B2 | 2 112 | 1.263 % | 1.184 % | 1.070 % | × 1.18 |
| TPE-B3 | 2 046 | 2.888 % | 2.688 % | 2.336 % | × 1.24 |
| TPE-B4 | 1 602 | 5.474 % | 4.931 % | 4.293 % | × 1.28 |
| TPE-B5 | 1 304 | 9.726 % | 8.589 % | 7.714 % | × 1.26 |
| TPE-B6 | 910 | 24.698 % | 22.527 % | 17.922 % | × 1.38 |
| DEF1 (défaut constaté) | — | 100,00 % | — | — | par définition |


La colonne « PD vraie » n'existe que parce que les données sont simulées : sur
données réelles, la PD du processus générateur est inconnaissable. C'est le seul
apport propre de la simulation — mesurer l'erreur de la calibration, et pas
seulement son adéquation apparente.

## 6. Validation

#### Échantillon développement

Effectif 9 619 · 481 défauts · taux observé 5.00 % · PD moyenne affectée 5.54 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6229 | pouvoir de séparation des défauts |
| AUC | 0.8114 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4729 | écart maximal entre sains et défauts |
| Brier | 0.04368 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.1588 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.9350 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 1 645 | 0.479 % | 0.304 % | 5 | 0.8940 |
| TPE-B2 | 2 112 | 1.263 % | 1.184 % | 25 | 0.6550 |
| TPE-B3 | 2 046 | 2.888 % | 2.688 % | 55 | 0.7233 |
| TPE-B4 | 1 602 | 5.474 % | 4.931 % | 79 | 0.8440 |
| TPE-B5 | 1 304 | 9.726 % | 8.589 % | 112 | 0.9260 |
| TPE-B6 | 910 | 24.698 % | 22.527 % | 205 | 0.9414 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-échantillon

Effectif 4 090 · 208 défauts · taux observé 5.09 % · PD moyenne affectée 5.58 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5844 | pouvoir de séparation des défauts |
| AUC | 0.7922 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4399 | écart maximal entre sains et défauts |
| Brier | 0.04513 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.2712 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.5800 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 696 | 0.479 % | 0.287 % | 2 | 0.8463 |
| TPE-B2 | 914 | 1.263 % | 1.422 % | 13 | 0.3721 |
| TPE-B3 | 864 | 2.888 % | 3.009 % | 26 | 0.4433 |
| TPE-B4 | 653 | 5.474 % | 5.666 % | 37 | 0.4386 |
| TPE-B5 | 568 | 9.726 % | 8.451 % | 48 | 0.8646 |
| TPE-B6 | 395 | 24.698 % | 20.759 % | 82 | 0.9713 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-période

Effectif 8 237 · 423 défauts · taux observé 5.14 % · PD moyenne affectée 5.61 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5917 | pouvoir de séparation des défauts |
| AUC | 0.7959 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4599 | écart maximal entre sains et défauts |
| Brier | 0.04568 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0082 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0442 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 1 372 | 0.479 % | 0.583 % | 8 | 0.3381 |
| TPE-B2 | 1 783 | 1.263 % | 1.178 % | 21 | 0.6558 |
| TPE-B3 | 1 741 | 2.888 % | 2.412 % | 42 | 0.8983 |
| TPE-B4 | 1 424 | 5.474 % | 6.461 % | 92 | 0.0600 |
| TPE-B5 | 1 128 | 9.726 % | 8.865 % | 100 | 0.8478 |
| TPE-B6 | 789 | 24.698 % | 20.279 % | 160 | 0.9985 |

Taux de défaut observés strictement croissants sur toute l'échelle.

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6229 | intervalle bootstrap à 95 % : [0.5889 ; 0.6596] |
| Stabilité hors-échantillon | 0.0005 | < 0,10 stable |
| Stabilité hors-période | 0.0004 | < 0,10 stable |
| Concentration des grades | 0.1778 | Herfindahl sur la répartition |

| Segment | Effectif | Gini |
|---|---:|---:|
| TPE | 9 619 | 0.6229 |

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

