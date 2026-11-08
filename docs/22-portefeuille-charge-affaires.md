# 22 — Portefeuille par chargé d'affaires

> Habilitations par niveau hiérarchique. Décision D-61. Paramètre « Visibilité des chargés d'affaires (profil 1) » : **Tout son centre** par défaut, à passer à **Son portefeuille** une fois les codes gestionnaires renseignés.

## Qui voit quoi

| Profil | Rattachement | Clients visibles |
|---|---|---|
| P1 chargé d'affaires | Centre d'affaires | **Son portefeuille** : clients dont il est gestionnaire, et clients pour lesquels il a ouvert un dossier. Paramétrable : tout son centre. |
| P2 directeur de centre | Centre d'affaires | Tout son centre |
| P3 contre-étude, P4 surveillance | Région ou banque (Casablanca, régionale) | Tous les centres de la région ou de la banque (portée « descendance ») |
| Gestionnaire des risques, administrateur | Entité ou groupe | Selon l'entité ; tout le groupe pour l'administrateur du groupe |

Le niveau hiérarchique vient de l'arborescence des entités (Administration › Banques et filiales) : banque, banque régionale, centre d'affaires. Chaque compte est rattaché à une entité et voit cette entité et sa descendance. Le portefeuille restreint **en plus** le profil 1.

## Comment un client entre dans un portefeuille

- **Gestionnaire T24** : le code gestionnaire du client (ACCOUNT.OFFICER de T24, rapatrié avec la fiche) est égal au **code gestionnaire T24 du compte**. Ce code se renseigne dans Administration › Utilisateurs, à côté de la fonction.
- **Saisie minimale** : le chargé d'affaires qui crée la fiche en devient le gestionnaire.
- **Dossier ouvert** : un client pour lequel il a ouvert un dossier reste visible (remplacement, reprise d'un dossier).

## Garde-fous

Le contrôle est fait dans le client de base de données cloisonné, pas seulement à l'écran. Il s'applique donc aussi aux actions et aux exports. Il couvre :
- le client ;
- ses notations, dossiers, pièces, propositions de l'IA ;
- ses bilans, décisions de comité et rapports de solvabilité.

Les refus :
- un chargé d'affaires ne crée pas un client géré par un autre gestionnaire (cas d'une fiche T24) ; cela revient au gestionnaire ou au directeur du centre ;
- il ne cède pas un client à un autre gestionnaire ; seuls le directeur du centre ou T24 le réaffectent ;
- il n'ouvre pas de dossier sur un client hors de son portefeuille, et un client hors portefeuille ouvert par son adresse affiche « introuvable » ;
- un code client T24 déjà présent hors de son portefeuille est signalé comme existant, sans en révéler le nom.

## Mise en service

1. Appliquer `prisma/sql/11-portefeuille-charge-affaires.sql`. Elle ajoute le code gestionnaire des comptes et l'index. Elle affecte aussi aux clients sans gestionnaire le compte qui les a créés (journal d'audit), s'il existe encore.
2. Renseigner le code gestionnaire T24 de chaque chargé d'affaires (Administration › Utilisateurs).
3. Rapatrier ou actualiser les fiches depuis T24 (le gestionnaire vient de T24). À défaut, le directeur du centre renseigne le gestionnaire sur la fiche.
4. Passer « Visibilité des chargés d'affaires » à **Son portefeuille** (Paramétrage › Workflow).
