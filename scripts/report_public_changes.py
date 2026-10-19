#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path("data/incidents.json")
OUT_PATH = Path("data/public-update.json")
PUBLIC_STATUSES = {"confirmed", "possible", "cleared"}

STATUS_LABEL = {
    "confirmed": "漏えい確認",
    "possible": "漏えいの可能性",
    "cleared": "漏えいなし確認",
}

def load_incidents():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data.get("incidents", []) if isinstance(data, dict) else data

def public_rows():
    rows = []
    for x in load_incidents():
        if x.get("status") not in PUBLIC_STATUSES:
            continue
        rows.append({
            "id": x.get("id", ""),
            "status": x.get("status", ""),
            "published": x.get("published", ""),
            "company": x.get("company", ""),
            "service": x.get("service", ""),
            "affected_count": x.get("affected_count", 0),
            "summary": x.get("summary", ""),
            "resolution_date": x.get("resolution_date", ""),
            "resolution_note": x.get("resolution_note", ""),
        })
    return rows

def key(x):
    return str(x.get("id") or "").strip()

def label(x):
    c = x.get("company", "") or ""
    s = x.get("service", "") or ""
    return f"{c} / {s}" if s else c or "(企業名なし)"

def fmt_count(v):
    try:
        n = int(v or 0)
    except Exception:
        n = 0
    return f"{n:,}件" if n > 0 else "非公表/調査中"

def esc(v):
    return str(v or "").replace("|", "\\|").replace("\n", " ")

def snapshot(path):
    rows = public_rows()
    Path(path).write_text(
        json.dumps(rows, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    print(f"Public snapshot saved: {len(rows)} items")

def report(path):
    before_path = Path(path)
    before = json.loads(before_path.read_text(encoding="utf-8")) if before_path.exists() else []
    after = public_rows()

    bm = {key(x): x for x in before if key(x)}
    am = {key(x): x for x in after if key(x)}

    added = [am[k] for k in am if k not in bm]
    removed = [bm[k] for k in bm if k not in am]

    changed = []
    for k in am.keys() & bm.keys():
        old, new = bm[k], am[k]
        if old.get("status") != new.get("status"):
            changed.append({
                "id": k,
                "company": new.get("company", ""),
                "service": new.get("service", ""),
                "published": new.get("published", ""),
                "affected_count": new.get("affected_count", 0),
                "summary": new.get("summary", ""),
                "from_status": old.get("status", ""),
                "to_status": new.get("status", ""),
                "from_label": STATUS_LABEL.get(old.get("status"), old.get("status", "")),
                "to_label": STATUS_LABEL.get(new.get("status"), new.get("status", "")),
                "resolution_date": new.get("resolution_date", ""),
                "resolution_note": new.get("resolution_note", ""),
            })

    payload = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "before_count": len(before),
        "after_count": len(after),
        "net_change": len(after) - len(before),
        "added_count": len(added),
        "changed_count": len(changed),
        "removed_count": len(removed),
        "added_ids": [x.get("id", "") for x in added if x.get("id")],
        "changed_ids": [x.get("id", "") for x in changed if x.get("id")],
        "added": added,
        "changed": changed,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    net = payload["net_change"]
    sign = "+" if net > 0 else ""
    headline = (
        f"公開案件追加 {len(added)}件 / ステータス更新 {len(changed)}件 / "
        f"公開対象総数 {len(before)} → {len(after)}件 (差分 {sign}{net})"
    )

    print("\n=== 公開版 更新結果 ===")
    print(headline)

    if added:
        print("\n新たに公開対象となった案件:")
        for i, x in enumerate(added, 1):
            print(
                f"{i}. [{STATUS_LABEL.get(x.get('status'), x.get('status'))}] "
                f"{x.get('published') or '-'} {label(x)} "
                f"({fmt_count(x.get('affected_count'))})"
            )

    if changed:
        print("\nステータスが更新された案件:")
        for i, x in enumerate(changed, 1):
            print(
                f"{i}. {label(x)}: "
                f"{x.get('from_label')} → {x.get('to_label')}"
            )

    if added or changed:
        print(f"::notice title=公開版更新::{headline}")
    else:
        print(f"::notice title=公開版更新::公開対象の追加・ステータス更新なし / 総数 {len(after)}件")

    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        lines = ["## 公開版 更新結果", "", f"**{headline}**", ""]
        if added:
            lines += [
                "### 新たに公開された案件",
                "",
                "| 状況 | 公表日 | 企業・サービス | 対象規模 | Incident ID |",
                "|---|---|---|---:|---|",
            ]
            for x in added:
                lines.append(
                    f"| {esc(STATUS_LABEL.get(x.get('status'), x.get('status')))} | "
                    f"{esc(x.get('published') or '-')} | "
                    f"{esc(label(x))} | {esc(fmt_count(x.get('affected_count')))} | "
                    f"`{esc(x.get('id') or '-')}` |"
                )
            lines.append("")

        if changed:
            lines += [
                "### ステータス更新",
                "",
                "| 企業・サービス | 変更前 | 変更後 | Incident ID |",
                "|---|---|---|---|",
            ]
            for x in changed:
                lines.append(
                    f"| {esc(label(x))} | {esc(x.get('from_label'))} | "
                    f"{esc(x.get('to_label'))} | `{esc(x.get('id') or '-')}` |"
                )
            lines.append("")

        if not added and not changed:
            lines += ["✅ 今回、公開対象の追加・ステータス更新はありません。", ""]

        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in {"snapshot", "report"}:
        print("Usage: report_public_changes.py {snapshot|report} <snapshot-file>")
        raise SystemExit(2)

    if sys.argv[1] == "snapshot":
        snapshot(sys.argv[2])
    else:
        report(sys.argv[2])
