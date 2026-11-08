# 24 — Pièces et informations requises par motif

> Décision D-64. Listes proposées et contrôle à la soumission (avertissement par défaut) : **à arrêter en COPIL**.

## Principe

Chaque motif de dossier liste les éléments requis pour soumettre (Administration › Paramétrage › Motifs, « Pièces requises »). Deux sortes d'éléments existent.

| Élément | Vérification |
|---|---|
| États financiers chargés | Contrôlé par l'outil : au moins un exercice avec des montants dans le dossier |
| Rapport de solvabilité à jour | Contrôlé : rapport enregistré sur la fiche, dans la limite d'ancienneté (docs/21) |
| Engagements à jour | Contrôlé : lignes d'engagement datées de moins de 31 jours (docs/23) |
| Fiche juridique (InfoRisque) à jour | Contrôlé : rapport enregistré, dans la limite d'ancienneté |
| Statuts, modèle J et pouvoirs ; attestations fiscale et CNSS ; rapport du commissaire aux comptes ; business plan ; devis ; situation intermédiaire | Pièce jointe au dossier, **typée** à l'ajout ou ensuite (une pièce non typée ne compte pour aucune exigence) |

## Listes proposées

| Motif | Éléments requis |
|---|---|
| Entrée en relation | États financiers, rapport de solvabilité, fiche juridique, statuts et modèle J, attestation fiscale, attestation CNSS |
| Renouvellement des crédits de fonctionnement | États financiers, rapport de solvabilité, engagements, attestation fiscale |
| Crédit d'investissement | États financiers, rapport de solvabilité, engagements, business plan, devis |
| Révision sur événement | Rapport de solvabilité, engagements |
| Autre | États financiers, rapport de solvabilité |

## Dans le dossier

Le panneau **Préparation du dossier**, en tête du dossier, montre :
- chaque élément, fourni, manquant ou périmé, avec ce qu'il faut faire ;
- le décompte des éléments restants.

À la soumission (paramètre « Pièces requises manquantes à la soumission ») :
- **avertissement** (défaut) : la soumission passe, les éléments manquants sont consignés au journal du dossier ;
- **bloquant** : la soumission est refusée avec la liste des éléments ;
- **aucun contrôle**.

## Mise en service

Appliquer `prisma/sql/13-pieces-requises.sql` (type des pièces). Les pièces existantes restent non typées.
