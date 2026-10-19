#!/usr/bin/env python3
"""Promote one candidate incident to confirmed/possible.

Usage:
  python scripts/promote.py --id INCIDENT_ID --status confirmed
  python scripts/promote.py --id INCIDENT_ID --status possible --official-url URL --source-name 公式発表 --note "確認済み"
"""

import argparse
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--id",required=True)
    p.add_argument("--status",required=True,choices=["confirmed","possible"])
    p.add_argument("--official-url",default="")
    p.add_argument("--source-name",default="公式発表")
    p.add_argument("--note",default="")
    args=p.parse_args()

    db=json.loads(DATA.read_text(encoding="utf-8"))
    found=None
    for x in db.get("incidents",[]):
        if x.get("id")==args.id:
            found=x
            break

    if not found:
        raise SystemExit(f"incident not found: {args.id}")

    found["status"]=args.status
    found.pop("priority",None)
    found.pop("priority_score",None)
    found["reviewed_at"]=datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")

    if args.note:
        found["review_note"]=args.note

    if args.official_url:
        sources=found.setdefault("sources",[])
        existing=None
        for s in sources:
            if s.get("url")==args.official_url:
                existing=s
                break

        if existing:
            # 既存情報源が同じURLなら、公式情報源として明示的に昇格
            existing["official"]=True
            if args.source_name:
                existing["name"]=args.source_name
        else:
            sources.insert(0,{
                "name":args.source_name or "公式発表",
                "url":args.official_url,
                "official":True,
            })

        # 監視対象の公式URLも別フィールドに保持
        official_urls=found.setdefault("official_urls",[])
        if args.official_url not in official_urls:
            official_urls.append(args.official_url)

    db["last_updated"]=datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    DATA.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"promoted {args.id} -> {args.status}")

if __name__=="__main__":
    main()
