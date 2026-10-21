#!/usr/bin/env python3
"""Reclassify one item in data/public-update.json from NEW to UPDATED.

This is a one-time migration helper for cases that were already corrected
before the new classification logic was introduced.
"""

import argparse
import json
from pathlib import Path

PATH = Path("data/public-update.json")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--id", required=True)
    p.add_argument("--change-type", default="content", choices=["content", "status"])
    p.add_argument("--changed-label", action="append", default=[])
    p.add_argument("--note", default="案件情報を更新")
    args = p.parse_args()

    if not PATH.exists():
        raise SystemExit("data/public-update.json not found")

    data = json.loads(PATH.read_text(encoding="utf-8"))
    added = list(data.get("added") or [])
    changed = list(data.get("changed") or [])

    target = next((x for x in added if x.get("id") == args.id), None)
    if not target:
        # Already reclassified: make the script idempotent.
        if any(x.get("id") == args.id for x in changed):
            print(f"already UPDATED: {args.id}")
            return
        raise SystemExit(f"incident not found in added: {args.id}")

    added = [x for x in added if x.get("id") != args.id]

    changed_item = {
        "id": target.get("id", ""),
        "company": target.get("company", ""),
        "service": target.get("service", ""),
        "published": target.get("published", ""),
        "affected_count": target.get("affected_count", 0),
        "cause": target.get("cause", ""),
        "summary": target.get("summary", ""),
        "exposed_data": target.get("exposed_data", ""),
        "reviewed_at": target.get("reviewed_at", ""),
        "from_status": target.get("status", ""),
        "to_status": target.get("status", ""),
        "from_label": "",
        "to_label": "",
        "change_type": args.change_type,
        "changed_fields": [],
        "changed_labels": args.changed_label or ["案件情報"],
        "resolution_date": target.get("resolution_date", ""),
        "resolution_note": args.note,
        "resolution_url": target.get("resolution_url", ""),
        "sources": target.get("sources", []),
    }

    # Replace existing changed entry for same ID, if any.
    changed = [x for x in changed if x.get("id") != args.id]
    changed.append(changed_item)

    data["added"] = added
    data["changed"] = changed
    data["added_count"] = len(added)
    data["changed_count"] = len(changed)
    data["added_ids"] = [x.get("id") for x in added if x.get("id")]
    data["changed_ids"] = [x.get("id") for x in changed if x.get("id")]

    PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print(f"reclassified NEW -> UPDATED: {args.id}")


if __name__ == "__main__":
    main()
