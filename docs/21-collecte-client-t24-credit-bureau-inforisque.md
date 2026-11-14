# 21 — Collecte du dossier client : T24, crédit bureau, InfoRisque

> Processus de bout en bout, première partie : de l'événement déclencheur à un dossier complet. Décision D-60. Valeurs proposées (ancienneté maximale, contrôle à la soumission) **à arrêter en COPIL**.

## 1. Événement déclencheur

Le chargé d'affaires (profil 1) ouvre un dossier pour l'un des motifs paramétrés (Administration › Paramétrage › Motifs) :

| Motif | Cas | Exercice proposé |
|---|---|---|
| Entrée en relation | Client repris chez un confrère, ou client existant sans engagement qui demande des lignes | Bilan complet à charger |
| Renouvellement annuel des crédits de fonctionnement | Client déjà engagé | Exercice suivant : N−1 et N−2 repris |
| Demande de crédit d'investissement | Client avec lignes de fonctionnement | Exercice de la dernière note, ou suivant |

À l'ouverture, l'outil affiche la **dernière note validée** (circuit terminé) et le dernier bilan du client ; sans note antérieure, il demande le bilan complet. Les motifs se détaillent par paramétrage (par exemple « reprise d'un client d'un confrère » et « client existant sans engagement »).

## 2. Fiche client : T24 d'abord, saisie minimale en repli

**Client présent dans T24.** Le chargé d'affaires saisit le **code client T24** (identifiant numérique de l'application CUSTOMER, 1 à 10 chiffres selon le paramétrage de l'installation ; la longueur admise se paramètre). L'outil interroge l'API clients de T24 et affiche la fiche rapatriée avant création :

- intitulé, nom abrégé, forme juridique, ICE, RC, identifiant fiscal ;
- secteur d'activité, **segment commercial** de la banque ;
- ville, adresse, pays, devise ;
- gestionnaire (chargé d'affaires), centre d'affaires, groupe d'affaires ;
- date de création, capital social, statut T24.

Le client est rattaché au centre d'affaires de T24 s'il est dans le périmètre de la personne, sinon à l'entité qu'elle choisit. Il est aussi rattaché au groupe d'affaires de même code. Un code déjà présent dans l'outil est refusé (doublon).

**Client pas encore dans T24, ou API T24 en panne.** Sur toute erreur (T24 désactivé, injoignable, réponse en erreur, client introuvable), l'écran propose la **saisie minimale**. Elle ne demande que ce qu'exige la notation : raison sociale, ICE ou RC, forme juridique, secteur d'activité, segment commercial. Le code T24 éventuellement connu est repris. La fiche est marquée « **en attente de T24** » dans la liste des clients.

**Rattachement.** Depuis la fiche, « Rattacher à T24 et rapatrier » associe le code client, puis « Actualiser depuis T24 » rafraîchit la fiche. Dans les deux cas :

- les données de T24 remplacent la saisie, mais un champ vide dans T24 n'efface rien ;
- chaque écart est affiché et journalisé.

Une fiche rapatriée garde son code ; T24 fait foi sur ses champs.

**Actualisation à l'ouverture d'un dossier** (D-66). Pour un client rapatrié de T24, ouvrir un dossier relit d'abord, dans T24 :

- la **fiche client**, sauf si elle a été relue il y a moins d'une heure ;
- les **lignes d'engagement**, si leur chemin est paramétré et qu'elles n'ont pas déjà été rapatriées le jour même (docs/23).

Le dossier reprend ainsi l'engagement global du jour. Une panne de T24 ne bloque pas l'ouverture : le dossier part des dernières données enregistrées. Un encadré en tête du dossier indique ce qui a été actualisé et ce qui a échoué, avec la date des dernières données, et le résultat est conservé au journal du dossier.

Ne sont pas actualisées d'office :

- une fiche en saisie minimale, dont le code n'est pas vérifié : elle se rattache depuis la fiche ;
- un client hors du périmètre d'écriture.

Paramètre `T24_REFRESH_AT_OPENING` : fiche et engagements (défaut), fiche seule, ou aucune actualisation.

![T24 indisponible à l'ouverture](captures-collecte-client/ouverture-panne.png)

**Segment commercial ≠ segment du modèle.** Le segment commercial (TPE, PME, GE, Professionnels, Institutionnels, liste paramétrable alignée sur T24) suit les règles commerciales de la banque. Le segment du modèle (TPE, PME, GE) est calculé par le moteur selon ses propres seuils. Les deux sont affichés côte à côte sur la fiche.

**Correspondance des champs.** Les noms par défaut suivent l'API Transact (IRIS) `party/customers/{id}`. Les champs locaux de la banque (ICE, RC, segment commercial en LOCAL.REF) se déclarent dans la clé `T24_FIELD_MAP`, sans développement. **À fournir par la DSI :** l'adresse de l'API, le jeton et un exemple de réponse, pour caler cette correspondance.

## 3. Rapport de solvabilité du crédit bureau

Consultation obligatoire avant tout octroi (circulaire 1/G/2010). Deux crédit bureaux délégataires de Bank Al-Maghrib existent au Maroc : Creditinfo Maroc et Quantik Maroc. Le paramétrage désigne celui de la banque.

1. **Rafraîchissement** dans l'outil du crédit bureau, hors de l'outil de notation. Un rafraîchissement automatique par API est un projet distinct.
2. **Récupération**, de deux façons :
   - **par API** : base des rapports interrogée par l'ICE du client ;
   - **par lecture de l'IA** : PDF ou image chargé. L'OCR intelligent restitue le contenu sans rien inventer.

   Dans les deux cas, le rapport s'affiche **à vérifier** avant enregistrement. La saisie manuelle reste possible.
3. **Date de mise à jour.** C'est elle qui fait foi, pas la date de chargement. Au-delà de l'ancienneté paramétrée (30 jours proposés), l'écran affiche systématiquement : « Attention : rapport mis à jour il y a N jours. Rafraîchissez-le dans l'outil du crédit bureau, puis récupérez-le à nouveau. »
4. **Contenu structuré.**
   - Lignes par établissement : chez la banque ou chez un confrère, type, autorisé, encours, impayé et son ancienneté, statut.
   - Incidents : impayés, chèques, contentieux, restructurations, régularisés ou non.
   - Consultations sur 12 mois et score.
5. **Exploitation.**
   - Encours total, chez la banque et chez les confrères ; impayés ; incidents non régularisés.
   - Écart entre l'encours déclaré au crédit bureau chez la banque et l'engagement déclaré au dossier (au-delà de 10 %).
   - Recherche active de financement (5 consultations ou plus en 12 mois).
   - Critères BAM **proposés à vérifier** dans le dossier (jamais cochés automatiquement) :

| Constat | Critère |
|---|---|
| Information négative (impayé, incident non régularisé) | S03 |
| Incident de paiement sur chèque | S04 |
| Impayé de plus de 90 jours | E04 |
| Impayé de plus de 180 jours | E12 |
| Impayé de plus de 360 jours | E19 |
| Contentieux | E26 |

6. **À la soumission** d'un dossier, un rapport absent ou ancien donne un **avertissement** tracé au journal (par défaut) ou **bloque** la soumission (paramétrable).

**À vérifier avec le crédit bureau :** l'existence et le format d'une API « entreprise » pour la banque. La recherche publique n'en documente pas ; la lecture par l'OCR intelligent est donc la voie disponible dès maintenant. Un rapport anonymisé permettra de caler la lecture sur son format réel.

## 4. Fiche juridique : InfoRisque

InfoRisque (Inforisk, charika.ma, membre du réseau Dun & Bradstreet) couvre les entreprises marocaines : identité, représentants légaux, actionnaires, bénéficiaires effectifs, comptes déposés sur plusieurs exercices, score de défaillance, appartenance à un groupe, annonces légales. Le contenu dépend du rapport commandé (Express, Gold, Platinium, Ultimate) : une rubrique absente reste vide.

**Lecture.** Le rapport PDF ou image est lu par l'OCR intelligent, puis affiché à vérifier (identité modifiable), puis enregistré dans la fiche juridique du client, datée et journalisée. Pour une fiche en saisie minimale, les champs vides de la fiche client (ICE, RC, forme juridique, identifiant fiscal, ville) sont complétés ; une fiche T24 n'est pas modifiée.

**Exploitation dans l'outil :**

| Contrôle | Règle | Effet |
|---|---|---|
| Identité | ICE, RC, raison sociale (hors « STE », forme juridique), forme juridique comparés à la fiche | Alerte sur l'ICE, attention sur le reste |
| Comptes déposés au greffe contre bilan remis à la banque | Chiffre d'affaires, résultat net, capitaux propres par exercice, tolérance 5 % | **Alerte** en cas d'écart (contrôle anti-fraude classique) |
| Redressement judiciaire | Annonce légale | Critère E15 proposé |
| Liquidation, dissolution, radiation, statut radié | Annonce légale ou statut | Critère E28 proposé |
| Changement de dirigeant, cession de parts de moins d'un an | Annonce légale | Critère S14 proposé |
| Procédure de sauvegarde | Annonce légale | Alerte à apprécier |
| Réduction de capital de moins de trois ans | Annonce légale | Vérifier la situation nette (E25) |
| Jeune entreprise | Moins de trois ans d'existence | Attention |
| Bénéficiaires effectifs absents | Rubrique vide | Attention (connaissance client) |
| Groupe d'appartenance | Groupe, maison mère | À rapprocher du groupe d'affaires |
| Fiche ancienne | Au-delà de 365 jours (paramétrable) | À actualiser |

Les points d'attention de la fiche juridique sont rappelés sur le dossier.

## 5. Dossier complet

Sur le dossier, le chargé d'affaires voit :

- le rapport de solvabilité (ancienneté, synthèse, possibilité de le récupérer à nouveau) ;
- les points d'attention de la fiche juridique ;
- les critères BAM proposés par le bilan, le crédit bureau et InfoRisque ;
- la liste « à faire » de la saisie : champs repris à confirmer, champs à saisir, anomalies.

Toute pièce lue par l'OCR intelligent est vérifiée avant enregistrement, et toute opération est journalisée.

## 6. Suites proposées

1. **Portefeuille par chargé d'affaires.** Le gestionnaire est désormais rapatrié de T24. Il reste à restreindre le profil 1 à ses clients (paramétrable : portefeuille ou centre entier). Les profils 2, 3 et 4 voient déjà leur centre, leur région ou leur banque selon l'arborescence.
2. **Engagements ligne par ligne** (API du système de crédit ou saisie), qui alimenteront l'engagement global et le flux d'encours de la surveillance.
3. **Liste de pièces obligatoires par motif**, avec contrôle à la soumission.
4. **Actualisation automatique** à l'ouverture de chaque dossier : livrée pour la fiche T24 et les engagements (D-66). Le rapport de solvabilité reste à rafraîchir dans l'outil du crédit bureau ; son ancienneté est signalée.
