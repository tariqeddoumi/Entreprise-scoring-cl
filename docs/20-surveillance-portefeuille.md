# 20 — Surveillance du portefeuille : KRI, KPI, migrations, concentration, alertes

> Point 3 de la feuille de route. Écran **Surveillance** (`/surveillance`), export CSV, paramétrage des seuils (Administration › Paramétrage). Décision D-59. Seuils et responsables **proposés, à arrêter en COPIL**.

## 1. Objet et principes

La surveillance donne au comité des risques, à la surveillance (P4), à la contre-étude (P3) et aux directeurs de centre (P2) une lecture de la qualité du portefeuille et du dispositif de notation, dans leur périmètre. Les principes retenus suivent les pratiques de reporting du risque de crédit (BCBS 239 « Principles for effective risk data aggregation and risk reporting », pratiques de revue de portefeuille des banques marocaines et des agences de notation) :

1. **La note est connue à la date où elle fait foi** (validation), pas à sa date d'arrêté. Une photographie au 31 mars ne montre pas une note validée en avril sur un bilan de décembre : le passé ne se réécrit pas.
2. **Seules les notes qui font foi** comptent : validées en fin de circuit, ou antérieures au workflow. Une notation soumise ou une renotation de lot (surveillance) n'est qu'une proposition.
3. **Parts en exposition**, effectifs à côté. La note moyenne est pondérée par l'exposition, sur les seuls performants : le défaut n'est pas une « note 11 ».
4. **Matrice de migration par cohorte** : clients notés au début et à la fin de la période. Les entrées (pas de note au début) et les sorties ou notes **non renouvelées** (expirées à la fin, client inactif) sont comptées à part : les mêler ferait passer une note périmée pour une note « stable ».
5. **Un client garde son segment sur tout l'historique** (celui de sa dernière note), pour qu'une ligne de la matrice ne change pas de segment en cours de période.
6. **Lecture seule, cloisonnée** : chaque personne ne voit que son périmètre (banque, filiale, centre). Filtres en tête de page, appliqués à toute la page et à l'export.

## 2. Catalogue des indicateurs

| Indicateur | Type | Définition | Orange | Rouge | Fréquence | Responsable |
|---|---|---|---|---|---|---|
| Note moyenne pondérée | KRI | Moyenne des notes des performants, pondérée par l'exposition | ≥ 6 | ≥ 7 | Mensuelle | Surveillance |
| Exposition en risque élevé | KRI | Part de l'exposition en classes 8 à 10 (paramétrable), défaut exclu | ≥ 15 % | ≥ 25 % | Mensuelle | Surveillance |
| Exposition en défaut | KRI | Part de l'exposition en DEF1 à DEF3 | ≥ 3 % | ≥ 5 % | Mensuelle | Surveillance |
| Exposition en watch list | KRI | Part de l'exposition des clients inscrits à la date | ≥ 5 % | ≥ 10 % | Mensuelle | Surveillance |
| Taux de dégradation | KRI | Part de la cohorte dégradée d'au moins un cran (défaut compris) | ≥ 15 % | ≥ 25 % | Trimestrielle | Surveillance |
| Solde des migrations | KRI | Dégradations moins améliorations, en % de la cohorte | ≥ 5 pt | ≥ 10 pt | Trimestrielle | Surveillance |
| Concentration des 10 premiers | KRI | Part de l'exposition des dix premiers clients | ≥ 30 % | ≥ 40 % | Mensuelle | Surveillance |
| Couverture de la notation | KPI | Clients actifs dotés d'une note en cours de validité | ≤ 95 % | ≤ 90 % | Mensuelle | Contre-étude / réseau |
| Notes expirées | KPI | Clients notés dont la note a dépassé la validité (12 mois) | ≥ 5 % | ≥ 10 % | Mensuelle | Réseau |
| Taux de dérogation | KPI | Notes validées sur la période dont la note finale diffère de celle du modèle (sens indiqué) | ≥ 10 % | ≥ 20 % | Trimestrielle | Validation des modèles |
| Délai d'instruction (médiane) | KPI | Jours entre soumission et décision finale | ≥ 15 j | ≥ 30 j | Mensuelle | Contre-étude |
| Watch list en retard | KPI | Clients en watch list dont la revue ou la renotation imposée par le niveau a dépassé son délai | ≥ 1 | ≥ 5 | Hebdomadaire | Surveillance |

Chaque tuile affiche la valeur, le feu (icône et libellé, jamais la couleur seule), la variation sur l'horizon, la tendance des 12 derniers mois et les seuils en vigueur.

## 3. Contenu de l'écran

- **Synthèse** : exposition notée, clients notés et actifs, watch list, notes validées sur l'horizon, alerte sur les clients sans exposition connue.
- **KRI et KPI** (§ 2).
- **Évolution sur 24 mois** (photographie de fin de mois) : parts en risque élevé, défaut et watch list ; note moyenne pondérée ; couverture et notes expirées ; exposition notée. Données mensuelles en tableau.
- **Répartition par classe** : part de l'exposition par classe au début et à la fin de l'horizon (effectifs au survol et en tableau).
- **Matrice de migration** (horizon 3, 6, 12 ou 24 mois) : amélioration en bleu sous la diagonale, dégradation en rouge au-dessus, intensité selon la part de la ligne ; effectif écrit dans chaque case ; colonne « sortie / non renouvelée » ; taux, solde, variation moyenne en crans, passages en défaut, entrées.
- **Ventilations** par segment, secteur et entité : clients, exposition, part, note moyenne, risque élevé, défaut, watch list, taux de dégradation de la cohorte.
- **Concentration** : vingt premières expositions, part et cumul, marques watch list et note expirée.
- **Alertes** : dégradations fortes (2 crans ou plus, paramétrable), passages en défaut, échéances de la watch list (revue et renotation, retards), notes expirées, notes à renouveler dans les deux mois.
- **Catalogue** des indicateurs avec les seuils en vigueur.
- **Export CSV** (Excel FR) : portefeuille (photographie), migrations (mouvements et matrice), indicateurs, évolution.

## 4. Accès et paramétrage

- Accès : gestionnaire des risques et administrateur, ou fonction dotée du droit **VOIR_SURVEILLANCE** (par défaut : directeur de centre, contre-étude, responsable de la contre-étude, directeur des risques, surveillance). Un circuit déjà enregistré en base garde ses droits : ajouter le droit aux fonctions voulues dans Paramétrage › Circuit.
- Paramétrage (administrateur du groupe, journalisé) : seuils orange et rouge de chaque indicateur, première classe de risque élevé (8), horizon par défaut (12 mois), dégradation forte (2 crans). Les seuils incohérents (rouge moins sévère qu'orange) sont refusés.

## 5. Limites et suites proposées

1. **Exposition** : c'est l'engagement global déclaré au dossier (converti en devise de base), au moment de la note, pas l'encours du jour. Proposition : un **flux d'encours mensuel** du système de crédit (identifiant client, date d'arrêté, encours bilan, hors bilan, impayés, classement comptable), qui remplacera cette exposition dans tous les indicateurs et ouvrira des KRI supplémentaires (impayés à 30 / 60 / 90 jours, utilisation des autorisations, encours sensibles ou non performants au sens BAM).
2. **Taux de défaut observé par classe** (back-testing) : il suppose un historique de défauts daté ; il viendra avec la reprise du stock (point 4) et la calibration.
3. **Secteurs** : affichés par code tant que le référentiel sectoriel n'est pas alimenté (docs sur le référentiel NMA 2010).
4. **Volumétrie** : les calculs se font à la volée sur les notes du périmètre. Au-delà de quelques dizaines de milliers de notes, prévoir une photographie mensuelle stockée (table d'agrégats) produite par un traitement de fin de mois.
5. **Diffusion** : un reporting mensuel au comité des risques (export, puis édition PDF) est à définir avec la surveillance.
