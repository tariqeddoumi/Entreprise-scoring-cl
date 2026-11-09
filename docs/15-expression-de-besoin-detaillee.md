# Expression de besoin détaillée — Outil de notation des entreprises

**Objet :** spécifier, écran par écran et règle par règle, l'outil de notation interne des entreprises (TPE, PME, grandes entreprises), pour permettre sa prise en charge par une équipe de développement.
**Destinataires :** DSI, équipe de développement, maîtrise d'ouvrage (Risques, Engagements, contre-étude), Conformité, sécurité des systèmes d'information.
**Version :** 3.0 — novembre 2026. Remplace la version 2.0.
**Référence fonctionnelle :** prototype opérationnel (moteur 3.3.0), guide méthodologique complet, note méthodologique, journal des décisions (D-01 à D-68), couverture des critères Bank Al-Maghrib, proposition de paramétrage COPIL.
**Nouveautés de la version 3.0 :** fiche client T24 et saisie minimale ; engagements ligne par ligne ; rapport de solvabilité (API ou lecture) ; fiche juridique InfoRisque ; portefeuille par chargé d'affaires ; ouverture du dossier par motif et actualisation T24 ; pièces requises par motif ; critères de classement BAM, plafonds et levée par comité ; watch list ; circuit avis / décision à niveaux ; module de surveillance du portefeuille ; mise en service des API ; reprise du stock ; journal d'audit consultable.

> Les captures d'écran proviennent du prototype, sur des clients et des montants fictifs. Elles constituent la maquette de référence : l'ergonomie peut être adaptée à la charte et aux composants de la DSI, mais chaque information, chaque contrôle et chaque règle décrits ici doivent être conservés. La lecture automatique des documents est désignée dans ce document par « OCR intelligent » ; les maquettes affichent encore l'ancien libellé « IA », à remplacer dans l'interface (exigence EF-OCR-09).

## 1. Cadre du projet

### 1.1 Objectifs

1. Produire, pour chaque entreprise cliente, une note de risque de 1 (meilleur risque) à 10, sur une échelle commune à toutes les grilles, le défaut étant noté à part (DEF1 à DEF3).
2. Fonder la note sur des données vérifiables : bilan et compte de produits et charges au format CGNC, ratios calculés par l'outil, comportement du compte, appréciation guidée par des repères écrits.
3. Garantir la gouvernance : une note ne devient officielle qu'au terme du circuit de validation (par défaut : directeur du centre d'affaires, puis contre-étude), décidé par des personnes distinctes des contributeurs du dossier.
4. Tout tracer : saisies, pièces, lectures par l'OCR intelligent, calculs, décisions, versions du modèle, de l'échelle et des paramètres ; toute notation se rejoue à l'identique.
5. Couvrir les banques et filiales du groupe, en plusieurs devises, avec un cloisonnement strict par entité.
6. Permettre le pilotage du portefeuille : tableau de bord, module de surveillance (indicateurs de risque, migrations, concentration, alertes), renotation par lot ponctuelle ou périodique, revue des dégradations.
7. Appliquer la circulaire 1/W/2025 dans la note : les critères de classement plafonnent la note ou imposent le défaut, ne se lèvent que par une décision de comité tracée ; la watch list, décidée en comité, plafonne la note.
8. S'alimenter aux systèmes de la banque (T24, crédit bureau, InfoRisque), tout en fonctionnant entièrement en saisie tant que ces raccordements ne sont pas recettés.

### 1.2 Périmètre

| Dans le périmètre | Hors périmètre (lots ultérieurs ou autres systèmes) |
|---|---|
| Référentiel des clients entreprises, groupes d'affaires | Notation des particuliers et des professionnels personnes physiques |
| Dossier de notation, pièces requises par motif, lecture des états financiers par OCR intelligent, gabarit Excel | Classification réglementaire officielle des créances et provisionnement (alimentés par les critères restitués avec la note) |
| Grilles de notation (standard et TPE comportementale), échelle 1 à 10, moteur de calcul | Calcul des fonds propres réglementaires, IFRS 9 |
| Circuit de validation paramétrable, dérogations | Décision d'octroi du crédit et tarification |
| Renotation par lot, tableau de bord, exports | Financements de projets (outil Project Finance) et portefeuille titres |
| Administration : comptes, entités, devises, paramétrage, grilles, échelle, circuit, raccordements, reprise du stock, journal d'audit | |
| Fiche client T24, engagements, rapport de solvabilité, fiche juridique InfoRisque | |
| Critères de classement BAM dans la note, levée par comité, watch list, surveillance du portefeuille | |
| API REST et webhooks pour les systèmes de la banque | |

### 1.3 Conventions

- **EF-xxx-nn** : exigence fonctionnelle. **RG-nn** : règle de gestion du moteur. **ENF-nn** : exigence non fonctionnelle. **CA** : critère d'acceptation, vérifié en recette.
- « Doit » : obligatoire. « Peut » : facultatif ou paramétrable.
- Montants : devise du client à la saisie, convertis en MAD (devise de base du groupe) pour les seuils et les comparaisons.
- Dates : AAAA-MM-JJ ; horodatages en UTC, affichés à l'heure locale de l'entité.

## 2. Acteurs, rôles et fonctions

### 2.1 Rôles (droits)

Le rôle fixe ce qu'un utilisateur peut faire ; il est attribué par un administrateur. Les rôles sont cumulatifs dans l'ordre suivant.

| Rôle | Peut |
|---|---|
| Lecture seule | Consulter les clients, dossiers, notations, modèles et le tableau de bord de son périmètre |
| Analyste | En plus : créer et modifier les clients ; ouvrir, instruire et soumettre un dossier ; utiliser l'OCR intelligent ; décider d'une étape du circuit si sa fonction l'y habilite |
| Gestionnaire des risques | En plus : demander une dérogation et décider de celles des autres ; supprimer ou désactiver un client ; lancer et planifier une renotation par lot |
| Administrateur | En plus : gérer les comptes de son périmètre. Administrateur du groupe (sans entité de rattachement) : entités, devises, paramétrage, grilles, échelle, circuit, pour tout le groupe |

### 2.2 Profils et fonctions

La fonction est un attribut métier du compte, distinct du rôle ; elle désigne le profil de l'utilisateur et qui décide de chaque étape du circuit. Référentiel par défaut, modifiable (EF-ADM-05) :

| Profil | Fonctions par défaut | Ce qu'il fait |
|---|---|---|
| P1 — Saisie | CHARGE_AFFAIRES (chargé d'affaires), ANALYSTE (analyste crédit) | Crée les clients, tient leur fiche (T24, engagements, solvabilité, juridique), ouvre et instruit les dossiers, déclare les critères BAM, soumet |
| P2 — Validation commerciale | DIRECTEUR_CA (directeur du centre d'affaires) | Avis favorable ou défavorable ; non bloquant, ou bloquant selon la catégorie de délégation du centre |
| P3 — Contre-étude | CONTRE_ETUDE, RESPONSABLE_CE, DIRECTEUR_RISQUES ; COMITE_CREDIT (décision enregistrée) | Instruit ; un seul niveau décide selon le montant, la note et le type de crédit ; enregistre la levée d'un critère décidée en comité ; dérogations, renotation |
| P4 — Surveillance des risques | SURVEILLANCE | Module de surveillance ; décisions de watch list ; levée de critère ; ne saisit ni ne valide une note |
| P5 — Consultation, audit | — (rôle Lecture seule) | Lecture |
| P6 — Administration | — (rôle Administrateur) | Paramétrage, comptes, raccordements, reprise du stock, journal d'audit |

### 2.3 Entités et périmètre

- L'organisation est un arbre : groupe, banques, filiales, éventuellement sous-filiales. Chaque compte est rattaché à une entité (sauf l'administrateur du groupe).
- **Lecture** : un utilisateur voit les données de son entité et de sa descendance. **Écriture** : portée « son entité » ou « toute sa branche », fixée par compte.
- Une donnée hors périmètre est introuvable (réponse 404), jamais « interdite » : l'outil ne révèle pas son existence.
- **Hiérarchie du réseau** : chargé d'affaires → son portefeuille ; directeur du centre → son centre ; région → ses centres ; banque → toutes ses régions ; siège → tout.
- **EF-PTF-01 — Portefeuille par chargé d'affaires.** Paramètre « Portée des chargés d'affaires » : centre entier (défaut) ou portefeuille. En mode portefeuille, un compte de fonction chargé d'affaires ne voit et ne modifie que les clients dont il est gestionnaire (code gestionnaire T24 du compte, EF-ADM-02) ou dont il a ouvert un dossier. Le contrôle des doublons T24 porte sur toute la base, sans révéler le nom d'un client hors portefeuille.

## 3. Parcours général

| Étape | Qui | Écran | Résultat |
|---|---|---|---|
| 1. Client | Chargé d'affaires | Clients | Client créé depuis son code T24, ou en saisie minimale ; engagements, rapport de solvabilité et fiche juridique à jour |
| 2. Dossier | Chargé d'affaires | Fiche client › Noter ce client | Dossier en brouillon : motif, type de crédit, modèle, date d'arrêté, exercice ; fiche et engagements T24 actualisés |
| 3. Préparation | Chargé d'affaires | Dossier › Préparation, Pièces, Bilan | Pièces requises par le motif fournies ; bilan N et N−1 lu ou importé, contrôlé |
| 4. Grille et critères BAM | Chargé d'affaires | Dossier › Grille, Critères de classement | Critères renseignés, ratios calculés, critères BAM cochés ou déclarés |
| 5. Aperçu | Chargé d'affaires | Dossier › Aperçu | Note calculée (plafonds compris), non enregistrée |
| 6. Soumission | Chargé d'affaires | Dossier | Notation calculée par le serveur et figée ; circuit figé selon le montant, la note, le type de crédit et la catégorie du centre |
| 7. Avis | Directeur du centre d'affaires | Dossier › Circuit | Avis favorable ou défavorable (bloquant ou non selon la catégorie du centre) |
| 8. Décision | Contre-étude au niveau requis | Dossier › Circuit | Note officielle, ou rejet motivé ; levée éventuelle d'un critère sur décision de comité |
| 9. Note officielle | Outil | Fiche de notation, fiche client | Note historisée et restituée, critères BAM figés |
| 10. Suivi | Surveillance, contre-étude | Surveillance, fiche client, Renotation | Indicateurs, migrations, watch list, renotation, revue des dégradations |

**États d'un dossier.** Brouillon → En validation (étape 1 … étape n) → Validé. Un rejet, à n'importe quelle étape, mène à Rejeté ; un dossier rejeté se reprend en un nouveau brouillon. Un brouillon peut être abandonné. Un seul dossier en cours (brouillon ou en validation) par client.

## 4. Spécification des écrans

### 4.1 Connexion et compte

![Écran de connexion](expression-besoin/captures/01-connexion.jpg)

**EF-AUTH-01 — Connexion.** Identifiant et mot de passe. Comptes nominatifs uniquement ; les clés API sont réservées aux échanges entre systèmes.

| Élément | Règle |
|---|---|
| Identifiant | 3 à 64 caractères (minuscules, chiffres, point, tiret, tiret bas) |
| Mot de passe | 12 caractères au moins ; stocké haché (scrypt), jamais en clair |
| Verrouillage | 5 échecs consécutifs : compte verrouillé 15 minutes ; message identique que l'identifiant existe ou non |
| Mot de passe provisoire | Imposé à la création et à la réinitialisation ; changement obligatoire à la première connexion |
| Session | Jeton aléatoire en cookie sécurisé (HttpOnly, Secure, SameSite) ; expiration ; fermeture de toutes les sessions au changement de mot de passe, de rôle ou de rattachement |

![Changer son mot de passe](expression-besoin/captures/31-mot-de-passe.jpg)

**EF-AUTH-02 — Changer son mot de passe.** Ancien mot de passe, nouveau mot de passe et confirmation ; le nouveau diffère de l'ancien.

**CA :** connexion, déconnexion, verrouillage après cinq échecs, changement imposé du mot de passe provisoire, journalisation de chaque événement (LOGIN_SUCCEEDED, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED).

### 4.2 Tableau de bord et navigation

![Tableau de bord](expression-besoin/captures/02-tableau-de-bord.jpg)

**EF-DASH-01 — Tableau de bord.** Compteurs du périmètre : clients, notations validées, dossiers en validation, modèles disponibles, statut de calibration des probabilités de défaut. Distribution des notes finales (dernière note validée de chaque client), une ligne par grille. Dernières notations, avec client, date d'arrêté, segment, score, note et résultat.

![Menu principal](expression-besoin/captures/03-navigation.jpg)

**EF-NAV-01 — Menu.** Tableau de bord, Dossiers, Clients, Groupes, Nouvelle notation, Renotation, Modèles, Méthodologie ; Administration pour les administrateurs. Le nom de l'entité et le rôle de l'utilisateur sont affichés. Le logo et le nom de l'outil suivent l'habillage de l'entité (EF-ADM-03).

### 4.3 Clients

![Liste des clients](expression-besoin/captures/04-contreparties.jpg)

**EF-CLI-01 — Liste des clients.** Recherche par nom, ICE ou entité ; filtre par segment ; filtre « afficher les désactivés » ; export CSV.

| Colonne | Contenu |
|---|---|
| Nom | Lien vers la fiche |
| Entité | Code de la banque ou filiale |
| ICE, devise, segment, secteur | Référentiel client |
| Score validé, grade validé | Dernière notation officielle ; une note antérieure à l'échelle 1 à 10 est suivie de sa classe équivalente |
| Arrêté | Date d'arrêté de la note officielle |
| Actions | « Noter » (ouvre la fiche sur le formulaire de notation), « Fiche » |

La mention « dossier en cours » ou « dossier en validation » signale une notation en préparation.

![Créer un client depuis T24](expression-besoin/captures/60-client-t24.jpg)

**EF-CLI-02 — Création depuis T24.** Le chargé d'affaires saisit le **code client T24** (1 à 10 chiffres, longueur paramétrable). L'outil interroge l'API clients de T24 et affiche la fiche rapatriée avant création : intitulé, nom abrégé, forme juridique, ICE, RC, identifiant fiscal, secteur, segment commercial, ville, adresse, pays, devise, gestionnaire, centre d'affaires, groupe d'affaires, date de création, capital, statut.

| Règle | Détail |
|---|---|
| Entité | Centre d'affaires de T24 s'il est dans le périmètre d'écriture, sinon l'entité choisie |
| Groupe d'affaires | Rattachement au groupe de même code |
| Doublon | Un code T24 déjà présent dans l'outil est refusé, sur toute la base |
| Correspondance des champs | Noms par défaut de l'API Transact (party/customers) ; champs locaux (ICE, RC, segment) déclarés dans le paramètre T24_FIELD_MAP |
| Segment commercial | Distinct du segment du modèle (calculé, RG-01) ; les deux sont affichés |

![Saisie minimale](expression-besoin/captures/61-saisie-minimale.jpg)

**EF-CLI-02b — Saisie minimale.** Si le client n'est pas encore dans T24, si T24 est désactivé ou ne répond pas, l'écran propose la saisie minimale : raison sociale, ICE ou RC, forme juridique, secteur, segment commercial, entité ; le code T24 éventuellement connu est conservé. L'OCR intelligent peut pré-remplir la fiche à partir de documents (statuts, attestation ICE, modèle J). La fiche est marquée « en attente de T24 ».

| Champ | Type | Obligatoire | Règle |
|---|---|---|---|
| Raison sociale | Texte | Oui | 2 à 200 caractères |
| Entité de rattachement | Liste | Oui | Entités de la portée d'écriture de l'utilisateur |
| ICE ou RC | Texte | Oui (l'un des deux) | ICE : 15 chiffres ; unique par entité |
| Forme juridique | Liste | Oui | SA, SARL, SARL AU, SNC, entreprise individuelle… |
| Code secteur | Liste | Oui | Référentiel sectoriel interne |
| Segment commercial | Liste | Oui | Référentiel paramétrable aligné sur T24 |
| Code client T24 | Texte | Non | Conservé, vérifié au rattachement |
| Devise, pays, ville, date de création | | Non | Date de création recommandée (ancienneté, règles BAM) |

![Fiche T24 et actualisation](expression-besoin/captures/62-fiche-t24.jpg)

**EF-CLI-05 — Rattachement et actualisation T24.** Depuis la fiche : « Rattacher à T24 et rapatrier » (fiche saisie) ou « Actualiser depuis T24 » (fiche T24). Les données de T24 remplacent la saisie ; un champ vide dans T24 n'efface rien ; chaque écart est affiché et journalisé (COUNTERPARTY_LINKED_TO_T24, COUNTERPARTY_SYNCED_FROM_T24). Une fiche rapatriée garde son code.

![Engagements chez la banque](expression-besoin/captures/65-engagements.jpg)

**EF-CLI-06 — Engagements ligne par ligne.** Lignes d'autorisation, de crédit et d'engagement par signature, rapatriées de T24 (API des limites) ou saisies.

| Élément | Règle |
|---|---|
| Ligne | Type (paramétrable : bilan / hors bilan, court / long terme, pondération), référence, autorisé, encours, impayé et ancienneté, date de début, échéance, garanties et valeur, statut |
| Position | Datée ; plus de 31 jours : « à actualiser » |
| Sources | Les lignes T24 remplacent les lignes T24 ; les lignes saisies s'ajoutent |
| Synthèse | Engagement global (base paramétrable : max(autorisé, encours) par ligne, encours ou autorisé ; hors bilan pondéré), utilisation, impayés, garanties |
| Constats | Dépassement au-delà de l'autorisé, ligne échue encore utilisée, impayés ; critères BAM proposés « à vérifier » (impayé de plus de 90, 180, 360 jours) |
| Dossier | L'engagement global pré-remplit le montant du dossier ; « Reprendre ce montant » |
| Crédit bureau | Rapprochement de l'encours chez la banque et de l'encours déclaré au crédit bureau |

![Saisir les lignes](expression-besoin/captures/67-engagements-saisie.jpg)

![Rapport de solvabilité](expression-besoin/captures/63-credit-bureau.jpg)

**EF-CLI-07 — Rapport de solvabilité.** Récupéré par l'API du crédit bureau (rafraîchi au préalable dans l'outil du bureau), lu par l'OCR intelligent depuis un PDF ou une image, ou saisi. Le rapport proposé se vérifie avant enregistrement (lignes par établissement, impayés, incidents, consultations, score).

| Règle | Détail |
|---|---|
| Date de mise à jour | Celle du rapport, pas celle du chargement ; au-delà de l'ancienneté paramétrée (30 jours par défaut) : alerte systématique « à rafraîchir dans l'outil du crédit bureau » |
| Signaux | Impayés, incidents non régularisés, nombre de consultations, écart avec les engagements : critères BAM proposés à vérifier, jamais cochés automatiquement |
| Soumission | Rapport absent ou périmé : avertissement tracé, ou blocage, selon le paramètre |

![Fiche juridique InfoRisque](expression-besoin/captures/64-inforisque.jpg)

**EF-CLI-08 — Fiche juridique (InfoRisque).** Le rapport InfoRisque (PDF ou image) est lu par l'OCR intelligent : identité légale, dirigeants, actionnaires, bénéficiaires effectifs, groupe, comptes déposés, événements juridiques. Contrôles : comptes déposés rapprochés du bilan de la banque (écart de plus de 5 % signalé), changement de dirigeant, procédure, nantissement ; critères BAM proposés à vérifier. Identité vide de l'outil complétée (ICE, RC) sans écraser.

![Votre portefeuille](expression-besoin/captures/66-portefeuille.jpg)

**EF-CLI-09 — Bandeau « Votre portefeuille ».** En mode portefeuille, la liste des clients d'un chargé d'affaires rappelle la règle et son code gestionnaire ; la colonne « Gestionnaire » est affichée.

![Watch list d'un client](expression-besoin/captures/74-watchlist.jpg)

**EF-CLI-10 — Watch list.** Bloc de la fiche client, saisi par la surveillance : entrée (niveau WL1, WL2, WL3), changement de niveau, sortie, avec date d'effet, date du comité, numéro du procès-verbal et motif. Règles : une entrée suit une sortie ou rien ; une sortie suit une entrée ; dates ordonnées ; reprise de l'historique par une date passée ; confirmation par une seconde personne si paramétrée ; annulation motivée, jamais de suppression. Badge « Watch list » dans la liste des clients, bandeau sur les dossiers. Effet sur la note : RG-23.

![Fiche client : modifier, noter, supprimer](expression-besoin/captures/55-fiche-client-gestion.jpg)

**EF-CLI-03 — Fiche client.** Identité, groupe d'affaires, historique des notations (date d'arrêté, segment, score, grade moteur, grade final, résultat, demandeur), formulaire « Noter ce client ».

**EF-CLI-04 — Modifier, supprimer, désactiver.** Modification de l'identité (journalisée avec l'avant et l'après). Suppression réservée au gestionnaire des risques : définitive pour un client sans notation ; un client noté est désactivé, son historique conservé. Un client désactivé n'apparaît plus dans les listes de notation ni dans les lots ; il se réactive depuis sa fiche.

![Fiche client et historique](expression-besoin/captures/28-fiche-contrepartie.jpg)

**CA :** création depuis T24 avec aperçu ; doublon T24 refusé (même hors portefeuille) ; repli en saisie minimale si T24 est indisponible ; rattachement ultérieur ; unicité de l'ICE par entité ; refus de créer un client dans une entité hors portée ; engagements rapatriés et saisis cumulés ; alerte d'ancienneté du rapport de solvabilité ; écart des comptes déposés signalé ; un client noté ne se supprime pas, il se désactive ; journalisation de chaque opération.

### 4.4 Groupes d'affaires

![Les groupes d'affaires](expression-besoin/captures/39-groupes.jpg)

![Fiche d'un groupe](expression-besoin/captures/40-groupe-fiche.jpg)

**EF-GRP-01 — Groupes d'affaires.** Code, libellé, entité porteuse. Rattachement et détachement de clients par liste d'ICE (un par ligne). Seuls les clients de l'entité du groupe et de sa descendance peuvent y être rattachés. La fiche liste les membres, leur note et les engagements ; elle sert à sélectionner une renotation par lot.

### 4.5 Ouvrir un dossier de notation

![Ouvrir un dossier](expression-besoin/captures/07-ouvrir-dossier.jpg)

**EF-DOS-01 — Ouverture.** Depuis la fiche du client (« Noter ce client ») ou le menu : motif du dossier (entrée en relation, renouvellement des crédits de fonctionnement, investissement, révision sur événement, autre ; liste paramétrable), type de crédit (proposé par le motif), modèle, date d'arrêté (par défaut : aujourd'hui) et exercice (conserver l'exercice repris ou charger le suivant). La dernière note validée du client est affichée.

| Règle | Détail |
|---|---|
| Un dossier en cours par client | Refus si un brouillon ou un dossier en validation existe déjà (message : « Un dossier est déjà en cours pour ce client ») |
| Reprise | La saisie du dernier dossier validé du client sur ce modèle est reprise ; chaque champ repris est marqué « repris — à confirmer » ; les bilans du référentiel du client sont repris selon l'exercice choisi |
| Actualisation T24 (EF-DOS-07) | Pour un client rattaché à T24 : fiche relue (sauf si relue depuis moins d'une heure) et engagements rapatriés (sauf s'ils datent du jour) ; une panne n'empêche pas l'ouverture |
| Engagement global | Pré-rempli depuis les lignes d'engagement |
| Client désactivé | Refus, avec invitation à le réactiver |
| Modèle | Grille standard (TPE, PME, GE avec comptes) ou TPE comportementale (sans comptes exploitables) ; les grilles challenger sont réservées au pilote |

![Le dossier en brouillon](expression-besoin/captures/08-dossier-brouillon.jpg)

**EF-DOS-02 — Espace de travail du dossier.** En-tête (client, entité, modèle et version, date d'arrêté, devise, auteur) ; sections : cadrage et montants, pièces, bilan, OCR intelligent, grille par domaine, barre d'actions collante (Enregistrer le brouillon, Aperçu du calcul, Soumettre à validation, Abandonner).

![Cadrage et montants](expression-besoin/captures/09-cadrage-montants.jpg)

**EF-DOS-03 — Cadrage.** Segment (imposé ou calculé, RG-01), chiffre d'affaires HT et engagements bancaires globaux dans la devise du client, chiffre d'affaires du groupe le cas échéant, défaut avéré (case, avec motif). Les montants sont convertis en MAD au dernier cours publié à la date d'arrêté (RG-15) ; la conversion est affichée et consignée.

![Données T24 à l'ouverture](expression-besoin/captures/68-dossier-ouverture.jpg)

**EF-DOS-07 — Encadré « Données T24 à l'ouverture du dossier ».** Indique, pour la fiche et les engagements, « actualisé », « non actualisé » (avec le motif et la date des dernières données) ou rien à faire ; le résultat est conservé dans le journal du dossier (détail de CASE_CREATED). Paramètre : fiche et engagements (défaut), fiche seule, aucune.

![Préparation du dossier](expression-besoin/captures/69-preparation.jpg)

**EF-DOS-05 — Préparation du dossier (pièces requises).** Chaque motif liste les éléments requis (paramétrable). Deux sortes :

| Élément | Vérification |
|---|---|
| États financiers chargés | Par l'outil : au moins un exercice avec des montants |
| Rapport de solvabilité à jour | Par l'outil : rapport enregistré, dans la limite d'ancienneté |
| Engagements à jour | Par l'outil : lignes datées de moins de 31 jours |
| Fiche juridique (InfoRisque) à jour | Par l'outil : rapport enregistré, dans la limite d'ancienneté |
| Statuts et modèle J, attestations fiscale et CNSS, rapport du CAC, business plan, devis, situation intermédiaire | Pièce jointe **typée** (une pièce non typée ne compte pour aucune exigence) |

Le panneau affiche chaque élément fourni, manquant ou périmé, avec l'action à faire. À la soumission : avertissement tracé (défaut), blocage, ou aucun contrôle (paramètre DOCS_AT_SUBMISSION).

### 4.6 Pièces et OCR intelligent

![Ajouter des pièces](expression-besoin/captures/10-ajouter-piece.jpg)

**EF-OCR-01 — Pièces du dossier.** Formats PDF, PNG, JPEG, XLSX, CSV, TXT ; taille maximale paramétrable (4 Mo par défaut) ; plusieurs fichiers à la fois. Chaque pièce est conservée avec son empreinte SHA-256, son auteur et sa date ; elle ne se modifie pas.

![La section Bilan](expression-besoin/captures/46-bilan-section.jpg)

**EF-OCR-02 — Section Bilan.** Bilan (actif, passif) et compte de produits et charges au format du plan comptable marocain (CGNC, modèle normal ou simplifié), exercices N et N−1 obligatoires, N−2 facultatif. Pour chaque exercice : année, date de clôture, modèle comptable, certification par un commissaire aux comptes, pièce source.

![Bilan lu par l'OCR intelligent](expression-besoin/captures/47-bilan-lu-ia.jpg)

**EF-OCR-03 — Lecture par OCR intelligent.** L'analyste coche une ou plusieurs pièces et lance « Lire le bilan ». L'OCR intelligent reconnaît les postes (y compris sur une photo ou un scan), les associe aux rubriques CGNC et remplit les montants des exercices trouvés. Il indique les montants lus, les postes non trouvés et l'origine de chaque valeur (document, page). L'analyste relit et corrige chaque montant avant d'enregistrer.

![Import du gabarit Excel](expression-besoin/captures/48-bilan-excel.jpg)

**EF-OCR-04 — Gabarit Excel.** Alternative sans OCR : la banque fournit un gabarit Excel CGNC (téléchargeable depuis l'écran) ; une fois rempli, il est importé et reconnu par un marqueur ; un fichier quelconque est refusé.

![Contrôles du bilan](expression-besoin/captures/49-bilan-controles.jpg)

**EF-OCR-05 — Contrôles du bilan.**

| Contrôle | Effet |
|---|---|
| Actif = passif (à l'unité près) | Bloquant à la soumission |
| Résultat net du bilan = résultat du CPC | Bloquant |
| Total de l'actif = total du document source | Bloquant |
| Exercices N et N−1 présents, dates de clôture ordonnées | Bloquant (grille standard, paramétrable) |
| Fraîcheur : clôture N de moins de 18 mois à la date d'arrêté | Alerte |
| Rubriques non trouvées par l'OCR intelligent | Alerte, à compléter |

![Ratios de la grille calculés depuis le bilan](expression-besoin/captures/50-bilan-ratios.jpg)

**EF-OCR-06 — Ratios.** L'outil calcule les indicateurs (EBE, EBE retraité du crédit-bail, CAF, fonds de roulement, BFR, trésorerie nette, dette brute et nette économiques, fonds propres tangibles) et les ratios de la grille (RG-19). Pour chaque ratio : valeur calculée, valeur retenue, correction éventuelle et motif. Les ratios non notés (gearing, ROE, délais clients et fournisseurs, rotation des stocks…) sont calculés et affichés.

![Critère calculé depuis le bilan](expression-besoin/captures/51-critere-calcule.jpg)

**EF-OCR-07 — Correction motivée.** L'analyste peut corriger un ratio de la grille, et lui seul, avec un motif obligatoire (10 caractères au moins). La valeur calculée et la valeur retenue restent visibles côte à côte, en particulier pour le valideur.

![Demander des propositions à l'OCR intelligent](expression-besoin/captures/11-analyse-ia.jpg)

![Examiner les propositions](expression-besoin/captures/12-propositions.jpg)

**EF-OCR-08 — Propositions pour la grille.** À partir des pièces et d'éléments complémentaires saisis par l'analyste (visite, carnet de commandes…), l'OCR intelligent propose des valeurs pour les critères de la grille : valeur, source (pièce, page), justification, degré de confiance. Chaque proposition s'accepte ou se refuse ; « Accepter celles ≥ 80 % » accepte en une fois les propositions les plus sûres. Une proposition hors grille ou invalide est écartée et comptée.

![Proposition appliquée dans la grille](expression-besoin/captures/13-grille-ia.jpg)

**EF-OCR-09 — Règles de l'OCR intelligent.**

| Règle | Détail |
|---|---|
| Libellé | L'interface emploie « OCR intelligent » (lecture des documents, propositions) ; les maquettes montrent encore « IA » |
| Désactivé par défaut | Activation par l'administrateur du groupe ; fournisseur, modèle et adresse paramétrables ; possibilité d'un moteur hébergé par la banque |
| Secret | La clé d'accès au service reste dans la configuration du serveur, jamais en base ni à l'écran |
| Décision humaine | Rien n'est appliqué sans décision de l'analyste ; chaque décision est journalisée (AI_PROPOSAL_DECIDED) |
| Séparation des fonctions | Accepter ou refuser une proposition fait de l'utilisateur un contributeur du dossier (RG-13) |
| Sécurité du contenu | Le contenu des pièces est traité comme une donnée : aucune instruction qu'il contiendrait n'est exécutée |
| Données personnelles | Envoi des pièces au service conforme à la loi 09-08 et à la politique d'externalisation ; journal des envois |

**CA :** lecture d'un bilan de démonstration (PDF et photo) avec 95 % des postes reconnus ; import du gabarit ; refus d'un fichier quelconque ; contrôles bloquants ; correction motivée visible du valideur ; aucune proposition appliquée sans décision.

### 4.7 La grille

![Noter un critère qualitatif](expression-besoin/captures/14-critere-qualitatif.jpg)

**EF-GRI-01 — Critères.** La grille est présentée par domaine (D1 à D7 pour la grille standard, B1 à B7 pour la grille TPE comportementale), avec le poids de chaque critère pour le segment. Un critère chiffré prend la valeur calculée ou saisie et se note par barème ; un critère qualitatif se note en choisissant l'un des cinq repères écrits (100, 75, 50, 25, 0). Le libellé complet du repère est affiché.

![Qualifier le statut d'une donnée](expression-besoin/captures/15-statut-donnee.jpg)

**EF-GRI-02 — Statut d'une donnée.** Disponible, estimée, manquante, invalide, périmée, non applicable (RG-02). Le statut s'affiche avec son effet sur le score et la couverture.

![Enregistrer le brouillon](expression-besoin/captures/16-enregistrer.jpg)

**EF-GRI-03 — Enregistrement.** Enregistrement à tout moment, sans contrôle bloquant ; un message confirme l'enregistrement ; une modification non enregistrée est signalée avant de quitter la page. Saisie limitée à 400 Ko.

![Critères de classement BAM](expression-besoin/captures/70-criteres-bam.jpg)

**EF-BAM-01 — Critères de classement BAM.** Bloc en bas du dossier : chaque critère (code, libellé abrégé, article de la circulaire), par famille (sensible, pré-douteux, douteux, compromis) ; source : bilan (coché automatiquement par une alerte du format de bilan : recul du CA de 50 %, endettement supérieur à 3 fois les capitaux propres, trois exercices déficitaires, comptes non reçus à 7 mois…) ou déclaration de l'analyste (datée, commentée) ; état : coché, non coché, levé, à vérifier (proposé par les engagements, le crédit bureau ou InfoRisque, jamais coché d'office). Effet sur la note : RG-22.

![Levée par le comité](expression-besoin/captures/71-levee-comite.jpg)

**EF-BAM-02 — Levée par le comité.** Enregistrée par la contre-étude ou la surveillance, jamais par un contributeur du dossier : critères levés, date du comité, numéro du procès-verbal, motif. Effet immédiat ou après confirmation d'une seconde personne (paramètre). La note du dossier est recalculée ; l'ancienne notation reste dans l'historique. La levée vaut pour le dossier ; au renouvellement elle est rappelée et le critère, s'il est toujours rempli, s'applique de nouveau. Journalisée (CLASSIFICATION_LIFT_RECORDED, COMMITTEE_DECISION_CONFIRMED / CANCELLED).

![Critères sur la fiche de notation](expression-besoin/captures/75-fiche-criteres.jpg)

**EF-BAM-03 — Restitution.** La fiche de notation fige les critères actifs à la date, leur source, la levée et l'effet sur la note ; ils sont transmis comme indicateurs à la classification des créances.

### 4.8 Aperçu du calcul

![Aperçu du calcul](expression-besoin/captures/17-apercu.jpg)

**EF-APE-01 — Aperçu.** Même calcul que la soumission, sans enregistrement : score brut, classe de 1 à 10, grade moteur et grade final, classe et score de confiance, couverture observée, contributions par domaine et par critère, plafonds appliqués, signaux d'alerte, données manquantes. Probabilité de défaut affichée seulement si une calibration validée sur défauts observés existe ; sinon « non exposée ». Impression ou export PDF.

![Soumission refusée : dossier sans grade](expression-besoin/captures/25-sans-grade.jpg)

**EF-APE-02 — Dossier sans grade.** Si le calcul ne produit pas de grade (donnée critique manquante, couverture insuffisante, routage), la soumission est refusée avec la liste exacte des éléments à compléter.

### 4.9 Soumission et circuit de validation

![Dossier soumis : le circuit de validation](expression-besoin/captures/18-soumis.jpg)

**EF-VAL-01 — Soumission.** Contrôles : statut brouillon ; fonction autorisée à soumettre (si paramétrée) ; bilan conforme (grille standard) ; grade produit. Le serveur recalcule la notation à partir du brouillon enregistré, l'enregistre de façon immuable (entrées, résultat, versions du modèle, du moteur, des paramètres et de l'échelle) et fige le circuit applicable au dossier (étapes, fonctions, rôles, en fonction de l'exposition).

![File « À traiter » du directeur du centre d'affaires](expression-besoin/captures/19-a-traiter.jpg)

**EF-VAL-02 — File « À traiter ».** Chacun y trouve ses brouillons et dossiers rejetés à reprendre, et les dossiers dont l'étape en attente lui revient (fonction et rôle). Sous le statut, l'étape en attente et son rang (« Validation du directeur du centre d'affaires (1/2) »). La file liste aussi les notes à renouveler (dernière note validée plus ancienne que la durée de validité).

![Valider l'étape ou rejeter](expression-besoin/captures/20-decision.jpg)

![Lire le circuit du dossier](expression-besoin/captures/59-circuit-dossier.jpg)

**EF-VAL-03 — Avis et décision.** Deux natures d'étape : **avis** (favorable ou défavorable ; ne rejette pas ; non bloquant, bloquant pour tous les centres, ou pour les catégories de délégation cochées) et **décision** (la contre-étude arrête la note). Plusieurs niveaux de décision peuvent être prévus, chacun avec ses conditions : exposition au-delà d'un seuil, note égale ou moins bonne qu'une classe, types de crédit, catégories de centre, combinées (l'une suffit ou toutes). Seul le niveau le plus élevé qui s'applique décide ; les niveaux inférieurs instruisent (avis bloquant) ; il reste toujours un niveau sans condition. **Décision sur une étape.** Le panneau « Circuit de validation » affiche chaque étape (libellé, fonction, rôle minimal, état : validée, en attente, à venir, rejet), les décisions prises (par qui, quand, avis) et les contributeurs exclus. Le décideur saisit un avis (obligatoire pour un rejet, 10 caractères au moins) et clique sur « Valider : [étape] » ou « Rejeter ».

![Contre-étude : validation finale](expression-besoin/captures/57-validation-finale.jpg)

**EF-VAL-04 — Validation finale.** À la dernière étape, le bouton devient « Validation finale » : la notation devient la note officielle du client.

![Dossier validé](expression-besoin/captures/21-valide.jpg)

**Règles du circuit.**

| Règle | Détail |
|---|---|
| RG-13 Séparation des fonctions | Un contributeur du dossier (création, enregistrements, pièces, décisions sur les propositions de l'OCR intelligent, soumission) ne décide d'aucune étape ; un dossier repris hérite des contributeurs du dossier rejeté |
| Une personne, une étape | Une même personne ne décide que d'une étape d'un dossier |
| Fonction et rôle | Le décideur détient une fonction habilitée de l'étape (si l'étape en désigne) et au moins son rôle minimal |
| Conditions d'une étape | Lues à la soumission : exposition, note calculée (plafonds compris), type de crédit, catégorie du centre ; une donnée inconnue applique l'étape ; un centre sans catégorie prend la première catégorie active |
| RG-14 Délégation | Au-delà du seuil de délégation, la dernière étape exige au moins le rôle paramétré |
| Circuit figé | Un dossier garde le circuit de sa soumission ; une modification du paramétrage s'applique aux dossiers soumis ensuite |
| Rejet | À n'importe quelle étape ; motif obligatoire ; dossier clos, repris en un nouveau brouillon |
| Concurrence | Deux décideurs simultanés d'une même étape : le second reçoit « Dossier déjà décidé à cette étape » |
| Canaux | Mêmes règles à l'écran et par l'API ; une clé API ne porte pas de fonction et ne décide que des étapes ouvertes à toute fonction |

![Dossier rejeté : reprendre le dossier](expression-besoin/captures/26-rejete-reprise.jpg)

**EF-VAL-05 — Reprise.** « Reprendre le dossier » ouvre un nouveau brouillon reprenant la saisie ; le dossier rejeté et sa notation restent dans l'historique et ne deviennent jamais la note officielle.

**CA :** directeur puis contre-étude ; contre-étude refusée avant le directeur ; contributeur refusé ; même personne refusée à l'étape 2 ; rejet à l'étape 1 ; seuil d'exposition ; délégation ; circuit modifié sans effet sur un dossier en cours ; décisions simultanées ; mêmes résultats écran et API.

### 4.10 Résultat et fiche de notation

![Le résultat de la notation](expression-besoin/captures/22-resultat.jpg)

![La base financière sur la fiche de notation](expression-besoin/captures/52-fiche-base-financiere.jpg)

**EF-RES-01 — Fiche de notation.** Client, date d'arrêté, modèle et versions ; statut (validée, en validation, rejetée) ; score brut, grade moteur, grade après plafonds, grade final ; confiance et couverture ; contributions ; plafonds et signaux ; base financière (exercice, clôture, modèle comptable, certification, pièce source et empreinte, contrôles, postes clés du bilan et du CPC, tous les ratios, corrections et motifs) ; circuit de validation ; dérogations. Export PDF.

![Le bilan sous les yeux du valideur](expression-besoin/captures/53-valideur-bilan.jpg)

**EF-RES-02 — Note officielle.** Seule une notation validée est la note du client (RG-16) ; elle remplace la précédente dans la liste, la fiche client et le tableau de bord.

### 4.11 Dérogations

![Demander une dérogation](expression-besoin/captures/23-derogation-demande.jpg)

**EF-DER-01 — Demande.** Sur une notation validée, un gestionnaire des risques demande une dérogation : grade retenu, motif codifié, commentaire (10 caractères au moins), pièce justificative, date d'expiration facultative.

| Motifs codifiés | |
|---|---|
| Donnée non captée par le modèle | Limite du modèle |
| Événement récent défavorable | Spécificité sectorielle |
| Événement récent favorable | Changement de management |
| Soutien du groupe | Choc temporaire |
| Exception de politique | |

![Décider d'une dérogation](expression-besoin/captures/24-derogation-decision.jpg)

**EF-DER-02 — Décision.** Une seconde personne (gestionnaire des risques, distincte du demandeur) approuve ou rejette. Règles : écart de 2 crans au plus (paramétrable), mesuré sur l'échelle de la notation ; ni vers ni depuis un grade de défaut ; une seule dérogation en attente par notation ; le résultat du moteur n'est jamais réécrit ; une dérogation expirée cesse de s'appliquer ; une dérogation ne s'applique qu'à partir de sa date de décision.

### 4.12 Liste des dossiers

![Liste des dossiers et onglets](expression-besoin/captures/27-dossiers.jpg)

**EF-DOS-04 — Liste.** Onglets : À traiter, Brouillons, En validation, Validés, Rejetés, Abandonnés, Tous ; compteurs par statut. Colonnes : client, entité, arrêté, statut et étape en attente, grade, ouvert par, soumis par, mise à jour.

### 4.13 Renotation par lot

![Lancer une renotation](expression-besoin/captures/41-renotation-lancer.jpg)

**EF-REN-01 — Lancer un lot.** Sélection : banque ou filiale (et sa descendance), groupe d'affaires, segment, secteur (préfixe de code), note validée depuis plus de N mois. Paramètres : nom du lot, date d'arrêté, ouverture d'un dossier de revue à partir de N crans de migration, en cas d'absence de note ou de défaut. Données rafraîchies facultatives : fichier CSV (première colonne ICE ou identifiant ; colonnes = clés de champs du dossier). « Compter la sélection » donne le nombre de clients avant lancement.

![Suivre un lot et lire la migration](expression-besoin/captures/42-renotation-suivi.jpg)

**EF-REN-02 — Suivi.** Avancement (traités / total), compteurs (inchangés, améliorations, dégradations, sans note, défauts, écartés, erreurs, dossiers de revue), matrice de migration (note officielle en ligne, note de surveillance en colonne), détail par client, export CSV. Le traitement se fait par tranches et reprend après interruption.

![Les clients à revoir](expression-besoin/captures/43-renotation-revoir.jpg)

![Planifier une renotation périodique](expression-besoin/captures/44-renotation-planifier.jpg)

**EF-REN-03 — Planification.** Nom, fréquence (mensuelle, trimestrielle, semestrielle, annuelle), jour d'exécution, mêmes critères de sélection ; activation et désactivation. Le lot est créé automatiquement à l'échéance (date d'arrêté : fin du mois précédent) et traité par la tâche planifiée du serveur.

![Instruire un dossier de revue](expression-besoin/captures/45-dossier-revue.jpg)

**EF-REN-04 — Règles.** Chaque client est renoté à partir de son dernier dossier validé, avec les données rafraîchies et la nouvelle date d'arrêté. La notation de lot est une surveillance : elle ne devient jamais la note officielle. Un dossier de revue pré-rempli s'ouvre pour chaque migration significative, absence de note ou défaut, et suit le circuit normal. Un client sans dossier validé réutilisable est écarté avec son motif ; une valeur du fichier hors grille est refusée.

### 4.14 Simulation et modèles

![Simuler sans enregistrer](expression-besoin/captures/29-simulation.jpg)

**EF-SIM-01 — Simulation.** Calcul d'une notation sans client ni enregistrement, avec saisie du bilan et de la grille ; même moteur que les dossiers.

![Consulter la grille du modèle](expression-besoin/captures/30-modele.jpg)

**EF-MOD-01 — Modèles.** Pour chaque grille : version effective (avec les paramètres en vigueur), statut, domaines et poids par segment, critères, barèmes et repères, données critiques, plafonds, signaux d'alerte, échelle, statut de calibration. Lecture seule.

### 4.15 Administration

![Vue d'ensemble de l'administration](expression-besoin/captures/32-admin.jpg)

**EF-ADM-01 — Vue d'ensemble.** Accès aux utilisateurs, banques et filiales, devises, paramétrage des grilles, échelle de notation, format du bilan, paramétrage (circuit, workflow, comités, dérogations, pièces, OCR intelligent, référentiels externes, surveillance), raccordements, reprise du stock, journal d'audit.

![Utilisateurs](expression-besoin/captures/33-admin-utilisateurs.jpg)

**EF-ADM-02 — Utilisateurs.** Création (identifiant, nom, rôle, entité, portée d'écriture, fonction, code gestionnaire T24) ; mot de passe provisoire affiché une seule fois ; modification du rôle, du rattachement et de la fonction ; réinitialisation du mot de passe ; désactivation et réactivation. Un administrateur ne modifie ni son propre rôle, ni son rattachement, ni sa fonction. Un administrateur d'entité ne gère que les comptes de sa branche et n'attribue pas le rôle Administrateur du groupe.

![Fonction et code gestionnaire](expression-besoin/captures/81-admin-code-gestionnaire.jpg)

**EF-ADM-02b — Code gestionnaire.** Code gestionnaire T24 (chargé d'affaires) modifiable par compte ; prérequis du mode portefeuille (EF-PTF-01) ; journalisé (USER_OFFICER_CODE_CHANGED).

![Banques et filiales](expression-besoin/captures/34-admin-entites.jpg)

**EF-ADM-03 — Banques et filiales.** Arbre des entités (groupe, banque, banque régionale, centre d'affaires, filiales) : code, nom, entité parente, pays, devise, catégorie de délégation du centre (normale, encadrée, restreinte) ; habillage (nom de l'outil, logo, couleur, appliquée seulement si son contraste est suffisant) ; désactivation.

![Publier un cours de change](expression-besoin/captures/35-admin-devises.jpg)

**EF-ADM-04 — Devises.** Cours datés vers le MAD (devise, date, cours, source) ; un cours publié ne se modifie pas, il se remplace par un cours plus récent ; une conversion sans cours à la date d'arrêté ou avant est refusée, jamais devinée.

![Paramétrer le circuit de validation](expression-besoin/captures/58-admin-circuit.jpg)

**EF-ADM-05 — Circuit de validation.** Étapes ordonnées (6 au plus) : libellé, code, fonctions habilitées, rôle minimal, seuil d'exposition facultatif ; ajout, retrait, réordonnancement. Fonctions : code, libellé, droit de soumettre, nombre de comptes actifs ; une fonction attribuée ne se supprime pas. Contrôles à l'enregistrement : au moins une étape, codes uniques, fonctions connues, pas de circuit dont toutes les étapes seraient conditionnées par un seuil. Réservé à l'administrateur du groupe ; journalisé avec l'ancien et le nouveau circuit.

![Paramétrage du workflow](expression-besoin/captures/36-admin-parametrage.jpg)

**EF-ADM-06 — Paramètres.** Voir le chapitre 8.

![Échelle de notation 1 à 10](expression-besoin/captures/54-admin-echelle.jpg)

**EF-ADM-07 — Échelle de notation.** Versions datées (RG-20) : identifiant, date d'effet, bornes et libellés des classes, motif. Une version en vigueur est figée ; une version future se modifie ou se retire.

![Paramétrage des grilles](expression-besoin/captures/56-admin-grilles.jpg)

**EF-ADM-08 — Paramétrage des grilles.** Versions datées des paramètres de chaque grille : poids par segment (total affiché, 100 % exigé), seuils des barèmes à cinq paliers, repères qualitatifs, libellé, caractère critique, score d'une donnée absente, ajout et retrait de critères, classe plafond et seuil des exceptions, seuils des revues obligatoires, couverture minimale, poids et classes de confiance, crans maximaux de soutien. Contrôles du démarrage à l'enregistrement (concentration d'un critère, barèmes exhaustifs, plafonds présents dans l'échelle, critère référencé par une exception non retirable). La version appliquée est consignée dans chaque notation.

![Paramétrer l'OCR intelligent](expression-besoin/captures/37-admin-ia.jpg)

**EF-ADM-09 — OCR intelligent.** Activation, fournisseur (Anthropic, OpenAI, Azure OpenAI, API compatible OpenAI dont Google Gemini ou un modèle hébergé par la banque), modèle, adresse du service (https obligatoire ; adresse complète du déploiement Azure avec api-version), variable d'environnement de la clé (nom commençant par IA_CLE_, une par fournisseur ; aucun autre secret ne peut être désigné) ; état affiché (actif, désactivé, configuration incomplète).

![Critères de classement et effet](expression-besoin/captures/80-admin-criteres.jpg)

**EF-ADM-10 — Critères de classement, comités, watch list, motifs.** Critères BAM (code, famille, libellé, article, source, alerte du bilan liée, actif), effet par famille (plafond ou défaut) ; seconde validation des levées et de la watch list ; niveaux de watch list (plafond, délai de renotation, revue, cran de cumul) ; motifs de dossier (type de crédit par défaut, pièces requises) ; types de crédit ; catégories de délégation ; segments commerciaux ; types d'engagement. Versions journalisées.

![Format du bilan](expression-besoin/captures/79-admin-bilan.jpg)

**EF-ADM-11 — Format du bilan.** Versions datées : postes chargés (complet, agrégé, notation seulement), postes propres à la banque, indicateurs par formule, seuils d'appréciation (bon, mauvais, critique, variation significative), alertes. Une notation garde la version qui l'a produite.

![Raccordements](expression-besoin/captures/76-admin-raccordements.jpg)

**EF-ADM-12 — Raccordements (mise en service des API).** Pour T24, le crédit bureau et l'OCR intelligent : état, cible (adresse, chemins, fournisseur, modèle), présence du jeton (jamais sa valeur), dernier test. « Tester la connexion » appelle l'API avec un code réel, même désactivée, sans enregistrer de donnée client, et affiche ce qui a été lu ; journalisé (INTEGRATION_TESTED). **Au démarrage, toutes les API sont désactivées** et l'outil fonctionne en saisie. L'activation (Paramétrage) est refusée sans test réussi de moins de 30 jours sur la cible en vigueur ; la désactivation est toujours possible.

![Reprise du stock](expression-besoin/captures/78-admin-reprise.jpg)

**EF-ADM-13 — Reprise du stock.** Classeur Excel à quatre feuilles (clients, notes historiques validées, bilans, historique de watch list), modèle téléchargeable avec mode d'emploi et liste des postes. Contrôle à blanc ligne par ligne (créés, ignorés, rejetés avec motif), puis import en une seule transaction, journalisé avec l'empreinte du fichier (STOCK_IMPORTED). Import idempotent. Notes reprises : officielles (origine « reprise »), non recalculées, note et modèle d'origine conservés.

![Journal d'audit](expression-besoin/captures/77-admin-journal.jpg)

**EF-ADM-14 — Journal d'audit.** Lecture seule : filtres par objet, action, acteur et période ; 100 événements par page ; lien vers le dossier, le client, la notation ou le lot ; export Excel (10 000 lignes au plus). Cloisonné : un administrateur d'entité ne voit que son périmètre ; les événements globaux sont réservés à l'administrateur du groupe. Libellés communs avec le journal du dossier.

### 4.17 Surveillance du portefeuille

![Tableau de surveillance](expression-besoin/captures/72-surveillance.jpg)

**EF-SUR-01 — Tableau de surveillance.** Filtres : date d'arrêté, horizon (6 ou 12 mois), entité, segment, secteur. Synthèse : exposition notée, nombre de clients notés, en watch list, lignes d'engagement. Indicateurs de risque (KRI) et de performance (KPI) avec feu vert, orange, rouge selon des seuils paramétrables et tendance sur l'horizon : note moyenne pondérée, exposition en risque élevé, en défaut, en watch list, taux de dégradation, stabilité des migrations, concentration des 10 premiers, impayés et dépassements sur les lignes, notes échues.

![Migration et concentration](expression-besoin/captures/73-surveillance-migration.jpg)

**EF-SUR-02 — Analyses.** Matrice de migration (note d'il y a N mois × note actuelle, sorties et non renotés comptés à part), répartition par classe, évolution, ventilations par segment, secteur et centre, concentration, liste des alertes. Infobulles au survol et au clavier ; vue tableau de chaque graphique.

**EF-SUR-03 — Exposition et exports.** Exposition courante issue des lignes d'engagement (T24 ou saisie), à défaut l'engagement global déclaré ; source indiquée. Export CSV par tableau.

### 4.16 Usage sur téléphone

![Sur téléphone](expression-besoin/captures/38-mobile.jpg)

**ENF-MOB-01.** Tous les écrans s'utilisent sur téléphone et tablette (largeur 390 pixels) sans défilement horizontal de la page ; les tableaux larges défilent dans leur cadre.

## 5. Moteur de notation

### 5.1 Règles de gestion

| Règle | Détail |
|---|---|
| RG-01 Segmentation | Le segment (TPE, PME, GE) est imposé par l'analyste ou calculé à partir du chiffre d'affaires et de l'exposition, convertis en MAD. Seuils provisoires : TPE jusqu'à 10 M MAD, GE au-delà de 175 M MAD ; à confirmer. |
| RG-02 Statut d'une donnée | Disponible (observée) ; estimée (comptée dans le score, pas dans la couverture) ; manquante, invalide ou périmée (score 0, poids conservé ; le score haut possible est affiché à côté) ; non applicable (seulement si le modèle le prévoit, poids transféré au critère receveur). |
| RG-03 Données critiques | Grille standard : fonds propres tangibles / bilan, dette nette / EBE, liquidité court terme, DSCR, retards de paiement. Si l'une manque, aucune note (sauf défaut constaté). |
| RG-04 Score d'un critère | Chiffré : barème à cinq paliers (100, 75, 50, 25, 0) propre au segment, bornes sans chevauchement. Qualitatif : repère écrit choisi. Cas particulier déclaré : score imposé. |
| RG-05 Matérialité ESG | Un critère ESG non matériel est écarté ; son poids est transféré au critère receveur. |
| RG-06 Score brut | Moyenne pondérée des scores des critères, poids du segment, sur 100. |
| RG-07 Défaut | Un défaut constaté impose DEF1 (retard), DEF2 (improbabilité de paiement, restructuration en difficulté) ou DEF3 (procédure collective, contentieux), quel que soit le score. |
| RG-08 Porte de qualité | Au moins 60 % du poids sur des données observées, 30 % dans chaque domaine, confiance au moins C ; sinon aucun grade (le score est conservé pour la surveillance). |
| RG-09 Confiance | 35 % complétude + 20 % fraîcheur + 30 % fiabilité + 15 % provenance ; classes A (85+), B (70+), C (55+), U. Informative : ne modifie jamais le grade. |
| RG-10 Grade | Le score donne la classe selon l'échelle en vigueur (5.2) ; défaut hors échelle. |
| RG-11 Exceptions | Après le grade, sans modifier le score : DSCR < 1, incertitude sur la continuité, EBE négatif deux années sur trois → au mieux classe 8 ; dossier groupe incomplet → au mieux classe 7. La plus contraignante s'applique. |
| RG-12 Soutien du groupe | Note autonome conservée ; relèvement de 2 crans au plus, seulement si capacité, volonté, engagement juridique et transférabilité sont documentés. |
| RG-15 Devises | Montants convertis en MAD au dernier cours publié à la date d'arrêté ou avant ; conversion consignée. |
| RG-16 Note officielle | Seule une notation validée est la note du client. |
| RG-17 Signaux d'alerte | 18 signaux. Bloquants (identité, sanction, fraude, activité interdite) : statut conformité bloqué. Contrôle de défaut et alertes : revue de l'analyste. Jamais dilués dans la moyenne. |
| RG-18 Reproductibilité | Chaque notation enregistre entrées, résultat, versions du modèle, du moteur, des paramètres et de l'échelle ; elle se rejoue à l'identique. |
| RG-19 Ratios du bilan | Formules uniques : EBE retraité du crédit-bail, fonds propres tangibles, dette nette économique, flux d'exploitation, DSCR sur le principal à 12 mois. EBE retraité nul ou négatif, ou fonds propres tangibles négatifs : cas particulier défavorable imposé. |
| RG-20 Échelle paramétrable | Versions datées ; version en vigueur à la date de calcul ; version en vigueur figée ; bornes strictement décroissantes couvrant [0, 100] ; classes citées par les plafonds conservées. |
| RG-21 Paramètres des grilles | Versions datées, mêmes règles que l'échelle ; contrôles du démarrage à l'enregistrement. |
| RG-22 Critères de classement BAM | Après le grade et les exceptions : famille sensible → au mieux classe 8 ; pré-douteuse → au mieux 10 ; douteuse → DEF1 ; compromise → DEF3 (effets paramétrables). La famille la plus sévère l'emporte ; le score est conservé ; un critère levé par le comité n'a plus d'effet sur le dossier. |
| RG-23 Watch list | WL1 → au mieux 8, WL2 → 9, WL3 → 10 (paramétrables), avec délai de renotation ; face à un critère BAM, le plafond le plus sévère s'applique ; cran supplémentaire de cumul paramétrable (désactivé par défaut). |
| RG-24 Engagement global | Somme, par ligne active, de la base paramétrée (max(autorisé, encours) par défaut), hors bilan pondéré ; sert à la segmentation, au circuit et à la surveillance. |
| RG-25 Notes reprises | Une note reprise du stock est officielle, datée de sa validation, non recalculée ; elle alimente la dernière note validée, les migrations et la surveillance. |

### 5.2 Échelle maîtresse (version ECH10-2026.1)

| Classe | Score minimal | Libellé |
|---|---|---|
| 1 | 90 | Exceptionnel |
| 2 | 85 | Très solide |
| 3 | 80 | Solide |
| 4 | 75 | Bon |
| 5 | 70 | Satisfaisant |
| 6 | 64 | Acceptable |
| 7 | 57 | Fragile |
| 8 | 48 | Faible |
| 9 | 40 | Très faible |
| 10 | 0 | Critique |
| DEF1 à DEF3 | — | Défaut constaté, hors échelle |

### 5.3 Grilles

| Grille | Usage | Domaines (poids PME) |
|---|---|---|
| CORP_STD_V1 | TPE avec comptes, PME, GE | D1 Performance financière et bilan (30 %), D2 Capacité de remboursement (15 %), D3 Comportement bancaire (20 %), D4 Activité et secteur (15 %), D5 Management et groupe (12 %), D6 Transparence et conformité (5 %), D7 ESG et climat (3 %) |
| CORP_TPE_BEHAV_V1 | TPE sans comptes exploitables | B1 Comportement du compte, B2 Capacité observée sur les flux, B3 Activité, B4 Dirigeant, B5 Documents et conformité, B6 Groupe, B7 ESG |
| Challengers | Pilote en double notation | Grilles resserrées (16 et 12 critères), sans effet sur la note officielle |

Le détail des critères, barèmes et repères figure dans la note méthodologique ; il est livré sous forme de configuration versionnée et validée au démarrage.

### 5.4 Cas de calcul de référence

Le moteur livré doit reproduire exactement les cas de référence du simulateur Excel (onglet « Cas exemples ») et des tests automatisés : mêmes scores bruts, mêmes classes, mêmes plafonds, pour chaque grille et chaque segment. Un écart, même d'un point de score, est une anomalie bloquante.

## 6. Données

### 6.1 Tables

| Table | Contenu | Clés et contraintes |
|---|---|---|
| entities | Banques et filiales, arbre, devise, pays, habillage | Code unique ; parent |
| users, user_sessions | Comptes, rôle, entité, portée, fonction, code gestionnaire, verrouillage ; sessions | Identifiant unique |
| counterparties | Clients : identité, entité, devise, secteur, segment du modèle, segment commercial, groupe, gestionnaire, code T24, source (T24 ou saisie), données T24 et date de synchronisation, fiche juridique, actif | ICE unique par entité ; code T24 unique |
| economic_groups | Groupes d'affaires | Code unique par entité |
| exchange_rates | Cours datés vers le MAD | (devise, date) unique |
| rating_cases | Dossiers : statut, saisie (JSON), conversion, circuit figé et décisions, auteurs | Un dossier en cours par client |
| case_documents | Pièces : nom, type MIME, type de pièce (exigence), taille, empreinte, contenu | Lien dossier |
| rating_cases (compléments) | Motif, type de crédit | |
| credit_facilities | Lignes d'engagement : source (API, saisie), type, référence, autorisé, encours, impayé, ancienneté, échéances, garanties, statut, date de position | Lien client |
| credit_reports | Rapports de solvabilité : bureau, source (API, document, saisie), date de mise à jour, référence, contenu, pièce et empreinte | Lien client |
| committee_decisions | Décisions de comité : levée de critère, entrée, changement de niveau, sortie de watch list ; date du comité, d'effet, référence, motif, statut (effective, à confirmer, annulée), auteur, confirmation | Lien client, dossier |
| ai_proposals | Propositions de l'OCR intelligent : champ, valeur, source, justification, confiance, décision | Lien dossier |
| rating_runs | Notations immuables : entrées, résultat, versions, origine (écran, API, lot, dossier, reprise du stock) | Clé d'idempotence |
| overrides | Dérogations : grades, motif, preuve, demandeur, décideur, expiration | Une en attente par notation |
| renotation_batches, renotation_items, renotation_schedules | Lots, résultats par client, planifications | |
| app_settings | Paramétrage, versions de l'échelle et des grilles, circuit | Clé unique |
| audit_events | Journal : acteur, rôle, action, ressource, entité, détail, horodatage, corrélation | Ajout seul (pas de modification ni de suppression) |
| outbox_events, webhook_subscriptions, webhook_deliveries | Événements sortants et abonnements | |

### 6.2 Historisation et conservation

- Notations, dossiers, pièces, décisions et journal sont conservés au moins 10 ans (un cycle économique complet).
- Une notation ne se modifie jamais : une correction passe par un nouveau dossier.
- Une version d'échelle, de grille ou de circuit en vigueur n'est jamais modifiée ; les anciennes versions restent lisibles.

## 7. Interfaces

### 7.1 API REST (contrat OpenAPI fourni)

| Ressource | Méthodes | Usage |
|---|---|---|
| /health | GET | Supervision |
| /models, /models/{id} | GET | Grilles et versions |
| /counterparties, /counterparties/{id} | GET, POST, PATCH, DELETE | Référentiel clients |
| /counterparties/{id}/rating-runs | GET | Historique des notations |
| /rating-runs | GET, POST | Notation persistée ; crée un dossier en validation avec son circuit |
| /rating-runs/simulate, /rating-runs/compare | POST | Simulation, comparaison de grilles |
| /rating-runs/{id} | GET | Détail |
| /rating-cases, /rating-cases/{id}/decision | GET, POST | Dossiers, décision sur l'étape en attente |
| /overrides, /overrides/{id}/decision | POST | Dérogations |
| /renotation-batches, /{id}, /{id}/process | GET, POST | Lots |
| /renotation/cron | POST | Tâche planifiée (secret dédié) |
| /webhook-subscriptions, /{id} | GET, POST, DELETE | Abonnements |

Authentification par clé API (en-tête), rattachée à une entité et à un rôle ; clés stockées hachées ; idempotence par en-tête Idempotency-Key ; corrélation par X-Correlation-ID ; erreurs au format problem+json ; mêmes droits qu'à l'écran.

### 7.2 Événements sortants

rating.calculated, case.validated, case.rejected, override.decided, renotation.completed ; signés (HMAC), rejoués en cas d'échec, écrits dans la même transaction que l'opération métier (outbox). Les systèmes aval consomment exclusivement case.validated comme note officielle.

### 7.3 Intégrations avec le SI de la banque

Chaque raccordement est **désactivé au démarrage**, se teste depuis l'écran Raccordements et ne s'active qu'après un test réussi (EF-ADM-12). Les jetons sont des variables d'environnement du serveur, jamais en base ni à l'écran.

| Système | Flux | Paramètres | Usage |
|---|---|---|---|
| T24 — clients (Transact, party/customers) | Lecture à la demande | T24_BASE_URL, T24_CUSTOMER_PATH, T24_FIELD_MAP ; jeton T24_API_TOKEN | Création, rattachement et actualisation de la fiche client |
| T24 — limites (holdings/limits) | Lecture à la demande et à l'ouverture d'un dossier | T24_FACILITIES_PATH, T24_FACILITY_FIELD_MAP | Lignes d'engagement |
| Crédit bureau (Creditinfo Maroc ou autre) | Lecture à la demande | CREDIT_BUREAU_PROVIDER, _BASE_URL, _PATH ; jeton CREDIT_BUREAU_API_TOKEN | Rapport de solvabilité |
| InfoRisque | Document (PDF, image) lu par l'OCR intelligent | — | Fiche juridique |
| OCR intelligent | Appels au fournisseur paramétré | AI_PROVIDER, AI_MODEL, AI_BASE_URL, AI_KEY_ENV | Lecture des pièces, propositions |
| Impayés, dépassements, contentieux (cible) | Lecture quotidienne | À définir avec la DSI | Critères BAM automatiques (lot C), déclenchement de renotation |
| Annuaire d'entreprise (SSO, cible) | Authentification | À définir | Connexion unique, si retenue |

**À fournir par la DSI :** adresses et jetons des API T24 (clients, limites) et du crédit bureau ; exemples de réponses pour caler les correspondances de champs ; exemples de rapports InfoRisque ; extraction du stock pour la reprise.

## 8. Paramètres

| Paramètre | Défaut | Effet |
|---|---|---|
| Circuit de validation | Directeur du centre d'affaires, puis contre-étude | EF-ADM-05 |
| Bilan exigé pour soumettre (grilles standard) | Oui | EF-OCR-05 |
| Seuil de délégation (MAD) et rôle au-delà | 0 (aucun) ; Administrateur | RG-14 |
| Durée de validité d'une note (mois) | 12 | Notes à renouveler |
| Écart maximal d'une dérogation (crans) | 2 | EF-DER-02 |
| Taille maximale d'une pièce (Mo) | 4 | EF-OCR-01 |
| OCR intelligent : activation, fournisseur, modèle, adresse | Désactivé | EF-ADM-09 |
| Échelle de notation | ECH10-2026.1 | RG-20 |
| Paramètres des grilles | Grilles embarquées | RG-21 |

| Raccordements T24, crédit bureau, OCR intelligent | Désactivés | EF-ADM-12 ; activation après test réussi |
| Actualisation T24 à l'ouverture d'un dossier | Fiche et engagements | EF-DOS-07 |
| Portée des chargés d'affaires | Centre entier | EF-PTF-01 |
| Ancienneté maximale du rapport de solvabilité / de la fiche juridique (jours) | 30 / 365 | EF-CLI-07, EF-CLI-08 |
| Rapport de solvabilité à la soumission | Avertissement | EF-CLI-07 |
| Pièces requises manquantes à la soumission | Avertissement | EF-DOS-05 |
| Engagement global : base et pondération du hors bilan | max(autorisé, encours) ; 100 % | RG-24 |
| Effet des familles de critères BAM | 8 / 10 / DEF1 / DEF3 | RG-22 |
| Niveaux de watch list | WL1 8, WL2 9, WL3 10 | RG-23 |
| Seconde validation des levées et de la watch list | Désactivée (rodage) | EF-BAM-02, EF-CLI-10 |
| Seuils des indicateurs de surveillance | Proposés, à arrêter en COPIL | EF-SUR-01 |

Tout changement est réservé à l'administrateur du groupe et journalisé avec la valeur précédente.

## 9. Journal d'audit

Chaque opération produit un événement : acteur, rôle, action, ressource, entité, détail, horodatage, identifiant de corrélation. Actions minimales :

| Domaine | Actions |
|---|---|
| Connexion | LOGIN_SUCCEEDED, LOGIN_FAILED, LOGOUT, PASSWORD_CHANGED |
| Comptes | USER_CREATED, USER_ROLE_CHANGED, USER_ENTITY_CHANGED, USER_FUNCTION_CHANGED, USER_PASSWORD_RESET |
| Référentiels | ENTITY_CREATED, ENTITY_UPDATED, COUNTERPARTY_CREATED, COUNTERPARTY_UPDATED, ECONOMIC_GROUP_CREATED, FX_RATE_CREATED |
| Dossier | CASE_CREATED, CASE_DRAFT_SAVED, CASE_DOCUMENT_ADDED, CASE_SUBMITTED, CASE_STEP_APPROVED, CASE_VALIDATED, CASE_REJECTED, CASE_REOPENED, CASE_CANCELLED |
| OCR intelligent | AI_FINANCIALS_EXTRACTED, AI_PROPOSALS_GENERATED, AI_PROPOSAL_DECIDED |
| Notation, dérogation | RATING_RUN_CREATED, OVERRIDE_REQUESTED, OVERRIDE_APPROVED, OVERRIDE_REJECTED, OVERRIDE_EXPIRED |
| Renotation | RENOTATION_BATCH_CREATED, RENOTATION_BATCH_DONE, RENOTATION_BATCH_CANCELLED, RENOTATION_SCHEDULE_CREATED |
| Paramétrage | SETTINGS_UPDATED, WORKFLOW_CIRCUIT_UPDATED, CASE_PURPOSES_UPDATED, CLASSIFICATION_UPDATED, WATCHLIST_LEVELS_UPDATED, FACILITY_TYPES_UPDATED, SURVEILLANCE_SETTINGS_UPDATED, MODEL_PARAMS_CREATED, MODEL_PARAMS_UPDATED, MODEL_PARAMS_DELETED, échelle |
| Données externes | COUNTERPARTY_CREATED_FROM_T24, COUNTERPARTY_LINKED_TO_T24, COUNTERPARTY_SYNCED_FROM_T24, FACILITIES_SYNCED_FROM_T24, FACILITIES_RECORDED, CREDIT_REPORT_RECORDED, LEGAL_PROFILE_RECORDED, INTEGRATION_TESTED |
| Comités | CLASSIFICATION_LIFT_RECORDED, WATCHLIST_ENTRY_RECORDED, WATCHLIST_LEVEL_CHANGED, WATCHLIST_EXIT_RECORDED, COMMITTEE_DECISION_CONFIRMED, COMMITTEE_DECISION_CANCELLED |
| Reprise | STOCK_IMPORTED |

L'historique d'un dossier est affiché sur sa page ; l'ensemble du journal se consulte dans Administration › Journal d'audit (EF-ADM-14). Le journal est en ajout seul et exporté vers un stockage indépendant.

## 10. Exigences non fonctionnelles

| Code | Exigence |
|---|---|
| ENF-01 Sécurité applicative | Contrôle des droits côté serveur sur chaque action et chaque route ; protection CSRF ; en-têtes de sécurité ; aucune donnée sensible dans les journaux applicatifs ; dépendances maintenues à jour et auditées |
| ENF-02 Cloisonnement | Filtrage par entité au niveau de l'accès aux données, pour l'écran, l'API et les traitements de lot ; tests d'accès croisés entre entités |
| ENF-03 Base de données | PostgreSQL (configuration livrée) ; Oracle possible avec adaptation de la couche d'accès ; comptes propriétaire, migration et applicatif séparés ; pas de DDL ni de TRUNCATE pour le compte applicatif |
| ENF-04 Transactions | Calcul, enregistrement, dossier, journal et événement sortant dans une même transaction ; idempotence ; gestion des décisions concurrentes |
| ENF-05 Performance | Écran affiché en moins de 2 secondes ; aperçu du calcul en moins de 1 seconde ; lecture d'un bilan par OCR intelligent en moins de 60 secondes ; lot de 1 000 clients en moins de 30 minutes |
| ENF-06 Disponibilité | Heures ouvrées ; sauvegarde quotidienne, restauration testée ; objectifs RPO et RTO à fixer par la banque |
| ENF-07 Accessibilité | WCAG 2.1 niveau AA (contrastes, clavier, libellés des champs, lecteurs d'écran) |
| ENF-08 Navigateurs | Versions récentes de Chrome, Edge, Firefox et Safari ; téléphone et tablette (ENF-MOB-01) |
| ENF-09 Langue | Interface en français ; montants et dates au format marocain |
| ENF-10 Charte | Charte du Groupe Banque Populaire ; habillage par entité |
| ENF-11 Exploitabilité | Journaux applicatifs structurés ; supervision (/health) ; migrations versionnées et réversibles ; environnements de développement, recette et production |
| ENF-12 Données personnelles | Conformité à la loi 09-08 ; minimisation des données envoyées à l'OCR intelligent ; hébergement conforme à la politique d'externalisation |

## 11. Recette

### 11.1 Scénarios de bout en bout

1. Création d'un client à partir de ses documents (OCR intelligent), relecture, enregistrement.
2. Ouverture d'un dossier ; ajout des pièces ; lecture du bilan par OCR intelligent ; contrôles ; correction motivée d'un ratio.
3. Propositions de l'OCR intelligent pour la grille ; acceptation et refus ; saisie des critères qualitatifs.
4. Aperçu ; tentative de soumission sans grade (refus motivé) ; complément ; soumission.
5. File « À traiter » du directeur du centre d'affaires ; validation de l'étape ; file de la contre-étude ; validation finale ; note officielle.
6. Rejet à l'étape 1, reprise du dossier, nouvelle soumission ; contributeurs hérités.
7. Contre-étude tentant de décider avant le directeur : refus ; contributeur tentant de valider : refus.
8. Dérogation demandée, approuvée par une seconde personne, expirée.
9. Dossier en devise étrangère : conversion au cours publié ; refus si aucun cours.
10. Renotation par lot d'un groupe d'affaires avec fichier rafraîchi ; matrice de migration ; dossiers de revue.
11. Modification du circuit, de l'échelle et d'une grille par versions datées ; absence d'effet sur les dossiers en cours et sur les notations antérieures.
12. Accès croisés entre deux filiales : données introuvables.
13. Mêmes opérations par l'API : mêmes résultats, mêmes refus.
14. Démarrage sans API : création en saisie minimale, engagements saisis, rapport saisi ; test de connexion puis activation de T24 ; activation refusée sans test.
15. Client créé depuis T24 ; doublon refusé ; ouverture d'un dossier avec actualisation T24 ; T24 coupé : ouverture avec avertissement daté.
16. Rapport de solvabilité ancien : alerte ; rapport lu par l'OCR intelligent ; fiche InfoRisque avec écart de comptes signalé.
17. Pièces requises d'un motif : éléments manquants, pièce typée, avertissement à la soumission.
18. Critère BAM sensible coché par le bilan : note plafonnée à 8 ; levée en comité par la contre-étude ; note recalculée ; rappel au renouvellement.
19. Watch list : entrée WL1, passage en WL2, sortie ; plafond appliqué ; historique conservé.
20. Circuit à niveaux : dossier au-delà du seuil décidé par le responsable de la contre-étude ; avis bloquant d'un centre en délégation restreinte.
21. Mode portefeuille : un chargé d'affaires ne voit que ses clients.
22. Reprise du stock : contrôle à blanc, import, réimport sans effet.
23. Journal d'audit : filtres, export, cloisonnement d'un administrateur d'entité.

### 11.2 Critères de réception

- Tous les scénarios passent sur l'environnement de recette, avec des données représentatives.
- Les cas de calcul de référence sont reproduits à l'identique (5.4).
- Aucune anomalie bloquante ou majeure ouverte ; tests automatisés fournis et exécutés en intégration continue.
- Audit d'accessibilité (AA) et test d'intrusion sans vulnérabilité élevée ouverte.

## 12. Lotissement proposé

Toutes les fonctions décrites sont opérationnelles dans le prototype de référence ; le lotissement ci-dessous organise leur reprise par la DSI.

| Lot | Contenu |
|---|---|
| Lot 1 — Socle | Comptes, profils et fonctions, entités, devises, clients (saisie minimale), dossiers, motifs et pièces requises, bilan (saisie et gabarit Excel), grilles, moteur, critères BAM et levée, aperçu, circuit avis / décision, fiche de notation, journal d'audit |
| Lot 2 — Pilotage | OCR intelligent, dérogations, watch list, module de surveillance, tableau de bord, groupes d'affaires, renotation par lot et planification, reprise du stock, API et webhooks |
| Lot 3 — Raccordements | T24 (clients, limites), crédit bureau, InfoRisque, portefeuille par chargé d'affaires, actualisation à l'ouverture ; mise en service après tests ; flux impayés et contentieux (critères BAM automatiques, lot C) |

## 13. Points à arrêter par la banque

1. Seuils de segmentation TPE, PME, GE.
2. Définition du défaut, de la guérison et de la rechute (DEF1 à DEF3), alignée sur Bank Al-Maghrib.
3. Fonctions et attribution des étapes du circuit ; seuils d'un éventuel comité de crédit.
4. Fournisseur et hébergement de l'OCR intelligent ; types de pièces admis.
5. Effets des critères BAM, niveaux de watch list, seconde validation, seuils des indicateurs de surveillance (proposition COPIL).
6. Listes de pièces requises par motif ; ancienneté maximale des rapports.
7. Activation du mode portefeuille, après renseignement des codes gestionnaires.
8. API T24 (clients, limites) et crédit bureau : adresses, jetons, exemples de réponses ; flux impayés et contentieux ; procès-verbal de recette de chaque raccordement.
9. Base de données cible (PostgreSQL ou Oracle) et environnement d'hébergement.
10. Objectifs de disponibilité, RPO et RTO.
