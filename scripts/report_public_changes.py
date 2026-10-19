#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

DATA_PATH = Path("data/incidents.json")
OUT_PATH = Path("data/public-update.json")
PUBLIC_STATUSES = {"confirmed", "possible", "cleared"}
JST = timezone(timedelta(hours=9))

STATUS_LABEL = {
    "confirmed": "漏えい確認",
    "possible": "漏えいの可能性",
    "cleared": "漏えいなし確認",
}

def now_utc():
    return datetime.now(timezone.utc)

def today_jst():
    return now_utc().astimezone(JST).strftime("%Y-%m-%d")

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

def load_daily_state(day, before_count):
    if not OUT_PATH.exists():
        return {
            "version": "1.1",
            "date": day,
            "day_start_count": before_count,
            "added": [],
            "changed": [],
        }

    try:
        state = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    except Exception:
        state = {}

    # JSTで日付が変わったら、前日分は引き継がず新しい一日を開始する。
    if state.get("date") != day:
        return {
            "version": "1.1",
            "date": day,
            "day_start_count": before_count,
            "added": [],
            "changed": [],
        }

    state.setdefault("version", "1.1")
    state.setdefault("date", day)
    state.setdefault("day_start_count", before_count)
    state.setdefault("added", [])
    state.setdefault("changed", [])
    return state

def merge_added(existing, run_added):
    by_id = {key(x): dict(x) for x in existing if key(x)}
    order = [key(x) for x in existing if key(x)]

    for x in run_added:
        k = key(x)
        if not k:
            continue
        if k not in by_id:
            order.append(k)
        by_id[k] = dict(x)

    return [by_id[k] for k in order if k in by_id]

def merge_changed(existing, run_changed, added_ids):
    by_id = {key(x): dict(x) for x in existing if key(x)}
    order = [key(x) for x in existing if key(x)]

    for x in run_changed:
        k = key(x)
        if not k or k in added_ids:
            # 今日NEWになった案件はNEWのまま表示し、最終状態だけadded側へ反映する。
            continue

        if k in by_id:
            old = by_id[k]
            # 最初の変更元を維持し、最新の変更先へ更新する。
            old["to_status"] = x.get("to_status", old.get("to_status", ""))
            old["to_label"] = x.get("to_label", old.get("to_label", ""))
            old["company"] = x.get("company", old.get("company", ""))
            old["service"] = x.get("service", old.get("service", ""))
            old["published"] = x.get("published", old.get("published", ""))
            old["affected_count"] = x.get("affected_count", old.get("affected_count", 0))
            old["summary"] = x.get("summary", old.get("summary", ""))
            old["resolution_date"] = x.get("resolution_date", old.get("resolution_date", ""))
            old["resolution_note"] = x.get("resolution_note", old.get("resolution_note", ""))
        else:
            by_id[k] = dict(x)
            order.append(k)

    return [by_id[k] for k in order if k in by_id]

def report(path):
    before_path = Path(path)
    before = json.loads(before_path.read_text(encoding="utf-8")) if before_path.exists() else []
    after = public_rows()

    bm = {key(x): x for x in before if key(x)}
    am = {key(x): x for x in after if key(x)}

    run_added = [am[k] for k in am if k not in bm]

    run_changed = []
    for k in am.keys() & bm.keys():
        old, new = bm[k], am[k]
        if old.get("status") != new.get("status"):
            run_changed.append({
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

    day = today_jst()
    state = load_daily_state(day, len(before))

    # まず本日のNEWを累積。
    state["added"] = merge_added(state.get("added", []), run_added)
    added_ids = {key(x) for x in state["added"] if key(x)}

    # 今日NEWになった案件が、その後同日に status 更新された場合、
    # NEW項目の最新状態を更新して、UPDATEDには重複掲載しない。
    latest_after = {key(x): x for x in after if key(x)}
    for i, x in enumerate(state["added"]):
        k = key(x)
        if k in latest_after:
            state["added"][i] = dict(latest_after[k])

    # 既存公開案件のstatus変更はUPDATEDとして日次累積。
    state["changed"] = merge_changed(
        state.get("changed", []),
        run_changed,
        added_ids,
    )

    generated = now_utc().isoformat(timespec="seconds")
    state.update({
        "version": "1.1",
        "date": day,
        "generated_at": generated,
        "last_checked_at": generated,
        "day_start_count": int(state.get("day_start_count", len(before))),
        "after_count": len(after),
        "net_change": len(after) - int(state.get("day_start_count", len(before))),
        "added_count": len(state["added"]),
        "changed_count": len(state["changed"]),
        "added_ids": [key(x) for x in state["added"] if key(x)],
        "changed_ids": [key(x) for x in state["changed"] if key(x)],
    })

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    sign = "+" if state["net_change"] > 0 else ""
    headline = (
        f"{day} 今日の更新: 新規公開 {state['added_count']}件 / "
        f"ステータス更新 {state['changed_count']}件 / "
        f"公開対象総数 {state['day_start_count']} → {state['after_count']}件 "
        f"(差分 {sign}{state['net_change']})"
    )

    print("\n=== 公開版 今日の更新 ===")
    print(headline)
    print(
        f"今回の実行差分: 新規公開 {len(run_added)}件 / "
        f"ステータス更新 {len(run_changed)}件"
    )

    if run_added or run_changed:
        print(f"::notice title=公開版更新::{headline}")
    else:
        print(
            f"::notice title=公開版更新::今回の実行では差分なし / "
            f"本日累計 新規公開 {state['added_count']}件・"
            f"ステータス更新 {state['changed_count']}件"
        )

    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        lines = [
            "## 公開版 今日の更新",
            "",
            f"**{headline}**",
            "",
            f"今回の実行差分：新規公開 {len(run_added)}件 / "
            f"ステータス更新 {len(run_changed)}件",
            "",
        ]

        if state["added"]:
            lines += [
                "### 本日の新規公開",
                "",
                "| 状況 | 公表日 | 企業・サービス | 対象規模 | Incident ID |",
                "|---|---|---|---:|---|",
            ]
            for x in state["added"]:
                lines.append(
                    f"| {esc(STATUS_LABEL.get(x.get('status'), x.get('status')))} | "
                    f"{esc(x.get('published') or '-')} | "
                    f"{esc(label(x))} | {esc(fmt_count(x.get('affected_count')))} | "
                    f"`{esc(x.get('id') or '-')}` |"
                )
            lines.append("")

        if state["changed"]:
            lines += [
                "### 本日のステータス更新",
                "",
                "| 企業・サービス | 変更前 | 現在 | Incident ID |",
                "|---|---|---|---|",
            ]
            for x in state["changed"]:
                lines.append(
                    f"| {esc(label(x))} | {esc(x.get('from_label'))} | "
                    f"{esc(x.get('to_label'))} | `{esc(x.get('id') or '-')}` |"
                )
            lines.append("")

        if not state["added"] and not state["changed"]:
            lines += ["✅ 本日はまだ公開案件の更新がありません。", ""]

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
