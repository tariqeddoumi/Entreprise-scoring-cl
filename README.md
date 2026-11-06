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

### Sur Supabase

```bash
npm install
cp .env.example .env          # renseigner DATABASE_URL, DIRECT_URL, API_KEYS
npm run db:provider
npm run db:generate
npm run db:check              # connexion, isolation du schéma, garde-fous
npm run users:create -- --username <identifiant> --name "<Prénom Nom>" --role ADMIN
npm run dev
```

La dernière commande crée le premier administrateur et affiche son mot de passe
provisoire, à changer à la première connexion. Les comptes suivants se créent
depuis l'écran **Utilisateurs**.

Les tables vivent dans le schéma dédié **`corp_scoring`**, jamais dans
`public`. Deux chaînes sont nécessaires : `DATABASE_URL` via le pooler
(port 6543, `pgbouncer=true`) pour l'application, `DIRECT_URL` en connexion
directe (port 5432) pour les migrations. Détails et procédure de migration
vers un PostgreSQL autonome : [`docs/03-deploiement-supabase.md`](./docs/03-deploiement-supabase.md).

### En développement local

```bash
npm install
cp .env.example .env
npm run db:provider           # génère le schéma pour DATABASE_PROVIDER
npm run db:generate
npm run db:push
psql "$DIRECT_URL" -f prisma/sql/01-postgresql-hardening.sql
npm run dev
```

Le moteur de notation et la simulation fonctionnent **sans base de données** : seules les vues d'historique et la persistance sont alors indisponibles.

---

## Ce que fait l'outil

| Capacité | État |
|---|---|
| Notation interne de contrepartie (moteur A, version 3.1.0) | Opérationnel |
| Quatre grilles publiées : standard, TPE comportementale, deux challengers | Opérationnel |
| Échelle de notation 1 à 10 commune (1 = meilleur risque, défaut hors échelle), paramétrable par versions datées | Opérationnel |
| Paramétrage des grilles à l'écran (poids, barèmes, repères, critères, exceptions, revues, couverture, confiance) par versions datées | Opérationnel |
| Écran Clients : création, modification, suppression ou désactivation, notation depuis la fiche | Opérationnel |
| Segmentation TPE / PME / GE versionnée | Opérationnel |
| Bilan CGNC (modèles normal et simplifié) : saisie, gabarit Excel, lecture IA ; ratios calculés, contrôles, correction motivée | Opérationnel |
| Format du bilan paramétrable par versions datées (complet, agrégé, notation seulement ; postes propres, indicateurs et alertes par formule, seuils d'appréciation) | Opérationnel |
| Analyse du bilan au chargement : ratios de la grille puis autres indicateurs, évolution sur trois exercices, appréciation, alertes (dont critères chiffrés 1/W/2025, à titre d'information) | Opérationnel |
| Ouverture du dossier : motif paramétrable, reprise de la dernière note validée, passage à l'exercice suivant (N → N−1), référentiel des bilans du client, repères « repris / à saisir / anomalie » | Opérationnel |
| Score de confiance, porte de couverture et caps de qualité | Opérationnel |
| Caps structurels, revues obligatoires et red flags | Opérationnel |
| Support groupe (au plus 2 crans, 4 conditions documentées) | Opérationnel |
| Workflow dossier : saisie, soumission, circuit de validation paramétrable (directeur du centre d'affaires puis contre-étude par défaut), dérogations sous double validation | Opérationnel |
| Couverture des critères BAM 1/W/2025 et 19/G/2002 vérifiée critère par critère (docs/14) | Diagnostic livré |
| Profils métier et droits paramétrables ; circuit avis / décision unique de la contre-étude, niveaux selon montant, note, type de crédit et catégorie du centre | Opérationnel |
| Critères de classement BAM dans le dossier (plafond 8 sensible, 10 pré-douteux, défaut douteux / compromis), levée par décision de comité tracée | Opérationnel |
| Watch list par décision de comité : niveaux WL1 à WL3 (note plafonnée à 8, 9, 10), changement de niveau, sortie, historique | Opérationnel |
| Proposition de paramétrage pour le COPIL de validation (docs/19) | Livrée, à arrêter en COPIL |
| Multi-banques et filiales, multi-devise, cloisonnement par entité | Opérationnel |
| Assistance IA à la saisie (propositions sourcées, jamais appliquées sans accord) | Opérationnel |
| Renotation par lot (groupe d'affaires, segment, secteur, entité), ponctuelle ou planifiée | Opérationnel |
| Interface REST v1 + événements sortants signés | Opérationnel |
| Persistance multi-dialecte | Schéma validé sur 4 dialectes |
| Décision de crédit (moteur B) | Spécifié — `docs/02-prompt-maitre-v2.md` §8.2 |
| Calibration statistique de la PD | Méthode et script prêts (`scripts/modelisation/`), en attente d'historique |
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
src/models/        CORP_STD_V1 (45 critères), CORP_TPE_BEHAV_V1 (24), challengers (16 et 12)
src/financials/    bilan CGNC : postes, ratios, gabarit Excel
src/lib/
  auth.ts          vérification des clés, temps constant
  session.ts       session web (cookie HttpOnly), garde de page
  accounts.ts      comptes nominatifs : connexion, verrouillage, sessions, administration
  password.ts      empreinte scrypt, politique de mot de passe
  route-guard.ts   garde unique : auth + débit + taille de corps
  rate-limit.ts    limitation de débit par identité
  url-safety.ts    contrôle anti-SSRF des URL sortantes
  env.ts           configuration validée, échec au démarrage
  audit.ts         audit transactionnel
  webhooks.ts      signature HMAC, vérification de référence
src/middleware.ts  en-têtes de sécurité, politique d'origine croisée
src/app/api/v1/    interface REST
prisma/schema.template.prisma  source canonique unique du schéma
prisma/sql/        durcissement PostgreSQL rejouable
tests/             343 tests : moteur, échelle, bilan, workflow, renotation, sécurité
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

Le score brut donne la **classe 1 à 10** de l'échelle maîtresse commune (version ECH10-2026.1 : 1 ≥ 90, 2 ≥ 85, 3 ≥ 80, 4 ≥ 75, 5 ≥ 70, 6 ≥ 64, 7 ≥ 57, 8 ≥ 48, 9 ≥ 40, 10 < 40) ; le défaut constaté reste noté à part (DEF1 à DEF3). L'échelle se paramètre par versions datées (Administration › Échelle de notation) et chaque notation consigne sa version. Les paramètres des grilles se gèrent de même (Administration › Paramétrage des grilles, D-54) : poids par segment, seuils des barèmes, repères, ajout et retrait de critères, exceptions, revues, couverture, confiance et support groupe.

Agrégation :

```
Score_domaine = Σ(Score_critère × Poids_critère) / Σ(Poids applicables)
Score_brut    = Σ(Score_domaine × Poids_domaine) / Σ(Poids applicables)
Confiance     = 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance
```

Les ratios financiers de la grille (D1.4, D1.5, D1.6, D1.8, D2.1 à D2.3) sont **calculés depuis le bilan** saisi ou importé (CGNC, deux exercices) ; l'analyste ne peut que les corriger, avec un motif tracé.

Un second modèle, `CORP_TPE_BEHAV_V1`, traite les TPE dont les comptes sont insuffisants mais dont les flux bancaires sont exploitables. Il porte ses propres poids et sa propre calibration ; les scores des deux modèles ne sont pas comparables sans table de correspondance validée.

### Traitement des situations dégradées

| Situation | Comportement |
|---|---|
| Red flag bloquant | Calcul arrêté avant agrégation, aucun score produit |
| Segment indéterminable | Scoring bloqué, aucun segment par défaut |
| Donnée critique manquante | Scoring bloqué, critère nommé dans le motif |
| Donnée non critique manquante | Borne basse : score 0 sur le critère ; le score haut possible (donnée à 100) est affiché à côté |
| Couverture observée insuffisante (globale ou par domaine) | Aucun grade : dossier à compléter |
| Critère non applicable (règle publiée) | Poids transféré au critère receveur désigné par la grille |
| Critère non matériel (justifié) | Critère écarté, poids transféré |
| Confiance insuffisante (classe U) | Aucun grade final, score brut conservé pour la surveillance |
| Défaut avéré | Grade défaut forcé, indépendamment du score |

**Une donnée absente ne vaut jamais mieux qu'une mauvaise valeur** : elle prend la borne basse, sans quoi ne pas fournir un document deviendrait avantageux. La qualité du dossier reste mesurée à part (couverture, confiance).

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

### Renotation par lot

Écran **Renotation** (gestionnaire des risques) ou `POST /api/v1/renotation-batches`. Un lot :

- **sélectionne** les contreparties actives du périmètre d'écriture, par banque ou filiale, **groupe d'affaires**, segment, préfixe de secteur ou ancienneté de la dernière validation ;
- **renote** chacune à partir de la saisie de sa dernière notation validée, à la date d'arrêté du lot et avec la version courante du modèle, après application d'un **fichier de mise à jour** facultatif (CSV : `ice` puis des clés de champ, par exemple `criteria.D3.1.value`) contrôlé contre la grille ;
- produit une **notation de surveillance** (origine `BATCH`) qui ne fait jamais foi seule : une migration d'au moins N crans, une absence de note ou un défaut **ouvre un dossier de revue** pré-rempli, instruit et validé selon le workflow normal ;
- restitue une **matrice de migration**, le détail par contrepartie et un export CSV. Une contrepartie sans notation validée réutilisable (nouvelle relation, notation antérieure au workflow) est écartée avec son motif.

Le traitement est **reprenable** : par tranches depuis l'écran, par la tâche planifiée `GET /api/v1/renotation/cron` (Vercel Cron, quotidienne, secret `CRON_SECRET`) ou par `npm run renotation:run` depuis la crontab d'un serveur de la banque. Une contrepartie n'est jamais notée deux fois. Les **planifications** (mensuelle, trimestrielle, semestrielle, annuelle, au jour choisi) créent un lot à chaque échéance, arrêté à la fin du mois précédent, dans le périmètre de la personne qui les a créées.

Migration d'une base existante : `prisma/sql/05-renotation-groupes.sql`.

### Rôles et accès

`READONLY` < `ANALYST` < `RISK_MANAGER` < `ADMIN`. Deux voies d'accès, chacune réservée à son usage :

| Accès | Qui | Comment |
|---|---|---|
| Interface web | Personnes | Compte nominatif : identifiant et mot de passe, créés par un administrateur depuis l'écran **Utilisateurs** (ou `npm run users:create` pour le premier) |
| API REST | Systèmes | Clé porteuse, `Authorization: Bearer <clé>`, configurée via `API_KEYS="<clé>:<rôle>:<nom>:<code entité ou *>;…"` — sans code d'entité, la clé n'ouvre aucun accès ; `*` donne la portée groupe, réservée aux systèmes centraux approuvés |

Une clé API n'ouvre pas de session dans l'interface, et une session de l'interface n'ouvre pas l'API.

**Aucun secret par défaut** : sans configuration, l'API refuse toute requête authentifiée et le démarrage échoue en production ; aucun compte n'existe tant qu'un administrateur ne l'a pas créé.

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

**Authentification et habilitations**

- identité et rôle dérivés du jeton, jamais du payload ni d'un champ de formulaire ;
- clés stockées sous forme d'empreinte, comparaison en temps constant, parcours sans sortie anticipée ;
- longueur minimale de 24 caractères, aucun secret par défaut ;
- interface web : comptes nominatifs, mot de passe haché par scrypt et jamais stocké, longueur minimale de 12 caractères, mot de passe provisoire à changer à la première connexion ;
- cinq échecs consécutifs verrouillent le compte quinze minutes ; le message d'échec ne dit jamais si l'identifiant existe ; au-delà de 20 tentatives par minute depuis une adresse ou de 10 sur un identifiant, la tentative est refusée avant tout calcul ;
- session par jeton aléatoire de 256 bits (cookie HttpOnly, Secure, SameSite=Strict), dont la base ne garde que l'empreinte ; révoquée côté serveur à la déconnexion, au changement de mot de passe, à la réinitialisation et à la désactivation du compte ;
- toute page porteuse de données exige une session valide ; connexions, échecs, verrouillages et opérations sur les comptes sont audités ;
- garde unique appliqué aux 12 routes de l'API — aucune ne peut oublier un contrôle.

**Intégrité des données**

- audit critique inscrit **dans la même transaction** que l'opération : si l'audit échoue, l'opération est annulée ;
- piste d'audit en ajout seul, garantie par un déclencheur PostgreSQL : ni mise à jour ni suppression possible depuis l'application ;
- dérogations sous double validation, auto-approbation refusée techniquement, décision protégée contre la concurrence par relecture conditionnelle ;
- idempotence robuste aux requêtes concurrentes (rejeu sur violation d'unicité, jamais d'erreur).

**Surface réseau**

- en-têtes de sécurité et politique de sécurité du contenu stricte ;
- origines croisées en liste blanche, aucune autorisée par défaut ;
- limitation de débit par identité, plafond de taille des corps de requête ;
- URL de webhook contrôlées contre les requêtes forgées côté serveur — adresses privées, bouclage, métadonnées cloud et identifiants dans l'URL refusés, redirections non suivies ;
- webhooks signés en HMAC SHA-256 avec protection anti-rejeu ;
- validation stricte des payloads, rejet des propriétés inconnues, nombre de critères borné ;
- aucun détail technique ni trace d'exécution exposé à l'utilisateur.

**Isolation en base**

- schéma dédié non exposé par PostgREST : la clé anon ne peut atteindre aucune donnée ;
- droits retirés aux rôles publics, y compris pour les tables futures ;
- sécurité au niveau des lignes activée sans politique, en défense en profondeur.

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
| Tests | 343 tests, 343 passés |
| Lint | 0 erreur |
| Alignement back-end / API / écrans | `scripts/check-alignment.mts` : aucune divergence |
| Schéma sur 4 dialectes | valide |
| Idempotence du générateur de schéma | annotations intégralement restaurées après cycle complet |

Les tests couvrent :

- **moteur** — validation des configurations (sommes de poids, exhaustivité des barèmes, détection de trous et d'incohérences d'inclusivité), vecteurs d'agrégation exacts, bornes de barème une à une, monotonie, segmentation dans tous ses cas, caps isolés et combinés, red flags, défaut forcé, distinction entre non applicable et manquant, refus d'un score client sur critère quantitatif, reproductibilité ;
- **sécurité** — 13 formes d'adresses internes refusées sur les webhooks, limitation de débit et isolation entre identités, signature HMAC avec corps altéré, secret différent et rejeu hors fenêtre, validation des entrées (propriété inconnue, score hors ancrage, critères non bornés, injection dans un code de red flag), configuration invalide.

---

## Documentation

| Document | Objet |
|---|---|
| [`docs/00-audit-depots.md`](./docs/00-audit-depots.md) | Audit des dépôts d'inspiration, preuves `fichier:ligne`, décisions de réutilisation |
| [`docs/01-note-methodologique.md`](./docs/01-note-methodologique.md) | Note méthodologique — modèle et outil (corps rédigé) |
| `docs/01-note-methodologique-complete.md` | Note complète, grilles incluses (générée) |
| `dist/Note_methodologique_notation_entreprises.docx` | Version Word au design Groupe BCP |
| [`docs/02-prompt-maitre-v2.md`](./docs/02-prompt-maitre-v2.md) | Prompt maître V2 à remettre à une IA de développement |
| [`docs/03-deploiement-supabase.md`](./docs/03-deploiement-supabase.md) | Raccordement Supabase, durcissement, migrations, migration vers PostgreSQL autonome |
| `docs/04` à `docs/12` | Diagnostics, rapports de calibration synthétique, journal des décisions, workflow multi-entités, diagnostic d'alignement de novembre 2026 |
| [`docs/13-modelisation-statistique.md`](./docs/13-modelisation-statistique.md) | Méthode de modélisation statistique de la PD ; Word : `docs/modelisation/Guide_modelisation_statistique.docx` |
| `docs/argumentaires/` | Argumentaires : engagements, direction générale, conseil d'administration, réseau |
| `docs/guides/` | Guide utilisateur (Word et PowerPoint), expression de besoin DSI |
| `docs/presentations/` | Présentation de l'outil au top management (captures, données fictives) ; de l'ancien modèle (cahier des charges 2007) au nouveau modèle ; synthèse management |
| `docs/simulateur/Simulateur_notation_entreprises.xlsx` | Simulateur Excel des quatre grilles, onglet Bilan, listes déroulantes |
| `scripts/modelisation/` | Script Python de modélisation statistique (démonstration sur données synthétiques) |
| [`openapi.yaml`](./openapi.yaml) | Contrat d'interface OpenAPI 3.1 |

### Cohérence documentation / code

Les grilles détaillées de la note sont **générées depuis la configuration exécutée par le moteur** :

```bash
node scripts/build-methodology-doc.mjs
node scripts/md-to-docx.mjs docs/01-note-methodologique-complete.md \
  dist/Note_methodologique_notation_entreprises.docx "Note méthodologique" \
  "Modèle et outil de notation interne des entreprises — TPE, PME et grandes entreprises" \
  "Version 3.1 — moteur 3.1.0 — novembre 2026" "Version 3.1" "Note méthodologique — notation des entreprises"

# Simulateur Excel : export du moteur, génération, contrôle des cas exemples
npx tsx scripts/diagnostics/export-simulateur.mts /tmp/sim
python3 scripts/simulateur/build_xlsx.py /tmp/sim/simulateur.json docs/simulateur/Simulateur_notation_entreprises.xlsx
python3 scripts/simulateur/check_xlsx.py docs/simulateur/Simulateur_notation_entreprises.xlsx /tmp/sim-check
```

Le simulateur Excel est généré de la même façon depuis le moteur ; `check_xlsx.py` le recalcule et vérifie qu'il retrouve le grade et le score du moteur sur chaque cas exemple.

Toute modification d'un poids ou d'un seuil dans `src/models/` se répercute dans la documentation à la régénération. Le document remis au comité modèles ne peut donc pas décrire des barèmes différents de ceux appliqués en production.

---

## Limites assumées

1. La probabilité de défaut n'est **pas** calibrée ; aucune PD n'est produite ni exposée. La méthode et le script de calibration statistique sont prêts (`docs/13-modelisation-statistique.md`) et attendent un historique de défauts suffisant.
2. Les seuils de segmentation sont des hypothèses à confirmer dans le corpus applicable.
3. Les moteurs de décision, classification, IFRS 9 et capital sont spécifiés, non implémentés.
4. Le référentiel sectoriel n'est pas alimenté ; les critères qui s'y réfèrent utilisent des ancrages qualitatifs.
5. Oracle n'est pas certifié.
6. Les comptes de l'interface sont gérés dans l'outil, et l'API s'authentifie par clé : les deux doivent être raccordés au fournisseur d'identité de la banque (OIDC/SAML, double authentification).
7. Alerte précoce et multilinguisme arabe restent à construire ; l'import de masse se limite au fichier de mise à jour de la renotation par lot et au gabarit Excel du bilan.

Le registre complet figure en annexe B de la note méthodologique.
