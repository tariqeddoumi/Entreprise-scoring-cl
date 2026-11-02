"""Simulateur Excel des grilles de notation, généré depuis le moteur (version 3.1).

Quatre grilles publiées (standard, TPE comportementale, deux challengers), un
onglet Bilan qui calcule les ratios exactement comme l'outil, des listes
déroulantes partout (statut, repère qualitatif avec son libellé, cas
particulier, source « Bilan » ou « Saisie », matérialité, segment, cas
exemples), et une ligne de contrôle qui compare le résultat aux cas calculés
par le moteur réel.

Rien n'est recopié à la main : barèmes, poids, repères, plafonds et cas
viennent de l'export du moteur. Régénérer après toute évolution du modèle :

    npx tsx scripts/diagnostics/export-simulateur.mts /tmp/sim
    python3 scripts/simulateur/build_xlsx.py /tmp/sim/simulateur.json docs/simulateur/Simulateur_notation_entreprises.xlsx

puis recalculer le classeur (LibreOffice) et vérifier « concordant » sur chaque
cas exemple (scripts/simulateur/check_xlsx.py).
"""
import json
import os
import sys

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.chart.label import DataLabelList
from openpyxl.comments import Comment
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.worksheet.datavalidation import DataValidation

SRC, OUT = sys.argv[1], sys.argv[2]
DATA = json.load(open(SRC))
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = os.path.join(HERE, "..", "assets", "groupe-bcp-logo.png")

# --- Charte Groupe BCP --------------------------------------------------------------
ORANGE, BRUN, GRIS, TINT, TINT2, WHITE = "E37B05", "462016", "3D3D3B", "F2E8DB", "FBF6F0", "FFFFFF"
INPUT_FILL, INPUT_FONT, GREEN, RED = "FDEBD0", "1F3FBF", "146C4C", "B3261E"
F = lambda **k: Font(name="Arial", **{"size": 10, "color": GRIS, **k})
fill = lambda c: PatternFill("solid", start_color=c, end_color=c)
thin = Side(style="thin", color="D9C7B0")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="center")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
SEGS = ["TPE", "PME", "GE"]
MAT_OPTIONS = ["Inconnue", "Matériel", "Non matériel (justifié)"]
MAT_LABELS = {"esgPhysicalMaterial": "Risque climatique physique", "esgTransitionMaterial": "Risque de transition",
              "esgComplianceMaterial": "Conformité environnementale", "covenantsMaterial": "Covenants"}

wb = Workbook()
wb.remove(wb.active)


def banner(ws, text, sub, width, logo=True):
    for row, h in ((1, 40), (2, 32)):
        ws.row_dimensions[row].height = h
    ws.merge_cells(start_row=1, start_column=2, end_row=1, end_column=width)
    c = ws.cell(1, 2, text)
    c.font = F(size=16, bold=True, color=WHITE)
    c.alignment = Alignment(vertical="center", indent=1)
    for col in range(2, width + 1):
        ws.cell(1, col).fill = fill(ORANGE)
    ws.merge_cells(start_row=2, start_column=2, end_row=2, end_column=width)
    s = ws.cell(2, 2, sub)
    s.font = F(size=10, italic=True, color=BRUN)
    s.alignment = Alignment(vertical="center", indent=1, wrap_text=True)
    ws.column_dimensions["A"].width = 2
    ws.sheet_view.showGridLines = False
    if logo and os.path.exists(LOGO):
        try:
            from openpyxl.drawing.image import Image
            img = Image(LOGO)
            img.width, img.height = 92, 48
            ws.add_image(img, f"{L(width + 1)}1")
        except Exception:  # Pillow absent : le classeur reste valide sans logo
            pass


def head(ws, row, col, labels):
    for i, t in enumerate(labels):
        c = ws.cell(row, col + i, t)
        c.font = F(bold=True, color=WHITE)
        c.fill = fill(ORANGE)
        c.alignment = CENTER
        c.border = BOX


def section(ws, row, col, text):
    ws.cell(row, col, text).font = F(size=12, bold=True, color=BRUN)


def inp(c):
    c.fill = fill(INPUT_FILL)
    c.font = F(color=INPUT_FONT, bold=True)
    c.border = BOX
    c.alignment = CENTER


def cell(ws, r, c, v, **style):
    x = ws.cell(r, c, v)
    x.font = style.pop("font", F())
    x.border = BOX
    x.alignment = style.pop("align", WRAP)
    if "bg" in style:
        x.fill = fill(style.pop("bg"))
    if "fmt" in style:
        x.number_format = style.pop("fmt")
    return x


def dv_list(ws, values=None, ref=None):
    formula = ref if ref else '"' + ",".join(values) + '"'
    dv = DataValidation(type="list", formula1=formula, allow_blank=True)
    dv.error = "Choisissez une valeur dans la liste."
    dv.errorTitle = "Valeur non prévue"
    ws.add_data_validation(dv)
    return dv


def q(sheet):
    return "'" + sheet + "'"


# =================================================================================
# Onglet Bilan : mêmes postes et mêmes formules que l'outil (src/financials)
# =================================================================================
B = wb.create_sheet("Bilan")
banner(B, "BILAN ET RATIOS — CALCUL AUTOMATIQUE", "Saisissez le bilan et le CPC (exercices N et N−1) dans les cellules orangées : les ratios de la grille se calculent comme dans l'outil et alimentent les simulateurs (source « Bilan »). Montants en unités de la devise des comptes.", 6)
B.column_dimensions["B"].width = 28
B.column_dimensions["C"].width = 58
B.column_dimensions["D"].width = 18
B.column_dimensions["E"].width = 18
B.column_dimensions["F"].width = 48
ex = DATA["exampleBalanceSheet"]["years"]
cell(B, 4, 3, "Exercice", font=F(bold=True, color=BRUN))
x = B.cell(4, 4, ex[0]["fiscalYear"]); inp(x)
x = B.cell(4, 5, ex[1]["fiscalYear"]); inp(x)
cell(B, 5, 3, "Date de clôture", font=F(bold=True, color=BRUN))
x = B.cell(5, 4, ex[0]["closingDate"]); inp(x)
x = B.cell(5, 5, ex[1]["closingDate"]); inp(x)
head(B, 7, 2, ["Code", "Poste", "Exercice N", "Exercice N−1", "Repère"])
ROW = {}
r = 8
SECTION_LABELS = {"ACTIF": "Bilan — actif (valeurs nettes)", "PASSIF": "Bilan — passif", "CPC": "Compte de produits et charges",
                  "TF": "Tableau de financement et annexe", "COMPL": "Données complémentaires (exercice N)"}
current = None
for p in DATA["postes"]:
    if p["section"] != current:
        current = p["section"]
        r += 1
        c = B.cell(r, 3, SECTION_LABELS[current]); c.font = F(bold=True, color=WHITE); c.fill = fill(BRUN)
        for col in (2, 4, 5, 6):
            B.cell(r, col).fill = fill(BRUN)
        r += 1
    ROW[p["key"]] = r
    cell(B, r, 2, p["key"], font=F(size=8, color="8A7A6A"))
    total = p["kind"] == "TOTAL"
    cell(B, r, 3, p["labelFr"], font=F(bold=total, color=BRUN if total else GRIS), bg=TINT if total else None) if total else cell(B, r, 3, p["labelFr"])
    for k, col in enumerate("DE"):
        if total:
            continue
        if p["onlyN"] and col == "E":
            cell(B, r, 5, "", bg="EEEEEE")
            continue
        v = ex[k]["values"].get(p["key"], "")
        x = B.cell(r, 4 + k, float(v) if v not in ("", None) else None)
        inp(x)
        x.number_format = "#,##0"
    if p["kind"] == "DETAIL":
        cell(B, r, 6, "« dont » : compris dans le poste précédent, jamais additionné", font=F(size=8, italic=True))
    r += 1
# Totaux (après avoir placé toutes les lignes)
for p in DATA["postes"]:
    if p["kind"] != "TOTAL":
        continue
    rr = ROW[p["key"]]
    for col in "DE":
        terms = "".join(("+" if s > 0 else "-") + f"{col}{ROW[k]}" for k, s in p["sum"])
        x = cell(B, rr, "DE".index(col) + 4, "=" + terms.lstrip("+"), font=F(bold=True, color=BRUN), bg=TINT, fmt="#,##0", align=Alignment(horizontal="right", vertical="center"))
B.freeze_panes = "D8"

# Ratios et contrôles
R0 = r + 2
section(B, R0, 2, "Ratios calculés (mêmes définitions que l'outil)")
head(B, R0 + 1, 2, ["Indicateur", "Formule", "Exercice N", "Utilisé par", "Note"])
v = lambda key, col="D": f"N({col}{ROW[key]})"
EBE = lambda col: f"({v('CHIFFRE_AFFAIRES', col)}+{v('VARIATION_STOCKS_PRODUITS', col)}+{v('IMMOBILISATIONS_PRODUITES', col)}+{v('SUBVENTIONS_EXPLOITATION', col)}-{v('ACHATS_REVENDUS', col)}-{v('ACHATS_CONSOMMES', col)}-{v('AUTRES_CHARGES_EXTERNES', col)}-{v('IMPOTS_TAXES', col)}-{v('CHARGES_PERSONNEL', col)})"
BFR = lambda col: f"({v('STOCKS', col)}+{v('CREANCES_CLIENTS', col)}+{v('AUTRES_CREANCES', col)}-{v('FOURNISSEURS', col)}-{v('AUTRES_DETTES_CIRCULANTES', col)})"
IMMO = lambda col: f"({v('IMMO_NON_VALEURS', col)}+{v('IMMO_INCORPORELLES', col)}+{v('IMMO_CORPORELLES', col)})"
HAS_N = f"COUNT(D{ROW['VENTES_MARCHANDISES']}:D{ROW['VENTES_BIENS_SERVICES']})>0"
HAS_N1 = f"COUNT(E{ROW['IMMO_NON_VALEURS']}:E{ROW['RESULTAT_NET_DECLARE']})>0"
EBER = f"({EBE('D')}+{v('REDEVANCES_CREDIT_BAIL')})"
DB_N = f"({v('DETTES_FINANCEMENT')}+{v('TRESORERIE_PASSIF')}+{v('ENCOURS_CREDIT_BAIL')}+{v('CCA_A_VUE')})"
DB_N1 = f"({v('DETTES_FINANCEMENT', 'E')}+{v('TRESORERIE_PASSIF', 'E')})"
TRESO = f"({v('TRESORERIE_ACTIF')}+{v('TITRES_PLACEMENT')})"
FPT = f"({v('CAPITAUX_PROPRES')}+{v('CCA_BLOQUES')}-{v('IMMO_NON_VALEURS')}-{v('IMMO_INCORPORELLES')}-{v('ECARTS_REEVALUATION')}-{v('CREANCES_ASSOCIES')})"
TAAJ = f"({v('TOTAL_ACTIF')}-{v('IMMO_NON_VALEURS')}-{v('IMMO_INCORPORELLES')}-{v('ECARTS_REEVALUATION')}-{v('CREANCES_ASSOCIES')})"
CFO = f"({EBER}-{v('IMPOTS_RESULTATS')}-({BFR('D')}-{BFR('E')}))"
CAPEX = f"IF(ISNUMBER(D{ROW['ACQUISITIONS_IMMOBILISATIONS']}),D{ROW['ACQUISITIONS_IMMOBILISATIONS']},MAX(0,{IMMO('D')}-{IMMO('E')}+{v('DOTATIONS_EXPLOITATION')}))"
SERV = f"IF(ISNUMBER(D{ROW['SERVICE_DETTE_PRINCIPAL_12M']}),{v('CHARGES_INTERETS')}+{v('REDEVANCES_CREDIT_BAIL')}+D{ROW['SERVICE_DETTE_PRINCIPAL_12M']},IF(ISNUMBER(D{ROW['REMBOURSEMENTS_DETTES_FIN']}),{v('CHARGES_INTERETS')}+{v('REDEVANCES_CREDIT_BAIL')}+D{ROW['REMBOURSEMENTS_DETTES_FIN']},\"\"))"
RAT = {}
ratios = [
    ("EBE_R", "EBE retraité (équivalent EBITDA)", "CA + production − consommations − impôts et taxes − personnel + crédit-bail", f'=IF({HAS_N},{EBER},"")', "#,##0", ""),
    ("FPT_TOTAL_BILAN", "Fonds propres tangibles / total bilan ajusté (%)", "FPT / (total actif − non-valeurs − incorporels − réévaluation − associés débiteurs)", f'=IF(AND({HAS_N},{TAAJ}>0),ROUND({FPT}/{TAAJ}*100,2),"")', "0.00", "D1.4 · F1"),
    ("DETTE_NETTE_EBE", "Dette nette / EBE retraité (x)", "(dettes de financement + trésorerie passif + crédit-bail + CCA à vue − trésorerie) / EBE retraité", f'=IF(AND({HAS_N},{EBER}>0),ROUND(({DB_N}-{TRESO})/{EBER},2),"")', "0.00", "D1.5 · F2"),
    ("LIQUIDITE_GENERALE", "Liquidité générale (x)", "(actif circulant + trésorerie actif) / (passif circulant + trésorerie passif)", f'=IF(AND({HAS_N},({v("TOTAL_PASSIF_CIRCULANT")}+{v("TRESORERIE_PASSIF")})<>0),ROUND(({v("TOTAL_ACTIF_CIRCULANT")}+{v("TRESORERIE_ACTIF")})/({v("TOTAL_PASSIF_CIRCULANT")}+{v("TRESORERIE_PASSIF")}),2),"")', "0.00", "D1.6"),
    ("CONVERSION_CFO_EBE", "Conversion de l'EBE en trésorerie (%)", "(EBE retraité − IS − variation du BFR) / EBE retraité ; exige N−1", f'=IF(AND({HAS_N},{HAS_N1},{EBER}>0),ROUND({CFO}/{EBER}*100,2),"")', "0.00", "D1.8 · F6"),
    ("COUVERTURE_INTERETS", "Couverture des intérêts (x)", "EBE retraité / charges d'intérêts", f'=IF(AND({HAS_N},{v("CHARGES_INTERETS")}<>0),ROUND({EBER}/{v("CHARGES_INTERETS")},2),"")', "0.00", "D2.1"),
    ("DSCR", "DSCR — couverture du service de la dette (x)", "flux d'exploitation / (intérêts + crédit-bail + principal à 12 mois)", f'=IF(AND({HAS_N},ISNUMBER({SERV}),N({SERV})<>0),ROUND(IF({HAS_N1},{CFO},{EBER}-{v("IMPOTS_RESULTATS")})/{SERV},2),"")', "0.00", "D2.2 · F3"),
    ("FCF_DETTE", "Free cash-flow / dette brute moyenne (%)", "(flux d'exploitation − investissements) / moyenne de la dette brute N et N−1", f'=IF(AND({HAS_N},{HAS_N1},({DB_N}+{DB_N1})<>0),ROUND(({CFO}-{CAPEX})/(({DB_N}+{DB_N1})/2)*100,2),"")', "0.00", "D2.3"),
    ("GEARING", "Endettement / capitaux propres (gearing, x)", "dette brute / capitaux propres — affiché, non noté", f'=IF(AND({HAS_N},{v("CAPITAUX_PROPRES")}>0),ROUND({DB_N}/{v("CAPITAUX_PROPRES")},2),"")', "0.00", "fiche (non noté)"),
    ("ROE", "Rentabilité des capitaux propres (%)", "résultat net / capitaux propres — affiché, non noté", f'=IF(AND({HAS_N},{v("CAPITAUX_PROPRES")}>0),ROUND({v("RESULTAT_NET")}/{v("CAPITAUX_PROPRES")}*100,2),"")', "0.00", "fiche (non noté)"),
    ("MARGE_EBE", "Marge d'EBE (%)", "EBE / chiffre d'affaires", f'=IF(AND({HAS_N},{v("CHIFFRE_AFFAIRES")}<>0),ROUND({EBE("D")}/{v("CHIFFRE_AFFAIRES")}*100,2),"")', "0.00", "fiche (non noté)"),
    ("DSO", "Délai clients (jours)", "clients / CA × 365", f'=IF(AND({HAS_N},{v("CHIFFRE_AFFAIRES")}<>0),ROUND({v("CREANCES_CLIENTS")}/{v("CHIFFRE_AFFAIRES")}*365,0),"")', "0", "fiche (non noté)"),
]
for i, (key, lab, formula_txt, formula, fmt, used) in enumerate(ratios):
    rr = R0 + 2 + i
    RAT[key] = f"Bilan!$D${rr}"
    cell(B, rr, 2, lab, font=F(bold=True, color=BRUN), bg=TINT if i % 2 == 0 else TINT2)
    cell(B, rr, 3, formula_txt, font=F(size=8, italic=True), bg=TINT if i % 2 == 0 else TINT2)
    cell(B, rr, 4, formula, font=F(bold=True, color=ORANGE), fmt=fmt, align=Alignment(horizontal="right", vertical="center"), bg=TINT if i % 2 == 0 else TINT2)
    cell(B, rr, 5, used, align=CENTER, bg=TINT if i % 2 == 0 else TINT2)
    cell(B, rr, 6, "", bg=TINT if i % 2 == 0 else TINT2)
B.cell(R0 + 2 + 2, 6, f'=IF(AND({HAS_N},{EBER}<=0),"EBE retraité nul ou négatif : cas particulier défavorable","")').font = F(size=8, color=RED)
B.cell(R0 + 2 + 6, 6, f'=IF(ISNUMBER({SERV}),"","Renseigner le principal exigible à 12 mois (données complémentaires)")').font = F(size=8, color=RED)
FLAGS = {"EBE_NONPOS": f"AND({HAS_N},{EBER}<=0)", "FPT_NEG": f"AND({HAS_N},{TAAJ}>0,{FPT}<0)"}
C0 = R0 + 2 + len(ratios) + 1
section(B, C0, 2, "Contrôles")
head(B, C0 + 1, 2, ["Contrôle", "Détail", "Résultat", "", ""])
checks = [
    ("Équilibre du bilan N", f'=IF(COUNT(D{ROW["CAPITAL"]}:D{ROW["TRESORERIE_PASSIF"]})=0,"",IF(ABS(D{ROW["TOTAL_ACTIF"]}-D{ROW["TOTAL_PASSIF"]})<=MAX(1,ABS(D{ROW["TOTAL_ACTIF"]})*0.001),"Conforme","Bloquant : actif ≠ passif"))'),
    ("Équilibre du bilan N−1", f'=IF(COUNT(E{ROW["CAPITAL"]}:E{ROW["TRESORERIE_PASSIF"]})=0,"",IF(ABS(E{ROW["TOTAL_ACTIF"]}-E{ROW["TOTAL_PASSIF"]})<=MAX(1,ABS(E{ROW["TOTAL_ACTIF"]})*0.001),"Conforme","Bloquant : actif ≠ passif"))'),
    ("Résultat du bilan = résultat du CPC (N)", f'=IF(OR(NOT(ISNUMBER(D{ROW["RESULTAT_EXERCICE_BILAN"]})),NOT({HAS_N})),"",IF(ABS(D{ROW["RESULTAT_EXERCICE_BILAN"]}-D{ROW["RESULTAT_NET"]})<=MAX(1,ABS(D{ROW["RESULTAT_NET"]})*0.001),"Conforme","Bloquant : écart"))'),
    ("Total actif du document retrouvé (N)", f'=IF(NOT(ISNUMBER(D{ROW["TOTAL_ACTIF_DECLARE"]})),"",IF(ABS(D{ROW["TOTAL_ACTIF_DECLARE"]}-D{ROW["TOTAL_ACTIF"]})<=MAX(1,ABS(D{ROW["TOTAL_ACTIF_DECLARE"]})*0.001),"Conforme","Bloquant : poste manquant ou mal saisi"))'),
    ("Exercice N−1 renseigné", f'=IF({HAS_N1},"Conforme","Bloquant : deux exercices exigés")'),
]
for i, (lab, f) in enumerate(checks):
    rr = C0 + 2 + i
    cell(B, rr, 2, lab, font=F(bold=True, color=BRUN))
    cell(B, rr, 3, "")
    cell(B, rr, 4, f, align=CENTER, font=F(bold=True))
    B.merge_cells(start_row=rr, start_column=4, end_row=rr, end_column=6)
B.conditional_formatting.add(f"D{C0 + 2}:D{C0 + 1 + len(checks)}", FormulaRule(formula=[f'ISNUMBER(SEARCH("Bloquant",D{C0 + 2}))'], font=Font(name="Arial", bold=True, color=RED)))
B.conditional_formatting.add(f"D{C0 + 2}:D{C0 + 1 + len(checks)}", FormulaRule(formula=[f'D{C0 + 2}="Conforme"'], font=Font(name="Arial", bold=True, color=GREEN)))


# =================================================================================
# Une grille + un simulateur par modèle
# =================================================================================
SHORT = {"CORP_STD_V1": ("Standard", "Grille Standard"), "CORP_TPE_BEHAV_V1": ("TPE comportemental", "Grille TPE"),
         "CORP_STD_CHALLENGER_V1": ("Challenger standard", "Grille Chall. std"), "CORP_TPE_CHALLENGER_V1": ("Challenger TPE", "Grille Chall. TPE")}
SIM_SHEETS = []


def build_model(md):
    g, cases = md["grid"], md["cases"]
    mid = g["modelId"]
    sim_name, grid_name = SHORT[mid]
    GN = q(grid_name)
    crit = g["criteria"]
    segs = g["segments"]

    # ------------------------------------------------------------- Grille
    G = wb.create_sheet(grid_name)
    banner(G, f"GRILLE {mid} — {len(crit)} CRITÈRES", f"{g['labelFr']} — version {g['version']}. Valeurs reprises du moteur ; les cellules orangées sont modifiables pour tester une sensibilité.", 12)
    G.column_dimensions["B"].width = 46
    G.column_dimensions["C"].width = 14
    G.column_dimensions["D"].width = 50
    head(G, 4, 2, ["Paramètre", "Valeur", "Commentaire"])
    cls = {c["code"]: c["minScore"] for c in g["confidence"]["classes"]}
    params = [
        ("COV_G", "Couverture observée minimale — global", g["coverage"]["minGlobalObservedBps"] / 10000, "0%", "Part du poids portée par une donnée observée."),
        ("COV_D", "Couverture observée minimale — par domaine", g["coverage"]["minDomainObservedBps"] / 10000, "0%", "Sous ce seuil dans un domaine, aucun grade."),
        ("W_COMP", "Confiance — poids de la complétude", g["confidence"]["weights"]["completeness"] / 100, "0%", "La complétude retenue ne dépasse jamais la couverture observée."),
        ("W_FRESH", "Confiance — poids de la fraîcheur", g["confidence"]["weights"]["freshness"] / 100, "0%", ""),
        ("W_REL", "Confiance — poids de la fiabilité", g["confidence"]["weights"]["reliability"] / 100, "0%", ""),
        ("W_PROV", "Confiance — poids de la provenance", g["confidence"]["weights"]["provenance"] / 100, "0%", ""),
        ("CL_A", "Confiance — seuil de la classe A", cls.get("A", 85), "0", "Élevée"),
        ("CL_B", "Confiance — seuil de la classe B", cls.get("B", 70), "0", "Moyenne"),
        ("CL_C", "Confiance — seuil de la classe C", cls.get("C", 55), "0", "Faible ; en dessous (classe U) : aucun grade."),
        ("NOTCH", "Support groupe — crans maximum", g["groupSupport"]["maxNotches"], "0", "0 : la grille n'accorde aucun cran (challengers)."),
    ]
    P = {}
    for i, (k, lab, val, fmt, com) in enumerate(params):
        rr = 5 + i
        cell(G, rr, 2, lab)
        x = G.cell(rr, 3, val); inp(x); x.number_format = fmt
        cell(G, rr, 4, com, font=F(size=9, italic=True))
        P[k] = f"{GN}!$C${rr}"
    gr0 = 5 + len(params) + 1
    section(G, gr0, 2, "Échelle de grades")
    head(G, gr0 + 1, 2, ["Grade", "Score minimum", "Lecture"])
    bands = sorted(g["grades"], key=lambda b: -(b["minScore"] or 0))
    for i, b in enumerate(bands):
        rr = gr0 + 2 + i
        cell(G, rr, 2, b["grade"], font=F(bold=True, color=BRUN))
        x = G.cell(rr, 3, b["minScore"] or 0); inp(x)
        cell(G, rr, 4, b["labelFr"])
    GF, GL = gr0 + 2, gr0 + 1 + len(bands)
    P["GRADES"], P["GMIN"] = f"{GN}!$B${GF}:$B${GL}", f"{GN}!$C${GF}:$C${GL}"
    cap0 = GL + 2
    CAPROW = {}
    if g["caps"]:
        section(G, cap0, 2, "Exceptions non compensatoires (plafonds)")
        head(G, cap0 + 1, 2, ["Exception", "Grade plafond", "Déclencheur"])
        for i, cp in enumerate(g["caps"]):
            rr = cap0 + 2 + i
            cell(G, rr, 2, f"{cp['code']} — {cp['labelFr']}", font=F(bold=True, color=BRUN))
            x = G.cell(rr, 3, cp["maxGrade"]); inp(x)
            d = cp["derivation"]
            cell(G, rr, 4, f"Calculé : {d['criterion']} < {d['threshold']} (la valeur observée fait foi)" if d else "Déclaré par l'analyste")
            CAPROW[cp["code"]] = f"{GN}!$C${rr}"
        cap0 = cap0 + 2 + len(g["caps"]) + 1
    # Table des critères
    CT = cap0 + 1
    section(G, CT - 1, 2, "Critères : poids, barèmes, repères et cas particuliers")
    hdr = ["Code", "Domaine", "Critère", "Type", "Unité", "Critique", "Poids TPE", "Poids PME", "Poids GE", "Sens"]
    for s in SEGS:
        hdr += [f"{s} : 100 si", f"{s} : 75 si", f"{s} : 50 si", f"{s} : 25 si"]
    hdr += ["Repère 100", "Repère 75", "Repère 50", "Repère 25", "Repère 0", "Cas particulier 1", "Cas particulier 2", "Score cas 1", "Score cas 2", "Score si absent"]
    head(G, CT, 2, hdr)
    for i, w in enumerate([8, 7, 40, 11, 7, 8, 8, 8, 8, 11] + [9] * 12 + [30] * 5 + [30, 30, 8, 8, 8]):
        G.column_dimensions[L(2 + i)].width = w
    GROW = {}
    for i, c in enumerate(crit):
        rr = CT + 1 + i
        GROW[c["code"]] = rr
        bg = TINT if i % 2 == 0 else TINT2
        vals = [c["code"], c["domain"], c["labelFr"], "Ratio" if c["type"] == "QUANTITATIVE" else "Qualitatif", c["unit"], "Oui" if c["critical"] else ""]
        vals += [c["weightsBps"].get(s, 0) / 10000 for s in SEGS]
        direction, th = "", {}
        if c["bins"]:
            for s in SEGS:
                bins = c["bins"].get(s) or c["bins"].get("ALL")
                if not bins:
                    continue
                bs = sorted(bins, key=lambda b: -b["score"])
                if bs[0]["max"] is None:
                    direction, th[s] = "Croissant", [b["min"] for b in bs[:4]]
                else:
                    direction, th[s] = "Décroissant", [b["max"] for b in bs[:4]]
        vals.append(direction)
        for s in SEGS:
            vals += th.get(s, ["", "", "", ""])
        anchors = {a["score"]: a["labelFr"] for a in (c["anchors"] or [])}
        vals += [f"{k} — {anchors[k]}" if k in anchors else "" for k in (100, 75, 50, 25, 0)]
        sc = c["specialCases"][:2] + [None] * (2 - len(c["specialCases"][:2]))
        vals += [s["labelFr"] if s else "" for s in sc] + [s["score"] if s else "" for s in sc] + [c["unavailableScore"]]
        for j, val in enumerate(vals):
            x = cell(G, rr, 2 + j, val, bg=bg, font=F(size=9, bold=(j == 0), color=BRUN if j == 0 else GRIS))
            if 6 <= j <= 8:
                x.number_format = "0.0%"
                x.alignment = CENTER
            if 10 <= j <= 21:
                x.alignment = CENTER
        G.row_dimensions[rr].height = 40
    G.freeze_panes = G[f"E{CT + 1}"]
    # Colonnes de la grille : H-J poids, K sens, L-W seuils, X-AB repères, AC-AD cas, AE-AF scores, AG absent

    # ------------------------------------------------------------- Cas exemples
    CN = None
    CASEROW = {}
    if cases:
        CN = f"Cas {sim_name}"[:31]
        C = wb.create_sheet(CN)
        banner(C, f"CAS EXEMPLES — {sim_name.upper()}", "Entreprises fictives. Choisissez un cas dans le simulateur (« Cas chargé ») ; la dernière partie donne le résultat calculé par le moteur de l'outil, pour contrôle.", 3 + len(cases))
        C.column_dimensions["B"].width = 16
        C.column_dimensions["C"].width = 44
        for k in range(len(cases)):
            C.column_dimensions[L(4 + k)].width = 24
        names = [f"{c['id']} — {c['nom']}" for c in cases]
        head(C, 4, 2, ["Clé", "Saisie"] + names)
        state = {"row": 5}

        def line(key, label, values, fmt=None, wrap=False, height=None):
            rr = state["row"]
            cell(C, rr, 2, key, font=F(size=8, color="8A7A6A"))
            cell(C, rr, 3, label)
            for k, val in enumerate(values):
                x = cell(C, rr, 4 + k, val, align=WRAP if wrap else CENTER, bg=TINT2)
                if fmt:
                    x.number_format = fmt
            if height:
                C.row_dimensions[rr].height = height
            CASEROW[key] = rr
            state["row"] += 1

        yn = lambda b: "Oui" if b else "Non"
        line("profil", "Profil", [c["profilFr"] for c in cases], wrap=True, height=60)
        line("nom", "Contrepartie", [c["nom"] for c in cases])
        line("segment", "Segment", [c["segment"] for c in cases])
        for flag in sorted({c["gate"] for c in crit if c["gate"]}):
            mat = lambda c: {True: "Matériel", False: "Non matériel (justifié)"}.get((c.get("materiality") or {}).get(flag), "Inconnue")
            line(f"mat_{flag}", f"Matérialité — {MAT_LABELS.get(flag, flag)}", [mat(c) for c in cases])
        for key, lab, fld in [("conf_comp", "Confiance — complétude", "completeness"), ("conf_fresh", "Confiance — fraîcheur", "freshness"), ("conf_rel", "Confiance — fiabilité", "reliability"), ("conf_prov", "Confiance — provenance", "provenance")]:
            line(key, lab, [(c.get("confidence") or {"completeness": 100, "freshness": 100, "reliability": 75, "provenance": 75})[fld] for c in cases])
        for cp in g["caps"]:
            if not cp["derivation"]:
                line(cp["code"], f"{cp['code']} déclaré", [yn((c.get("flags") or {}).get(cp["flag"] or "")) for c in cases])
        block = [r["code"] for r in g["redFlags"] if r["level"] == "BLOCK"]
        line("rf_block", "Red flag conformité bloquant", [yn(any(x in block for x in (c.get("redFlags") or []))) for c in cases])
        line("rf_refer", "Red flag à revoir", [yn(any(x not in block for x in (c.get("redFlags") or []))) for c in cases])
        line("default", "Défaut constaté", [yn(c.get("defaultTriggered")) for c in cases])
        line("def_grade", "Grade de défaut", ["DEF1"] * len(cases))
        for key in ("gs_claim", "gs_cap", "gs_will", "gs_legal", "gs_funds"):
            line(key, key, ["Non"] * len(cases))
        line("gs_notch", "Crans demandés", [0] * len(cases))
        for cr in crit:
            st, va, sp = [], [], []
            labels = {s["code"]: s["labelFr"] for s in cr["specialCases"]}
            for c in cases:
                a = c["answers"].get(cr["code"])
                if isinstance(a, dict):
                    st.append("Disponible"); va.append(""); sp.append(labels.get(a["special"], ""))
                elif a is None or a == "MISSING":
                    st.append("Manquante"); va.append(""); sp.append("")
                elif a == "NA":
                    st.append("Non applicable"); va.append(""); sp.append("")
                else:
                    st.append("Disponible"); va.append(a); sp.append("")
            line(f"S_{cr['code']}", f"{cr['code']} — statut", st)
            line(f"V_{cr['code']}", f"{cr['code']} — valeur", va)
            line(f"P_{cr['code']}", f"{cr['code']} — cas particulier", sp)
        state["row"] += 1
        section(C, state["row"], 2, "Résultat calculé par le moteur de l'outil (référence de contrôle)")
        state["row"] += 1
        lab_status = {"RATED": "Noté", "DEFAULTED": "Défaut", "NO_RATING_INSUFFICIENT_DATA": "Pas de grade"}
        line("ref_status", "Statut", [lab_status.get(c["result"]["ratingStatus"], c["result"]["ratingStatus"]) for c in cases])
        line("ref_score", "Score brut", [round(c["result"]["rawScore"], 2) if c["result"]["rawScore"] is not None else "" for c in cases], "0.00")
        line("ref_final", "Grade final", [c["result"]["finalGrade"] or "—" for c in cases])
        line("ref_expl", "Explication du moteur", [c["result"]["explanationFr"] for c in cases], wrap=True, height=120)
        C.freeze_panes = "D5"
        C.sheet_properties.tabColor = "8A5A3B"
    CR = lambda key: f"{q(CN)}!$D${CASEROW[key]}:${L(3 + len(cases))}${CASEROW[key]}"

    # ------------------------------------------------------------- Simulateur
    S = wb.create_sheet(sim_name)
    SIM_SHEETS.append((sim_name, mid, g["labelFr"]))
    banner(S, f"SIMULATEUR — {sim_name.upper()} ({mid})", f"Version {g['version']}. Saisissez dans les cellules orangées (listes déroulantes) ou chargez un cas exemple. Les calculs reproduisent le moteur de l'outil ; seuls les résultats de l'outil font foi.", 20)
    widths = {"B": 8, "C": 8, "D": 40, "E": 9, "F": 6, "G": 7, "H": 10, "I": 13, "J": 30, "K": 22, "L": 12, "M": 11, "N": 16, "O": 8, "P": 9, "Q": 9, "R": 9, "S": 9, "T": 44}
    for k, val in widths.items():
        S.column_dimensions[k].width = val
    dv_yn = dv_list(S, ["Oui", "Non"])
    dv_seg = dv_list(S, segs)
    dv_conf = dv_list(S, ["100", "75", "50", "25", "0"])
    dv_def = dv_list(S, ["DEF1", "DEF2", "DEF3"])
    dv_notch = dv_list(S, [str(n) for n in range(0, max(1, g["groupSupport"]["maxNotches"]) + 1)])
    dv_mat = dv_list(S, MAT_OPTIONS)
    dv_src = dv_list(S, ["Bilan", "Saisie"])
    dv_stat = dv_list(S, ["Disponible", "Estimée", "Manquante"])
    dv_stat_na = dv_list(S, ["Disponible", "Estimée", "Manquante", "Non applicable"])

    cell(S, 4, 2, "Cas chargé", font=F(bold=True, color=BRUN))
    S.merge_cells("B4:C4")
    x = S.cell(4, 4, "Saisie libre"); inp(x)
    CIDX = "$V$4"
    if cases:
        dv_case = dv_list(S, ["Saisie libre"] + [f"{c['id']} — {c['nom']}" for c in cases])
        dv_case.add("D4")
        S["V4"] = f'=IF($D$4="Saisie libre",0,IFERROR(MATCH($D$4,{q(CN)}!$D$4:${L(3 + len(cases))}$4,0),0))'
        cell(S, 4, 5, "« Saisie libre » : vos saisies sont utilisées. Un cas exemple remplace toutes les saisies (colonnes « Retenu »).", font=F(size=9, italic=True))
    else:
        S["V4"] = 0
        cell(S, 4, 5, "Pas de cas exemple pour cette grille : saisie libre.", font=F(size=9, italic=True))
    S.merge_cells("E4:T4")

    section(S, 6, 2, "1. Cadrage du dossier")
    head(S, 7, 2, ["Élément", "", "", "Saisie", "Retenu"])
    S.merge_cells("B7:D7")
    gates = sorted({c["gate"] for c in crit if c["gate"]})
    cad = [("nom", "Contrepartie", "Entreprise exemple", None), ("segment", f"Segment ({', '.join(segs)})", segs[min(1, len(segs) - 1)], dv_seg)]
    cad += [(f"mat_{fl}", f"Matérialité — {MAT_LABELS.get(fl, fl)} (« Non matériel » écarte le critère)", "Inconnue", dv_mat) for fl in gates]
    cad += [("conf_comp", "Confiance — complétude déclarée (plafonnée par la couverture)", 100, dv_conf),
            ("conf_fresh", "Confiance — fraîcheur des données", 100, dv_conf),
            ("conf_rel", "Confiance — fiabilité des sources", 75, dv_conf),
            ("conf_prov", "Confiance — provenance", 75, dv_conf)]
    cad += [(cp["code"], f"Exception {cp['code']} déclarée — {cp['labelFr']}", "Non", dv_yn) for cp in g["caps"] if not cp["derivation"]]
    cad += [("rf_block", "Red flag conformité bloquant", "Non", dv_yn),
            ("rf_refer", "Red flag à revoir (alerte)", "Non", dv_yn),
            ("default", "Défaut constaté (impayé > 90 j, restructuration, procédure)", "Non", dv_yn),
            ("def_grade", "Grade de défaut", "DEF1", dv_def)]
    if g["groupSupport"]["maxNotches"] > 0:
        cad += [("gs_claim", "Support groupe demandé", "Non", dv_yn), ("gs_cap", "Support — capacité du garant documentée", "Non", dv_yn),
                ("gs_will", "Support — volonté de soutien démontrée", "Non", dv_yn), ("gs_legal", "Support — engagement juridiquement contraignant", "Non", dv_yn),
                ("gs_funds", "Support — transférabilité des fonds établie", "Non", dv_yn), ("gs_notch", f"Support — crans demandés (0 à {g['groupSupport']['maxNotches']})", 0, dv_notch)]
    R = {}
    for i, (key, lab, default, dv) in enumerate(cad):
        rr = 8 + i
        cell(S, rr, 2, lab)
        cell(S, rr, 3, "")
        cell(S, rr, 4, "")
        S.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=4)
        x = S.cell(rr, 5, default); inp(x)
        if dv:
            dv.add(f"E{rr}")
        if key in ("segment", "conf_comp", "conf_fresh", "conf_rel", "conf_prov", "gs_notch") or not cases or key not in CASEROW:
            f = f"=IF({CIDX}=0,E{rr},INDEX({CR(key)},1,{CIDX}))" if cases and key in CASEROW else f"=E{rr}"
        else:
            f = f"=IF({CIDX}=0,E{rr},INDEX({CR(key)},1,{CIDX}))"
        if cases and key in ("segment", "conf_comp", "conf_fresh", "conf_rel", "conf_prov", "gs_notch") and key in CASEROW:
            f = f"=IF({CIDX}=0,E{rr},INDEX({CR(key)},1,{CIDX}))"
        cell(S, rr, 6, f, align=CENTER, font=F(bold=True, color=BRUN), bg=TINT2)
        S.merge_cells(start_row=rr, start_column=6, end_row=rr, end_column=7)
        R[key] = f"$F${rr}"
    cad_end = 8 + len(cad) - 1
    SEGIDX = "$V$5"
    S["V5"] = f'=MATCH({R["segment"]},{{"TPE","PME","GE"}},0)'
    for cc in ("V4", "V5"):
        S[cc].font = F(color="AAAAAA")
    for cc in ("conf_comp", "conf_fresh", "conf_rel", "conf_prov", "gs_notch"):
        if cc in R:
            S[R[cc].replace("$", "")].number_format = "0"

    # Table des critères
    T0 = max(cad_end, 8 + 15 - 1) + 3  # sous le cadrage et le bloc de résultats (15 lignes)
    section(S, T0, 2, "2. Critères — saisie et calcul")
    TH = T0 + 1
    head(S, TH, 2, ["Code", "Domaine", "Critère", "Type", "Unité", "Critique", "Source", "Statut saisi", "Valeur ou repère saisi", "Cas particulier saisi", "Statut retenu", "Valeur retenue", "Cas retenu", "Score", "Poids nominal", "Poids effectif", "Poids observé", "Contrib.", "Barème ou repère retenu"])
    S.row_dimensions[TH].height = 32
    first = TH + 1
    rowof = {c["code"]: first + i for i, c in enumerate(crit)}
    last = first + len(crit) - 1
    links = {l["criterion"]: l for l in g["links"]}
    for i, c in enumerate(crit):
        r_ = rowof[c["code"]]
        gr = GROW[c["code"]]
        bg = TINT if i % 2 == 0 else TINT2
        ratio = c["type"] == "QUANTITATIVE"
        for j, val in enumerate([c["code"], c["domain"], c["labelFr"], "Ratio" if ratio else "Qualitatif", c["unit"], "Oui" if c["critical"] else ""]):
            cell(S, r_, 2 + j, val, bg=bg, font=F(size=9, bold=(j == 0 or (j == 5 and c["critical"])), color=BRUN if j == 0 else (RED if j == 5 else GRIS)), align=CENTER if j != 2 else WRAP)
        link = links.get(c["code"])
        if link:
            x = S.cell(r_, 8, "Bilan"); inp(x); dv_src.add(f"H{r_}")
        else:
            cell(S, r_, 8, "—", bg=bg, align=CENTER, font=F(size=8, color="8A7A6A"))
        # Saisies par défaut : premier cas exemple s'il existe
        a = cases[0]["answers"].get(c["code"]) if cases else None
        x = S.cell(r_, 9, "Disponible"); inp(x)
        (dv_stat_na if c["notApplicable"] else dv_stat).add(f"I{r_}")
        if ratio:
            x = S.cell(r_, 10, a if isinstance(a, (int, float)) else None); inp(x)
        else:
            anchors = {an["score"]: an["labelFr"] for an in (c["anchors"] or [])}
            default = f"{int(a)} — {anchors[int(a)]}" if isinstance(a, (int, float)) and int(a) in anchors else ""
            x = S.cell(r_, 10, default); inp(x)
            x.alignment = Alignment(wrap_text=True, vertical="center")
            x.font = F(size=8, color=INPUT_FONT, bold=True)
            dv_list(S, ref=f"={GN}!$X${gr}:$AB${gr}").add(f"J{r_}")
        if c["specialCases"]:
            x = S.cell(r_, 11, ""); inp(x)
            x.font = F(size=8, color=INPUT_FONT, bold=True)
            dv_list(S, ref=f"={GN}!$AC${gr}:$AD${gr}").add(f"K{r_}")
        else:
            cell(S, r_, 11, "", bg=bg)
        # Statut, valeur et cas retenus
        has_case = bool(cases)
        cell(S, r_, 12, f"=IF({CIDX}=0,I{r_},INDEX({CR('S_' + c['code'])},1,{CIDX}))" if has_case else f"=I{r_}", align=CENTER, bg=bg, font=F(size=9))
        parse = f'IF(J{r_}="","",IF(ISNUMBER(J{r_}),J{r_},IFERROR(VALUE(LEFT(J{r_},FIND(" ",J{r_})-1)),"")))' if not ratio else f'IF(J{r_}="","",J{r_})'
        saisie_v = parse
        saisie_sp = f"K{r_}" if c["specialCases"] else '""'
        if link:
            bil = RAT[link["indicator"]]
            saisie_v = f'IF(AND(H{r_}="Bilan",{bil}<>""),{bil},{parse})'
            spec = []
            sc_labels = {s["code"]: s["labelFr"] for s in c["specialCases"]}
            if link["nonPositiveEbitdaCase"] and link["nonPositiveEbitdaCase"] in sc_labels:
                spec.append((FLAGS["EBE_NONPOS"], sc_labels[link["nonPositiveEbitdaCase"]]))
            if link["negativeCase"] and link["negativeCase"] in sc_labels:
                spec.append((FLAGS["FPT_NEG"], sc_labels[link["negativeCase"]]))
            sp = saisie_sp
            for cond, lab in reversed(spec):
                lab_q = lab.replace('"', '""')
                sp = f'IF(AND(H{r_}="Bilan",{cond}),"{lab_q}",{sp})'
            saisie_sp = sp
        if has_case:
            cv = f"INDEX({CR('V_' + c['code'])},1,{CIDX})"
            cell(S, r_, 13, f'=IF({CIDX}=0,{saisie_v},IF({cv}="","",{cv}))', align=CENTER, bg=bg, font=F(size=9))
            cell(S, r_, 14, f"=IF({CIDX}=0,{saisie_sp},INDEX({CR('P_' + c['code'])},1,{CIDX})&\"\")", bg=bg, font=F(size=8))
        else:
            cell(S, r_, 13, f"={saisie_v}", align=CENTER, bg=bg, font=F(size=9))
            cell(S, r_, 14, f"={saisie_sp}&\"\"", bg=bg, font=F(size=8))
        # Colonnes de calcul masquées : V-Y seuils, Z sens, AA absent, AB écarté, AC score*poids, AD borne haute*poids, AE score du cas
        if ratio and c["bins"]:
            for k, col in enumerate(["V", "W", "X", "Y"]):
                S[f"{col}{r_}"] = f"=INDEX({GN}!$L${gr}:$W${gr},1,({SEGIDX}-1)*4+{k + 1})"
            S[f"Z{r_}"] = f"={GN}!$K${gr}"
        S[f"AE{r_}"] = f'=IF(N{r_}="","",IFERROR(INDEX({GN}!$AE${gr}:$AF${gr},1,MATCH(N{r_},{GN}!$AC${gr}:$AD${gr},0)),""))'
        S[f"AA{r_}"] = f'=IF(AND(N{r_}="",OR(L{r_}="Manquante",M{r_}="")),1,0)'
        excl = []
        if c["gate"]:
            excl.append(f'{R["mat_" + c["gate"]]}="Non matériel (justifié)"')
        if c["notApplicable"]:
            excl.append(f'L{r_}="Non applicable"')
        S[f"AB{r_}"] = f"=IF(OR({','.join(excl)}),1,0)" if excl else 0
        if ratio and c["bins"]:
            up = f"IF(M{r_}>=V{r_},100,IF(M{r_}>=W{r_},75,IF(M{r_}>=X{r_},50,IF(M{r_}>=Y{r_},25,0))))"
            dn = f"IF(M{r_}<=V{r_},100,IF(M{r_}<=W{r_},75,IF(M{r_}<=X{r_},50,IF(M{r_}<=Y{r_},25,0))))"
            sc = f'IF(Z{r_}="Croissant",{up},{dn})'
        else:
            sc = f"M{r_}"
        cell(S, r_, 15, f'=IF(AB{r_}=1,"écarté",IF(AE{r_}<>"",AE{r_},IF(AA{r_}=1,{GN}!$AG${gr},{sc})))', align=CENTER, bg=bg, font=F(bold=True, color=BRUN))
        cell(S, r_, 16, f"=INDEX({GN}!$H${gr}:$J${gr},1,{SEGIDX})", align=CENTER, bg=bg, fmt="0.0%", font=F(size=9))
        eff = f"IF(AB{r_}=1,0,P{r_})"
        for donor in crit:
            if donor["transferTo"] == c["code"]:
                eff += f"+AB{rowof[donor['code']]}*P{rowof[donor['code']]}"
        cell(S, r_, 17, "=" + eff, align=CENTER, bg=bg, fmt="0.0%", font=F(size=9))
        cell(S, r_, 18, f'=IF(AND(L{r_}="Disponible",AA{r_}=0,AB{r_}=0),Q{r_},0)', align=CENTER, bg=bg, fmt="0.0%", font=F(size=9))
        S[f"AC{r_}"] = f"=IF(ISNUMBER(O{r_}),O{r_}*Q{r_},0)"
        S[f"AD{r_}"] = f"=IF(ISNUMBER(O{r_}),IF(AA{r_}=1,100,O{r_})*Q{r_},0)"
        cell(S, r_, 19, f"=IF(SUM($Q${first}:$Q${last})=0,0,AC{r_}/SUM($Q${first}:$Q${last}))", align=CENTER, bg=bg, fmt="0.00", font=F(size=9))
        if ratio and c["bins"]:
            qf = (f'=IF(N{r_}<>"","Cas particulier : "&N{r_},IF(Z{r_}="Croissant","100 si ≥ "&V{r_}&" · 75 si ≥ "&W{r_}&" · 50 si ≥ "&X{r_}&" · 25 si ≥ "&Y{r_}&" · sinon 0",'
                  f'"100 si ≤ "&V{r_}&" · 75 si ≤ "&W{r_}&" · 50 si ≤ "&X{r_}&" · 25 si ≤ "&Y{r_}&" · sinon 0"))')
        else:
            qf = f'=IF(ISNUMBER(O{r_}),IFERROR(INDEX({GN}!$X${gr}:$AB${gr},1,MATCH(O{r_},{{100,75,50,25,0}},0)),""),"")'
        cell(S, r_, 20, qf, bg=bg, font=F(size=8))
        if link:
            S.cell(r_, 8).comment = Comment(f"Source « Bilan » : valeur calculée dans l'onglet Bilan ({link['indicatorLabelFr']}). Choisissez « Saisie » pour la remplacer par votre valeur.", "Simulateur")
        S.row_dimensions[r_].height = 34
    for col in ["V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE"]:
        S.column_dimensions[col].hidden = True
    Q_, R_, AC_, AD_, AA_, AB_ = (f"${c}${first}:${c}${last}" for c in ("Q", "R", "AC", "AD", "AA", "AB"))
    C_RNG, G_RNG = f"$C${first}:$C${last}", f"$G${first}:$G${last}"

    # Synthèse par domaine + graphique
    D0 = last + 3
    section(S, D0, 2, "3. Synthèse par domaine")
    head(S, D0 + 1, 2, ["Domaine", "", "Libellé", "Poids", "Score", "", "Part observée", "Sous le seuil ?"])
    S.merge_cells(start_row=D0 + 1, start_column=2, end_row=D0 + 1, end_column=3)
    S.merge_cells(start_row=D0 + 1, start_column=6, end_row=D0 + 1, end_column=7)
    dom_rows = []
    for i, d in enumerate(g["domains"]):
        rr = D0 + 2 + i
        dom_rows.append(rr)
        bg = TINT if i % 2 == 0 else TINT2
        cell(S, rr, 2, d["code"], bg=bg, font=F(bold=True, color=BRUN), align=CENTER)
        S.merge_cells(start_row=rr, start_column=2, end_row=rr, end_column=3)
        cell(S, rr, 4, d["labelFr"], bg=bg)
        cell(S, rr, 5, f"=SUMIF({C_RNG},B{rr},{Q_})", bg=bg, fmt="0.0%", align=CENTER)
        cell(S, rr, 6, f'=IF(E{rr}=0,0,SUMIF({C_RNG},B{rr},{AC_})/E{rr})', bg=bg, fmt="0.0", align=CENTER, font=F(bold=True, color=BRUN))
        S.merge_cells(start_row=rr, start_column=6, end_row=rr, end_column=7)
        cell(S, rr, 8, f'=IF(E{rr}=0,"",SUMIF({C_RNG},B{rr},{R_})/E{rr})', bg=bg, fmt="0%", align=CENTER)
        cell(S, rr, 9, f'=IF(E{rr}=0,"",IF(H{rr}<{P["COV_D"]},"Oui","Non"))', bg=bg, align=CENTER)
    chart = BarChart()
    chart.type = "bar"
    chart.style = 10
    chart.title = "Score par domaine (sur 100)"
    chart.y_axis.scaling.min = 0
    chart.y_axis.scaling.max = 100
    chart.legend = None
    chart.add_data(Reference(S, min_col=6, min_row=dom_rows[0], max_row=dom_rows[-1]), titles_from_data=False)
    chart.set_categories(Reference(S, min_col=4, min_row=dom_rows[0], max_row=dom_rows[-1]))
    chart.series[0].graphicalProperties.solidFill = ORANGE
    chart.series[0].graphicalProperties.line.solidFill = ORANGE
    chart.dataLabels = DataLabelList()
    chart.dataLabels.showVal = True
    chart.height, chart.width = 7.5, 15
    S.add_chart(chart, f"K{D0}")
    DOM_DEF = f'COUNTIF($I${dom_rows[0]}:$I${dom_rows[-1]},"Oui")'
    DOM_LIST = "_xlfn.TEXTJOIN(\", \",TRUE," + ",".join(f'IF(I{rr}="Oui",B{rr},"")' for rr in dom_rows) + ")"

    # Résultats (à droite du cadrage)
    res_r = 7
    head(S, res_r, 9, ["Résultat", "", "", "Valeur"])
    S.merge_cells(start_row=res_r, start_column=9, end_row=res_r, end_column=11)
    S.merge_cells(start_row=res_r, start_column=12, end_row=res_r, end_column=20)
    order = []

    def result(key, label, formula="", fmt=None, big=False):
        rr = res_r + 1 + len(order)
        cell(S, rr, 9, label, font=F(bold=True, color=BRUN))
        S.merge_cells(start_row=rr, start_column=9, end_row=rr, end_column=11)
        x = cell(S, rr, 12, formula, align=Alignment(horizontal="left", vertical="center", wrap_text=True, indent=1),
                 font=F(size=14 if big else 10, bold=True, color=ORANGE if big else GRIS), bg=TINT if big else TINT2)
        for col in range(13, 21):
            S.cell(rr, col).border = BOX
        S.merge_cells(start_row=rr, start_column=12, end_row=rr, end_column=20)
        if fmt:
            x.number_format = fmt
        if big:
            S.row_dimensions[rr].height = 26
        order.append(key)
        R[key] = f"$L${rr}"

    crit_missing = f"SUMPRODUCT(({G_RNG}=\"Oui\")*({AA_}=1)*({AB_}=0))"
    for k, lab, big in [("status", "Statut de la notation", False), ("final", "Grade final", True), ("raw", "Score brut (0 à 100)", True), ("upper", "Score haut possible (données absentes à 100)", False),
                        ("engine", "Grade issu du score", False), ("cov", f"Couverture observée (minimum {g['coverage']['minGlobalObservedBps'] // 100} %)", False),
                        ("domdef", "Domaines sous le seuil de couverture", False), ("conf", "Confiance (score / classe)", False), ("critical", "Données critiques manquantes", False),
                        ("caps", "Exceptions appliquées", False), ("reviews", "Revues risques obligatoires", False), ("standalone", "Note autonome (après exceptions)", False),
                        ("support", "Support groupe", False), ("compliance", "Conformité", False), ("check", "Contrôle : résultat du moteur pour ce cas", False)]:
        result(k, lab, big=big)
    W = lambda key: R[key].replace("$", "")
    S[W("cov")] = f"=IF(SUM({Q_})=0,0,SUM({R_})/SUM({Q_}))"
    S[W("cov")].number_format = "0.0%"
    S[W("domdef")] = f'=IF({DOM_DEF}=0,"Aucun",{DOM_LIST})'
    S[W("critical")] = f'=IF({crit_missing}=0,"Aucune",{crit_missing}&" critère(s) critique(s) manquant(s) : notation impossible")'
    S[W("compliance")] = f'=IF({R["rf_block"]}="Oui","BLOQUÉ : aucune opération nouvelle ; note produite pour la surveillance",IF({R["rf_refer"]}="Oui","Alerte à revoir par l\'analyste","Aucun signal bloquant"))'
    comp = f"MIN({R['conf_comp']},ROUND({R['cov']}*100,2))"
    conf_score = f"({comp}*{P['W_COMP']}+{R['conf_fresh']}*{P['W_FRESH']}+{R['conf_rel']}*{P['W_REL']}+{R['conf_prov']}*{P['W_PROV']})"
    conf_class = f'IF({conf_score}>={P["CL_A"]},"A",IF({conf_score}>={P["CL_B"]},"B",IF({conf_score}>={P["CL_C"]},"C","U")))'
    S[W("conf")] = f'=FIXED({conf_score},2)&" — classe "&{conf_class}'
    grade_idx = lambda x: f"MATCH({x},{P['GRADES']},0)"
    # Exceptions : déclarées, ou calculées depuis la valeur observée (elle fait foi)
    cap_terms, cap_txt = [], []
    for cp in g["caps"]:
        d = cp["derivation"]
        if d:
            rr = rowof[d["criterion"]]
            cond = f'IF(AND(OR(L{rr}="Disponible",L{rr}="Estimée"),N{rr}="",ISNUMBER(M{rr})),M{rr}<{d["threshold"]},FALSE)'
        else:
            cond = f'{R[cp["code"]]}="Oui"'
        cap_terms.append(f"IF({cond},{grade_idx(CAPROW[cp['code']])},0)")
        cap_txt.append(f'IF({cond},"{cp["code"]} (plafond "&{CAPROW[cp["code"]]}&")","")')
    S[W("caps")] = (f'=IF(_xlfn.TEXTJOIN("",TRUE,{",".join(cap_txt)})="","Aucune",_xlfn.TEXTJOIN(", ",TRUE,{",".join(cap_txt)}))' if cap_txt else '="Aucune (grille sans plafond numéroté)"')
    rev_txt = []
    for mr in g["mandatoryReviews"]:
        rr = rowof[mr["criterion"]]
        lab = mr["labelFr"].replace('"', '""')
        rev_txt.append(f'IF(AND(OR(L{rr}="Disponible",L{rr}="Estimée"),N{rr}="",ISNUMBER(M{rr})),IF(M{rr}<{mr["threshold"]},"{mr["criterion"]} : {lab}",""),"")')
    S[W("reviews")] = (f'=IF(_xlfn.TEXTJOIN("",TRUE,{",".join(rev_txt)})="","Aucune",_xlfn.TEXTJOIN(" ; ",TRUE,{",".join(rev_txt)}))' if rev_txt else '="Aucune"')
    gate_ok = f'AND({R["cov"]}>={P["COV_G"]},{DOM_DEF}=0,{conf_class}<>"U")'
    raw_val = f"SUM({AC_})/SUM({Q_})"
    S[W("raw")] = f'=IF(OR(SUM({Q_})=0,{crit_missing}>0),"—",ROUND({raw_val},2))'
    S[W("raw")].number_format = "0.00"
    S[W("upper")] = f'=IF(SUM({Q_})=0,"—",ROUND(SUM({AD_})/SUM({Q_}),2))'
    S[W("upper")].number_format = "0.00"
    S[W("engine")] = f'=IF(AND(ISNUMBER({R["raw"]}),OR({R["default"]}="Oui",{gate_ok})),INDEX({P["GRADES"]},MATCH(1,INDEX(({R["raw"]}>={P["GMIN"]})*1,0),0)),"—")'
    std_idx = f"MAX({grade_idx(R['engine'])}" + ("," + ",".join(cap_terms) if cap_terms else "") + ")"
    S[W("standalone")] = f'=IF(OR({crit_missing}>0,{R["default"]}="Oui",NOT({gate_ok})),"—",INDEX({P["GRADES"]},{std_idx}))'
    if g["groupSupport"]["maxNotches"] > 0:
        all4 = f'AND({R["gs_cap"]}="Oui",{R["gs_will"]}="Oui",{R["gs_legal"]}="Oui",{R["gs_funds"]}="Oui")'
        notches = f"MIN({R['gs_notch']},{P['NOTCH']})"
        S[W("support")] = f'=IF({R["gs_claim"]}<>"Oui","Non demandé",IF({R["standalone"]}="—","Sans objet (pas de note autonome)",IF(NOT({all4}),"Refusé : les quatre conditions ne sont pas toutes documentées",IF({notches}=0,"Conditions remplies, aucun cran demandé","Relèvement de "&{notches}&" cran(s)"))))'
        final_rated = f'IF(AND({R["gs_claim"]}="Oui",{all4}),INDEX({P["GRADES"]},MAX(1,{grade_idx(R["standalone"])}-{notches})),{R["standalone"]})'
    else:
        S[W("support")] = '="Aucun cran accordé par la grille (appréciation instruite séparément)"'
        final_rated = R["standalone"]
    S[W("final")] = f'=IF({R["default"]}="Oui",{R["def_grade"]},IF({crit_missing}>0,"Aucun grade",IF(NOT({gate_ok}),"Aucun grade",{final_rated})))'
    S[W("status")] = (f'=IF({R["default"]}="Oui","Défaut constaté : le grade de défaut s\'impose, quel que soit le score",'
                      f'IF({crit_missing}>0,"Pas de notation : donnée critique manquante",'
                      f'IF(NOT({gate_ok}),"Pas de grade : information insuffisante (compléter le dossier)","Noté")))')
    if cases:
        S[W("check")] = (f'=IF({CIDX}=0,"(saisie libre : pas de référence)",INDEX({CR("ref_final")},1,{CIDX})&IF(ISNUMBER(INDEX({CR("ref_score")},1,{CIDX}))," — score "&FIXED(INDEX({CR("ref_score")},1,{CIDX}),2),"")'
                         f'&IF(AND(INDEX({CR("ref_final")},1,{CIDX})=IF({R["final"]}="Aucun grade","—",{R["final"]}),OR(INDEX({CR("ref_score")},1,{CIDX})="",NOT(ISNUMBER({R["raw"]})),ABS(N({R["raw"]})-N(INDEX({CR("ref_score")},1,{CIDX})))<0.01)),"  ✔ concordant","  ✘ écart"))')
    else:
        S[W("check")] = '="(pas de cas exemple pour cette grille)"'
    # Mise en forme conditionnelle
    S.conditional_formatting.add(W("check"), FormulaRule(formula=[f'ISNUMBER(SEARCH("écart",{W("check")}))'], font=Font(name="Arial", bold=True, color=RED)))
    S.conditional_formatting.add(W("check"), FormulaRule(formula=[f'ISNUMBER(SEARCH("concordant",{W("check")}))'], font=Font(name="Arial", bold=True, color=GREEN)))
    S.conditional_formatting.add(W("final"), FormulaRule(formula=[f'LEFT({W("final")},3)="DEF"'], fill=fill("F8D7D3"), font=Font(name="Arial", bold=True, size=14, color=RED)))
    S.conditional_formatting.add(W("final"), FormulaRule(formula=[f'{W("final")}="Aucun grade"'], fill=fill("EEEEEE"), font=Font(name="Arial", bold=True, size=14, color=GRIS)))
    S.conditional_formatting.add(f"I{dom_rows[0]}:I{dom_rows[-1]}", CellIsRule(operator="equal", formula=['"Oui"'], font=Font(name="Arial", bold=True, color=RED)))
    S.conditional_formatting.add(f"O{first}:O{last}", CellIsRule(operator="lessThanOrEqual", formula=["25"], font=Font(name="Arial", bold=True, color=RED)))
    S.conditional_formatting.add(f"O{first}:O{last}", CellIsRule(operator="greaterThanOrEqual", formula=["75"], font=Font(name="Arial", bold=True, color=GREEN)))
    S.conditional_formatting.add(f"I{first}:I{last}", CellIsRule(operator="equal", formula=['"Manquante"'], fill=fill("F8D7D3")))
    S.freeze_panes = S[f"E{first}"]
    S.sheet_properties.tabColor = ORANGE
    G.sheet_properties.tabColor = "8A5A3B"


for md in DATA["models"]:
    build_model(md)

# =================================================================================
# Accueil
# =================================================================================
A = wb.create_sheet("Accueil", 0)
banner(A, "SIMULATEUR DES GRILLES DE NOTATION — GROUPE BCP", "Notation interne des entreprises (TPE, PME, grandes entreprises), moteur 3.1. Outil pédagogique : seuls les résultats de l'outil de notation font foi.", 4)
A.column_dimensions["B"].width = 30
A.column_dimensions["C"].width = 100
head(A, 4, 2, ["Onglet", "Contenu"])
rows = [("Bilan", "Saisie du bilan et du CPC (N, N−1) ; les ratios de la grille se calculent comme dans l'outil, avec les contrôles (équilibre, résultat, totaux).")]
for name, mid, label in SIM_SHEETS:
    rows.append((name, f"Simulateur {mid} — {label}. Listes déroulantes, cas exemples, résultat en haut à droite, graphique par domaine."))
for name, (s_, g_) in [(SHORT[m["grid"]["modelId"]][0], SHORT[m["grid"]["modelId"]]) for m in DATA["models"]]:
    rows.append((g_, f"Paramètres, échelle de grades, plafonds, barèmes et repères de la grille « {s_} »."))
for i, (a, b) in enumerate(rows):
    rr = 5 + i
    c = cell(A, rr, 2, a, font=F(bold=True, color=ORANGE, underline="single"), bg=TINT)
    c.hyperlink = f"#'{a}'!A1"
    cell(A, rr, 3, b, bg=TINT2)
    A.row_dimensions[rr].height = 30
r2 = 5 + len(rows) + 1
section(A, r2, 2, "Mode d'emploi")
howto = [
    ("Saisir", "Cellules sur fond orangé, texte bleu : saisies. La plupart sont des listes déroulantes : cliquez sur la cellule, puis sur la flèche."),
    ("Repère qualitatif", "La liste affiche les cinq repères avec leur libellé (« 75 — … ») : choisissez celui qui décrit les faits ; le score est déduit."),
    ("Source « Bilan »", "Les ratios du bilan (fonds propres tangibles, levier, liquidité, conversion, couverture des intérêts, DSCR, free cash-flow) viennent de l'onglet Bilan. Choisissez « Saisie » pour imposer votre valeur."),
    ("Donnée absente", "Statut « Manquante » ou valeur vide : borne basse 0 (une absence ne vaut jamais mieux qu'une mauvaise valeur). Une donnée critique manquante empêche la notation. Le score haut possible est affiché à côté."),
    ("Cas particulier", "Liste propre à certains ratios (EBE négatif, fonds propres tangibles négatifs, liquidité excédentaire…) : il prime sur la valeur."),
    ("Matérialité", "Inconnue : le critère est évalué. Non matériel (justifié) : le critère est écarté et son poids passe au critère receveur."),
    ("Ordre du calcul", "Score par critère → poids du segment → score brut → défaut constaté (grade DEF) → porte de qualité (couverture, domaines, confiance) → grade issu du score → exceptions → support groupe."),
    ("Contrôle", "Chargez un cas exemple : la ligne « Contrôle » affiche « concordant » quand le simulateur retrouve le grade et le score du moteur de l'outil."),
]
for i, (a, b) in enumerate(howto):
    rr = r2 + 1 + i
    cell(A, rr, 2, a, font=F(bold=True, color=BRUN), bg=TINT)
    cell(A, rr, 3, b, bg=TINT2)
    A.row_dimensions[rr].height = 34
A.sheet_properties.tabColor = ORANGE
B.sheet_properties.tabColor = ORANGE
order = ["Accueil", "Bilan"]
for name, mid, _ in SIM_SHEETS:
    order += [name, SHORT[mid][1]] + ([f"Cas {name}"[:31]] if f"Cas {name}"[:31] in wb.sheetnames else [])
wb._sheets = [wb[n] for n in order]

for ws in wb.worksheets:
    ws.page_setup.orientation = "landscape"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_margins.left = ws.page_margins.right = 0.4
wb.active = 0
wb.save(OUT)
print("ok", OUT, wb.sheetnames)
