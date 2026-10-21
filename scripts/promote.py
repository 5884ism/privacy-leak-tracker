#!/usr/bin/env python3
"""Promote a candidate while fully overwriting operator-managed fields."""

import argparse
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))


def parse_count(raw):
    raw = (raw or "").strip()
    if not raw:
        return 0
    trans = str.maketrans("０１２３４５６７８９，", "0123456789,")
    s = raw.translate(trans).replace(",", "").replace("件", "").replace(" ", "").replace("　", "")
    if not re.fullmatch(r"\d+", s):
        raise SystemExit(f"対象規模の形式が不正です: {raw}")
    return int(s)


def parse_sources(raw):
    try:
        items = json.loads(raw or "[]")
    except json.JSONDecodeError as e:
        raise SystemExit(f"sources-json is invalid: {e}")
    if not isinstance(items, list):
        raise SystemExit("sources-json must be an array")

    out, seen = [], set()
    for i, item in enumerate(items, 1):
        if not isinstance(item, dict):
            raise SystemExit(f"source {i} is invalid")
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        if url in seen:
            continue
        seen.add(url)
        out.append({
            "name": str(item.get("name") or "情報源").strip() or "情報源",
            "url": url,
            "official": bool(item.get("official")),
        })
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--status", required=True, choices=["confirmed", "possible"])
    p.add_argument("--published", default="")
    p.add_argument("--company", default="")
    p.add_argument("--service", default="")
    p.add_argument("--affected-count", default="")
    p.add_argument("--cause", default="")
    p.add_argument("--summary", default="")
    p.add_argument("--exposed-data", default="")
    p.add_argument("--sources-json", default="[]")
    p.add_argument("--note", default="")
    args = p.parse_args()

    db = json.loads(DATA.read_text(encoding="utf-8"))
    found = next((x for x in db.get("incidents", []) if x.get("id") == args.id), None)

    if not found:
        raise SystemExit(f"incident not found: {args.id}")
    if found.get("status") != "candidate":
        raise SystemExit(f"incident is not candidate: current status={found.get('status')}")

    # Full overwrite of operator-managed fields.
    found["published"] = args.published.strip()
    found["company"] = args.company.strip()
    found["service"] = args.service.strip()
    found["affected_count"] = parse_count(args.affected_count)
    found["status"] = args.status
    found["cause"] = args.cause.strip()
    found["summary"] = args.summary.strip()
    found["exposed_data"] = args.exposed_data.strip()

    sources = parse_sources(args.sources_json)
    found["sources"] = sources
    found["official_urls"] = [s["url"] for s in sources if s.get("official")]
    found.pop("official_watch", None)

    found.pop("priority", None)
    found.pop("priority_score", None)

    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    found["reviewed_at"] = now
    found["review_note"] = args.note.strip()

    db["last_updated"] = now
    DATA.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"promoted {args.id} -> {args.status} with full overwrite")


if __name__ == "__main__":
    main()
