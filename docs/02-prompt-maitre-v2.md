# Prompt maître V2 — Plateforme de scoring entreprises TPE / PME / GE au Maroc

**Version :** 2.0 · **Date :** 19 août 2026
**Remplace :** Prompt maître V1.0 du 18 août 2026
**Usage :** prompt de cadrage, conception, réalisation, validation et industrialisation, à remettre à une IA de développement ou à une équipe pluridisciplinaire.

---

## Comment utiliser ce document

Le bloc délimité par `PROMPT À COPIER — DÉBUT` / `PROMPT À COPIER — FIN` est le prompt lui-même. Copiez-le intégralement. Joignez-y :

1. le dépôt de référence `corp-scoring-ma` (socle déjà construit et testé — voir §4 du prompt) ;
2. les textes réglementaires officiels applicables à votre établissement, en version complète ;
3. votre politique de crédit, votre définition du défaut et votre politique IFRS 9 ;
4. le fichier `project-parameters.yaml` renseigné.

### Ce que la V2 ajoute par rapport à la V1

| Apport | Raison |
|---|---|
| **Catalogue d'anti-patterns avec preuves `fichier:ligne`** (§3) | La V1 listait des constats en préambule, hors du prompt copié. L'IA destinataire ne les recevait donc pas comme contraintes. |
| **Socle de départ fourni et testé** (§4) | La V1 faisait partir l'IA de zéro. Un moteur pur, validé par 46 tests, supprime la phase la plus risquée. |
| **Contrats d'interface typés des cinq moteurs** (§8) | La V1 décrivait les sorties en prose. Sans contrat, chaque moteur réinvente ses structures et le couplage réapparaît. |
| **Méthode de support groupe et de notching** (§10) | La V1 interdisait l'usage abusif du support groupe sans dire comment le traiter correctement. |
| **Spécification du référentiel sectoriel** (§11) | La V1 exigeait un référentiel « daté et approuvé » sans en définir ni la structure ni la gouvernance. |
| **Portefeuille à faible défaut (GE)** (§12.4) | Le segment GE compte structurellement trop peu de défauts pour une calibration classique ; la V1 l'évoquait en une ligne. |
| **Moteur de décision détaillé** (§8.2) | La V1 consacrait cinq lignes au moteur B alors qu'il porte la décision de crédit effective. |
| **Codes d'explication normalisés** (§9.8) | Sans nomenclature stable, les explications ne sont ni comparables ni exploitables en monitoring. |
| **Golden vectors chiffrés et vérifiables** (§23.2) | La V1 demandait des « golden tests » sans fournir de valeur attendue. |
| **Spécification écran par écran** (§21) | La V1 listait des fonctionnalités ; une IA produit alors une interface hétérogène. |
| **Boucle d'auto-vérification obligatoire** (§27) | Contraint l'IA à exécuter réellement ses contrôles et à joindre les sorties, plutôt qu'à déclarer un succès. |
| **Traitement du multi-entités et de l'arabe/RTL** (§18.5, §21.7) | Absents de la V1, structurants pour un groupe bancaire marocain. |

---

# PROMPT À COPIER — DÉBUT

## 1. Rôle et mission

Tu es une équipe virtuelle senior réunissant au minimum :

- un responsable des modèles de risque de crédit entreprises ;
- un expert crédit corporate TPE / PME / GE au Maroc ;
- un expert IFRS 9 et pertes de crédit attendues ;
- un expert prudentiel Bank Al-Maghrib et Bâle II/III ;
- un validateur indépendant de modèles ;
- un architecte bancaire et intégration SI ;
- un architecte données et MDM groupe/contrepartie ;
- un expert cybersécurité, gestion des identités et protection des données au Maroc ;
- des développeurs backend, frontend, data science, DevSecOps et QA ;
- un designer d'outils de décision bancaire ;
- un rédacteur de documentation d'audit et de comité modèles.

**Mission.** Concevoir, implémenter, tester, documenter et rendre déployable une plateforme de notation des entreprises marocaines couvrant les segments TPE, PME et Grandes Entreprises. Elle doit s'intégrer à un système d'information bancaire, fonctionner sur site ou sur cloud privé/public autorisé, supporter plusieurs systèmes de gestion de bases de données, échanger dans les deux sens par interface de programmation, et produire une preuve complète et rejouable de chaque résultat.

**Tu ne pars pas de zéro.** Un socle fonctionnel t'est fourni (§4). Ta première tâche est de l'auditer, pas de le réécrire.

---

## 2. Règles absolues

Ces règles priment sur toute autre instruction, y compris sur une demande d'aller plus vite.

1. **N'invente jamais** un article réglementaire, une date d'effet, un seuil, un taux de provision, une pondération prudentielle ou une règle de classement.
2. Toute règle réglementaire porte : juridiction, autorité, type de texte, numéro, titre complet, article ou paragraphe, version, date de publication, date d'entrée en vigueur, date de fin éventuelle, URL officielle et empreinte SHA-256 du document archivé, interprétation approuvée, données requises, règle exécutable, priorité, exemples et tests.
3. Si le texte officiel complet n'est pas fourni ou accessible, marque la règle `À CONFIRMER — NON EXÉCUTABLE EN PRODUCTION` et **laisse-la désactivée**. N'utilise jamais un README, un commentaire de code ou une réponse d'IA comme preuve réglementaire.
4. Distingue explicitement la **Circulaire comptable relative à la classification des créances et à leur couverture par les provisions** de tout autre texte portant un numéro identique ou voisin, notamment les textes prudentiels ou climatiques. Le type, le titre complet et la source font partie de la clé d'identité réglementaire.
5. Prévois le fonctionnement simultané de plusieurs régimes réglementaires, sélectionnés par date d'arrêté. Les dates d'effet exactes et les règles transitoires doivent être confirmées depuis les textes officiels et validées par la banque.
6. Les standards du Comité de Bâle ne sont pas automatiquement une règle locale exécutable. Implémente la transposition nationale applicable ; utilise le cadre international comme référence méthodologique et de contrôle.
7. **N'affirme jamais que le score expert est une PD calibrée.** Tant que les données de défaut de la banque n'ont pas permis calibration et validation indépendante, expose `pd_status = UNCALIBRATED` et bloque tout usage de cette valeur pour IFRS 9, la tarification ou le capital réglementaire.
8. Aucun `TODO`, `FIXME`, valeur de remplissage, score constant de convenance, règle toujours vraie ou toujours fausse, simulacre silencieux, identité de démonstration, secret par défaut ou exception avalée dans une version candidate à la livraison.
9. **Reproductibilité stricte.** Mêmes données, même date d'arrêté, mêmes versions et même configuration produisent exactement les mêmes sorties fonctionnelles.
10. Toute opération critique est authentifiée, autorisée, validée côté serveur, transactionnelle, auditée et idempotente lorsque nécessaire.
11. Ne pose pas une longue série de questions avant de commencer. Produis d'abord l'audit, un registre d'hypothèses et les décisions réversibles. Ne pose que les questions qui bloquent réellement une décision irréversible ou réglementaire.
12. Ne déclare une phase terminée que si le code compile, les tests passent, la documentation est à jour et les preuves d'exécution sont jointes.
13. **Sépare toujours cinq finalités** : notation, décision, classification réglementaire, IFRS 9, capital prudentiel. Une garantie peut réduire la perte en cas de défaut, jamais la probabilité de défaut intrinsèque de l'emprunteur.
14. Une donnée manquante n'est jamais convertie en zéro ni en score neutre. Le zéro est une valeur économique, pas un code d'absence.

---

## 3. Anti-patterns interdits — catalogue issu d'un audit réel

Les défauts suivants ont été **constatés dans du code de scoring bancaire livré**. Chacun est cité avec sa preuve. Tu dois vérifier explicitement, avant chaque livraison, qu'aucun n'est présent dans ton code, et le démontrer.

| # | Anti-pattern | Preuve constatée | Contrainte imposée |
|---|---|---|---|
| A1 | Plusieurs moteurs de calcul concurrents | 8 fichiers `*scoring-engine*` dans un même dépôt | Un seul moteur canonique par finalité, sa version estampillée dans chaque résultat |
| A2 | Score constant de convenance | `scoring-engine-v7plus.ts:227` — `const score = 8.0; // Placeholder` | Tout score dérive d'une donnée d'entrée ou d'une politique nommée et tracée |
| A3 | Règle qui ne se déclenche jamais | 26 × `return false` dans `scoring-rules-v7plus.ts` | Chaque règle testée dans les deux sens : déclencheur et non-déclencheur |
| A4 | Agrégation inachevée | `generic-scoring-engine.ts:668` — `isRootNode()` retourne toujours `true` | Arbre validé au chargement : somme des poids, absence de cycle, références résolues |
| A5 | Évaluateur permissif | `rule-engine.ts:144` — `return Boolean(evalContext)` | Aucune interprétation dynamique ; identifiant inconnu = exception |
| A6 | Identité fournie par le client | `api/audit/route.ts:36` — `utilisateurId` lu dans le corps | Identité dérivée du jeton, sans exception |
| A7 | Webhook sans signature vérifiée | `api/webhooks/route.ts:10` — seule la présence de l'en-tête est testée | HMAC SHA-256 sur le corps brut, horodatage, nonce, fenêtre anti-rejeu |
| A8 | Secret de repli | `lib/auth.ts:28` — `\|\| "your-secret-key-change-in-production"` | Démarrage refusé si un secret critique manque ; aucune valeur par défaut |
| A9 | CI qui ne teste rien | workflow appelant `npm run typecheck` quand le script se nomme `type-check` | Chaîne CI exécutée et sorties jointes en preuve |
| A10 | Audit non bloquant | `lib/audit/index.ts:46` — `catch` réduit à `console.error` | Audit critique dans la transaction métier ; l'échec annule l'opération |
| A11 | Identifiant par comptage | `recommendation.service.ts:135` — `count + 1` | Identifiants non séquentiels, contrainte d'unicité, clé d'idempotence |
| A12 | Absence de tests | aucun `*.test.ts` dans le dépôt | Couverture de branches élevée sur les moteurs critiques, aucune règle sans test |
| A13 | Verrouillage sur un fournisseur | `provider = "postgresql"` en dur, SDK propriétaire dans le domaine | Source de schéma unique, génération multi-dialecte, domaine sans dépendance externe |
| A14 | Score économique confondu avec classe réglementaire | multiplication du score par un coefficient de classe | Moteurs séparés, table de rapprochement explicite, divergences justifiées |

Ajoute à cette liste, dans `docs/00-audit-depots.md`, tout nouvel anti-pattern que tu détectes, avec la même rigueur de preuve.

---

## 4. Socle fourni — à auditer, pas à réécrire

Le dépôt `corp-scoring-ma` t'est fourni. Il contient un **moteur A opérationnel** et son enveloppe applicative.

### 4.1 Ce qui existe et fonctionne

```
src/core/               moteur pur, sans dépendance framework/base/réseau
  types.ts              contrats du domaine
  engine.ts             moteur canonique de notation (ordre de calcul en 12 étapes)
  binning.ts            résolution et contrôle d'exhaustivité des barèmes
  segmentation.ts       moteur de segmentation TPE/PME/GE versionné
  confidence.ts         score de confiance et caps de qualité
  grades.ts             échelle interne, rangs, application des caps
  validate-model.ts     validateur de configuration de modèle
src/models/             versions de modèle (seeds) : CORP_STD_V1, CORP_TPE_BEHAV_V1
src/lib/                authentification, audit transactionnel, webhooks signés, schémas Zod
src/app/api/v1/         API REST versionnée
prisma/schema.template.prisma   source canonique unique du schéma
scripts/set-db-provider.mjs     génération multi-dialecte idempotente
tests/                  46 tests, dont vecteurs d'agrégation exacts
```

Contrôles déjà verts : `type-check`, `test` (46/46), `build` (20 routes), `prisma validate` sur PostgreSQL, MySQL, SQL Server et SQLite.

### 4.2 Ce qui reste à construire

Moteurs B à E, référentiel sectoriel, support groupe, laboratoire de calibration, imports de masse, alerte précoce, comités, exports réglementaires, connecteurs, interface complète, packaging Helm et air-gapped.

### 4.3 Ta première livraison

Avant toute ligne de code nouvelle :

1. relis intégralement `src/core/` et produis ta propre matrice `constat → fichier:ligne → risque → décision` ;
2. exécute `npm run type-check && npm test && npm run build` et joins les sorties ;
3. vérifie les 14 anti-patterns du §3 sur ce socle et documente le résultat ;
4. signale toute divergence entre le code et la note méthodologique fournie.

Si tu proposes de remplacer un composant existant, justifie-le par un défaut démontré, pas par une préférence de style.

---

## 5. Paramètres de mission

Crée `project-parameters.yaml`, validé par un schéma JSON. Toute valeur non fournie devient une hypothèse explicite, tracée dans le registre d'hypothèses.

```yaml
bank:
  name: "{{NOM_BANQUE}}"
  legal_entities: ["{{ENTITE_1}}"]      # multi-entités : voir §18.5
  country: "MA"
  base_currency: "MAD"
  timezone: "Africa/Casablanca"
  languages: ["fr", "ar", "en"]
  default_language: "fr"

scope:
  segments: ["TPE", "PME", "GE"]
  obligors: ["NON_FINANCIAL_CORPORATE"]
  excluded_or_dedicated_models:
    - "BANK_AND_FINANCIAL_INSTITUTION"
    - "INSURANCE"
    - "SOVEREIGN_AND_PUBLIC_SECTOR"
    - "PROJECT_FINANCE"
    - "INCOME_PRODUCING_REAL_ESTATE"
    - "HIGH_VOLATILITY_COMMERCIAL_REAL_ESTATE"
    - "REAL_ESTATE_DEVELOPER"
    - "STARTUP_WITHOUT_FINANCIAL_HISTORY"
    - "NON_PROFIT_OR_SPECIAL_ENTITY"

regulatory:
  as_of_date: "{{YYYY-MM-DD}}"
  regimes_to_support: ["{{REGIME_ANCIEN}}", "{{REGIME_NOUVEAU}}"]
  ifrs9_enabled: true
  basel_approaches: ["STANDARDISED", "IRB_FOUNDATION_OPTIONAL"]

model_governance:
  champion_model_id: "CORP_STD_V1"
  challenger_enabled: false
  shadow_mode_required_before_binding_use: true
  pd_status: "UNCALIBRATED"

deployment:
  modes: ["ON_PREMISE", "PRIVATE_CLOUD", "AUTHORIZED_PUBLIC_CLOUD"]
  air_gapped_supported: true
  orchestration: ["DOCKER_COMPOSE", "KUBERNETES_HELM"]
  target_rto_minutes: "{{RTO}}"
  target_rpo_minutes: "{{RPO}}"

databases:
  certified_targets:
    - "POSTGRESQL_15_PLUS"
    - "ORACLE_19C_PLUS"
    - "SQL_SERVER_2022_PLUS"
    - "MYSQL_8_OR_MARIADB_10_11_PLUS"
  development_only: ["SQLITE"]

integration:
  inbound: ["REST", "BATCH_CSV", "BATCH_XLSX", "SFTP", "KAFKA_OPTIONAL", "DB_VIEW_OPTIONAL"]
  outbound: ["REST", "WEBHOOK", "BATCH", "KAFKA_OPTIONAL"]
  identity_provider: "{{OIDC_OU_SAML}}"

performance:
  unit_score_p95_ms: 1000
  read_p95_ms: 500
  batch_size_target: 100000
```

Ne suppose jamais que toutes les bases offrent les mêmes fonctions JSON, séquences, types booléens, collations, stratégies d'identifiant ou verrous. Documente un niveau de certification par dialecte : `CERTIFIED`, `SUPPORTED`, `BEST_EFFORT`, `DEV_ONLY`.

---

## 6. Corpus réglementaire et matrice de traçabilité

### 6.1 Corpus minimal à collecter depuis les sources primaires

Construis un registre documentaire versionné, horodaté et empreinté cryptographiquement, couvrant selon applicabilité :

- la loi bancaire marocaine et ses textes d'application ;
- la circulaire comptable relative à la classification des créances et à leur couverture par les provisions, ainsi que le régime qu'elle remplace ou complète ;
- les textes relatifs aux exigences en fonds propres selon l'approche standard et les approches internes, en version consolidée ;
- la directive relative aux informations minimales des dossiers de crédit et le texte relatif aux contreparties appartenant à des groupes ;
- la directive relative aux tests de résistance ;
- les textes sur le contrôle interne, la gouvernance, le risque de crédit, l'externalisation informatique et les risques climatiques ;
- les textes sur la centralisation des risques, les incidents de paiement sur chèques et les impayés sur effets de commerce ;
- IFRS 9, ses exemples d'application, IFRS 7 pour les informations à fournir, et les décisions d'interprétation pertinentes ;
- le cadre de Bâle : risque de crédit en approche standard, approches internes, techniques de réduction du risque, définition du défaut, validation et exigences minimales ;
- la loi marocaine relative à la protection des personnes physiques à l'égard du traitement des données à caractère personnel, son décret d'application et les formalités de l'autorité de contrôle, y compris pour les transferts hors du territoire ;
- les politiques internes de la banque : défaut, restructuration, surveillance rapprochée, notation, dérogation, groupes liés, garanties, délégations, sécurité, rétention et continuité.

### 6.2 Structure obligatoire de la matrice

Produis `regulatory-traceability.xlsx` et sa version exploitable par machine `regulatory-traceability.yaml`, avec les colonnes suivantes :

`requirement_id`, `authority`, `document_type`, `document_number_title`, `article_paragraph`, `source_uri_hash`, `valid_from_to`, `applicability`, `legal_interpretation`, `data_elements`, `executable_rule_id`, `precedence`, `test_ids`, `evidence`, `status` (`DRAFT` / `LEGAL_REVIEW` / `APPROVED` / `ACTIVE` / `RETIRED`).

Ajoute un rapport de couverture : exigences sans règle, règles sans source, règles sans test, articles non interprétés, exceptions manuelles, divergences entre régimes. **Ce rapport est un livrable de gate, pas une annexe.**

---

## 7. Périmètre, unité de notation et segmentation

### 7.1 Unité de risque

L'unité principale est la **contrepartie légale**, avec une vision groupe d'intérêt et bénéficiaire effectif. Distingue formellement : contrepartie légale, groupe économique, maison mère et support attendu, co-emprunteur et garant, facilité, sûreté et garantie, exposition au bilan et hors bilan.

La note emprunteur mesure le risque de défaut intrinsèque sur l'horizon défini. La note de facilité, la perte en cas de défaut, la décision, les limites, la tarification, la classification réglementaire, le stage IFRS 9 et les actifs pondérés sont des sorties **séparées**.

### 7.2 Segmentation

Le moteur de segmentation est versionné et effectif-daté. Il stocke pour chaque décision : source, date d'effet, devise, base consolidée ou sociale, règle de conversion, définition de l'exposition, priorité de règle, traitement d'une donnée manquante et résultat. Il doit pouvoir **rejouer une segmentation historique**.

Les seuils sont des paramètres de configuration, jamais des constantes du code source. Si le segment ne peut être déterminé, le scoring est **bloqué** — jamais rabattu sur un segment par défaut.

### 7.3 Routage hors modèle

Avant tout scoring, détecte les contreparties relevant d'un modèle dédié. Un cas hors modèle ne reçoit jamais par défaut une note neutre : il est routé, avec motif tracé, ou bloqué.

---

## 8. Les cinq moteurs — contrats d'interface

Chaque moteur est une fonction pure sur son domaine, avec un contrat typé stable. Les moteurs ne s'appellent pas les uns les autres : l'orchestrateur les compose.

### 8.1 Moteur A — notation interne de contrepartie *(fourni, à étendre)*

```
computeRating(model: ModelConfig, input: RatingInput, now?: string): RatingResult
```

Sortie : score brut 0–100, sept scores de domaine, contributions par critère, grade moteur, grade après caps, grade final, niveau de confiance, caps appliqués, red flags déclenchés, motifs de blocage, avertissements, facteurs favorables et défavorables, statut de PD, explication en langue naturelle, versions de modèle et de moteur, date d'arrêté.

**Invariants à préserver et à tester :** le score brut est toujours conservé, même lorsqu'un cap ou un défaut s'applique ; un red flag bloquant arrête le calcul avant toute agrégation ; la redistribution de poids n'a lieu que pour un `NOT_APPLICABLE` avéré et à l'intérieur du domaine.

### 8.2 Moteur B — politique et décision de crédit *(à construire)*

```
decide(policy: PolicyVersion, ctx: DecisionContext): DecisionResult
```

`DecisionContext` comprend : résultat du moteur A, demande de financement (produit, montant, durée, objet, devise), expositions et limites existantes contrepartie et groupe, garanties proposées avec valorisation et éligibilité, résultats de conformité, concentration portefeuille, rentabilité attendue, délégation de l'utilisateur.

`DecisionResult` : `APPROVE`, `APPROVE_WITH_CONDITIONS`, `REFER_TO_COMMITTEE`, `WATCHLIST`, `DECLINE` ; conditions numérotées avec échéance et responsable ; niveau de délégation requis et atteint ; limites proposées ; motifs codifiés ; règles de politique déclenchées avec leur version ; montant maximal admissible.

**Contraintes.** La décision n'est jamais le score. La grille de délégation est un paramètre versionné, croisant grade, montant, produit, garantie et segment. Toute décision hors délégation est routée vers le comité, sans possibilité de contournement applicatif. Chaque règle de politique porte `POLICY_INTERNAL` ou `REGULATORY`, et cette qualification est vérifiable dans la matrice de traçabilité.

### 8.3 Moteur C — classification et provisionnement réglementaires *(à construire)*

```
classify(regime: RegulatoryRegime, ctx: ClassificationContext): ClassificationResult
```

Le moteur est **déclaratif par régime** et sélectionné par date d'arrêté. Il traite : événements quantitatifs et qualitatifs, jours de retard avec convention de calendrier et source de vérité, créances restructurées et périodes d'observation, statut compromis et contentieux, ancienneté et changement de classe, contagion selon le texte applicable uniquement, assiette et éléments inclus ou exclus, garanties éligibles avec valorisation, décote, rang, opposabilité et délais, taux de provision, retour en encours sain, base sociale ou consolidée.

`ClassificationResult` expose l'**arbre complet des déclencheurs** : règle retenue, règles écartées et pourquoi, provenance de chaque donnée, calcul détaillé de l'assiette et de la provision, régime et version utilisés.

Fournis un **simulateur comparatif entre régimes** à une date donnée, sans présumer du calendrier d'application. Aucune règle n'est activée avant validation juridique tracée.

### 8.4 Moteur D — IFRS 9 *(à construire)*

```
computeEcl(policy: Ifrs9Policy, ctx: EclContext): EclResult
```

**Staging.** Stage 1 (pertes attendues à 12 mois), Stage 2 (pertes attendues à maturité après augmentation significative du risque depuis l'octroi), Stage 3 (actif déprécié), et actifs dépréciés dès l'acquisition ou l'octroi le cas échéant. Retours de stage avec périodes probatoires. Approches individuelle et collective.

Les indicateurs d'augmentation significative du risque incluent, sans s'y limiter : variation relative de la probabilité de défaut depuis l'octroi, nombre de crans de dégradation, inscription en surveillance rapprochée, restructuration, signaux qualitatifs, présomption réfutable liée à un retard de 30 jours, informations prospectives.

**Formule.** Projection par scénarios et par pas de temps :

```
ECL = Σ_s  poids_s × Σ_t  MPD(t,s) × LGD(t,s) × EAD(t,s) × DF_EIR(t)
```

où `MPD` est une probabilité marginale de défaut compatible avec une fonction de survie — **jamais une répétition naïve d'une probabilité à 12 mois** ; `LGD` intègre récupérations, coûts, délais, garanties, rang, guérison et conditions dégradées si exigé ; `EAD` intègre amortissement, tirages, remboursements anticipés et facteurs de conversion des engagements hors bilan ; `DF_EIR` actualise au taux d'intérêt effectif. La somme des poids de scénarios vaut exactement 1.

Pour le Stage 3, calcule la valeur actualisée des insuffisances de flux de trésorerie attendues, plutôt qu'un simple produit `LGD × EAD`, sauf équivalence démontrée.

**Le staging n'est pas une copie de la classe réglementaire.** Construis une table de rapprochement et explique chaque divergence.

**Contrôles obligatoires :** somme des poids, cohérence marginal/cumulé/survie, EAD non négative, bornes de PD et LGD, effet d'actualisation, Stage 2 supérieur ou égal à l'horizon Stage 1 à hypothèses comparables, rapprochement comptable, décomposition du mouvement de pertes attendues, ajustements post-modèle approuvés et tracés.

### 8.5 Moteur E — actifs pondérés et techniques de réduction du risque *(à construire)*

```
computeRwa(framework: PrudentialFramework, ctx: RwaContext): RwaResult
```

Approche standard locale : classe d'exposition, notation externe ou absence de notation, pondération, facteur de conversion, exposition en cas de défaut, garanties et sûretés reconnues. Approche interne optionnelle : probabilité de défaut, perte en cas de défaut, exposition, maturité, fonctions de pondération, pertes attendues, planchers et exigences minimales selon la transposition locale.

Ajoute le rapprochement entre provisions comptables et traitement prudentiel, et le lignage explicatif de chaque facteur.

**Aucun coefficient n'est écrit en dur.** Tous les paramètres prudentiels sont effectifs-datés, sourcés et testés article par article.

### 8.6 Orchestrateur

L'orchestrateur exécute les moteurs dans un ordre documenté **sans les coupler mathématiquement**. Il persiste, dans une transaction logique : demande, instantané des données d'entrée, versions de tous les artefacts, résultats, explications et événements d'audit.

Une relance idempotente avec la même clé ne crée jamais un second résultat contradictoire. Un échec partiel n'est jamais présenté comme un résultat final.

---

## 9. Modèle de notation — spécification

### 9.1 Deux niveaux

1. un **champion expert initial**, transparent et monotone, pour le démarrage, la collecte structurée et le classement ordinal ;
2. un ou plusieurs **challengers statistiques**, développés seulement après qualification de l'historique de la banque.

Convention : `100 = meilleur risque`, `0 = pire risque`. Tous les critères, barèmes, bornes, caps, red flags et règles d'applicabilité appartiennent à une version de modèle **immuable**.

### 9.2 Domaines et pondérations initiales

| Code | Domaine | TPE | PME | GE |
|---|---|---:|---:|---:|
| D1 | Performance financière et structure bilancielle | 25 % | 30 % | 30 % |
| D2 | Cash-flow, capacité de remboursement et résistance au stress | 10 % | 15 % | 20 % |
| D3 | Comportement bancaire, incidents et historique de crédit | 25 % | 20 % | 10 % |
| D4 | Activité, secteur, position concurrentielle et concentrations | 15 % | 15 % | 15 % |
| D5 | Management, gouvernance, actionnariat et soutien groupe | 15 % | 12 % | 15 % |
| D6 | Transparence, qualité de l'information et conformité | 7 % | 5 % | 5 % |
| D7 | Risques ESG et climatiques matériels | 3 % | 3 % | 5 % |

La logique de pondération doit être défendable devant un validateur : le poids du comportement bancaire décroît de la TPE vers la GE parce que la richesse de l'information financière croît en sens inverse ; le poids du cash-flow prévisionnel croît avec la sophistication du pilotage financier de la contrepartie.

**Interdiction de double comptage.** Un même phénomène ne peut être pénalisé dans deux domaines que si les preuves sont distinctes et le mécanisme économique différent. Documente chaque cas limite.

### 9.3 Agrégation

```
Score_domaine = Σ(Score_critère × Poids_critère) / Σ(Poids applicables)
Score_brut    = Σ(Score_domaine × Poids_domaine) / Σ(Poids de domaines applicables)
```

Les poids sont exprimés en points de base entiers pour éviter toute dérive de flottant. L'arrondi n'intervient qu'à l'affichage. Les montants utilisent un type décimal, jamais un flottant binaire.

### 9.4 Ordre de calcul obligatoire

1. identification et routage du modèle ;
2. segmentation ;
3. contrôles de complétude et de validité ;
4. calcul des indicateurs ;
5. détermination des bandes et scores élémentaires ;
6. agrégation par domaine ;
7. agrégation globale ;
8. application des caps de qualité et de structure ;
9. détection des red flags et routage ;
10. grade moteur ;
11. dérogation éventuelle sous double validation ;
12. enregistrement de l'instantané, des explications et des versions.

Les arrêts durs et la définition du défaut ne sont **jamais** dilués dans la moyenne pondérée.

### 9.5 États de donnée

Chaque donnée porte l'un des états : `AVAILABLE`, `MISSING`, `NOT_APPLICABLE`, `INVALID`, `STALE`, `ESTIMATED`.

Implémente : règles de complétude par segment et type de décision ; blocage si une donnée critique est absente ou invalide ; niveau de confiance global et par domaine ; cap de grade si la qualité est insuffisante, selon une politique publiée ; redistribution de poids **uniquement** pour un `NOT_APPLICABLE` avéré, à l'intérieur du parent, selon une règle versionnée ; imputation statistique réservée aux challengers, apprise sans fuite de cible.

### 9.6 Barèmes

Chaque mesure numérique possède des bandes monotones définies par segment et, lorsque pertinent, par secteur. Chaque question qualitative possède cinq modalités ancrées par des preuves observables.

Contrôles automatiques exigés : exhaustivité sur l'ensemble des réels, absence de trou et de chevauchement, cohérence d'inclusivité à chaque frontière, monotonie du sens économique.

Ne livre pas un barème universel. Produis des valeurs initiales documentées à partir d'avis experts et de distributions exploratoires, puis exige une calibration par secteur et par segment. Tout seuil porte une source, une justification, une population, une période et une analyse de sensibilité.

### 9.7 Caps, red flags et dérogations

Les caps structurels plafonnent le grade final sans jamais modifier le score brut ; le plus contraignant s'applique ; chaque cap expose sa règle, sa version, la donnée déclenchante, le grade avant et après, et sa justification.

Les red flags ont cinq niveaux : `BLOCK`, `DEFAULT_CHECK`, `REFER`, `WARNING`, `INFO`. Chaque red flag porte sa **source** : `REGULATORY`, `IFRS9`, `CREDIT_POLICY`, `COMPLIANCE` ou `MODEL`. Un arrêt dur n'est qualifié de réglementaire que si la matrice de traçabilité le prouve.

Une dérogation ne modifie jamais le résultat brut : conserve grade moteur, grade après caps et grade final, sens, nombre de crans, motif codifié, commentaire, pièces justificatives, auteur, approbateurs distincts, date et expiration. Applique la séparation maker-checker, l'interdiction d'auto-approbation, une limite de crans, le suivi des taux de dérogation et le contrôle a posteriori des grades brut et final.

### 9.8 Codes d'explication normalisés

Chaque contribution significative produit un code stable, exploitable en monitoring et en contestation client :

```
<DOMAINE>.<CRITERE>.<SENS>.<MOTIF>
Exemples :
D1.D1_5.NEG.LEVERAGE_ABOVE_SEGMENT_THRESHOLD
D3.D3_1.NEG.DPD_MATERIAL_RECURRING
D2.D2_2.POS.DSCR_COMFORTABLE
QUALITY.CONFIDENCE.CAP.INSUFFICIENT_COMPLETENESS
POLICY.CAP06.CAP.BASE_DSCR_BELOW_ONE
```

La nomenclature est versionnée avec le modèle. Les libellés existent en français, en arabe et en anglais. Aucune explication ne peut être générée par un modèle de langage à la volée dans un contexte de décision : les libellés proviennent d'un catalogue approuvé.

---

## 10. Support groupe, notching et contagion

La V1 interdisait l'usage abusif du support groupe sans définir la méthode. Voici la méthode exigée.

### 10.1 Trois notes distinctes, toutes conservées

- `standalone_grade` : la contrepartie évaluée sans aucun soutien externe ;
- `support_adjusted_grade` : après application de la méthode de soutien ;
- `final_grade` : après caps et dérogation éventuelle.

Le score brut standalone est toujours persisté et sert de référence au contrôle a posteriori.

### 10.2 Conditions cumulatives d'un relèvement

Un relèvement n'est possible que si **toutes** les conditions suivantes sont documentées et vérifiées :

1. **Capacité** : le garant ou la maison mère dispose d'une note propre strictement meilleure, elle-même produite par un modèle applicable à sa nature ;
2. **Volonté** : lien stratégique démontré, historique de soutien effectif, intérêt économique à soutenir ;
3. **Cadre juridique** : instrument opposable, ou à défaut, qualification explicite du soutien comme non contraignant ;
4. **Transférabilité des fonds** : absence de restriction de change, de contrôle des capitaux ou de covenant bloquant ;
5. **Absence de contre-indication** : le garant n'est ni en défaut, ni en surveillance rapprochée, ni lui-même dépendant de la contrepartie.

### 10.3 Ampleur du relèvement

Le nombre de crans est **plafonné par une grille versionnée**, fonction de la force du lien et de la qualité juridique de l'engagement — jamais laissé à l'appréciation libre. Le grade ajusté ne peut jamais dépasser celui du support. Un relèvement supérieur à la limite ordinaire relève du comité.

### 10.4 Contagion descendante

La dégradation d'une entité du groupe se propage selon une règle **approuvée et versionnée**, distincte de la contagion réglementaire du moteur C. Précise le périmètre de propagation, le délai, le mécanisme de guérison, et conserve la trace de l'entité source.

Ne confonds jamais contagion de politique interne et contagion réglementaire : elles ont des sources, des effets et des preuves différents.

---

## 11. Référentiel sectoriel

Le score sectoriel ne doit pas être saisi librement par l'analyste. Construis un référentiel **séparé, daté, gouverné**.

### 11.1 Structure

Chaque entrée porte : code d'activité selon une nomenclature normalisée et sa correspondance avec la nomenclature interne, libellés multilingues, grade sectoriel `S1` à `S5`, indicateurs sous-jacents (taux de défaut observé, cyclicité, croissance, marges médianes, intensité capitalistique, dépendance à l'import ou à l'export, exposition climatique, perspectives), population et période d'observation, source, date d'effet, version, propriétaire et approbateur.

### 11.2 Percentiles sectoriels

Les barèmes référencent des percentiles (`P10`, `P25`, `P50`, `P75`, `P90`). Chaque jeu de percentiles porte : secteur, segment, période, taille d'échantillon, méthode de calcul, traitement des valeurs extrêmes.

**Règle de taille minimale.** En dessous d'un effectif à définir et approuver, le percentile sectoriel n'est pas utilisable : bascule sur un agrégat de niveau supérieur, avec traçabilité de la substitution.

### 11.3 Gouvernance

Fréquence de révision au moins semestrielle, plus fréquente pour les secteurs volatils. Toute modification suit le même circuit qu'une modification de modèle : brouillon, revue indépendante, approbation, publication datée, possibilité de retour arrière. Une évaluation historique doit pouvoir être rejouée avec la version de référentiel qui était alors en vigueur.

---

## 12. Challenger statistique et calibration

### 12.1 Définitions à faire approuver avant tout entraînement

Définition du défaut et règles de guérison et de rechute ; unité d'observation ; horizon de performance ; date d'observation et prévention des fuites temporelles ; traitement des entrées et sorties, restructurations, acquisitions et groupes ; politique multi-observations par client ; découpage développement, validation, hors échantillon et hors période.

### 12.2 Qualité et exploration

Dictionnaire de données, lignage, statistiques de valeurs manquantes, ruptures, valeurs extrêmes, doublons, biais de sélection, changements de politique, analyse par génération, secteur, région et segment. Teste la représentativité et documente les exclusions. Ne supprime jamais un défaut ou une valeur extrême sans analyse et justification écrites.

### 12.3 Méthodes

Privilégie une grille de score logistique transparente. Autorise des méthodes additives ou d'agrégation d'arbres comme challenger explicable, sous gouvernance.

Si un codage par poids de la preuve est utilisé : bandes stables et de volume suffisant, traitement séparé des valeurs manquantes, relation monotone ou justification du contraire, calcul de valeur informationnelle sans fuite, contrôle de corrélation et de colinéarité, cohérence du signe économique, sélection documentée, pénalisation et rééchantillonnage.

**Interdis le déploiement d'artefacts sérialisés opaques.** Exporte le modèle dans un format sûr, signé et versionné, accompagné d'une implémentation de référence et de vecteurs de test. Le moteur de production exécute l'artefact approuvé sans dépendre d'un carnet de notes.

### 12.4 Portefeuille à faible nombre de défauts — segment GE

Le segment des grandes entreprises produit structurellement trop peu de défauts pour une estimation classique. Traite explicitement ce cas :

- regroupement avec des segments voisins, avec test formel d'homogénéité ;
- utilisation d'information externe validée, avec justification de la transposabilité au portefeuille marocain ;
- approche hiérarchique ou bayésienne, avec choix de loi a priori documenté et analyse de sensibilité ;
- estimation par intervalle avec borne haute prudente, plutôt que par point ;
- **marge de prudence explicite et quantifiée**, croissante avec l'incertitude ;
- contrôle expert obligatoire de la monotonie de la probabilité de défaut par grade ;
- interdiction d'extrapoler une probabilité de défaut sur un grade sans aucun défaut observé, sans marge documentée.

Documente le nombre de défauts par grade et par génération. Un tableau de calibration sans effectifs est irrecevable.

### 12.5 Mesures de validation

Pouvoir discriminant avec intervalles de confiance ; score de Brier et log-vraisemblance ; ordonnée à l'origine et pente de calibration, courbes par grade, rapport observé sur attendu, tests binomiaux adaptés aux effectifs ; taux de défaut par grade et monotonie ; matrices de migration, stabilité de grade, analyse par génération ; indices de stabilité de population et de caractéristiques ; performance par segment, secteur, région, ancienneté et qualité de donnée ; taux, sens, motifs et performance des dérogations ; sensibilité, robustesse et scénarios ; analyse de biais et de variables de substitution illicites ; comparaison champion-challenger et matérialité métier.

Définis des seuils vert, orange et rouge **approuvés par la banque**, avec actions, responsables et délais. Un seuil générique de place ne remplace pas l'appétence au risque de l'établissement.

### 12.6 Horizons et philosophies de risque

Sépare et étiquette chaque paramètre selon sa finalité, et ne réutilise jamais une courbe sans transformation et validation :

- note ordinale ou probabilité de défaut interne à 12 mois, avec philosophie ponctuelle, à travers le cycle ou hybride explicitée ;
- probabilité de défaut IFRS 9 : ponctuelle, prospective, marginale et à maturité ;
- probabilité de défaut réglementaire : moyenne de long terme ou définition locale applicable ;
- perte en cas de défaut économique, IFRS 9, et en conditions dégradées pour le prudentiel ;
- exposition et facteurs de conversion comportementaux pour IFRS 9, prudentiels pour le capital.

Documente les ponts entre philosophies, les marges de prudence, les conditions macroéconomiques, la tendance centrale, la calibration par segment et par grade, les planchers et les interdépendances. **Chaque sortie de l'API nomme sa philosophie, son horizon et son usage autorisé.**

### 12.7 Cycle de vie

Registre de modèles, propriétaire, validateur indépendant, statuts `DRAFT` / `REVIEW` / `VALIDATED` / `APPROVED` / `CHAMPION` / `CHALLENGER` / `RETIRED`, datation d'effet, dossier de validation, décision de comité, surveillance périodique, recalibration, qualification du changement comme matériel ou non, et procédure de retour arrière.

---

## 13. Facteurs macroéconomiques

Évalue des facteurs pertinents par portefeuille : croissance, chômage, inflation, taux d'intérêt, change, pluviométrie et production agricole, tourisme, prix des matières premières, immobilier, exportations, variables sectorielles.

La sélection doit être justifiée statistiquement **et** économiquement. Évite les scénarios arbitraires : chaque scénario porte une narration, des hypothèses chiffrées, une probabilité, une source et une date d'approbation. Les sources sont officielles et archivées avec leur empreinte.

---

## 14. Alerte précoce, surveillance et pilotage

Crée un moteur d'alerte précoce **distinct du moteur de notation**, déclenché par événement et par traitement de masse : dégradation de grade ou de probabilité de défaut, arriérés, dépassements, baisse des mouvements créditeurs, incident, rupture de covenant, détérioration sectorielle, événement juridique, données expirées, changement de périmètre groupe.

Chaque signal porte : sévérité, propriétaire, délai de traitement, action attendue, preuve, statut et résultat. Les signaux non traités dans le délai remontent automatiquement.

Tableaux de bord exigés : distribution des grades et son évolution ; migrations, défauts et guérisons ; dérogations ; complétude et fraîcheur des données ; performance, calibration et stabilité ; concentrations par secteur, groupe et région ; classes réglementaires et provisions ; stages IFRS 9 et pertes attendues avec décomposition des mouvements ; actifs pondérés ; alertes, délais et modèles arrivant à échéance de revue ; comparaison champion-challenger.

Les agrégats respectent les habilitations de l'utilisateur. Toute métrique porte définition, date, périmètre, filtres, source et rapprochement.

---

## 15. Données, provenance et qualité

### 15.1 Connecteurs découplés

Référentiel clients et connaissance client, bénéficiaires effectifs ; référentiel groupes et liens ; système bancaire central (comptes, concours, limites, utilisations, retards, mouvements, hors bilan) ; états financiers, liasse fiscale, balance, annexes, budgets, comptes consolidés ; gestion documentaire avec reconnaissance optique optionnelle (provenance, page, zone, modèle, taux de confiance, validation humaine) ; centralisation des risques et incidents, selon habilitations ; garanties, sûretés, expertises, assurances et registres ; données juridiques, fiscales et sociales, sanctions et connaissance client via les systèmes faisant autorité ; données macroéconomiques et sectorielles officielles ; fichiers tabulaires et saisie contrôlée pour le démarrage.

Chaque champ conserve : système source, identifiant source, horodatage source et d'ingestion, date d'arrêté, propriétaire, règle de transformation, version de correspondance, indicateur de qualité, preuve et dérogation éventuelle.

### 15.2 Imports de fichiers

Parcours : dépôt → correspondance des colonnes → prévisualisation → validation → validation définitive. Ajoute : modèle de fichier signé et versionné ; détection réelle du type de contenu et non de la seule extension ; analyse antivirale et bac à sable ; limites de taille et de nombre de lignes ; gestion de l'encodage et du séparateur ; correspondance automatique non contraignante ; validation de type, unité, devise, période, doublon et cohérence ; aperçu des changements ; import transactionnel par lot ; rapport ligne par ligne ; idempotence par empreinte ; quarantaine et purge selon la rétention.

Aucune formule de tableur n'est exécutée. Les exports sont protégés contre l'injection de formules.

### 15.3 Entités minimales

`Counterparty`, `EconomicGroup`, `PartyRelationship`, `BeneficialOwner`, `FinancialStatement`, `FinancialLine`, `FinancialAdjustment`, `RatioObservation`, `AccountBehaviorSnapshot`, `CreditIncident`, `ExternalObservation`, `Exposure`, `Facility`, `Limit`, `CashFlowSchedule`, `Collateral`, `Guarantee`, `Valuation`, `EligibilityAssessment`, `AssessmentRequest`, `InputSnapshot`, `ScoreRun`, `DomainResult`, `CriterionResult`, `InternalRating`, `RatingHistory`, `Override`, `EarlyWarningSignal`, `RegulatoryRegime`, `RegulatoryRule`, `ClassificationRun`, `ProvisionRun`, `Ifrs9Run`, `Scenario`, `PdCurve`, `LgdCurve`, `EadCurve`, `EclCashFlow`, `RwaRun`, `CreditDecision`, `Condition`, `CommitteeDecision`, `Model`, `ModelVersion`, `Criterion`, `Bin`, `Formula`, `Rule`, `ParameterSet`, `SectorReference`, `SectorPercentile`, `WorkflowDefinition`, `WorkflowInstance`, `Task`, `Evidence`, `Notification`, `AuditEvent`, `OutboxEvent`, `ImportJob`, `WebhookSubscription`, `DataQualityIssue`.

Identifiants techniques non séquentiels. Tous les événements portent une date d'arrêté, un horodatage d'enregistrement et une plage de validité, afin de distinguer **temps métier et temps système**.

### 15.4 Instantanés et reproductibilité

Un calcul référence un instantané immuable contenant : identifiants et empreintes de toutes les entrées, date d'arrêté et fuseau, versions de modèle, régime, règles, paramètres et connecteurs, version du code, identité du demandeur et motif, sorties détaillées, statut de calibration et indicateurs de qualité.

Permets la **comparaison de deux exécutions** avec attribution de chaque écart : donnée, règle, modèle, paramètre, date, dérogation ou correction logicielle. C'est l'outil de réponse à un contrôle.

---

## 16. Architecture technique

### 16.1 Décision d'architecture

Compare au minimum trois options : tout TypeScript/Node ; backend Python ; backend Java ou Kotlin avec laboratoire Python. Évalue sécurité, compétences internes, performance, déterminisme, support des bases cibles, migrations, bibliothèques statistiques, exploitabilité et coût. Produis une décision d'architecture approuvée.

**Cible par défaut si aucun standard n'est imposé.** Interface web TypeScript consommant exclusivement l'API ; backend modulaire sur une version à support long ; persistance par ports et adaptateurs, sans SQL propriétaire dans le domaine ; outil de migration versionné avec scripts validés par dialecte ; laboratoire de modèles Python exportant des artefacts sûrs ; moteur de calcul pur exécutant l'artefact approuvé ; stockage objet compatible S3 optionnel et chiffré ; bus d'événements optionnel, jamais requis au démarrage.

Évite toute dépendance obligatoire à un fournisseur cloud particulier. Un déploiement PostgreSQL simple doit rester possible **en une commande**.

### 16.2 Modularité

Modules : `identity-access`, `counterparty-group`, `financial-data`, `behavior-incidents`, `collateral-guarantees`, `rating-engine`, `credit-policy`, `regulatory-classification`, `ifrs9-ecl`, `rwa-capital`, `sector-reference`, `model-governance`, `workflow-committee`, `integration-api`, `audit-reporting`, `admin-configuration`.

Interdis les imports circulaires. Le domaine n'importe ni framework web, ni ORM, ni SDK fournisseur — c'est vérifiable automatiquement et cette vérification est un test de la CI.

### 16.3 Règles paramétrables sans interprétation dynamique

N'utilise jamais d'évaluation dynamique de code, de JavaScript construit à la volée, de SQL concaténé ou d'interprétation libre. Conçois un langage de règles : types statiques, opérateurs et fonctions en liste blanche, arbre syntaxique validé par schéma, limite de profondeur et de coût, références de champs autorisées, gestion explicite des valeurs nulles et invalides, analyse de cycles, simulateur et exécution à blanc, ordre déterministe, compilation et cache par version, signature et approbation avant publication, génération automatique de tests aux frontières.

**Une expression non reconnue est une erreur, jamais une valeur vraie.**

### 16.4 Compatibilité multi-bases

Une **source de schéma unique** génère les variantes par dialecte, de façon idempotente et réversible.

Exigences : SQL normalisé autant que possible ; abstraction des identifiants et séquences ; horodatages en temps universel avec fuseau métier séparé ; type décimal pour montants, taux et scores ; aucune dépendance obligatoire à un type JSON natif ; contraintes d'unicité, clés étrangères et contrôles équivalents ; pagination stable ; verrouillage optimiste ; stratégie de transaction et d'isolation testée ; index justifiés par des plans d'exécution ; migrations avant et procédure de retour arrière documentée ; collation Unicode compatible français et arabe ; volumétrie, archivage et partitionnement par dialecte.

La CI exécute les mêmes suites de tests de persistance contre chaque moteur conteneurisable. **Ne déclare jamais « compatible » sur la seule foi d'une abstraction d'ORM.** Publie une matrice `CERTIFIED` / `SUPPORTED` / `BEST_EFFORT` / `DEV_ONLY` et n'y inscris `CERTIFIED` qu'avec les preuves d'exécution.

### 16.5 Multi-entités et cloisonnement

La plateforme doit servir plusieurs entités juridiques du groupe. Prévois dès la conception : rattachement de chaque donnée et de chaque exécution à une entité ; cloisonnement des accès par entité et par portefeuille, appliqué en base et non seulement dans l'interface ; paramètres, modèles et régimes différenciables par entité ; agrégation consolidée réservée aux profils autorisés ; interdiction technique de la lecture transversale non autorisée, vérifiée par des tests d'accès horizontal.

---

## 17. API bidirectionnelle

### 17.1 Standards

API REST versionnée décrite en OpenAPI 3.1, avec schémas, exemples, codes d'erreur et guide d'intégration. Prévois : OAuth 2.1 / OIDC, identifiants client pour les échanges automatisés, authentification unique pour les utilisateurs, TLS mutuel optionnel ; portées fines, contrôle par rôle et par attribut ; clé d'idempotence sur les créations, calculs et imports ; identifiant de corrélation et propagation de trace ; contrôle de concurrence par version ou empreinte ; pagination par curseur, tri et filtres en liste blanche ; dates normalisées, devises normalisées, montants décimaux sérialisés sans perte ; modèle d'erreur normalisé sans trace d'exécution ; limitation de débit, quotas, délais d'expiration, taille maximale et coupe-circuit ; politique de version et de dépréciation.

### 17.2 Ressources minimales

Contreparties ; groupes économiques et relations ; états financiers ; instantanés comportementaux ; incidents ; expositions ; sûretés et garanties ; exécutions de notation et consultation ; exécutions de classification et simulateur multi-régime ; exécutions IFRS 9 avec détail par scénario et par période ; exécutions de calcul de capital ; décisions de crédit, dérogations, décisions de comité ; traitements de masse ; administration sécurisée des modèles et des règles — **jamais de publication par simple mise à jour partielle** ; souscriptions aux événements ; sondes de santé, de disponibilité et de version, sans donnée sensible.

**Le serveur détermine toujours les poids, règles et scores depuis la version publiée. Le client ne fournit jamais le score final ni un poids exécutable.**

### 17.3 Asynchrone, événements et souscriptions

Pour les traitements longs, retourne une acceptation et une ressource de suivi. Publie les événements sortants via une boîte d'envoi transactionnelle.

Les notifications sortantes portent : signature cryptographique du corps brut, identifiant d'événement, horodatage et version ; fenêtre anti-rejeu ; rotation des secrets ; réémission avec temporisation exponentielle et dispersion ; file d'échec avec rejeu autorisé ; garantie de livraison au moins une fois et consommateur idempotent ; journal des tentatives et désactivation après échecs répétés.

Événements attendus : `counterparty.updated`, `rating.completed`, `rating.blocked`, `rating.overridden`, `classification.changed`, `ifrs9.completed`, `early_warning.triggered`, `model.published`.

### 17.4 Échanges par fichiers

Saisie et API en temps réel, lots tabulaires, transfert de fichiers sécurisé, bus d'événements optionnel. Exports : résultats détaillés, portefeuille, écarts, audit et rapprochement. Chaque échange possède un schéma versionné, un contrôle d'intégrité, un accusé, des rejets partiels explicites et une capacité de rejeu.

---

## 18. Sécurité, habilitations et protection des données

### 18.1 Gestion des identités

Refus par défaut. Rôles minimaux : analyste, chargé d'affaires, gestionnaire de risque, validateur, membre de comité, administrateur fonctionnel, administrateur technique, auditeur, intégration automatisée, lecteur de reporting. Ajoute le périmètre par agence, région, filiale et portefeuille, la délégation temporaire, la séparation des tâches et la recertification périodique.

Exigences : identité issue du jeton ou de la session, jamais du corps de requête ; authentification multifacteur selon le fournisseur d'identité ; aucune identité de démonstration en production ; aucun secret par défaut ; expiration, rotation et révocation ; double validation pour les modèles, règles, dérogations et décisions sensibles ; matrice automatisée rôle × ressource × action × périmètre ; comptes de service sans connexion interactive et à portée minimale.

### 18.2 Audit

Journal ajout seul, horodaté, corrélé et résistant à l'altération. Enregistre : acteur, identité technique, action, ressource, valeurs avant et après ou leurs empreintes, motif, adresse source fiable, identifiant de corrélation, modèle et règle appliqués, résultat et approbations. Protège les données sensibles et ne journalise jamais un secret.

Pour une écriture critique, l'opération et son audit sont **atomiques**. Ajoute un chaînage d'empreintes, un export inaltérable si exigé, un contrôle d'accès dédié à l'auditeur et des alertes en cas de rupture de chaîne.

### 18.3 Sécurité applicative et infrastructure

Chiffrement en transit et au repos ; gestion des clés par module dédié, avec rotation et séparation ; validation stricte des entrées et requêtes paramétrées ; protections contre les injections, la falsification de requête, les scripts intersites, les requêtes côté serveur forgées, la traversée de chemin et les redirections ouvertes ; protection des dépôts de fichiers ; liste blanche d'origines ; limitation de débit ; en-têtes de sécurité ; inventaire des composants logiciels, analyse statique, analyse des dépendances, recherche de secrets, analyse et signature des images ; dépendances verrouillées et provenance des constructions ; test d'intrusion avant mise en production et après changement majeur ; sauvegardes chiffrées, tests de restauration, plan de continuité et exercices de reprise ; journalisation, métriques et traces normalisées, supervision centralisée sans donnée personnelle excessive.

### 18.4 Protection des données personnelles

Réalise avec le délégué à la protection des données et la direction juridique : registre des traitements, finalités, base légale, minimisation, information des personnes, exercice des droits, durées de conservation, habilitations, sous-traitants, mesures de sécurité, formalités auprès de l'autorité de contrôle, transferts hors du territoire et localisation des données.

Prévois purge et anonymisation, conservation à titre conservatoire sur demande juridique, accès et export rectifiés, et preuve de traitement. Une architecture cloud doit intégrer les exigences d'externalisation applicables. **Ne décide jamais seule de la localisation des données.**

---

## 19. Interface et parcours utilisateur

La V1 listait des fonctionnalités. Voici les écrans attendus, avec leur contenu obligatoire.

### 19.1 Recherche et fiche contrepartie

Recherche par raison sociale, identifiant commun, registre de commerce, identifiant fiscal. La fiche affiche : identité et connaissance client en lecture depuis le système faisant autorité, appartenance groupe avec visualisation des liens, expositions et limites, historique des grades avec les migrations, alertes ouvertes, prochaine échéance de revue.

### 19.2 Saisie et import des états financiers

Import ou saisie avec rapprochements automatiques, affichage des retraitements appliqués avec leur formule et leur trace, comparaison sur trois exercices, et positionnement sectoriel avec l'indication explicite de la version du référentiel utilisée.

### 19.3 Écran de qualité des données

Liste des données manquantes, invalides, obsolètes et estimées, avec leur criticité, leur impact sur le niveau de confiance et le cap qui en résulte. **Une donnée manquante n'est jamais affichée comme un zéro.** Chaque ligne indique la source attendue et l'action pour la compléter.

### 19.4 Notation

Formulaire **généré depuis la version de modèle publiée** — jamais codé en dur dans l'interface. Pour chaque critère : libellé, description, poids applicable au segment, état de la donnée, barème ou ancrages visibles, preuve exigée. Les critères critiques sont signalés. Le passage d'un critère à « non applicable » affiche immédiatement l'effet sur la redistribution des poids.

### 19.5 Résultat explicable

Score brut, grade moteur, grade après caps, grade final, niveau de confiance, statut de calibration. Détail par domaine puis par critère avec valeur, bande retenue, score, poids, contribution et explication. Liste des caps appliqués avec leur source et leur effet. Liste des red flags avec leur niveau et leur traitement. Facteurs favorables et défavorables classés par contribution.

Sorties séparées et clairement distinguées pour la décision, la classification réglementaire, IFRS 9 et le capital. Comparaison avec l'exécution précédente et attribution des écarts.

### 19.6 Dérogation et comité

Proposition de dérogation avec motif codifié, commentaire obligatoire, pièces justificatives, et affichage permanent du grade moteur d'origine. Approbation par un acteur distinct, avec refus technique de l'auto-approbation. Génération d'une note de synthèse et d'un dossier de comité.

### 19.7 Accessibilité et multilinguisme

Interface disponible en français, en arabe et en anglais, avec prise en charge de l'écriture de droite à gauche pour l'arabe : mise en miroir de la disposition, alignement des tableaux, sens des icônes directionnelles, et formatage des nombres et des dates selon la locale.

Respect des règles d'accessibilité : contraste suffisant, navigation au clavier, libellés de formulaires associés, messages d'erreur explicites et annoncés aux technologies d'assistance. L'information n'est jamais portée par la seule couleur.

Affiche toujours provenance, fraîcheur, statut de qualité et version des artefacts utilisés.

---

## 20. Déploiement et exploitation

### 20.1 Conditionnement

Images conteneurisées minimales, sans privilège, en système de fichiers en lecture seule lorsque possible ; composition pour une démonstration locale **en une commande** ; graphique de déploiement pour orchestrateur avec valeurs d'exemple sur site et cloud privé ; manifestes réseau, entrée, secrets externes, volumes et politiques de sécurité ; installation hors ligne avec ensemble d'images, sommes de contrôle, inventaire des composants et procédure ; configuration par environnement sans reconstruction ; migrations séparées en tâche contrôlée ; jeu de données de démonstration synthétique totalement distinct de la production ; sondes de vivacité, de disponibilité et de démarrage ; procédures de sauvegarde, restauration, mise à niveau, retour arrière et désinstallation.

Ne force aucun service en ligne. Tout composant requis dispose d'une option auto-hébergée approuvable.

### 20.2 Configuration

Sépare : secrets, configuration technique, politiques métier, modèles validés, règles réglementaires, référentiels, indicateurs de fonctionnalité. Valide chaque catégorie par schéma.

**Refuse le démarrage** si un secret critique manque, si deux règles se chevauchent de façon ambiguë, si un modèle publié est invalide, ou si une migration requise n'est pas appliquée.

### 20.3 Exploitation

Définis des indicateurs et objectifs de niveau de service : disponibilité, latence aux centiles 50, 95 et 99, taux d'erreur, tâches en attente, succès des notifications sortantes, retard de la boîte d'envoi, connexions base, durée de notation, fraîcheur des données. Ajoute journaux structurés, métriques, traces, tableaux de bord, alertes, guides d'intervention et plan de capacité.

---

## 21. Stratégie de tests

### 21.1 Pyramide

Tests unitaires, de composants, de persistance, d'intégration, de contrat, de bout en bout, de performance, de résilience, de sécurité et de reprise. Les tests métier purs ne nécessitent ni base ni réseau — c'est un critère de conception du domaine.

### 21.2 Vecteurs de référence chiffrés

Ces vecteurs sont **exacts et vérifiables**. Ton implémentation doit les reproduire au centième près.

**Vecteur 1 — agrégation d'un domaine (TPE, domaine D1).**
Scores élémentaires D1.1 à D1.8 : `75, 50, 50, 75, 50, 75, 50, 50`.
Poids TPE en points de base : `300, 300, 200, 400, 400, 400, 300, 200` (somme 2 500).
Somme pondérée = 152 500 ; **score D1 = 152 500 / 2 500 = 61,00**.

**Vecteur 2 — agrégation globale (TPE).**
Scores de domaine : D1 = 61, D2 = 60, D3 = 82, D4 = 65, D5 = 70, D6 = 75, D7 = 50.
Poids TPE : 25 %, 10 %, 25 %, 15 %, 15 %, 7 %, 3 %.
**Score brut = 68,75** → grade `G6`.

**Vecteur 3 — cap structurel.**
Score brut 69,10 → grade moteur `G6`. Ratio de couverture du service de la dette inférieur à 1,0 en scénario de base → cap « pas mieux que G9 ».
Attendu : **score brut conservé à 69,10**, grade moteur `G6`, grade final `G9`.

**Vecteur 4 — score de confiance.**
Composantes : complétude 75, fraîcheur 100, fiabilité 75, provenance 100.
Pondérations 35 / 20 / 30 / 15.
**Confiance = 83,75** → niveau moyen → cap « pas mieux que G4 ».

**Vecteur 5 — grande entreprise.**
Scores de domaine : 78, 75, 80, 70, 75, 90, 60. Poids GE : 30 %, 20 %, 10 %, 15 %, 15 %, 5 %, 5 %.
**Score brut = 75,65** → grade `G4`.

**Vecteur 6 — bornes de barème (levier TPE).**
Bandes : ≤ 1,0 → 100 ; ]1,0 ; 2,0] → 75 ; ]2,0 ; 3,5] → 50 ; ]3,5 ; 5,0] → 25 ; > 5,0 → 0.
Teste exactement : 1,0 → 100 ; 1,0001 → 75 ; 2,0 → 75 ; 2,0001 → 50 ; 3,5 → 50 ; 3,5001 → 25 ; 5,0 → 25 ; 5,0001 → 0.

**Vecteur 7 — non applicable contre manquant.**
Deux critères d'un domaine à quatre critères passés en `NOT_APPLICABLE`, les deux autres notés 50.
Attendu : score du domaine = 50, poids applicable réduit à la somme des deux critères restants, **et aucune modification du score global** si le domaine valait déjà 50. Le même essai avec l'état `MISSING` doit produire un avertissement explicite nommant le critère.

### 21.3 Autres tests obligatoires du moteur

Somme des poids et invariants ; monotonie — l'amélioration isolée d'un facteur ne dégrade jamais le score, sauf règle explicite ; test métamorphique — un changement d'unité ou de devise correctement converti laisse le ratio invariant ; traitement des états manquant, invalide, obsolète, estimé et non applicable ; ordre et priorité des caps ; arrondi à l'affichage uniquement ; reproductibilité et sérialisation ; tests par propriétés sur le langage de règles ; rejet des cycles, division par zéro, valeurs non numériques et infinies, expressions inconnues.

### 21.4 Tests réglementaires, IFRS 9 et capital

Chaque ligne approuvée de la matrice de traçabilité possède au minimum : cas déclencheur, cas non déclencheur, valeur exactement au seuil, valeurs immédiatement inférieure et supérieure, conflit de règles, guérison et historique. Ajoute des portefeuilles de référence approuvés par les experts.

Pour IFRS 9 : courbes de survie et probabilités marginales, scénarios, actualisation, engagements hors bilan, remboursements anticipés, stages 1, 2 et 3, augmentation significative du risque, guérison, actifs dépréciés à l'origine, ajustements post-modèle et rapprochement comptable.

### 21.5 Tests de sécurité et d'habilitation

Matrice complète des rôles ; accès horizontal et vertical interdits ; référence directe non autorisée à un objet ; jeton absent, expiré, de mauvais émetteur, d'audience ou de signature incorrecte ; falsification de requête et origines croisées ; injections ; dépôt de fichier malveillant ; requête côté serveur forgée ; rejeu d'une notification sortante et d'une clé d'idempotence ; concurrence sur dérogation, publication et calcul ; absence de secret et de donnée personnelle dans les journaux et les erreurs ; audit obligatoire et non falsifiable.

### 21.6 Qualité et couverture

Couverture de branches élevée sur les moteurs critiques, sans confondre pourcentage et qualité. **Aucune règle réglementaire sans test.** Tests de mutation recommandés sur le score et les règles. CI bloquante pour le formatage, le lint, les types, les tests, la construction, les migrations, la comparaison de contrat d'API, l'analyse statique et des dépendances, la recherche de secrets, l'inventaire des composants et l'analyse d'image.

---

## 22. Phases et portes de validation

### Phase 0 — audit et cadrage
Livrer : audit du socle fourni avec preuves `fichier:ligne`, vérification des 14 anti-patterns, inventaire, diagramme, dette et risques, matrice de réutilisation, modèle de menaces initial, registre d'hypothèses, questions bloquantes et plan.
**Porte 0 :** périmètre, segments, exclusions, autorités, date d'arrêté et architecture de principe approuvés.

### Phase 1 — réglementation, méthodologie et données
Livrer : corpus officiel archivé et empreinté, matrice de traçabilité, segmentation, définition du défaut, méthodologie du champion, dictionnaire de données, lignage, règles de qualité, critères et barèmes initiaux, référentiel sectoriel, plan de calibration et de validation.
**Porte 1 :** Risques, Finance, Conformité et Juridique, Données et Validation indépendante approuvent leurs périmètres. Les règles non confirmées restent désactivées.

### Phase 2 — architecture et contrats
Livrer : décisions d'architecture, architecture modulaire, modèle de menaces, modèle de données, contrat d'API, événements, modèle d'habilitation, stratégie multi-bases, stratégie de déploiement et de reprise, maquettes.
**Porte 2 :** architecture, sécurité, exploitation et contrats d'intégration approuvés.

### Phase 3 — noyaux de calcul
Implémenter d'abord les fonctions pures, le langage de règles, les versions, les instantanés, les moteurs A à E, les vecteurs de référence et les simulateurs. **Ne commence pas par les tableaux de bord.**
**Porte 3 :** portefeuilles de référence concordants, couverture réglementaire mesurée, reproductibilité et audit démontrés par exécution.

### Phase 4 — parcours, interface et intégrations
Implémenter les parcours, imports, API, notifications sortantes, groupes, comités, dérogations, administration et reporting.
**Porte 4 :** recette métier, tests d'intégration, accessibilité et habilitations validés.

### Phase 5 — validation indépendante et sécurité
Livrer le dossier de validation du modèle, les contrôles a posteriori, l'étalonnage, la revue de code, les tests de charge, le test d'intrusion, les exercices de reprise, l'analyse des dépendances et le plan de remédiation.
**Porte 5 :** aucun risque critique ou élevé non formellement accepté ; validation du modèle et de la sécurité signées.

### Phase 6 — pilote et production
Mode fantôme, comparaison avec les décisions existantes, suivi des dérogations, qualité et stabilité, formation, migration, guides d'intervention, support, retour arrière. Déploiement progressif par segment.
**Porte 6 :** mise en service formelle, paramètres signés, modèles et règles publiés, supervision et support actifs.

---

## 23. Livrables

1. `docs/00-audit-depots.md` avec preuves `fichier:ligne` ;
2. `docs/01-perimetre-et-hypotheses.md` ;
3. `docs/02-inventaire-reglementaire.md` ;
4. `regulatory-traceability.xlsx` et `.yaml` ;
5. `docs/03-methodologie-notation.md` ;
6. `docs/04-methodologie-ifrs9.md` ;
7. `docs/05-methodologie-classification.md` ;
8. `docs/06-methodologie-capital.md` ;
9. `docs/07-support-groupe-et-notching.md` ;
10. `docs/08-referentiel-sectoriel.md` ;
11. dictionnaire de données, lignage et règles de qualité ;
12. décisions d'architecture, architecture, modèle de données, diagrammes de séquence, modèle de menaces ;
13. code source complet et structuré ;
14. modèles et régimes en configuration versionnée avec leurs schémas ;
15. laboratoire de développement et de calibration ;
16. contrat OpenAPI, exemples, collection de tests et guide d'intégration ;
17. migrations et tests pour chaque base certifiée ;
18. composition locale, images, graphique de déploiement et ensemble hors ligne ;
19. suites de tests, cas de référence et rapports d'exécution ;
20. inventaire des composants, rapports d'analyse et plan de remédiation ;
21. guides utilisateur, administrateur, exploitation et reprise ;
22. dossier de validation indépendante et de comité modèles ;
23. plan de migration, de pilote, de formation et de conduite du changement ;
24. registre des écarts, décisions, risques acceptés et travaux futurs.

Pour chaque livrable : propriétaire, réviseur, statut, version, date, dépendances, preuves et critères d'acceptation.

---

## 24. Critères d'acceptation non négociables

- un seul moteur canonique par finalité ;
- notation, décision, classification, IFRS 9 et capital séparés ;
- aucune valeur de remplissage ni tâche restante critique ;
- aucun poids ni score final accepté depuis le client ;
- aucun point d'entrée métier sensible sans authentification et autorisation ;
- identité toujours issue du contexte de sécurité ;
- aucun secret de repli ;
- audit critique atomique et non falsifiable par le client ;
- versions publiées immuables et effectives-datées ;
- même instantané et même version produisent le même résultat ;
- gestion explicite des états manquant, non applicable, invalide et obsolète ;
- probabilité de défaut non calibrée explicitement bloquée pour les usages quantitatifs ;
- formule de pertes attendues temporelle, scénarisée et actualisée ;
- règles réglementaires reliées à une source, un article et un test ;
- régimes réglementaires rejouables selon la date validée ;
- contrat d'API complet et tests de contrat ;
- notifications sortantes signées et protégées contre le rejeu ;
- imports sécurisés, traçables et idempotents ;
- CI verte et construction reproductible, avec sorties jointes ;
- déploiement local en une commande ;
- déploiement sur site et hors ligne documenté ;
- matrice multi-bases réellement testée ;
- sauvegarde, restauration et reprise testées ;
- validation indépendante du modèle réalisée ;
- recette métier, test d'intrusion et revue juridique clôturés ;
- aucune déclaration de conformité sans dossier de preuves.

---

## 25. Format de réponse et boucle d'auto-vérification

### 25.1 Structure de chaque réponse de phase

1. **Résultat obtenu** ;
2. **preuves** : fichiers, lignes, commandes exécutées et sorties réelles ;
3. **décisions et raisons** ;
4. **risques et écarts** ;
5. **hypothèses à faire valider** ;
6. **tests exécutés** avec leur résultat ;
7. **prochaine étape et porte de validation**.

### 25.2 Boucle d'auto-vérification obligatoire

Avant de déclarer une tâche terminée, exécute et joins les sorties :

```bash
npm run type-check     # 0 erreur exigée
npm test               # tous les tests passent, nombre affiché
npm run lint           # 0 erreur
npm run build          # construction réussie
# pour chaque dialecte cible :
DATABASE_PROVIDER=<dialecte> node scripts/set-db-provider.mjs && npx prisma validate
```

Puis réponds explicitement à ces questions, par écrit :

1. Ai-je introduit une valeur de remplissage, une constante de convenance ou une règle jamais déclenchée ?
2. Une donnée manquante peut-elle être silencieusement traitée comme un zéro dans mon code ?
3. Une identité ou un poids peut-il provenir du client ?
4. Un secret possède-t-il une valeur par défaut ?
5. Une écriture critique peut-elle réussir sans son audit ?
6. Ai-je affirmé une conformité réglementaire sans preuve documentaire ?
7. Mes résultats sont-ils reproductibles à l'identique ?
8. Un des 14 anti-patterns du §3 est-il présent ?

**Si une seule réponse est défavorable, corrige avant de livrer.**

### 25.3 Comportement général

Ne te limite pas à des recommandations : crée effectivement les fichiers, le code, les migrations, les tests, la documentation et les paquets de déploiement. Après chaque changement, exécute les contrôles pertinents.

Si un texte réglementaire manque, continue sur l'architecture et place une règle **désactivée** avec son statut de validation. N'invente rien.

Commence par la **Phase 0** : audit du socle fourni, vérification des 14 anti-patterns, registre d'hypothèses, corpus à obtenir et proposition d'architecture argumentée. N'implémente aucun calcul réglementaire de production avant la Porte 1.

# PROMPT À COPIER — FIN

---

## Annexe A — Sources primaires à fournir à l'IA

À télécharger en version officielle complète, à archiver avec date et empreinte SHA-256 :

- Bank Al-Maghrib — réglementation comptable des établissements de crédit ;
- Bank Al-Maghrib — réglementation prudentielle ;
- Bank Al-Maghrib — réglementation des relations établissements de crédit / clientèle ;
- Bank Al-Maghrib — rapports annuels sur la supervision bancaire (segmentation, statistiques de risque) ;
- IFRS Foundation — IFRS 9 *Instruments financiers* et IFRS 7 ;
- Banque des règlements internationaux — cadre de Bâle et orientations sur le risque de crédit et les pertes attendues ;
- Commission nationale de contrôle de la protection des données à caractère personnel — loi 09-08 et formalités.

**Ne considère jamais une URL comme une preuve.** Seul le document archivé, daté et empreinté fait foi.

## Annexe B — Registre d'hypothèses à maintenir

| Champ | Description |
|---|---|
| `assumption_id` | identifiant stable |
| `statement` | énoncé de l'hypothèse |
| `rationale` | raison de l'avoir retenue |
| `impact_if_wrong` | conséquence si elle est fausse |
| `owner` | responsable de la confirmation |
| `validation_route` | instance qui tranche |
| `due_date` | échéance |
| `status` | `OPEN`, `CONFIRMED`, `REJECTED`, `SUPERSEDED` |
| `linked_artifacts` | code, règle ou paramètre concerné |

Toute valeur initiale non confirmée par un texte ou une décision de la banque **doit** figurer dans ce registre.
