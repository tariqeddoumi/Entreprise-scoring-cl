# 30 — Dossier figé, lecture complète par l'OCR intelligent et corrections tracées

*Lot du 9 novembre 2026 — décision D-69 (docs/07). Migration 15, appliquée en production le 9 novembre 2026.*

## 1. Principe

Le rapport chargé (crédit bureau, InfoRisque, bilan) **reste tel que lu**. Toute modification ultérieure est une **correction motivée** qui s'ajoute :
- datée et attribuée ;
- avec l'ancienne et la nouvelle valeur ;
- avec un motif de 10 caractères au moins ;
- avec un justificatif quand il existe (mainlevée, attestation de régularisation, courrier).

L'analyse et la note reposent sur la **vue corrigée**. Le rapport lu et l'historique des corrections restent consultables. Une correction se défait par une nouvelle correction, jamais par suppression.

## 2. Rapport de solvabilité : lecture complète

### Ce que l'OCR intelligent lit

Il lit **toutes** les lignes du rapport (300 au plus). Pour chaque ligne :
- établissement, type, référence et rôle (emprunteur, caution) ;
- autorisé, encours, impayé, jours de retard, échéances impayées ;
- dates de début et de fin, garanties, statut.

Il lit aussi :
- les incidents ;
- la signalétique : raison sociale, forme juridique, ICE, RC, tribunal de commerce, IF, CNSS, patente, adresse, capital, date de création ;
- les totaux imprimés (nombre de lignes, autorisé, encours, impayé).

### Panne des rapports à plusieurs crédits : cause et correctif

- **Établissement anonymisé.** Les rapports anonymisent les confrères, et l'outil exigeait un nom d'établissement pour chaque ligne. Une ligne sans nom est désormais acceptée (« Établissement non nommé »).
- **Montants formatés.** Les montants imprimés « 1 234 567,89 », « 1.234.567,89 », « (1 000) » ou « 12 500 DH » sont désormais lus correctement.
- **Délai de lecture.** Il est porté à 4 minutes pour les longs rapports.

### Contrôle d'exhaustivité

Il compare la lecture aux totaux imprimés, sur le rapport tel que lu :
- **alerte** si le nombre de lignes lues diffère du nombre annoncé ;
- **attention** si un total s'écarte de plus de 1 %.

### Relecture et enregistrement

Le brouillon lu est en **lecture seule**. On vérifie la date et l'exhaustivité, puis on enregistre. Le PDF est conservé comme pièce du client, de type « Rapport de solvabilité ».

### Signalétique comparée à la fiche client

Chaque rubrique (ICE, RC, tribunal de commerce, IF, CNSS, patente, forme juridique, ville) reçoit un statut : identique, absente de la fiche, ou différente.

Le chargé d'affaires coche les rubriques à reprendre ; chaque reprise est journalisée avec l'ancienne et la nouvelle valeur. Pour une fiche T24, seules les rubriques vides se complètent : un écart se corrige dans T24.

## 3. InfoRisque

- **Historique.** Chaque fiche enregistrée est conservée (table `legal_reports`) avec son PDF.
- **Correction d'un champ.** L'identité, un événement légal (levé, date), les comptes déposés et le score se corrigent avec motif.
- **Événement levé.** Il reste affiché mais n'a plus d'effet sur l'analyse.
- **Signalétique.** Même comparaison avec la fiche client, et même reprise tracée.

## 4. Bilan

Une valeur lue par l'OCR intelligent (ou le gabarit Excel) que l'analyste modifie :
- garde sa **valeur lue**, affichée sous la cellule ;
- exige un **motif** ;
- tant que le motif manque, la soumission est **refusée** (contrôle bloquant « Correction de … »).

Revenir à la valeur lue efface la correction.

## 5. Dossier figé à la soumission

À la soumission, dans la même transaction, le dossier enregistre dans `rating_cases.evidence` les **éléments au jour de la décision** :
- fiche client et fiche T24 telles qu'à la soumission ;
- rapport de solvabilité : lu, corrections, vue retenue, constats ;
- fiche InfoRisque : lue, corrections, vue retenue, constats ;
- position des engagements et totaux ;
- corrections du bilan, avec leurs motifs.

Les PDF des rapports et les justificatifs sont **copiés dans les pièces du dossier**. Une même pièce (même empreinte SHA-256) n'est copiée qu'une fois.

La section « Éléments au jour de la décision » s'affiche :
- sur le dossier soumis, validé ou rejeté ;
- sur la fiche de notation.

La fiche client peut évoluer ensuite ; le dossier, lui, ne bouge plus.

## 6. Téléchargement des pièces

Routes `/counterparties/[id]/pieces/[docId]` et `/cases/[id]/pieces/[docId]` :
- elles sont cloisonnées : une pièce d'une autre entité renvoie 404 ;
- seuls le PDF, le PNG et le JPEG s'affichent dans le navigateur ; tout le reste est téléchargé ;
- les en-têtes `nosniff`, `CSP sandbox` et `no-store` sont posés.

## 7. Renommage

« IA » devient **« OCR intelligent »** :
- dans l'outil (écrans, paramétrage, messages, journal) ;
- dans le guide utilisateur (Word et PowerPoint), les expressions de besoin, la présentation top management, le README et les notes `docs/`.

Restent inchangés :
- les codes internes (`AI_*`, source `IA` du bilan), pour la compatibilité des données ;
- les captures d'écran déjà intégrées aux documents, qui montrent encore l'ancien libellé jusqu'à leur prochaine régénération ;
- le journal des décisions, qui reste historique.

## 8. Vérifications

- **Tests unitaires.** 480, dont `tests/corrections-tracees.test.ts` : montants, corrections, chemins refusés, exhaustivité, signalétique, bilan.
- **Bout en bout.** 24 contrôles :
  - rapport à 15 crédits, brouillon en lecture seule ;
  - correction avec justificatif ; motif court refusé ;
  - événement InfoRisque levé ;
  - soumission refusée sans motif sur le bilan ;
  - éléments figés, pièces téléchargeables, cloisonnement ;
  - aucun débordement à 390 px.
- **Régression.** Lots 1 à 3 (22 contrôles) et sources externes.
- **Migration 15.** Rejouée deux fois sans effet, sans écart avec le schéma Prisma. Appliquée en production, puis colonnes, tables et RLS vérifiées.

## 9. À fournir par la banque

Un **rapport de solvabilité réel anonymisé**, avec plusieurs crédits et des impayés, pour calibrer la lecture : libellés des colonnes, formats des montants, totaux imprimés.
