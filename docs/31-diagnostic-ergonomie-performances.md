# 31 — Diagnostic complet : ergonomie et performances de la base

*Lot du 14 novembre 2026 — décision D-70 (docs/07). Migration 16.*

## 1. Méthode

- **Écrans.** Parcours automatisé de 217 écrans, sur bureau et sur mobile (390 px), avec 7 profils : chargé d'affaires, analyste d'une autre filiale, directeur de centre, contre-étude, responsable de la contre-étude, surveillance, administrateur. Pour chaque écran, on relève :
  - les erreurs de page et les erreurs réseau ;
  - l'accessibilité (WCAG 2.1 AA, axe-core) ;
  - le débordement horizontal ;
  - le temps de réponse du serveur, le poids de la page et le nombre de champs.
- **Code.** Revue des requêtes : boucles qui interrogent la base, listes sans limite, tris non indexés, lecture de colonnes lourdes.
- **Base.** Les conseils de performance Supabase de la production, puis une base d'essai au volume d'une banque, sur laquelle on chronomètre les requêtes réelles de l'application :
  - 21 070 clients ;
  - 210 140 notations ;
  - 420 028 événements d'audit.

## 2. Constats

### Écrans (base de démonstration)

- **Santé technique.** Aucune erreur, aucun problème d'accessibilité sérieux, aucun débordement mobile. Tous les écrans répondent en moins de 170 ms.
- **Pages très longues.**
  - Le dossier en brouillon fait 18 000 px de haut, soit une vingtaine d'écrans ; le dossier soumis, 12 000 px.
  - On ne voit pas d'un coup d'œil ce qu'il reste à faire, et on ne peut pas aller directement à une section.
- **Tableau de bord générique.** Il montre des statistiques (distribution, dernières notations, tableau des modèles), mais ne dit pas à l'utilisateur ce qui l'attend : ses brouillons, ses dossiers rejetés, les dossiers qui attendent son avis, les notes à renouveler.
- **Liste des clients plafonnée.** Elle s'arrête sans le dire aux 1 000 premiers clients. Au-delà, un client n'est trouvable ni par la recherche, ni par la liste.

### Base (volume bancaire)

| Requête | Avant | Cause |
|---|---|---|
| Surveillance du portefeuille | 7,3 s | Tout l'historique des notations est lu, **y compris l'instantané d'entrée complet** de chacune (plusieurs dizaines de Ko en réel), seulement pour en extraire l'engagement global ; le filtre « notation officielle » génère des sous-requêtes corrélées. |
| Journal d'audit, page 1 | 1,26 s | Les listes des filtres (actions, types) parcourent toute la table. |
| Journal, filtre par action | 1,17 s | Aucun index sur l'action. |
| Tableau de bord, note courante | 1,0 s | Le dédoublonnage « dernière notation par client » est fait par l'application après lecture de tout l'historique. |
| Liste des clients, notes | 147 ms | Lecture de tout l'historique des 1 000 clients affichés. |
| Tableau de bord, dernières notations | 114 ms | Aucun index sur la date de création. |

Les conseils Supabase de la production signalent quatre clés étrangères sans index : `entities.parentId`, `renotation_batches.scheduleId`, `renotation_items.counterpartyId`, `users.entityId`. Les index dits « inutilisés » tiennent au faible volume actuel de la production ; ils sont conservés.

## 3. Améliorations livrées

### Ergonomie

1. **Tableau de bord « Mon travail ».** En tête de session :
   - les dossiers qui attendent l'utilisateur : son avis ou sa décision, ses brouillons, ses dossiers rejetés à reprendre ;
   - les notes à renouveler (au-delà de la durée de validité paramétrée) ;
   - une recherche de client (nom, ICE, code T24) et le bouton « Nouvelle notation ».

   Les cartes de synthèse deviennent cliquables (clients, dossiers à valider, modèles). Le tableau des modèles quitte l'accueil : il reste dans « Modèles ». La règle « à traiter » est commune au tableau de bord et à l'onglet « À traiter » des dossiers.
2. **Sommaire du dossier.** Il donne l'accès direct à chaque section, avec son état mis à jour pendant la saisie :
   - bilan : chargé, à charger ou contrôles bloquants ;
   - chaque domaine de la grille : complet, nombre de critères à saisir, critiques manquants.

   Il est affiché dans le panneau latéral du dossier en saisie, et en tête du dossier soumis, validé ou rejeté (pour les valideurs). Le titre de la section visée n'est plus masqué par la barre de progression.
3. **Recherche de clients dans toute la base.**
   - Au-delà de 1 000 clients, la liste l'indique (« 1 000 premiers sur N ») et la recherche interroge toute la base, sur le nom, l'ICE, le code T24 et le gestionnaire.
   - La recherche du tableau de bord ouvre directement la liste filtrée.
   - Sous 1 000 clients, le filtre instantané reste inchangé.

### Base de données

1. **`rating_runs.exposureBase`.** L'engagement global en devise de base est enregistré avec la notation :
   - montant converti au cours appliqué pour un dossier en devise ;
   - sinon, montant déclaré à la notation.

   La surveillance ne relit plus les instantanés. La migration 16 reprend l'existant avec la même règle que l'ancien calcul ; une valeur illisible reste vide sans interrompre la reprise.
2. **Note courante.** Une requête dédiée (PostgreSQL : une sous-requête par client, avec `LIMIT 1`, servie par le nouvel index client/arrêté/date) remplace trois calculs dispersés : tableau de bord, échéances de renouvellement, liste des clients. Les autres bases gardent la requête Prisma équivalente.
3. **Historique de la surveillance.** Une jointure directe (PostgreSQL) remplace la requête Prisma imbriquée.
4. **Journal d'audit.** Les listes des filtres viennent du catalogue des libellés, et un index (action, date) sert le filtre.
5. **Index.**
   - Ajoutés : note courante, dernières notations, filtre du journal, et les quatre clés étrangères signalées.
   - Aucun index supprimé : la migration est purement additive.

**Cloisonnement.** Les requêtes directes ne lisent que les clients déjà obtenus par le client Prisma cloisonné de l'utilisateur. Le périmètre (entités, portefeuille du chargé d'affaires) s'applique donc exactement comme avant.

## 4. Résultats (même base de 21 070 clients, 210 140 notations, 420 028 événements)

| Requête | Avant | Après |
|---|---|---|
| Surveillance du portefeuille | 7 341 ms | 2 065 ms |
| Journal d'audit, page 1 | 1 256 ms | 88 ms |
| Journal, filtre par action | 1 169 ms | 43 ms |
| Tableau de bord, note courante | 1 018 ms | 305 ms |
| Tableau de bord, dernières notations | 114 ms | 3 ms |
| Liste des clients, notes | 147 ms | 9 ms |

Les instantanés de la base d'essai pèsent 2,3 Ko en moyenne. Les instantanés réels, plus lourds, auraient creusé encore l'écart de l'ancienne surveillance ; la nouvelle ne les lit plus.

## 5. Vérifications

- 484 tests unitaires, dont `tests/optimisation-ergonomie.test.ts`.
- Bout en bout : nouveau parcours rapports et dossier figé (24 contrôles), lots 1 à 3 (22 contrôles), sources externes, parcours complet des écrans.
- Migration 16 : rejouée deux fois sans effet, sans écart avec le schéma Prisma.

## 6. Pistes suivantes

- **Surveillance.** Restreindre l'historique lu à la période analysée, plus la note de départ de chaque client. Le gain serait important au-delà de 500 000 notations.
- **Journal d'audit.** Une politique de conservation et d'archivage (à arrêter avec l'audit interne).
