"""Map May ticket stop names → distance-matrix abbreviations.

Uses:
- ``Supporting data by HOD.xlsx`` StopsList (abbrs align with the 100-FLEET
  stop-to-stop distance workbook)
- curated aliases for common ETM spelling variants
- fuzzy match to HOD names whose abbr appears in the distance matrices
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd

# Ticket / ETM wording → HOD / distance-file abbr (only codes that exist in matrices).
CURATED_ALIASES: dict[str, str] = {
    "gangajaliabusstop": "GBS",
    "gangajaliyabusstop": "GBS",
    "gangajaliabus stop": "GBS",
    "top3circle": "T3C",
    "top3busdepo": "T3C",  # nearest terminal proxy when TBD absent from matrix
    "top3busdepot": "T3C",
    "vadlachowk": "SVD",  # Sihor Vadla Chowk
    "shivajicircle": "SVJ",
    "khodiyartemple": "KHM",
    "khodiyarmandir": "KHM",
    "valukadgam": "VUK",
    "bhagavaticircle": "BVC",  # Bhagvati Circle
    "bhagwaticircle": "BVC",
    "sankarmandal": "SRM",  # Sanskar Mandal
    "sanskarmandal": "SRM",
    "dukhishyamcircle": "DBC",
    "dukhishyambapacircle": "DBC",
    "kabirashram": "KAR",  # Kabir Ashram Road
    "mantreshcomplex": "MNT",
    "kamlejgam": "KMJ",
    "dilbaharwatertank": "DPT",  # Dilbahar Pani Ni Tanki
    "niskalankmahadev": "NMT",
    "nishkalankmahadev": "NMT",
    "niskalankmahadevtemple": "NMT",
    "bhidbhanjanhanuman": "BBM",  # Bhidbhanjan Mahadev
    "shitlamatemple": "SMA",
    "shitlamaatemple": "SMA",
    "shitalamatemple": "SMA",
    "hillparkchowk": "HPC",
    "hillparkchokadi": "HPC",
    "hillparkchokdi": "HPC",
    "leelacircle": "LLC",
    "bhavnagarterminus": "BVT",
    "avaniyagam": "AVG",
    "stbusstand": "STB",
    "haluriyachowk": "HLC",
    "rtocircle": "RTC",
    "dmart": "DMT",
    "shaktimatemple": "SMT",
    "shaktimaatemple": "SMT",
    "rammantratemple": "RMM",
    "rammantramandir": "RMM",
    "viranicircle": "VIR",
    "valantinecircle": "VIR",
    "ghoghagam": "GGG",
    "crescentcircle": "CRC",
    "cresentcircle": "CRC",
    "bortalavaroad": "BTR",
    "sahjanandschoolghoghabypass": "SJS",
    "sahajanandschool": "SJS",
    # HOD-aligned spellings / typos (abbr must exist in distance matrix)
    "vallabhresidecycapitalheroshowpase": "VRC",
    "vallabhresidencycapitalheroshowpase": "VRC",
    "vallabhresidencycapitalheroshowroompace": "VRC",
    "vallabhresidencycapitalheroshowroompase": "VRC",
    "haluriyacircle": "HLC",
    "isconclub": "ISE",  # HOD: Iscon Eleven (nearest coded stop)
}


def normalize_stop_name(name: object) -> str:
    if name is None or (isinstance(name, float) and pd.isna(name)):
        return ""
    s = str(name).lower().strip()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = (
        s.replace("chokadi", "chowk")
        .replace("chokdi", "chowk")
        .replace("chawk", "chowk")
        .replace("mandir", "temple")
        .replace("maa", "ma")
        .replace("d_mart", "dmart")
        .replace("d-mart", "dmart")
        .replace("d mart", "dmart")
        .replace("bus stop", "busstop")
        .replace("bus depot", "busdepot")
        .replace("gangajaliya", "gangajalia")
        .replace("adhevada", "adhewada")
        .replace("nishkalank", "niskalank")
        .replace("cresent", "crescent")
        .replace("bhagwati", "bhagavati")
        .replace("sanskar", "sankar")
        .replace("residecy", "residency")
        .replace("show pase", "showroom pace")
        .replace("showpase", "showroompace")
    )
    return re.sub(r"[^a-z0-9]+", "", s)


def load_matrix_abbrs(distance_xlsx: Path) -> set[str]:
    abbrs: set[str] = set()
    for sheet in pd.ExcelFile(distance_xlsx).sheet_names:
        df = pd.read_excel(distance_xlsx, sheet_name=sheet)
        for od in df.iloc[:, 0].tolist():
            if pd.isna(od):
                continue
            parts = re.split(r"\s*-\s*", str(od).strip())
            if len(parts) == 2:
                abbrs.add(parts[0].strip().upper())
                abbrs.add(parts[1].strip().upper())
    return abbrs


def load_hod_stops(hod_xlsx: Path) -> pd.DataFrame:
    hod = pd.read_excel(hod_xlsx, sheet_name="StopsList")
    hod = hod.copy()
    hod["abbr"] = hod["Final_Abbr"].astype(str).str.strip().str.upper()
    hod["name_n"] = hod["Final_Name"].map(normalize_stop_name)
    hod = hod[hod["abbr"].notna() & ~hod["abbr"].isin(["", "NAN", "NONE"])]
    return hod.reset_index(drop=True)


def build_stop_name_map(
    ticket_names: list[str],
    *,
    hod_xlsx: Path,
    distance_xlsx: Path,
    fuzzy_threshold: float = 0.80,
) -> pd.DataFrame:
    """Return a DataFrame mapping each ticket stop name to a matrix abbr."""
    hod = load_hod_stops(hod_xlsx)
    matrix_abbrs = load_matrix_abbrs(distance_xlsx)
    hod_m = hod[hod["abbr"].isin(matrix_abbrs)].copy()
    hod_by_norm = {r["name_n"]: r["abbr"] for _, r in hod_m.iterrows() if r["name_n"]}
    hod_by_abbr = {r["abbr"]: r["Final_Name"] for _, r in hod_m.iterrows()}

    # Seed with curated + exact HOD names
    aliases = dict(CURATED_ALIASES)
    for n, a in hod_by_norm.items():
        aliases.setdefault(n, a)

    rows = []
    for name in ticket_names:
        n = normalize_stop_name(name)
        abbr = None
        method = "unmatched"
        score = 0.0
        if n in aliases:
            abbr = aliases[n]
            method = "alias"
            score = 1.0
        elif n:
            for k, a in hod_by_norm.items():
                if k and (k in n or n in k) and min(len(k), len(n)) >= 6:
                    abbr, method, score = a, "substr", 0.92
                    break
            if abbr is None:
                best_k, best_sc = None, 0.0
                for k in hod_by_norm:
                    sc = SequenceMatcher(None, n, k).ratio()
                    if sc > best_sc:
                        best_sc, best_k = sc, k
                if best_k and best_sc >= fuzzy_threshold:
                    abbr, method, score = hod_by_norm[best_k], "fuzzy", best_sc

        if abbr and abbr not in matrix_abbrs:
            method = f"{method}_not_in_matrix"
            abbr = None

        rows.append(
            {
                "ticket_stop_name": name,
                "norm": n,
                "matrix_abbr": abbr,
                "match_score": round(float(score), 3) if abbr else 0.0,
                "match_method": method if abbr else ("unmatched" if not method.endswith("not_in_matrix") else method),
                "in_distance_matrix": bool(abbr),
                "hod_name": hod_by_abbr.get(abbr) if abbr else None,
            }
        )
    return pd.DataFrame(rows)
