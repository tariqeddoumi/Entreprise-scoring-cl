# 32 — Saisie manuelle par listes et rapprochement avec T24

*Lot du 14 novembre 2026 — décision D-71 (docs/07). Migration 17.*

## 1. Le besoin

Quand le client n'est pas encore dans T24, ou quand T24 ne répond pas, le chargé d'affaires saisit la fiche et les engagements à la main. Trois exigences :

- figer les valeurs saisies par des listes paramétrables ;
- réduire la saisie au strict nécessaire ;
- au rattachement à T24 (code client), conserver la saisie et proposer le rapprochement avec les données rapatriées, sans écrasement silencieux ni double comptage.

## 2. Listes de saisie paramétrables

Les listes se tiennent dans Administration › Paramétrage › Listes de saisie. Valeurs par défaut fournies, codes à aligner sur T24 par la banque.

| Liste | Valeur enregistrée | Défaut |
|---|---|---|
| Formes juridiques | code (SA, SARL, SARL_AU…) | 12 formes du droit marocain |
| Secteurs d'activité | code | sections de la NMAE 2010 |
| Villes | libellé | 20 villes principales |
| Tribunaux de commerce | libellé | 8 tribunaux de commerce |
| Types de garantie | libellé | hypothèque, nantissements, cautions, Tamwilcom… |

Ces listes s'ajoutent aux segments commerciaux, aux types de crédit et aux types de ligne d'engagement, déjà paramétrables.

**Règles**
- Un code de forme juridique ou de secteur utilisé par une fiche ne se supprime pas : il se désactive.
- Les valeurs antérieures aux listes (texte libre) restent affichées « hors liste » et ne bloquent rien.
- **Contrôle côté serveur** : en création ou en modification d'une fiche saisie, une forme juridique, un secteur ou une ville hors liste est refusé.
- **Pré-remplissage par l'OCR intelligent** : le texte lu est ramené à la valeur de la liste (« S.A. » ou « Société anonyme » donne SA). Sans correspondance, le champ reste à choisir.

## 3. Saisie minimale

**Fiche client.** Seuls cinq éléments sont demandés :
- raison sociale ;
- ICE ou registre de commerce ;
- forme juridique, secteur et segment commercial (choisis dans les listes).

Le reste (identifiant fiscal, ville, code T24 s'il est connu, gestionnaire, pays, devise) est replié sous « Compléments facultatifs ». Il viendra de T24 au rattachement.

**Lignes d'engagement.** Le type de ligne, le statut et la garantie se choisissent dans des listes. Les montants restent saisis. L'engagement global se calcule à partir des lignes ; c'est lui qui alimente le dossier.

## 4. Rapprochement de la fiche avec T24

1. **Comparer.** L'utilisateur saisit le code client et clique « Comparer la saisie avec T24 ». T24 est lu, rien n'est enregistré. Chaque champ reçoit un statut :
   - **identique** : au texte près, ou par la liste (« Société anonyme » = SA) ;
   - **écart** ;
   - **complété par T24** : la saisie était vide ;
   - **absent de T24** : la saisie est gardée.
2. **Choisir.** T24 fait foi par défaut. Pour garder une valeur saisie qui diffère de T24, on choisit « Saisie » et on donne un motif de 10 caractères au moins.
3. **Valider.** T24 est relu côté serveur ; les valeurs envoyées par le navigateur ne sont jamais utilisées. Les choix s'appliquent champ par champ et la fiche devient « Rapatriée de T24 ». L'événement est journalisé : valeurs reprises, valeurs gardées, motifs.

**Ce qui reste après le rattachement**
- **Saisie d'origine** : l'instantané avant rattachement reste consultable sur la fiche. Un nouveau rapprochement ne l'efface pas.
- **Valeurs gardées** : les actualisations suivantes de T24 (bouton, ou rafraîchissement à l'ouverture d'un dossier) ne les écrasent pas. Si T24 finit par afficher la même valeur, l'écart disparaît de lui-même.
- **« Revoir le rapprochement »** : sur une fiche rattachée, ce bouton relance la comparaison, par exemple pour revenir à la valeur T24.

Une fiche saisie ne peut plus être rattachée par écrasement direct : le rattachement passe obligatoirement par ce rapprochement.

## 5. Rapprochement des engagements

**Défaut corrigé.** Les totaux additionnaient toutes les lignes, saisies et T24. Après un rapatriement, une même ligne était donc comptée deux fois.

**Règle des totaux**
- Sans ligne T24, toutes les lignes saisies comptent.
- Dès que T24 a fourni des lignes, les totaux portent sur les lignes T24 plus les lignes saisies « gardées ».
- Une ligne saisie non encore rapprochée est « à rapprocher » et sort des totaux. Un avertissement le signale sur la fiche et dans le dossier.

La règle s'applique aussi à la surveillance du portefeuille et à l'engagement global du dossier.

**Appariement proposé.** Chaque ligne saisie est comparée aux lignes T24 :

| Critère | Points |
|---|---|
| Même référence | 100 |
| Même type | 40 |
| Autorisé à 5 % près (15 %) | 30 (15) |
| Encours à 5 % près (15 %) | 20 (10) |
| Même échéance | 10 |

À partir de 60 points, la paire est proposée. Les meilleurs scores passent d'abord, et chaque ligne T24 ne sert qu'une fois.

**Décision, ligne par ligne**
- **Rapprocher** : la ligne T24 remplace la ligne saisie dans les totaux. La saisie reste visible, avec la mention « rapprochée de 100300.0001 ».
- **Garder** : la ligne est absente de T24 et s'ajoute aux lignes T24.
- **Écarter** : ligne saisie par erreur ou soldée.

L'événement est journalisé.

## 6. Base de données (migration 17, purement additive)

- `counterparties.manualEntry` : saisie d'origine et valeurs gardées (JSON).
- `credit_facilities.reconciliation`, `matchedReference`, `reconciledBy`, `reconciledAt`.

## 7. Vérifications

- **Tests unitaires** : 491, dont `tests/rapprochement-saisie-t24.test.ts`. Ils couvrent les listes, la correspondance des textes libres, la comparaison, le motif obligatoire, l'appariement, l'absence de double comptage, et l'absence de proposition sans ligne T24.
- **Bout en bout** (15 contrôles) :
  - saisie minimale par listes, compléments repliés, garanties par liste ;
  - comparaison avec T24 ; refus de garder une valeur sans motif ; valeur gardée non écrasée par l'actualisation ;
  - lignes à rapprocher hors totaux, appariement proposé, totaux finals sans double comptage ;
  - écran de paramétrage des listes.
- **Régression** : sources externes, lots 1 à 3, rapports et dossier figé.
