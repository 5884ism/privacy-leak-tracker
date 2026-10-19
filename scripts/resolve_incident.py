#!/usr/bin/env python3
"""Resolve a confirmed/possible incident as 'cleared' (no leak confirmed)."""

import argparse
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))

def now_jst():
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--resolution-date", required=True)
    p.add_argument("--resolution-url", required=True)
    p.add_argument("--resolution-note", required=True)
    p.add_argument("--source-name", default="公式発表")
    args = p.parse_args()

    db = json.loads(DATA.read_text(encoding="utf-8"))

    incident = next(
        (x for x in db.get("incidents", []) if x.get("id") == args.id),
        None
    )
    if not incident:
        raise SystemExit(f"incident not found: {args.id}")

    if incident.get("status") not in ("confirmed", "possible", "cleared"):
        raise SystemExit(
            f"only confirmed/possible/cleared can be resolved: "
            f"{args.id} status={incident.get('status')}"
        )

    incident["status"] = "cleared"
    incident["resolution_date"] = args.resolution_date
    incident["resolution_note"] = args.resolution_note
    incident["resolution_url"] = args.resolution_url
    incident["resolved_at"] = now_jst()

    # Register the resolution page as an official source.
    sources = incident.setdefault("sources", [])
    existing = next((s for s in sources if s.get("url") == args.resolution_url), None)
    if existing:
        existing["official"] = True
        existing["name"] = args.source_name or existing.get("name") or "公式発表"
    else:
        sources.insert(0, {
            "name": args.source_name or "公式発表",
            "url": args.resolution_url,
            "official": True,
        })

    official_urls = incident.setdefault("official_urls", [])
    if args.resolution_url not in official_urls:
        official_urls.append(args.resolution_url)

    # A cleared incident has no pending unresolved official-update review.
    incident["official_update_pending"] = False

    db["last_updated"] = now_jst()

    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print(f"resolved {args.id} -> cleared")

if __name__ == "__main__":
    main()
