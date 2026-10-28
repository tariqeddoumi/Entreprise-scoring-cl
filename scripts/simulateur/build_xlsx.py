"""Simulateur Excel de la grille CORP_STD_V1, généré depuis l'export du modèle.

Barèmes, poids, repères et cas exemples viennent du moteur de l'outil : le
classeur ne recopie rien à la main. Régénérer après toute évolution du modèle :

    npx tsx scripts/diagnostics/export-grille-cas.mts /tmp/grille
    python3 scripts/simulateur/build_xlsx.py /tmp/grille docs/simulateur/Simulateur_notation_entreprises.xlsx

puis recalculer le classeur (LibreOffice) et vérifier que la ligne « Contrôle »
affiche « concordant » pour chacun des cas exemples.
"""
import json, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import FormulaRule, CellIsRule
from openpyxl.comments import Comment
from openpyxl.utils import get_column_letter as L

D = sys.argv[1]
grid = json.load(open(f"{D}/grille.json"))
cases = json.load(open(f"{D}/cas.json"))
OUT = sys.argv[2]

ORANGE, BRUN, GRIS, TINT, TINT2, WHITE = "E37B05", "462016", "3D3D3B", "F2E8DB", "FBF6F0", "FFFFFF"
INPUT_FILL, INPUT_FONT = "FDEBD0", "1F3FBF"
F = lambda **k: Font(name="Arial", **{"size": 10, "color": GRIS, **k})
fill = lambda c: PatternFill("solid", start_color=c, end_color=c)
thin = Side(style="thin", color="D9C7B0")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="center")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

wb = Workbook()
SEGS = grid["segments"]  # TPE, PME, GE

def banner(ws, text, sub, width):
    ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=width)
    c = ws.cell(1, 2, text); c.font = F(size=16, bold=True, color=WHITE); c.fill = fill(ORANGE); c.alignment = Alignment(vertical="center", indent=1)
    for col in range(2, width + 1): ws.cell(1, col).fill = fill(ORANGE)
    ws.row_dimensions[1].height = 34
    ws.merge_cells(start_row=2, start_column=2, end_row=2, end_column=width)
    s = ws.cell(2, 2, sub); s.font = F(size=10, italic=True, color=BRUN); s.alignment = Alignment(vertical="center", indent=1, wrap_text=True)
    ws.row_dimensions[2].height = 30
    ws.column_dimensions["A"].width = 2
    ws.sheet_view.showGridLines = False

def head(ws, row, col, labels, widths=None):
    for i, t in enumerate(labels):
        c = ws.cell(row, col + i, t); c.font = F(bold=True, color=WHITE); c.fill = fill(ORANGE); c.alignment = CENTER; c.border = BOX
    if widths:
        for i, w in enumerate(widths): ws.column_dimensions[L(col + i)].width = w

def section(ws, row, col, text, width=6):
    c = ws.cell(row, col, text); c.font = F(size=12, bold=True, color=BRUN)

def inp(c):
    c.fill = fill(INPUT_FILL); c.font = F(color=INPUT_FONT, bold=True); c.border = BOX; c.alignment = CENTER

def cell(ws, r, c, v, **style):
    x = ws.cell(r, c, v); x.font = style.pop("font", F()); x.border = BOX; x.alignment = style.pop("align", WRAP)
    if "bg" in style: x.fill = fill(style.pop("bg"))
    if "fmt" in style: x.number_format = style.pop("fmt")
    return x

# ------------------------------------------------------------------ Paramètres
P = wb.active; P.title = "Paramètres"
banner(P, "PARAMÈTRES DU MODÈLE", "Valeurs du modèle CORP_STD_V1 v%s, reprises du moteur de l'outil. Modifiables pour tester une sensibilité : les cellules sur fond orangé sont utilisées par toutes les formules du simulateur." % grid["version"], 6)
P.column_dimensions["B"].width = 52; P.column_dimensions["C"].width = 14; P.column_dimensions["D"].width = 62
head(P, 4, 2, ["Paramètre", "Valeur", "Source et commentaire"])
params = [
    ("MISSING", "Score d'une donnée absente ou périmée (sur 100)", 25, "Score prudent du modèle (unavailableScore) ; point ouvert D-32 : peut améliorer un critère très mauvais.", "0"),
    ("COV_G", "Couverture observée minimale — global", grid["coverage"]["minGlobalObservedBps"] / 10000, "Part du poids portée par une donnée observée (statut Disponible).", "0%"),
    ("COV_D", "Couverture observée minimale — par domaine", grid["coverage"]["minDomainObservedBps"] / 10000, "Sous ce seuil dans un domaine, aucun grade n'est produit.", "0%"),
    ("W_COMP", "Poids de la complétude dans la confiance", grid["confidence"]["weights"]["completeness"] / 100, "Classe de confiance : informative, ne modifie jamais le grade.", "0%"),
    ("W_FRESH", "Poids de la fraîcheur", grid["confidence"]["weights"]["freshness"] / 100, "", "0%"),
    ("W_REL", "Poids de la fiabilité", grid["confidence"]["weights"]["reliability"] / 100, "", "0%"),
    ("W_PROV", "Poids de la provenance", grid["confidence"]["weights"]["provenance"] / 100, "", "0%"),
    ("CL_A", "Confiance — seuil de la classe A", 85, "Élevée", "0"),
    ("CL_B", "Confiance — seuil de la classe B", 70, "Moyenne", "0"),
    ("CL_C", "Confiance — seuil de la classe C (minimum pour un grade)", 55, "Sous ce seuil (classe U) : aucun grade.", "0"),
    ("NOTCH", "Support groupe — crans maximum", grid["groupSupport"]["maxNotches"], "Si les quatre conditions sont documentées.", "0"),
]
PREF = {}
for i, (k, lab, v, com, fmt) in enumerate(params):
    r = 5 + i
    cell(P, r, 2, lab); x = P.cell(r, 3, v); inp(x); x.number_format = fmt; cell(P, r, 4, com, font=F(size=9, italic=True))
    PREF[k] = f"Paramètres!$C${r}"
r0 = 5 + len(params) + 2
section(P, r0, 2, "Échelle de grades du modèle standard")
head(P, r0 + 1, 2, ["Grade", "Score minimum", "Lecture"])
bands = sorted(grid["grades"], key=lambda b: -(b["minScore"] or 0))
for i, b in enumerate(bands):
    r = r0 + 2 + i
    cell(P, r, 2, b["grade"], font=F(bold=True, color=BRUN)); x = P.cell(r, 3, b["minScore"] or 0); inp(x); cell(P, r, 4, b["labelFr"])
G_FIRST, G_LAST = r0 + 2, r0 + 1 + len(bands)
PREF["GRADES"] = f"Paramètres!$B${G_FIRST}:$B${G_LAST}"
PREF["GMIN"] = f"Paramètres!$C${G_FIRST}:$C${G_LAST}"
r1 = G_LAST + 2
section(P, r1, 2, "Exceptions non compensatoires (plafonds)")
head(P, r1 + 1, 2, ["Exception", "Grade plafond", "Situation"])
CAPROW = {}
for i, cp in enumerate(grid["caps"]):
    r = r1 + 2 + i
    cell(P, r, 2, cp["code"], font=F(bold=True, color=BRUN)); x = P.cell(r, 3, cp["maxGrade"]); inp(x); cell(P, r, 4, cp["labelFr"])
    CAPROW[cp["code"]] = f"Paramètres!$C${r}"

# ------------------------------------------------------------------ Grille
Gs = wb.create_sheet("Grille")
banner(Gs, "GRILLE DE NOTATION — 45 CRITÈRES", "Barèmes des ratios par segment et repères des critères qualitatifs, tels qu'appliqués par le moteur. Ratio « croissant » : plus la valeur est haute, meilleur est le score ; « décroissant » : l'inverse.", 26)
hdr = ["Code", "Domaine", "Critère", "Type", "Unité", "Critique", "Poids TPE", "Poids PME", "Poids GE", "Sens"]
for s in SEGS: hdr += [f"{s} : 100 si", f"{s} : 75 si", f"{s} : 50 si", f"{s} : 25 si"]
hdr += ["Repère 100", "Repère 75", "Repère 50", "Repère 25", "Repère 0"]
head(Gs, 4, 2, hdr)
widths = [7, 7, 40, 11, 7, 8, 8, 8, 8, 11] + [10] * 12 + [34] * 5
for i, w in enumerate(widths): Gs.column_dimensions[L(2 + i)].width = w
Gs.freeze_panes = "E5"
GROW = {}
for i, c in enumerate(grid["criteria"]):
    r = 5 + i; GROW[c["code"]] = r
    bg = TINT if i % 2 == 0 else TINT2
    vals = [c["code"], c["domain"], c["labelFr"], "Ratio" if c["type"] == "QUANTITATIVE" else "Qualitatif", c["unit"], "Oui" if c["critical"] else ""]
    vals += [c["weightsBps"].get(s, 0) / 10000 for s in SEGS]
    direction = ""
    th = {}
    if c["bins"]:
        for s in SEGS:
            bins = c["bins"].get(s) or c["bins"].get("ALL")
            bs = sorted(bins, key=lambda b: -b["score"])
            assert [b["score"] for b in bs] == [100, 75, 50, 25, 0], c["code"]
            if bs[0]["max"] is None:  # croissant : [min ; max[
                d = "Croissant"; t = [b["min"] for b in bs[:4]]
                assert all(b["minInclusive"] for b in bs[:4]), c["code"]
            else:  # décroissant : ]min ; max]
                d = "Décroissant"; t = [b["max"] for b in bs[:4]]
                assert all(b["maxInclusive"] for b in bs[:4]), c["code"]
            direction = d; th[s] = t
    vals.append(direction)
    for s in SEGS:
        t = th.get(s)
        if t:
            op = "≥" if direction == "Croissant" else "≤"
            vals += t
        else:
            vals += ["", "", "", ""]
    anchors = {a["score"]: a["labelFr"] for a in (c["anchors"] or [])}
    vals += [anchors.get(k, "") for k in (100, 75, 50, 25, 0)]
    for j, v in enumerate(vals):
        x = cell(Gs, r, 2 + j, v, bg=bg, font=F(size=9, bold=(j == 0), color=BRUN if j == 0 else GRIS))
        if 6 <= j <= 8: x.number_format = "0.0%"; x.alignment = CENTER
        if 10 <= j <= 21: x.alignment = CENTER
    Gs.row_dimensions[r].height = 42
G_TH = {s: 12 + 4 * k for k, s in enumerate(SEGS)}  # première colonne des seuils de chaque segment (L=12)
G_ANCH = 24  # colonne X : repère 100

# ------------------------------------------------------------------ Cas
C = wb.create_sheet("Cas exemples")
banner(C, "CAS EXEMPLES — ENTREPRISES FICTIVES", "Saisies des cas présentés au management. Choisissez un cas dans le simulateur (cellule « Cas chargé ») pour le rejouer ; la dernière partie donne le résultat calculé par le moteur de l'outil, pour contrôle.", 3 + len(cases))
C.column_dimensions["B"].width = 16; C.column_dimensions["C"].width = 46
for k in range(len(cases)): C.column_dimensions[L(4 + k)].width = 22
CASE_NAMES = [f"{c['id']} — {c['nom']}" for c in cases]
head(C, 4, 2, ["Clé", "Saisie"] + CASE_NAMES)
crow = 5
CASEROW = {}

def case_line(key, label, values, fmt=None):
    global crow
    cell(C, crow, 2, key, font=F(size=9, color="8A7A6A")); cell(C, crow, 3, label)
    for k, v in enumerate(values):
        x = cell(C, crow, 4 + k, v, align=CENTER, bg=TINT2)
        if fmt: x.number_format = fmt
    CASEROW[key] = crow; crow += 1

yn = lambda b: "Oui" if b else "Non"
case_line("profil", "Profil", [c["profilFr"] for c in cases])
for k in range(len(cases)): C.cell(CASEROW["profil"], 4 + k).alignment = WRAP
C.row_dimensions[CASEROW["profil"]].height = 70
case_line("nom", "Contrepartie", [c["nom"] for c in cases])
case_line("segment", "Segment", ["PME"] * len(cases))
case_line("mat_phys", "Risque climatique physique matériel", [yn((c.get("materiality") or {}).get("esgPhysicalMaterial")) for c in cases])
case_line("mat_trans", "Risque de transition matériel", [yn((c.get("materiality") or {}).get("esgTransitionMaterial")) for c in cases])
for key, lab, fld in [("conf_comp", "Confiance — complétude", "completeness"), ("conf_fresh", "Confiance — fraîcheur", "freshness"), ("conf_rel", "Confiance — fiabilité", "reliability"), ("conf_prov", "Confiance — provenance", "provenance")]:
    case_line(key, lab, [(c.get("confidence") or {"completeness": 100, "freshness": 100, "reliability": 75, "provenance": 75})[fld] for c in cases])
FLAG_OF = {"BASE_DSCR_BELOW_1": "baseDscrBelow1", "GOING_CONCERN_UNCERTAINTY": "goingConcernUncertainty", "EBITDA_NEGATIVE_2_OF_3": "ebitdaNegative2Of3", "GROUP_FILE_INCOMPLETE": "groupFileIncomplete"}
for cp in grid["caps"]:
    case_line(cp["code"], f"{cp['code']} — {cp['labelFr']}", [yn((c.get("flags") or {}).get(FLAG_OF.get(cp["trigger"], ""))) for c in cases])
BLOCK_RF = [r["code"] for r in grid["redFlags"] if r["level"] == "BLOCK"]
case_line("rf_block", "Red flag conformité bloquant (" + ", ".join(BLOCK_RF) + ")", [yn(any(x in BLOCK_RF for x in (c.get("redFlags") or []))) for c in cases])
case_line("rf_refer", "Red flag à revoir (alerte ou contrôle de défaut)", [yn(any(x not in BLOCK_RF for x in (c.get("redFlags") or []))) for c in cases])
case_line("default", "Défaut constaté", [yn(c.get("defaultTriggered")) for c in cases])
case_line("def_grade", "Grade de défaut", ["DEF1"] * len(cases))
case_line("gs_claim", "Support groupe demandé", [yn((c.get("groupSupport") or {}).get("claimed")) for c in cases])
for key, lab in [("gs_cap", "Capacité du garant documentée"), ("gs_will", "Volonté de soutien démontrée"), ("gs_legal", "Engagement juridiquement contraignant"), ("gs_funds", "Transférabilité des fonds établie")]:
    case_line(key, lab, ["Non"] * len(cases))
case_line("gs_notch", "Crans demandés", [0] * len(cases))
crit_first_case_row = crow
for cr in grid["criteria"]:
    vals_s, vals_v = [], []
    for c in cases:
        a = c["answers"].get(cr["code"])
        gated = cr["gate"] and not (c.get("materiality") or {}).get({"esgPhysicalMaterial": "esgPhysicalMaterial", "esgTransitionMaterial": "esgTransitionMaterial"}[cr["gate"]])
        if a == "MISSING" or a is None: vals_s.append("Manquante"); vals_v.append("")
        else: vals_s.append("Disponible"); vals_v.append(a)
    case_line(f"S_{cr['code']}", f"{cr['code']} — statut", vals_s)
    case_line(f"V_{cr['code']}", f"{cr['code']} — valeur ({cr['unit'] or 'score 0-100'})", vals_v)
crow += 1
section(C, crow, 2, "Résultat calculé par le moteur de l'outil (référence de contrôle)"); crow += 1
LABEL_STATUS = {"RATED": "Noté", "DEFAULTED": "Défaut", "NO_RATING_INSUFFICIENT_DATA": "Pas de grade"}
case_line("ref_status", "Statut", [LABEL_STATUS.get(c["result"]["ratingStatus"], c["result"]["ratingStatus"]) for c in cases])
case_line("ref_score", "Score brut", [round(c["result"]["rawScore"], 2) if c["result"]["rawScore"] is not None else "" for c in cases], "0.00")
case_line("ref_engine", "Grade issu du score", [c["result"]["engineGrade"] or "—" for c in cases])
case_line("ref_final", "Grade final", [c["result"]["finalGrade"] or "—" for c in cases])
case_line("ref_cov", "Couverture observée", [c["result"]["coveragePct"] / 100 for c in cases], "0.0%")
case_line("ref_expl", "Explication du moteur", [c["result"]["explanationFr"] for c in cases])
for k in range(len(cases)): C.cell(CASEROW["ref_expl"], 4 + k).alignment = WRAP
C.row_dimensions[CASEROW["ref_expl"]].height = 150
C.freeze_panes = "D5"
CASE_RANGE = lambda key: f"'Cas exemples'!$D${CASEROW[key]}:${L(3 + len(cases))}${CASEROW[key]}"

# ------------------------------------------------------------------ Simulateur
S = wb.create_sheet("Simulateur", 0)
banner(S, "SIMULATEUR DE NOTATION — MODÈLE STANDARD ENTREPRISES", f"Modèle {grid['modelId']} v{grid['version']}. Saisissez dans les cellules sur fond orangé (texte bleu), ou chargez un cas exemple. Les calculs reproduisent le moteur de l'outil ; seuls les résultats de l'outil font foi.", 17)
cw = {"B": 9, "C": 9, "D": 44, "E": 10, "F": 7, "G": 8, "H": 13, "I": 13, "J": 13, "K": 13, "L": 10, "M": 10, "N": 10, "O": 10, "P": 13, "Q": 48}
for k, v in cw.items(): S.column_dimensions[k].width = v

# Choix du cas
cell(S, 4, 2, "Cas chargé", font=F(bold=True, color=BRUN)); S.merge_cells("B4:C4")
x = S.cell(4, 4, "Saisie libre"); inp(x)
cell(S, 4, 5, "« Saisie libre » : vos saisies sont utilisées. Un cas exemple remplace toutes les saisies par celles du cas (colonne « Retenu »).", font=F(size=9, italic=True)); S.merge_cells("E4:Q4")
dv_case = DataValidation(type="list", formula1='"' + ",".join(["Saisie libre"] + CASE_NAMES) + '"', allow_blank=False); S.add_data_validation(dv_case); dv_case.add("D4")
CIDX = "$S$4"  # index du cas (0 = saisie libre)
S["S4"] = f'=IF($D$4="Saisie libre",0,MATCH($D$4,\'Cas exemples\'!$D$4:${L(3 + len(cases))}$4,0))'
S["S4"].font = F(color="AAAAAA")

dv_yn = DataValidation(type="list", formula1='"Oui,Non"'); S.add_data_validation(dv_yn)
dv_seg = DataValidation(type="list", formula1='"' + ",".join(SEGS) + '"'); S.add_data_validation(dv_seg)
dv_conf = DataValidation(type="list", formula1='"100,75,50,25,0"'); S.add_data_validation(dv_conf)
dv_def = DataValidation(type="list", formula1='"DEF1,DEF2,DEF3"'); S.add_data_validation(dv_def)
dv_notch = DataValidation(type="list", formula1='"0,1,2"'); S.add_data_validation(dv_notch)
dv_status = DataValidation(type="list", formula1='"Disponible,Estimée,Manquante"'); S.add_data_validation(dv_status)
dv_anchor = DataValidation(type="list", formula1='"100,75,50,25,0"'); S.add_data_validation(dv_anchor)

section(S, 6, 2, "1. Cadrage du dossier")
head(S, 7, 2, ["Élément", "", "", "Saisie", "Retenu"])
S.merge_cells("B7:D7")
cad = [("nom", "Contrepartie", "Entreprise exemple", None),
       ("segment", "Segment (TPE, PME, GE)", "PME", dv_seg),
       ("mat_phys", "Risque climatique physique matériel ? (sinon D7.1 écarté, poids vers D7.3)", "Non", dv_yn),
       ("mat_trans", "Risque de transition matériel ? (sinon D7.2 écarté, poids vers D7.4)", "Non", dv_yn),
       ("conf_comp", "Confiance — complétude du dossier (0 à 100)", 100, dv_conf),
       ("conf_fresh", "Confiance — fraîcheur des données", 100, dv_conf),
       ("conf_rel", "Confiance — fiabilité des sources", 75, dv_conf),
       ("conf_prov", "Confiance — provenance (certifiée, déclarative…)", 75, dv_conf)]
cad += [(cp["code"], f"Exception {cp['code']} — {cp['labelFr']}", "Non", dv_yn) for cp in grid["caps"]]
cad += [("rf_block", "Red flag conformité bloquant (" + ", ".join(BLOCK_RF) + ")", "Non", dv_yn),
        ("rf_refer", "Red flag à revoir (retards 31-89 j, covenant rompu, litige…)", "Non", dv_yn),
        ("default", "Défaut constaté (impayé > 90 j, restructuration, procédure)", "Non", dv_yn),
        ("def_grade", "Grade de défaut (DEF1, DEF2, DEF3)", "DEF1", dv_def),
        ("gs_claim", "Support groupe demandé", "Non", dv_yn),
        ("gs_cap", "Support — capacité du garant documentée", "Non", dv_yn),
        ("gs_will", "Support — volonté de soutien démontrée", "Non", dv_yn),
        ("gs_legal", "Support — engagement juridiquement contraignant", "Non", dv_yn),
        ("gs_funds", "Support — transférabilité des fonds établie", "Non", dv_yn),
        ("gs_notch", "Support — crans demandés (0 à 2)", 0, dv_notch)]
R = {}
for i, (key, lab, default, dv) in enumerate(cad):
    r = 8 + i
    cell(S, r, 2, lab); cell(S, r, 3, ""); cell(S, r, 4, "")
    S.merge_cells(start_row=r, start_column=2, end_row=r, end_column=4)
    x = S.cell(r, 5, default); inp(x)
    if dv: dv.add(f"E{r}")
    f = cell(S, r, 6, f"=IF({CIDX}=0,E{r},INDEX({CASE_RANGE(key)},1,{CIDX}))", align=CENTER, font=F(bold=True, color=BRUN), bg=TINT2)
    S.merge_cells(start_row=r, start_column=6, end_row=r, end_column=7)
    R[key] = f"$F${r}"
cad_end = 8 + len(cad) - 1
SEGIDX = "$S$5"
S["S5"] = f'=MATCH({R["segment"]},{{"{SEGS[0]}","{SEGS[1]}","{SEGS[2]}"}},0)'
S["S5"].font = F(color="AAAAAA")

# Résultats (à droite du cadrage, colonnes I à Q)
res_r = 7
head(S, res_r, 9, ["Résultat", "", "", "", "Valeur"]); S.merge_cells(start_row=res_r, start_column=9, end_row=res_r, end_column=12)
S.merge_cells(start_row=res_r, start_column=13, end_row=res_r, end_column=17)
results = []

def result(key, label, formula, fmt=None, big=False):
    r = res_r + 1 + len(results)
    cell(S, r, 9, label, font=F(bold=True, color=BRUN)); S.merge_cells(start_row=r, start_column=9, end_row=r, end_column=12)
    x = cell(S, r, 13, formula, align=Alignment(horizontal="left", vertical="center", wrap_text=True, indent=1),
             font=F(size=14 if big else 10, bold=True, color=ORANGE if big else GRIS), bg=TINT if big else TINT2)
    for col in range(14, 18): S.cell(r, col).border = BOX
    S.merge_cells(start_row=r, start_column=13, end_row=r, end_column=17)
    if fmt: x.number_format = fmt
    if big: S.row_dimensions[r].height = 26
    results.append(key); R[key] = f"$M${r}"
    return r

# Tableau des critères
T0 = cad_end + 3
section(S, T0, 2, "2. Critères — saisie et calcul")
TH = T0 + 1
head(S, TH, 2, ["Code", "Domaine", "Critère", "Type", "Unité", "Critique", "Statut saisi", "Valeur saisie", "Statut retenu", "Valeur retenue", "Score", "Poids nominal", "Poids effectif", "Poids observé", "Contribution", "Barème ou repère retenu"])
S.row_dimensions[TH].height = 30
first = TH + 1
crit = grid["criteria"]
rowof = {c["code"]: first + i for i, c in enumerate(crit)}
last = first + len(crit) - 1
# colonnes de calcul masquées : S..V seuils, W sens, X unavailable, Y gated, Z score*poids
for col, w in zip("STUVWXYZ", [8] * 8): S.column_dimensions[col].width = w
for i, c in enumerate(crit):
    r = rowof[c["code"]]; g = GROW[c["code"]]; bg = TINT if i % 2 == 0 else TINT2
    ratio = c["type"] == "QUANTITATIVE"
    for j, v in enumerate([c["code"], c["domain"], c["labelFr"], "Ratio" if ratio else "Qualitatif", c["unit"], "Oui" if c["critical"] else ""]):
        cell(S, r, 2 + j, v, bg=bg, font=F(size=9, bold=(j == 0 or (j == 5 and c["critical"])), color=BRUN if j == 0 else ("B3261E" if j == 5 else GRIS)), align=CENTER if j != 2 else WRAP)
    # saisies : profil de base (cas A) pour démarrer
    base = cases[0]["answers"][c["code"]]
    xs = S.cell(r, 8, "Disponible"); inp(xs); dv_status.add(f"H{r}")
    xv = S.cell(r, 9, "" if base == "MISSING" else base); inp(xv)
    if not ratio: dv_anchor.add(f"I{r}")
    cell(S, r, 10, f"=IF({CIDX}=0,H{r},INDEX({CASE_RANGE('S_' + c['code'])},1,{CIDX}))", align=CENTER, bg=bg)
    cell(S, r, 11, f"=IF({CIDX}=0,IF(I{r}=\"\",\"\",I{r}),IF(INDEX({CASE_RANGE('V_' + c['code'])},1,{CIDX})=\"\",\"\",INDEX({CASE_RANGE('V_' + c['code'])},1,{CIDX})))", align=CENTER, bg=bg)
    # seuils pour le segment retenu
    if ratio:
        for k, col in enumerate("STUV"):
            S[f"{col}{r}"] = f"=INDEX(Grille!$L${g}:$W${g},1,({SEGIDX}-1)*4+{k + 1})"
        S[f"W{r}"] = f"=Grille!$K${g}"
    # indisponible ; écarté (matérialité)
    S[f"X{r}"] = f'=IF(OR(J{r}="Manquante",K{r}=""),1,0)'
    if c["gate"] == "esgPhysicalMaterial": S[f"Y{r}"] = f'=IF({R["mat_phys"]}="Oui",0,1)'
    elif c["gate"] == "esgTransitionMaterial": S[f"Y{r}"] = f'=IF({R["mat_trans"]}="Oui",0,1)'
    else: S[f"Y{r}"] = 0
    if ratio:
        up = f"IF(K{r}>=S{r},100,IF(K{r}>=T{r},75,IF(K{r}>=U{r},50,IF(K{r}>=V{r},25,0))))"
        dn = f"IF(K{r}<=S{r},100,IF(K{r}<=T{r},75,IF(K{r}<=U{r},50,IF(K{r}<=V{r},25,0))))"
        sc = f'IF(W{r}="Croissant",{up},{dn})'
    else:
        sc = f"K{r}"
    cell(S, r, 12, f'=IF(Y{r}=1,"écarté",IF(X{r}=1,{PREF["MISSING"]},{sc}))', align=CENTER, bg=bg, font=F(bold=True, color=BRUN))
    cell(S, r, 13, f"=INDEX(Grille!$H${g}:$J${g},1,{SEGIDX})", align=CENTER, bg=bg, fmt="0.0%")
    # poids effectif : transfert du poids d'un critère ESG écarté vers son receveur
    eff = f"IF(Y{r}=1,0,M{r})"
    for donor in crit:
        if donor["transferTo"] == c["code"]:
            eff += f"+Y{rowof[donor['code']]}*M{rowof[donor['code']]}"
    cell(S, r, 14, "=" + eff, align=CENTER, bg=bg, fmt="0.0%")
    cell(S, r, 15, f'=IF(AND(J{r}="Disponible",X{r}=0),N{r},0)', align=CENTER, bg=bg, fmt="0.0%")
    S[f"Z{r}"] = f"=IF(ISNUMBER(L{r}),L{r}*N{r},0)"
    cell(S, r, 16, f"=IF(SUM($N${first}:$N${last})=0,0,Z{r}/SUM($N${first}:$N${last}))", align=CENTER, bg=bg, fmt="0.00")
    if ratio:
        q = (f'=IF(W{r}="Croissant","100 si ≥ "&S{r}&" · 75 si ≥ "&T{r}&" · 50 si ≥ "&U{r}&" · 25 si ≥ "&V{r}&" · sinon 0",'
             f'"100 si ≤ "&S{r}&" · 75 si ≤ "&T{r}&" · 50 si ≤ "&U{r}&" · 25 si ≤ "&V{r}&" · sinon 0")')
    else:
        q = f'=IF(ISNUMBER(L{r}),IFERROR(INDEX(Grille!$X${g}:$AB${g},1,MATCH(L{r},{{100,75,50,25,0}},0)),""),"")'
    cell(S, r, 17, q, bg=bg, font=F(size=8))
    S.row_dimensions[r].height = 30
for col in "STUVWXYZ": S.column_dimensions[col].hidden = True
S.column_dimensions["S"].hidden = False  # S4/S5 restent visibles en gris ? non : on masque la colonne entière
S.column_dimensions["S"].hidden = True

N_RNG, O_RNG, Z_RNG, X_RNG = (f"${c}${first}:${c}${last}" for c in "NOZX")
C_RNG, G_RNG, Y_RNG = f"$C${first}:$C${last}", f"$G${first}:$G${last}", f"$Y${first}:$Y${last}"

# Synthèse par domaine
D0 = last + 3
section(S, D0, 2, "3. Synthèse par domaine")
head(S, D0 + 1, 2, ["Domaine", "", "Libellé", "Poids", "Score", "", "Part observée", "Sous le seuil ?"])
S.merge_cells(start_row=D0 + 1, start_column=2, end_row=D0 + 1, end_column=3)
S.merge_cells(start_row=D0 + 1, start_column=6, end_row=D0 + 1, end_column=7)
dom_rows = []
for i, d in enumerate(grid["domains"]):
    r = D0 + 2 + i; dom_rows.append(r); bg = TINT if i % 2 == 0 else TINT2
    cell(S, r, 2, d["code"], bg=bg, font=F(bold=True, color=BRUN), align=CENTER); S.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
    cell(S, r, 4, d["labelFr"], bg=bg)
    cell(S, r, 5, f'=SUMIF({C_RNG},B{r},{N_RNG})', bg=bg, fmt="0.0%", align=CENTER)
    cell(S, r, 6, f'=IF(E{r}=0,"",SUMIF({C_RNG},B{r},{Z_RNG})/E{r})', bg=bg, fmt="0.0", align=CENTER, font=F(bold=True, color=BRUN))
    S.merge_cells(start_row=r, start_column=6, end_row=r, end_column=7)
    cell(S, r, 8, f'=IF(E{r}=0,"",SUMIF({C_RNG},B{r},{O_RNG})/E{r})', bg=bg, fmt="0%", align=CENTER)
    cell(S, r, 9, f'=IF(E{r}=0,"",IF(H{r}<{PREF["COV_D"]},"Oui","Non"))', bg=bg, align=CENTER)
DOM_DEF = f"COUNTIF($I${dom_rows[0]}:$I${dom_rows[-1]},\"Oui\")"
DOM_LIST = "_xlfn.TEXTJOIN(\", \",TRUE," + ",".join(f'IF(I{r}="Oui",B{r},"")' for r in dom_rows) + ")"

# Calculs de résultat
crit_missing = f'SUMPRODUCT(({G_RNG}="Oui")*({X_RNG}=1)*({Y_RNG}=0))'
result("status", "Statut de la notation", "")  # rempli plus bas
result("final", "Grade final", "", big=True)
result("raw", "Score brut (0 à 100)", f"=IF(SUM({N_RNG})=0,\"\",SUM({Z_RNG})/SUM({N_RNG}))", fmt="0.00", big=True)
result("engine", "Grade issu du score", f'=IF(ISNUMBER({R["raw"]}),INDEX({PREF["GRADES"]},MATCH(1,INDEX(({R["raw"]}>={PREF["GMIN"]})*1,0),0)),"—")')
result("cov", "Couverture observée (minimum " + "60 %" + ")", f"=IF(SUM({N_RNG})=0,0,SUM({O_RNG})/SUM({N_RNG}))", fmt="0.0%")
result("domdef", "Domaines sous le seuil de couverture", f'=IF({DOM_DEF}=0,"Aucun",{DOM_LIST})')
result("conf", "Confiance (score / classe)", "")
result("critical", "Données critiques manquantes", f'=IF({crit_missing}=0,"Aucune",{crit_missing}&" critère(s) critique(s) : notation impossible")')
result("caps", "Exceptions appliquées", "")
result("standalone", "Note autonome (après exceptions)", "")
result("support", "Support groupe", "")
result("compliance", "Conformité", f'=IF({R["rf_block"]}="Oui","BLOQUÉ : aucune opération nouvelle ; note produite pour la surveillance",IF({R["rf_refer"]}="Oui","Alerte à revoir par l\'analyste","Aucun signal bloquant"))')
result("check", "Contrôle : résultat du moteur de l'outil pour ce cas", f'=IF({CIDX}=0,"(saisie libre : pas de référence)",INDEX({CASE_RANGE("ref_final")},1,{CIDX})&IFERROR(" — score "&FIXED(INDEX({CASE_RANGE("ref_score")},1,{CIDX}),2),"")&IF(INDEX({CASE_RANGE("ref_final")},1,{CIDX})=IF({R["final"]}="Aucun grade","—",{R["final"]}),"  ✔ concordant","  ✘ écart"))')

conf_score = f'({R["conf_comp"]}*{PREF["W_COMP"]}+{R["conf_fresh"]}*{PREF["W_FRESH"]}+{R["conf_rel"]}*{PREF["W_REL"]}+{R["conf_prov"]}*{PREF["W_PROV"]})'
conf_class = f'IF({conf_score}>={PREF["CL_A"]},"A",IF({conf_score}>={PREF["CL_B"]},"B",IF({conf_score}>={PREF["CL_C"]},"C","U")))'
S[R["conf"].replace("$", "")] = f'=FIXED({conf_score},2)&" — classe "&{conf_class}'
# Plafonds : rang du grade (1 = meilleur)
grade_idx = lambda g: f"MATCH({g},{PREF['GRADES']},0)"
cap_terms = []
for cp in grid["caps"]:
    cap_terms.append((cp["code"], f'IF({R[cp["code"]]}="Oui",{grade_idx(CAPROW[cp["code"]])},0)'))
S[R["caps"].replace("$", "")] = "=IF(" + "+".join(f'({R[k]}="Oui")' for k, _ in cap_terms) + '=0,"Aucune",' + "_xlfn.TEXTJOIN(\", \",TRUE," + ",".join(f'IF({R[k]}="Oui","{k} (plafond "&{CAPROW[k]}&")","")' for k, _ in cap_terms) + "))"
gate_ok = f'AND({R["cov"]}>={PREF["COV_G"]},{DOM_DEF}=0,{conf_class}<>"U")'
std_idx = f'MAX({grade_idx(R["engine"])},' + ",".join(t for _, t in cap_terms) + ")"
S[R["standalone"].replace("$", "")] = f'=IF(OR({crit_missing}>0,{R["default"]}="Oui",NOT({gate_ok})),"—",INDEX({PREF["GRADES"]},{std_idx}))'
all4 = f'AND({R["gs_cap"]}="Oui",{R["gs_will"]}="Oui",{R["gs_legal"]}="Oui",{R["gs_funds"]}="Oui")'
notches = f'MIN({R["gs_notch"]},{PREF["NOTCH"]})'
S[R["support"].replace("$", "")] = f'=IF({R["gs_claim"]}<>"Oui","Non demandé",IF({R["standalone"]}="—","Sans objet (pas de note autonome)",IF(NOT({all4}),"Refusé : les quatre conditions ne sont pas toutes documentées",IF({notches}=0,"Conditions remplies, aucun cran demandé","Relèvement de "&{notches}&" cran(s)"))))'
final_rated = f'IF(AND({R["gs_claim"]}="Oui",{all4}),INDEX({PREF["GRADES"]},MAX(1,{grade_idx(R["standalone"])}-{notches})),{R["standalone"]})'
S[R["final"].replace("$", "")] = f'=IF({crit_missing}>0,IF({R["default"]}="Oui",{R["def_grade"]},"Aucun grade"),IF({R["default"]}="Oui",{R["def_grade"]},IF(NOT({gate_ok}),"Aucun grade",{final_rated})))'
S[R["status"].replace("$", "")] = (f'=IF({R["default"]}="Oui","Défaut constaté : le grade de défaut s\'impose, quel que soit le score",'
    f'IF({crit_missing}>0,"Pas de notation : donnée critique manquante",'
    f'IF(NOT({gate_ok}),"Pas de grade : information insuffisante (compléter le dossier)","Noté")))')
# le score brut n'est pas publié si une donnée critique manque (comme le moteur)
S[R["raw"].replace("$", "")] = f'=IF(OR(SUM({N_RNG})=0,{crit_missing}>0),"—",SUM({Z_RNG})/SUM({N_RNG}))'
S[R["engine"].replace("$", "")] = f'=IF(AND(ISNUMBER({R["raw"]}),OR({R["default"]}="Oui",{gate_ok})),INDEX({PREF["GRADES"]},MATCH(1,INDEX(({R["raw"]}>={PREF["GMIN"]})*1,0),0)),"—")'

S.freeze_panes = S[f"B{first}"]
S.conditional_formatting.add(R["check"].replace("$", ""), FormulaRule(formula=[f'ISNUMBER(SEARCH("écart",{R["check"]}))'], font=Font(name="Arial", bold=True, color="B3261E")))
S.conditional_formatting.add(f"I{dom_rows[0]}:I{dom_rows[-1]}", CellIsRule(operator="equal", formula=['"Oui"'], font=Font(name="Arial", bold=True, color="B3261E")))
S.conditional_formatting.add(f"L{first}:L{last}", CellIsRule(operator="lessThanOrEqual", formula=["25"], font=Font(name="Arial", bold=True, color="B3261E")))
S.conditional_formatting.add(f"L{first}:L{last}", CellIsRule(operator="greaterThanOrEqual", formula=["75"], font=Font(name="Arial", bold=True, color="146C4C")))
S["E8"].comment = Comment("Cellules sur fond orangé, texte bleu : saisies. Les colonnes « Retenu » sont calculées : elles reprennent la saisie, ou le cas exemple choisi en D4.", "Simulateur")

# ------------------------------------------------------------------ Lisez-moi
M = wb.create_sheet("Lisez-moi", 0)
banner(M, "SIMULATEUR DE LA GRILLE DE NOTATION", "Groupe BCP — modèle de notation interne des entreprises (TPE, PME, grandes entreprises). Outil pédagogique : seuls les résultats de l'outil de notation font foi.", 4)
M.column_dimensions["B"].width = 26; M.column_dimensions["C"].width = 100
rows = [
    ("À quoi il sert", "Comprendre comment la note se construit : simuler un dossier, voir l'effet d'un ratio, d'une donnée manquante, d'une exception ou d'un défaut, et rejouer les cas présentés au management."),
    ("Onglet Simulateur", "1) Choisissez « Saisie libre » ou un cas exemple (cellule D4). 2) Renseignez le cadrage et les 45 critères. 3) Lisez le résultat en haut à droite : statut, grade final, score brut, couverture, exceptions, support groupe."),
    ("Saisir un critère", "Ratio : la valeur, dans l'unité indiquée (ex. 30 pour 30 %, 1,4 pour 1,4x, 20 pour 20 jours). Qualitatif : le repère 100, 75, 50, 25 ou 0 ; son libellé s'affiche dans la dernière colonne, et tous les repères sont dans l'onglet Grille."),
    ("Statut d'une donnée", "Disponible : observée, compte dans la couverture. Estimée : compte dans le score, pas dans la couverture. Manquante (ou valeur vide) : score prudent de 25, pas dans la couverture ; une donnée critique manquante (D1.4, D1.5, D3.1) empêche toute notation."),
    ("Ordre du calcul", "Score de chaque critère → poids du segment (le poids d'un critère ESG non matériel passe à son critère receveur) → score brut = moyenne pondérée → défaut constaté ? (grade DEF) → porte de qualité (60 % du poids observé, 30 % par domaine, confiance au moins C) → grade issu du score → exceptions (plafonds) → support groupe (2 crans au plus, si les 4 conditions sont réunies)."),
    ("Légende des couleurs", "Fond orangé, texte bleu : cellule à saisir. Fond crème : calcul. Score en vert : 75 ou plus ; en rouge : 25 ou moins. Les onglets Paramètres et Grille reprennent les valeurs du modèle et peuvent être modifiés pour tester une sensibilité."),
    ("Ce que le simulateur ne fait pas", "Segmentation automatique à partir du chiffre d'affaires (le segment est choisi), cas particuliers de certains ratios, contrôles de cohérence et explications détaillées, conversion des devises, circuit de validation. Il ne remplace pas l'outil."),
    ("Contrôle", "Les cinq cas exemples ont été calculés par le moteur de l'outil ; en les chargeant, la ligne « Contrôle » du simulateur affiche « concordant » quand le simulateur retrouve le même grade."),
]
for i, (a, b) in enumerate(rows):
    r = 4 + i
    cell(M, r, 2, a, font=F(bold=True, color=BRUN), bg=TINT)
    cell(M, r, 3, b, bg=TINT2)
    M.row_dimensions[r].height = 48
for ws in wb.worksheets:
    ws.page_setup.orientation = "landscape"; ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1; ws.page_setup.fitToHeight = 0; ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.4
wb.active = 1
for ws in wb.worksheets:
    ws.sheet_properties.tabColor = ORANGE if ws.title in ("Simulateur", "Lisez-moi") else "8A5A3B"
wb.save(OUT)
print("ok", OUT, "critères", first, last)
