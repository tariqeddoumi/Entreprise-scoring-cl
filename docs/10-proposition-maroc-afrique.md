# Proposition d'évolution du modèle — mieux adapté au Maroc, déployable dans les filiales africaines

**Date :** 27 octobre 2026 · **Version examinée :** moteur 3.0.1, modèles `CORP_STD_V1` et `CORP_TPE_BEHAV_V1` 3.0.0
**Statut :** proposition à instruire. Rien de ce document n'est implémenté.
**Classification :** usage interne

---

## 1. Synthèse

**Le modèle actuel est déjà en grande partie portable.** Ce qui le rend marocain n'est pas son cœur de calcul :
- les grilles sont exprimées en ratios, sans montant en dirhams ;
- le moteur, l'échelle de grades, les règles de couverture, les exceptions et la gouvernance ne dépendent d'aucun pays.

**Ce qui est marocain tient dans cinq référentiels :**
- la segmentation, avec ses seuils en MAD (`src/reference/segmentation.ts`) ;
- le dictionnaire comptable CGNC (`cgnc.ts`) ;
- le référentiel sectoriel NMA 2010 et les douze régions (`sector.ts`) ;
- la politique de défaut, rattachée au corpus Bank Al-Maghrib (`default-policy.ts`) ;
- les identifiants de la contrepartie (ICE, RC, IF) dans le schéma de base.

**La proposition :** un **socle groupe** unique, et des **paquets juridiction** qui portent ces référentiels, pays par pays ou zone par zone. Le Maroc devient le premier paquet. Il doit reproduire exactement les notations actuelles, ce qui se prouve par rejeu.

**À côté de cette architecture, la proposition apporte trois évolutions de fond :**
1. **Un plafond pays.** Le grade d'une entreprise ne peut pas être meilleur que celui de son pays, à quelques crans près. Secondaire au Maroc, la règle devient indispensable dans les pays à risque souverain élevé.
2. **Des critères marocains renforcés :** délais de paiement, dépendance à la commande publique, exposition à l'Union européenne et au mécanisme carbone aux frontières, stress hydrique, écart entre flux et chiffre d'affaires déclaré.
3. **Une stratégie de calibration groupe** pour des filiales qui n'auront pas, seules, assez de défauts pour calibrer.

---

## 2. Périmètre africain visé

Liste indicative, établie sur sources publiques : **à confirmer par la Direction Internationale du groupe.**

| Zone | Pays | Entités du groupe (indicatif) | Superviseur | Référentiel comptable | Devise |
|---|---|---|---|---|---|
| UEMOA | Bénin, Burkina Faso, Côte d'Ivoire, Guinée-Bissau, Mali, Niger, Sénégal, Togo | Réseau Banque Atlantique, BIA Niger | BCEAO, Commission Bancaire de l'UMOA | SYSCOHADA révisé | XOF, ancré sur l'euro |
| CEMAC | Cameroun, Congo, Centrafrique | BICEC, BCI, BPMC | BEAC, COBAC | SYSCOHADA révisé | XAF, ancré sur l'euro |
| Hors zone franc | Guinée | BPMG | BCRG | SYSCOHADA révisé | GNF, flottant |
| Océan Indien | Maurice | BCP Bank (Mauritius) | Bank of Mauritius | IFRS | MUR — anglophone, hors OHADA |

**Ce qui en découle pour la conception :**
- **Superviseurs.** Il y a quatre superviseurs et une monnaie par zone. Un paquet **UEMOA** unique couvre huit pays : même superviseur, même monnaie, même référentiel comptable, avec quelques paramètres nationaux. Le paquet **CEMAC** couvre trois pays.
- **Comptabilité.** SYSCOHADA révisé est commun à l'UEMOA, à la CEMAC et à la Guinée. Un seul dictionnaire comptable OHADA, à côté du dictionnaire CGNC, couvre donc la quasi-totalité du périmètre africain.
- **Maurice** est le cas atypique : IFRS, langue anglaise, corporate plutôt que TPE. Il vaut mieux le traiter en dernier, ou par le seul modèle GE.

---

## 3. Architecture proposée : socle groupe et paquets juridiction

### 3.1 Ce qui reste unique au groupe

| Élément | Pourquoi il doit rester unique |
|---|---|
| Moteur, pipeline en treize étapes, règles de couverture et d'information absente | Une même méthode partout : condition de toute comparaison et de toute validation groupe |
| Domaines D1 à D7, définitions économiques des critères, ancrages qualitatifs | Le jugement d'analyste se forme sur les mêmes repères ; un comité modèles groupe peut les challenger |
| Échelle maîtresse et grades de défaut | Le reporting consolidé, l'IFRS 9 groupe et l'appétit au risque supposent une échelle commune |
| Gouvernance : versions, journal, piste d'audit, quatre yeux, droits d'usage | Exigence groupe, indépendante du pays |

### 3.2 Ce que porte chaque paquet juridiction

| Référentiel | Maroc (existant) | UEMOA / CEMAC / Guinée (à construire) |
|---|---|---|
| Segmentation | Seuils en MAD, date d'effet, statut de source | Seuils en devise locale, issus des définitions nationales de la PME et de la pratique de chaque filiale |
| Dictionnaire comptable | CGNC : EBE, dette nette, fonds propres tangibles… | SYSCOHADA révisé : mêmes grandeurs économiques, autres postes. Le système minimal de trésorerie des très petites entités renvoie au modèle comportemental |
| Nomenclature sectorielle | NMA 2010 × 12 régions | Nomenclatures nationales alignées sur la CITI rév. 4, régions administratives propres |
| Pivot sectoriel groupe | — | **CITI rév. 4 (ISIC), pivot commun.** NMA 2010 et les nomenclatures d'AFRISTAT s'y rattachent, ce qui permet un grade sectoriel comparable au niveau groupe |
| Définition prudentielle du défaut | Corpus BAM | Dispositif prudentiel UMOA (créances en souffrance au-delà de 90 jours, Bâle II/III depuis 2018), dispositif COBAC, BCRG. **Définition groupe unique conservée pour l'IFRS 9 consolidé** ; la classification locale reste un moteur distinct |
| Identifiants | ICE, RC, IF | RCCM (commun OHADA), identifiant fiscal national (NCC, NINEA, NIF…) |
| Données comportementales | Centrale des risques, credit bureaus agréés | Centrale des risques BCEAO/BEAC, bureaux d'information sur le crédit, flux de **mobile money** pour les TPE |
| Scénarios de stress | Sécheresse, choc de taux, change | Cours des matières premières (cacao, coton, or, pétrole), arriérés intérieurs de l'État, insécurité, choc de change pour la Guinée |
| Plafond pays (§ 4.1) | Note souveraine du Maroc | Note de chaque pays, issue de la fonction risque pays du groupe |

### 3.3 Traduction technique

Le dispositif s'y prête déjà en partie :
- les jeux de règles de segmentation sont versionnés, datés et portent une devise ;
- le schéma de base est multi-dialecte, ce qui laisse chaque filiale libre de son moteur de base (D-27 à D-31).

**Le code à adapter :**

1. **Contrepartie.** Ajouter un code pays (ISO 3166) et une entité du groupe. Généraliser les identifiants en liste typée (`ICE`, `RCCM`, `NIF`…) au lieu des colonnes `ice`, `rc` et `fiscalId`.
2. **Paquet juridiction.** Un objet `JurisdictionConfig` versionné, nommé dans chaque instantané comme le sont déjà le modèle et la segmentation, regroupe la segmentation, le dictionnaire comptable, le référentiel sectoriel, la politique de défaut et le plafond pays. Le rejeu d'une notation retrouve ainsi le paquet en vigueur à sa date.
3. **Montants.** Tout montant porte sa devise. Aucune comparaison de seuils entre pays sans conversion datée.
4. **Cloisonnement par entité.** Chaque ligne porte son entité, les rôles sont attribués par entité, et la sécurité au niveau des lignes est filtrée par entité. Le groupe dispose d'une vue consolidée en lecture.
5. **Hébergement et données personnelles.** Chaque pays a sa loi de protection des données (Maroc : loi 09-08 et CNDP ; Côte d'Ivoire, Sénégal et la plupart des pays de l'UEMOA ont leur propre loi et leur autorité). Les transferts transfrontaliers et l'hébergement hors du pays sont à instruire **avant** tout pilote : l'hébergement actuel (Supabase, Vercel) n'est pas présumé acceptable pour une filiale.
6. **Langue.** Le français couvre l'UEMOA, la CEMAC et la Guinée. Maurice demanderait des libellés anglais, à prévoir dans la structure plutôt qu'à rajouter.

**Garde-fou de non-régression.** Le paquet Maroc doit reproduire à l'identique les treize notations V3 de production et les vecteurs de test existants. C'est vérifiable par rejeu et comparaison d'empreintes, comme lors du diagnostic du 1er octobre (`docs/08`).

---

## 4. Évolutions de fond du modèle

### 4.1 Plafond pays — nouvelle exception non compensatoire

**Constat.** Le modèle note une entreprise sans référence au risque de son pays. C'est défendable au Maroc pour un portefeuille domestique. Ce ne l'est plus au Mali, au Niger ou au Burkina Faso, où l'insécurité, les sanctions régionales et les arriérés de l'État ont pesé sur des secteurs entiers. Le critère D4.6 (« exposition pays, change et matières premières », 1 à 1,5 % du poids) ne peut pas porter ce risque à lui seul.

**Proposition.**
- **Règle :** une exception non compensatoire « plafond pays ». Le grade de la contrepartie ne peut être meilleur que le grade pays, plus un nombre de crans fixé par la politique.
- **Grade pays :** il est fourni par la fonction risque pays du groupe, jamais saisi par l'analyste.
- **Endettement en devise :** pour une dette en devise étrangère, le plafond s'appuie sur le risque de transfert et de convertibilité.
- **Dérogation :** elle est possible sur pièces — exportateur encaissant en devises, garantie maison mère hors du pays, fonds logés à l'étranger. Ces motifs ont déjà un mécanisme dans le modèle, le support groupe à quatre conditions (D-43).
- **Conséquence :** l'exception s'ajoute aux quatre exceptions conservées ; son effet est restitué dans `appliedRules`, comme les autres.

**À décider :** ce plafond s'applique-t-il aussi au Maroc ? La recommandation est oui, mais avec un écart de crans large : la note souveraine marocaine est meilleure que la plupart des notes de PME.

### 4.2 Critères marocains renforcés

| Sujet | Constat | Proposition | Critères concernés |
|---|---|---|---|
| **Délais de paiement** | Le crédit interentreprises est la première cause de tension de trésorerie des PME marocaines. La loi 69-21 encadre les délais et sanctionne les retards | Ancrer D1.7 (BFR et cycle de conversion) sur les **délais légaux** : DSO et DPO comparés au plafond légal, au lieu d'une appréciation libre | D1.7, B2.2 |
| **Commande publique** | Une PME dont le client principal est l'État ou un établissement public porte un risque de délai de paiement distinct de sa concentration clients | Distinguer, dans D4.3, la part du chiffre d'affaires réalisée avec la commande publique, et l'ajouter au scénario de stress « allongement des délais publics » | D4.3, D2.5 |
| **Exposition UE et mécanisme carbone** | L'industrie exportatrice (engrais, acier, ciment, aluminium, automobile) est exposée au mécanisme d'ajustement carbone aux frontières de l'UE dans sa phase définitive | Rendre la **porte de matérialité de D7.2** automatique pour ces secteurs exportateurs, dès que le référentiel sectoriel sera alimenté (D-44) | D7.2, D4.6 |
| **Stress hydrique** | La sécheresse pèse sur l'agriculture et l'agro-industrie, avec une forte variation régionale (Souss-Massa, Marrakech-Safi, Oriental) | Matérialité de D7.1 par région et secteur, et scénario « sécheresse prolongée » dans la bibliothèque de stress | D7.1, D2.5 |
| **Écart entre flux et chiffre d'affaires déclaré** | L'économie informelle fausse les états financiers des TPE | Le rapprochement existe dans le modèle comportemental (B5.2, critique). L'étendre au modèle standard pour les TPE et PME, dans D6.3 | D6.3 |
| **Garanties publiques** | Les garanties de type Tamwilcom réduisent la perte, pas la probabilité de défaut | **Règle explicite :** elles n'améliorent jamais le grade, et relèvent de la perte en cas de défaut. Ajouter une mention au support groupe pour éviter tout relèvement opportuniste | Support groupe, D5.4 |
| **Saisonnalité** | Ramadan, campagne agricole et tourisme créent des creux de flux prévisibles | Normaliser B2.2 et B2.4 par la saisonnalité sectorielle connue, pour ne pas pénaliser un creux attendu | B2.2, B2.4 |

Aucun de ces changements ne modifie l'architecture : ce sont des ancrages, des portes de matérialité et des scénarios. Ils passent par une nouvelle version de modèle, validée par le comité modèles.

### 4.3 Adaptations pour les filiales africaines

| Sujet | Proposition |
|---|---|
| **Information financière plus rare** | **Système minimal de trésorerie.** Une très petite entité qui le tient n'a pas de bilan exploitable : elle est routée vers le modèle comportemental, comme le sont déjà les jeunes entreprises, plutôt que notée sur des ratios fragiles. **Seuils de couverture.** Ils sont à recaler par paquet sur la complétude réellement observée (décision banque n° 3) |
| **Mobile money** | Pour les TPE, les flux Orange Money, Wave ou MTN MoMo sont souvent plus riches que le compte bancaire. Ils entrent comme source vérifiée des critères B1.3 et B2.2, sous consentement du client et sous la loi locale de protection des données |
| **Arriérés de l'État** | Même logique que la commande publique au Maroc, avec un poids plus fort dans les scénarios de stress |
| **Matières premières** | Pour les secteurs dépendant du cacao, du coton, de l'or ou du pétrole, un scénario de prix par filière est imposé dans D2.5 |
| **Insécurité** | Elle est portée par le plafond pays (§ 4.1) et par la matérialité de D7.1 et D4.7 par région. Elle n'est jamais une appréciation individuelle de l'analyste |
| **Change** | Négligeable pour XOF et XAF face à l'euro. Matériel pour la Guinée, et pour toute dette en dollars : D4.6 et le stress de change sont alors obligatoires |

---

## 5. Calibration : une stratégie groupe

**Le problème.** Le modèle n'est calibré sur aucun défaut observé, même au Maroc ; la calibration attachée repose sur des données simulées. Une filiale isolée n'aura pas, avant longtemps, assez de défauts pour calibrer ses grades.

**Proposition, par étapes :**

1. **Maroc d'abord.** La calibration est établie sur l'historique marocain, le plus profond. Elle fixe la relation entre score et grade, et entre grade et probabilité de défaut sur l'échelle maîtresse.
2. **Mise en commun par zone.** Les portefeuilles UEMOA sont regroupés pour l'ordonnancement, qui est le pouvoir discriminant. Le niveau moyen de défaut de chaque pays est ajusté séparément par sa tendance centrale.
3. **Portefeuilles à faible nombre de défauts.** Des méthodes adaptées (bornes de Pluto-Tasche, a priori bayésien issu du Maroc) estiment une probabilité de défaut prudente tant que les défauts observés restent rares.
4. **Validation par pays avant tout usage décisionnel.** Pouvoir discriminant (Gini, AUC), stabilité des populations et contre-performance par segment, sur les données du pilote fantôme local.

**Ce qui ne change pas :** aucune probabilité de défaut n'est exposée hors bac à sable tant que cette calibration n'est pas établie. Le garde-fou actuel s'applique tel quel à chaque filiale.

---

## 6. Feuille de route

| Phase | Contenu | Condition de passage |
|---|---|---|
| **P0 — en cours** | Pilote fantôme au Maroc | Seuils de segmentation BAM confirmés ; premières données de complétude |
| **P1 — socle groupe** | Extraction du paquet Maroc ; contrepartie avec pays et entité ; cloisonnement par entité ; montants en devise | Rejeu identique des notations existantes ; aucune régression aux tests et au vérificateur d'alignement |
| **P2 — Maroc renforcé** | Plafond pays ; critères du § 4.2 ; nouvelle version de modèle | Validation du comité modèles ; tests d'ablation des nouvelles exceptions |
| **P3 — première filiale** | Paquet UEMOA (dictionnaire SYSCOHADA, segmentation en XOF, défaut UMOA). Pilote fantôme dans la filiale du plus gros portefeuille entreprises, probablement en Côte d'Ivoire, à confirmer | Hébergement et transfert de données validés localement ; Conformité et Juridique de la filiale ; superviseur informé si requis |
| **P4 — extension** | Autres pays de l'UEMOA par paramètres nationaux, puis paquet CEMAC, puis Guinée | Validation de l'ordonnancement par pays (§ 5) |
| **P5 — calibration groupe** | Probabilités de défaut par grade sur l'échelle maîtresse, table de correspondance des échelles | Validation indépendante groupe ; approbation des instances |

---

## 7. Décisions à prendre par la banque

1. **Périmètre et ordre de déploiement** des filiales, et la filiale pilote.
2. **Plafond pays :** principe, écart de crans autorisé, application ou non au Maroc, source des notes pays.
3. **Définition du défaut :** confirmer la règle « définition groupe unique pour l'IFRS 9 consolidé, classification locale séparée ».
4. **Hébergement et données :** une instance par pays, par zone ou groupe, selon les lois locales de protection des données et de localisation.
5. **Pivot sectoriel CITI rév. 4** et constitution d'un comité sectoriel groupe.
6. **Usage du mobile money** comme source de données : consentement, contrats avec les opérateurs, conformité locale.
7. **Calibration :** acceptation de la mise en commun par zone et des méthodes pour faible nombre de défauts.

---

## 8. Limites de ce document

- Les éléments réglementaires africains cités sont généraux. Leur texte exact, leurs seuils et leur date d'effet sont à établir par la Conformité et le Juridique de chaque filiale, comme les seuils marocains le sont pour Bank Al-Maghrib (décision banque n° 1).
- Le périmètre des filiales est indicatif, sur sources publiques.
- Aucune des évolutions proposées n'est implémentée ni testée. Chacune passera par une version de modèle, son journal de décisions et le vérificateur d'alignement, selon la gouvernance actuelle.

**Sources publiques consultées pour le périmètre et le cadre UEMOA :**
- [FNH — empreinte internationale du groupe BCP](https://fnh.ma/article/actualite-financiere-maroc/bcp-empreinte-internationale)
- [FNH — nouvelle identité des filiales africaines](https://fnh.ma/article/boursenews/le-groupe-bcp-lance-une-nouvelle-identite-visuelle-pour-ses-filiales-africaines)
- [African Markets — acquisition de la BICEC](https://african-markets.com/fr/bourse/bvc/cameroun-la-marocaine-bcp-finalise-l-acquisition-de-la-bicec)
- [African Markets — acquisition de la BCI Congo](https://african-markets.com/fr/bourse/bvc/congo-la-bcp-finalise-l-acquisition-de-100-de-la-bic)
- [KPMG — Bâle II/III et PCB révisé de l'UMOA](https://kpmg.com/sn/fr/home/insights/2018/03/bale1-bale2-pcb.html)
- [Le360 — règles prudentielles UEMOA à partir de 2018](https://afrique.le360.ma/cote-divoire-senegal-mali/economie/2017/04/22/11282-uemoa-banques-de-nouvelles-regles-prudentielles-partir-de-janvier-2018-11282/)
