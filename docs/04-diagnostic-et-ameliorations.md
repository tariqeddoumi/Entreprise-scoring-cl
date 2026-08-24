# Diagnostic du modèle et du tool — constats, corrections et état vérifié

Ce document rend compte du diagnostic mené sur le modèle de scoring entreprises
(TPE / PME / GE) et sur l'outil qui l'exécute, des corrections appliquées, et de
l'état vérifié de l'alignement entre la base de données, le code, l'API et
l'interface. Il est destiné à être lu par le comité modèles et par la fonction
de contrôle permanent : chaque constat est accompagné du contrôle automatisé qui
empêche sa réapparition.

---

## 1. Méthode

Le diagnostic n'a pas consisté à relire le code : il a consisté à **tenter de le
mettre en défaut**. Trois sondes ont été écrites pour cela :

| Sonde | Ce qu'elle cherche |
|---|---|
| `scripts/diagnostics/model-diag.mts` | incohérences internes des grilles : poids, bornes, cas spéciaux, red flags orphelins |
| `scripts/diagnostics/engine-diag.mts` | comportements du moteur face à des entrées hostiles ou dégradées |
| `scripts/check-alignment.mts` | divergences entre le moteur, la validation, le contrat OpenAPI, l'interface et la documentation |

Un constat n'est retenu que s'il est reproductible. Une correction n'est réputée
faite que si le contrôle qui l'atteste **échoue** lorsqu'on réintroduit le
défaut : un contrôle incapable d'échouer ne prouve rien.

---

## 2. Constats sur le modèle

### 2.1 Un cas spécial non déclaré permettait de forcer un score

**Constat.** Les cas particuliers d'un critère (« EBITDA ≤ 0 », « fonds propres
tangibles négatifs »…) n'existaient que sous forme de texte libre
(`specialCasesFr: string[]`), destiné à la documentation. Le moteur, lui,
acceptait n'importe quelle valeur dans le champ `specialCase` d'une entrée et
lui appliquait un score 0. Un appelant de l'API pouvait donc écrire
`{"specialCase": "N_IMPORTE_QUOI"}` sur n'importe quel critère et en forcer la
note, sans que le modèle ait jamais prévu ce cas.

**Correction.** Les cas spéciaux sont désormais **typés et énumérés par le
modèle** :

```ts
export interface SpecialCaseConfig {
  code: string;        // clé acceptée en entrée, ex. EBITDA_LTE_0
  labelFr: string;     // libellé lisible, repris dans l'explication
  score: CriterionScore; // score imposé par la grille
}
```

Le moteur vérifie l'appartenance du code à la liste déclarée par le critère. Un
code inconnu n'est plus un score imposé : la donnée est traitée comme invalide,
avec un avertissement nommant le critère et le code refusé. Le score n'est plus
sous le contrôle de l'appelant.

**Contrôle.** `validate-model.ts` impose l'unicité des codes, un score dans
{0, 25, 50, 75, 100} et un format `^[A-Z][A-Z0-9_]*$`. `check-alignment.mts`
vérifie que les 17 codes figurent à l'identique dans la note méthodologique.

### 2.2 Deux concentrations mesurables étaient traitées à dire d'expert

**Constat.** D4.3 (concentration clients) et D4.4 (concentration fournisseurs)
étaient des critères qualitatifs ancrés, alors que la donnée sous-jacente est
un pourcentage directement observable. Deux analystes pouvaient coter
différemment une même concentration mesurée.

**Correction.** Les deux critères sont devenus quantitatifs, avec des bandes
différenciées par segment pour D4.3 — une concentration de 30 % ne porte pas le
même risque pour une TPE que pour une GE :

| Segment | 100 | 75 | 50 | 25 | 0 |
|---|---|---|---|---|---|
| TPE | ≤ 15 % | ]15 ; 25] | ]25 ; 35] | ]35 ; 50] | > 50 % |
| PME | ≤ 10 % | ]10 ; 20] | ]20 ; 30] | ]30 ; 45] | > 45 % |
| GE | ≤ 10 % | ]10 ; 15] | ]15 ; 25] | ]25 ; 40] | > 40 % |

Le jugement de l'analyste reste requis là où il apporte quelque chose — la
qualité des contreparties concentrées, l'existence de contrats fermes — mais il
ne remplace plus une mesure disponible.

### 2.3 Le plafond de poids par critère était contredit par le modèle TPE

**Constat.** La note méthodologique affirmait qu'aucun critère ne dépasse 6 % du
score global. Le modèle standard respecte bien ce plafond — D3.1, retards de
paiement, y culmine à 6,00 %. Le modèle TPE comportemental, lui, le dépasse
délibérément : B1.1 (DPD et impayés 12/24 mois) pèse 8,00 %, B1.3 (mouvements
créditeurs vérifiés) et B2.1 (couverture du service de dette par flux observés)
7,00 % chacun. Ce dépassement est justifié — sur une TPE, le comportement
bancaire observé est plus fiable que des états financiers tardifs — mais la
règle documentée et la règle appliquée ne coïncidaient pas.

**Correction.** Le plafond est explicité et différencié dans
`validate-model.ts` : 6 % pour le modèle standard, 8 % pour le modèle TPE
comportemental. La validation le fait respecter au démarrage — un poids
au-delà du plafond de son modèle fait échouer le chargement. La note
méthodologique porte désormais la même règle, avec sa justification.

### 2.4 Le modèle acceptait des signaux contredits par ses propres mesures

**Constat.** Un dossier pouvait déclarer le red flag RF06 (« DPD ≥ seuil de
défaut ») tout en renseignant D3.1 à 5 jours de retard. Le moteur appliquait les
deux sans jamais signaler la contradiction.

**Correction.** Le moteur produit désormais `inconsistenciesFr`, qui croise les
signaux déclarés et les données observées : RF06/RF07 contre D3.1, RF08 contre
D3.6, RF09 contre D1.4. Ces incohérences ne modifient pas le score — ce n'est
pas au moteur d'arbitrer — mais elles sont affichées en tête du panneau de
résultat et conservées dans le snapshot, donc opposables en revue.

### 2.5 Aucune explication n'était exploitable en série

**Constat.** Chaque critère produisait une phrase française. Excellente pour
l'analyste, inutilisable pour analyser un portefeuille : impossible de compter
combien de dossiers sont dégradés pour la même raison.

**Correction.** Chaque résultat de critère porte un `reasonCode` structuré
`DOMAINE.CRITERE.SENS.MOTIF` — par exemple `D1.D1_5.NEG.SPECIAL_EBITDA_LTE_0`.
Le code est stable, la phrase reste lisible, et les deux vivent côte à côte. Le
résultat expose la liste des codes classés par contribution au score.

---

## 3. Constats sur l'outil

### 3.1 Aucun moyen d'expliquer l'écart entre deux notations

**Constat.** L'outil produisait des notations mais n'expliquait pas pourquoi une
contrepartie passe de G4 à G6 entre deux arrêtés — la première question posée en
comité.

**Correction.** `src/core/compare.ts` attribue l'écart de score brut critère par
critère : `impact = (score_courant − score_précédent) × poids / 10 000`. La
fonction refuse la comparaison entre modèles différents, entre segments
différents, ou dès qu'une des notations n'a pas de score — comparer un G4 à un
dossier bloqué n'a pas de sens. Elle signale aussi les caps et red flags apparus
ou levés. Exposée par `POST /api/v1/rating-runs/compare` et affichée sur la
fiche contrepartie.

### 3.2 Les fichiers `.mts` échappaient au contrôle de types

**Constat.** Le `include` de `tsconfig.json` couvrait `**/*.ts` et `**/*.tsx`,
mais pas `**/*.mts`. Les scripts — dont le générateur de la note méthodologique
et le vérificateur d'alignement — n'étaient donc **jamais typés**. Le défaut a
été révélé par ses conséquences : le générateur lisait encore `specialCasesFr`,
supprimé du contrat. Régénérée, la note méthodologique avait silencieusement
perdu tous ses « Cas particuliers ».

**Correction.** `**/*.mts` est ajouté au `include`. Le contrôle de types a
immédiatement remonté deux références résiduelles supplémentaires dans les
sondes de diagnostic. Le générateur produit désormais, pour chaque critère
concerné, un tableau code / libellé / score imposé : le lecteur du comité voit
la clé exacte que l'API accepte.

### 3.3 Le vérificateur d'alignement ne couvrait pas la documentation

**Constat.** Le vérificateur contrôlait les routes, les énumérations, la
cohérence des modèles et le formulaire — mais pas la documentation. C'est
précisément par là que la divergence est passée, et c'est la plus coûteuse :
invisible à la lecture, puisque le document paraît complet.

**Correction.** Une cinquième section vérifie que la note méthodologique décrit
tous les critères des deux modèles, tous les codes de cas spéciaux à
l'identique, tous les caps structurels et tous les red flags. Le contrôle a été
validé par test négatif : en réintroduisant un code périmé et un code de critère
modifié, il signale les deux écarts et sort en code 1.

---

## 4. Jeu de démonstration

Le jeu de démonstration existait sous forme de script mais n'avait jamais été
appliqué. Il couvre 10 contreparties fictives, 13 notations et 3 dérogations.

**Principe retenu :** aucune notation n'est écrite à la main. Chaque résultat
est produit par le **moteur réel** (`computeRating`), avec un horodatage fixe.
Le jeu reste donc cohérent avec la version courante du modèle et se régénère si
le modèle évolue — il ne peut pas décrire un comportement que le moteur n'a plus.

Les six comportements du moteur sont couverts :

| Comportement | Occurrences | Illustration |
|---|---:|---|
| `SCORED` | 8 | dont caps CAP01, CAP06, CAP08, cas spéciaux, red flag REFER |
| `BLOCKED_DATA` | 1 | levier critique non renseigné, blocage nommant le critère |
| `BLOCKED_RED_FLAG` | 1 | red flag bloquant |
| `BLOCKED_SEGMENTATION` | 1 | segment indéterminable |
| `DEFAULT_GRADE` | 1 | définition de défaut déclenchée, grade DEF1 forcé |
| `NO_GRADE_CONFIDENCE` | 1 | score calculé, aucun grade produit : qualité insuffisante |

Les trois dérogations couvrent le circuit maker-checker complet : une approuvée
(G4 → G3, qui déplace le grade final), une rejetée (G9 → G7, sans effet sur le
grade), une en attente (G8 → G6, sans décideur). Le générateur SQL rejette une
dérogation à zéro cran, au-delà de deux crans, ou dont le demandeur est aussi le
valideur — les mêmes règles que l'API.

### 4.1 Application et vérification

Les ports PostgreSQL n'étant pas joignables depuis l'environnement d'exécution,
le jeu a été appliqué instruction par instruction sur le schéma `corp_scoring`.
Une transcription manuelle n'étant pas fiable par construction, **chaque
snapshot a été vérifié par empreinte MD5** contre le fichier de référence.

Le contrôle a détecté deux écarts, tous deux corrigés :

- une notation dont le tableau des facteurs défavorables avait été vidé ;
- une notation antérieure à laquelle il manquait la clé `warningsFr`.

Après correction, les 26 empreintes — 13 instantanés d'entrée, 13 instantanés de
résultat — sont conformes.

Les invariants métier ont ensuite été contrôlés en base :

| Contrôle | Anomalies |
|---|---:|
| colonnes indexées cohérentes avec le snapshot | 0 |
| `fromGrade` de la dérogation = grade après caps | 0 |
| demandeur ≠ valideur | 0 |
| dérogation à zéro cran | 0 |
| dérogation approuvée reflétée dans le grade final | 0 |
| dérogation non approuvée sans effet sur le grade | 0 |
| clés d'idempotence en doublon | 0 |
| notations orphelines | 0 |

Deux écarts apparents ont été analysés et retenus comme **conformes au
contrat**, non comme des anomalies :

1. `rawScore` est stocké en `Decimal(9,4)` : `48,4444` en colonne contre
   `48,44444444444444` dans le snapshot. La colonne sert au tri et à
   l'indexation ; le snapshot fait foi. L'écart reste dans la tolérance de la
   colonne (< 1e-4).
2. Une notation porte un grade final G3 alors que son snapshot indique G4 :
   c'est l'effet de la dérogation approuvée. **Le snapshot n'est jamais
   réécrit** — c'est la trace de ce que le moteur a produit, la dérogation étant
   un acte distinct et tracé séparément. Le contrôle affiné ne signale un écart
   que s'il n'est adossé à aucune dérogation approuvée correspondante.

---

## 5. État vérifié

```
Contrôle de types (y compris .mts)   OK
Lint                                 OK
Tests                                101 réussis / 101
Build de production                  OK — 24 routes
Alignement                           aucune divergence (5 sections)
```

L'alignement couvre :

1. **Routes ↔ contrat OpenAPI** — 14 chemins, méthodes comprises.
2. **Énumérations** — `DataStatus`, `Segment`, `RatingOutcome` et les événements
   webhook, comparés entre le moteur, la validation Zod et le contrat.
3. **Cohérence interne des modèles** — somme des poids à 10 000 points de base
   par segment, plafond par critère, déclencheurs de caps tous implémentés.
4. **Interface pilotée par le modèle** — aucun code de critère écrit en dur dans
   le formulaire, et les 10 caps structurels tous atteignables depuis l'écran.
5. **Documentation** — critères, cas spéciaux, caps et red flags tous décrits
   dans la note méthodologique.

Le vérificateur sort en code 1 dès qu'une divergence est détectée : il est
utilisable tel quel en intégration continue.

---

## 6. Limites assumées

Ces points ne sont pas des défauts à corriger : ce sont des choix, à rappeler
explicitement.

- **Le modèle n'est pas calibré.** `pdStatus` vaut `UNCALIBRATED` et aucune PD
  n'est produite. Les poids sont un jugement expert documenté, destiné à être
  challengé sur le portefeuille réel puis remplacé par des coefficients estimés.
  Le grade est une hiérarchisation du risque, pas une probabilité.
- **Les données de démonstration sont fictives.** Le script refuse de s'exécuter
  si `NODE_ENV=production`.
- **L'indication de décision n'est pas une décision.** Le moteur de politique de
  crédit — limites, produit, garanties, délégation — reste distinct et
  prioritaire.
- **Les tables du schéma `public` du projet Supabase partagé n'ont pas été
  modifiées.** Elles appartiennent à d'autres applications ; activer la sécurité
  au niveau des lignes sur leur périmètre relève des équipes qui les exploitent,
  pas de ce chantier. Le schéma `corp_scoring` est isolé, non exposé par
  PostgREST, et donc hors d'atteinte de la clé publique anonyme.
