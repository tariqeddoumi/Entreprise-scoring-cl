# Notation interne des entreprises — TPE / PME / GE, contexte bancaire marocain

Plateforme de **notation interne des contreparties entreprises non financières** au Maroc, conçue pour un usage bancaire : moteur déterministe et explicable, séparation stricte des finalités, piste d'audit complète, interface de programmation bidirectionnelle, compatibilité multi-bases et déploiement neutre vis-à-vis du cloud.

> **Statut.** Modèle expert seed **non calibré** (`pd_status = UNCALIBRATED`). Les pondérations et seuils ne constituent ni des règles de Bank Al-Maghrib, ni des probabilités de défaut calibrées, ni une validation de modèle. Ils doivent être challengés sur l'historique de la banque, calibrés, validés indépendamment et approuvés avant tout usage contraignant.

---

## Démarrage

### En une commande

```bash
docker compose up --build
# http://localhost:3000
```

PostgreSQL est démarré en local, la migration s'exécute comme tâche séparée, puis l'application démarre. Aucune dépendance à un service en ligne.

### En développement

```bash
npm install
cp .env.example .env          # renseigner DATABASE_URL et API_KEYS
npm run db:provider           # génère le schéma pour DATABASE_PROVIDER
npm run db:generate
npm run db:push
npm run dev
```

Le moteur de notation et la simulation fonctionnent **sans base de données** : seules les vues d'historique et la persistance sont alors indisponibles.

---

## Ce que fait l'outil

| Capacité | État |
|---|---|
| Notation interne de contrepartie (moteur A) | Opérationnel, 46 tests |
| Segmentation TPE / PME / GE versionnée | Opérationnel |
| Score de confiance et caps de qualité | Opérationnel |
| Caps structurels et red flags | Opérationnel |
| Dérogations sous double validation | Opérationnel |
| Interface REST v1 + événements sortants signés | Opérationnel |
| Persistance multi-dialecte | Schéma validé sur 4 dialectes |
| Décision de crédit (moteur B) | Spécifié — `docs/02-prompt-maitre-v2.md` §8.2 |
| Classification réglementaire (moteur C) | Spécifié, subordonné à la validation du corpus |
| IFRS 9 (moteur D) | Spécifié §8.4 |
| Capital prudentiel (moteur E) | Spécifié §8.5 |

**Aucune règle réglementaire n'a été codée sans preuve documentaire.** Les moteurs C, D et E sont spécifiés et attendent la validation du corpus applicable.

---

## Principes d'architecture

**Le noyau de risque est pur.** `src/core/` n'importe ni framework web, ni couche d'accès aux données, ni SDK. Le moteur est une fonction de (configuration de modèle, données d'entrée) vers un résultat. Les tests métier s'exécutent sans base ni réseau.

**Un seul moteur canonique par finalité.** La notation possède un unique point d'entrée, dont la version est estampillée dans chaque résultat.

**Les cinq finalités sont séparées.** Notation, décision, classification, IFRS 9 et capital sont distincts. Une garantie peut réduire la perte en cas de défaut ; elle ne rend jamais l'emprunteur intrinsèquement meilleur.

**Rien n'est codé en dur.** Poids, seuils, barèmes, caps, red flags, échelle interne et seuils de segmentation appartiennent à une version de modèle immuable, **validée au chargement** : une somme de poids différente de 100,00 % fait échouer le démarrage.

```
src/core/          moteur pur et déterministe
  types.ts         contrats du domaine
  engine.ts        moteur canonique (ordre de calcul en 12 étapes)
  binning.ts       barèmes et contrôle d'exhaustivité
  segmentation.ts  segmentation versionnée
  confidence.ts    score de confiance et caps de qualité
  grades.ts        échelle interne et application des caps
  validate-model.ts validateur de configuration
src/models/        CORP_STD_V1 (45 critères), CORP_TPE_BEHAV_V1
src/lib/           auth, audit transactionnel, webhooks signés, schémas Zod
src/app/api/v1/    interface REST
prisma/schema.template.prisma  source canonique unique du schéma
tests/             46 tests dont vecteurs d'agrégation exacts
```

---

## Le modèle

45 critères, 7 domaines, pondérations différenciées par segment.

| Domaine | TPE | PME | GE |
|---|---:|---:|---:|
| D1 — Performance financière et structure | 25 % | 30 % | 30 % |
| D2 — Capacité de remboursement et stress | 10 % | 15 % | 20 % |
| D3 — Comportement bancaire et crédit | 25 % | 20 % | 10 % |
| D4 — Activité, secteur et positionnement | 15 % | 15 % | 15 % |
| D5 — Management, gouvernance et groupe | 15 % | 12 % | 15 % |
| D6 — Transparence et conformité | 7 % | 5 % | 5 % |
| D7 — ESG et climat | 3 % | 3 % | 5 % |

Agrégation :

```
Score_domaine = Σ(Score_critère × Poids_critère) / Σ(Poids applicables)
Score_brut    = Σ(Score_domaine × Poids_domaine) / Σ(Poids applicables)
Confiance     = 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance
```

Un second modèle, `CORP_TPE_BEHAV_V1`, traite les TPE dont les comptes sont insuffisants mais dont les flux bancaires sont exploitables. Il porte ses propres poids et sa propre calibration ; les scores des deux modèles ne sont pas comparables sans table de correspondance validée.

### Traitement des situations dégradées

| Situation | Comportement |
|---|---|
| Red flag bloquant | Calcul arrêté avant agrégation, aucun score produit |
| Segment indéterminable | Scoring bloqué, aucun segment par défaut |
| Donnée critique manquante | Scoring bloqué, critère nommé dans le motif |
| Donnée non critique manquante | Critère exclu, avertissement explicite, impact porté par la confiance |
| Critère non applicable | Poids redistribué à l'intérieur du domaine uniquement |
| Confiance insuffisante | Aucun grade final, score brut conservé pour la surveillance |
| Défaut avéré | Grade défaut forcé, indépendamment du score |

**Une donnée absente n'est jamais convertie en zéro ni en score neutre.**

---

## Interface de programmation

Contrat complet : [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1).

```bash
# Simulation sans effet de bord
curl -X POST http://localhost:3000/api/v1/rating-runs/simulate \
  -H "Authorization: Bearer <clé>" \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "CORP_STD_V1",
    "segment": "PME",
    "asOfDate": "2026-08-19",
    "criteria": { "D1.5": { "status": "AVAILABLE", "value": 2.4 } },
    "confidence": { "completeness": 100, "freshness": 100, "reliability": 75, "provenance": 75 }
  }'
```

Quatre principes contractuels :

- **l'identité provient du jeton**, jamais du corps de requête ;
- **le client ne fournit jamais un poids, une formule ni un score final** — le serveur recalcule depuis la version publiée ;
- **idempotence** via l'en-tête `Idempotency-Key` ;
- **erreurs au format RFC 9457**, sans trace d'exécution.

Les événements sortants sont signés en HMAC SHA-256 sur `timestamp . corps brut`, avec identifiant anti-rejeu et horodatage. Le consommateur doit vérifier la signature, rejeter au-delà de 300 secondes et rester idempotent.

### Rôles

`READONLY` < `ANALYST` < `RISK_MANAGER` < `ADMIN`. Configuration via `API_KEYS="<clé>:<rôle>:<nom>;…"`.

**Aucun secret par défaut** : sans configuration, l'API refuse toute requête authentifiée et le démarrage échoue en production.

---

## Compatibilité multi-bases

Le schéma possède une source canonique unique, `prisma/schema.template.prisma`, à partir de laquelle le schéma effectif est généré. La génération est **idempotente et réversible**.

```bash
DATABASE_PROVIDER=mysql npm run db:provider && npm run db:generate
```

| Moteur | Niveau | Preuve |
|---|---|---|
| PostgreSQL 15+ | Cible de référence | Schéma validé, application construite et exécutée |
| MySQL 8 / MariaDB 10.11+ | Schéma validé | `prisma validate` vert |
| SQL Server 2022+ | Schéma validé | `prisma validate` vert |
| Oracle 19c+ | À certifier | Nécessite une instance licenciée |
| SQLite | Développement uniquement | Pas de précision décimale — exclu de la production |

**Un dialecte n'est déclaré certifié qu'après exécution de la suite d'intégration sur une instance réelle.** La validation du schéma est nécessaire, pas suffisante.

Choix de portabilité : identifiants textuels non séquentiels, aucun type énuméré natif, charges JSON en texte, montants et scores en décimal, horodatages en temps universel, date d'arrêté distincte de la date d'enregistrement.

---

## Sécurité et audit

- identité et rôle dérivés du jeton, jamais du payload ;
- clés stockées sous forme d'empreinte, comparaison en temps constant ;
- audit critique inscrit **dans la même transaction** que l'opération — si l'audit échoue, l'opération est annulée ;
- dérogations sous double validation, auto-approbation refusée techniquement, limite de deux crans, amélioration d'un grade défaut interdite ;
- validation stricte des payloads par schéma, rejet des propriétés inconnues ;
- webhooks signés avec protection anti-rejeu.

---

## Tests et preuves

```bash
npm run type-check
npm test
npm run lint
npm run build
```

| Contrôle | Résultat |
|---|---|
| Contrôle de types | 0 erreur |
| Tests | 46 tests, 46 passés |
| Construction | 20 routes compilées |
| Schéma sur 4 dialectes | valide |
| Idempotence du générateur de schéma | annotations intégralement restaurées après cycle complet |

Les tests couvrent : validation des configurations (sommes de poids, exhaustivité des barèmes, détection de trous et d'incohérences d'inclusivité), vecteurs d'agrégation exacts, bornes de barème une à une, monotonie, segmentation dans tous ses cas, caps isolés et combinés, red flags, défaut forcé, distinction entre non applicable et manquant, refus d'un score client sur critère quantitatif, reproductibilité.

---

## Documentation

| Document | Objet |
|---|---|
| [`docs/00-audit-depots.md`](./docs/00-audit-depots.md) | Audit des dépôts d'inspiration, preuves `fichier:ligne`, décisions de réutilisation |
| [`docs/01-note-methodologique.md`](./docs/01-note-methodologique.md) | Note méthodologique — modèle et outil (corps rédigé) |
| `docs/01-note-methodologique-complete.md` | Note complète, grilles incluses (générée) |
| `dist/Note_methodologique_scoring_entreprises_Maroc_V2.docx` | Version Word, page de garde et table des matières |
| [`docs/02-prompt-maitre-v2.md`](./docs/02-prompt-maitre-v2.md) | Prompt maître V2 à remettre à une IA de développement |
| [`openapi.yaml`](./openapi.yaml) | Contrat d'interface OpenAPI 3.1 |

### Cohérence documentation / code

Les grilles détaillées de la note sont **générées depuis la configuration exécutée par le moteur** :

```bash
node scripts/build-methodology-doc.mjs
python3 scripts/md-to-docx.py docs/01-note-methodologique-complete.md \
  dist/Note_methodologique_scoring_entreprises_Maroc_V2.docx \
  "Modèle et outil de notation interne des entreprises" \
  "Contreparties TPE, PME et Grandes Entreprises — contexte bancaire marocain"
```

Toute modification d'un poids ou d'un seuil dans `src/models/` se répercute dans la documentation à la régénération. Le document remis au comité modèles ne peut donc pas décrire des barèmes différents de ceux appliqués en production.

---

## Limites assumées

1. La probabilité de défaut n'est **pas** calibrée ; aucune PD n'est produite ni exposée.
2. Les seuils de segmentation sont des hypothèses à confirmer dans le corpus applicable.
3. Les moteurs de décision, classification, IFRS 9 et capital sont spécifiés, non implémentés.
4. Le référentiel sectoriel n'est pas alimenté ; les critères qui s'y réfèrent utilisent des ancrages qualitatifs.
5. La méthode de support groupe est spécifiée, non implémentée.
6. Oracle n'est pas certifié.
7. L'authentification par clé doit être remplacée par le fournisseur d'identité de la banque.
8. Imports de masse, alerte précoce et multilinguisme arabe restent à construire.

Le registre complet figure en annexe B de la note méthodologique.
