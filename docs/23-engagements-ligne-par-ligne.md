# 23 — Engagements du client ligne par ligne

> Décision D-62. Base de l'engagement global et pondération des engagements par signature : **propositions à arrêter en COPIL**. Correspondance des champs T24 à caler avec la DSI.

## 1. Contenu

Chaque ligne d'engagement du client chez la banque comporte :

- son type (liste paramétrable) et sa nature : bilan, ou signature (cautions, avals, crédits documentaires) ;
- sa durée : court terme, ou moyen et long terme ;
- sa référence ;
- l'autorisé, l'encours, l'impayé et son ancienneté ;
- la mise en place et l'échéance ;
- les garanties et leur valeur ;
- son statut : en vigueur, échue, clôturée.

**Sources :**

- **T24** : limites du client, par son code client (« Rapatrier depuis T24 » sur la fiche). Chaque rapatriement remplace les lignes T24 précédentes. Les codes produit de T24 se traduisent en types de l'outil par la correspondance `T24_FACILITY_FIELD_MAP` ; un produit non reconnu devient « Autre » avec son libellé T24.
- **Saisie** : tableau éditable, daté (position au …). Une nouvelle saisie remplace les lignes saisies ; les lignes T24 ne sont pas touchées.

Chaque enregistrement est journalisé : nombre de lignes, totaux, source, date de position.

## 2. Engagement global

L'engagement global est la somme, par ligne en vigueur ou échue (hors lignes clôturées), d'un montant choisi par paramètre :

- **le plus grand de l'autorisé et de l'encours** : défaut, prudent, car un dépassement compte ;
- ou l'autorisé seul ;
- ou l'encours seul.

Les engagements par signature sont pondérés : 100 % par défaut, paramétrable de 0 à 100 %.

À l'ouverture d'un dossier, l'engagement global des lignes est repris dans « Engagements bancaires globaux » (segmentation, délégation). En cours de saisie, un repère indique le montant des lignes : « ✓ repris » s'il est identique, sinon un bouton « Reprendre ce montant ».

## 3. Constats et critères BAM

| Constat | Effet |
|---|---|
| Encours supérieur de plus de 10 % à l'autorisé | Alerte « dépassement » ; au-delà de 90 jours, critère E03 à vérifier (durée non connue de T24) |
| Ligne échue encore utilisée | Renouvellement à instruire |
| Impayé de plus de 90, 180 ou 360 jours | Critère E04, E12 ou E19 **proposé à vérifier** (jamais coché automatiquement) |
| Encours de la banque au crédit bureau différent de l'encours des lignes (plus de 10 %) | Écart à expliquer (date de déclaration, ligne manquante) |
| Engagement global saisi au dossier différent de celui des lignes | Information |
| Position de plus de 31 jours | À actualiser |

La fiche client montre le détail : synthèse (engagement global, autorisé, encours et utilisation, court terme et moyen et long terme, impayés, garanties), tableau des lignes, constats. Le dossier en montre la synthèse.

## 4. Paramétrage

- Administration › Paramétrage › Workflow :
  - base de l'engagement global ;
  - pondération des engagements par signature.
- Administration › Paramétrage › Types de lignes d'engagement : code, libellé, nature, durée, actif. Un type utilisé se désactive, il ne se supprime pas.
- Référentiels externes : chemin de l'API des limites T24 (`T24_FACILITIES_PATH`, suivi du code client). Même adresse et même jeton que la fiche client.

## 5. Mise en service

1. Appliquer `prisma/sql/12-engagements-ligne-par-ligne.sql`.
2. Avec la DSI : API des limites du client dans T24, exemple de réponse, correspondance des codes produit (`T24_FACILITY_FIELD_MAP`, clé `products`).
3. Arrêter en COPIL la base de l'engagement global et la pondération de la signature.

## 6. Suite proposée

Les lignes d'engagement constituent le **flux d'encours** de la surveillance du portefeuille (docs/20) : exposition courante par client, impayés et dépassements comme indicateurs de risque. Il reste à les y raccorder et à historiser les positions mensuelles.
