# Rapport de calibration — CORP_TPE_BEHAV_V1

*Modèle TPE comportemental — flux bancaires et informations alternatives*

> **Calibration sur données SIMULÉES.** Elle établit que la chaîne de calibration
> fonctionne et que l'échelle de notation ordonne correctement le risque. Elle
> n'établit RIEN sur le niveau réel des probabilités de défaut du portefeuille de
> la banque. Elle ne doit alimenter ni un calcul de provision IFRS 9, ni une
> exigence en fonds propres, ni une décision d'octroi.

Calibration `CORP_TPE_BEHAV_V1-SYNTH-20260824` · modèle CORP_TPE_BEHAV_V1 v3.1.0 · graine 20260824 · horizon 12 mois.

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
| TPE-B1 | 3 471 | 15.6 % | 89.9 | 0 % | 0 % |
| TPE-B2 | 4 771 | 21.4 % | 80.2 | 0 % | 0 % |
| TPE-B3 | 4 735 | 21.2 % | 71.9 | 0 % | 0 % |
| TPE-B4 | 3 855 | 17.3 % | 64.1 | 0 % | 0 % |
| TPE-B5 | 3 196 | 14.3 % | 55.3 | 0 % | 0 % |
| TPE-B6 | 2 275 | 10.2 % | 40.9 | 0 % | 0 % |

Concentration de l'échelle (Herfindahl) : **0.1757**.

Marge de prudence appliquée : **+10 % en relatif**. Plancher : 0.03 %.

## 5. Échelle calibrée

| Grade | Effectif (dév.) | PD affectée | Taux observé (dév.) | PD vraie | Rapport PD affectée / PD vraie |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 1 533 | 0.539 % | 0.130 % | 0.316 % | × 1.70 |
| TPE-B2 | 2 138 | 1.378 % | 1.263 % | 1.037 % | × 1.33 |
| TPE-B3 | 2 049 | 2.971 % | 2.733 % | 2.127 % | × 1.40 |
| TPE-B4 | 1 656 | 5.960 % | 5.435 % | 3.986 % | × 1.50 |
| TPE-B5 | 1 388 | 9.805 % | 8.718 % | 7.424 % | × 1.32 |
| TPE-B6 | 1 029 | 22.625 % | 20.603 % | 17.482 % | × 1.29 |
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
| Brier | 0.04571 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0334 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.3876 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 1 533 | 0.539 % | 0.130 % | 2 | 0.9976 |
| TPE-B2 | 2 138 | 1.378 % | 1.263 % | 27 | 0.7013 |
| TPE-B3 | 2 049 | 2.971 % | 2.733 % | 56 | 0.7544 |
| TPE-B4 | 1 656 | 5.960 % | 5.435 % | 90 | 0.8300 |
| TPE-B5 | 1 388 | 9.805 % | 8.718 % | 121 | 0.9222 |
| TPE-B6 | 1 029 | 22.625 % | 20.603 % | 212 | 0.9451 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-échantillon

Effectif 4 142 · 191 défauts · taux observé 4.61 % · PD moyenne affectée 5.62 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.6029 | pouvoir de séparation des défauts |
| AUC | 0.8014 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4660 | écart maximal entre sains et défauts |
| Brier | 0.04070 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0061 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.0587 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 649 | 0.539 % | 0.770 % | 5 | 0.2736 |
| TPE-B2 | 860 | 1.378 % | 1.163 % | 10 | 0.7461 |
| TPE-B3 | 919 | 2.971 % | 2.394 % | 22 | 0.8724 |
| TPE-B4 | 725 | 5.960 % | 3.448 % | 25 | 0.9992 |
| TPE-B5 | 599 | 9.805 % | 7.346 % | 44 | 0.9848 |
| TPE-B6 | 390 | 22.625 % | 21.795 % | 85 | 0.6713 |

Taux de défaut observés strictement croissants sur toute l'échelle.

#### Échantillon hors-période

Effectif 8 368 · 435 défauts · taux observé 5.20 % · PD moyenne affectée 5.78 %.

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini | 0.5938 | pouvoir de séparation des défauts |
| AUC | 0.7969 | aire sous la courbe ROC |
| Kolmogorov-Smirnov | 0.4570 | écart maximal entre sains et défauts |
| Brier | 0.04600 | erreur quadratique de la PD |
| Adéquation par grade | p = 0.0885 | valeur-p faible = désaccord PD / défauts |
| Adéquation avant marge | p = 0.6194 | isole l'effet de la marge de prudence |

| Grade | Effectif | PD affectée | Taux observé | Défauts | p (sous-estimation) |
|---|---:|---:|---:|---:|---:|
| TPE-B1 | 1 289 | 0.539 % | 0.621 % | 8 | 0.3930 |
| TPE-B2 | 1 773 | 1.378 % | 1.072 % | 19 | 0.8902 |
| TPE-B3 | 1 767 | 2.971 % | 2.320 % | 41 | 0.9578 |
| TPE-B4 | 1 474 | 5.960 % | 5.902 % | 87 | 0.5530 |
| TPE-B5 | 1 209 | 9.805 % | 8.850 % | 107 | 0.8789 |
| TPE-B6 | 856 | 22.625 % | 20.210 % | 173 | 0.9595 |

Taux de défaut observés strictement croissants sur toute l'échelle.

### Stabilité et concentration

| Indicateur | Valeur | Lecture |
|---|---:|---|
| Gini développement | 0.6047 | intervalle bootstrap à 95 % : [0.5676 ; 0.6365] |
| Stabilité hors-échantillon | 0.0027 | < 0,10 stable |
| Stabilité hors-période | 0.0007 | < 0,10 stable |
| Concentration des grades | 0.1757 | Herfindahl sur la répartition |

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

