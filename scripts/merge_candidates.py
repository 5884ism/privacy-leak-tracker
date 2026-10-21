#!/usr/bin/env python3
"""Attach candidate incidents to an existing reviewed parent, or create a new parent.

Modes:
- existing: attach candidate children to an existing confirmed/possible incident.
- new: create a synthetic parent candidate, then absorb all selected candidates.

Child candidate snapshots are preserved in `merged_candidates`.
Affected organizations and sources are unioned into the parent.
"""

import argparse
import hashlib
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
        return None
    trans = str.maketrans("０１２３４５６７８９，", "0123456789,")
    s = raw.translate(trans).replace(",", "").replace("件", "").replace(" ", "").replace("　", "")
    if not re.fullmatch(r"\d+", s):
        raise SystemExit(f"対象規模の形式が不正です: {raw}")
    return int(s)


def parse_json_list(raw, name):
    try:
        value = json.loads(raw or "[]")
    except json.JSONDecodeError as e:
        raise SystemExit(f"{name} JSON is invalid: {e}")
    if not isinstance(value, list):
        raise SystemExit(f"{name} must be a JSON array")
    return value


def clean_source(s):
    if not isinstance(s, dict):
        return None
    url = str(s.get("url") or "").strip()
    if not url:
        return None
    return {
        "name": str(s.get("name") or "情報源").strip() or "情報源",
        "url": url,
        "official": bool(s.get("official")),
    }


def union_sources(*groups):
    out, seen = [], set()
    for group in groups:
        for s in group or []:
            c = clean_source(s)
            if not c or c["url"] in seen:
                continue
            seen.add(c["url"])
            out.append(c)
    return out


def audit_snapshot(x):
    keys = (
        "id", "status", "published", "company", "service", "affected_count",
        "cause", "summary", "exposed_data", "sources", "auto_detected",
        "rss_pub_date", "article_count", "reviewed_at", "review_note"
    )
    return {k: deepcopy(x.get(k)) for k in keys if k in x}


def normalize_orgs(items):
    out, seen = [], set()
    for item in items:
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name or name in seen:
            continue
        seen.add(name)
        clean = {"name": name}
        for k in ("service", "url", "source_incident_id"):
            if item.get(k):
                clean[k] = item.get(k)
        out.append(clean)
    return out


def merge_orgs(existing, incoming):
    by_name = {}
    order = []
    for item in [*(existing or []), *(incoming or [])]:
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        if name not in by_name:
            order.append(name)
            by_name[name] = {"name": name}
        for k, v in item.items():
            if v not in (None, "", []):
                by_name[name][k] = v
    return [by_name[n] for n in order]


def make_parent_id(published, merge_ids):
    date = published or datetime.now(JST).strftime("%Y-%m-%d")
    digest = hashlib.sha1("|".join(sorted(merge_ids)).encode("utf-8")).hexdigest()[:10]
    return f"{date}-merged-{digest}"


def apply_operator_fields(parent, args, overwrite_blank=False):
    fields = (
        ("published", args.published),
        ("company", args.company),
        ("service", args.service),
        ("cause", args.cause),
        ("summary", args.summary),
        ("exposed_data", args.exposed_data),
    )
    for key, value in fields:
        value = str(value or "").strip()
        if value or overwrite_blank:
            parent[key] = value

    count = parse_count(args.affected_count)
    if count is not None:
        parent["affected_count"] = count
    elif overwrite_blank:
        parent["affected_count"] = 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mode", required=True, choices=["existing", "new"])
    p.add_argument("--parent-id", default="")
    p.add_argument("--merge-ids-json", required=True)
    p.add_argument("--company", default="")
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
    merge_ids = list(dict.fromkeys(merge_ids))
    if not merge_ids:
        raise SystemExit("紐づける候補を1件以上選択してください")

    db = json.loads(DATA.read_text(encoding="utf-8"))
    incidents = db.get("incidents", [])
    by_id = {x.get("id"): x for x in incidents if x.get("id")}

    missing = [i for i in merge_ids if i not in by_id]
    if missing:
        raise SystemExit(f"candidate not found: {', '.join(missing)}")

    children = [by_id[i] for i in merge_ids]
    bad = [x.get("id") for x in children if x.get("status") != "candidate"]
    if bad:
        raise SystemExit(f"candidate以外は子案件として紐づけできません: {', '.join(bad)}")

    incoming_orgs = normalize_orgs(parse_json_list(args.affected_organizations_json, "affected-organizations"))
    now = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")

    if args.mode == "existing":
        parent_id = args.parent_id.strip()
        if not parent_id or parent_id not in by_id:
            raise SystemExit("既存の親案件IDが不正です")
        parent = by_id[parent_id]
        if parent.get("status") not in {"confirmed", "possible"}:
            raise SystemExit(f"既存親案件はconfirmed/possibleのみ指定可能です: {parent.get('status')}")
        if parent_id in merge_ids:
            raise SystemExit("親案件自身を子候補として指定できません")

        # Existing reviewed parent: blanks preserve current values.
        apply_operator_fields(parent, args, overwrite_blank=False)
        parent["sources"] = union_sources(parent.get("sources"), *[x.get("sources") for x in children])

    else:
        # New synthetic parent: no arbitrary child has to become the representative.
        parent_id = make_parent_id(args.published.strip(), merge_ids)
        if parent_id in by_id:
            raise SystemExit(f"generated parent id already exists: {parent_id}")

        parent = {
            "id": parent_id,
            "status": "candidate",
            "published": "",
            "company": "",
            "service": "",
            "affected_count": 0,
            "cause": "",
            "summary": "",
            "exposed_data": "",
            "sources": union_sources(*[x.get("sources") for x in children]),
            "auto_detected": False,
        }
        apply_operator_fields(parent, args, overwrite_blank=True)
        incidents.append(parent)

    history = list(parent.get("merged_candidates") or [])
    known_ids = {x.get("id") for x in history if isinstance(x, dict)}
    for child in children:
        cid = child.get("id")
        if cid not in known_ids:
            history.append(audit_snapshot(child))
            known_ids.add(cid)

    parent["merged_candidates"] = history
    all_ids = list(dict.fromkeys([*(parent.get("merged_from_ids") or []), *merge_ids]))
    parent["merged_from_ids"] = all_ids
    parent["incident_structure"] = "shared_vendor"
    parent["affected_organizations"] = merge_orgs(parent.get("affected_organizations"), incoming_orgs)
    parent["affected_organization_count"] = len(parent["affected_organizations"])
    parent["merge_note"] = args.note.strip()
    parent["merged_at"] = now

    # Keep official_urls in sync with the unioned sources.
    parent["official_urls"] = [
        s["url"] for s in (parent.get("sources") or [])
        if isinstance(s, dict) and s.get("official") and s.get("url")
    ]

    # Remove all child candidates from top-level incident list.
    child_ids = set(merge_ids)
    db["incidents"] = [x for x in incidents if x.get("id") not in child_ids or x is parent]
    db["last_updated"] = now

    DATA.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"mode={args.mode}")
    print(f"parent={parent_id}")
    print(f"attached candidates={len(children)}")
    print(f"affected organizations={len(parent.get('affected_organizations') or [])}")


if __name__ == "__main__":
    main()
