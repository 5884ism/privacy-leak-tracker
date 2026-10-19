#!/usr/bin/env python3
"""Generate the public data feed from the internal incident database.

Only confirmed/possible incidents are exported.
Internal review/candidate/automation metadata is intentionally excluded.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "incidents.json"
DST = ROOT / "data" / "public-incidents.json"

PUBLIC_STATUS = {"confirmed", "possible"}

def clean_source(s):
    return {
        "name": s.get("name", "情報源"),
        "url": s.get("url", ""),
    }

def clean_update(u):
    # Public users may see the existence/title/link of official follow-ups,
    # but never the operator review state.
    return {
        k: u.get(k)
        for k in ("published", "detected_at", "title", "url", "kind")
        if u.get(k) not in (None, "")
    }

def clean_incident(x):
    out = {
        "published": x.get("published", ""),
        "company": x.get("company", ""),
        "service": x.get("service", ""),
        "affected_count": int(x.get("affected_count") or 0),
        "status": x.get("status", ""),
        "cause": x.get("cause", ""),
        "summary": x.get("summary", ""),
        "exposed_data": x.get("exposed_data", ""),
        "sources": [
            clean_source(s)
            for s in (x.get("sources") or [])
            if s.get("url")
        ],
    }

    updates = [
        clean_update(u)
        for u in (x.get("official_updates") or [])
        if u.get("url")
    ]
    if updates:
        out["official_updates"] = updates

    return out

def main():
    db = json.loads(SRC.read_text(encoding="utf-8"))

    incidents = [
        clean_incident(x)
        for x in db.get("incidents", [])
        if x.get("status") in PUBLIC_STATUS
    ]

    incidents.sort(
        key=lambda x: (x.get("published", ""), x.get("affected_count", 0)),
        reverse=True,
    )

    public = {
        "version": "1.0",
        "last_updated": db.get("last_updated", ""),
        "incidents": incidents,
    }

    DST.write_text(
        json.dumps(public, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"exported {len(incidents)} public incident(s) -> {DST}")

if __name__ == "__main__":
    main()
