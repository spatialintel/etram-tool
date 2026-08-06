"""Excel → canonical Parquet ingest."""
from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET

import pandas as pd
import yaml

from etram.ingest.dq import build_dq_report, write_dq_report
from etram.ingest.transforms import fill_down_trip_times, make_time_slots, coerce_time, _blank_to_na


def load_mapping(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve(root: Path, rel: str) -> Path:
    p = Path(rel)
    return p if p.is_absolute() else (root / p)


def _rename(df: pd.DataFrame, mapping: dict[str, str]) -> pd.DataFrame:
    missing = [c for c in mapping if c not in df.columns]
    if missing:
        raise KeyError(f"Missing source columns: {missing}. Have: {list(df.columns)}")
    out = df[list(mapping.keys())].rename(columns=mapping)
    return out


def _clean_str(s: pd.Series) -> pd.Series:
    s = _blank_to_na(s)
    return s.astype("string")


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    # Mean Earth radius in km (WGS84 authalic radius).
    r = 6371.0088
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * r * math.asin(math.sqrt(a))


def _linestring_length_km(coord_text: str) -> float:
    points: list[tuple[float, float]] = []
    for token in coord_text.replace("\n", " ").split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        lon = float(parts[0])
        lat = float(parts[1])
        points.append((lat, lon))
    if len(points) < 2:
        return 0.0
    return sum(
        _haversine_km(lat1, lon1, lat2, lon2)
        for (lat1, lon1), (lat2, lon2) in zip(points, points[1:])
    )


def _kml_route_lengths(path: Path) -> dict[str, float]:
    """Extract route lengths from KML LineString placemarks as {Rxx: km}."""
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    root = ET.parse(path).getroot()
    out: dict[str, float] = {}
    for pm in root.findall(".//k:Placemark", ns):
        linestring = pm.find(".//k:LineString", ns)
        if linestring is None:
            continue
        name = (pm.findtext("k:name", default="", namespaces=ns) or "").strip()
        m = re.search(r"(?:ROUTE\s*NO\.?|ROUTE)\s*(\d+[A-Z]?)", name, re.IGNORECASE)
        if not m:
            continue
        route_code = f"R{m.group(1).upper()}"
        coords = linestring.findtext("k:coordinates", default="", namespaces=ns)
        if not coords:
            continue
        out[route_code] = _linestring_length_km(coords)
    return out


def load_stops(cfg: dict, root: Path) -> pd.DataFrame:
    src = cfg["sources"]["supporting"]
    path = _resolve(root, src["path"])
    raw = pd.read_excel(path, sheet_name=src["sheets"]["stops"])
    df = _rename(raw, cfg["stops"])
    df["stop_abbr"] = _clean_str(df["stop_abbr"])
    df = df[df["stop_abbr"].notna()].copy()
    df["agency_id"] = cfg["agency_id"]
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["stop_name"] = _clean_str(df["stop_name"])
    df["stop_code_alt"] = _clean_str(df["stop_code_alt"])
    return df.reset_index(drop=True)


def load_routes(cfg: dict, root: Path) -> pd.DataFrame:
    src = cfg["sources"]["supporting"]
    path = _resolve(root, src["path"])
    raw = pd.read_excel(path, sheet_name=src["sheets"]["routes"])
    # drop fully empty unnamed cols
    raw = raw.loc[:, ~raw.columns.astype(str).str.startswith("Unnamed")]
    df = _rename(raw, cfg["routes"])
    df["route_code"] = _clean_str(df["route_code"])
    df = df[df["route_code"].notna()].copy()
    df["agency_id"] = cfg["agency_id"]
    df["route_length_km"] = pd.to_numeric(df["route_length_km"], errors="coerce")
    df["route_name"] = _clean_str(df["route_name"])
    df["route_description"] = _clean_str(df["route_description"])
    df["route_category"] = _clean_str(df["route_category"])
    kml_cfg = cfg.get("kml_route_lengths") or {}
    if kml_cfg.get("path"):
        kml_path = _resolve(root, kml_cfg["path"])
        if kml_path.exists():
            km_by_code = _kml_route_lengths(kml_path)
            aliases = {
                str(k).strip().upper(): str(v).strip().upper()
                for k, v in (kml_cfg.get("route_code_aliases") or {}).items()
            }
            desc_overrides = [
                (str(key).strip().lower(), str(val).strip().upper())
                for key, val in (kml_cfg.get("description_code_overrides") or {}).items()
            ]
            route_codes = df["route_code"].astype(str).str.strip().str.upper()
            route_desc = df["route_description"].fillna("").astype(str).str.lower()
            kml_codes = route_codes.map(lambda c: aliases.get(c, c))
            for needle, code in desc_overrides:
                if not needle:
                    continue
                kml_codes = kml_codes.where(~route_desc.str.contains(needle), code)
            kml_lengths = kml_codes.map(km_by_code)
            df["route_length_km"] = kml_lengths.where(kml_lengths.notna(), df["route_length_km"])
    df["route_direction_key"] = (
        df["route_code"].astype(str) + "-" + df["route_description"].astype(str)
    )
    return df.reset_index(drop=True)


def load_vehicles(cfg: dict, root: Path) -> pd.DataFrame:
    src = cfg["sources"]["supporting"]
    path = _resolve(root, src["path"])
    raw = pd.read_excel(path, sheet_name=src["sheets"]["vehicles"])
    df = _rename(raw, cfg["vehicles"])
    df["vehicle_id"] = _clean_str(df["vehicle_id"])
    if cfg.get("transforms", {}).get("vehicle_id_strip_spaces"):
        df["vehicle_id"] = df["vehicle_id"].str.replace(" ", "", regex=False)
    df = df[df["vehicle_id"].notna()].copy()
    df["agency_id"] = cfg["agency_id"]
    df["vehicle_type"] = _clean_str(df["vehicle_type"])
    df["capacity"] = pd.to_numeric(df["capacity"], errors="coerce").astype("Int64")
    return df.reset_index(drop=True)


def load_tickets(cfg: dict, root: Path) -> pd.DataFrame:
    src = cfg["sources"]["etm"]
    path = _resolve(root, src["path"])
    raw = pd.read_excel(path, sheet_name=src["sheet"])
    df = _rename(raw, cfg["tickets"])
    df["agency_id"] = cfg["agency_id"]

    df["service_date"] = pd.to_datetime(df["service_date"], errors="coerce").dt.normalize()
    for c in (
        "ticket_id",
        "route_code",
        "route_description",
        "depot",
        "vehicle_id",
        "driver_id",
        "conductor_id",
        "pass_category",
        "origin_abbr",
        "destination_abbr",
        "gender",
    ):
        df[c] = _clean_str(df[c])

    if cfg.get("transforms", {}).get("vehicle_id_strip_spaces"):
        df["vehicle_id"] = df["vehicle_id"].str.replace(" ", "", regex=False)

    df["trip_no"] = pd.to_numeric(df["trip_no"], errors="coerce").astype("Int64")
    df["passengers"] = pd.to_numeric(df["passengers"], errors="coerce").fillna(0).astype("Int64")
    df["child_passengers"] = (
        pd.to_numeric(df["child_passengers"], errors="coerce").fillna(0).astype("Int64")
    )
    df["origin_stop_no"] = pd.to_numeric(df["origin_stop_no"], errors="coerce").astype("Int64")
    df["destination_stop_no"] = pd.to_numeric(df["destination_stop_no"], errors="coerce").astype(
        "Int64"
    )
    df["stage_km"] = pd.to_numeric(df["stage_km"], errors="coerce")
    df["revenue"] = pd.to_numeric(df["revenue"], errors="coerce")

    df["ticket_issue_time"] = coerce_time(df["ticket_issue_time"])
    df["trip_start_time"] = coerce_time(df["trip_start_time"])
    df["trip_end_time"] = coerce_time(df["trip_end_time"])

    if cfg.get("transforms", {}).get("etm_fill_down_trip_times"):
        df = fill_down_trip_times(df)

    # Verified vs PBIX
    df["total_passengers"] = (df["passengers"].fillna(0) + df["child_passengers"].fillna(0)).astype(
        "Int64"
    )
    df["pax_km"] = df["total_passengers"].astype(float) * df["stage_km"]

    df["bus_trip_key"] = df["vehicle_id"].astype(str) + "-" + df["trip_no"].astype(str)
    df["route_direction_key"] = (
        df["route_code"].astype(str) + "-" + df["route_description"].astype(str)
    )
    df["stop_origin_key"] = (
        df["origin_stop_no"].astype(str) + "-" + df["origin_abbr"].astype(str)
    )
    df["stop_destination_key"] = (
        df["destination_stop_no"].astype(str) + "-" + df["destination_abbr"].astype(str)
    )

    # drop junk header repeats if any
    df = df[df["service_date"].notna()].copy()
    return df.reset_index(drop=True)


def load_stop_sequence(cfg: dict, root: Path) -> pd.DataFrame:
    src = cfg["sources"]["stop_sequence"]
    folder = _resolve(root, src["path"])
    files = sorted(folder.glob(src.get("file_glob", "*.xlsx")))
    files = [f for f in files if not f.name.startswith("~$")]
    if not files:
        raise FileNotFoundError(f"No stop sequence files in {folder}")

    frames = []
    for f in files:
        raw = pd.read_excel(f, sheet_name=src["sheet"])
        part = _rename(raw, cfg["stop_sequence"])
        part["_source_file"] = f.name
        frames.append(part)

    df = pd.concat(frames, ignore_index=True)
    df["agency_id"] = cfg["agency_id"]
    df["service_date"] = pd.to_datetime(df["service_date"], errors="coerce").dt.normalize()
    df["route_code"] = _clean_str(df["route_code"])
    df["route_description"] = _clean_str(df["route_description"])
    df["stop_id"] = _clean_str(df["stop_id"])
    df["stop_name"] = _clean_str(df["stop_name"])
    df["stop_abbr"] = _clean_str(df["stop_abbr"])
    df["segment"] = _clean_str(df["segment"])
    df["stop_no"] = pd.to_numeric(df["stop_no"], errors="coerce").astype("Int64")

    # seq_index: order within route-date-direction as in file (PBIX Index)
    df = df.sort_values(["service_date", "route_code", "route_description", "stop_no"]).reset_index(
        drop=True
    )
    df["seq_index"] = (
        df.groupby(["service_date", "route_code", "route_description"], dropna=False).cumcount() + 1
    )
    # Also keep a global-ish index compatible with joins later; BA uses Index from PQ merge
    # For Phase 1 we store both stop_no order and a dense seq_index per route-date.
    df["stop_abbr_key"] = df["stop_no"].astype(str) + "-" + df["stop_abbr"].astype(str)
    df["route_direction_key"] = (
        df["route_code"].astype(str) + "-" + df["route_description"].astype(str)
    )
    df = df.drop(columns=["_source_file"])
    # Later calendar-day files may still carry earlier dates — keep one stop chain
    df = df.drop_duplicates(
        subset=["agency_id", "service_date", "route_direction_key", "stop_no", "stop_abbr"],
        keep="first",
    )
    return df.reset_index(drop=True)


def write_parquet_tables(tables: dict[str, pd.DataFrame], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, df in tables.items():
        path = out_dir / f"{name}.parquet"
        df.to_parquet(path, index=False)


def run_ingest(mapping_path: Path, root: Path | None = None) -> dict[str, Any]:
    root = root or _project_root()
    cfg = load_mapping(mapping_path)
    agency_id = cfg["agency_id"]

    agencies = pd.DataFrame(
        [
            {
                "agency_id": agency_id,
                "agency_name": cfg.get("agency_name", agency_id),
                "timezone": cfg.get("timezone", "Asia/Kolkata"),
            }
        ]
    )
    stops = load_stops(cfg, root)
    routes = load_routes(cfg, root)
    vehicles = load_vehicles(cfg, root)
    tickets = load_tickets(cfg, root)
    stop_sequence = load_stop_sequence(cfg, root)
    time_slots = make_time_slots()

    tables = {
        "agencies": agencies,
        "stops": stops,
        "routes": routes,
        "vehicles": vehicles,
        "tickets": tickets,
        "stop_sequence": stop_sequence,
        "time_slots": time_slots,
    }

    out_dir = root / "data" / "canonical" / agency_id
    write_parquet_tables(tables, out_dir)

    report = build_dq_report(agency_id, tables)
    write_dq_report(report, out_dir / "dq_report.json")

    # DuckDB sanity view file (optional pointer)
    (out_dir / "README.txt").write_text(
        "Canonical Parquet for agency "
        + agency_id
        + "\nQuery with DuckDB: SELECT * FROM read_parquet('tickets.parquet');\n",
        encoding="utf-8",
    )
    return report
