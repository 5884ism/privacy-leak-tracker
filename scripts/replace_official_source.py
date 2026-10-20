#!/usr/bin/env python3
"""Replace an incorrect official source URL on an existing incident.

Example:
  python scripts/replace_official_source.py \
    --id INCIDENT_ID \
    --old-url "https://wrong.example/" \
    --new-url "https://correct.example/" \
    --source-name "公式発表" \
    --note "誤登録URLを修正"
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
    p.add_argument("--old-url", required=True)
    p.add_argument("--new-url", required=True)
    p.add_argument("--source-name", default="公式発表")
    p.add_argument("--note", default="")
    args = p.parse_args()

    if args.old_url == args.new_url:
        raise SystemExit("old-url and new-url are identical")

    db = json.loads(DATA.read_text(encoding="utf-8"))
    found = next((x for x in db.get("incidents", []) if x.get("id") == args.id), None)

    if not found:
        raise SystemExit(f"incident not found: {args.id}")

    if found.get("status") not in {"confirmed", "possible", "cleared"}:
        raise SystemExit(
            f"replace official source is only for reviewed incidents; "
            f"current status={found.get('status')}"
        )

    sources = found.setdefault("sources", [])
    official_urls = found.setdefault("official_urls", [])

    old_in_sources = any(s.get("url") == args.old_url for s in sources)
    old_in_official = args.old_url in official_urls

    if not old_in_sources and not old_in_official:
        raise SystemExit(f"old official URL not found on incident: {args.old_url}")

    # Remove the incorrect URL everywhere it is stored.
    found["sources"] = [s for s in sources if s.get("url") != args.old_url]
    found["official_urls"] = [u for u in official_urls if u != args.old_url]

    # If the correct URL is already present, explicitly mark it official
    # and normalize its display name. Otherwise insert it at the top.
    existing = next(
        (s for s in found["sources"] if s.get("url") == args.new_url),
        None,
    )

    if existing:
        existing["official"] = True
        existing["name"] = args.source_name or existing.get("name") or "公式発表"
    else:
        found["sources"].insert(
            0,
            {
                "name": args.source_name or "公式発表",
                "url": args.new_url,
                "official": True,
            },
        )

    if args.new_url not in found["official_urls"]:
        found["official_urls"].append(args.new_url)

    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    found["reviewed_at"] = now

    correction_note = (
        f"公式URL修正: {args.old_url} -> {args.new_url}"
        + (f" / {args.note}" if args.note else "")
    )
    previous_note = str(found.get("review_note") or "").strip()
    found["review_note"] = (
        f"{previous_note} / {correction_note}" if previous_note else correction_note
    )

    db["last_updated"] = now
    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"replaced official source for {args.id}")
    print(f"old: {args.old_url}")
    print(f"new: {args.new_url}")


if __name__ == "__main__":
    main()
