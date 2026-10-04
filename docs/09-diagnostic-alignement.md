# Diagnostic d'alignement — base, back-end et écrans

**Date :** 4 octobre 2026 · **Version examinée :** `main` après fusion de la PR #7, moteur 3.0.0, modèles 3.0.0, base de production Supabase (schéma `corp_scoring`)
**Périmètre :** concordance des représentations du système deux à deux — base et schéma, données et vocabulaire, validation et contrat d'API, moteur et contrat, écran et moteur, droits de l'écran et droits de l'API
**Classification :** usage interne

---

## 1. Synthèse

**La base est parfaitement alignée.** Les huit tables et leurs 90 colonnes en production sont identiques à une base créée depuis le schéma Prisma : types, nullabilité, valeurs par défaut, 19 index, 12 contraintes. Le durcissement est en place : sécurité au niveau des lignes sur les huit tables, piste d'audit en ajout seul, aucun droit pour les rôles exposés de Supabase. Les instantanés des treize notations V3 concordent avec leurs colonnes.

**Les écarts étaient entre l'écran, l'API et le moteur.** Le diagnostic en a trouvé onze, tous corrigés. Trois comptaient vraiment :

- **Le moteur répondait sans compte.** L'action serveur de l'écran de notation calculait une simulation pour un appel anonyme, alors que l'API équivalente répond 401.
- **Les critères ESG saisis à l'écran étaient ignorés.** L'écran ne transmettait jamais leur matérialité : D7.1 et D7.2 étaient toujours écartés. Aucune des treize notations V3 de production ne les a évalués.
- **Un statut conformité déclaré masquait un red flag de conformité.** « CLEAR » avec RF01 donnait une relation conforme.

**Aucune notation de production n'est modifiée.** Le moteur passe en 3.0.1 pour la règle de conformité. Aucune des treize notations V3 ne déclare de statut conformité, de matérialité ni de support groupe : vérifié en base.

**Décision de la banque (D-44, confirmée le 4 octobre 2026).** Le référentiel sectoriel qui devait établir la matérialité ESG est vide. L'analyste la déclare à l'écran, avec justification au dossier, jusqu'à ce que le référentiel soit alimenté.

**L'alignement est désormais contrôlé en continu.** Le vérificateur d'alignement compare les formes des contrats, plus seulement des listes de valeurs. Exécuté sur l'ancienne version du code, il relève treize écarts. Il n'était lancé par aucune étape de la CI : il l'est désormais.

---

## 2. Méthode

| Volet | Comment |
|---|---|
| Base ↔ schéma Prisma | Catalogue de la base de production (colonnes, index, contraintes, sécurité au niveau des lignes, déclencheurs, droits) comparé ligne à ligne au catalogue d'une base PostgreSQL 16 créée par `prisma db push`. Template multi-dialecte régénéré et comparé au schéma livré |
| Données ↔ vocabulaire | Distribution des valeurs écrites en production (statuts, grades, rôles, actions d'audit, motifs) ; cohérence colonnes ↔ instantanés ; runs sans audit ; segments |
| Validation ↔ contrat | Champs des schémas Zod comparés récursivement aux corps de requête OpenAPI ; analyse YAML stricte |
| Moteur ↔ contrat | Champs produits par le moteur sur un dossier noté et un dossier sans grade, comparés au schéma `RatingResult` |
| Écran ↔ moteur | Champs envoyés par le formulaire comparés aux champs lus par le moteur ; sondes du moteur sur les champs non envoyés |
| Droits | Chaque action serveur et chaque route comparées : session, rôle, ordre des contrôles. Appel anonyme de l'action serveur sur une construction de production |
| Bout en bout | Construction de production sur PostgreSQL 16 local : appels d'API, parcours Chromium en lecture seule et en analyste |

Les requêtes en production ont été exclusivement des lectures.

---

## 3. Base ↔ schéma Prisma : conforme

| Élément | Production | Schéma Prisma | Écart |
|---|---|---|---|
| Tables | 8 | 8 | aucun |
| Colonnes (type, nullabilité, défaut) | 90 | 90 | aucun |
| Index, dont unicité (ICE, clé d'idempotence, identifiant) | 19 | 19 | aucun |
| Clés primaires et étrangères (RESTRICT à la suppression) | 12 | 12 | aucun |
| Sécurité au niveau des lignes | 8 tables sur 8 | apportée par `01-postgresql-hardening.sql` | — |
| Déclencheur ajout seul sur `audit_events` | présent, `search_path` vide | idem | — |
| Droits `anon`, `authenticated`, `service_role` | aucun, ni sur le schéma ni sur les tables | idem | — |

Le schéma livré est identique à celui que régénère le template pour PostgreSQL. Les trois autres dialectes sont validés par la matrice de la CI.

---

## 4. Données en base ↔ vocabulaire : conforme, deux observations

**Les valeurs écrites appartiennent toutes au vocabulaire documenté :**
- les statuts de notation suivent le vocabulaire V3 pour les runs du moteur 3.0.0, le vocabulaire V1 pour les archives ;
- les rôles, statuts de dérogation, motifs et actions d'audit sont tous connus ;
- les dates d'arrêté sont au format AAAA-MM-JJ ;
- les instantanés sont tous du JSON lisible.

**Pour les treize notations V3, chaque colonne recopie l'instantané :** statut, score brut, confiance, grade moteur, grade produit, segment, version de modèle et date d'arrêté.

**Observations, laissées en l'état :**

1. **Les treize notations de démonstration V1 n'ont aucun événement d'audit.** Elles ont été insérées par script SQL, sans passer par l'application. Les treize notations V3 en ont chacune un. Créer une trace a posteriori reviendrait à la fabriquer : l'absence est documentée.
2. **Une contrepartie garde un segment que sa dernière notation n'a pas établi.** Sur « Négoce Alimentaire », la notation la plus récente n'a pas pu déterminer de segment, et la fiche garde PME, issu de la notation précédente. C'est le comportement documenté (« dernier segment calculé, indicatif ») : le service ne remplace le segment que par un segment établi.

---

## 5. Constats et corrections

| Gravité | Constat | Correction | Preuve |
|---|---|---|---|
| **Élevée** | **Le moteur répondait à un appel anonyme.** L'action serveur de l'écran de notation ne vérifiait la session qu'avant d'enregistrer. Son identifiant figure dans le JavaScript public de la page : une simulation complète s'obtenait sans compte, alors que `/rating-runs/simulate` répond 401. Un profil en lecture seule simulait aussi depuis l'écran, ce que l'API lui refuse | Session et rôle ANALYST vérifiés avant tout calcul. Un profil en lecture seule consulte la grille, avec un avertissement et le bouton désactivé | Appel anonyme sur construction de production : résultat complet avant, « Session absente ou expirée » après. Parcours Chromium en lecture seule |
| **Élevée** | **Les critères ESG saisis à l'écran étaient ignorés.** Le formulaire ne transmettait jamais la matérialité : D7.1 et D7.2 étaient toujours écartés, quelle que soit la saisie. Sonde : 100 ou 0 sur D7.1, même score brut 64,5. En base, aucune des treize notations V3 ne porte de matérialité | Section « Matérialité des risques ESG » dérivée des portes du modèle. Non cochée, le critère s'affiche comme écarté avec son critère receveur, et rien n'est transmis. Cochée, il redevient saisissable et évalué | Parcours Chromium : D7.1 évalué (score 0, poids 1 %), D7.2 écarté |
| **Moyenne** | **Un statut conformité déclaré masquait un red flag de conformité observé.** Avec `complianceStatus: CLEAR` et RF01 dans la même requête, le résultat affichait « conforme » | Le statut restitué est le plus sévère des deux. Moteur 3.0.1 | Test unitaire sur cinq combinaisons. Aucune notation de production concernée |
| **Moyenne** | **Le support groupe n'était pas saisissable**, alors que le moteur l'applique et que le panneau de résultat sait l'afficher | Demande, quatre conditions et nombre de crans, plafonné par le modèle | Parcours Chromium : note autonome STD-P7 conservée, note soutenue STD-P6 |
| **Moyenne** | **Le contrat OpenAPI était illisible par un analyseur strict** à cause de la clé `pd12m` dupliquée. Il omettait aussi cinq champs acceptés, quatre champs du résultat et l'événement `counterparty.updated`. La mise à jour d'une contrepartie y exigeait `name` et ignorait `isActive` | Contrat complété et corrigé. `existingExposure` est documenté comme accepté mais sans effet sur le calcul | Vérificateur d'alignement, section 7 |
| **Moyenne** | **`counterparty.updated` était proposé à la souscription sans jamais être émis** | Publié après chaque mise à jour validée, sans les valeurs modifiées. Audit écrit dans la même transaction que la modification, comme à la création | Livraison journalisée dans `webhook_deliveries`, audit `COUNTERPARTY_UPDATED` |
| **Moyenne** | **L'API et les écrans ne désignaient pas la même dernière notation.** L'historique d'une contrepartie était trié par date de calcul dans l'API, par date d'arrêté à l'écran (D-36). Une renotation d'un arrêté ancien passait en tête, ce qui se produit en production | Même ordre que les écrans : date d'arrêté, puis date de calcul | Appel d'API : arrêtés 2026-06-30, 2025-12-31, puis 2025-06-30 calculé en dernier |
| Faible | **Les scores sortaient en chaînes** (« 87.3125 ») dans les listes et le détail d'un run, et en nombres dans l'instantané de la même réponse | Nombres, à la précision de la colonne (4 décimales) | Test unitaire, appel d'API |
| Faible | **Une dérogation sur une notation d'une version antérieure** était mesurée avec l'échelle du modèle chargé, et échouait sur « grade cible inconnu » | Refus explicite (409), avec l'invitation à renoter | Appel d'API sur un run V1 |
| Faible | **L'action serveur calculait sans les options du moteur** : hors production, avec `ALLOW_SYNTHETIC_PD=1`, la PD différait entre l'écran et l'API | L'écran passe par le service de notation, comme l'API | — |
| Faible | **Les motifs de dérogation s'affichaient en code** | Libellés français, code en infobulle | Vérificateur : 9 motifs, 9 libellés |

Le formulaire ne couvrait pas toute l'API (rapport `08-diagnostic-complet.md`, constat « Moyenne »). C'est en partie résolu : nature du défaut (D-41), matérialité et support groupe (ici). Restent la segmentation automatique et le statut conformité amont (§ 7).

---

## 6. Droits : écran ↔ API

| Opération | API | Écran | État |
|---|---|---|---|
| Consulter contreparties, notations, modèles | READONLY | READONLY | aligné |
| Simuler une notation | ANALYST | ANALYST — **aucun contrôle avant correction** | corrigé |
| Enregistrer une notation | ANALYST | ANALYST | aligné |
| Créer une contrepartie | ANALYST | ANALYST, formulaire masqué sinon | aligné |
| Modifier une contrepartie | ANALYST | — | API seulement |
| Proposer et décider une dérogation | RISK_MANAGER, quatre yeux | — | API seulement |
| Souscriptions webhook | ADMIN | — | API seulement |
| Comptes utilisateurs | — | ADMIN | écran seulement, par construction (D-40) |

Chaque action serveur vérifie désormais la session avant toute lecture, écriture ou calcul. Seules la connexion et la déconnexion sont publiques. Le vérificateur d'alignement le contrôle.

---

## 7. Laissé en l'état

| Sujet | Pourquoi |
|---|---|
| Dérogations et modification d'une contrepartie sans écran | Fonctionnalités complètes par l'API. Un écran de maker-checker est un chantier à part entière, à cadrer avec les utilisateurs |
| Segmentation automatique non saisissable à l'écran | Le segment se choisit dans le cadrage. Brancher le chiffre d'affaires et l'exposition globale suppose que les seuils de segmentation soient validés (décision banque n° 1) |
| Statut conformité amont non saisissable à l'écran | Il provient du système conformité. L'écran transmet les red flags RF01 à RF03, dont le moteur dérive le statut |
| Deux notions de support groupe | « Support juridiquement robuste » (routage des jeunes entreprises) et le support groupe à quatre conditions restent deux saisies. Les rapprocher est une question de méthode |
| Précision du score en colonne | 4 décimales en colonne, pleine précision dans l'instantané, qui fait foi. Les treize notations V3 concordent ; une notation d'archive V1 présente un écart de score entre colonne et instantané, non examiné plus avant |
| Audit des notations de démonstration V1 | Voir § 4 |

---

## 8. Contrôle permanent

La section 7 du vérificateur d'alignement (`npm run check:alignment`) compare désormais les formes des contrats. Elle contrôle :

- la lecture du contrat OpenAPI par un analyseur YAML strict ;
- les champs acceptés par la validation et ceux documentés, récursivement, pour les sept corps de requête ;
- les champs produits par le moteur et ceux documentés du résultat ;
- la publication effective de chaque événement souscriptible ;
- un libellé français pour chaque code du moteur et de la validation, sans libellé orphelin (huit familles) ;
- l'envoi par l'écran de chaque champ de notation, ou une exclusion motivée dans le vérificateur ;
- la prise en compte des portes de matérialité par le formulaire ;
- la vérification de session avant tout traitement dans chaque action serveur.

Exécuté sur la version précédente du code, il relève treize écarts. Sur la version corrigée, il n'en relève aucun. Il est désormais une étape de la CI.

La structure de la base se contrôle séparément par `npm run db:check`, qui requiert une connexion.

---

## 9. Vérifications

- Typage strict et lint sans erreur ; 216 tests verts, dont trois nouveaux (statut conformité, scores en nombres).
- Vérificateur d'alignement : aucune divergence.
- Construction de production sur PostgreSQL 16 local, schéma `corp_scoring` :
  - **Action serveur :** l'appel anonyme est refusé.
  - **API :** historique trié par arrêté et scores en nombres ; dérogation sur un run V1 refusée (409) ; mise à jour d'une contrepartie auditée, puis événement publié.
  - **Écran, dans Chromium :** huit contrôles verts, aucune erreur navigateur. Lecture seule : écran consultable, avertissement, bouton désactivé. Analyste : critère ESG écarté puis évalué, support groupe appliqué.
- Production : lectures seules. Aucune des treize notations V3 n'est modifiée par le passage au moteur 3.0.1.
