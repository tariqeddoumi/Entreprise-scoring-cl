# Argumentaire — Conseil d'administration

## Le périmètre exact de la décision, le dispositif de maîtrise, et ce qui reste hors de portée

**Public :** administrateurs, comité des risques, comité d'audit
**Durée de présentation conseillée :** 15 minutes, dont 10 de questions
**Classification :** usage interne

---

> **En une phrase.** Il vous est demandé d'autoriser une expérimentation sans effet client, dont les limites d'usage sont techniquement imposées et non simplement écrites, et dont l'évaluation sera confiée à une revue indépendante avant tout usage contraignant.

---

## 1. Ce que vous approuvez, et ce que vous n'approuvez pas

C'est le point le plus important de cette présentation, et il doit être énoncé en premier.

| Vous approuvez | Vous n'approuvez pas |
|---|---|
| Un pilote en mode fantôme, sur un périmètre fermé | Une mise en production décisionnelle |
| La production de notations **en parallèle** des décisions existantes | Tout octroi, limite, tarification ou délégation automatisés |
| La collecte structurée de données de crédit | Toute utilisation en classification réglementaire ou en IFRS 9 |
| Le mandat d'une revue indépendante | Une qualification de « modèle validé » |
| Un programme de remédiation sous portes de contrôle | Un calendrier de déploiement |

**Aucune décision client n'est affectée pendant le pilote.** La notation est produite, enregistrée et comparée aux décisions prises par les circuits habituels, qui demeurent seuls compétents.

## 2. Le dispositif de maîtrise du risque modèle existe avant le modèle

Un conseil doit se préoccuper moins de la qualité annoncée d'un modèle que de la solidité du dispositif qui l'encadre. Voici ce qui est en place.

### 2.1 Les interdictions sont techniques, pas déclaratives

C'est la différence essentielle avec la version précédente, et c'est ce que le diagnostic indépendant reprochait.

| Interdiction | Comment elle est imposée |
|---|---|
| Aucune probabilité de défaut non calibrée ne circule | Valeur nulle en production ; l'application **refuse de démarrer** si la dérogation de simulation y est activée |
| Aucune décision de crédit déduite d'un grade | Le statut de décision vaut toujours `NOT_EVALUATED` ; l'échelle de notation ne porte plus aucune « décision indicative » |
| Aucune classe réglementaire ni stage IFRS 9 déduits | Statuts correspondants à `NOT_EVALUATED` ; les moteurs n'existent pas |
| Aucune comparaison abusive entre les deux modèles | Chaque modèle porte son échelle propre ; la comparaison est **refusée par le code** tant qu'aucune correspondance n'a été validée |
| Aucune règle ajoutée sans justification | Une exception qui ne déclare pas la contribution centrale du phénomène qu'elle traite **fait échouer le chargement du modèle** |

Un contrôle qu'un opérateur peut contourner par inadvertance n'est pas un contrôle. Ceux-ci ne peuvent pas l'être.

### 2.2 Séparation des responsabilités

- **Dérogations** : maker-checker obligatoire, auteur et approbateur distincts, l'auto-approbation est refusée techniquement, motif codifié, preuve exigée, ampleur plafonnée à deux crans, date d'expiration.
- **Audit** : pour toute écriture critique, l'événement d'audit est inscrit **dans la même transaction** que l'opération. Si l'audit échoue, l'opération est annulée. Aucune opération critique ne peut exister sans sa trace.
- **Identité** : l'identité de l'auteur d'une notation provient toujours du jeton d'authentification, jamais d'un champ de formulaire.

### 2.3 Cycle de vie et droit de suspension

Sept statuts encadrent une version de modèle : brouillon, challenger, validé, approuvé, publié, restreint, retiré. Le statut « restreint » permet de suspendre ou limiter l'usage sur décision, sans suppression — l'historique reste rejouable.

### 2.4 Six portes de décision

Le programme est séquencé en six portes avec critères de passage mesurables. La calibration est en porte 4, les moteurs réglementaires en porte 5, le déploiement en porte 6. **Le conseil conserve un droit de suspension à chaque porte.**

## 3. Un diagnostic indépendant a été commandé, et ses constats traités

C'est, pour un conseil, l'élément de preuve le plus significatif : la fonction de risque modèle a fonctionné avant qu'on le lui demande.

- **Vingt-six constats** relevés : huit critiques, quatorze élevés, quatre moyens.
- **Dix-sept traités dans le code exécuté**, dont **la totalité des huit constats critiques**.
- **Cinq traités partiellement** : la structure et les contrôles existent, le contenu suppose une donnée ou une décision qui n'appartient pas au modèle.
- **Quatre non traités**, tous documentés avec leur motif et leur condition de levée : sécurité d'infrastructure, certification multi-bases sur instances réelles, exploitation, internationalisation.

Le registre complet est disponible. Un point mérite d'être souligné devant un conseil : **le constat le plus grave — la revue indépendante du code — ne peut pas être clos par l'équipe qui a écrit le code.** Il est donc explicitement laissé ouvert, et son traitement vous est demandé.

## 4. Ce que le modèle refuse de faire, et pourquoi c'est rassurant

Un modèle qui produit toujours une réponse est plus dangereux qu'un modèle qui se tait.

- **Il refuse de noter** lorsque moins de 60 % de son poids est porté par une donnée réellement observée. Le score est calculé et conservé pour la surveillance, mais aucun grade n'est prononcé.
- **Il refuse de noter** lorsque la classe de confiance est insuffisante.
- **Il refuse de noter** une entreprise de moins de deux ans sans support groupe robuste : elle est routée vers un traitement dédié, au lieu d'être notée puis plafonnée.
- **Il refuse de démarrer** si sa configuration est incohérente : poids ne totalisant pas 100 %, barème présentant un trou, exception non justifiée.
- **Il refuse de comparer** les grades de deux modèles dont la correspondance n'a pas été établie.

Chacun de ces refus a été ajouté en réponse à un constat du diagnostic.

## 5. Questions que le conseil posera, et réponses

| Question | Réponse |
|---|---|
| « Quelle est notre exposition si le modèle se trompe ? » | En mode fantôme, aucune exposition client : la notation ne décide rien. Le risque résiduel est un coût d'opportunité, pas une perte de crédit |
| « Qui est responsable ? » | Les responsabilités sont réparties : propriétaire de modèle, développement, validation indépendante, comité modèles, autorité de changement, contrôle permanent. Aucune fonction n'est à la fois auteur et approbateur |
| « Comment savez-vous que le modèle fonctionne ? » | Nous savons que la chaîne de traitement est déterministe, reproductible et testée — 165 tests automatisés, aucune divergence entre le code, le contrat d'interface, la base, l'écran et la documentation. Nous **ne savons pas** encore si les grades ordonnent correctement le risque réel : c'est exactement ce que le pilote établira |
| « Le superviseur va-t-il l'accepter ? » | La question ne se pose pas à ce stade : rien dans ce pilote n'est utilisé à des fins réglementaires, donc rien n'appelle une approbation prudentielle. Elle se posera en porte 5 |
| « Pourquoi nous présente-t-on un modèle non calibré ? » | Parce qu'aucune banque ne peut calibrer sans historique, et que l'historique ne se constitue qu'en collectant. Le choix est entre démarrer une collecte structurée, ou rester sans donnée indéfiniment |
| « Que se passe-t-il si nous refusons ? » | La variabilité d'appréciation actuelle perdure, aucune décision passée ne redevient rejouable, et l'horizon d'une probabilité de défaut propre à la banque s'éloigne d'autant |
| « Y a-t-il un risque de réputation ? » | Seulement si le dispositif est présenté au-delà de ce qu'il est. C'est pourquoi la note méthodologique, l'interface et le contrat d'interface portent tous le même avertissement, et pourquoi la probabilité de défaut est techniquement bloquée |
| « Nos données personnelles sont-elles protégées ? » | Le sujet relève du programme de sécurité, explicitement identifié comme **non traité** à ce stade. Le registre des traitements, les bases légales et l'analyse d'impact sont à conduire avant tout usage de production |

## 6. Ce qui reste à décider par les instances

Ces points ne peuvent pas être tranchés par l'équipe projet. Ils sont soumis au comité des risques ou au comité modèles, selon les délégations.

1. **Les seuils de segmentation TPE/PME/GE** — ils restent **non opposables** tant que la lecture du corpus Bank Al-Maghrib applicable n'a pas été validée conjointement par les Risques, la Conformité et le Juridique.
2. **La définition du défaut, de la guérison et de la rechute** — proposition rédigée, durées probatoires à confirmer.
3. **Les seuils de couverture minimale** — à recaler sur la complétude réelle du portefeuille dès les premiers dossiers du pilote.
4. **Le traitement des jeunes entreprises**, aujourd'hui routées hors grille : construire une grille dédiée, ou assumer un traitement expert tracé.
5. **Le maintien des quatre exceptions non compensatoires conservées**, sur tests d'effet marginal.
6. **L'interdiction de toute probabilité de défaut, échelle commune ou usage IFRS 9** avant calibration sur défauts observés et validation indépendante.

## 7. La formulation de résolution proposée

> Le conseil autorise la conduite d'un pilote en mode fantôme du dispositif de notation interne des entreprises, sur un périmètre fermé et sans effet sur les décisions client ; mandate une revue indépendante du code, des configurations et des preuves d'exécution ; confirme l'interdiction de tout usage décisionnel, tarifaire, comptable ou réglementaire jusqu'à calibration sur défauts observés et validation indépendante ; et se réserve un droit de suspension à chacune des six portes du programme.

## 8. Les trois chiffres à retenir

- **Zéro effet client** pendant le pilote, par construction.
- **Huit constats critiques sur huit** traités dans le code, et le neuvième — la revue indépendante — laissé ouvert parce qu'il ne peut pas être clos de l'intérieur.
- **Six portes** de décision, chacune assortie d'un droit de suspension du conseil.
