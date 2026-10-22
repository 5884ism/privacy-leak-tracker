#!/usr/bin/env python3
import json
from datetime import datetime,timezone,timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"data"/"incidents.json"
CANDIDATE_UPDATE=ROOT/"data"/"candidate-update.json"
OUT=ROOT/"data"/"public-news.json"
JST=timezone(timedelta(hours=9))

FIELDS=(
    "id","published","company","service","affected_count","cause",
    "summary","exposed_data","sources","news_updated_at","news_update_note"
)

def src(s):
    if not isinstance(s,dict) or not str(s.get("url") or "").strip():
        return None
    return {
        "name":str(s.get("name") or "情報源").strip() or "情報源",
        "url":str(s.get("url")).strip(),
        "official":bool(s.get("official")),
    }

def row(x):
    r={k:x.get(k) for k in FIELDS if k in x}
    r["sources"]=[y for y in (src(s) for s in x.get("sources") or []) if y]
    return r

def latest_detected_ids():
    if not CANDIDATE_UPDATE.exists():
        return []
    try:
        data=json.loads(CANDIDATE_UPDATE.read_text(encoding="utf-8"))
    except Exception:
        return []
    ids=data.get("new_candidate_ids") or []
    return [str(x) for x in ids if x]

def main():
    db=json.loads(SRC.read_text(encoding="utf-8"))
    now=datetime.now(JST)
    today=now.strftime("%Y-%m-%d")
    latest_ids=latest_detected_ids()
    latest_rank={incident_id:i for i,incident_id in enumerate(latest_ids)}

    news=[
        row(x) for x in db.get("incidents",[])
        if x.get("status")=="candidate"
    ]
    news.sort(
        key=lambda x:(
            1 if str(x.get("id") or "") in latest_rank else 0,
            -latest_rank.get(str(x.get("id") or ""),999999),
            x.get("published") or "",
            x.get("id") or "",
        ),
        reverse=True,
    )

    updates=[
        row(x) for x in db.get("incidents",[])
        if str(x.get("news_updated_at") or "").startswith(today)
    ]
    updates.sort(key=lambda x:x.get("news_updated_at") or "",reverse=True)

    out={
        "version":"1.1",
        "generated_at":now.isoformat(timespec="minutes"),
        "update_interval_minutes":60,
        "news_count":len(news),
        "latest_detected_ids":latest_ids,
        "news":news,
        "updates":updates,
    }
    OUT.write_text(json.dumps(out,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(
        f"exported public news: {len(news)} candidates, "
        f"{len(latest_ids)} latest detected, {len(updates)} updates"
    )

if __name__=="__main__":
    main()
