# Audit des dépôts d'inspiration — preuves et décisions de réutilisation

**Version :** 1.0 · **Date :** 19 août 2026
**Périmètre :** `pf-scoring-v7claude-main` (Project Finance) et `Reco-Analysis-Claude-main` (suivi des recommandations).
**Nature :** analyse statique d'inspiration et de risques. Ce n'est ni un audit de sécurité exhaustif, ni une validation réglementaire.

Chaque constat ci-dessous a été **vérifié dans le code source fourni** et cité sous la forme `chemin/fichier:ligne`.

---

## 1. Synthèse comparative

| Dépôt | À réutiliser comme principe | À ne pas reprendre |
|---|---|---|
| **PF Scoring V7++** | Modèle hiérarchique paramétrable domaine → sous-domaine → critère ; versions de modèle datées ; barèmes et seuils déclaratifs ; builder d'administration ; richesse fonctionnelle (workflow, exports, analytics, benchmarking) | Multiplicité de moteurs concurrents ; scores constants de convenance ; règles toujours fausses ; agrégation générique inachevée ; évaluateur de règles permissif ; routes sensibles acceptant l'identité depuis le corps ; webhook sans signature cryptographique ; secret JWT de repli ; CI référençant un script inexistant |
| **Reco Analysis** | Workflow paramétrable (statuts, transitions, SLA, escalades, preuves, notifications) ; RBAC ; imports avec mapping/prévisualisation ; audit avant/après ; suivi des plans d'action | Audit « fail-open » qui absorbe l'erreur ; génération d'identifiant par `count + 1` ; absence de tests et de CI ; README générique |

Aucun des deux dépôts ne couvre la cible demandée : ils fournissent des **motifs d'architecture**, pas un moteur de notation d'entreprise réutilisable en l'état.

---

## 2. Constats vérifiés — PF Scoring V7++

### 2.1 Huit implémentations de moteur coexistent

```
lib/scoring-engine.ts
lib/scoring-engine-v2.ts
lib/scoring-engine-v7plus.ts
lib/scoring-engine-v8.ts
lib/services/scoring-engine.ts
lib/services/generic-scoring-engine.ts
lib/services/scoring/scoring-engine-v8.ts
```

**Risque.** Divergence silencieuse entre les résultats selon le chemin d'appel ; impossibilité de prouver à un validateur ou à un régulateur quel calcul a produit une décision historique.

**Décision retenue.** Un seul moteur canonique par finalité. Dans notre implémentation : `src/core/engine.ts` est l'unique moteur de notation, il est pur (aucune dépendance base, réseau ou framework) et sa version est estampillée dans chaque résultat (`engineVersion`).

### 2.2 Des scores constants de convenance atteignent la sortie

`lib/scoring-engine-v7plus.ts:227` — `const score = 8.0; // Placeholder`
`lib/scoring-engine-v7plus.ts:252` — `const score = 8.3; // Placeholder`
`lib/scoring-engine-v7plus.ts:277` — `const score = 8.2; // Placeholder`
`lib/scoring-engine-v7plus.ts:376` — `const score = 8.3; // Placeholder`
`lib/scoring-engine-v7plus.ts:441` — `const score = 8.5; // Placeholder`

Neuf occurrences de `Placeholder` au total dans ce seul fichier.

**Risque.** Le score affiché ne reflète pas les données du dossier. Un comité de crédit décide sur un chiffre fabriqué.

**Décision retenue.** Aucun score n'est produit sans une donnée d'entrée explicite. Une donnée absente est traitée par une politique nommée (`BLOCK`, `SCORE_0`, `WARN`) et tracée dans le résultat — jamais remplacée par une constante. Voir `src/core/engine.ts`, fonction `handleUnavailable`.

### 2.3 Vingt-six règles retournent systématiquement `false`

`lib/scoring-rules-v7plus.ts` — 26 occurrences de `return false`.

**Risque.** Une règle de contrôle qui ne se déclenche jamais donne l'illusion d'un dispositif de maîtrise inexistant.

**Décision retenue.** Chaque règle du moteur (caps structurels, red flags) est testée dans les deux sens : cas déclencheur et cas non déclencheur. Voir `tests/engine.test.ts`, sections « Caps structurels » et « Red flags et défaut ».

### 2.4 L'agrégation générique est inachevée

`lib/services/generic-scoring-engine.ts:668-672` :

```ts
private static isRootNode(_result: ScoringNodeResult): boolean {
  // Les racines sont les domaines (depth = 0)
  // À améliorer: passer le depth
  return true; // Pour l'instant
}
```

**Risque.** Tous les nœuds sont considérés comme des racines : l'agrégation pondérée est fausse dès que l'arbre a plus d'un niveau.

**Décision retenue.** L'arborescence est validée au chargement du modèle : somme des poids contrôlée à 10 000 points de base par segment, référence de domaine vérifiée pour chaque critère, barèmes contrôlés exhaustifs. Un modèle invalide fait échouer le démarrage. Voir `src/core/validate-model.ts` et `src/models/index.ts`.

### 2.5 L'évaluateur de règles est permissif par défaut

`lib/services/rule-engine.ts:144` — `return Boolean(evalContext);`
`lib/services/applicability-engine.ts:174` — `return Boolean(evalContext);`

**Risque.** Une expression non reconnue devient vraie, car l'objet de contexte est toujours truthy. Une règle mal orthographiée s'active silencieusement.

**Décision retenue.** Aucune expression n'est interprétée dynamiquement. Les déclencheurs de caps sont un ensemble fermé, et un identifiant inconnu lève une exception explicite (`src/core/engine.ts`, `evaluateCapTrigger`, branche `default`).

### 2.6 Des routes sensibles acceptent l'identité depuis le corps de requête

`app/api/audit/route.ts:36` — `const { action, details, utilisateurId, projectId } = await request.json();`
`app/api/audit/route.ts:42` — `utilisateurId: utilisateurId || "system"`

**Risque.** N'importe quel appelant peut écrire une entrée d'audit au nom d'un autre utilisateur, ou sous l'identité « system ». La piste d'audit devient non opposable.

**Décision retenue.** L'identité provient toujours du jeton (`src/lib/auth.ts`, fonction `authenticate`), jamais du payload. Le champ `requestedBy` d'un run est renseigné par le serveur depuis le contexte de sécurité (`src/lib/rating-service.ts`).

### 2.7 Le webhook ne vérifie aucune signature

`app/api/webhooks/route.ts:8-11` :

```ts
// Verify webhook signature (in production)
const signature = req.headers.get("x-supabase-signature");
if (!signature && process.env.NODE_ENV === "production") {
  return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
```

Seule la **présence** de l'en-tête est contrôlée ; sa valeur n'est jamais vérifiée. Un en-tête `x-supabase-signature: x` suffit.

**Décision retenue.** Signature HMAC SHA-256 calculée sur `timestamp . corps brut`, avec identifiant d'événement (nonce anti-rejeu) et horodatage transmis en en-têtes. Voir `src/lib/webhooks.ts` et le contrat consommateur documenté dans `openapi.yaml`.

### 2.8 Un secret de repli est présent dans le code

`lib/auth.ts:28` — `process.env.JWT_SECRET || "your-secret-key-change-in-production"`

**Risque.** Une variable d'environnement oubliée en production produit une application qui démarre normalement avec un secret public.

**Décision retenue.** Aucun secret par défaut. Sans `API_KEYS`, l'application refuse toute requête authentifiée, et lève une erreur explicite au démarrage en production (`src/lib/auth.ts`, fonction `loadKeys`). Une clé de moins de 16 caractères est refusée.

### 2.9 La CI appelle un script inexistant

`.github/workflows/*.yml:41` — `run: npm run typecheck`, alors que `package.json` expose `type-check`.

**Risque.** Le contrôle de types n'a jamais été exécuté ; la CI verte ne prouve rien.

**Décision retenue.** Les deux alias sont exposés (`type-check` et `typecheck`) et la chaîne complète — génération Prisma, types, lint, tests, build, validation multi-dialecte — est exécutée dans `.github/workflows/ci.yml`. Elle a été lancée localement avant livraison (voir §4).

---

## 3. Constats vérifiés — Reco Analysis

### 3.1 L'audit absorbe silencieusement ses erreurs

`src/lib/audit/index.ts:46-48` :

```ts
} catch (error) {
  console.error("Failed to create audit log:", error);
}
```

**Risque.** Une opération métier est considérée réussie alors que sa trace d'audit n'existe pas. Pour un dispositif de notation bancaire, c'est une rupture de la chaîne de preuve.

**Décision retenue.** Pour toute écriture critique, l'audit est inscrit **dans la même transaction** que l'opération : si l'audit échoue, l'opération est annulée. Voir `src/lib/audit.ts` (`auditWithin`) et son usage dans `src/lib/rating-service.ts` et les routes d'override.

### 3.2 Génération d'identifiant par comptage

`src/services/recommendation.service.ts:135-136` :

```ts
const count = await prisma.recommendation.count();
const code = `REC-${String(count + 1).padStart(5, "0")}`;
```

**Risque.** Deux créations concurrentes produisent le même code ; une suppression provoque une réutilisation de code.

**Décision retenue.** Identifiants `cuid` non séquentiels, contrainte d'unicité en base, et clé d'idempotence unique sur les runs (`prisma/schema.template.prisma`, champ `idempotencyKey @unique`).

### 3.3 Aucun test automatisé

Aucun fichier `*.test.ts` n'existe dans le dépôt, aucun répertoire de tests, aucun workflow CI.

**Décision retenue.** 46 tests couvrent le moteur, dont des vecteurs d'agrégation exacts, les bornes de chaque barème, la monotonicité, la distinction `MISSING`/`NOT_APPLICABLE`, les caps, les red flags et la reproductibilité.

### 3.4 Ce qui mérite d'être repris

Le modèle de workflow paramétrable (`prisma/schema.prisma:245`, `model WorkflowStep`) et le parcours d'import « upload → mapping → prévisualisation → validation → commit » sont des motifs solides. Ils sont retenus comme cible pour les phases suivantes (voir `docs/03-feuille-de-route.md`), sans reprise de code.

---

## 4. Dépendance structurelle commune : PostgreSQL/Supabase

Les schémas Prisma des deux dépôts déclarent uniquement `provider = "postgresql"`, et les clients Supabase sont importés directement dans la couche applicative.

**Décision retenue.** Le schéma est généré depuis une source canonique unique (`prisma/schema.template.prisma`) vers quatre dialectes, sans annotation propriétaire irréversible : aucun enum natif, aucune dépendance à JSONB, montants et scores en `Decimal`. La génération est idempotente et validée pour PostgreSQL, MySQL, SQL Server et SQLite (`scripts/set-db-provider.mjs`, job `multi-db` de la CI).

Aucune dépendance à Vercel ou Supabase n'est introduite : le déploiement local se fait en une commande avec PostgreSQL auto-hébergé (`docker compose up --build`).

---

## 5. Décision d'architecture

**Monolithe modulaire, API-first, neutre vis-à-vis du cloud** plutôt qu'un ensemble prématuré de microservices.

Le noyau de risque (`src/core/`) est pur et déterministe : il n'importe ni Next.js, ni Prisma, ni aucun SDK. Cinq finalités restent **physiquement et conceptuellement séparées** :

1. notation interne de la contrepartie et estimation de PD — **implémenté (moteur A)** ;
2. politique et décision de crédit — moteur B, phase suivante ;
3. classification et provisionnement BAM — moteur C, subordonné à la validation du corpus réglementaire ;
4. staging et ECL IFRS 9 — moteur D ;
5. calcul prudentiel des RWA et reconnaissance des techniques de réduction du risque — moteur E.

Une garantie peut influer sur la LGD, les RWA, les conditions et la décision, mais **n'améliore jamais la PD intrinsèque** de l'emprunteur. Une classe réglementaire n'est jamais dérivée d'une multiplication par le score économique.

---

## 6. Traçabilité des vérifications

| Contrôle | Commande | Résultat |
|---|---|---|
| Types | `npm run type-check` | 0 erreur |
| Tests moteur | `npm test` | 46 tests, 46 passés |
| Build applicatif | `npm run build` | 20 routes compilées |
| Schéma PostgreSQL | `DATABASE_PROVIDER=postgresql npx prisma validate` | valide |
| Schéma MySQL | `DATABASE_PROVIDER=mysql npx prisma validate` | valide |
| Schéma SQL Server | `DATABASE_PROVIDER=sqlserver npx prisma validate` | valide |
| Schéma SQLite | `DATABASE_PROVIDER=sqlite npx prisma validate` | valide |
| Idempotence du générateur | cycle sqlite → mysql → sqlserver → postgresql | annotations `@db.Text` et `@db.Decimal(9,4)` intégralement restaurées |
