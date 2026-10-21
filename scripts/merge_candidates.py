#!/usr/bin/env python3
"""Merge multiple candidate incidents into one parent candidate.

Child records are removed from the top-level incident list but preserved in the
parent's `merged_candidates` audit field. The parent also receives an
`affected_organizations` list and a union of all sources.
"""

import argparse
import json
import re
from copy import deepcopy
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


def parse_json_list(raw, name):
    try:
        v = json.loads(raw or "[]")
    except json.JSONDecodeError as e:
        raise SystemExit(f"{name} JSON is invalid: {e}")
    if not isinstance(v, list):
        raise SystemExit(f"{name} must be a JSON array")
    return v


def uniq_sources(records):
    out, seen = [], set()
    for x in records:
        for s in x.get("sources") or []:
            if not isinstance(s, dict):
                continue
            url = str(s.get("url") or "").strip()
            if not url or url in seen:
                continue
            seen.add(url)
            out.append({
                "name": str(s.get("name") or "情報源"),
                "url": url,
                "official": bool(s.get("official")),
            })
    return out


def audit_snapshot(x):
    return {
        "id": x.get("id", ""),
        "published": x.get("published", ""),
        "company": x.get("company", ""),
        "service": x.get("service", ""),
        "affected_count": x.get("affected_count", 0),
        "cause": x.get("cause", ""),
        "summary": x.get("summary", ""),
        "exposed_data": x.get("exposed_data", ""),
        "sources": deepcopy(x.get("sources") or []),
        "auto_detected": x.get("auto_detected"),
        "rss_pub_date": x.get("rss_pub_date", ""),
        "article_count": x.get("article_count"),
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--primary-id", required=True)
    p.add_argument("--merge-ids-json", required=True)
    p.add_argument("--company", required=True)
    p.add_argument("--service", default="")
    p.add_argument("--published", default="")
    p.add_argument("--affected-count", default="")
    p.add_argument("--cause", default="")
    p.add_argument("--summary", default="")
    p.add_argument("--exposed-data", default="")
    p.add_argument("--affected-organizations-json", default="[]")
    p.add_argument("--note", default="")
    args = p.parse_args()

    merge_ids = [str(x).strip() for x in parse_json_list(args.merge_ids_json, "merge-ids") if str(x).strip()]
    if args.primary_id not in merge_ids:
        merge_ids.insert(0, args.primary_id)
    merge_ids = list(dict.fromkeys(merge_ids))

    if len(merge_ids) < 2:
        raise SystemExit("統合には2件以上の候補が必要です")

    organizations = []
    seen_org = set()
    for item in parse_json_list(args.affected_organizations_json, "affected-organizations"):
        if isinstance(item, str):
            name = item.strip()
            item = {"name": name}
        elif isinstance(item, dict):
            item = dict(item)
            name = str(item.get("name") or "").strip()
        else:
            continue
        if not name or name in seen_org:
            continue
        seen_org.add(name)
        item["name"] = name
        organizations.append(item)

    db = json.loads(DATA.read_text(encoding="utf-8"))
    incidents = db.get("incidents", [])
    by_id = {x.get("id"): x for x in incidents if x.get("id")}
    missing = [i for i in merge_ids if i not in by_id]
    if missing:
        raise SystemExit(f"candidate not found: {', '.join(missing)}")

    records = [by_id[i] for i in merge_ids]
    not_candidate = [x.get("id") for x in records if x.get("status") != "candidate"]
    if not_candidate:
        raise SystemExit(f"candidate以外は統合できません: {', '.join(not_candidate)}")

    parent = by_id[args.primary_id]
    children = [x for x in records if x.get("id") != args.primary_id]

    # Preserve existing merge history and append child snapshots.
    history = list(parent.get("merged_candidates") or [])
    known = {x.get("id") for x in history if isinstance(x, dict)}
    for child in children:
        if child.get("id") not in known:
            history.append(audit_snapshot(child))

    parent["merged_candidates"] = history
    parent["merged_from_ids"] = merge_ids
    parent["affected_organizations"] = organizations
    parent["affected_organization_count"] = len(organizations)
    parent["incident_structure"] = "shared_vendor"

    # Operator-controlled canonical values.
    parent["company"] = args.company.strip()
    parent["service"] = args.service.strip()
    parent["published"] = args.published.strip()
    parent["affected_count"] = parse_count(args.affected_count)
    parent["cause"] = args.cause.strip()
    parent["summary"] = args.summary.strip()
    parent["exposed_data"] = args.exposed_data.strip()
    parent["sources"] = uniq_sources(records)

    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    parent["merged_at"] = now
    parent["merge_note"] = args.note.strip()
    parent["review_note"] = args.note.strip() or parent.get("review_note", "")

    # Remove child incidents from top-level list. Full snapshots remain above.
    child_ids = {x.get("id") for x in children}
    db["incidents"] = [x for x in incidents if x.get("id") not in child_ids]
    db["last_updated"] = now

    DATA.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"merged {len(records)} candidates -> {args.primary_id}")
    print(f"affected organizations: {len(organizations)}")


if __name__ == "__main__":
    main()
