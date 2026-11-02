# Modélisation statistique de la PD — script Python

Chaîne complète, de l'historique des dossiers à une grille au format de l'outil :
qualité des données, cible de défaut à 12 mois, échantillons développement / test /
hors temps, discrétisation monotone et WoE, sélection des variables, régression
logistique pas à pas, carte de points, calibration (tendance centrale, marge de
prudence, échelle maîtresse) et validation (Gini, KS, Jeffreys, Hosmer-Lemeshow, PSI).

La méthode est décrite en détail dans `docs/13-modelisation-statistique.md` et sa
version Word `docs/modelisation/Guide_modelisation_statistique.docx`.

```
python3 -m pip install -r scripts/modelisation/requirements.txt

# Démonstration sur données SYNTHÉTIQUES (aucune valeur de calibration)
python3 scripts/modelisation/modelisation.py --demo --sortie resultats-demo

# Historique réel
python3 scripts/modelisation/modelisation.py --exporter-config --sortie config
python3 scripts/modelisation/modelisation.py --donnees historique.csv --config config/config.json --sortie resultats

# Noter de nouveaux dossiers avec le modèle estimé
python3 scripts/modelisation/modelisation.py --appliquer resultats/modele.json --donnees nouveaux.csv --sortie notes
```

Format des données : une ligne par contrepartie et par date d'arrêté ; colonnes
`id_contrepartie`, `date_arrete`, `defaut_12m` (ou `date_defaut`), et les variables
candidates (mêmes définitions que les ratios du module Bilan). Voir le § 3 du guide.

Les historiques de dossiers ne doivent pas être versionnés dans ce dépôt (données
confidentielles) : travailler dans un dossier hors dépôt.
