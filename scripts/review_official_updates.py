#!/usr/bin/env python3
import argparse, json
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
    args = p.parse_args()

    db = json.loads(DATA.read_text(encoding="utf-8"))
    hit = None
    for x in db.get("incidents", []):
        if x.get("id") == args.id:
            hit = x
            break

    if not hit:
        raise SystemExit(f"incident not found: {args.id}")

    updates = hit.get("official_updates", [])
    for u in updates:
        u["reviewed"] = True
        u["reviewed_at"] = now_jst()

    hit["official_update_pending"] = False
    hit["official_updates_reviewed_at"] = now_jst()
    db["last_updated"] = now_jst()

    DATA.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"reviewed official updates: {args.id} ({len(updates)} update(s))")

if __name__ == "__main__":
    main()
