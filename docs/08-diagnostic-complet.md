# Diagnostic complet — modèle, moteur et outil

**Date :** 1er octobre 2026 · **Version examinée :** moteur 3.0.0, modèles `CORP_STD_V1` et `CORP_TPE_BEHAV_V1` 3.0.0
**Périmètre :** conformité de l'implémentation à la note méthodologique, exactitude et robustesse du moteur, fonctionnement de l'outil de bout en bout, performances, sécurité
**Classification :** usage interne

---

## 1. Synthèse

**Le modèle est implémenté tel qu'il est documenté, et le calcul est exact.** Les grilles publiées dans la note méthodologique sont identiques, ligne pour ligne, à la configuration exécutée ; aucune erreur de grade n'apparaît sur 20 000 dossiers aléatoires recalculés en arithmétique exacte. L'outil fonctionne de bout en bout et répond vite.

**Le diagnostic a trouvé sept défauts, tous corrigés et testés.** Deux étaient de nature méthodologique : un défaut avéré pouvait disparaître derrière un refus de notation, et une dérogation ordinaire pouvait faire entrer un dossier en défaut. Aucune des treize notations de production n'est modifiée par les correctifs — vérifié par rejeu et comparaison d'empreintes.

**Une décision revient à la banque.** La note méthodologique affirme qu'une information absente ne peut jamais améliorer un score. C'est faux pour tout critère réellement mauvais : la catégorie « information absente » vaut 25, un critère à 0 gagne donc 25 points à être déclaré manquant (§ 4.1).

---

## 2. Méthode

| Volet | Comment |
|---|---|
| Contrôles statiques | Typage strict, lint, 192 tests unitaires, construction de production |
| Modèle ↔ note méthodologique | Régénération des grilles depuis la configuration et comparaison avec la note publiée ; vérificateur d'alignement (modèle, schéma, API, interface, documentation, calibration) |
| Exactitude du moteur | 20 000 dossiers aléatoires (deux modèles, trois segments), grade recalculé en rationnels exacts et comparé au moteur |
| Robustesse | Scripts ciblés sur les chemins limites : défaut combiné aux refus, données manquantes, segment fourni contre segment calculé, codes inconnus |
| Outil de bout en bout | Instance locale PostgreSQL 16 durcie, application en mode production, quatre rôles. 33 contrôles d'API scriptés pour ce diagnostic ; parcours des écrans dans Chromium |
| Performances | Temps du moteur, temps de réponse API et écrans, requêtes base |
| Sécurité | Matrice des droits, validation des entrées, protection SSRF, cookies, en-têtes, audit des dépendances |

---

## 3. Ce qui est conforme

### 3.1 Modèle

- **Grilles :** la partie III de la note (1 281 lignes) est identique à ce que produit la configuration du moteur — poids, barèmes, ancrages, cas spéciaux, échelles, exceptions. Le vérificateur d'alignement ne relève aucune divergence.
- **Invariants vérifiés au chargement :** somme des poids à 100 % par segment, barèmes exhaustifs sans trou ni chevauchement, échelles couvrant [0 ; 100], plafond de poids par critère, inventaire phénomène-règle.
- **Exactitude :** 0 grade faux sur 20 000 dossiers ; les frontières de grade sont respectées malgré l'arithmétique flottante.
- **Déterminisme :** mêmes entrées, même résultat ; poids total constant quel que soit le nombre de données manquantes.
- **PD synthétique :** jamais exposée hors bac à sable, à l'API comme à l'écran.

### 3.2 Outil

| Fonction | Résultat |
|---|---|
| Authentification et rôles | 401 sans clé ou clé inconnue ; 403 pour chaque rôle insuffisant ; écrans inaccessibles sans session |
| Validation des entrées | JSON malformé, champ inconnu, score hors ancrage : 400 ; corps de plus de 512 Ko : 413 |
| Notation persistée | Idempotence tenue, y compris sous cinq requêtes concurrentes portant la même clé |
| Dérogation | Plafond de deux crans, une seule dérogation en attente, auto-approbation refusée, deux décisions concurrentes : une seule l'emporte |
| Comparaison | Attribution d'écart critère par critère, refus explicite entre instantanés de forme différente |
| Webhooks | Adresses internes, métadonnées cloud, identifiants dans l'URL et HTTP non chiffré refusés |
| Export CSV | Séparateur « ; », BOM UTF-8, neutralisation des formules |
| Base | Six tables, 70 colonnes conformes au schéma ; aucune table lisible par les rôles exposés ; piste d'audit en ajout seul |
| Session | Cookie `httpOnly`, `secure`, `SameSite=Strict` |

### 3.3 Performances

| Mesure | Valeur |
|---|---|
| Moteur | 0,12 ms par notation |
| API — simulation | 10 ms (médiane) |
| API — notation persistée | 32 ms |
| Écrans — temps serveur | 30 à 70 ms |
| Écrans — chargement complet | 95 à 340 ms |
| JavaScript partagé | 103 Ko |

---

## 4. Constats

### 4.1 Décision requise

**Une information absente améliore le score de tout critère réellement mauvais** — *élevé, méthode* (D-32).

La note (§ 6) affirme l'inverse et le dit vérifié par un test ; ce test ne contrôlait que le cas d'un critère à 50 ramené à 25. Sur le dossier de référence, déclarer manquant un critère qui vaudrait 0 améliore le score pour les 43 critères non bloquants, et le grade pour 11 d'entre eux. Sur un dossier entièrement défavorable, six critères peuvent être masqués avant que la porte de couverture (94 % atteints, 60 % exigés) ne se ferme.

| Option | Effet |
|---|---|
| Score « information absente » porté à 0 | Rétablit la garantie annoncée. Aucun grade de production modifié — seul le score brut du dossier Négoce au 31/12/2025, déjà sans grade, passe de 47,75 à 47,00. Impose de refaire la calibration |
| Score maintenu à 25 | Corriger la note méthodologique, et rendre la déclaration d'absence contrôlable (motif, justificatif) |

### 4.2 Défauts corrigés

| Réf. | Gravité | Défaut | Correctif |
|---|---|---|---|
| D-33 | Élevée | Un défaut avéré disparaissait derrière un refus de notation (entreprise de moins de deux ans, donnée critique manquante, segment indéterminé) ; l'événement publié était `rating.blocked` | Le grade de défaut s'impose, sans score inventé |
| D-34 | Élevée | Une dérogation d'un cran pouvait faire entrer un dossier en défaut ; le run portait alors `RATED` et `DEF1` | Refus en 409 ; refus aussi d'une expiration déjà passée. Contrat OpenAPI complété : il ne documentait aucun refus de cette route hormis le 422 |
| D-35 | Moyenne | L'écart entre segment fourni et segment calculé était rédigé puis jeté ; il pèse pourtant 4 points de score sur le dossier de référence | Écart porté dans les incohérences du résultat |
| D-36 | Moyenne | La distribution des grades comptait tous les runs : une contrepartie notée deux fois pesait deux fois | Note courante de chaque contrepartie, contrôlée contre un calcul SQL |
| D-37 | Faible | Un code de critère inconnu était ignoré sans trace | Avertissement explicite |
| D-38 | Optimisation | Tableau de bord et fiche contrepartie chargeaient les instantanés complets (~22 Ko par run, jusqu'à ~1,1 Mo par fiche) | Seuls les champs affichés sont lus |
| D-39 | Sécurité | Next.js visé par deux avis critiques | 15.5.23 → 15.5.27, sharp 0.34 → 0.35 |

Six tests ajoutés au moteur ; cinq échouent sur le code antérieur, le sixième vérifie qu'un dossier sans défaut reste non noté. Les correctifs d'API et d'écrans ont été vérifiés sur l'instance de test.

### 4.3 À traiter

| Priorité | Constat | Proposition |
|---|---|---|
| Haute | **Expiration des dérogations jamais appliquée.** La date est enregistrée, mais rien ne rétablit la note à l'échéance : une dérogation temporaire devient permanente | Résoudre la note effective à la lecture, ou tâche planifiée qui rétablit `cappedGrade` et l'audite |
| Haute | **Les seize routes d'API n'ont aucun test automatisé.** Double validation, idempotence et droits ne sont vérifiés que par les contrôles scriptés de ce diagnostic, qui ne font pas partie du dépôt | Tests d'intégration sur PostgreSQL éphémère, en intégration continue |
| Moyenne | **Le formulaire ne couvre pas toute l'API.** Le segment s'y choisit librement, sans donnée de segmentation, ce qui rend le contrôle du § 11 inopérant depuis l'écran. Le défaut y vaut toujours DEF1 ; support groupe, matérialité ESG et statut conformité n'y sont pas saisissables — les risques climatiques D7.1 et D7.2 sont donc toujours écartés | Ajouter chiffre d'affaires et exposition globale, nature du défaut, support groupe ; alimenter la matérialité par le référentiel sectoriel |
| Moyenne | **Listes plafonnées sans avertissement.** Contreparties : les 200 plus récentes, et la recherche comme l'export CSV ne portent que sur elles. Formulaire : les 500 premières par ordre alphabétique. Sans effet sur le pilote, bloquant au-delà | Recherche et pagination côté serveur |
| Basse | Alertes de dépendances restantes : outil Prisma et PostCSS interne à Next — construction uniquement | Montée de version majeure planifiée |
| Basse | « Base non connectée : configurez DATABASE_URL » s'affiche aussi quand la base est configurée mais injoignable | Distinguer les deux cas |
| Latente | Une exception non compensatoire « sans grade » produirait le statut « données insuffisantes » et une explication erronée. Aucune règle actuelle ne l'utilise | À corriger avant d'introduire une telle règle |

---

## 5. Reproduire

```bash
npm run typecheck && npm run lint && npm test
npx tsx scripts/check-alignment.mts          # modèle ↔ schéma ↔ API ↔ interface ↔ documentation
npx tsx scripts/generate-model-doc.mts       # grilles régénérées, à comparer à la partie III de la note
npm run db:check                             # base déployée ↔ schéma
```
