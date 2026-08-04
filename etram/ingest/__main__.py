"""CLI: python -m etram.ingest --agency bhavnagar"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from etram.ingest.load import run_ingest, _project_root


def main() -> None:
    parser = argparse.ArgumentParser(description="E-TRAM Phase 1 Excel → Parquet ingest")
    parser.add_argument("--agency", default="bhavnagar")
    parser.add_argument(
        "--mapping",
        type=Path,
        default=None,
        help="Path to agency YAML (default config/agencies/{agency}.yaml)",
    )
    args = parser.parse_args()
    root = _project_root()
    mapping = args.mapping or (root / "config" / "agencies" / f"{args.agency}.yaml")
    report = run_ingest(mapping, root=root)
    print(json.dumps({"load_ok": report["load_ok"], "tables": report["tables"], "feature_gates": report["feature_gates"]}, indent=2))
    if not report["load_ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
