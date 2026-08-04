"""CLI: python -m etram.metrics --agency bhavnagar"""
from __future__ import annotations

import argparse
import json

from etram.metrics.build import run_metrics, _project_root


def main() -> None:
    p = argparse.ArgumentParser(description="E-TRAM Phase 2 metrics engine")
    p.add_argument("--agency", default="bhavnagar")
    args = p.parse_args()
    snap = run_metrics(args.agency, root=_project_root())
    print(json.dumps(snap, indent=2))


if __name__ == "__main__":
    main()
