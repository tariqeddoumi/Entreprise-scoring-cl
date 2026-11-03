# Couverture des critères Bank Al-Maghrib dans le modèle de notation

**Objet :** vérifier, critère par critère, que les critères de classification des circulaires 1/W/2025 et 19/G/2002 sont intégrés dans le modèle de notation ; identifier ceux qui ne le sont pas et dire comment les intégrer.
**Modèle examiné :** moteur 3.2.0 — grilles CORP_STD_V1 (TPE, PME, GE) et CORP_TPE_BEHAV_V1 (TPE comportementale), signaux d'alerte RF01 à RF18, exceptions NC01 à NC04, politique de défaut DEF-2026.1, module bilan.
**Textes :** circulaire 1/W/2025 du 15 décembre 2025 (en vigueur à partir du 1er janvier 2027, mise en œuvre progressive : article 53) ; circulaire 19/G/2002 du 23 décembre 2002 modifiée le 9 décembre 2004 (abrogée par l'article 54 de la 1/W/2025).
**Date :** 2 novembre 2026.

> Périmètre. Cette revue porte uniquement sur la présence des critères dans le modèle de notation. La classification réglementaire des créances (saine, sensible, pré-douteuse, douteuse, compromise) n'est pas mise en œuvre par l'outil et pourra être ajoutée dans un second temps : la dernière section décrit comment. Une note, même mauvaise, ne vaut jamais classement ; à l'inverse, un critère de classement ne doit jamais pouvoir être compensé par d'autres critères favorables.

## 1. Synthèse

**Comment lire les statuts.**

- **Intégré** : le critère est mesuré par le modèle (facteur pondéré, exception ou signal) avec un contenu équivalent.
- **Partiel** : un indicateur voisin existe (même thème, seuil ou durée différents, ou donnée déclarative non datée) ; le critère n'est pas reproduit exactement.
- **Absent** : aucune donnée ni règle du modèle ne le couvre.
- **Hors notation** : la disposition relève de la comptabilité, du provisionnement ou du reporting, pas de l'appréciation du risque de la contrepartie.

| Circulaire | Critères recensés | Intégrés | Partiels | Absents | Hors notation |
|---|---|---|---|---|---|
| 1/W/2025 — créances sensibles (art. 5 à 7) | 22 | 3 | 11 | 8 | 0 |
| 1/W/2025 — créances en souffrance (art. 8 à 16, 32 à 46) | 34 | 3 | 24 | 6 | 1 |
| 1/W/2025 — restructurations (art. 17 à 31) | 15 | 0 | 7 | 6 | 2 |
| 1/W/2025 — dispositions générales (art. 47 à 53) | 6 | 2 | 2 | 0 | 2 |
| 19/G/2002 — classification (art. 2 à 33) | 31 | 9 | 17 | 3 | 2 |
| **Total** | **108** | **17** | **61** | **23** | **7** |

**Ce qu'il faut retenir.**

1. **Les thèmes des deux circulaires sont tous présents dans la grille** : retards de paiement, dépassements, mouvements créditeurs, incidents, documentation, secteur, dirigeants, litiges, concentrations, restructuration, groupe, procédures collectives. La 19/G/2002 formule la plupart de ses critères qualitatifs sans seuil : sur ces critères, le modèle est conforme.
2. **Les seuils chiffrés de la 1/W/2025 ne sont pas reproduits exactement** : 90/180/360 jours par produit, dépassement de plus de 10 % de l'autorisation pendant une durée continue, recul du chiffre d'affaires de 50 % sur un an, dettes financières / capitaux propres supérieur à 3 (ou 5), trois exercices déficitaires, comptes non reçus 7 mois après la clôture, perte des trois quarts ou du tiers de la situation nette, neuf échéances mensuelles impayées.
3. **Quatre familles sont absentes du modèle** : les projets financés (art. 5-3, 12-7, 12-8), les titres de dette (art. 5-4, 10-5, 12-6), la trajectoire chiffrée des restructurations (art. 22, 25 à 30) et le compteur des neuf échéances impayées (art. 13). Les projets et les titres relèvent d'autres dispositifs que la grille des entreprises ; le routage doit être explicite.
4. **Un retard de plus de 90 jours ou une procédure collective ne force pas aujourd'hui le défaut** si le constat n'est pas transmis au moteur : le signal RF06 ou RF05 alerte, il n'impose rien. C'est la correction prioritaire, et elle tient dans la note sans attendre la classification (§ 7, lot A).
5. **Seize critères peuvent être couverts immédiatement par sept règles** fondées sur des données déjà saisies (bilan sur trois exercices, capital social, forme juridique, retards déclarés) : seuils exacts de la 1/W/2025 sous forme de signaux d'alerte et de grades de défaut imposés (§ 7, lot A). Les autres exigent des données datées par créance (échéancier, autorisations, restructurations) issues des systèmes de la banque.

## 2. Créances sensibles — circulaire 1/W/2025

Une créance sensible présente des motifs d'inquiétude sans répondre à un critère de créance en souffrance (art. 4). Le critère de souffrance, s'il existe, prévaut.

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| S01 | 5-1 | Saisie-arrêt ou avis à tiers détenteur reçu par la banque, impactant le fonctionnement normal du compte | D6.4 Situation juridique, fiscale et sociale (repère 25 : « saisie ») ; RF11 Dette fiscale/sociale ou saisie matérielle | Partiel | Fait daté « saisie / ATD reçu » (date, montant, effet sur le compte, levée), saisi ou alimenté par le système des oppositions ; signal d'alerte propre, revue obligatoire. |
| S02 | 5-2 | États comptables annuels non reçus 7 mois après la date de clôture | D6.2 Délai de production de l'information (barème 120 / 180 / 240 / 365 jours) ; fraîcheur du bilan à 18 mois | Partiel | Calculer à la date de notation le délai depuis la dernière clôture attendue (clôture + 7 mois) ; signal « comptes annuels non reçus à 7 mois ». Le barème D6.2 reste un facteur de note. |
| S03 | 5-2 | Information négative significative du crédit bureau | D3.7 Tendance de l'endettement système et groupe ; D3.5 | Partiel | Champ structuré « information crédit bureau » (date, nature, matérialité, source) ; signal si négative et significative. |
| S04 | 5-2 | Information négative significative du Service central des incidents de paiement (SCIP) | D3.5 Incidents chèques et effets de commerce | Intégré | — (ajouter la date et la source de l'incident pour la classification). |
| S05 | 5-2 | Information négative des rapports des commissaires aux comptes | D6.1 Qualité / certification des états financiers ; RF10 Opinion défavorable / refus de certifier | Intégré | — (distinguer réserve, refus et observation sur la continuité). |
| S06 | 5-2 | Toute autre information négative susceptible d'affecter la capacité à honorer les engagements | RF12, RF13, RF14, RF16 ; D5, D6 | Partiel | Liste de motifs qualitatifs fermée et datée, avec pièce justificative et validation ; aujourd'hui commentaire libre. |
| S07 | 5-2 | Mouvements créditeurs confiés sur l'année anormalement faibles au regard des utilisations des lignes autorisées | D3.4 Mouvements créditeurs et domiciliation (% des flux attendus) ; D3.3 Utilisation des lignes ; TPE B1.3, B1.4 | Partiel | Ratio annuel « mouvements créditeurs / utilisations moyennes autorisées » calculé depuis les comptes ; seuil d'anomalie à fixer par la banque ; signal. |
| S08 | 5-3 | Projet financé : pas d'information sur l'avancement des travaux ou la commercialisation | — | Absent | Hors grille entreprises : suivi de projet (promotion immobilière, financement de projet) avec date du dernier rapport d'avancement. Routage explicite vers l'outil Project Finance. |
| S09 | 5-3 | Projet : taux de commercialisation inférieur à 50 % un an après la fin des travaux | — | Absent | Même dispositif : date d'achèvement, taux commercialisé ; test à la date anniversaire. |
| S10 | 5-3 | Projet : problèmes administratifs depuis plus d'un an (autorisation, permis d'habiter, éclatement du titre foncier) | — | Absent | Même dispositif : date de la demande, date d'obtention. |
| S11 | 5-3 | Projet : retard de construction de plus d'un an sur le planning initial | — | Absent | Même dispositif : planning initial figé, date d'achèvement prévue et constatée. |
| S12 | 5-3 | Projet : réalisations commerciales en décalage significatif avec le business plan initial | D4.5 Visibilité des revenus (indirect) | Absent | Même dispositif : business plan initial conservé, réalisations, seuil « significatif » à fixer. |
| S13 | 5-4 | Contrepartie émettrice de dette privée dont le remboursement inquiète (refinancement par nouvelle émission, reprofilage) | D2.4 Liquidité disponible et mur de dette (indirect) | Absent | Champ « émetteur de titres de dette » et motif (refinancement, reprofilage) ; signal. Les titres eux-mêmes relèvent du portefeuille titres. |
| S14 | 5-5 | Événement touchant les principaux dirigeants ou actionnaires (décès, dissolution…) | D5.2 Dépendance homme-clé et succession ; TPE B4.2, B4.4 | Partiel | Fait daté « événement dirigeant / actionnaire » (nature, date, effet) ; signal et revue obligatoire. D5.2 mesure le risque, pas l'événement. |
| S15 | 5-5 | Problèmes de gestion ou litiges entre associés ou actionnaires | D5.3 Gouvernance et contrôle interne ; RF12 Litige menaçant la continuité | Partiel | Fait daté « litige entre associés » avec gravité ; signal. |
| S16 | 5-5 | Difficultés du secteur d'activité de la contrepartie | D4.1 Risque sectoriel interne ; TPE B3.1 | Intégré | — (la note sectorielle ne suffit pas au classement : appréciation individuelle). |
| S17 | 5-5 | Dépendance excessive vis-à-vis d'un client ou d'un fournisseur lui-même en difficulté | D4.3 Concentration clients, D4.4 Concentration fournisseurs ; TPE B3.3 ; RF13 | Partiel | Ajouter « partenaire concentrant plus de x % en difficulté » (oui/non, nature) au critère de concentration ; signal. |
| S18 | 5-5 | Recul de 50 % ou plus du chiffre d'affaires en un an | Indicateur CROISSANCE_CA calculé par le module bilan ; D1.1 Croissance et stabilité du CA (repère 0 : effondrement > 25 %) | Partiel | **Intégrable immédiatement** : signal automatique si CA N / CA N−1 − 1 ≤ −50 %. |
| S19 | 5-5 | Dettes financières / capitaux propres supérieur à 3 (supérieur à 5 pour les financements spécialisés) | Indicateur GEARING (dette brute économique / capitaux propres) calculé par le module bilan, non noté ; D1.4 Fonds propres tangibles / total bilan, D1.5 Dette nette / EBITDA | Partiel | **Intégrable immédiatement** : signal automatique si dettes financières / capitaux propres > 3 (> 5 si financement spécialisé, case à cocher) ; capitaux propres nuls ou négatifs = critère rempli. Définition des dettes financières à valider (avec ou sans trésorerie passif et crédit-bail). |
| S20 | 5-5 | Résultats déficitaires significatifs sur 3 ans successifs, entreprise d'au moins 5 ans d'activité, sans augmentation de capital sur les 3 dernières années | NC03 EBE négatif deux années sur trois (plafond) ; résultat net et capital social saisis sur trois exercices ; TPE B3.2 Ancienneté | Partiel | **Intégrable immédiatement** : signal si résultat net < 0 sur les 3 exercices, ancienneté ≥ 5 ans (date de création à ajouter à la fiche client) et capital N = capital N−2. Le seuil « significatif » est à fixer. |

**Dispositions associées.**

| N° | Article | Disposition | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| S21 | 6 | Une créance remplissant un critère de l'article 5 n'est déclarée non sensible qu'avec l'approbation du comité des risques émanant de l'organe d'administration, qui en rend compte | Dérogation de note (deux crans, double validation) | Absent | Circuit d'exception distinct de la dérogation de note : motif, pièces, décision du comité des risques, date, compte rendu. À prévoir avec la classification. |
| S22 | 7 | Levée du ou des critères : retour en créance saine (hors restructuration) | — | Absent (classification) | Relèvera du moteur de classification : sortie automatique dès qu'aucun critère n'est actif, trace de la levée. |

## 3. Créances en souffrance — circulaire 1/W/2025

### 3.1 Définition (art. 8)

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| E01 | 8 | Au moins une échéance impayée depuis plus de 90 jours | D3.1 Retards de paiement / DPD (score 0 au-delà de 60 jours) ; TPE B1.1 ; RF06 ; DEF1 si le défaut est transmis | Partiel | **Correction prioritaire** : un retard déclaré supérieur à 90 jours doit imposer le défaut (DEF1) dans la note, même si le constat amont n'est pas transmis. Aujourd'hui RF06 alerte sans forcer. |
| E02 | 8 | Paiement intégral jugé improbable, indépendamment de tout impayé | RF06 (UTP) ; NC02 Incertitude sur la continuité ; DEF2 | Partiel | Case « improbabilité de paiement constatée » avec motif et validation : impose DEF2. |

### 3.2 Créances pré-douteuses (art. 10)

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| E03 | 10-1 | Dépassement de plus de 90 jours, supérieur à 10 % de l'autorisation, sur lignes de fonctionnement et découverts (décompte : limite notifiée, avertissement, tirage sans autorisation) | D3.2 Dépassements et irrégularités (repère 0 : plus de 30 jours ou plus de 10 %) ; TPE B1.2 | Partiel | Durée continue du dépassement (jours) et montant en % de l'autorisation, depuis le système des comptes ; règle « > 90 jours et > 10 % ». Mise en œuvre sur 7 ans au plus (art. 53). |
| E04 | 10-2 | Crédit amortissable : échéance non réglée 90 jours après son terme | D3.1 / B1.1 (retard global, sans distinction de produit) | Partiel | Retard par contrat et par produit (amortissable, in fine, crédit-bail) issu de l'échéancier. |
| E05 | 10-3 | Crédit remboursable en une seule échéance non honoré 90 jours après son terme | D3.1 / B1.1 | Partiel | Même donnée par produit. |
| E06 | 10-4 | Loyers de crédit-bail ou de location avec option d'achat non réglés 90 jours après leur terme | D3.1 / B1.1 | Partiel | Même donnée par produit. |
| E07 | 10-5 | Titres de créance : coupons impayés 90 jours après l'échéance | — | Absent | Portefeuille titres (émetteur, coupon, date) ; hors grille entreprises, mais à rattacher à la contrepartie. Mise en œuvre sur 7 ans au plus. |
| E08 | 10-6 | Situation financière non évaluable faute d'information ou de documentation | Données critiques manquantes : pas de note (NO_RATING) ; RF16 Information critique manquante ; bilan obligatoire à la soumission | Partiel | L'absence de note doit produire un constat « situation non évaluable faute de documentation », transmis à la classification, et pas seulement un dossier sans note. |
| E09 | 10-7 | Recouvrement incertain, indépendamment de tout impayé, du fait de la dégradation de la situation (considérations de l'art. 5-5) ou pour toute autre raison | Domaines D1, D2, D4, D5 ; NC01 à NC03 ; RF06 | Partiel | Appréciation qualitative motivée et validée (« recouvrement incertain »), avec les faits S14 à S20 qui la fondent. |

### 3.3 Créances douteuses (art. 11)

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| E10 | 11-1 | Dépassement de plus de 180 jours, supérieur à 10 % de l'autorisation | D3.2 / B1.2 | Partiel | Comme E03 au seuil de 180 jours. Mise en œuvre sur 7 ans au plus. |
| E11 | 11-2 | Compte à vue débiteur sans mouvements créditeurs réels couvrant les agios et une part significative du solde pendant 180 jours | D3.4 Mouvements créditeurs ; TPE B1.3, B2.3 Solde minimum et jours débiteurs | Partiel | Calcul sur 180 jours glissants : mouvements créditeurs réels (hors virements internes, hors déblocages) ≥ agios + part significative du solde. |
| E12 | 11-3 | Crédit amortissable : échéance non réglée 180 jours après son terme | D3.1 / B1.1 | Partiel | Retard par produit. |
| E13 | 11-4 | Crédit à échéance unique non honoré 180 jours après son terme | D3.1 / B1.1 | Partiel | Retard par produit. |
| E14 | 11-5 | Loyers de crédit-bail non réglés 180 jours après leur terme | D3.1 / B1.1 | Partiel | Retard par produit. |
| E15 | 11-6 | Contrepartie déclarée en redressement judiciaire | RF05 Liquidation, cessation ou procédure ; DEF3 si transmis | Partiel | Fait daté « redressement judiciaire » : impose DEF3 dans la note (aujourd'hui alerte). |
| E16 | 11-7 | Recouvrement incertain du fait de la dégradation de la situation ou pour toute autre raison | Comme E09 | Partiel | Comme E09, au degré « douteux ». |

### 3.4 Créances compromises (art. 12 et 13)

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| E17 | 12-1 | Dépassement de plus de 360 jours, supérieur à 10 % de l'autorisation | D3.2 / B1.2 | Partiel | Comme E03 au seuil de 360 jours. Mise en œuvre sur 5 ans au plus. |
| E18 | 12-2 | Compte à vue débiteur sans mouvements créditeurs réels suffisants pendant 360 jours | D3.4 / B1.3 / B2.3 | Partiel | Comme E11 sur 360 jours. |
| E19 | 12-3 | Crédit amortissable : échéance non réglée 360 jours après son terme | D3.1 / B1.1 | Partiel | Retard par produit. |
| E20 | 12-4 | Crédit à échéance unique non honoré 360 jours après son terme | D3.1 / B1.1 | Partiel | Retard par produit. |
| E21 | 12-5 | Loyers de crédit-bail impayés 360 jours après leur terme | D3.1 / B1.1 | Partiel | Retard par produit. |
| E22 | 12-6 | Titres de créance : coupons impayés 180 jours après l'échéance | — | Absent | Portefeuille titres (seuil 180 jours, pas 360). Mise en œuvre sur 7 ans au plus. |
| E23 | 12-7 | Projet achevé depuis deux ans et plus, commercialisation stagnante depuis un an au point de ne pas permettre le remboursement | — | Absent | Suivi de projet (cf. S08). Mise en œuvre sur 7 ans au plus. |
| E24 | 12-8 | Projet à l'arrêt depuis plus d'un an | — | Absent | Suivi de projet : date d'arrêt, reprise. Mise en œuvre sur 7 ans au plus. |
| E25 | 12-9 | Perte de 75 % (société anonyme) ou du tiers (autre forme) de la situation nette, sans assemblée générale extraordinaire réunie dans les délais pour décider de la continuité | RF09 Fonds propres négatifs sans plan ferme ; D1.4 ; capital social, capitaux propres et forme juridique saisis | Partiel | **Intégrable immédiatement** : comparer capitaux propres et capital social selon la forme juridique ; case « AGE de continuité tenue dans les délais » ; signal compromis si critère rempli sans AGE. |
| E26 | 12-9 | Action en justice introduite contre la contrepartie pour le recouvrement des créances | DEF3 (« passage en recouvrement contentieux ») si transmis | Partiel | Fait daté « action en recouvrement » ; impose DEF3. |
| E27 | 12-9 | Contestation judiciaire, par la contrepartie, de tout ou partie des créances | RF12 Litige menaçant la continuité (indirect) | Partiel | Fait daté « contestation judiciaire des créances » ; signal compromis. |
| E28 | 12-9 | Cessation d'activité ou liquidation judiciaire | RF05 ; DEF3 si transmis | Partiel | Fait daté : impose DEF3 dans la note (aujourd'hui alerte). |
| E29 | 12-9 | Déchéance du terme ou résiliation du contrat de crédit-bail | — | Absent | Fait daté par contrat ; impose DEF3. |
| E30 | 13 | Crédit amortissable mensuel : 9 échéances impayées cumulées | — | Absent | Compteur d'échéances impayées par contrat (indépendant de la durée de 360 jours). |

### 3.5 Règles générales de classement

| N° | Article | Disposition | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| E31 | 14 | Dérogation pour retards techniques sur crédits aux particuliers | Sans objet : le modèle ne note que des entreprises | Intégré | — (ne jamais étendre cette exception aux entreprises). |
| E32 | 15 | Le classement d'une créance entraîne celui de toutes les créances sur la même contrepartie (sauf particuliers) | La note est unique par contrepartie | Intégré | — (pour la classification : propager la catégorie à toutes les créances du débiteur). |
| E33 | 16 | Classement quelles que soient les garanties | La grille ne contient aucun critère de garantie : la note est intrinsèque | Intégré | — |
| E34 | 32 à 46 | Provisionnement, garanties éligibles, quotités, agios réservés | — | Hors notation | Système comptable et de provisionnement ; à rapprocher de la classification. |

## 4. Restructurations — circulaire 1/W/2025

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| R01 | 17 | Définition : réaménagement (capital, rémunération, durée…) accordé en raison de difficultés financières ; présomption si opéré pour éviter un impayé ou si le financement rembourse un impayé ; exclusion des réaménagements commerciaux | D3.6 Restructuration et forbearance (déclaratif) ; RF08 ; DEF2 | Partiel | Événement « restructuration » par contrat : difficulté financière (oui/non), concession, ancien et nouveau contrat, présomptions (impayé évité, impayé remboursé) ; exclusion motivée du réaménagement commercial. |
| R02 | 18 | Viabilité démontrée avant restructuration ; à défaut, classement en douteux | D2.2 DSCR, D2.5 Stress (indirect) | Absent | Dossier de viabilité joint (plan de trésorerie, hypothèses, avis indépendant) ; restructuration sans viabilité démontrée = critère douteux. |
| R03 | 19 | Abandon de principal ou de rémunération constaté en pertes | — | Hors notation | Comptabilité. |
| R04 | 20 | Décote de la créance restructurée | — | Hors notation | Comptabilité. |
| R05 | 21 | Première restructuration d'une créance saine : évaluer sensible ou souffrance ; d'une créance sensible : évaluer souffrance | D3.6 (repère 25) | Partiel | Évaluation obligatoire tracée à chaque restructuration (revue imposée par l'outil). Mise en œuvre sur 3 ans (souffrance) ou 10 ans (sensible). |
| R06 | 22 | Première restructuration avec différé d'un an ou plus : au minimum sensible | — | Absent | Durée du différé dans l'événement de restructuration ; règle « ≥ 1 an ⇒ sensible au minimum ». Mise en œuvre sur 10 ans au plus. |
| R07 | 23 | Seconde restructuration : évaluer souffrance | D3.6 (repère 0 : « seconde concession ») ; RF08 | Partiel | Rang de la restructuration (1re, 2e, 3e) calculé et non déclaré. Mise en œuvre sur 3 ans au plus. |
| R08 | 24 | Créance saine restructurée deux fois : au minimum sensible | D3.6 ; RF08 | Partiel | Même compteur. Mise en œuvre sur 10 ans au plus. |
| R09 | 25 | Seconde restructuration pendant la période d'observation de la première : douteuse | — | Absent | Croisement de la date de la seconde restructuration avec la période d'observation de la première. Mise en œuvre sur 3 ans au plus. |
| R10 | 26 | Maintien en sensible ou en souffrance pendant l'observation d'un an ; pas de reprise de provision | D3.6 (jalons 24 et 36 mois, sans lien avec la règle) | Absent | Période d'observation calculée ; blocage de tout reclassement favorable pendant l'année. Mise en œuvre sur 3 ou 10 ans au plus. |
| R11 | 27 | L'observation court à partir de la première échéance de la créance restructurée | — | Absent | Date de première échéance restructurée, issue de l'échéancier. |
| R12 | 28 | Au-delà de la deuxième restructuration : douteuse, ou maintien en compromis pendant l'observation | D3.6 (repère 0) | Partiel | Compteur ≥ 3 ⇒ douteuse au minimum ; une compromise reste compromise. Mise en œuvre sur 3 ans au plus. |
| R13 | 29 | Restructurée saine avec impayé de plus de 30 jours : sensible ; restructurée avec impayé de plus de 90 jours : douteuse | RF07 DPD 31–89 jours ; D3.6 repère 0 (« impayé post-restructuration ») | Partiel | Règle conditionnée : retard postérieur à la restructuration > 30 jours ⇒ sensible ; > 90 jours ⇒ douteuse. Mise en œuvre sur 3 ou 10 ans au plus. |
| R14 | 30 | Retour en sain d'une restructurée : un an d'observation écoulé, paiements significatifs du principal, aucun impayé ni autre critère, difficultés résolues — conditions cumulatives | Politique DEF2 : guérison après 12 mois (seed), décision formelle | Partiel | Quatre conditions vérifiées une à une, preuves jointes (échéancier payé, principal remboursé), décision tracée ; jamais par simple écoulement du temps. |
| R15 | 31 | Reprise des provisions au transfert en sain | — | Absent (comptable) | Conséquence comptable du reclassement. |

## 5. Ancienne circulaire 19/G/2002

La 19/G/2002 reste la référence jusqu'au 31 décembre 2026 et pour les arrêtés antérieurs. Ses critères de souffrance sont repris par la 1/W/2025 ; ses critères qualitatifs n'ont pas de seuil chiffré.

| N° | Article | Critère | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| G01 | 2, 4 bis | Créances irrégulières : critères de souffrance, mais intégralement couvertes par des garanties à 100 % | Sans objet : la note ignore les garanties | Hors notation | Régime historique seulement ; supprimé par la 1/W/2025 (art. 16). |
| G02 | 5-1 | Pré-douteux : crédit amortissable, échéance non réglée 90 jours après son terme | D3.1 / B1.1 | Partiel | Comme E04. |
| G03 | 5-2 | Pré-douteux : crédit à échéance unique non honoré 90 jours après son terme | D3.1 / B1.1 | Partiel | Comme E05. |
| G04 | 5-3 | Pré-douteux : loyers de crédit-bail non réglés 90 jours après leur terme | D3.1 / B1.1 | Partiel | Comme E06. |
| G05 | 5-4 | Pré-douteux : situation financière non évaluable faute d'information ou de documentation | Données critiques, NO_RATING, RF16 | Partiel | Comme E08. |
| G06 | 5-5 | Recouvrement mis en cause : capacité de remboursement (déséquilibre persistant de la situation financière, baisse significative du CA, endettement excessif) | D1 Performance et structure (D1.1 croissance du CA, D1.4, D1.5 endettement), D2 Capacité de remboursement ; NC01, NC03 | Intégré | — |
| G07 | 5-5 | Événements concernant les principaux dirigeants ou actionnaires (décès, dissolution, mise en liquidation) | D5.2 ; TPE B4.2, B4.4 | Partiel | Comme S14. |
| G08 | 5-5 | Problèmes de gestion ou litiges entre associés ou actionnaires | D5.3 ; RF12 | Intégré | — (fait daté utile pour la classification). |
| G09 | 5-5 | Difficultés du secteur d'activité | D4.1 ; TPE B3.1 | Intégré | — |
| G10 | 6-1 | Douteux : compte à vue sans mouvements créditeurs réels suffisants pendant 180 jours | D3.4 / B1.3 / B2.3 | Partiel | Comme E11. |
| G11 | 6-2 | Douteux : crédit amortissable impayé 180 jours | D3.1 / B1.1 | Partiel | Comme E12. |
| G12 | 6-3 | Douteux : crédit à échéance unique impayé 180 jours | D3.1 / B1.1 | Partiel | Comme E13. |
| G13 | 6-4 | Douteux : loyers de crédit-bail impayés 180 jours | D3.1 / B1.1 | Partiel | Comme E14. |
| G14 | 6-5 | Douteux : redressement judiciaire | RF05 ; DEF3 | Partiel | Comme E15. |
| G15 | 6-6 | Douteux : recouvrement incertain du fait de la dégradation de la situation | D1, D2, D4, D5 ; NC01 à NC03 | Intégré | — (motivation tracée pour la classification). |
| G16 | 7-1 | Compromis : compte à vue sans mouvements créditeurs réels suffisants pendant 360 jours | D3.4 / B1.3 / B2.3 | Partiel | Comme E18. |
| G17 | 7-2 | Compromis : crédit amortissable impayé 360 jours | D3.1 / B1.1 | Partiel | Comme E19. |
| G18 | 7-3 | Compromis : crédit à échéance unique impayé 360 jours | D3.1 / B1.1 | Partiel | Comme E20. |
| G19 | 7-4 | Compromis : loyers de crédit-bail impayés 360 jours | D3.1 / B1.1 | Partiel | Comme E21. |
| G20 | 7-5 | Compromis : perte de 75 % ou du tiers de la situation nette sans AGE de continuité | RF09 ; D1.4 | Partiel | Comme E25. |
| G21 | 7-5 | Compromis : action en justice contre la contrepartie pour le recouvrement | DEF3 si transmis | Partiel | Comme E26. |
| G22 | 7-5 | Compromis : contestation judiciaire des créances par la contrepartie | RF12 | Partiel | Comme E27. |
| G23 | 7-5 | Compromis : cessation d'activité ou liquidation judiciaire | RF05 ; DEF3 | Intégré | — (à rendre impératif, cf. E28). |
| G24 | 7-5 | Compromis : déchéance du terme ou résiliation du crédit-bail | — | Absent | Comme E29. |
| G25 | 8 | Compromis : crédit amortissable mensuel avec 9 échéances impayées | — | Absent | Comme E30. |
| G26 | 9 | Compromis : créance restructurée avec une échéance impayée 180 jours | D3.6 (repère 0 : « impayé post-restructuration ») | Absent | Règle conditionnée sur le retard postérieur à la restructuration (régime historique). |
| G27 | 10 | Dérogation pour retards techniques sur crédits aux particuliers | Sans objet | Intégré | — |
| G28 | 11 | Contagion à toutes les créances de la contrepartie | Note unique par contrepartie | Intégré | — |
| G29 | 12 | Classement quelles que soient les garanties (sous réserve de l'art. 4 bis) | La note ignore les garanties | Intégré | — |
| G30 | 33 | Créances en souffrance sur un membre d'un groupe : examiner l'impact sur le groupe et classer si nécessaire les créances des autres entités | Groupes d'affaires ; D5.4 Actionnariat, groupe et soutien ; NC04 ; RF18 Contagion groupe ; D3.7 | Intégré | — (pour la classification : revue de contagion tracée, entité par entité). |
| G31 | 13 à 30 | Provisions, garanties, quotités, comptabilisation, agios réservés | — | Hors notation | Système comptable. |

## 6. Dispositions générales — circulaire 1/W/2025

| N° | Article | Disposition | Présence dans le modèle | Statut | Comment l'intégrer |
|---|---|---|---|---|---|
| A01 | 47 | Identifier les créances sensibles et en souffrance générées par la production de chaque exercice | Historique des notations par date d'arrêté | Hors notation | Relève du reporting de la classification. |
| A02 | 48 | Les systèmes d'évaluation du risque de crédit prennent en compte les règles de la circulaire | Thèmes couverts (§ 2 à 5) ; seuils non reproduits | Partiel | Lots A et B ci-dessous. |
| A03 | 49 | Critères = normes minimales ; classer plus sévèrement si d'autres informations le justifient | Plafonds, exceptions, signaux, dérogation à la baisse | Intégré | — |
| A04 | 50 | Créance sensible ou en souffrance sur un membre d'un groupe : examiner l'impact sur le groupe et classer si nécessaire | Comme G30 (groupes d'affaires, D5.4, NC04, RF18) | Partiel | Revue de contagion obligatoire, déclenchée sur les autres membres du groupe d'affaires, dès qu'un membre devient sensible ou en souffrance. |
| A05 | 51, 52 | Information de Bank Al-Maghrib ; reclassement exigé par la supervision | — | Hors notation | Reporting et workflow de classification. |
| A06 | 53 | Calendrier de mise en œuvre progressive (3, 5, 7 et 10 ans selon les critères) | Paramétrage par versions datées (échelle et grilles) | Intégré | Chaque règle de classification portera sa date d'application. |

## 7. Comment intégrer les critères manquants

Trois lots, du plus simple au plus structurant. Les lots A et B restent dans le périmètre de la note ; le lot C est la classification.

**Lot A — dans la note, avec les données déjà saisies (immédiat).**

| Ajout | Critères couverts | Données utilisées | Effet |
|---|---|---|---|
| Défaut imposé pour un retard de plus de 90 jours déclaré | E01, G02 à G04 | Retard maximal saisi (D3.1, B1.1) | Grade DEF1, sans attendre la transmission du constat. |
| Défaut imposé pour redressement, liquidation, cessation, action en recouvrement | E15, E26, E28, G14, G21, G23 | Signal RF05 et nouveaux faits datés | Grade DEF3. |
| Signal « recul du CA ≥ 50 % sur un an » | S18 | Bilan N et N−1 | Revue obligatoire ; critère sensible signalé. |
| Signal « dettes financières / capitaux propres > 3 (> 5 si financement spécialisé) » | S19 | Bilan N (indicateur GEARING existant) | Revue obligatoire ; critère sensible signalé. |
| Signal « trois exercices déficitaires, ≥ 5 ans d'activité, sans augmentation de capital » | S20 | Résultat net et capital sur 3 exercices ; date de création (à ajouter à la fiche client) | Revue obligatoire ; critère sensible signalé. |
| Signal « perte des trois quarts / du tiers de la situation nette sans AGE » | E25, G20 | Capitaux propres, capital social, forme juridique ; case AGE | Revue obligatoire ; critère compromis signalé. |
| Signal « comptes annuels non reçus 7 mois après la clôture » | S02 | Date de clôture du dernier bilan, date de notation | Revue obligatoire ; critère sensible signalé. |

Ces ajouts se paramètrent comme les autres règles (versions datées) et n'affectent pas la pondération : ils imposent une revue ou un grade, ils ne se compensent pas.

**Lot B — dans la note, avec des faits datés saisis par l'analyste (court terme).**

Faits qualitatifs fermés, datés et justifiés, chacun avec sa source et sa pièce : saisie ou ATD (S01), information crédit bureau (S03), événement dirigeant ou actionnaire (S14), litige entre associés (S15), partenaire en difficulté (S17), émetteur de dette privée en difficulté (S13), contestation judiciaire (E27), déchéance du terme (E29), improbabilité de paiement constatée (E02), restructuration avec difficulté, concession, rang, différé et viabilité (R01, R02, R05 à R08). Chaque fait alimente le critère de la grille correspondant, déclenche une revue, et sera repris tel quel par la classification.

**Lot C — classification des créances (plus tard).**

Moteur de règles distinct de la note, alimenté par les systèmes de la banque, par créance et par date : échéanciers et retards par produit (E04 à E06, E12 à E14, E19 à E21), compteur de 9 échéances (E30), autorisations et dépassements continus (E03, E10, E17), mouvements créditeurs réels sur 180 / 360 jours (E11, E18), trajectoire des restructurations et période d'observation (R09 à R14), contagion débiteur et groupe (E32, A04), exception du comité des risques (S21), calendrier de l'article 53. Les projets financés (S08 à S12, E23, E24) et les titres (S13, E07, E22) relèvent de dispositifs dédiés (outil Project Finance, portefeuille titres) avec routage explicite. Le moteur produit la classe, ses motifs datés et son historique ; la note reste une appréciation du risque, et une classe en souffrance impose un grade de défaut.

## 8. Limites

Cette revue compare les textes et le modèle ; elle ne valide ni la classification de la banque, ni le provisionnement, ni la conformité d'une entité à une date. Les seuils non chiffrés par les textes (« significatif », « anormalement faible ») doivent être fixés et approuvés par les fonctions Risques, Finance et Conformité. Les filiales étrangères relèvent de leur propre réglementation.
