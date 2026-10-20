#!/usr/bin/env python3
import json
from pathlib import Path

INCIDENTS = Path("data/incidents.json")
UPDATE = Path("data/candidate-update.json")

def load_incidents():
    data = json.loads(INCIDENTS.read_text(encoding="utf-8"))
    return data.get("incidents", []) if isinstance(data, dict) else data

def load_update():
    if not UPDATE.exists():
        return {}
    return json.loads(UPDATE.read_text(encoding="utf-8"))

def clean_sources(sources):
    out = []
    seen = set()
    for s in sources or []:
        if not isinstance(s, dict):
            continue
        url = str(s.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        name = str(s.get("name") or "情報源").strip()
        out.append({
            "name": name,
            "url": url,
            "official": bool(s.get("official")),
        })
    return out

def main():
    update = load_update()
    if not update:
        print("candidate-update.json not found or empty")
        return

    incidents = load_incidents()
    by_id = {
        str(x.get("id")): x
        for x in incidents
        if x.get("id")
    }

    changed = 0

    for row in update.get("new_candidates", []):
        ids = []
        if row.get("id"):
            ids.append(str(row["id"]))
        ids += [str(x) for x in row.get("member_ids", []) if x]

        sources = []
        seen = set()
        for iid in ids:
            inc = by_id.get(iid)
            if not inc:
                continue
            for s in clean_sources(inc.get("sources", [])):
                if s["url"] in seen:
                    continue
                seen.add(s["url"])
                sources.append(s)

        if row.get("sources") != sources:
            row["sources"] = sources
            changed += 1

    UPDATE.write_text(
        json.dumps(update, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print(f"candidate update enriched: {changed} row(s)")

if __name__ == "__main__":
    main()
