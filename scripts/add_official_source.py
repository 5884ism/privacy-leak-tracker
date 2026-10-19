#!/usr/bin/env python3
"""Attach an official source URL to an existing confirmed/possible incident."""

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
    p.add_argument("--id", required=True, help="incident id")
    p.add_argument("--official-url", required=True)
    p.add_argument("--source-name", default="公式発表")
    p.add_argument("--note", default="")
    args = p.parse_args()

    db = json.loads(DATA.read_text(encoding="utf-8"))

    incident = None
    for x in db.get("incidents", []):
        if x.get("id") == args.id:
            incident = x
            break

    if not incident:
        raise SystemExit(f"incident not found: {args.id}")

    if incident.get("status") not in ("confirmed", "possible"):
        raise SystemExit(
            f"incident must already be confirmed/possible: "
            f"{args.id} status={incident.get('status')}"
        )

    # Add/upgrade source entry.
    sources = incident.setdefault("sources", [])
    found = None
    for s in sources:
        if s.get("url") == args.official_url:
            found = s
            break

    if found:
        found["official"] = True
        if args.source_name:
            found["name"] = args.source_name
    else:
        sources.insert(0, {
            "name": args.source_name or "公式発表",
            "url": args.official_url,
            "official": True,
        })

    # Canonical list for the monitor.
    official_urls = incident.setdefault("official_urls", [])
    if args.official_url not in official_urls:
        official_urls.append(args.official_url)

    incident["official_source_updated_at"] = now_jst()

    if args.note:
        incident["official_source_note"] = args.note

    db["last_updated"] = now_jst()

    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print(
        f"official source attached: {args.id} -> {args.official_url}"
    )

if __name__ == "__main__":
    main()
