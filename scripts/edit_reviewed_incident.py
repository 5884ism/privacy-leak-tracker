#!/usr/bin/env python3
"""Edit an already reviewed incident.

Only incident ID is required. Blank optional inputs preserve existing values.

New in v1.2:
- --sources-json can replace the complete sources list.
- This allows deleting/replacing incorrect auto-detected media links.
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

    trans = str.maketrans("０１２３４５６７８９，", "0123456789,")
    s = raw.translate(trans)
    s = s.replace(",", "").replace("件", "").replace(" ", "").replace("　", "")

    if not re.fullmatch(r"\d+", s):
        raise argparse.ArgumentTypeError(
            f"対象規模は数字で入力してください: {raw!r} "
            "(例: 4454097 / 4,454,097 / 4,454,097件)"
        )
    return int(s)


def parse_sources_json(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return None

    try:
        items = json.loads(raw)
    except json.JSONDecodeError as e:
        raise SystemExit(f"sources-json is not valid JSON: {e}")

    if not isinstance(items, list):
        raise SystemExit("sources-json must be a JSON array")

    out = []
    seen = set()

    for i, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            raise SystemExit(f"sources-json item {i} must be an object")

        url = str(item.get("url") or "").strip()
        if not url:
            raise SystemExit(f"sources-json item {i} has no url")

        if url in seen:
            continue
        seen.add(url)

        name = str(item.get("name") or "情報源").strip() or "情報源"
        official = bool(item.get("official"))

        out.append({
            "name": name,
            "url": url,
            "official": official,
        })

    return out


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
    p.add_argument("--official-url", default="")   # legacy compatibility
    p.add_argument("--source-name", default="")   # legacy compatibility
    p.add_argument("--sources-json", default="")
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

    if args.published.strip():
        found["published"] = args.published.strip()
    if args.company.strip():
        found["company"] = args.company.strip()
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

    new_sources = parse_sources_json(args.sources_json)

    if new_sources is not None:
        # Complete replacement of the sources list, including deletion of
        # incorrect auto-detected links.
        found["sources"] = new_sources
        found["official_urls"] = [
            s["url"] for s in new_sources if s.get("official")
        ]
        found.pop("official_watch", None)

    elif args.official_url.strip():
        # Legacy behavior: replace official source, preserve media sources.
        new_url = args.official_url.strip()
        new_name = args.source_name.strip() or "公式発表"

        media_sources = [
            s for s in found.get("sources", [])
            if not s.get("official") and s.get("url") != new_url
        ]

        found["sources"] = [{
            "name": new_name,
            "url": new_url,
            "official": True,
        }] + media_sources
        found["official_urls"] = [new_url]
        found.pop("official_watch", None)

    elif args.source_name.strip():
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
    if new_sources is not None:
        print(f"sources replaced: {len(new_sources)}")


if __name__ == "__main__":
    main()
