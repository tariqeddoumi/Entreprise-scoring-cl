# Workflow, multi-banques et filiales, multi-devise, IA — rapport de mise en œuvre

*Octobre 2026. Décisions correspondantes : D-45 à D-49 (journal des décisions).*

## 1. Diagnostic de départ

L'outil a été comparé au modèle qu'il applique, puis à l'outil de notation des financements de projets (PF) pris comme référence fonctionnelle.

| Sujet | Avant | Outil PF | Maintenant |
|---|---|---|---|
| Modèle appliqué | Aligné (D-43, D-44) : moteur 3.0.1, contrat, écrans, base | — | Inchangé, et la saisie passe par une fonction unique (`draftToRequest`) vérifiée par le contrôle d'alignement |
| Banques et filiales | Une seule banque | Arbre d'entités, cloisonnement dans la couche de données | Arbre d'entités, cloisonnement dans la couche de données, habillage par entité |
| Devises | MAD implicite | — | Devise par entité et contrepartie, cours datés, conversion consignée |
| Workflow | Note officielle dès le calcul ; quatre yeux sur les seules dérogations | Brouillon → soumis → validé/rejeté, séparation des fonctions, délégation | Idem, plus reprise après rejet, abandon, file « À traiter », historique du dossier |
| IA | Aucune | Fournisseur paramétrable, validation humaine | Propositions sur la grille depuis les pièces, pré-remplissage de la fiche contrepartie, fournisseur paramétrable |
| Paramétrage | Variables d'environnement | Écrans de paramétrage | Écrans : banques et filiales, devises, paramètres du workflow et de l'IA, utilisateurs rattachés |
| Dérogations à l'écran | API seulement | — | Demande et décision à l'écran, sur notation validée |

Deux défauts ont été trouvés et corrigés en cours de route :

- **Une notation rejetée pouvait redevenir officielle.** La reprise d'un dossier rejeté détachait sa notation, qui passait alors pour une notation « antérieure au workflow ». La reprise ouvre désormais un nouveau brouillon et laisse le dossier rejeté intact.
- **Une date d'arrêté hors de tout jeu de segmentation** produisait une erreur technique. Elle produit maintenant un message métier.

## 2. Ce qui a été livré

### 2.1 Banques et filiales (D-45)

- **Organisation** (Paramétrage › Banques et filiales). Arbre groupe › banque › banque régionale › groupe de filiales › filiale. Chaque entité porte :
  - un code, un pays et une devise ;
  - un habillage facultatif (nom de l'outil, logo, couleur), hérité de l'ascendance.
- **Comptes** (Paramétrage › Utilisateurs). Chaque compte est rattaché à une entité, avec une portée d'écriture : l'entité seule, ou sa descendance. Un administrateur d'entité gère les comptes de sa branche. Seul l'administrateur du groupe crée un ADMIN ou un compte sans entité.
- **Cloisonnement** (`src/lib/scope.ts`). Le client de base de données des écrans, des actions serveur et de l'API filtre chaque lecture et chaque modification, et vérifie chaque création. Un dossier hors périmètre est introuvable (404).

### 2.2 Multi-devise (D-46)

- **Cours** (Paramétrage › Devises). Ils sont saisis par l'administrateur du groupe : devise, date d'effet, cours en MAD, source. Un cours publié ne se modifie pas.
- **Saisie et conversion.** La saisie d'un dossier se fait dans la devise de la contrepartie. À l'aperçu comme à la soumission, les montants (chiffre d'affaires, chiffre d'affaires du groupe, engagements bancaires) sont convertis au dernier cours à la date d'arrêté. La conversion est affichée et consignée dans le dossier.
- **Cours manquant.** La soumission est bloquée, avec le message : « Aucun cours XOF/MAD publié au … : un administrateur doit le saisir ».

### 2.3 Workflow des dossiers (D-47)

```
Brouillon ──soumission──▶ Soumis ──validation──▶ Validé (note officielle)
    ▲                        │
    └── reprise (nouveau ◀── Rejeté (motif obligatoire)
        brouillon)
Brouillon ──abandon──▶ Abandonné
```

- **Ouvrir un dossier.** Nouvelle notation › Ouvrir un dossier : contrepartie, modèle, date d'arrêté. La saisie du dernier dossier validé ou rejeté de la contrepartie est reprise.
- **Écran du dossier.**
  - la grille, générée depuis le modèle ;
  - Enregistrer le brouillon, Aperçu du calcul, Soumettre à validation ;
  - le panneau des pièces et de l'IA ;
  - la conversion des montants ;
  - après soumission, le résultat figé ;
  - le panneau de validation ;
  - l'historique complet du dossier, tiré du journal d'audit.
- **Liste des dossiers.** Onglets par statut et onglet « À traiter » : ses brouillons et rejets ; pour un valideur, les dossiers soumis par d'autres.
- **Séparation des fonctions.** Un contributeur ne valide pas. Le panneau indique pourquoi, ainsi que le rôle requis et la règle de délégation qui l'impose.
- **Note officielle.** Le tableau de bord, la liste des contreparties et l'évolution entre deux notations ne retiennent que les notations validées. Les autres portent la mention « proposée, non validée » ou « rejetée ».
- **Dérogations.** Elles se demandent depuis une notation validée et se décident à l'écran par une seconde personne (RISK_MANAGER).
- **Simulation.** Elle reste disponible sans rien enregistrer.

### 2.4 IA d'assistance (D-48)

**Configuration** (Paramétrage › Intelligence artificielle) :

- activation, désactivée par défaut ;
- fournisseur : Anthropic, OpenAI, Azure OpenAI ou API compatible ;
- modèle, `claude-opus-5-5` par défaut chez Anthropic ;
- adresse, en https.

La clé se trouve dans une variable d'environnement : `ANTHROPIC_API_KEY`, ou `IA_CLE_API` pour les autres fournisseurs.

**Dans un dossier :**

1. Ajouter les pièces : états financiers, liasse, rapport de gestion, extrait RC (PDF, image, texte, CSV).
2. Facultatif : ajouter un compte rendu de visite ou des faits récents.
3. Cliquer sur « Proposer des valeurs ». L'IA renvoie des propositions pour les ratios, les ancrages qualitatifs, les statuts de donnée, les red flags, les exceptions, la matérialité ESG, le support groupe et les montants. Chacune porte sa source, son calcul et sa confiance.
4. Accepter ou refuser chaque proposition, ou « Accepter celles ≥ 80 % ». Une valeur acceptée remplit la grille, avec le repère « IA ».
5. Enregistrer.

**Dans la fiche contrepartie :** « Pré-remplir avec l'IA » depuis un extrait ou un texte collé, puis relecture et enregistrement.

**Avec Anthropic :** les PDF sont lus page par page, tableaux compris. La réponse est contrainte par un schéma JSON. Le **repli serveur** est activé : si le modèle principal décline une requête, l'API la rejoue sur un modèle de secours dans le même appel. Avec un autre fournisseur, le texte des PDF est extrait localement avant envoi.

### 2.5 Paramétrage (D-49)

| Paramètre | Défaut | Bornes |
|---|---|---|
| Rôle du valideur | RISK_MANAGER | RISK_MANAGER, ADMIN |
| Seuil de délégation (MAD, engagements) | 0 = désactivé | ≥ 0 |
| Rôle au-delà du seuil | ADMIN | RISK_MANAGER, ADMIN |
| Validité d'une notation (mois) | 12 | 1 à 36 |
| Crans maximaux d'une dérogation | 2 | 1 à 4 |
| Taille maximale d'une pièce (Mo) | 4 | 1 à 20 (4 sur Vercel) |
| IA activée / fournisseur / modèle / adresse | non / anthropic / — / — | listes fermées, https |

## 3. Vérifications

- **Contrôles automatiques.**
  - Compilation TypeScript, lint, 235 tests unitaires : 19 nouveaux sur le périmètre, les devises, la saisie, les propositions de l'IA, la séparation des fonctions et le paramétrage.
  - Validation du schéma sur les quatre moteurs de base (PostgreSQL, MySQL, SQL Server, SQLite).
  - Contrôle d'alignement complet. Il couvre désormais la section 8, le cloisonnement, ainsi que la requête de notation construite en un seul endroit.
- **Migration 04 sur une copie de la base actuelle** (schéma de `main` et données de démonstration) :
  - jouée deux fois sans erreur ;
  - base obtenue strictement identique au schéma Prisma (`prisma migrate diff` vide) ;
  - dix contreparties rattachées à l'entité racine.
- **Parcours de bout en bout** dans un navigateur, sur PostgreSQL. Fournisseur d'IA simulé au format OpenAI, en https. 17 contrôles, tous réussis :
  1. ouverture d'un dossier ;
  2. analyse d'une pièce par l'IA : 5 propositions retenues, 2 écartées (champ inconnu, ancrage invalide) ;
  3. acceptation des propositions et repères « IA » dans la grille ;
  4. enregistrement du brouillon ;
  5. aperçu du calcul ;
  6. soumission ;
  7. auteur exclu de la validation ;
  8. dossier présent dans la file « À traiter » du valideur ;
  9. validation par une seconde personne ;
  10. filiale CI sans visibilité sur les contreparties du Maroc ;
  11. fiche contrepartie pré-remplie par l'IA ;
  12. analyse par l'IA sur le dossier de la filiale CI : propositions retenues ;
  13. propositions acceptées et appliquées à la grille ;
  14. soumission en XOF bloquée faute de cours ;
  15. cours saisi, puis conversion consignée : 95 000 000 XOF → 1 567 500 MAD ;
  16. dossier CI introuvable (404) pour le valideur du Maroc ;
  17. validation du dossier CI par l'administrateur du groupe, puis liste complète des dossiers pour celui-ci.

## 4. Mise en production — ordre impératif

1. **Appliquer la migration** sur la base de production, **avant** le déploiement :
   `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/sql/04-multi-entites-workflow-ia.sql`
   Elle est idempotente et transactionnelle.
2. **Déployer.**
3. **Paramétrer, en tant qu'administrateur du groupe.**
   - Créer les banques et filiales.
   - Rattacher chaque compte non-ADMIN à son entité : sans rattachement, il n'a plus accès à rien.
   - Saisir les cours des devises utilisées.
   - Régler le workflow.
4. **Activer l'IA** (facultatif) : renseigner `ANTHROPIC_API_KEY`, ou `IA_CLE_API`, dans les variables d'environnement, puis l'activer dans Paramétrage.

## 5. Limites connues

- **Taille des pièces sur Vercel.** Une requête ne dépasse pas 4,5 Mo : les pièces plus lourdes sont à découper, ou l'outil à héberger en interne.
- **Clés d'API sans code d'entité.** Elles couvrent tout le groupe, comme avant. Les intégrations des filiales doivent recevoir une clé portant leur code.
- **SQL Server.** L'unicité de `rating_cases.runId`, nullable, et celle déjà existante de `rating_runs.idempotencyKey` n'admettent qu'une valeur nulle. Un index filtré est à prévoir avant une mise en service sur ce moteur (D-28).
- **Validité d'une notation.** Les notes à renouveler sont listées dans la file « À traiter » ; aucune alerte n'est envoyée par courriel.
