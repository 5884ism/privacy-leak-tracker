#!/usr/bin/env python3
"""Fully overwrite operator-managed fields on a reviewed incident.

System-managed fields such as id, auto_detected, rss_pub_date and article_count
are preserved. Existing non-official media sources are also preserved, while
official source information is replaced by the newly entered official source.
"""

import argparse
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--published", required=True)
    p.add_argument("--company", required=True)
    p.add_argument("--service", default="")
    p.add_argument("--affected-count", required=True, type=int)
    p.add_argument("--status", required=True, choices=["confirmed", "possible"])
    p.add_argument("--cause", required=True)
    p.add_argument("--summary", required=True)
    p.add_argument("--exposed-data", required=True)
    p.add_argument("--official-url", required=True)
    p.add_argument("--source-name", required=True)
    p.add_argument("--note", required=True)
    args = p.parse_args()

    if args.affected_count < 0:
        raise SystemExit("affected-count must be 0 or greater")

    db = json.loads(DATA.read_text(encoding="utf-8"))
    found = next((x for x in db.get("incidents", []) if x.get("id") == args.id), None)

    if not found:
        raise SystemExit(f"incident not found: {args.id}")

    if found.get("status") not in {"confirmed", "possible", "cleared"}:
        raise SystemExit(
            "This workflow is for already reviewed incidents only. "
            f"current status={found.get('status')}"
        )

    # Preserve only non-official media/reference sources.
    old_sources = found.get("sources", [])
    media_sources = [
        s for s in old_sources
        if not s.get("official")
        and s.get("url") != args.official_url
    ]

    # Explicitly overwrite all operator-managed fields.
    found["published"] = args.published
    found["company"] = args.company
    found["service"] = args.service
    found["affected_count"] = args.affected_count
    found["status"] = args.status
    found["cause"] = args.cause
    found["summary"] = args.summary
    found["exposed_data"] = args.exposed_data

    # Replace all official source data with the newly entered official source.
    found["sources"] = [{
        "name": args.source_name,
        "url": args.official_url,
        "official": True,
    }] + media_sources
    found["official_urls"] = [args.official_url]

    # Reset watcher state because the official URL may have changed.
    found.pop("official_watch", None)

    # Remove candidate-only review priority fields if any remain.
    found.pop("priority", None)
    found.pop("priority_score", None)

    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    found["reviewed_at"] = now
    found["review_note"] = args.note

    db["last_updated"] = now
    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"fully updated reviewed incident: {args.id}")


if __name__ == "__main__":
    main()
