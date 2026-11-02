#!/usr/bin/env python3
"""Modélisation statistique de la probabilité de défaut des entreprises (Groupe BCP).

Chaîne complète, reproductible et documentée, de l'historique des dossiers à
une grille utilisable par l'outil de notation :

  1. chargement et contrôle qualité des données ;
  2. définition de la cible (défaut à 12 mois) et exclusions ;
  3. échantillons : développement, test (même période) et hors temps ;
  4. discrétisation monotone, poids de l'évidence (WoE) et valeur d'information (IV) ;
  5. sélection des variables : pouvoir prédictif, sens économique, corrélations, VIF ;
  6. régression logistique pas à pas sur les WoE ;
  7. carte de score en points et conversion en grille de l'outil (scores 0/25/50/75/100, poids en points de base) ;
  8. calibration de la PD : tendance centrale de long terme, marge de prudence, échelle maîtresse ;
  9. validation : discrimination (Gini, KS), calibration (binomial, Jeffreys, Hosmer-Lemeshow),
     stabilité (PSI, CSI), concentration, comparaison avec la grille experte ;
 10. livrables : classeur Excel au design Groupe BCP, graphiques, modèle JSON, grille au format de l'outil, rapport.

Usage :
    python3 scripts/modelisation/modelisation.py --donnees historique.csv --sortie resultats/ [--config config.json]
    python3 scripts/modelisation/modelisation.py --demo --sortie resultats-demo/
    python3 scripts/modelisation/modelisation.py --appliquer resultats/modele.json --donnees nouveaux.csv --sortie notes/

« --demo » fabrique un portefeuille SYNTHÉTIQUE pour montrer la chaîne de bout en bout.
Ses résultats illustrent la méthode ; ils ne calibrent rien et ne doivent jamais
servir à noter une contrepartie.

Dépendances : numpy, pandas, scipy, statsmodels, matplotlib, openpyxl (requirements.txt).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import warnings
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np
import pandas as pd
from scipy import stats
from scipy.optimize import brentq

warnings.filterwarnings("ignore", category=RuntimeWarning)

VERSION = "1.1.0"

# --------------------------------------------------------------------------------------
# Configuration par défaut (surchargée par --config)
# --------------------------------------------------------------------------------------

DEFAULT_CONFIG = {
    "colonnes": {
        "identifiant": "id_contrepartie",
        "date_arrete": "date_arrete",
        "cible": "defaut_12m",
        "date_defaut": "date_defaut",
        "defaut_a_l_arrete": "defaut_a_l_arrete",
        "segment": "segment",
        "score_expert": "score_expert",
    },
    # Variables candidates. sens : +1 si une valeur plus élevée augmente le risque,
    # -1 si elle le diminue, 0 si le sens n'est pas fixé a priori (catégorielle ou à vérifier).
    "variables": {
        "fpt_total_bilan": {"libelle": "Fonds propres tangibles / total bilan (%)", "sens": -1, "famille": "Structure", "grille": "D1.4"},
        "dette_nette_ebe": {"libelle": "Dette nette / EBE retraité (x)", "sens": 1, "famille": "Endettement", "grille": "D1.5"},
        "liquidite_generale": {"libelle": "Liquidité générale (x)", "sens": -1, "famille": "Liquidité", "grille": "D1.6"},
        "conversion_cfo_ebe": {"libelle": "Conversion de l'EBE en trésorerie (%)", "sens": -1, "famille": "Flux", "grille": "D1.8"},
        "couverture_interets": {"libelle": "Couverture des intérêts (x)", "sens": -1, "famille": "Service de la dette", "grille": "D2.1"},
        "dscr": {"libelle": "DSCR (x)", "sens": -1, "famille": "Service de la dette", "grille": "D2.2"},
        "fcf_dette": {"libelle": "Free cash-flow / dette brute (%)", "sens": -1, "famille": "Flux", "grille": "D2.3"},
        "gearing": {"libelle": "Endettement / capitaux propres — gearing (x)", "sens": 1, "famille": "Endettement", "grille": None},
        "roe": {"libelle": "Rentabilité des capitaux propres (%)", "sens": -1, "famille": "Rentabilité", "grille": None},
        "marge_ebe": {"libelle": "Marge d'EBE (%)", "sens": -1, "famille": "Rentabilité", "grille": None},
        "dso": {"libelle": "Délai clients (jours)", "sens": 1, "famille": "Exploitation", "grille": None},
        "log_ca": {"libelle": "Taille — logarithme du chiffre d'affaires", "sens": -1, "famille": "Taille", "grille": None},
        "anciennete_ans": {"libelle": "Ancienneté de l'entreprise (ans)", "sens": -1, "famille": "Profil", "grille": None},
        "retards_max_jours": {"libelle": "Retard maximal sur 12 mois (jours)", "sens": 1, "famille": "Comportement", "grille": None},
        "utilisation_autorisations": {"libelle": "Utilisation moyenne des autorisations (%)", "sens": 1, "famille": "Comportement", "grille": None},
        "incidents_12m": {"libelle": "Incidents de paiement sur 12 mois (nombre)", "sens": 1, "famille": "Comportement", "grille": None},
        "secteur": {"libelle": "Secteur d'activité", "sens": 0, "famille": "Profil", "grille": None, "type": "categorielle"},
    },
    "forcer": [],          # variables gardées quoi qu'il arrive (avis métier documenté)
    "exclure": [],         # variables écartées a priori (motif à documenter)
    "echantillons": {"hors_temps_annees": 1, "part_test": 0.30, "graine": 20261102},
    "discretisation": {"classes_initiales": 10, "part_min_classe": 0.05, "manquant_part_min": 0.05},
    "selection": {"iv_min": 0.02, "iv_suspect": 0.50, "correlation_max": 0.60, "vif_max": 5.0,
                  "p_entree": 0.05, "p_sortie": 0.05, "variables_max": 10},
    "points": {"score_reference": 600, "cote_reference": 50, "pdo": 20},
    "calibration": {"nb_grades": 10, "pd_plancher": 0.0003, "pd_plafond_derniere_classe": 0.30,
                    "moc_a": 0.0, "moc_b": 0.0, "niveau_confiance_moc_c": 0.90},
    "validation": {"bootstrap": 500, "seuil_psi_surveillance": 0.10, "seuil_psi_instable": 0.25},
    "grille_outil": {"model_id": "CORP_STAT_V1", "segments": ["TPE", "PME", "GE"]},
}


def deep_update(base: dict, other: dict) -> dict:
    out = json.loads(json.dumps(base))
    for k, v in other.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict) and k != "variables":
            out[k] = deep_update(out[k], v)
        else:
            out[k] = v
    return out


def log(msg: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {msg}", flush=True)


# --------------------------------------------------------------------------------------
# 0. Portefeuille synthétique (mode --demo uniquement)
# --------------------------------------------------------------------------------------

def generer_portefeuille_synthetique(n_entreprises: int = 2600, annees=range(2017, 2026), graine: int = 7) -> pd.DataFrame:
    """Portefeuille fictif : une qualité latente par entreprise, des ratios bruités
    qui en dépendent, un cycle économique annuel et un défaut tiré d'une loi logistique.
    Le gearing est construit très corrélé aux fonds propres tangibles, et la marge
    d'EBE au levier : la sélection doit les écarter pour redondance, comme dans la
    présentation de défense du modèle expert."""
    rng = np.random.default_rng(graine)
    secteurs = ["Agro-industrie", "BTP", "Commerce", "Industrie", "Services", "Tourisme", "Transport"]
    sect_eff = dict(zip(secteurs, [-0.10, 0.45, 0.05, 0.00, -0.15, 0.35, 0.15]))
    cycle = {a: e for a, e in zip(annees, rng.normal(0, 0.18, len(list(annees))))}
    cycle[2020] = cycle.get(2020, 0) + 0.45  # année de crise
    rows = []
    for i in range(n_entreprises):
        q0 = rng.normal()
        seg = rng.choice(["TPE", "PME", "GE"], p=[0.45, 0.43, 0.12])
        sect = rng.choice(secteurs)
        creation = int(rng.integers(1975, 2021))
        debut = int(rng.integers(min(annees), max(annees) + 1))
        for a in annees:
            if a < debut or rng.random() < 0.06:
                continue
            q = 0.85 * q0 + 0.53 * rng.normal()  # qualité de l'exercice
            e = lambda s=1.0: rng.normal(0, s)
            fpt = 22 + 11 * q + e(9)
            gearing = max(0.0, 1.6 - 0.035 * fpt + e(0.45))
            dn_ebe = max(-1.5, 3.2 - 1.1 * q + e(1.4))
            liq = max(0.2, 1.35 + 0.28 * q + e(0.35))
            couv = max(-2.0, 4.5 + 2.6 * q + e(2.4))
            dscr = max(-0.5, 1.35 + 0.42 * q + e(0.42))
            conv = 62 + 14 * q + e(22)
            fcf = 9 + 7 * q + e(9)
            roe = 9 + 5 * q + e(11)
            marge = max(-15.0, 11 + 2.2 * q - 1.2 * (dn_ebe - 3.2) + e(3.5))
            dso = max(5.0, 85 - 9 * q + e(32))
            log_ca = {"TPE": 15.2, "PME": 17.6, "GE": 20.1}[seg] + 0.25 * q + e(0.6)
            anc = max(0, a - creation)
            retards = max(0.0, rng.gamma(1.2, 9) - 6 * q) if rng.random() < 0.55 else 0.0
            util = float(np.clip(68 - 12 * q + e(18), 0, 120))
            incidents = int(rng.poisson(max(0.05, 0.45 - 0.3 * q)))
            logit = (-3.65 - 0.95 * q + 0.012 * retards + 0.18 * incidents + sect_eff[sect]
                     - 0.010 * min(anc, 30) + cycle[a] + {"TPE": 0.25, "PME": 0.0, "GE": -0.35}[seg])
            pd_vraie = 1 / (1 + math.exp(-logit))
            defaut = int(rng.random() < pd_vraie)
            expert = float(np.clip(62 + 9 * q + e(7), 0, 100))
            rows.append({
                "id_contrepartie": f"E{i:05d}", "date_arrete": f"{a}-12-31", "segment": seg, "secteur": sect,
                "defaut_12m": defaut, "defaut_a_l_arrete": 0,
                "fpt_total_bilan": round(fpt, 2), "dette_nette_ebe": round(dn_ebe, 2), "liquidite_generale": round(liq, 2),
                "conversion_cfo_ebe": round(conv, 2), "couverture_interets": round(couv, 2), "dscr": round(dscr, 2),
                "fcf_dette": round(fcf, 2), "gearing": round(gearing, 2), "roe": round(roe, 2), "marge_ebe": round(marge, 2),
                "dso": round(dso, 0), "log_ca": round(log_ca, 3), "anciennete_ans": anc, "retards_max_jours": round(retards, 0),
                "utilisation_autorisations": round(util, 1), "incidents_12m": incidents, "score_expert": round(expert, 2),
            })
            if defaut:
                break  # l'entreprise sort du portefeuille sain après son défaut
    df = pd.DataFrame(rows)
    # Données manquantes réalistes : flux et comportement moins renseignés chez les TPE
    for col, taux in [("conversion_cfo_ebe", 0.08), ("fcf_dette", 0.09), ("dscr", 0.05), ("utilisation_autorisations", 0.12), ("dso", 0.04)]:
        m = rng.random(len(df)) < taux * np.where(df["segment"] == "TPE", 1.8, 0.7)
        df.loc[m, col] = np.nan
    # Quelques dossiers en défaut à la date d'arrêté (à exclure) et un doublon (à détecter)
    idx = rng.choice(len(df), 25, replace=False)
    df.loc[idx, "defaut_a_l_arrete"] = 1
    df = pd.concat([df, df.iloc[[3]]], ignore_index=True)
    return df


# --------------------------------------------------------------------------------------
# 1-2. Chargement, qualité, cible
# --------------------------------------------------------------------------------------

def charger(path: str) -> pd.DataFrame:
    ext = os.path.splitext(path)[1].lower()
    if ext in (".xlsx", ".xls"):
        return pd.read_excel(path)
    with open(path, encoding="utf-8-sig") as fh:
        head = fh.readline()
    sep = ";" if head.count(";") > head.count(",") else ","
    return pd.read_csv(path, sep=sep, decimal="," if sep == ";" else ".", encoding="utf-8-sig")


def preparer(df: pd.DataFrame, cfg: dict) -> tuple[pd.DataFrame, dict]:
    c = cfg["colonnes"]
    journal = {"lignes_lues": int(len(df))}
    if c["date_arrete"] not in df:
        raise SystemExit(f"Colonne obligatoire absente : {c['date_arrete']}")
    df = df.copy()
    iso = df[c["date_arrete"]].astype(str).str.match(r"^\d{4}-").mean() > 0.5
    df["_date"] = pd.to_datetime(df[c["date_arrete"]], errors="coerce", dayfirst=not iso)
    bad_dates = int(df["_date"].isna().sum())
    df = df[df["_date"].notna()]
    df["_annee"] = df["_date"].dt.year
    # Cible : colonne 0/1, ou dérivée de la date de défaut (défaut dans les 12 mois suivant l'arrêté)
    if c["cible"] in df:
        df["_y"] = pd.to_numeric(df[c["cible"]], errors="coerce")
    elif c["date_defaut"] in df:
        dd = pd.to_datetime(df[c["date_defaut"]], errors="coerce", dayfirst=True)
        df["_y"] = ((dd > df["_date"]) & (dd <= df["_date"] + pd.DateOffset(months=12))).astype(float)
    else:
        raise SystemExit(f"Ni « {c['cible']} » ni « {c['date_defaut']} » : impossible de construire la cible.")
    excl = {}
    n = len(df)
    df = df[df["_y"].isin([0, 1])]
    excl["Cible absente ou invalide"] = n - len(df)
    if c["defaut_a_l_arrete"] in df:
        n = len(df)
        df = df[pd.to_numeric(df[c["defaut_a_l_arrete"]], errors="coerce").fillna(0) != 1]
        excl["Déjà en défaut à la date d'arrêté"] = n - len(df)
    n = len(df)
    if c["identifiant"] in df:
        df = df.drop_duplicates(subset=[c["identifiant"], "_annee"], keep="first")
    excl["Doublons (même contrepartie, même année)"] = n - len(df)
    excl["Date d'arrêté illisible"] = bad_dates
    # Dernière observation : le défaut à 12 mois doit être observable en entier
    journal["exclusions"] = excl
    journal["lignes_retenues"] = int(len(df))
    journal["defauts"] = int(df["_y"].sum())
    journal["taux_defaut"] = float(df["_y"].mean())
    df["_y"] = df["_y"].astype(int)
    return df.reset_index(drop=True), journal


def qualite(df: pd.DataFrame, variables: dict) -> pd.DataFrame:
    rows = []
    for v, meta in variables.items():
        if v not in df:
            rows.append({"variable": v, "libellé": meta["libelle"], "présente": "Non"})
            continue
        s = df[v]
        num = meta.get("type") != "categorielle"
        x = pd.to_numeric(s, errors="coerce") if num else s
        r = {"variable": v, "libellé": meta["libelle"], "présente": "Oui", "taux_manquant": float(x.isna().mean())}
        if num:
            q = x.quantile([0.01, 0.5, 0.99])
            r.update({"min": float(x.min()), "p1": float(q[0.01]), "médiane": float(q[0.5]), "p99": float(q[0.99]), "max": float(x.max()),
                      "valeurs_distinctes": int(x.nunique())})
        else:
            r.update({"valeurs_distinctes": int(x.nunique())})
        rows.append(r)
    return pd.DataFrame(rows)


def echantillons(df: pd.DataFrame, cfg: dict) -> pd.DataFrame:
    e = cfg["echantillons"]
    annees = sorted(df["_annee"].unique())
    oot = set(annees[-e["hors_temps_annees"]:]) if e["hors_temps_annees"] > 0 and len(annees) > 2 else set()
    rng = np.random.default_rng(e["graine"])
    df["_ech"] = "Développement"
    df.loc[df["_annee"].isin(oot), "_ech"] = "Hors temps"
    # Test stratifié sur la cible, tiré au niveau de la contrepartie (pas de fuite entre échantillons)
    ident = cfg["colonnes"]["identifiant"]
    ins = df["_ech"] == "Développement"
    if ident in df:
        ids = df.loc[ins].groupby(ident)["_y"].max()
        test_ids = set()
        for y in (0, 1):
            pool = ids[ids == y].index.to_numpy()
            k = int(round(len(pool) * e["part_test"]))
            test_ids |= set(rng.choice(pool, k, replace=False)) if k else set()
        df.loc[ins & df[ident].isin(test_ids), "_ech"] = "Test"
    else:
        for y in (0, 1):
            idx = df.index[ins & (df["_y"] == y)].to_numpy()
            df.loc[rng.choice(idx, int(round(len(idx) * e["part_test"])), replace=False), "_ech"] = "Test"
    return df


# --------------------------------------------------------------------------------------
# 4. Discrétisation, WoE, IV
# --------------------------------------------------------------------------------------

EPS = 0.5  # lissage des effectifs nuls


@dataclass
class Binning:
    variable: str
    categorielle: bool
    sens: int
    bornes: list = field(default_factory=list)          # bornes internes (classes ]b_k ; b_k+1])
    categories: dict = field(default_factory=dict)      # catégorie -> groupe
    woe: dict = field(default_factory=dict)             # étiquette de classe -> WoE
    table: pd.DataFrame | None = None
    iv: float = 0.0
    manquant: str = "classe propre"

    def classe(self, s: pd.Series) -> pd.Series:
        if self.categorielle:
            lab = s.astype("object").map(lambda x: self.categories.get(x, "Autres") if pd.notna(x) else "Manquant")
            return lab
        x = pd.to_numeric(s, errors="coerce")
        edges = [-np.inf] + list(self.bornes) + [np.inf]
        idx = np.searchsorted(np.array(edges[1:-1]), x.to_numpy(), side="left")
        labels = np.array([self.libelle_classe(k) for k in range(len(edges) - 1)], dtype=object)
        out = pd.Series(labels[np.clip(idx, 0, len(labels) - 1)], index=s.index, dtype=object)
        out[x.isna()] = "Manquant"
        return out

    def libelle_classe(self, k: int) -> str:
        edges = [-np.inf] + list(self.bornes) + [np.inf]
        lo, hi = edges[k], edges[k + 1]
        f = lambda v: f"{v:g}"
        if lo == -np.inf:
            return f"≤ {f(hi)}" if hi != np.inf else "Toutes valeurs"
        if hi == np.inf:
            return f"> {f(lo)}"
        return f"]{f(lo)} ; {f(hi)}]"

    def transformer(self, s: pd.Series) -> pd.Series:
        return self.classe(s).map(self.woe).astype(float)


def _stats_classes(lab: pd.Series, y: pd.Series, ordre: list) -> pd.DataFrame:
    t = pd.DataFrame({"c": lab, "y": y}).groupby("c", observed=True)["y"].agg(["count", "sum"]).reindex(ordre).fillna(0)
    t.columns = ["effectif", "defauts"]
    t["sains"] = t["effectif"] - t["defauts"]
    B, G = max(y.sum(), 1), max(len(y) - y.sum(), 1)
    t["part"] = t["effectif"] / len(y)
    t["taux_defaut"] = np.where(t["effectif"] > 0, t["defauts"] / t["effectif"].replace(0, np.nan), np.nan)
    t["pct_defauts"] = (t["defauts"] + EPS) / (B + EPS * len(t))
    t["pct_sains"] = (t["sains"] + EPS) / (G + EPS * len(t))
    t["woe"] = np.log(t["pct_defauts"] / t["pct_sains"])  # convention : WoE > 0 = plus risqué
    t["iv"] = (t["pct_defauts"] - t["pct_sains"]) * t["woe"]
    return t


def discretiser_numerique(x: pd.Series, y: pd.Series, sens: int, cfg: dict, nom: str) -> Binning:
    d = cfg["discretisation"]
    x = pd.to_numeric(x, errors="coerce")
    ok = x.notna()
    xs, ys = x[ok], y[ok]
    qs = np.unique(np.nanquantile(xs, np.linspace(0, 1, d["classes_initiales"] + 1)[1:-1]))
    bornes = sorted({float(f"{b:.3g}") for b in qs})  # bornes arrondies à 3 chiffres significatifs : lisibles dans une grille
    if sens == 0:  # sens libre : celui des données
        rho = stats.spearmanr(xs, ys).statistic if len(xs) > 10 else 0
        sens = 1 if (rho or 0) >= 0 else -1

    def table(b):
        edges = np.array(b)
        k = np.searchsorted(edges, xs.to_numpy(), side="left")
        g = pd.DataFrame({"k": k, "y": ys.to_numpy()}).groupby("k")["y"].agg(["count", "sum"]).reindex(range(len(b) + 1)).fillna(0)
        return g

    # Fusion des classes adjacentes jusqu'à monotonie stricte du taux de défaut dans le sens attendu,
    # effectif minimal et présence de défauts et de sains dans chaque classe.
    nmin = d["part_min_classe"] * len(y)
    while bornes:
        g = table(bornes)
        rate = (g["sum"] / g["count"].replace(0, np.nan)).to_numpy()
        viol = None
        for k in range(len(rate)):
            if g["count"].iat[k] < nmin or g["sum"].iat[k] == 0 or g["sum"].iat[k] == g["count"].iat[k]:
                viol = k if k < len(rate) - 1 else k - 1
                break
        if viol is None:
            for k in range(len(rate) - 1):
                if (rate[k + 1] - rate[k]) * sens <= 0:
                    viol = k
                    break
        if viol is None:
            break
        del bornes[viol]  # fusionne les classes viol et viol+1
    b = Binning(nom, False, sens, [round(v, 6) for v in bornes])
    lab = b.classe(x)
    ordre = [b.libelle_classe(k) for k in range(len(bornes) + 1)]
    has_na = bool((~ok).sum())
    t = _stats_classes(lab, y, ordre + (["Manquant"] if has_na else []))
    if has_na:
        na = t.loc["Manquant"]
        if na["effectif"] < d["manquant_part_min"] * len(y) or na["defauts"] == 0:
            # Prudence : une donnée absente ne vaut jamais mieux que la pire classe observée
            # (même principe que l'outil : information absente = borne basse).
            t.loc["Manquant", "woe"] = t.loc[ordre, "woe"].max()
            b.manquant = "rattaché à la classe la plus risquée (effectif faible)"
        else:
            b.manquant = "classe propre"
    b.woe = t["woe"].to_dict()
    if not has_na:
        b.woe["Manquant"] = float(t["woe"].max())
        b.manquant = "absent du développement : classe la plus risquée"
    b.table = t
    b.iv = float(t["iv"].sum())
    return b


def discretiser_categorielle(x: pd.Series, y: pd.Series, cfg: dict, nom: str) -> Binning:
    d = cfg["discretisation"]
    s = x.astype("object")
    counts = s.value_counts()
    rare = set(counts[counts < d["part_min_classe"] * len(y) / 2].index)
    cats = {c: ("Autres" if c in rare else str(c)) for c in counts.index}
    b = Binning(nom, True, 0, categories=cats)
    lab = b.classe(s)
    ordre = sorted(set(cats.values())) + (["Manquant"] if s.isna().any() else [])
    t = _stats_classes(lab, y, ordre)
    b.woe = t["woe"].to_dict()
    b.woe.setdefault("Manquant", float(t["woe"].max()))
    b.woe.setdefault("Autres", float(t["woe"].max()))
    b.table = t
    b.iv = float(t["iv"].sum())
    return b


# --------------------------------------------------------------------------------------
# Mesures de performance
# --------------------------------------------------------------------------------------

def auc(y, s) -> float:
    y, s = np.asarray(y), np.asarray(s, dtype=float)
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    if n1 == 0 or n0 == 0:
        return float("nan")
    r = stats.rankdata(s)
    return float((r[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def gini(y, s) -> float:
    return 2 * auc(y, s) - 1


def ks(y, s) -> float:
    y, s = np.asarray(y), np.asarray(s, dtype=float)
    o = np.argsort(-s)
    yb = y[o]
    cb = np.cumsum(yb) / max(yb.sum(), 1)
    cg = np.cumsum(1 - yb) / max((1 - yb).sum(), 1)
    return float(np.max(np.abs(cb - cg)))


def gini_bootstrap(y, s, n: int, seed: int = 1) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    y, s = np.asarray(y), np.asarray(s, dtype=float)
    vals = []
    for _ in range(n):
        i = rng.integers(0, len(y), len(y))
        g = gini(y[i], s[i])
        if not math.isnan(g):
            vals.append(g)
    return float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))


def psi(attendu: pd.Series, observe: pd.Series) -> float:
    cats = sorted(set(attendu.dropna()) | set(observe.dropna()), key=str)
    a = attendu.value_counts(normalize=True).reindex(cats).fillna(0) + 1e-4
    o = observe.value_counts(normalize=True).reindex(cats).fillna(0) + 1e-4
    return float(((o - a) * np.log(o / a)).sum())


# --------------------------------------------------------------------------------------
# 5-6. Sélection et régression logistique
# --------------------------------------------------------------------------------------

def logit_fit(X: pd.DataFrame, y: pd.Series):
    import statsmodels.api as sm
    return sm.Logit(y.to_numpy(), sm.add_constant(X, has_constant="add")).fit(disp=0, maxiter=200)


def vif(X: pd.DataFrame) -> dict:
    out = {}
    for c in X.columns:
        others = X.drop(columns=[c])
        if others.shape[1] == 0:
            out[c] = 1.0
            continue
        A = np.column_stack([np.ones(len(X)), others.to_numpy()])
        beta, *_ = np.linalg.lstsq(A, X[c].to_numpy(), rcond=None)
        resid = X[c].to_numpy() - A @ beta
        r2 = 1 - resid.var() / max(X[c].to_numpy().var(), 1e-12)
        out[c] = float(1 / max(1 - r2, 1e-9))
    return out


def selection(dev: pd.DataFrame, binnings: dict, cfg: dict):
    s = cfg["selection"]
    y = dev["_y"]
    W = pd.DataFrame({v: b.transformer(dev[v]) for v, b in binnings.items()})
    decisions = {}
    # (a) pouvoir prédictif et sens économique
    for v, b in binnings.items():
        meta = cfg["variables"][v]
        g = gini(y, W[v])
        sens_ok = True
        if not b.categorielle and meta.get("sens", 0) != 0:
            sens_ok = b.sens == meta["sens"]
        if v in cfg["exclure"]:
            decisions[v] = "Exclue a priori (avis métier)"
        elif b.iv < s["iv_min"] and v not in cfg["forcer"]:
            decisions[v] = f"Non prédictive (IV {b.iv:.3f} < {s['iv_min']})"
        elif not sens_ok:
            decisions[v] = "Sens contraire à l'intuition économique"
        else:
            decisions[v] = "Candidate" + (" — IV élevée, vérifier une fuite d'information" if b.iv > s["iv_suspect"] else "")
        binnings[v].gini_univ = g
    cand = [v for v, d in decisions.items() if d.startswith("Candidate")]
    # (b) corrélations entre WoE : on garde la variable de plus forte IV
    corr = W[cand].corr(method="spearman") if cand else pd.DataFrame()
    for v in sorted(cand, key=lambda v: -binnings[v].iv):
        if not decisions[v].startswith("Candidate"):
            continue
        for w in cand:
            if w != v and decisions[w].startswith("Candidate") and abs(corr.loc[v, w]) > s["correlation_max"] and binnings[w].iv < binnings[v].iv and w not in cfg["forcer"]:
                decisions[w] = f"Redondante avec {v} (corrélation {corr.loc[v, w]:.2f})"
    cand = [v for v in cand if decisions[v].startswith("Candidate")]
    # (c) régression pas à pas (entrée par score de vraisemblance, sortie par p-valeur et signe)
    retenues = [v for v in cfg["forcer"] if v in cand]
    etapes = []
    while len(retenues) < s["variables_max"]:
        best = None
        for v in cand:
            if v in retenues:
                continue
            try:
                m = logit_fit(W[retenues + [v]], y)
            except Exception:
                continue
            p, coef = m.pvalues.iloc[-1], m.params.iloc[-1]
            if p < s["p_entree"] and coef > 0 and (best is None or m.llf > best[1]):
                best = (v, m.llf, p)
        if best is None:
            break
        retenues.append(best[0])
        etapes.append({"étape": len(etapes) + 1, "action": "entrée", "variable": best[0], "log_vraisemblance": round(best[1], 2), "p_valeur": best[2]})
        while True:  # sortie : p-valeur trop élevée ou signe devenu négatif
            m = logit_fit(W[retenues], y)
            pv = m.pvalues.drop("const")
            bad = [v for v in retenues if v not in cfg["forcer"] and (pv[v] > s["p_sortie"] or m.params[v] <= 0)]
            if not bad:
                break
            worst = max(bad, key=lambda v: pv[v])
            retenues.remove(worst)
            etapes.append({"étape": len(etapes) + 1, "action": "sortie", "variable": worst, "log_vraisemblance": round(m.llf, 2), "p_valeur": float(pv[worst])})
    # (d) colinéarité résiduelle
    vifs = vif(W[retenues]) if retenues else {}
    while vifs and max(vifs.values()) > s["vif_max"]:
        worst = max(vifs, key=vifs.get)
        retenues.remove(worst)
        decisions[worst] = f"Écartée : VIF {vifs[worst]:.1f} > {s['vif_max']}"
        vifs = vif(W[retenues])
    for v in cand:
        decisions[v] = "Retenue dans le modèle" if v in retenues else (decisions[v] if not decisions[v].startswith("Candidate") else "Non retenue par la régression pas à pas (apport non significatif)")
    return retenues, decisions, corr, pd.DataFrame(etapes), vifs


# --------------------------------------------------------------------------------------
# 7. Carte de score et grille au format de l'outil
# --------------------------------------------------------------------------------------

def carte_points(model, binnings: dict, retenues: list, cfg: dict) -> pd.DataFrame:
    p = cfg["points"]
    factor = p["pdo"] / math.log(2)
    offset = p["score_reference"] - factor * math.log(p["cote_reference"])
    b0 = model.params["const"]
    n = len(retenues)
    rows = []
    for v in retenues:
        bi = model.params[v]
        for lab, w in binnings[v].woe.items():
            pts = (-(bi * w) - b0 / n) * factor + offset / n
            rows.append({"variable": v, "classe": lab, "woe": w, "points": round(pts)})
    return pd.DataFrame(rows)


def grille_outil(model, binnings: dict, retenues: list, cfg: dict) -> tuple[dict, pd.DataFrame]:
    """Transforme le modèle logistique en grille de l'outil : pour chaque variable,
    score 0-100 par classe (arrondi au palier de 25 que le moteur accepte) et poids
    proportionnel à l'amplitude de sa contribution au logit. Le score de la grille est
    alors une fonction affine décroissante du logit, à l'arrondi des paliers près."""
    amp, rows, crit = {}, [], []
    for v in retenues:
        w = {k: x for k, x in binnings[v].woe.items()}
        contrib = {k: model.params[v] * x for k, x in w.items()}
        lo, hi = min(contrib.values()), max(contrib.values())
        amp[v] = hi - lo
    tot = sum(amp.values()) or 1
    bps = {v: int(round(10000 * amp[v] / tot)) for v in retenues}
    diff = 10000 - sum(bps.values())
    if retenues:
        bps[max(bps, key=bps.get)] += diff
    for v in retenues:
        b = binnings[v]
        contrib = {k: model.params[v] * x for k, x in b.woe.items()}
        lo, hi = min(contrib.values()), max(contrib.values())
        score = {k: (100 * (hi - c) / (hi - lo) if hi > lo else 100) for k, c in contrib.items()}
        palier = {k: int(25 * round(s / 25)) for k, s in score.items()}
        for k in b.woe:
            rows.append({"variable": v, "classe": k, "score_continu": round(score[k], 1), "score_grille": palier[k], "poids_pb": bps[v]})
        meta = cfg["variables"][v]
        entry = {"code": meta.get("grille") or v.upper(), "variable": v, "labelFr": meta["libelle"], "weightsBps": {s: bps[v] for s in cfg["grille_outil"]["segments"]},
                 "unavailableScore": palier["Manquant"] if "Manquant" in palier else 0}
        if b.categorielle:
            entry["type"] = "QUALITATIVE"
            entry["categories"] = [{"valeur": cat, "groupe": grp, "score": palier.get(grp, 0)} for cat, grp in b.categories.items()]
        else:
            edges = [None] + list(b.bornes) + [None]
            bins = []
            for k in range(len(edges) - 1):
                bins.append({"min": edges[k], "max": edges[k + 1], "minInclusive": False, "maxInclusive": edges[k + 1] is not None,
                             "score": palier[b.libelle_classe(k)], "label": b.libelle_classe(k)})
            entry["type"] = "QUANTITATIVE"
            entry["binsBySegment"] = {"ALL": bins}
        crit.append(entry)
    grille = {"modelId": cfg["grille_outil"]["model_id"], "statut": "PROJET — à valider (comité modèles) avant toute publication dans l'outil",
              "genereLe": datetime.now().isoformat(timespec="seconds"), "versionScript": VERSION, "criteres": crit}
    return grille, pd.DataFrame(rows)


def score_grille(df: pd.DataFrame, binnings: dict, gr_rows: pd.DataFrame, col: str = "score_grille") -> pd.Series:
    tot = pd.Series(0.0, index=df.index)
    for v, g in gr_rows.groupby("variable"):
        m = dict(zip(g["classe"], g[col]))
        tot += binnings[v].classe(df[v]).map(m).fillna(0).astype(float) * g["poids_pb"].iat[0] / 10000
    return tot


# --------------------------------------------------------------------------------------
# 8. Calibration et échelle maîtresse
# --------------------------------------------------------------------------------------

def calibrer(df: pd.DataFrame, logit_brut: pd.Series, cfg: dict):
    c = cfg["calibration"]
    par_an = df.groupby("_annee")["_y"].agg(["count", "sum"])
    par_an["taux"] = par_an["sum"] / par_an["count"]
    lra = float(par_an["taux"].mean())  # moyenne des taux annuels : un cycle complet, chaque année pèse autant
    # Décalage de l'ordonnée à l'origine : PD moyenne prédite = tendance centrale de long terme
    lg = logit_brut.loc[df.index]
    f = lambda d: float((1 / (1 + np.exp(-(lg + d)))).mean() - lra)
    delta = brentq(f, -10, 10)
    pd_cal = 1 / (1 + np.exp(-(logit_brut + delta)))  # appliqué à tout le portefeuille
    # Marge de prudence : A (données) et B (méthode) paramétrées, C (erreur d'estimation) mesurée
    T = len(par_an)
    z = stats.norm.ppf(c["niveau_confiance_moc_c"])
    se = float(par_an["taux"].std(ddof=1) / math.sqrt(T)) if T > 1 else 0.0
    moc_c = (z * se / lra) if lra > 0 else 0.0
    moc = c["moc_a"] + c["moc_b"] + moc_c
    return pd_cal, delta, lra, par_an, {"A (déficiences des données)": c["moc_a"], "B (changements de méthode)": c["moc_b"],
                                         f"C (erreur d'estimation, {int(c['niveau_confiance_moc_c'] * 100)} %)": moc_c, "Totale": moc}


def echelle_maitresse(pd_cal: pd.Series, y: pd.Series, moc: float, cfg: dict) -> tuple[pd.DataFrame, list]:
    c = cfg["calibration"]
    n = c["nb_grades"]
    lo = max(c["pd_plancher"], float(pd_cal.quantile(0.01)))
    hi = min(c["pd_plafond_derniere_classe"], float(pd_cal.quantile(0.99)))
    bornes = list(np.geomspace(lo, hi, n + 1)[1:-1])  # bornes géométriques : chaque grade double à peu près le risque
    g = np.searchsorted(bornes, pd_cal.to_numpy(), side="right")
    df = pd.DataFrame({"grade": g, "pd": pd_cal.to_numpy(), "y": y.to_numpy()})
    rows = []
    for k in range(n):
        d = df[df["grade"] == k]
        borne_basse = 0.0 if k == 0 else bornes[k - 1]
        borne_haute = 1.0 if k == n - 1 else bornes[k]
        pd_c = float(d["pd"].mean()) if len(d) else float(math.sqrt(max(borne_basse, 1e-6) * borne_haute))
        rows.append({"grade": str(k + 1), "pd_min": borne_basse, "pd_max": borne_haute, "effectif": int(len(d)), "defauts": int(d["y"].sum()),
                     "taux_observe": float(d["y"].mean()) if len(d) else np.nan, "pd_centrale": pd_c,
                     "pd_retenue": max(c["pd_plancher"], pd_c * (1 + moc))})
    t = pd.DataFrame(rows)
    t["pd_retenue"] = t["pd_retenue"].cummax()  # monotonie stricte de l'échelle
    return t, bornes


def grade_de(pd_cal: pd.Series, bornes: list) -> pd.Series:
    return pd.Series([str(k + 1) for k in np.searchsorted(bornes, pd_cal.to_numpy(), side="right")], index=pd_cal.index)


# --------------------------------------------------------------------------------------
# 9. Validation
# --------------------------------------------------------------------------------------

def tests_calibration(grades: pd.Series, y: pd.Series, echelle: pd.DataFrame) -> pd.DataFrame:
    rows = []
    pdr = dict(zip(echelle["grade"], echelle["pd_retenue"]))
    for gname in echelle["grade"]:
        m = grades == gname
        N, D = int(m.sum()), int(y[m].sum())
        p = pdr[gname]
        if N == 0:
            rows.append({"grade": gname, "effectif": 0, "defauts": 0, "taux_observe": np.nan, "pd_retenue": p, "p_binomial": np.nan, "p_jeffreys": np.nan, "feu": "—"})
            continue
        p_bin = float(stats.binom.sf(D - 1, N, p))  # P(X ≥ D) sous H0 : la PD n'est pas sous-estimée
        p_jef = float(stats.beta.cdf(p, D + 0.5, N - D + 0.5))  # test de Jeffreys (BCE)
        feu = "Vert" if p_jef >= 0.05 else ("Orange" if p_jef >= 0.01 else "Rouge")
        rows.append({"grade": gname, "effectif": N, "defauts": D, "taux_observe": D / N, "pd_retenue": p, "p_binomial": p_bin, "p_jeffreys": p_jef, "feu": feu})
    return pd.DataFrame(rows)


def hosmer_lemeshow(grades: pd.Series, y: pd.Series, pd_grade: dict) -> tuple[float, float, int]:
    stat, k = 0.0, 0
    for g in sorted(set(grades)):
        m = grades == g
        N, D, p = m.sum(), y[m].sum(), pd_grade[g]
        if N == 0 or p <= 0:
            continue
        stat += (D - N * p) ** 2 / (N * p * (1 - p))
        k += 1
    dfree = max(k - 2, 1)
    return float(stat), float(stats.chi2.sf(stat, dfree)), dfree


def herfindahl(grades: pd.Series) -> float:
    p = grades.value_counts(normalize=True)
    return float((p ** 2).sum())


# --------------------------------------------------------------------------------------
# 10. Livrables : graphiques, Excel, JSON, rapport
# --------------------------------------------------------------------------------------

ORANGE, BRUN, GRIS, TINT, TINT2 = "#E37B05", "#462016", "#3D3D3B", "#F2E8DB", "#FBF6F0"


def graphiques(out: str, res: dict) -> dict:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": "#B9A893", "axes.labelcolor": GRIS,
                         "xtick.color": GRIS, "ytick.color": GRIS, "axes.titleweight": "bold", "axes.titlecolor": BRUN,
                         "axes.spines.top": False, "axes.spines.right": False})
    d = os.path.join(out, "graphiques")
    os.makedirs(d, exist_ok=True)
    files = {}
    styles = {"Développement": (ORANGE, "-"), "Test": (BRUN, "--"), "Hors temps": ("#8A7A6A", ":")}

    # Courbe ROC
    fig, ax = plt.subplots(figsize=(5.2, 4.2))
    for ech, (yy, ss) in res["scores_par_ech"].items():
        o = np.argsort(-ss)
        yb = yy[o]
        tpr = np.concatenate([[0], np.cumsum(yb) / yb.sum()])
        fpr = np.concatenate([[0], np.cumsum(1 - yb) / (1 - yb).sum()])
        col, ls = styles[ech]
        ax.plot(fpr, tpr, color=col, ls=ls, lw=2, label=f"{ech} — Gini {gini(yy, ss):.1%}")
    ax.plot([0, 1], [0, 1], color="#BBBBBB", lw=1)
    ax.set(xlabel="Part des sains classés à risque", ylabel="Part des défauts détectés", title="Courbe ROC")
    ax.legend(frameon=False, loc="lower right")
    fig.tight_layout()
    files["roc"] = os.path.join(d, "01_courbe_roc.png")
    fig.savefig(files["roc"], dpi=160)
    plt.close(fig)

    # Courbe CAP
    fig, ax = plt.subplots(figsize=(5.2, 4.2))
    for ech, (yy, ss) in res["scores_par_ech"].items():
        o = np.argsort(-ss)
        cum = np.concatenate([[0], np.cumsum(yy[o]) / yy.sum()])
        x = np.linspace(0, 1, len(cum))
        col, ls = styles[ech]
        ax.plot(x, cum, color=col, ls=ls, lw=2, label=ech)
    yy, _ = res["scores_par_ech"]["Développement"]
    br = yy.mean()
    ax.plot([0, br, 1], [0, 1, 1], color=GRIS, lw=1, ls="-.", label="Modèle parfait")
    ax.plot([0, 1], [0, 1], color="#BBBBBB", lw=1, label="Hasard")
    ax.set(xlabel="Part du portefeuille (du plus risqué au moins risqué)", ylabel="Part des défauts capturés", title="Courbe de puissance (CAP)")
    ax.legend(frameon=False, loc="lower right")
    fig.tight_layout()
    files["cap"] = os.path.join(d, "02_courbe_cap.png")
    fig.savefig(files["cap"], dpi=160)
    plt.close(fig)

    # Valeur d'information
    iv = res["iv"].sort_values("iv")
    fig, ax = plt.subplots(figsize=(6.4, 0.32 * len(iv) + 1.2))
    cols = [ORANGE if r.startswith("Retenue") else ("#C9B79F" if "Redondante" in r else "#DDDDDD") for r in iv["décision"]]
    ax.barh(iv["libellé"], iv["iv"], color=cols)
    ax.axvline(0.02, color=GRIS, lw=0.8, ls=":")
    ax.axvline(0.10, color=GRIS, lw=0.8, ls=":")
    ax.axvline(0.30, color=GRIS, lw=0.8, ls=":")
    ax.set(xlabel="Valeur d'information (IV) — échantillon de développement", title="Pouvoir prédictif des variables")
    ax.text(0.02, len(iv) - 0.4, " faible", fontsize=7, color=GRIS)
    ax.text(0.10, len(iv) - 0.4, " moyen", fontsize=7, color=GRIS)
    ax.text(0.30, len(iv) - 0.4, " fort", fontsize=7, color=GRIS)
    fig.tight_layout()
    files["iv"] = os.path.join(d, "03_valeur_information.png")
    fig.savefig(files["iv"], dpi=160)
    plt.close(fig)

    # WoE des variables retenues
    ret = res["retenues"]
    if ret:
        ncol = 2
        nrow = math.ceil(len(ret) / ncol)
        fig, axes = plt.subplots(nrow, ncol, figsize=(8.6, 2.6 * nrow))
        axes = np.atleast_1d(axes).ravel()
        for ax, v in zip(axes, ret):
            t = res["binnings"][v].table
            ax.bar(range(len(t)), t["taux_defaut"].fillna(0) * 100, color=ORANGE)
            ax.set_xticks(range(len(t)))
            ax.set_xticklabels(t.index, rotation=30, ha="right", fontsize=7)
            ax.set_title(res["cfg"]["variables"][v]["libelle"], fontsize=8.5)
            ax.set_ylabel("Taux de défaut (%)", fontsize=7.5)
        for ax in axes[len(ret):]:
            ax.axis("off")
        fig.tight_layout()
        files["woe"] = os.path.join(d, "04_classes_variables_retenues.png")
        fig.savefig(files["woe"], dpi=160)
        plt.close(fig)

    # Calibration par grade (hors temps si disponible)
    tc = res["calib_test"]
    fig, ax = plt.subplots(figsize=(6.4, 3.8))
    x = np.arange(len(tc))
    ax.bar(x - 0.2, tc["taux_observe"].fillna(0) * 100, 0.4, color=ORANGE, label="Taux de défaut observé")
    ax.bar(x + 0.2, tc["pd_retenue"] * 100, 0.4, color=BRUN, label="PD retenue (avec marge)")
    ax.set_xticks(x)
    ax.set_xticklabels(tc["grade"])
    ax.set_yscale("log")
    ax.set(ylabel="% (échelle logarithmique)", title=f"Calibration par grade — {res['ech_calib']}")
    ax.legend(frameon=False)
    fig.tight_layout()
    files["calibration"] = os.path.join(d, "05_calibration_grades.png")
    fig.savefig(files["calibration"], dpi=160)
    plt.close(fig)

    # Taux de défaut annuels et tendance centrale
    pa = res["par_an"]
    fig, ax = plt.subplots(figsize=(6.4, 3.4))
    ax.bar(pa.index.astype(str), pa["taux"] * 100, color=ORANGE)
    ax.axhline(res["lra"] * 100, color=BRUN, lw=2, label=f"Tendance centrale de long terme : {res['lra']:.2%}")
    ax.set(ylabel="Taux de défaut à 12 mois (%)", title="Taux de défaut annuels")
    ax.legend(frameon=False)
    fig.tight_layout()
    files["annuel"] = os.path.join(d, "06_taux_defaut_annuels.png")
    fig.savefig(files["annuel"], dpi=160)
    plt.close(fig)

    # Répartition par grade : développement vs hors temps (PSI)
    rg = res["repartition"]
    fig, ax = plt.subplots(figsize=(6.4, 3.4))
    x = np.arange(len(rg))
    for i, col in enumerate(rg.columns):
        ax.bar(x + (i - (len(rg.columns) - 1) / 2) * 0.27, rg[col] * 100, 0.27, color=[ORANGE, BRUN, "#B9A893"][i % 3], label=col)
    ax.set_xticks(x)
    ax.set_xticklabels(rg.index)
    ax.set(ylabel="% des dossiers", title=f"Répartition par grade — PSI hors temps {res['psi_score']:.3f}")
    ax.legend(frameon=False)
    fig.tight_layout()
    files["repartition"] = os.path.join(d, "07_repartition_grades.png")
    fig.savefig(files["repartition"], dpi=160)
    plt.close(fig)
    return files


def excel(out: str, res: dict, files: dict) -> str:
    from openpyxl import Workbook
    from openpyxl.drawing.image import Image as XImage
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    thin = Side(style="thin", color="D9C7B0")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    fnt = lambda **k: Font(name="Arial", **{"size": 10, "color": "3D3D3B", **k})
    fl = lambda c: PatternFill("solid", start_color=c, end_color=c)
    wb = Workbook()
    wb.remove(wb.active)

    def sheet(name: str, title: str, sub: str, df: pd.DataFrame | None = None, formats: dict | None = None, image: str | None = None):
        ws = wb.create_sheet(name[:31])
        ws.sheet_view.showGridLines = False
        ws.column_dimensions["A"].width = 2
        width = max(6, (df.shape[1] if df is not None else 6) + 1)
        for col in range(2, width + 1):
            ws.cell(1, col).fill = fl("E37B05")
        ws.cell(1, 2, title).font = fnt(size=14, bold=True, color="FFFFFF")
        ws.row_dimensions[1].height = 32
        ws.cell(2, 2, sub).font = fnt(size=9, italic=True, color="462016")
        r0 = 4
        if df is not None:
            for j, col in enumerate(df.columns):
                c = ws.cell(r0, 2 + j, str(col))
                c.font, c.fill, c.border = fnt(bold=True, color="FFFFFF"), fl("E37B05"), box
                c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                ws.column_dimensions[get_column_letter(2 + j)].width = max(11, min(48, max(len(str(col)), *(len(str(x)) for x in df[col].head(50))) + 2))
            for i, row in enumerate(df.itertuples(index=False)):
                for j, val in enumerate(row):
                    if isinstance(val, (np.floating, float)) and (math.isnan(val) or math.isinf(val)):
                        val = None
                    elif isinstance(val, np.generic):
                        val = val.item()
                    c = ws.cell(r0 + 1 + i, 2 + j, val)
                    c.font, c.border = fnt(), box
                    c.fill = fl("F2E8DB" if i % 2 == 0 else "FBF6F0")
                    fmt = (formats or {}).get(df.columns[j])
                    if fmt:
                        c.number_format = fmt
            ws.freeze_panes = ws.cell(r0 + 1, 2)
            ws.row_dimensions[r0].height = 30
        if image and os.path.exists(image):
            img = XImage(image)
            img.width, img.height = img.width * 0.55, img.height * 0.55
            ws.add_image(img, f"{get_column_letter(width + 2)}4" if df is not None else "B4")
        return ws

    # Synthèse
    syn = pd.DataFrame(res["synthese"], columns=["Indicateur", "Valeur"])
    sheet("Synthèse", "MODÉLISATION STATISTIQUE — SYNTHÈSE", res["avertissement"], syn)
    sheet("Données", "1. QUALITÉ DES DONNÉES", "Taux de manquants et distribution de chaque variable candidate (toutes années).", res["qualite"],
          {"taux_manquant": "0.0%"})
    sheet("Échantillons", "2-3. CIBLE ET ÉCHANTILLONS", "Effectifs, défauts et taux de défaut par échantillon et par année.", res["tab_ech"], {"taux_defaut": "0.00%"},
          files.get("annuel"))
    sheet("IV et sélection", "4-5. POUVOIR PRÉDICTIF ET SÉLECTION", "IV et Gini univarié sur le développement ; décision motivée pour chaque variable.", res["iv"],
          {"iv": "0.000", "gini_univarie": "0.0%"}, files.get("iv"))
    sheet("Classes WoE", "4. CLASSES ET POIDS DE L'ÉVIDENCE", "WoE = ln(% des défauts / % des sains) : positif = classe plus risquée que la moyenne.", res["classes"],
          {"part": "0.0%", "taux_defaut": "0.00%", "woe": "0.000", "iv": "0.0000"}, files.get("woe"))
    sheet("Corrélations", "5. CORRÉLATIONS ENTRE WOE (SPEARMAN)", "Au-delà du seuil, la variable de plus faible IV est écartée.", res["corr"].reset_index().rename(columns={"index": "variable"}), {c: "0.00" for c in res["corr"].columns})
    sheet("Pas à pas", "6. RÉGRESSION PAS À PAS", "Entrée par gain de vraisemblance (p < seuil, coefficient positif) ; sortie si p > seuil ou signe inversé.", res["etapes"], {"p_valeur": "0.0000"})
    sheet("Coefficients", "6. MODÈLE LOGISTIQUE FINAL", "Coefficients sur les WoE (positifs attendus), erreurs-types, p-valeurs, VIF et contribution.", res["coefs"],
          {"coefficient": "0.0000", "erreur_type": "0.0000", "p_valeur": "0.0000", "vif": "0.00", "contribution": "0.0%"})
    sheet("Carte de points", "7. CARTE DE SCORE EN POINTS", f"Score {res['cfg']['points']['score_reference']} pour une cote de {res['cfg']['points']['cote_reference']} sains pour 1 défaut ; +{res['cfg']['points']['pdo']} points = cote doublée.", res["points"], {"woe": "0.000"})
    sheet("Grille outil", "7. GRILLE AU FORMAT DE L'OUTIL", "Score 0-100 par classe arrondi au palier de 25, poids en points de base (somme 10 000). Projet à valider.", res["grille_rows"])
    sheet("Échelle maîtresse", "8. CALIBRATION ET ÉCHELLE MAÎTRESSE", f"Tendance centrale {res['lra']:.2%} ; marge de prudence totale {res['moc']['Totale']:.1%} ; plancher {res['cfg']['calibration']['pd_plancher']:.2%}.", res["echelle"],
          {"pd_min": "0.00%", "pd_max": "0.00%", "taux_observe": "0.00%", "pd_centrale": "0.00%", "pd_retenue": "0.00%"}, files.get("calibration"))
    sheet("Validation", "9. VALIDATION", "Discrimination, calibration, stabilité et concentration par échantillon.", res["validation"], None, files.get("roc"))
    sheet("Tests par grade", f"9. TESTS DE CALIBRATION — {res['ech_calib'].upper()}", "Binomial et Jeffreys (unilatéraux : la PD est-elle sous-estimée ?). Vert ≥ 5 %, orange 1-5 %, rouge < 1 %.", res["calib_test"],
          {"taux_observe": "0.00%", "pd_retenue": "0.00%", "p_binomial": "0.000", "p_jeffreys": "0.000"}, files.get("repartition"))
    sheet("Stabilité", "9. STABILITÉ DES VARIABLES (CSI)", "Indice de stabilité de chaque variable retenue, développement contre hors temps.", res["csi"], {"csi": "0.000"})
    if res.get("benchmark") is not None:
        sheet("Grille experte", "9. COMPARAISON AVEC LA GRILLE EXPERTE", "Pouvoir discriminant du score expert et du modèle statistique sur les mêmes dossiers.", res["benchmark"])
    path = os.path.join(out, "resultats_modelisation.xlsx")
    wb.save(path)
    return path


def rapport_md(out: str, res: dict) -> str:
    L = []
    a = L.append
    a(f"# Rapport de modélisation — {res['cfg']['grille_outil']['model_id']}\n")
    a(f"Généré le {datetime.now():%d/%m/%Y à %H:%M} par `scripts/modelisation/modelisation.py` (version {VERSION}).\n")
    a(f"> {res['avertissement']}\n")
    a("## Synthèse\n\n| Indicateur | Valeur |\n|---|---|")
    for k, v in res["synthese"]:
        a(f"| {k} | {v} |")
    a("\n## Variables\n\n| Variable | IV | Gini univarié | Décision |\n|---|---:|---:|---|")
    for r in res["iv"].itertuples(index=False):
        a(f"| {r.libellé} | {r.iv:.3f} | {r.gini_univarie:.1%} | {r.décision} |")
    a("\n## Modèle final\n\n| Variable | Coefficient | p-valeur | VIF | Contribution |\n|---|---:|---:|---:|---:|")
    for r in res["coefs"].itertuples(index=False):
        vf = "—" if pd.isna(r.vif) else f"{r.vif:.2f}"
        ct = "—" if pd.isna(r.contribution) else f"{r.contribution:.1%}"
        a(f"| {r.libellé} | {r.coefficient:.4f} | {r.p_valeur:.4f} | {vf} | {ct} |")
    a("\n## Échelle maîtresse\n\n| Grade | PD min | PD max | Effectif | Défauts | Taux observé | PD retenue |\n|---|---:|---:|---:|---:|---:|---:|")
    for r in res["echelle"].itertuples(index=False):
        a(f"| {r.grade} | {r.pd_min:.2%} | {r.pd_max:.2%} | {r.effectif} | {r.defauts} | {r.taux_observe:.2%} | {r.pd_retenue:.2%} |")
    a("\n## Validation\n\n| " + " | ".join(res["validation"].columns) + " |\n|" + "---|" * len(res["validation"].columns))
    for r in res["validation"].itertuples(index=False):
        a("| " + " | ".join(str(x) for x in r) + " |")
    path = os.path.join(out, "rapport_modelisation.md")
    open(path, "w", encoding="utf-8").write("\n".join(L) + "\n")
    return path


# --------------------------------------------------------------------------------------
# Orchestration
# --------------------------------------------------------------------------------------

def modeliser(df_brut: pd.DataFrame, cfg: dict, out: str, demo: bool) -> dict:
    os.makedirs(out, exist_ok=True)
    avert = ("DONNÉES SYNTHÉTIQUES — démonstration de la méthode. Ces résultats ne calibrent rien et ne doivent servir à noter aucune contrepartie."
             if demo else "Résultats sur l'historique fourni. Projet à soumettre à la validation indépendante et au comité modèles avant tout usage.")
    log("1-2. Contrôle qualité et construction de la cible")
    variables = {v: m for v, m in cfg["variables"].items() if v in df_brut.columns}
    absentes = [v for v in cfg["variables"] if v not in df_brut.columns]
    if absentes:
        log(f"   variables absentes du fichier, ignorées : {', '.join(absentes)}")
    cfg["variables"] = variables
    qual = qualite(df_brut, variables)
    df, journal = preparer(df_brut, cfg)
    log(f"   {journal['lignes_retenues']} observations, {journal['defauts']} défauts ({journal['taux_defaut']:.2%})")
    log("3. Échantillons développement / test / hors temps")
    df = echantillons(df, cfg)
    tab = df.groupby(["_ech", "_annee"])["_y"].agg(["count", "sum"]).reset_index()
    tab.columns = ["echantillon", "annee", "effectif", "defauts"]
    tab["taux_defaut"] = tab["defauts"] / tab["effectif"]
    dev = df[df["_ech"] == "Développement"]
    log("4. Discrétisation monotone, WoE et IV")
    binnings = {}
    for v, meta in variables.items():
        if meta.get("type") == "categorielle":
            binnings[v] = discretiser_categorielle(dev[v], dev["_y"], cfg, v)
        else:
            binnings[v] = discretiser_numerique(dev[v], dev["_y"], meta.get("sens", 0), cfg, v)
    log("5-6. Sélection des variables et régression logistique pas à pas")
    retenues, decisions, corr, etapes, vifs = selection(dev, binnings, cfg)
    if not retenues:
        raise SystemExit("Aucune variable ne passe la sélection : vérifier la cible et les données.")
    W = lambda d: pd.DataFrame({v: binnings[v].transformer(d[v]) for v in retenues})
    model = logit_fit(W(dev), dev["_y"])
    log(f"   variables retenues : {', '.join(retenues)}")
    std = W(dev).std()
    contrib = (model.params[retenues].abs() * std) / (model.params[retenues].abs() * std).sum()
    coefs = pd.DataFrame({"variable": retenues, "libellé": [variables[v]["libelle"] for v in retenues],
                          "coefficient": model.params[retenues].to_numpy(), "erreur_type": model.bse[retenues].to_numpy(),
                          "p_valeur": model.pvalues[retenues].to_numpy(), "vif": [vifs.get(v, 1.0) for v in retenues], "contribution": contrib.to_numpy()})
    coefs = pd.concat([pd.DataFrame([{"variable": "const", "libellé": "Constante", "coefficient": model.params["const"], "erreur_type": model.bse["const"],
                                      "p_valeur": model.pvalues["const"], "vif": np.nan, "contribution": np.nan}]), coefs], ignore_index=True)
    log("7. Carte de points et grille au format de l'outil")
    points = carte_points(model, binnings, retenues, cfg)
    grille, grille_rows = grille_outil(model, binnings, retenues, cfg)
    log("8. Calibration de la PD et échelle maîtresse")
    df["_logit"] = model.params["const"] + (W(df) * model.params[retenues]).sum(axis=1)
    # Le décalage est estimé sur l'historique hors échantillon hors temps, puis appliqué à tout le portefeuille
    pd_cal, delta, lra, par_an, moc = calibrer(df[df["_ech"] != "Hors temps"], df["_logit"], cfg)
    df["_pd"] = pd_cal
    echelle, bornes = echelle_maitresse(df.loc[df["_ech"] != "Hors temps", "_pd"], df.loc[df["_ech"] != "Hors temps", "_y"], moc["Totale"], cfg)
    df["_grade"] = grade_de(df["_pd"], bornes)
    log("9. Validation")
    p = cfg["points"]
    factor = p["pdo"] / math.log(2)
    offset = p["score_reference"] - factor * math.log(p["cote_reference"])
    df["_score_points"] = (offset - factor * df["_logit"]).round(0)
    df["_score_grille"] = score_grille(df, binnings, grille_rows).round(2)
    df["_score_grille_continu"] = score_grille(df, binnings, grille_rows, "score_continu")
    vals, scores_par_ech = [], {}
    nb = cfg["validation"]["bootstrap"]
    for ech in ["Développement", "Test", "Hors temps"]:
        d = df[df["_ech"] == ech]
        if d.empty or d["_y"].sum() == 0:
            continue
        y, s = d["_y"].to_numpy(), d["_logit"].to_numpy()
        scores_par_ech[ech] = (y, s)
        lo, hi = gini_bootstrap(y, s, nb)
        vals.append({"échantillon": ech, "effectif": len(d), "défauts": int(y.sum()), "taux de défaut": f"{y.mean():.2%}",
                     "Gini modèle": f"{gini(y, s):.1%}", "IC 95 % Gini": f"[{lo:.1%} ; {hi:.1%}]", "KS": f"{ks(y, s):.1%}",
                     "Gini grille (paliers 25)": f"{gini(y, -d['_score_grille'].to_numpy()):.1%}",
                     "Gini des grades": f"{gini(y, d['_grade'].astype(int).to_numpy()):.1%}"})
    validation = pd.DataFrame(vals)
    ech_calib = "Hors temps" if (df["_ech"] == "Hors temps").any() else "Test"
    dc = df[df["_ech"] == ech_calib]
    calib_test = tests_calibration(dc["_grade"], dc["_y"], echelle)
    # Hosmer-Lemeshow sur la PD centrale (justesse, bilatéral) ; Jeffreys sur la PD retenue (prudence, unilatéral)
    hl, hl_p, hl_df = hosmer_lemeshow(dc["_grade"], dc["_y"], dict(zip(echelle["grade"], echelle["pd_centrale"])))
    ref = df[df["_ech"] == "Développement"]
    psi_score = psi(ref["_grade"], dc["_grade"])
    csi = pd.DataFrame([{"variable": v, "libellé": variables[v]["libelle"], "csi": psi(binnings[v].classe(ref[v]), binnings[v].classe(dc[v]))} for v in retenues])
    rep = pd.DataFrame({e: df.loc[df["_ech"] == e, "_grade"].value_counts(normalize=True) for e in ["Développement", "Test", "Hors temps"] if (df["_ech"] == e).any()}).reindex(echelle["grade"]).fillna(0)
    hhi = herfindahl(df.loc[df["_ech"] != "Hors temps", "_grade"])
    bench = None
    se_col = cfg["colonnes"]["score_expert"]
    if se_col in df:
        rows = []
        for ech in ["Développement", "Test", "Hors temps"]:
            d = df[(df["_ech"] == ech) & df[se_col].notna()]
            if d.empty or d["_y"].sum() == 0:
                continue
            rows.append({"échantillon": ech, "dossiers comparés": len(d), "Gini grille experte": f"{gini(d['_y'], -d[se_col]):.1%}",
                         "Gini modèle statistique": f"{gini(d['_y'], d['_logit']):.1%}",
                         "corrélation des rangs": f"{stats.spearmanr(d[se_col], -d['_logit']).statistic:.2f}"})
        bench = pd.DataFrame(rows)
    psi_cfg = cfg["validation"]
    lecture_psi = "stable" if psi_score < psi_cfg["seuil_psi_surveillance"] else ("à surveiller" if psi_score < psi_cfg["seuil_psi_instable"] else "instable")
    feux = calib_test["feu"].value_counts().to_dict()
    synthese = [
        ("Observations retenues", f"{journal['lignes_retenues']} ({journal['defauts']} défauts, {journal['taux_defaut']:.2%})"),
        ("Exclusions", "; ".join(f"{k} : {v}" for k, v in journal["exclusions"].items() if v)),
        ("Période", f"{int(df['_annee'].min())} à {int(df['_annee'].max())} — hors temps : {', '.join(str(a) for a in sorted(df.loc[df['_ech'] == 'Hors temps', '_annee'].unique())) or 'aucun'}"),
        ("Variables candidates / retenues", f"{len(variables)} / {len(retenues)}"),
        ("Variables retenues", ", ".join(variables[v]["libelle"] for v in retenues)),
    ]
    for r in vals:
        synthese.append((f"Gini {r['échantillon'].lower()}", f"{r['Gini modèle']} {r['IC 95 % Gini']} — grille arrondie {r['Gini grille (paliers 25)']}"))
    synthese += [
        ("Tendance centrale de long terme", f"{lra:.2%} (moyenne de {len(par_an)} taux annuels)"),
        ("Marge de prudence", ", ".join(f"{k} {v:.1%}" for k, v in moc.items())),
        (f"Tests de calibration ({ech_calib.lower()})", ", ".join(f"{k} : {v}" for k, v in feux.items()) + f" — Hosmer-Lemeshow (PD centrale) : χ² {hl:.2f}, {hl_df} ddl, p = {hl_p:.3f}"),
        ("Stabilité (PSI des grades, hors temps)", f"{psi_score:.3f} — {lecture_psi}"),
        ("Concentration (Herfindahl des grades)", f"{hhi:.3f}"),
    ]
    if bench is not None and not bench.empty:
        b = bench.iloc[-1]
        synthese.append(("Comparaison grille experte", f"{b['échantillon']} : expert {b['Gini grille experte']} contre statistique {b['Gini modèle statistique']}"))
    iv = pd.DataFrame([{"variable": v, "libellé": variables[v]["libelle"], "famille": variables[v].get("famille", ""), "critère de la grille": variables[v].get("grille") or "—",
                        "iv": b.iv, "gini_univarie": getattr(b, "gini_univ", np.nan), "classes": len(b.table), "traitement du manquant": b.manquant,
                        "décision": decisions[v]} for v, b in binnings.items()]).sort_values("iv", ascending=False)
    classes = pd.concat([b.table.reset_index().rename(columns={"c": "classe", "index": "classe"}).assign(variable=v)[["variable", "classe", "effectif", "defauts", "part", "taux_defaut", "woe", "iv"]]
                         for v, b in binnings.items()], ignore_index=True)
    res = dict(cfg=cfg, avertissement=avert, qualite=qual, tab_ech=tab, iv=iv, classes=classes, corr=corr.round(3), etapes=etapes, coefs=coefs, points=points,
               grille_rows=grille_rows, echelle=echelle, validation=validation, calib_test=calib_test, csi=csi, benchmark=bench, synthese=synthese,
               binnings=binnings, retenues=retenues, scores_par_ech=scores_par_ech, lra=lra, par_an=par_an, moc=moc, ech_calib=ech_calib,
               repartition=rep, psi_score=psi_score)
    log("10. Livrables")
    files = graphiques(out, res)
    xl = excel(out, res, files)
    md = rapport_md(out, res)
    # Modèle sérialisé : tout ce qu'il faut pour noter un nouveau dossier à l'identique
    modele = {"version_script": VERSION, "genere_le": datetime.now().isoformat(timespec="seconds"), "donnees_synthetiques": demo,
              "variables": {v: {"libelle": variables[v]["libelle"], "categorielle": binnings[v].categorielle, "bornes": binnings[v].bornes,
                                "categories": binnings[v].categories, "woe": binnings[v].woe, "coefficient": float(model.params[v])} for v in retenues},
              "constante": float(model.params["const"]), "decalage_calibration": float(delta), "points": cfg["points"],
              "echelle": [{"grade": r.grade, "pd_min": r.pd_min, "pd_max": r.pd_max, "pd_retenue": r.pd_retenue} for r in echelle.itertuples()],
              "bornes_pd": bornes, "tendance_centrale": lra, "marge_prudence": moc}
    json.dump(modele, open(os.path.join(out, "modele.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    grille["donneesSynthetiques"] = demo
    json.dump(grille, open(os.path.join(out, "grille_outil.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    cols = [cfg["colonnes"]["identifiant"], cfg["colonnes"]["date_arrete"], "_ech", "_y", "_score_points", "_score_grille", "_pd", "_grade"]
    df[[c for c in cols if c in df]].rename(columns={"_ech": "echantillon", "_y": "defaut_12m", "_score_points": "score_points", "_score_grille": "score_grille_0_100",
                                                     "_pd": "pd_calibree", "_grade": "grade"}).to_csv(os.path.join(out, "scores.csv"), index=False, encoding="utf-8")
    log(f"   {xl}\n   {md}\n   {os.path.join(out, 'grille_outil.json')}")
    for k, v in synthese:
        print(f"   · {k} : {v}")
    return res


def appliquer(modele_path: str, df: pd.DataFrame, out: str) -> str:
    m = json.load(open(modele_path, encoding="utf-8"))
    logit = pd.Series(m["constante"] + m["decalage_calibration"], index=df.index, dtype=float)
    for v, spec in m["variables"].items():
        b = Binning(v, spec["categorielle"], 0, spec["bornes"], spec["categories"], spec["woe"])
        if v not in df:
            w = pd.Series(max(spec["woe"].values()), index=df.index)  # absente : classe la plus risquée
        else:
            w = b.transformer(df[v]).fillna(max(spec["woe"].values()))
        logit += spec["coefficient"] * w
    pdv = 1 / (1 + np.exp(-logit))
    res = df.copy()
    res["pd_modele"] = pdv
    res["grade"] = grade_de(pdv, m["bornes_pd"])
    res["pd_retenue"] = res["grade"].map({e["grade"]: e["pd_retenue"] for e in m["echelle"]})
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "notes_appliquees.csv")
    res.to_csv(path, index=False, encoding="utf-8")
    if m.get("donnees_synthetiques"):
        print("ATTENTION : modèle estimé sur données synthétiques — notes sans valeur.")
    return path


def main() -> None:
    ap = argparse.ArgumentParser(description="Modélisation statistique de la PD des entreprises — Groupe BCP")
    ap.add_argument("--donnees", help="historique (CSV ; ou ; séparateur, ou Excel)")
    ap.add_argument("--demo", action="store_true", help="portefeuille synthétique de démonstration")
    ap.add_argument("--config", help="fichier JSON qui surcharge la configuration par défaut")
    ap.add_argument("--sortie", required=True, help="dossier des livrables")
    ap.add_argument("--appliquer", metavar="MODELE_JSON", help="noter --donnees avec un modèle déjà estimé")
    ap.add_argument("--exporter-config", action="store_true", help="écrire la configuration par défaut dans --sortie et s'arrêter")
    a = ap.parse_args()
    cfg = DEFAULT_CONFIG
    if a.config:
        cfg = deep_update(cfg, json.load(open(a.config, encoding="utf-8")))
    if a.exporter_config:
        os.makedirs(a.sortie, exist_ok=True)
        json.dump(DEFAULT_CONFIG, open(os.path.join(a.sortie, "config.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(os.path.join(a.sortie, "config.json"))
        return
    if a.appliquer:
        if not a.donnees:
            sys.exit("--appliquer exige --donnees")
        print(appliquer(a.appliquer, charger(a.donnees), a.sortie))
        return
    if a.demo:
        df = generer_portefeuille_synthetique()
        os.makedirs(a.sortie, exist_ok=True)
        df.to_csv(os.path.join(a.sortie, "portefeuille_synthetique.csv"), index=False, encoding="utf-8")
    elif a.donnees:
        df = charger(a.donnees)
    else:
        sys.exit("Indiquer --donnees fichier.csv ou --demo")
    modeliser(df, json.loads(json.dumps(cfg)), a.sortie, a.demo)


if __name__ == "__main__":
    main()
