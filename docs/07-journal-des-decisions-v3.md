# Journal des décisions — remédiation V3

## Réponse au diagnostic indépendant du 16 septembre 2026

**Version :** 1.0 · **Date :** 17 septembre 2026
**Objet :** tracer, constat par constat, ce qui a été traité, ce qui ne l'a pas été et pourquoi, puis documenter chaque arbitrage pris en l'absence d'instruction explicite
**Classification :** usage interne

---

> **Pourquoi ce document.** La remédiation a été conduite en autonomie. Une quarantaine d'arbitrages ont dû être pris — sur la granularité des échelles, les seuils de couverture, le sort de chaque plafond, le traitement des jeunes entreprises. Aucun n'est neutre. Ce journal les expose avec les options écartées et la raison du choix, afin que le comité modèles puisse les confirmer, les corriger ou les renverser sur pièces plutôt que de les découvrir dans le code.
>
> Chaque décision porte une mention **À CONFIRMER** lorsqu'elle engage une politique de la banque, et **TECHNIQUE** lorsqu'elle relève de la seule mise en œuvre.

---

# 1. Registre de traitement des vingt-six constats

## 1.1 Constats critiques

| Réf. | Constat | Traitement | Ce qui a été fait |
|---|---|---|---|
| C01 | Claims non étayés par des artefacts exécutables | **Partiel** | Le code, les configurations, le contrat OpenAPI, les tests et le vérificateur d'alignement sont dans le dépôt et exécutables. La revue **indépendante** de niveau E3 ne peut pas être conduite par l'auteur du code : elle reste à mandater |
| C02 | PD synthétique exposée par l'API et l'interface | **Traité** | `pd12m` nul hors bac à sable ; finalité `PILOT_SHADOW` ; le démarrage échoue si la dérogation est posée en production ; le statut de calibration reste visible pour expliquer l'absence ; tests contractuels |
| C03 | Échelle G1–G10 partagée par deux modèles non comparables | **Traité** | Échelles propres : `STD-P-2026.1` (8 grades) et `TPE-B-2026.1` (6 grades), `comparableWith` vide, comparaison refusée par le code, recalibration sur les nouvelles échelles |
| C04 | Seuils de segmentation sans source ni date d'effet | **Traité** | Référentiel effectif-daté et versionné, statut de source explicite, six axes distingués, routage déterministe, segment fourni confronté au calcul |
| C05 | Moteurs décision, BAM, IFRS 9, capital absents | **Partiel** | Les cinq statuts sont séparés et exposés ; quatre restent `NOT_EVALUATED`. Les moteurs eux-mêmes supposent le corpus réglementaire, non disponible |
| C06 | Finalités mélangées ; blocage conformité empêchant toute note | **Traité** | Cinq statuts distincts ; « décision indicative » retirée de l'échelle ; un blocage de conformité n'empêche plus de noter une exposition existante |
| C07 | MISSING et NOT_APPLICABLE redistribuant les poids | **Traité** | Redistribution supprimée ; catégorie « information absente » à score prudent déclaré ; transferts de non-applicabilité nommés ; porte de couverture ; poids total constant vérifié par test |
| C08 | Double et triple comptage | **Traité** | Inventaire phénomène-règle contrôlé au chargement ; dix plafonds ramenés à quatre exceptions sur le modèle standard, zéro sur le comportemental |

## 1.2 Constats élevés

| Réf. | Constat | Traitement | Ce qui a été fait |
|---|---|---|---|
| H01 | Philosophie de notation non formalisée | **Traité** | Déclarée par modèle : type, horizon, fenêtres d'observation, traitement du cycle, règle de migration, événements post-arrêté ; contrôlée au chargement |
| H02 | Caps de confiance créant des points de masse | **Traité** | Plafond supprimé ; classe A/B/C/U restituée à côté du grade ; `affectsGrade` toujours faux ; la distribution simulée ne présente plus de point de masse |
| H03 | Dix grades arbitraires, DEF1/2/3 non définis | **Traité** | Granularité ramenée à 8 et 6 grades ; politique de défaut, guérison et rechute définie ; plus aucun grade indistinguable à la calibration |
| H04 | Référentiel sectoriel non alimenté | **Partiel** | Structure, contrôles de crédibilité et repli national construits ; **livré vide** : le peuplement suppose des données externes |
| H05 | Support groupe non implémenté | **Traité** | Méthode standalone + relèvement plafonné à deux crans, conditionné aux quatre preuves, conditions manquantes nommées |
| H06 | CGNC, comptes courants d'associés, financements spécifiques non normés | **Traité** | Dictionnaire de sept grandeurs, rattaché aux critères et affiché à la saisie |
| H07 | Fenêtre TPE de 12 mois, flux mono-banque | **Traité** | Fenêtre portée à 24 mois cible 36 ; règles de nettoyage ; taux de capture séparé du risque |
| H08 | Matrice secteur × région × chocs non opérationnelle | **Partiel** | Bibliothèque de cinq familles de scénarios marocains déclarée ; sévérités à calibrer |
| H09 | Poids ESG additif générique | **Traité** | Porte de matérialité sur risque physique et transition, alimentée par le secteur et le site ; transfert de poids déclaré |
| H10 | Sécurité : OIDC, mTLS, ABAC, coffre, pentest, CNDP | **Non traité** | Relève de l'infrastructure et d'un programme de sécurité, pas de la conception du modèle |
| H11 | Multi-bases non certifié sur instances réelles | **Non traité** | Aucune instance MySQL, SQL Server ou Oracle disponible dans l'environnement de travail |
| H12 | Tests insuffisants | **Traité** | Suite portée à 165 tests, couvrant explicitement chaque constat corrigé |
| H13 | Imports de masse, connecteurs, alerte précoce absents | **Non traité** | Supposent les systèmes sources et leurs conventions d'échange |
| H14 | Séquence contradictoire : caps avant le grade moteur | **Traité** | Pipeline canonique en treize étapes, exceptions appliquées après le grade moteur, tests de précédence |

## 1.3 Constats moyens

| Réf. | Constat | Traitement | Ce qui a été fait |
|---|---|---|---|
| M01 | Versioning, idempotence, droits d'usage non démontrés | **Traité** | Idempotence liée au hash du contenu avec conflit explicite ; droits d'usage portés par chaque résultat et chaque événement |
| M02 | RTO/RPO, restauration, observabilité non prouvés | **Non traité** | Relève de l'exploitation |
| M03 | Accord inter-analystes non mesuré | **Partiel** | La structure du résultat permet la double notation ; la mesure suppose un pilote et des dossiers étalons |
| M04 | Arabe/RTL, parcours de masse, charge de saisie | **Partiel** | La charge de saisie est allégée — définitions CGNC affichées, politique d'information absente visible. L'internationalisation reste un chantier entier |

---

# 2. Décisions d'architecture du modèle

## D-01 — Supprimer le plafond de confiance plutôt que l'adoucir — **À CONFIRMER**

*Options :* (a) conserver le plafond en l'adoucissant ; (b) le rendre progressif ; (c) le supprimer et séparer la classe de confiance.

*Décision :* (c).

*Motif :* le diagnostic montrait que le plafond déplaçait 55 à 65 % des dossiers et rendait le score moyen non monotone dans l'échelle. Adoucir un mécanisme qui mélange deux grandeurs — la qualité de la mesure et le niveau du risque — n'en corrige pas la nature. La séparation rend chacune interprétable et calibrable.

*Conséquence :* les grades des dossiers peu documentés se déplacent vers le haut par rapport à la version 2, ce qui **paraîtra moins prudent**. La prudence est reportée sur la porte de couverture, qui refuse de noter plutôt que de noter mal. Le comité doit assumer ce déplacement.

## D-02 — Score prudent de 25 pour l'information absente — **À CONFIRMER**

*Options :* (a) score 0 ; (b) score 25 ; (c) médiane du segment ; (d) blocage généralisé.

*Décision :* (b), uniformément, sur tous les critères non critiques.

*Motif :* un score nul traiterait une information absente comme le pire cas constaté, ce qui est faux et pénaliserait massivement les TPE ; une médiane reviendrait à imputer une valeur plausible, donc à effacer la lacune ; un blocage généralisé rendrait la plupart des dossiers TPE non notables. La valeur 25 est prudente sans être punitive.

*Ce qui la renverserait :* la calibration sur défauts observés doit traiter « information absente » comme une **catégorie à part entière** et estimer son taux de défaut propre. La valeur 25 est un seed, pas un résultat.

## D-03 — Granularité à 8 et 6 grades — **À CONFIRMER**

*Options :* (a) conserver dix grades ; (b) réduire ; (c) attendre la calibration réelle.

*Décision :* (b), huit grades pour le modèle standard, six pour le comportemental.

*Motif :* le diagnostic relevait des bandes arbitraires et la calibration synthétique fusionnait deux grades du modèle comportemental. Un modèle qui observe des flux bancaires a une capacité de séparation structurellement plus faible qu'un modèle qui lit des états financiers : lui donner autant de grades affiche une précision que l'information ne porte pas. Après réduction, aucune fusion n'apparaît et la progression des probabilités est strictement monotone sur les deux modèles.

*Statut :* les échelles portent `status: PROVISIONAL`. La granularité définitive est un résultat de calibration sur défauts observés.

## D-04 — Grades de défaut communs aux deux modèles — **À CONFIRMER**

*Options :* (a) grades de défaut propres à chaque modèle, par cohérence avec C03 ; (b) grades communs.

*Décision :* (b).

*Motif :* le constat C03 porte sur des **estimations** non comparables. Un défaut n'est pas une estimation : c'est un état constaté selon une définition unique. Deux modèles peuvent diverger sur l'appréciation d'un risque ; ils ne peuvent pas diverger sur le constat d'un impayé de plus de quatre-vingt-dix jours. Des grades de défaut propres à chaque modèle auraient suggéré le contraire.

## D-05 — Seuils de couverture 60/30 et 70/40 — **À CONFIRMER**

*Décision :* modèle standard, 60 % du poids total observé et 30 % par domaine ; modèle comportemental, 70 % et 40 %.

*Motif :* l'exigence est plus forte sur le modèle comportemental parce que sa base d'information est plus étroite : si les flux ne sont pas fiables, il ne reste rien à mesurer. Les valeurs elles-mêmes sont des seeds — elles doivent être recalées sur la distribution réelle de complétude du portefeuille, sous peine de rendre non notable une part inacceptable de la population TPE.

*Risque assumé :* un seuil trop élevé produit un taux de non-notation élevé au pilote. C'est un résultat **mesurable** dès la porte P3, et le bon moment pour le corriger.

## D-06 — Quatre exceptions conservées, six retirées — **À CONFIRMER**

*Décision :* conserver NC01 (couverture de dette < 1 en base), NC02 (continuité d'exploitation), NC03 (excédent brut négatif deux ans sur trois), NC04 (dossier groupe incomplet). Retirer les plafonds sur fonds propres négatifs, stress seul, concentration client, forbearance, comptes trop anciens, jeune entreprise.

*Motif :* les six retirés avaient tous une contribution centrale suffisante dans un critère, doublée d'un signal de routage. Les quatre conservés portent un effet que les critères ne capturent pas : une incapacité de paiement en scénario de base, un jugement prospectif d'auditeur, la **persistance** d'un déficit d'exploitation, et une lacune portant sur un périmètre de consolidation entier plutôt que sur une variable isolée.

*Ce qui la renverserait :* des tests d'ablation sur données observées. Chaque exception doit démontrer son effet incrémental, faute de quoi elle doit disparaître à son tour.

## D-07 — Route jeune entreprise plutôt que plafond — **À CONFIRMER**

*Décision :* une contrepartie de moins de deux ans sans support groupe robuste sort des grilles publiées, avec un statut `NO_RATING_ROUTED_OTHER_MODEL` et un motif explicite.

*Motif :* le diagnostic relevait qu'un plafond tenait lieu de modèle de millésime. Les entreprises de moins de deux ans représentent 98,5 % des créations au Maroc : les plafonner revenait à refuser de les analyser tout en prétendant les noter.

*Conséquence :* la banque doit décider — construire une grille jeune entreprise, ou assumer un traitement à dire d'expert tracé. Le routage rend cette décision visible au lieu de la masquer.

## D-08 — Le blocage de conformité ne suspend plus la notation — **À CONFIRMER**

*Décision :* un red flag de conformité alimente `complianceStatus`, jamais `ratingStatus`. La notation est produite dans tous les cas, avec une restriction d'usage explicite.

*Motif :* refuser de noter une exposition déjà au bilan revient à refuser de la surveiller et de la provisionner. Un contrôle de sanctions interdit une relation ou une opération, pas la connaissance du risque.

*Garde-fou :* les droits d'usage du résultat portent la mention « statut conformité bloqué : aucune entrée en relation ni opération nouvelle ».

## D-09 — Aucun score publié sur donnée critique absente — **TECHNIQUE**

*Décision :* distinguer deux situations. Donnée **critique** absente : aucun score, aucun grade. Couverture insuffisante : score brut calculé et conservé pour la surveillance, aucun grade.

*Motif :* le score d'un dossier amputé d'une variable bloquante ne mesure rien et pourrait être repris hors contexte. Un dossier simplement peu couvert produit un score interprétable comme signal de surveillance.

## D-10 — Transferts de poids ESG à l'intérieur du domaine — **TECHNIQUE**

*Décision :* le risque physique transfère son poids à la conformité environnementale, le risque de transition à la gouvernance d'adaptation.

*Motif :* garder le transfert dans le domaine évite de concentrer le poids sur un critère d'un autre domaine, ce qui aurait dépassé le plafond de 6 % par variable sur le segment Grande Entreprise. Conformité et gouvernance restent évaluées pour tous, contrairement à l'exposition : c'est ce qui rend le transfert économiquement défendable.

## D-11 — Une estimation ne compte pas dans la couverture — **À CONFIRMER**

*Décision :* un critère au statut `ESTIMATED` est scoré normalement mais exclu de la couverture observée.

*Motif :* la table 4 du diagnostic interdit d'assimiler une estimation à une observation certifiée. Compter une estimation dans la couverture rendrait la porte contournable par la seule requalification d'un statut.

## D-12 — Idempotence liée au contenu — **TECHNIQUE**

*Décision :* la clé d'idempotence est confrontée à l'empreinte du payload ; une même clé sur un contenu différent produit un conflit 409.

*Motif :* sans ce contrôle, un appelant qui réutilise sa clé par erreur reçoit silencieusement le résultat d'un autre dossier — et l'attribue au sien.

## D-13 — Ordre des grades lu sur l'échelle du modèle — **TECHNIQUE**

*Décision :* supprimer la liste « G1…G10 » figée dans le module de calibration.

*Motif :* cette liste est devenue fausse le jour où chaque modèle a reçu son échelle, et elle produisait un effectif nul **sans rien signaler**. Le même défaut avait déjà été relevé sur d'autres correspondances dupliquées : toute table dérivée d'une configuration doit être lue, jamais recopiée.

## D-14 — Référentiel sectoriel livré vide — **À CONFIRMER**

*Décision :* construire la structure, les contrôles de crédibilité et le repli national, mais ne pas inventer de valeurs.

*Motif :* peupler le référentiel avec des grades sectoriels plausibles aurait produit exactement ce que le diagnostic reproche : une apparence de référentiel sans source ni effectif. Un référentiel vide rend l'absence visible — le grade sectoriel devient une donnée indisponible et déclenche la catégorie prudente.

## D-15 — Ne pas ré-estimer les pondérations — **À CONFIRMER**

*Décision :* conserver les pondérations expertes de la version 2, sans optimisation.

*Motif :* l'annexe A.3 du diagnostic est explicite : ne pas optimiser les poids avant d'avoir stabilisé les définitions et la donnée. Optimiser sur le portefeuille simulé produirait les poids du **simulateur**, pas ceux du risque — un raisonnement circulaire. Les poids restent un seed documenté.

## D-16 — Version de modèle portée à 3.0.0 — **TECHNIQUE**

*Décision :* incrémenter la version majeure des deux modèles et celle du moteur.

*Motif :* les résultats de la version 3 ne sont pas comparables à ceux de la version 2 — échelles différentes, politique de données différente, ordre de calcul corrigé. Une version mineure aurait laissé croire à une continuité.

*Conséquence :* les notations historiques produites en version 2 restent lisibles avec leur propre version de modèle, conformément au principe de rejeu. Elles ne doivent pas être comparées aux nouvelles sans étude de correspondance.

---

# 2 bis. Décisions issues de la revue automatisée de la V3

Une revue automatisée de la pull request de refonte a relevé cinq constats. Les cinq ont été reproduits dans le code avant d'être traités ; aucun n'a été écarté.

## D-17 — Les instantanés d'un moteur antérieur sont reconnus, jamais convertis — **MÉTHODE**

*Constat :* les composants de la V3 déréférencent `coverage`, `confidence`, `usageRights` et `appliedRules`. Un instantané produit par le moteur v1 ne porte aucun de ces champs : la consultation d'une notation d'archive et l'attribution d'écart échouaient, et le jeu de démonstration livré contenait treize instantanés v1.

*Décision :* la forme d'un instantané est reconnue **structurellement** avant tout usage (`src/lib/snapshot-compat.ts`). Un instantané ancien est affiché comme archive, avec les champs qu'il contient réellement ; la comparaison le refuse en 422 en indiquant pourquoi.

*Motif du refus de convertir :* une conversion devrait fabriquer un taux de couverture et une classe de confiance qui n'existaient pas au moment de la notation. Donner à une archive l'apparence d'une notation courante est précisément ce qu'un contrôle a posteriori ne doit pas pouvoir confondre. La reconnaissance ne s'appuie pas sur le numéro de version : une version peut être mal renseignée, une structure non.

## D-18 — Une dérogation se mesure depuis la note produite, support groupe compris — **MÉTHODE**

*Constat :* la colonne `cappedGrade` recevait la note **autonome**. Sur un dossier relevé de deux crans par support groupe, un déplacement d'un cran depuis la note réellement attribuée était compté pour trois et refusé ; le `fromGrade` enregistré désignait une note que personne n'avait attribuée. L'affichage faisait en outre passer un simple relèvement de groupe pour une dérogation approuvée.

*Décision :* `cappedGrade` porte la note produite par le moteur, exceptions non compensatoires **et** support groupe compris. Elle est immuable ; `finalGrade` reste la seule colonne qu'une décision de dérogation réécrit.

*Ce qui n'a pas été retenu :* prendre `finalGrade` comme référence, comme le suggérait la revue. Cette colonne porte déjà le résultat d'une dérogation approuvée : elle aurait permis d'enchaîner les dérogations et de dépasser la limite de deux crans par accumulation.

## D-19 — Le formulaire dérive ses exceptions du modèle chargé — **TECHNIQUE**

*Constat :* l'assistant de notation proposait encore, sous le titre « Caps structurels », cinq plafonds retirés par l'inventaire C08. Les cocher ne changeait ni le grade ni le résultat, et rien ne le signalait : un analyste pouvait croire avoir posé un garde-fou structurel.

*Décision :* la liste des exceptions est dérivée de `model.nonCompensatoryRules` et ne peut donc plus proposer ce que le moteur n'évalue pas. Les constats retirés restent saisissables — ils alimentent les red flags, la porte de couverture et la calibration — mais dans une section distincte qui énonce, pour chacun, par quel mécanisme il est réellement pris en compte.

*Garde-fou :* le vérificateur d'alignement contrôle désormais le mécanisme de dérivation, et non plus la présence de chaque nom : une liste recopiée satisfaisait l'ancien contrôle jusqu'au jour où elle divergeait.

## D-20 — Une écriture métier et son audit sont indissociables — **TECHNIQUE**

*Constat :* la création d'une contrepartie écrivait la ligne puis l'audit hors transaction. Un échec de l'audit laissait la contrepartie enregistrée mais l'appelant en erreur ; une reprise butait alors sur un conflit d'ICE portant sur sa propre écriture.

*Décision :* les deux voies de création — action serveur de l'interface et `POST /api/v1/counterparties` — passent par une transaction unique. La règle était déjà énoncée dans le module d'audit ; elle n'était pas appliquée.

## D-21 — L'export CSV neutralise les formules de tableur — **TECHNIQUE**

*Constat :* le nom et l'ICE d'une contrepartie sont saisis par un utilisateur. Un champ commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est exécuté à l'ouverture dans Excel ou LibreOffice ; l'échappement par guillemets n'y change rien.

*Décision :* neutralisation par apostrophe en tête, distincte de l'échappement de séparateur. La sérialisation est isolée dans un module pur afin d'être testable sans rendu.

---

# 2 ter. Vérification d'alignement base / back-end / front-end

Contrôle demandé après la mise en service : la base réellement déployée dit-elle la même chose que le code qui l'écrit et que les écrans qui la lisent ?

**Ce qui était conforme.** Les six tables et leurs soixante-dix colonnes correspondent exactement au schéma Prisma — types, nullabilité, `Decimal(9,4)`, deux contraintes d'unicité, huit index, trois clés étrangères. Le durcissement PostgreSQL est appliqué : aucune table lisible par les rôles exposés, piste d'audit protégée en ajout seul par déclencheur. Aucune requête SQL brute dans l'application : l'alignement colonne par colonne y est donc tenu par le compilateur.

**Ce qui ne l'était pas.** Trois divergences, toutes héritées du passage en V3.

## D-22 — Le schéma documentait un vocabulaire de statut abandonné — **TECHNIQUE**

*Constat :* le commentaire de `rating_runs.outcome` annonçait `SCORED | BLOCKED_* | DEFAULT_GRADE | NO_GRADE_CONFIDENCE`, alors que le moteur y écrit `RATED`, `DEFAULTED` et `NO_RATING_*` depuis la V3. Le schéma est ce que lit quiconque écrit une requête SQL, un état de gestion ou un tableau de bord hors application : un filtre écrit d'après lui ne ramenait rien.

*Décision :* commentaire corrigé, et les deux vocabulaires y sont désormais nommés — les lignes d'archive portent l'ancien. Le vérificateur d'alignement confronte le schéma Prisma au type `RatingStatus` du moteur ; la dérive ne peut plus passer.

## D-23 — Le tableau de bord classait les défauts avant les meilleures notes — **TECHNIQUE**

*Constat :* le tableau de bord portait sa propre copie du calcul de rang, écrite pour l'échelle `G1…G10` : elle lisait le nombre après la première lettre. Sur `STD-P5` elle ne lisait rien et repliait sur une valeur unique, si bien que **tous** les grades performants devenaient ex æquo — et que les grades de défaut, eux correctement numérotés, se classaient **devant** eux. Sur un tableau de risque lu du meilleur au pire, les défauts apparaissaient en tête.

*Décision :* le rang vient de l'échelle publiée du modèle (`gradeRank(scale, grade)`), seule autorité sur l'ordre. Un grade inconnu de l'échelle courante n'est plus classé par défaut : il est écarté et signalé. Quatre tests fixent l'invariant — rangs strictement ordonnés, sans ex æquo, tout grade de défaut après le dernier grade performant, et refus explicite d'un grade étranger à l'échelle.

## D-24 — Une distribution unique additionnait deux échelles non comparables — **MÉTHODE**

*Constat :* la distribution des grades regroupait sur le seul `finalGrade`, tous modèles confondus. Un `STD-P3` et un `TPE-B3` tombaient donc dans la même ligne, alors que le moteur refuse explicitement de les comparer (constat C03) et que la recalibration a montré qu'ils ne portent pas le même risque.

*Décision :* une distribution par modèle, chacune sous l'identifiant de son échelle. Les grades d'archive sont comptés à part, avec la raison : les ranger dans l'échelle courante leur donnerait un sens qu'ils n'ont pas.

## D-25 — Deux vocabulaires de statut s'affichaient bruts dans la même colonne — **TECHNIQUE**

*Décision :* libellés français partagés, et l'origine ancienne signalée plutôt que masquée. La correspondance est unique : le panneau de résultat en portait une seconde copie, supprimée.

## D-26 — Le contrôle de base ne vérifiait que la présence des tables — **TECHNIQUE**

*Constat :* `npm run db:check` contrôlait six tables, pas leurs colonnes. Une colonne absente ne se découvrait qu'à la première requête qui la touche, en production. Le script échouait en outre sur SQLite, le dialecte de développement, faute d'`information_schema`.

*Décision :* les colonnes attendues sont dérivées du schéma Prisma — lues, jamais recopiées — et confrontées au catalogue. Le contrôle fonctionne sur PostgreSQL comme sur SQLite. Il dénombre en outre les notations persistées au format d'une version antérieure, sans les traiter comme une anomalie : un instantané est immuable, une base en exploitation en contient forcément.

**Sur l'état des données.** Les treize notations de la base de production ont toutes été produites par le moteur v1 : grades de l'échelle retirée, vocabulaire de statut antérieur, instantanés sans couverture ni droits d'usage. Avant le correctif D-17, la consultation de chacune de ces treize fiches échouait. Elles s'affichent désormais en archive. Elles ne sont comparables à aucune notation courante, et le resteront tant qu'aucune table de correspondance n'aura été validée — ou tant que les contreparties n'auront pas été renotées. **Ce constat décrit l'état au moment du contrôle ; les dix contreparties ont depuis été renotées et la base en porte vingt-six (D-27).**

**Sur la piste d'audit.** Les treize notations et les trois dérogations de la base de production ne portent aucun événement d'audit : le jeu de démonstration est inséré par script SQL, hors application, et n'en produit pas. C'est cohérent pour une démonstration, mais aucune de ces lignes ne satisfait la règle « une écriture métier et son audit sont indissociables » (D-20). Un jeu de démonstration ne doit pas servir de référence pour juger de la complétude de la piste d'audit.

---

# 2 quater. Renotation et portabilité de la base

Deux sujets distincts mais liés par la même question : que devient une base déjà en exploitation lorsque le moteur change, puis lorsque le moteur de base de données change à son tour ?

## D-27 — La renotation ajoute une série, elle n'en réécrit aucune — **MÉTHODE**

*Constat :* la vérification précédente établissait que les treize notations de production portaient toutes des instantanés v1 (§ 2 ter). Le correctif D-17 les rendait consultables en archive, mais aucune n'était comparable à une notation courante, et le tableau de bord n'avait aucune notation V3 à distribuer.

*Décision :* les dix contreparties ont été renotées par le moteur 3.0.0 sur leurs treize arrêtés. Les treize notations V3 **s'ajoutent** aux treize archives v1, sous des clés d'idempotence distinctes (`seed:v3:<CLÉ>:<date>`). Aucune ligne n'a été modifiée ni supprimée. La base de production porte désormais vingt-six notations et treize événements d'audit.

*Pourquoi une addition et non un remplacement :* garder les deux séries sur des entrées strictement identiques est la seule façon de mesurer ce que le passage en V3 change réellement, dossier par dossier. Écraser les archives aurait détruit le point de comparaison au moment précis où il devient utile — le pilote.

*Preuve que c'est un rejeu et non une saisie :* chaque `inputSnapshot` V3 est repris de l'archive correspondante par sous-requête, jamais recopié ; les treize empreintes SHA-256 d'entrée sont identiques deux à deux. Les treize empreintes de `resultSnapshot` ont été calculées par le moteur avant insertion, puis reconfrontées en base : identiques. Une corruption de transcription aurait été détectée.

*Ce que la renotation ne règle pas :* les archives v1 restent non comparables aux notations V3. Le point 9 du chapitre 3 demeure ouvert — la renotation fournit une correspondance observée sur treize dossiers de démonstration, pas une table de correspondance validée.

## D-28 — Le durcissement n'est pas porté par le schéma et ne suit pas la bascule — **TECHNIQUE**

*Constat :* `npm run db:provider` régénère le schéma pour le dialecte cible, mais Prisma ne gère ni les droits, ni la sécurité au niveau des lignes, ni les déclencheurs. Les quatre propriétés de sécurité de la base — isolation dans `corp_scoring`, retrait des droits aux rôles exposés, sécurité au niveau des lignes activée sans politique, piste d'audit en ajout seul par déclencheur — vivent dans `prisma/sql/01-postgresql-hardening.sql`, hors du périmètre de la génération.

*Décision :* la bascule vers un autre moteur suppose de **retranscrire ce script dans les termes du dialecte cible**, et non de le porter mécaniquement. Les équivalents ne sont pas interchangeables : MySQL ne connaît pas la sécurité au niveau des lignes et impose de la remplacer par une séparation de comptes et de vues ; SQL Server la connaît sous une autre forme et une autre syntaxe ; la notion de rôle exposé publiquement est propre à Supabase et disparaît sur une instance autonome.

*Conséquence à tenir :* un schéma généré et poussé sur un nouveau moteur donne une application qui fonctionne et une base **non durcie**. Rien dans la chaîne ne le signale aujourd'hui, `npm run db:check` contrôlant ces propriétés sur PostgreSQL. Tant que l'équivalent n'est pas écrit et vérifié pour le dialecte cible, la bascule ne doit pas être considérée comme faite.

## D-29 — `directUrl` répond à un pooler, pas à un besoin du modèle — **TECHNIQUE**

*Constat :* le générateur ajoute `directUrl` au seul dialecte PostgreSQL. Ce n'est pas un oubli pour les autres : le paramètre existe parce qu'un pooler en mode transaction (pgBouncer de Supabase, PgBouncer, RDS Proxy) ne supporte pas les migrations, qui doivent emprunter une connexion directe.

*Décision :* le paramètre reste conditionnel au dialecte. Sur un autre moteur, la question ne disparaît pas pour autant : elle se repose dans les termes de son propre intermédiaire de connexion, s'il y en a un. Documenté ici parce que l'absence du paramètre hors PostgreSQL se lit facilement comme une lacune du générateur, alors qu'elle est délibérée.

## D-30 — Oracle figure dans la matrice mais n'est pas une cible générable — **TECHNIQUE**

*Constat :* la matrice de portabilité du README annonce cinq moteurs, dont Oracle 19c+ au niveau « à certifier ». Le générateur n'en accepte que quatre : `DATABASE_PROVIDER=oracle` est refusé avec un code d'erreur. L'écart n'est pas un défaut du script — Prisma 6 ne propose pas de connecteur Oracle — mais la matrice laisse croire qu'une instance licenciée suffirait.

*Décision :* le niveau annoncé pour Oracle se lit « suppose un changement de couche d'accès aux données », et non « suppose une instance ». C'est un arbitrage d'architecture, pas une case à cocher dans une variable d'environnement. Les quatre dialectes réellement générables restent PostgreSQL, MySQL, SQL Server et SQLite, ce dernier exclu de la production faute de précision décimale.

## D-31 — Les clés du jeu de démonstration divergent entre le dépôt et la production — **TECHNIQUE**

*Constat :* `prisma/sql/02-seed-demonstration.sql` produit treize notations V3 sous les clés `seed:<CLÉ>:<date>`. En production, ces mêmes clés portent les **archives v1**, la série V3 vivant sous `seed:v3:<CLÉ>:<date>` (D-27). Une base reconstruite depuis le dépôt donnerait donc treize lignes et aucune archive, non les vingt-six lignes actuelles.

*Décision :* l'écart est assumé et documenté plutôt que corrigé. Le jeu de démonstration a vocation à livrer un état propre et reproductible, pas à rejouer l'historique d'une instance particulière ; et le seed ne s'exécute jamais en production, garde explicite du projet.

*Ce qu'il faut en faire à la bascule :* la question n'est pas de faire converger les clés, mais de décider ce qui est repris. Reprendre les vingt-six lignes conserve le point de comparaison de D-27 et impose de transporter des instantanés d'un moteur retiré ; ne reprendre que la série V3 donne une base homogène et referme définitivement la comparaison. Ce choix appartient à la banque et figure au chapitre 3.

---

# 3. Ce qui reste à décider par la banque

1. **Seuils de segmentation** — non opposables tant que le corpus Bank Al-Maghrib n'a pas été lu et validé conjointement. Première porte du programme.
2. **Politique de défaut, guérison et rechute** — les durées probatoires proposées (trois mois, douze mois) sont des seeds.
3. **Seuils de couverture** — à recaler sur la distribution réelle de complétude, dès les premiers dossiers du pilote.
4. **Traitement des jeunes entreprises** — grille dédiée ou traitement expert tracé.
5. **Score de la catégorie « information absente »** — à estimer comme une catégorie de risque à part entière lors de la calibration.
6. **Granularité définitive des échelles** — résultat de la calibration, pas choix de présentation.
7. **Maintien ou suppression des quatre exceptions conservées** — sur tests d'ablation.
8. **Correspondance entre les deux échelles** — condition de toute master scale commune.
9. **Sort des notations d'archive** — les instantanés antérieurs restent consultables mais ne sont comparables à rien. Les dix contreparties ont été renotées (D-27) : les deux séries coexistent désormais sur des entrées identiques. Leur rapprochement suppose toujours une table de correspondance validée — treize dossiers de démonstration ne l'établissent pas.
10. **Ce qui est repris lors d'une bascule de moteur de base** — les vingt-six notations, ou la seule série V3 (D-31). Conserver les deux préserve le point de comparaison du pilote et impose de transporter des instantanés d'un moteur retiré.
11. **Dialecte cible et niveau de certification exigé** — un schéma validé n'est pas un dialecte certifié, et le durcissement de la base doit être réécrit dans ses termes avant toute mise en service (D-28).

---

**Note finale.** Aucune des décisions ci-dessus n'a été prise pour rendre le modèle plus favorable, plus rapide à implémenter ou plus simple à présenter. Plusieurs le rendent visiblement plus sévère — des dossiers qui recevaient un grade n'en reçoivent plus. C'est le résultat attendu : le diagnostic ne reprochait pas au modèle d'être trop prudent, il lui reprochait de produire des notes là où il n'avait pas de quoi mesurer.
