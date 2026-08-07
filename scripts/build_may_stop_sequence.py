"""Project April stop-sequence files onto May calendar for BA.

Also reports anomalies (stale Date columns in April extracts, abbr remaps,
directions/stops that will not join May tickets).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from etram.ingest.transforms import route_direction_key  # noqa: E402

APRIL_SEQ = ROOT / "Input files" / "April Data" / "Stops sequence"
MAY_SEQ = ROOT / "Input files" / "May Data" / "Upload" / "Stops sequence"
HOD = ROOT / "Input files" / "May Data" / "Working" / "Supporting data by HOD.xlsx"
OLD = ROOT / "Input files" / "May Data" / "Upload" / "Supporting data.xlsx"
REPORT = ROOT / "Input files" / "May Data" / "Working" / "stop_sequence_may_from_april_anomalies.csv"
SHEET = "StopsSeq"


def _norm_name(x: object) -> str:
    s = str(x).lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def build_abbr_remap() -> dict[str, str]:
    """Map old Supporting abbr → HOD abbr when stop names match."""
    hod = pd.read_excel(HOD, sheet_name="StopsList")
    old = pd.read_excel(OLD, sheet_name="StopsList")
    hod = hod.copy()
    old = old.copy()
    hod["abbr"] = hod["Final_Abbr"].astype(str).str.strip().str.upper()
    old["abbr"] = old["Final_Abbr"].astype(str).str.strip().str.upper()
    hod["n"] = hod["Final_Name"].map(_norm_name)
    old["n"] = old["Final_Name"].map(_norm_name)
    hod_by_n = {r["n"]: r["abbr"] for _, r in hod.iterrows() if r["n"] and r["abbr"] not in ("", "NAN")}
    remap: dict[str, str] = {}
    for _, r in old.iterrows():
        a_old = r["abbr"]
        if not a_old or a_old in ("NAN", "NONE"):
            continue
        a_hod = hod_by_n.get(r["n"])
        if a_hod and a_hod != a_old:
            remap[a_old] = a_hod
        elif a_old in set(hod["abbr"]):
            remap[a_old] = a_old
        elif a_hod:
            remap[a_old] = a_hod
    # identity for HOD codes already used on tickets
    for a in hod["abbr"]:
        remap.setdefault(a, a)
    return remap


def load_april_templates() -> tuple[dict[pd.Timestamp, pd.DataFrame], list[dict]]:
    """Return {canonical_date: frame} and anomaly rows for April file issues."""
    files = sorted(p for p in APRIL_SEQ.glob("*.xlsx") if not p.name.startswith("~$"))
    by_date: dict[pd.Timestamp, pd.DataFrame] = {}
    anomalies: list[dict] = []
    for f in files:
        raw = pd.read_excel(f, sheet_name=SHEET)
        if raw.empty:
            anomalies.append(
                {"kind": "empty_file", "file": f.name, "detail": "no rows"}
            )
            continue
        dates = pd.to_datetime(raw["Date"], errors="coerce")
        file_day = None
        m = re.match(r"(\d{2})-(\d{2})-(\d{4})", f.stem)
        if m:
            file_day = pd.Timestamp(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        unique_dates = sorted(dates.dropna().dt.normalize().unique())
        if not unique_dates:
            anomalies.append({"kind": "no_dates", "file": f.name, "detail": ""})
            continue
        content_date = pd.Timestamp(unique_dates[0])
        if file_day is not None and content_date.normalize() != file_day.normalize():
            anomalies.append(
                {
                    "kind": "date_mismatch_filename_vs_Date_column",
                    "file": f.name,
                    "detail": f"filename={file_day.date()} Date_column={content_date.date()}",
                }
            )
        # Keep first occurrence of each distinct content date as the template.
        if content_date not in by_date:
            by_date[content_date] = raw.copy()
        else:
            anomalies.append(
                {
                    "kind": "duplicate_content_date_skipped",
                    "file": f.name,
                    "detail": f"already have template for {content_date.date()}",
                }
            )
    return by_date, anomalies


def pick_template(
    may_day: pd.Timestamp, templates: dict[pd.Timestamp, pd.DataFrame]
) -> tuple[pd.Timestamp, pd.DataFrame, str]:
    """Map May calendar day → an April template date."""
    ordered = sorted(templates.keys())
    # Prefer same day-of-month when that April day exists as a true template.
    cand = pd.Timestamp(2026, 4, min(may_day.day, 30))
    if cand in templates:
        note = "same_day_of_month"
        if may_day.day == 31:
            note = "may_31_uses_april_30_template"
        return cand, templates[cand], note
    # Fall back to last available April template (typically 2026-04-12 given extract bug)
    last = ordered[-1]
    return last, templates[last], f"fallback_to_{last.date()}"


def main() -> None:
    remap = build_abbr_remap()
    templates, april_anoms = load_april_templates()
    print(f"April unique sequence templates: {len(templates)} -> {sorted(d.date() for d in templates)}")
    for a in april_anoms:
        if a["kind"] == "date_mismatch_filename_vs_Date_column":
            print(f"  ANOMALY: {a['file']}: {a['detail']}")

    MAY_SEQ.mkdir(parents=True, exist_ok=True)
    # clear previous generated files
    for p in MAY_SEQ.glob("*.xlsx"):
        if not p.name.startswith("~$"):
            p.unlink()

    report_rows = list(april_anoms)
    may_days = pd.date_range("2026-05-01", "2026-05-31", freq="D")
    for may_day in may_days:
        src_date, frame, note = pick_template(may_day, templates)
        out = frame.copy()
        out["Date"] = may_day
        # Remap stop codes to HOD so they join May ticket abbrs
        codes = out["Stop code"].astype(str).str.strip().str.upper()
        mapped = codes.map(lambda c: remap.get(c, c))
        n_changed = int((mapped != codes).sum())
        out["Stop code"] = mapped
        out_path = MAY_SEQ / f"{may_day.day:02d}-05-2026.xlsx"
        out.to_excel(out_path, sheet_name=SHEET, index=False)
        report_rows.append(
            {
                "kind": "may_day_mapped",
                "file": out_path.name,
                "detail": f"template={src_date.date()} note={note} abbr_remaps={n_changed}",
            }
        )
        if note.startswith("fallback") or "may_31" in note:
            report_rows.append(
                {
                    "kind": "template_reuse_anomaly",
                    "file": out_path.name,
                    "detail": f"Uses April template {src_date.date()} ({note})",
                }
            )

    # Direction / abbr coverage vs May tickets (if ingest CSV present)
    ingest = ROOT / "Input files" / "May Data" / "Working" / "ETM_Bhavnagar_May_2026_ingest.csv"
    if ingest.exists():
        tickets = pd.read_csv(
            ingest, usecols=["Route No.", "Route description", "Pass. Origin", "Pass. Destination"]
        )
        tickets["route_direction_key"] = [
            route_direction_key(c, d)
            for c, d in zip(tickets["Route No."], tickets["Route description"])
        ]
        # sample one May day sequence
        sample = pd.read_excel(MAY_SEQ / "01-05-2026.xlsx", sheet_name=SHEET)
        sample["route_direction_key"] = [
            route_direction_key(c, d)
            for c, d in zip(sample["Route No."], sample["Route_Description"])
        ]
        seq_dirs = set(sample["route_direction_key"])
        tkt_dirs = set(tickets["route_direction_key"])
        for d in sorted(tkt_dirs - seq_dirs):
            report_rows.append(
                {
                    "kind": "ticket_direction_missing_in_sequence",
                    "file": "",
                    "detail": d,
                }
            )
        seq_abbr = set(sample["Stop code"].astype(str).str.strip().str.upper())
        miss_counts: dict[str, int] = {}
        for col in ["Pass. Origin", "Pass. Destination"]:
            for abbr, n in (
                tickets[col].dropna().astype(str).str.strip().str.upper().value_counts().items()
            ):
                if abbr and abbr not in seq_abbr and abbr not in ("NAN", "NONE"):
                    miss_counts[abbr] = miss_counts.get(abbr, 0) + int(n)
        for abbr, n in sorted(miss_counts.items(), key=lambda x: -x[1])[:40]:
            report_rows.append(
                {
                    "kind": "ticket_abbr_not_in_may_sequence_template",
                    "file": abbr,
                    "detail": f"endpoint_touches≈{n}",
                }
            )

    rep = pd.DataFrame(report_rows)
    rep.to_csv(REPORT, index=False)
    print(f"Wrote {len(list(MAY_SEQ.glob('*.xlsx')))} May sequence files -> {MAY_SEQ}")
    print(f"Anomaly report -> {REPORT}")
    print(rep["kind"].value_counts().to_string())


if __name__ == "__main__":
    main()
