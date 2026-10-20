#!/usr/bin/env python3
"""Partially overwrite operator-managed fields on a reviewed incident.

Only incident ID is required.
Blank optional inputs preserve the current value.

affected_count accepts:
  4454097
  4,454,097
  4,454,097件
"""

import argparse
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))


def parse_affected_count(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return None

    # Accept Japanese/full-width digits, commas, spaces and "件".
    trans = str.maketrans("０１２３４５６７８９，", "0123456789,")
    s = raw.translate(trans)
    s = s.replace(",", "").replace("件", "").replace(" ", "").replace("　", "")

    if not re.fullmatch(r"\d+", s):
        raise argparse.ArgumentTypeError(
            f"対象規模は数字で入力してください: {raw!r} "
            "(例: 4454097 / 4,454,097 / 4,454,097件)"
        )

    return int(s)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--published", default="")
    p.add_argument("--company", default="")
    p.add_argument("--service", default="")
    p.add_argument("--affected-count", default="")
    p.add_argument("--status", default="", choices=["", "confirmed", "possible"])
    p.add_argument("--cause", default="")
    p.add_argument("--summary", default="")
    p.add_argument("--exposed-data", default="")
    p.add_argument("--official-url", default="")
    p.add_argument("--source-name", default="")
    p.add_argument("--note", default="")
    args = p.parse_args()

    db = json.loads(DATA.read_text(encoding="utf-8"))
    found = next((x for x in db.get("incidents", []) if x.get("id") == args.id), None)

    if not found:
        raise SystemExit(f"incident not found: {args.id}")

    if found.get("status") not in {"confirmed", "possible", "cleared"}:
        raise SystemExit(
            "This workflow is for already reviewed incidents only. "
            f"current status={found.get('status')}"
        )

    # Blank inputs preserve the current value.
    if args.published.strip():
        found["published"] = args.published.strip()

    if args.company.strip():
        found["company"] = args.company.strip()

    # For service, blank preserves existing value.
    if args.service.strip():
        found["service"] = args.service.strip()

    count = parse_affected_count(args.affected_count)
    if count is not None:
        found["affected_count"] = count

    if args.status:
        found["status"] = args.status

    if args.cause.strip():
        found["cause"] = args.cause.strip()

    if args.summary.strip():
        found["summary"] = args.summary.strip()

    if args.exposed_data.strip():
        found["exposed_data"] = args.exposed_data.strip()

    # Official source replacement is only performed when a new URL is supplied.
    if args.official_url.strip():
        new_url = args.official_url.strip()
        new_name = args.source_name.strip() or "公式発表"

        old_sources = found.get("sources", [])
        media_sources = [
            s for s in old_sources
            if not s.get("official") and s.get("url") != new_url
        ]

        found["sources"] = [{
            "name": new_name,
            "url": new_url,
            "official": True,
        }] + media_sources
        found["official_urls"] = [new_url]

        # URL changed: reset watcher state so monitoring starts cleanly.
        found.pop("official_watch", None)
    elif args.source_name.strip():
        # If only source_name is supplied, rename existing official sources.
        name = args.source_name.strip()
        for s in found.get("sources", []):
            if s.get("official"):
                s["name"] = name

    found.pop("priority", None)
    found.pop("priority_score", None)

    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    found["reviewed_at"] = now

    if args.note.strip():
        found["review_note"] = args.note.strip()

    db["last_updated"] = now
    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"updated reviewed incident: {args.id}")


if __name__ == "__main__":
    main()
