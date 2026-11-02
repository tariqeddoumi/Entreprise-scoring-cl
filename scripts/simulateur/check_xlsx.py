"""Contrôle du simulateur : recalcule chaque cas exemple avec LibreOffice et
vérifie que le classeur retrouve le grade et le score du moteur de l'outil,
ainsi que les ratios de l'onglet Bilan.

    python3 scripts/simulateur/check_xlsx.py docs/simulateur/Simulateur_notation_entreprises.xlsx /tmp/sim-check
"""
import glob
import os
import shutil
import subprocess
import sys

from openpyxl import load_workbook

SRC, WORK = sys.argv[1], sys.argv[2]
EXPECTED_RATIOS = sys.argv[3].split(",") if len(sys.argv) > 3 else ["39.77", "1.71", "1.68", "78.57", "7", "1.57", "13.11"]
os.makedirs(WORK, exist_ok=True)
for f in glob.glob(os.path.join(WORK, "*.xlsx")):
    os.remove(f)

wb = load_workbook(SRC)
jobs = []
for ws in wb.worksheets:
    if ws["B4"].value != "Cas chargé":
        continue
    cases = load_workbook(SRC, read_only=True)[f"Cas {ws.title}"[:31]] if f"Cas {ws.title}"[:31] in wb.sheetnames else None
    if cases is None:
        continue
    names = [c.value for c in next(cases.iter_rows(min_row=4, max_row=4)) if c.value and " — " in str(c.value)]
    for n in names:
        w = load_workbook(SRC)
        w[ws.title]["D4"] = n
        w.active = w.sheetnames.index(ws.title)
        path = os.path.join(WORK, f"{len(jobs):02d}.xlsx")
        w.save(path)
        jobs.append((ws.title, n, path))
jobs.append(("Bilan", "exemple", None))
shutil.copy(SRC, os.path.join(WORK, "bilan.xlsx"))
out = os.path.join(WORK, "out")
os.makedirs(out, exist_ok=True)
files = sorted(glob.glob(os.path.join(WORK, "*.xlsx")))
subprocess.run(["soffice", "--headless", "--calc", "--convert-to", "xlsx", "--outdir", out, *files], check=True, capture_output=True)

ok = True
for sheet, name, path in jobs[:-1]:
    r = load_workbook(os.path.join(out, os.path.basename(path)), data_only=True)[sheet]
    res = {}
    for row in range(8, 30):
        if r.cell(row, 9).value:
            res[r.cell(row, 9).value] = r.cell(row, 12).value
    check = next((v for k, v in res.items() if str(k).startswith("Contrôle")), "")
    final = next((v for k, v in res.items() if str(k).startswith("Grade final")), "")
    raw = next((v for k, v in res.items() if str(k).startswith("Score brut")), "")
    good = "concordant" in str(check)
    ok &= good
    print(("OK  " if good else "ÉCART"), sheet, "|", name, "|", final, raw, "|", check)

b = load_workbook(os.path.join(out, "bilan.xlsx"), data_only=True)["Bilan"]
vals = {}
for row in b.iter_rows(min_row=1, max_col=6):
    lab = row[1].value
    if isinstance(lab, str) and row[3].value not in (None, "") and row[2].value and "/" in str(row[2].value) or (isinstance(lab, str) and lab.startswith(("Liquidité", "DSCR", "Couverture des", "Conversion", "Free", "Fonds propres", "Dette nette"))):
        vals[lab] = row[3].value
    if isinstance(lab, str) and lab.startswith(("Équilibre", "Résultat du bilan", "Total actif du", "Exercice N−1")):
        print("Contrôle", lab, "→", row[3].value)
got = [vals.get(k) for k in vals if k.startswith(("Fonds propres", "Dette nette", "Liquidité", "Conversion", "Couverture des", "DSCR", "Free"))]
print("Ratios", got)
good = [f"{float(x):g}" for x in got] == [f"{float(x):g}" for x in EXPECTED_RATIOS]
ok &= good
print("Bilan", "OK" if good else "ÉCART (attendu " + ", ".join(EXPECTED_RATIOS) + ")")
sys.exit(0 if ok else 1)
