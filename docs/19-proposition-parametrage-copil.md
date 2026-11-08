# Proposition de paramétrage — COPIL de validation du modèle

**Objet :** proposer, pour chaque paramètre de l'outil de notation des entreprises, une valeur de départ fondée sur les bonnes pratiques bancaires, avec sa justification et les options possibles, afin que le COPIL arrête les valeurs retenues.
**Périmètre :** circuit de validation et délégation, catégories de délégation des centres, critères de classement BAM et levée, watch list, analyse du bilan, règles de saisie et de validité. Les poids et barèmes de la grille relèvent de la note méthodologique.
**Destinataires :** membres du COPIL (Direction des Risques, Engagements, contre-étude, surveillance des risques, réseau, Conformité, Audit interne).
**Version :** 1.0 — novembre 2026. Moteur 3.3.0.

> Toutes les valeurs ci-dessous sont paramétrables dans l'outil, sans développement, et chaque changement est daté et journalisé. Les valeurs proposées sont des points de départ à dire d'expert : elles seront recalées sur les premiers mois d'utilisation, puis sur les défauts observés lors de la calibration statistique. La dernière colonne du tableau de synthèse (§ 9) est à compléter en séance.

## 1. Principes retenus

| Principe | Source | Traduction dans le paramétrage |
|---|---|---|
| La note est attribuée ou approuvée par une fonction qui ne bénéficie pas de l'octroi | Bâle, CRR art. 173 ; pratique BAM | Décision par la contre-étude ; le directeur du centre d'affaires donne un avis |
| Quatre yeux et séparation des fonctions | EBA/GL/2020/06 (octroi et suivi des crédits) | Celui qui saisit ne décide pas ; une personne, une étape ; une fonction par compte |
| Délégation proportionnée au risque | Pratique des banques ; EBA/GL/2020/06 | Niveaux de décision selon le montant, la note et le type de crédit ; durcissement pour les centres à sinistralité élevée |
| Aucune compensation d'une situation dégradée | Circulaire 1/W/2025 ; note méthodologique | Plafonds et défaut issus des critères BAM et de la watch list, appliqués après le score |
| Surveillance pilotée par des signaux d'alerte, décidée et revue en comité | EBA/GL/2020/06 § 8.5 | Watch list par décision de comité, niveaux, revue périodique, renotation imposée |
| Pas de double comptage | Bonne pratique de modélisation | Le plafond le plus sévère s'applique ; un cran de cumul reste une option du COPIL |

## 2. Circuit de validation et délégation

**Proposition.** Le circuit comporte un avis du directeur du centre d'affaires, puis une décision de la contre-étude, dont le niveau dépend du dossier. Seul le niveau le plus élevé qui s'applique décide ; les niveaux inférieurs instruisent (avis bloquant). Une donnée inconnue (montant, note) applique le niveau supérieur.

| Niveau | Décide quand l'une des conditions est remplie | Profil |
|---|---|---|
| Contre-étude | Dans tous les autres cas | P3 — contre-étude |
| Responsable de la contre-étude | Exposition au-delà de 20 MDH, ou note de 8 ou moins bonne | P3 — responsable de la contre-étude |
| Directeur des risques | Exposition au-delà de 50 MDH, ou note de 9 ou 10, ou promotion immobilière | P3 — directeur des risques |
| Comité de crédit (décision enregistrée par la contre-étude) | Exposition au-delà de 100 MDH, ou note de défaut | P3, procès-verbal du comité |

- **Seuils illustratifs.** Ils sont à aligner sur la délégation de pouvoirs en vigueur à la banque ; l'outil reprend celle-ci telle quelle.
- **Montants.** Ils s'entendent en exposition globale banque ou groupe, convertie en dirhams.
- **Note.** La note de référence est celle calculée à la soumission, plafonds compris : une créance sensible (plafond 8) remonte donc au responsable de la contre-étude.

**Avis du directeur du centre d'affaires.**
- Il est non bloquant pour les centres en délégation normale : la contre-étude peut décider sans l'attendre, mais l'avis reste visible.
- Il est bloquant pour les centres en délégation encadrée ou restreinte.
- Un avis défavorable ne rejette pas le dossier : il est porté à la connaissance du décideur.

**Options pour le COPIL.**
- Rendre l'avis bloquant pour tous les centres (circuit plus long, responsabilisation du réseau).
- Ajouter un niveau « directeur régional » (BPR) pour les centres en délégation restreinte.

## 3. Catégories de délégation des centres d'affaires

**Proposition.** Trois catégories, attribuées à chaque centre d'affaires et revues une fois par an. La revue est semestrielle pour les centres en délégation restreinte.

| Indicateur (12 derniers mois) | Seuil d'alerte proposé |
|---|---|
| Part des créances en souffrance dans l'encours du centre | Supérieure à la moyenne du réseau |
| Coût du risque du centre | Supérieur à 1,5 fois la moyenne du réseau |
| Dérogations à la hausse acceptées | Plus de 10 % des notes du centre |
| Dossiers rejetés ou renvoyés par la contre-étude | Plus de 15 % |
| Notes échues non renouvelées | Plus de 10 % des clients notés |
| Constat d'audit ou d'inspection sur la qualité de l'instruction | Constat majeur non levé |

| Catégorie | Règle d'attribution proposée | Effet |
|---|---|---|
| Délégation normale | Aucun seuil dépassé | Avis du directeur non bloquant |
| Délégation encadrée | Un ou deux seuils dépassés, ou centre ouvert depuis moins de 12 mois | Avis du directeur bloquant |
| Délégation restreinte | Trois seuils ou plus, ou créances en souffrance supérieures à 2 fois la moyenne, ou constat d'audit majeur | Avis bloquant ; option : un niveau de décision supplémentaire |

- **Centre sans catégorie.** Il est traité en délégation normale.
- **Attribution.** Elle relève de la Direction des Risques, sur la base du reporting de surveillance. Le calcul automatique des indicateurs viendra avec le module de reporting.

## 4. Critères de classement BAM dans la note

| Famille | Exemples de critères (1/W/2025) | Effet proposé |
|---|---|---|
| Créance sensible | ATD, comptes non reçus à 7 mois, recul du CA de 50 %, dettes financières supérieures à 3 fois les capitaux propres, trois déficits | Note plafonnée à **8** au mieux |
| Créance pré-douteuse | Dépassement ou impayé de plus de 90 jours, situation non évaluable | Note plafonnée à **10** |
| Créance douteuse | Plus de 180 jours, redressement judiciaire | Défaut **DEF1** |
| Créance compromise | Plus de 360 jours, liquidation, action en recouvrement, déchéance du terme | Défaut **DEF3** |

- **Sources des critères.**
  - Les critères calculables sur le bilan se cochent automatiquement.
  - Les autres sont déclarés par le chargé d'affaires, datés et commentés.
  - À terme, les systèmes de la banque (impayés, dépassements, contentieux) les alimenteront.
- **Pluralité.** Quand plusieurs critères sont cochés, c'est la famille la plus sévère qui s'applique.
- **Ce que le plafond change.** Le plafond ne modifie pas le score : il empêche une note meilleure que la classe indiquée. Le score reste conservé pour la surveillance du modèle.

**Levée par le comité.**
- **Qui :** un profil habilité, la contre-étude ou la surveillance. Une personne qui a contribué au dossier ne peut pas l'enregistrer.
- **Comment :** avec la date du comité, le numéro du procès-verbal, le motif et la pièce justificative.
- **Validité :** la levée vaut pour le dossier en cours. Au renouvellement, elle est rappelée ; si le critère est toujours rempli, il s'applique de nouveau et doit être réexaminé.
- **Seconde validation :** proposée **désactivée** pendant six mois de rodage, puis **activée** (cible) — une seconde personne habilitée confirme la levée.

**Options pour le COPIL.**
- Plafond sensible à 7 (plus prudent) ou à 9 (plus tolérant).
- Défaut DEF2 au lieu de DEF1 pour la famille douteuse, selon la définition interne du défaut.

## 5. Watch list

**Principe.**
- L'inscription, le changement de niveau et la sortie sont décidés en comité de surveillance, sur proposition de la surveillance des risques ou du réseau.
- La surveillance (P4) enregistre la décision dans l'outil.
- La watch list ne remplace pas la classification : elle signale un client à suivre de plus près et dégrade la note par un plafond.

### 5.1 Signaux qui proposent une inscription

- Une alerte critique de l'analyse du bilan, ou une situation financière « dégradée » ou « critique ».
- Un critère de créance sensible coché.
- Une dégradation de deux crans ou plus entre deux notations.
- Une note échue de plus de trois mois sans renouvellement.
- Une dérogation à la hausse sur une note de 8 ou moins bonne.
- Plus tard : les impayés, dépassements et incidents remontés par les systèmes de la banque.

### 5.2 Niveaux, effet sur la note et suivi

| Niveau | Situation type | Note plafonnée à | Renotation exigée | Revue par la surveillance |
|---|---|---|---|---|
| WL1 — Sous surveillance | Signaux précoces confirmés, sans défaut ; plan d'action du chargé d'affaires | **8** | Sous 60 jours | Tous les 90 jours |
| WL2 — Surveillance renforcée | Critère de créance sensible avéré ou dégradation persistante ; plan d'action validé par la contre-étude | **9** | Sous 30 jours | Tous les 30 jours |
| WL3 — Pré-recouvrement | Bascule en souffrance probable, restructuration en préparation ; implication du recouvrement | **10** | Sous 15 jours | Tous les 30 jours |

### 5.3 Combinaison avec les critères BAM

**Proposition : le plafond le plus sévère s'applique, sans cumul.**

| Situation | Effet sur la note |
|---|---|
| Créance sensible (plafond 8) et WL1 (plafond 8) | Plafond 8 |
| Créance sensible (8) et WL2 (9) | Plafond 9 : la watch list dégrade la note du client déjà sensible |
| Créance pré-douteuse (10) et WL1 (8) | Plafond 10 |
| Créance douteuse ou compromise | Défaut, quelle que soit la watch list |

**Justification.** Le niveau de watch list traduit l'appréciation du comité, qui dispose de plus d'informations que les critères automatiques. Inscrire en WL2 ou WL3 un client déjà sensible le dégrade donc à 9 ou 10. Cumuler mécaniquement les deux effets compterait deux fois le même signal.

**Option pour le COPIL : un cran de cumul.** Quand un plafond BAM et une watch list s'appliquent ensemble, la note est dégradée d'un cran de plus que le plafond le plus sévère. Exemple : créance sensible et WL1 donnent un plafond de 9 au lieu de 8. L'outil le permet (paramètre « cran supplémentaire en cas de cumul », de 0 à 2).

### 5.4 Sortie de watch list

**Conditions proposées :**
- au moins 6 mois sans nouveau signal ;
- plan d'action réalisé ;
- régularisation des incidents ;
- note renouvelée après l'inscription ;
- décision du comité.

**Durée maximale proposée.** Au-delà de 12 mois en WL1 ou de 6 mois en WL2, le comité statue explicitement : maintien motivé, passage au niveau supérieur ou sortie.

**Historique.** Les inscriptions antérieures se reprennent avec leurs dates d'entrée et de sortie. L'historique complet reste consultable sur la fiche du client.

## 6. Analyse du bilan au chargement

L'analyse informe l'analyste et le valideur ; elle n'entre dans la note que par les critères BAM issus du bilan (§ 4). Seuils proposés pour les principaux indicateurs :

| Indicateur | Bon | Mauvais | Critique |
|---|---|---|---|
| Fonds propres tangibles / total bilan | 25 % et plus | Moins de 10 % | Négatif |
| Endettement / capitaux propres | 1 ou moins | Plus de 2 | Plus de 3 |
| Dette nette / EBE retraité | 2,5 ou moins | Plus de 4 | Plus de 6 |
| Liquidité générale | 1,2 et plus | Moins de 1 | Moins de 0,8 |
| Couverture des intérêts | 4 et plus | Moins de 2 | Moins de 1 |
| Couverture du service de la dette (DSCR) | 1,5 et plus | Moins de 1,2 | Moins de 1 |
| Marge d'EBE | 10 % et plus | Moins de 5 % | Négative |
| Délai clients | 90 jours ou moins | Plus de 120 jours | Plus de 180 jours |
| Croissance du chiffre d'affaires | 5 % et plus | Moins de −10 % | −50 % ou moins |

**Variation significative sur un an.** Une variation de 10 % à 20 % selon l'indicateur suffit pour parler d'amélioration ou de dégradation.

**Situation d'ensemble :**
- **critique** dès une alerte critique ou deux indicateurs critiques ;
- **dégradée** dès deux alertes, un indicateur critique ou trois indicateurs mauvais ;
- **à surveiller** dès une alerte, un indicateur mauvais ou trois dégradations.

**Option.** Différencier les seuils par segment (TPE, PME, GE) ou par secteur, en créant une version du format de bilan par usage.

## 7. Saisie, reprise et validité

| Paramètre | Proposé | Justification |
|---|---|---|
| Bilan exigé pour soumettre (grilles standard) | Oui, exercices N et N−1 équilibrés | Une note d'entreprise repose sur des comptes contrôlés |
| Fraîcheur maximale des comptes | 18 mois | Au-delà, les ratios sont périmés pour la notation |
| Reprise de la dernière note validée | Oui, avec confirmation de chaque champ repris | Une appréciation ancienne ne doit pas passer inaperçue |
| Validité d'une note | 12 mois | Revue annuelle (renouvellement des crédits de fonctionnement) |
| Ampleur maximale d'une dérogation | 2 crans, sous double validation | Au-delà, décision du comité |
| Format du bilan | Bilan complet (préréglage « agrégé » possible pour les TPE) | Comparabilité et calcul de tous les ratios |

## 8. Calendrier proposé

1. **COPIL de validation** : arrêter les valeurs du § 9.
2. **Paramétrage dans l'outil** par l'administrateur du groupe, en versions datées.
3. **Rodage de six mois** : suivi mensuel de la répartition des notes, des plafonds appliqués, des levées, des inscriptions en watch list et des délais du circuit.
4. **Revue à six mois** : recalage des seuils et activation de la seconde validation pour les levées et la watch list.
5. **Calibration statistique** dès que l'historique de défauts le permet (note méthodologique, chapitre 5).

## 9. Synthèse des décisions à prendre

| N° | Paramètre | Valeur proposée | Décision du COPIL |
|---|---|---|---|
| 1 | Avis du directeur du centre | Non bloquant ; bloquant en délégation encadrée ou restreinte | |
| 2 | Niveaux de décision | Contre-étude ; responsable au-delà de 20 MDH ou note 8+ ; directeur des risques au-delà de 50 MDH, note 9-10 ou promotion immobilière ; comité au-delà de 100 MDH ou défaut | |
| 3 | Catégories de délégation des centres | Normale, encadrée, restreinte ; grille d'indicateurs du § 3 ; revue annuelle | |
| 4 | Effet d'une créance sensible | Plafond 8 | |
| 5 | Effet d'une créance pré-douteuse | Plafond 10 | |
| 6 | Effet d'une créance douteuse / compromise | DEF1 / DEF3 | |
| 7 | Profils habilités à lever un critère | Contre-étude et surveillance des risques | |
| 8 | Validité d'une levée | Le dossier en cours, rappel au renouvellement | |
| 9 | Seconde validation des levées et de la watch list | Désactivée 6 mois, puis activée | |
| 10 | Niveaux de watch list et plafonds | WL1 → 8, WL2 → 9, WL3 → 10 | |
| 11 | Cumul watch list et critères BAM | Plafond le plus sévère, sans cran supplémentaire | |
| 12 | Renotation après inscription | 60 / 30 / 15 jours selon le niveau | |
| 13 | Revue des clients en watch list | 90 / 30 / 30 jours selon le niveau | |
| 14 | Conditions et durée maximale de watch list | 6 mois sans signal, plan réalisé ; statuer au-delà de 12 mois (WL1) ou 6 mois (WL2) | |
| 15 | Seuils de l'analyse du bilan | Tableau du § 6 | |
| 16 | Validité d'une note | 12 mois | |
