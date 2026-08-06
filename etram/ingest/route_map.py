"""Parse ETM Route Description → Route ID and KML route code.

May Conductor Reports leave Route Number blank and embed the route in
``Route Description`` strings such as::

    Route 01_Gangajaliya Bus stop_Top 3 Bus depo
    Route_04 (E) Adhevada Gram Panchayat_Gangajaliya Bus stop
    R_006_Avaniya Gam_TO_Gangajaliya Bus stop

KML placemarks use slightly different codes (R4Z for express R4E, R6E for
Avaniya variants). Endpoint stop names disambiguate those cases.
"""
from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from pathlib import Path

# ETM route_code → KML LineString code when names differ.
ETM_TO_KML_ALIAS: dict[str, str] = {
    "R4E": "R4Z",
}

# First/last stop tokens that force a KML override regardless of numeric id.
ENDPOINT_KML_OVERRIDE: list[tuple[str, str]] = [
    ("avaniya", "R6E"),  # R6 Avaniya directions map to KML R6E
]


def normalize_stop(name: str) -> str:
    s = str(name).lower().strip()
    s = re.sub(r"\([^)]*\)", "", s)
    s = s.replace(" to ", " ").replace("_to_", " ").replace("to_", " ")
    s = re.sub(r"[_\s]+", " ", s).strip()
    return s


def split_route_description(desc: str | None) -> tuple[str | None, str | None, str | None]:
    """Return (route_code, first_stop, last_stop) from a Route Description string."""
    if desc is None or (isinstance(desc, float) and math.isnan(desc)):
        return None, None, None
    text = str(desc).strip()
    if not text:
        return None, None, None

    # Prefix: Route 01 / Route_04 (E) / R_006 / Route_9 / Route 8
    m = re.match(
        r"^(?:Route|R)[_\s]*0*(\d+)\s*(\([Ee]\))?[_\s]*(.*)$",
        text,
        flags=re.IGNORECASE,
    )
    if not m:
        return None, None, None

    code = f"R{int(m.group(1))}"
    if m.group(2):
        code += "E"

    rest = (m.group(3) or "").strip(" _")
    # Endpoints are usually joined by underscore; also tolerate " TO " / " to ".
    parts = [p.strip() for p in re.split(r"\s*_\s*", rest) if p.strip()]
    # Drop connector tokens like TO / To
    parts = [p for p in parts if p.lower() not in {"to", "via"}]
    if len(parts) >= 2:
        first, last = parts[0], parts[-1]
    elif len(parts) == 1:
        first, last = parts[0], None
    else:
        first, last = None, None
    return code, first, last


def kml_code_for(route_code: str | None, first_stop: str | None, last_stop: str | None) -> str | None:
    if not route_code:
        return None
    ends = f"{normalize_stop(first_stop or '')} {normalize_stop(last_stop or '')}"
    for needle, kml_code in ENDPOINT_KML_OVERRIDE:
        if needle in ends:
            return kml_code
    return ETM_TO_KML_ALIAS.get(route_code, route_code)


def load_kml_route_lengths(path: Path) -> dict[str, float]:
    ns = {"k": "http://www.opengis.net/kml/2.2"}
    root = ET.parse(path).getroot()
    earth_km = 6371.0088

    def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
        return 2 * earth_km * math.asin(math.sqrt(a))

    def line_len(coord_text: str) -> float:
        pts: list[tuple[float, float]] = []
        for token in coord_text.replace("\n", " ").split():
            parts = token.split(",")
            if len(parts) >= 2:
                pts.append((float(parts[1]), float(parts[0])))
        return sum(haversine(*a, *b) for a, b in zip(pts, pts[1:]))

    out: dict[str, float] = {}
    for pm in root.findall(".//k:Placemark", ns):
        linestring = pm.find(".//k:LineString", ns)
        if linestring is None:
            continue
        name = (pm.findtext("k:name", default="", namespaces=ns) or "").strip()
        m = re.search(r"(?:ROUTE\s*NO\.?|ROUTE)\s*(\d+[A-Z]?)", name, re.IGNORECASE)
        if not m:
            continue
        coords = linestring.findtext("k:coordinates", default="", namespaces=ns)
        if not coords:
            continue
        out[f"R{m.group(1).upper()}"] = line_len(coords)
    return out


def annotate_route_columns(df, *, description_col: str = "Route Description"):
    """Fill Route Number + helper columns from Route Description."""
    import pandas as pd

    codes, firsts, lasts, kmls = [], [], [], []
    for desc in df[description_col]:
        code, first, last = split_route_description(desc)
        codes.append(code)
        firsts.append(first)
        lasts.append(last)
        kmls.append(kml_code_for(code, first, last))

    out = df.copy()
    out["Route Number"] = pd.Series(codes, index=out.index, dtype="string")
    out["route_first_stop"] = pd.Series(firsts, index=out.index, dtype="string")
    out["route_last_stop"] = pd.Series(lasts, index=out.index, dtype="string")
    out["kml_route_code"] = pd.Series(kmls, index=out.index, dtype="string")
    return out
