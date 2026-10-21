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

TRACKED_FIELDS = (
    "status",
    "published",
    "company",
    "service",
    "affected_count",
    "cause",
    "summary",
    "exposed_data",
    "resolution_date",
    "resolution_note",
    "resolution_url",
    "sources",
)

FIELD_LABELS = {
    "status": "確認状況",
    "published": "公表日",
    "company": "企業・団体名",
    "service": "サービス名",
    "affected_count": "対象規模",
    "cause": "原因・分類",
    "summary": "案件概要",
    "exposed_data": "漏えい・対象情報",
    "resolution_date": "解決確認日",
    "resolution_note": "解決情報",
    "resolution_url": "解決情報URL",
    "sources": "情報源",
}


def now_utc():
    return datetime.now(timezone.utc)


def today_jst():
    return now_utc().astimezone(JST).strftime("%Y-%m-%d")


def jst_date_from_iso(value):
    if not value:
        return ""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(JST).strftime("%Y-%m-%d")
    except Exception:
        return ""


def clean_sources(items):
    out = []
    seen = set()
    for s in items or []:
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
            "cause": x.get("cause", ""),
            "summary": x.get("summary", ""),
            "exposed_data": x.get("exposed_data", ""),
            "resolution_date": x.get("resolution_date", ""),
            "resolution_note": x.get("resolution_note", ""),
            "resolution_url": x.get("resolution_url", ""),
            "reviewed_at": x.get("reviewed_at", ""),
            "sources": clean_sources(x.get("sources", [])),
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


def fresh_state(day, before_count):
    return {
        "version": "1.4",
        "date": day,
        "day_start_count": before_count,
        "added": [],
        "changed": [],
    }


def load_daily_state(day, before_count):
    if not OUT_PATH.exists():
        return fresh_state(day, before_count)
    try:
        state = json.loads(OUT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return fresh_state(day, before_count)

    state_day = state.get("date", "")
    if not state_day:
        state_day = jst_date_from_iso(state.get("generated_at", ""))

    if state_day != day:
        return fresh_state(day, before_count)

    state["version"] = "1.4"
    state["date"] = day
    state.setdefault("day_start_count", state.get("before_count", before_count))
    state.setdefault("added", [])
    state.setdefault("changed", [])
    return state


def merge_added(existing, incoming):
    by_id = {key(x): dict(x) for x in existing if key(x)}
    order = [key(x) for x in existing if key(x)]
    for x in incoming:
        k = key(x)
        if not k:
            continue
        if k not in by_id:
            order.append(k)
        by_id[k] = dict(x)
    return [by_id[k] for k in order if k in by_id]


def merge_changed(existing, incoming):
    by_id = {key(x): dict(x) for x in existing if key(x)}
    order = [key(x) for x in existing if key(x)]

    for x in incoming:
        k = key(x)
        if not k:
            continue

        if k in by_id:
            old = by_id[k]
            old.update(dict(x))
        else:
            by_id[k] = dict(x)
            order.append(k)

    return [by_id[k] for k in order if k in by_id]


def changed_fields(old, new):
    return [f for f in TRACKED_FIELDS if old.get(f) != new.get(f)]


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
        fields = changed_fields(old, new)
        if not fields:
            continue

        status_changed = old.get("status") != new.get("status")
        run_changed.append({
            "id": k,
            "company": new.get("company", ""),
            "service": new.get("service", ""),
            "published": new.get("published", ""),
            "affected_count": new.get("affected_count", 0),
            "cause": new.get("cause", ""),
            "summary": new.get("summary", ""),
            "exposed_data": new.get("exposed_data", ""),
            "reviewed_at": new.get("reviewed_at", ""),
            "from_status": old.get("status", ""),
            "to_status": new.get("status", ""),
            "from_label": STATUS_LABEL.get(old.get("status"), old.get("status", "")),
            "to_label": STATUS_LABEL.get(new.get("status"), new.get("status", "")),
            "change_type": "status" if status_changed else "content",
            "changed_fields": fields,
            "changed_labels": [FIELD_LABELS.get(f, f) for f in fields],
            "resolution_date": new.get("resolution_date", ""),
            "resolution_note": new.get("resolution_note", ""),
            "resolution_url": new.get("resolution_url", ""),
            "sources": new.get("sources", []),
        })

    day = today_jst()
    state = load_daily_state(day, len(before))

    # Only a true "not in before -> in after" transition is NEW.
    # reviewed_at alone must never create a NEW item.
    state["added"] = merge_added(state.get("added", []), run_added)

    # If a previously listed NEW item is subsequently edited, classify the
    # current event as UPDATED instead of continuing to show it as NEW.
    changed_ids = {key(x) for x in run_changed if key(x)}
    if changed_ids:
        state["added"] = [
            x for x in state.get("added", [])
            if key(x) not in changed_ids
        ]

    # Refresh surviving NEW rows from current data.
    for i, x in enumerate(state["added"]):
        k = key(x)
        if k in am:
            state["added"][i] = dict(am[k])

    state["changed"] = merge_changed(
        state.get("changed", []),
        run_changed,
    )

    # A genuinely new item in this run should remain NEW, not UPDATED.
    run_added_ids = {key(x) for x in run_added if key(x)}
    if run_added_ids:
        state["changed"] = [
            x for x in state.get("changed", [])
            if key(x) not in run_added_ids
        ]

    generated = now_utc().isoformat(timespec="seconds")
    day_start_count = int(state.get("day_start_count", len(before)))

    state.update({
        "version": "1.4",
        "date": day,
        "generated_at": generated,
        "last_checked_at": generated,
        "day_start_count": day_start_count,
        "after_count": len(after),
        "net_change": len(after) - day_start_count,
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
        f"案件更新 {state['changed_count']}件 / "
        f"公開対象総数 {day_start_count} → {state['after_count']}件 "
        f"(差分 {sign}{state['net_change']})"
    )

    print("\n=== 公開版 今日の更新 ===")
    print(headline)

    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        lines = [
            "## 公開版 今日の更新",
            "",
            f"**{headline}**",
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
                "### 本日の案件更新",
                "",
                "| 種別 | 企業・サービス | 更新内容 | Incident ID |",
                "|---|---|---|---|",
            ]
            for x in state["changed"]:
                if x.get("change_type") == "status":
                    detail = f"{x.get('from_label')} → {x.get('to_label')}"
                    kind = "ステータス更新"
                else:
                    detail = " / ".join(x.get("changed_labels", [])) or "案件情報更新"
                    kind = "案件情報更新"
                lines.append(
                    f"| {esc(kind)} | {esc(label(x))} | {esc(detail)} | "
                    f"`{esc(x.get('id') or '-')}` |"
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
